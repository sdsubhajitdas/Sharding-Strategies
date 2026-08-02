/**
 * Common interface every sharding strategy implements, so the comparison
 * harness (and later consumers of this package) can swap strategies
 * without changing a line of calling code.
 */
export interface Sharder {
  readonly name: string;

  /**
   * Registers a physical node. `weight` (default 1) only affects
   * strategies that support weighting (see {@link UnsupportedOperationError}
   * for the ones that don't). Weight is fixed at add time — call
   * `removeNode` then `addNode` again to change it.
   *
   * @throws {DuplicateNodeError} if `id` has already been added.
   */
  addNode(id: string, weight?: number): void;

  /** No-op if `id` was never added. */
  removeNode(id: string): void;

  /**
   * @throws {EmptyRingError} if no nodes have been added.
   */
  getNode(key: string): string;

  /**
   * Returns up to `count` distinct physical nodes for `key`, ordered by
   * preference (first is what `getNode` would return). Returns fewer than
   * `count` if there are fewer than `count` nodes registered — it never
   * repeats a node to pad the result.
   *
   * @throws {EmptyRingError} if no nodes have been added.
   */
  getNodes(key: string, count: number): string[];

  /** Unique physical node ids, in the order they were added. */
  readonly nodes: readonly string[];

  /** Cost-side numbers for the tradeoff table: ring positions and approximate memory. */
  stats(): SharderStats;
}

export interface SharderStats {
  /** Number of ring positions (or 1 per node for strategies without a ring). */
  positions: number;
  /** Rough estimate of the sharder's internal memory footprint, in bytes. */
  bytesApprox: number;
}

/** Thrown when a strategy is asked to do something it deliberately doesn't support (e.g. weighting on plain modulo). */
export class UnsupportedOperationError extends Error {
  constructor(strategyName: string, operation: string) {
    super(`${strategyName} does not support ${operation}`);
    this.name = "UnsupportedOperationError";
  }
}

/** Thrown by `addNode` when the id is already registered. */
export class DuplicateNodeError extends Error {
  constructor(nodeId: string) {
    super(`node "${nodeId}" has already been added`);
    this.name = "DuplicateNodeError";
  }
}

/** Thrown by `getNode`/`getNodes` when no nodes have been added yet. */
export class EmptyRingError extends Error {
  constructor() {
    super("cannot route a key: no nodes have been added");
    this.name = "EmptyRingError";
  }
}
