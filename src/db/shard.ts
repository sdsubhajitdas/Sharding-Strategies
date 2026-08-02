import { approxStringBytes, approxValueBytes } from "../internal/bytes-approx";
import type { Row, ShardStats } from "./types";

/**
 * A single in-memory partition: a `Map<string, Row>` plus read/write
 * counters. Standing in for "a real database node" — instrumented in a
 * way a real DB would hide, since the counters are exactly what the
 * comparison harness needs.
 */
export class Shard {
  readonly id: string;
  private readonly rows = new Map<string, Row>();
  private reads = 0;
  private writes = 0;

  constructor(id: string) {
    this.id = id;
  }

  get(key: string): Row | undefined {
    this.reads++;
    return this.rows.get(key);
  }

  set(key: string, value: unknown): void {
    this.writes++;
    this.rows.set(key, { key, value });
  }

  delete(key: string): boolean {
    return this.rows.delete(key);
  }

  get size(): number {
    return this.rows.size;
  }

  /** Iterates stored rows without touching the read counter — used by `ShardedStore.rebalance` to migrate rows. */
  entries(): IterableIterator<Row> {
    return this.rows.values();
  }

  stats(): ShardStats {
    let bytesApprox = 0;
    for (const row of this.rows.values()) {
      bytesApprox += approxStringBytes(row.key) + approxValueBytes(row.value);
    }
    return { rows: this.rows.size, reads: this.reads, writes: this.writes, bytesApprox };
  }
}
