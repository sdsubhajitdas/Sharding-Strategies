import { murmur3 } from "../hash/murmur3";
import type { HashFunction } from "../hash/types";
import { approxStringArrayBytes } from "../internal/bytes-approx";
import {
  DuplicateNodeError,
  EmptyRingError,
  UnsupportedOperationError,
  type Sharder,
  type SharderStats,
} from "../sharder";

/**
 * `hash(key) % nodes.length`. The baseline: dead simple, O(1) lookup, and
 * (as the balance experiment shows) the *best*-balanced of the three
 * strategies — right up until the node count changes, at which point
 * almost every key remaps. That tradeoff is the entire point of this
 * strategy existing in the comparison.
 */
export class ModuloSharder implements Sharder {
  readonly name = "modulo";

  private readonly hashFn: HashFunction;
  private readonly nodeIds: string[] = [];
  private readonly nodeSet = new Set<string>();

  constructor(hashFn: HashFunction = murmur3) {
    this.hashFn = hashFn;
  }

  addNode(id: string, weight?: number): void {
    if (weight !== undefined && weight !== 1) {
      throw new UnsupportedOperationError(this.name, "weighted nodes");
    }
    if (this.nodeSet.has(id)) {
      throw new DuplicateNodeError(id);
    }
    this.nodeSet.add(id);
    this.nodeIds.push(id);
  }

  removeNode(id: string): void {
    const index = this.nodeIds.indexOf(id);
    if (index === -1) return;
    this.nodeIds.splice(index, 1);
    this.nodeSet.delete(id);
  }

  getNode(key: string): string {
    const index = this.indexFor(key);
    return this.nodeIds[index]!;
  }

  getNodes(key: string, count: number): string[] {
    const n = this.nodeIds.length;
    if (n === 0) throw new EmptyRingError();
    const startIndex = this.indexFor(key);
    const take = Math.min(count, n);
    const result: string[] = [];
    for (let i = 0; i < take; i++) {
      result.push(this.nodeIds[(startIndex + i) % n]!);
    }
    return result;
  }

  get nodes(): readonly string[] {
    return this.nodeIds;
  }

  stats(): SharderStats {
    const nodeCount = this.nodeIds.length;
    return {
      positions: nodeCount,
      // nodeIds array + a Set entry (~8 bytes of hash-table overhead) per node.
      bytesApprox: approxStringArrayBytes(this.nodeIds) + nodeCount * 8,
    };
  }

  private indexFor(key: string): number {
    const n = this.nodeIds.length;
    if (n === 0) throw new EmptyRingError();
    return this.hashFn.hash(key) % n;
  }
}
