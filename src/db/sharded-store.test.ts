import { describe, expect, test } from "bun:test";
import { ModuloSharder } from "../strategies/modulo";
import { ShardedStore } from "./sharded-store";

function seededStore(shardIds: string[], keyCount: number): ShardedStore {
  const store = new ShardedStore(new ModuloSharder(), shardIds);
  for (let i = 0; i < keyCount; i++) store.set(`key-${i}`, i);
  return store;
}

describe("ShardedStore", () => {
  test("set then get roundtrips through the sharder's routing", () => {
    const store = seededStore(["s1", "s2", "s3"], 100);
    for (let i = 0; i < 100; i++) {
      expect(store.get(`key-${i}`)).toEqual({ key: `key-${i}`, value: i });
    }
  });

  test("stats() sums rows across shards to the total written", () => {
    const store = seededStore(["s1", "s2", "s3"], 300);
    const stats = store.stats();
    const totalRows = stats.perShard.reduce((sum, s) => sum + s.rows, 0);
    expect(totalRows).toBe(300);
  });

  test("get() on a nonexistent key counts as a failed read", () => {
    const store = seededStore(["s1", "s2"], 10);
    store.get("never-written");
    const stats = store.stats();
    expect(stats.totalReads).toBe(1);
    expect(stats.totalFailedReads).toBe(1);
  });

  describe("rebalance — real migration", () => {
    test("moves rows so every key is still readable after scale-out", () => {
      const store = seededStore(["s1", "s2", "s3"], 2000);
      const result = store.rebalance(["s1", "s2", "s3", "s4"]);

      expect(result.rowsTotal).toBe(2000);
      expect(result.rowsMoved).toBeGreaterThan(0);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);

      let failures = 0;
      for (let i = 0; i < 2000; i++) {
        if (store.get(`key-${i}`) === undefined) failures++;
      }
      expect(failures).toBe(0);
    });

    test("moves rows correctly on scale-in (node removal)", () => {
      const store = seededStore(["s1", "s2", "s3", "s4"], 2000);
      store.rebalance(["s1", "s2", "s3"]);

      let failures = 0;
      for (let i = 0; i < 2000; i++) {
        if (store.get(`key-${i}`) === undefined) failures++;
      }
      expect(failures).toBe(0);

      // the removed shard must have been fully drained, not just orphaned
      const s4 = store.shards.find((s) => s.id === "s4")!;
      expect(s4.size).toBe(0);
    });

    test("movesPerShardPair sums to rowsMoved", () => {
      const store = seededStore(["s1", "s2", "s3"], 2000);
      const result = store.rebalance(["s1", "s2", "s3", "s4"]);
      const summed = Object.values(result.movesPerShardPair).reduce((a, b) => a + b, 0);
      expect(summed).toBe(result.rowsMoved);
    });
  });

  describe("rebalance — naive mode", () => {
    test("switches routing without moving rows, producing failed reads", () => {
      const store = seededStore(["s1", "s2", "s3"], 5000);
      store.setNaiveReshard(true);

      const result = store.rebalance(["s1", "s2", "s3", "s4"]);
      expect(result.rowsMoved).toBe(0);
      expect(result.rowsTotal).toBe(5000);

      let failures = 0;
      for (let i = 0; i < 5000; i++) {
        if (store.get(`key-${i}`) === undefined) failures++;
      }
      // Naive mode is the whole point: some nontrivial fraction of reads
      // must now fail because their data never moved with the routing.
      expect(failures).toBeGreaterThan(0);
      expect(store.stats().totalFailedReads).toBe(failures);
    });
  });

  describe("killShard", () => {
    test("removes the node from routing but leaves its rows in place", () => {
      const store = seededStore(["s1", "s2", "s3"], 3000);
      const s2RowsBefore = store.shards.find((s) => s.id === "s2")!.size;
      expect(s2RowsBefore).toBeGreaterThan(0);

      store.killShard("s2");

      // still present with its original data (orphaned, not migrated)
      const s2 = store.shards.find((s) => s.id === "s2")!;
      expect(s2.size).toBe(s2RowsBefore);

      // routing no longer sends anything to it
      const routedTo = new Set<string>();
      for (let i = 0; i < 3000; i++) routedTo.add(store.get(`key-${i}`) === undefined ? "miss" : "hit");
      // some previously-s2 keys now miss on their new (survivor) shard
      expect(routedTo.has("miss")).toBe(true);
    });

    test("is a no-op for an id that was never added", () => {
      const store = seededStore(["s1", "s2"], 10);
      expect(() => store.killShard("nonexistent")).not.toThrow();
    });
  });
});
