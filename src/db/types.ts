export interface Row {
  key: string;
  value: unknown;
}

export interface ShardStats {
  rows: number;
  bytesApprox: number;
  reads: number;
  writes: number;
}

export interface RebalanceResult {
  rowsMoved: number;
  rowsTotal: number;
  /** Keyed by `"${fromShardId}->${toShardId}"`. */
  movesPerShardPair: Record<string, number>;
  elapsedMs: number;
}

export interface ShardedStoreStats {
  perShard: Array<{ id: string } & ShardStats>;
  totalReads: number;
  /** Only meaningful once `setNaiveReshard(true)` has been used — see naive-reshard experiment. */
  totalFailedReads: number;
}
