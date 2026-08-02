import type { Sharder } from "../sharder";
import { Shard } from "./shard";
import type { RebalanceResult, Row, ShardedStoreStats } from "./types";

/**
 * Owns a set of `Shard`s plus a `Sharder` and routes every read/write
 * through it. This is where the post's "money measurement" lives: the
 * gap between a real `rebalance()` (rows physically migrated) and a
 * naive one (routing switched, rows left behind) is what turns "25% of
 * keys moved" into a concrete failed-read count.
 */
export class ShardedStore {
  private readonly shardsById = new Map<string, Shard>();
  private readonly shardOrder: string[] = [];
  private naiveReshardEnabled = false;
  private totalReads = 0;
  private totalFailedReads = 0;

  constructor(private readonly sharder: Sharder, shardIds: string[]) {
    for (const id of shardIds) {
      this.sharder.addNode(id);
      this.shardsById.set(id, new Shard(id));
      this.shardOrder.push(id);
    }
  }

  get(key: string): Row | undefined {
    const nodeId = this.sharder.getNode(key);
    const shard = this.shardsById.get(nodeId)!;
    this.totalReads++;
    const row = shard.get(key);
    if (row === undefined) this.totalFailedReads++;
    return row;
  }

  set(key: string, value: unknown): void {
    const nodeId = this.sharder.getNode(key);
    this.shardsById.get(nodeId)!.set(key, value);
  }

  /**
   * Removes a node from routing without migrating its rows — they stay
   * in memory on the (now unreachable-via-routing) shard, so failure-mode
   * experiments can inspect what a dead node was holding and where reads
   * for its keys land among survivors.
   */
  killShard(id: string): void {
    this.sharder.removeNode(id);
  }

  /** When true, `rebalance()` switches routing without moving any rows. See naive-reshard experiment. */
  setNaiveReshard(enabled: boolean): void {
    this.naiveReshardEnabled = enabled;
  }

  /**
   * Applies a new node topology (add and/or remove ids) to the sharder,
   * then — unless naive mode is enabled — physically migrates every row
   * whose correct shard changed as a result.
   */
  rebalance(newTopology: string[]): RebalanceResult {
    const startNs = Bun.nanoseconds();
    const previousIds = new Set(this.sharder.nodes);
    const newIds = new Set(newTopology);

    for (const id of previousIds) {
      if (!newIds.has(id)) this.sharder.removeNode(id);
    }
    for (const id of newTopology) {
      if (!previousIds.has(id)) this.sharder.addNode(id);
    }
    for (const id of newTopology) {
      if (!this.shardsById.has(id)) {
        this.shardsById.set(id, new Shard(id));
        this.shardOrder.push(id);
      }
    }

    const rowsTotal = this.totalRowCount();
    let rowsMoved = 0;
    const movesPerShardPair: Record<string, number> = {};

    if (!this.naiveReshardEnabled) {
      // Snapshot rows from every previously-existing shard first — a
      // shard being removed from the topology must still have its rows
      // migrated out, not dropped.
      const snapshot: Array<{ key: string; value: unknown; fromShardId: string }> = [];
      for (const id of previousIds) {
        const shard = this.shardsById.get(id)!;
        for (const row of shard.entries()) {
          snapshot.push({ key: row.key, value: row.value, fromShardId: id });
        }
      }

      for (const { key, value, fromShardId } of snapshot) {
        const toShardId = this.sharder.getNode(key);
        if (toShardId === fromShardId) continue;
        this.shardsById.get(fromShardId)!.delete(key);
        this.shardsById.get(toShardId)!.set(key, value);
        rowsMoved++;
        const pairKey = `${fromShardId}->${toShardId}`;
        movesPerShardPair[pairKey] = (movesPerShardPair[pairKey] ?? 0) + 1;
      }
    }
    // Naive mode: routing already switched above; rows deliberately stay
    // put. That gap between routing and data is what the naive-reshard
    // experiment measures via failed reads.

    const elapsedMs = (Bun.nanoseconds() - startNs) / 1_000_000;
    return { rowsMoved, rowsTotal, movesPerShardPair, elapsedMs };
  }

  /** Every shard the store has ever constructed, including ones since removed from routing — check `sharder.nodes` for which are currently live. */
  get shards(): readonly Shard[] {
    return this.shardOrder.map((id) => this.shardsById.get(id)!);
  }

  stats(): ShardedStoreStats {
    const perShard = this.shardOrder.map((id) => {
      const shard = this.shardsById.get(id)!;
      return { id, ...shard.stats() };
    });
    return {
      perShard,
      totalReads: this.totalReads,
      totalFailedReads: this.totalFailedReads,
    };
  }

  private totalRowCount(): number {
    let total = 0;
    for (const shard of this.shardsById.values()) total += shard.size;
    return total;
  }
}
