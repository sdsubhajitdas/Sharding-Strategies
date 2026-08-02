import { describe, expect, test } from "bun:test";
import { measureNaiveReshardFailures } from "./naive-reshard";
import { measureKeyMovement } from "./key-movement";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";
import { ShardedStore } from "../db";

describe("measureNaiveReshardFailures", () => {
  test("modulo resize (8 -> 9 nodes) fails close to N/(N+1) of reads", () => {
    const result = measureNaiveReshardFailures(new ModuloSharder(), {
      keys: 50_000,
      nodesBefore: 8,
      nodesAfter: 9,
    });
    const expected = 8 / 9;
    expect(result.failureRate).toBeGreaterThan(expected - 0.02);
  });

  test("failure count matches the routing-only movedPct for the identical topology", () => {
    // Same node naming ("node-i") and same keys as measureKeyMovement, so
    // the set of keys whose route changes must be identical — a naive
    // read fails exactly when (and only when) a key's route changed.
    const keys = 20_000;
    const movement = measureKeyMovement(new ModuloSharder(), { keys, nodesBefore: 8, nodesAfter: 9 });
    const failures = measureNaiveReshardFailures(new ModuloSharder(), { keys, nodesBefore: 8, nodesAfter: 9 });
    expect(failures.failedReads).toBe(movement.moved);
  });

  test("ring resize produces zero failures when nothing moved (single node, no resize)", () => {
    const result = measureNaiveReshardFailures(new RingSharder(), {
      keys: 1000,
      nodesBefore: 3,
      nodesAfter: 3,
    });
    expect(result.failedReads).toBe(0);
  });

  test("real (non-naive) rebalance produces zero failed reads for the same resize", () => {
    // Sanity check that naive mode is what causes failures, not the
    // resize itself — a real migration must leave every key readable.
    const keys = 20_000;
    const sharder = new ModuloSharder();
    const store = new ShardedStore(sharder, ["node-0", "node-1", "node-2"]);
    for (let i = 0; i < keys; i++) store.set(`key-${i}`, i);
    store.rebalance(["node-0", "node-1", "node-2", "node-3"]);
    let failures = 0;
    for (let i = 0; i < keys; i++) if (store.get(`key-${i}`) === undefined) failures++;
    expect(failures).toBe(0);
  });
});
