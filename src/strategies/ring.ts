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
 * Consistent hashing ring: one ring position per physical node. Fixes
 * modulo's resize disaster (adding/removing a node only remaps the keys
 * that fall between its neighbor's positions, not everything) — but with
 * only one position per node, the *balance* experiment shows this
 * strategy is worse than modulo: a handful of nodes end up owning
 * disproportionately large arcs of the ring purely by chance of where
 * their hash landed. Virtual nodes (see `VirtualNodeRingSharder`) fix that.
 */
export class RingSharder implements Sharder {
  readonly name: string = "ring";

  protected readonly hashFn: HashFunction;

  // The ring itself: every occupied position, sorted ascending, with a
  // parallel array naming which physical node owns each position. Two
  // parallel arrays rather than one array of {position, nodeId} objects
  // so `locate`'s binary search only ever compares a flat number[] — no
  // property access on the comparison hot path.
  private positions: number[] = [];
  private positionNodeIds: string[] = [];

  // Source of truth for which nodes exist and at what weight. A Map
  // preserves insertion order, which is what `nodes` reports.
  private readonly nodeWeights = new Map<string, number>();

  constructor(hashFn: HashFunction = murmur3) {
    this.hashFn = hashFn;
  }

  addNode(id: string, weight?: number): void {
    this.assertWeightSupported(weight);
    if (this.nodeWeights.has(id)) throw new DuplicateNodeError(id);
    const resolvedWeight = weight ?? 1;
    this.nodeWeights.set(id, resolvedWeight);

    // Only this node's own positions need hashing/sorting — merge them
    // into the existing sorted arrays in one linear pass rather than
    // re-sorting everything from scratch on every single addNode call
    // (which would make building an n-node ring cost O(n^2 log n)).
    const newEntries = this.hashesForNode(id, resolvedWeight)
      .map((position) => ({ position, nodeId: id }))
      .sort((a, b) => a.position - b.position);
    this.mergeIn(newEntries);
  }

  removeNode(id: string): void {
    if (!this.nodeWeights.has(id)) return;
    this.nodeWeights.delete(id);

    const keptPositions: number[] = [];
    const keptNodeIds: string[] = [];
    for (let i = 0; i < this.positions.length; i++) {
      if (this.positionNodeIds[i] !== id) {
        keptPositions.push(this.positions[i]!);
        keptNodeIds.push(this.positionNodeIds[i]!);
      }
    }
    this.positions = keptPositions;
    this.positionNodeIds = keptNodeIds;
  }

  getNode(key: string): string {
    return this.positionNodeIds[this.locate(key)]!;
  }

  getNodes(key: string, count: number): string[] {
    const physicalNodeCount = this.nodeWeights.size;
    if (physicalNodeCount === 0) throw new EmptyRingError();

    const startIndex = this.locate(key);
    const take = Math.min(count, physicalNodeCount);
    const result: string[] = [];
    const seen = new Set<string>();

    // Walk clockwise around the ring starting at the key's position,
    // collecting distinct *physical* nodes. A node can own more than one
    // position (once virtual nodes are involved), so skip positions
    // whose node we've already collected rather than counting them again.
    for (let i = 0; i < this.positions.length && result.length < take; i++) {
      const nodeId = this.positionNodeIds[(startIndex + i) % this.positions.length]!;
      if (!seen.has(nodeId)) {
        seen.add(nodeId);
        result.push(nodeId);
      }
    }
    return result;
  }

  get nodes(): readonly string[] {
    return Array.from(this.nodeWeights.keys());
  }

  stats(): SharderStats {
    return {
      positions: this.positions.length,
      // positionNodeIds strings + 8 bytes/position for the numeric hash value.
      bytesApprox: approxStringArrayBytes(this.positionNodeIds) + this.positions.length * 8,
    };
  }

  /** Plain rings can't give a node "more ring" proportional to weight — that capability arrives with virtual nodes. */
  protected assertWeightSupported(weight?: number): void {
    if (weight !== undefined && weight !== 1) {
      throw new UnsupportedOperationError(this.name, "weighted nodes");
    }
  }

  /**
   * Ring positions (hash values) a single node occupies. This is the
   * entire seam `VirtualNodeRingSharder` overrides: instead of one
   * position per node, it returns `weight * vnodeCount` of them,
   * scattering the same physical node across many ring points.
   */
  protected hashesForNode(id: string, _weight: number): number[] {
    return [this.hashFn.hash(id)];
  }

  /**
   * Standard merge step (as in merge sort): `sortedNewEntries` is already
   * sorted internally, and `this.positions` is already sorted, so
   * producing their sorted union only takes one linear pass through both
   * — no need to re-sort the combined set from scratch.
   */
  private mergeIn(sortedNewEntries: ReadonlyArray<{ position: number; nodeId: string }>): void {
    const merged = new Array<number>(this.positions.length + sortedNewEntries.length);
    const mergedIds = new Array<string>(this.positions.length + sortedNewEntries.length);

    let i = 0; // pointer into the existing this.positions
    let j = 0; // pointer into sortedNewEntries
    let k = 0; // write pointer into merged/mergedIds
    while (i < this.positions.length && j < sortedNewEntries.length) {
      if (this.positions[i]! <= sortedNewEntries[j]!.position) {
        merged[k] = this.positions[i]!;
        mergedIds[k] = this.positionNodeIds[i]!;
        i++;
      } else {
        merged[k] = sortedNewEntries[j]!.position;
        mergedIds[k] = sortedNewEntries[j]!.nodeId;
        j++;
      }
      k++;
    }
    while (i < this.positions.length) {
      merged[k] = this.positions[i]!;
      mergedIds[k] = this.positionNodeIds[i]!;
      i++;
      k++;
    }
    while (j < sortedNewEntries.length) {
      merged[k] = sortedNewEntries[j]!.position;
      mergedIds[k] = sortedNewEntries[j]!.nodeId;
      j++;
      k++;
    }

    this.positions = merged;
    this.positionNodeIds = mergedIds;
  }

  /**
   * Finds which ring position owns `key`: the first position whose hash
   * is >= hash(key), walking clockwise. This is the exact spot readers
   * usually get stuck on, so here's the full picture.
   *
   * `positions` is sorted ascending. We binary-search for the *leftmost*
   * index whose value is >= hash(key) — a "lower bound" search, not a
   * search for an exact match (the key essentially never hashes to
   * exactly the same value as a node).
   *
   *   lo/hi bracket a half-open range [lo, hi) of "candidate answers."
   *   Each iteration either proves positions[mid] is too small (so the
   *   real answer is strictly to its right: lo = mid + 1) or proves
   *   positions[mid] is a valid candidate (so hi shrinks down to mid,
   *   keeping mid in range while discarding everything past it). When
   *   lo meets hi, lo IS the answer.
   *
   * Wrap-around: if hash(key) is greater than every position on the
   * ring, the loop above pushes lo all the way to positions.length —
   * there's no position "to the right." But the ring has no actual end;
   * going clockwise past the highest position lands you back on the
   * lowest one. So lo === positions.length is treated as "wrap to index
   * 0," which is what makes this a ring instead of just a sorted list.
   */
  private locate(key: string): number {
    if (this.positions.length === 0) throw new EmptyRingError();

    const hash = this.hashFn.hash(key);

    let lo = 0;
    let hi = this.positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.positions[mid]! < hash) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return lo === this.positions.length ? 0 : lo;
  }
}
