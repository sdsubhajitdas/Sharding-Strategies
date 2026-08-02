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
  readonly name = "ring";

  protected readonly hashFn: HashFunction;

  // The ring itself: every occupied position, sorted ascending, with a
  // parallel array naming which physical node owns each position. Two
  // parallel arrays rather than one array of {position, nodeId} objects
  // so `locate`'s binary search only ever compares a flat number[] — no
  // property access on the comparison hot path.
  private positions: number[] = [];
  private positionNodeIds: string[] = [];

  // Source of truth for which nodes exist and at what weight; `positions`
  // /`positionNodeIds` are rebuilt from this on every add/remove. A Map
  // preserves insertion order, which is what `nodes` reports.
  private readonly nodeWeights = new Map<string, number>();

  constructor(hashFn: HashFunction = murmur3) {
    this.hashFn = hashFn;
  }

  addNode(id: string, weight?: number): void {
    this.assertWeightSupported(weight);
    if (this.nodeWeights.has(id)) throw new DuplicateNodeError(id);
    this.nodeWeights.set(id, weight ?? 1);
    this.rebuild();
  }

  removeNode(id: string): void {
    if (!this.nodeWeights.has(id)) return;
    this.nodeWeights.delete(id);
    this.rebuild();
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

  private rebuild(): void {
    const entries: Array<{ position: number; nodeId: string }> = [];
    for (const [id, weight] of this.nodeWeights) {
      for (const position of this.hashesForNode(id, weight)) {
        entries.push({ position, nodeId: id });
      }
    }
    entries.sort((a, b) => a.position - b.position);
    this.positions = entries.map((e) => e.position);
    this.positionNodeIds = entries.map((e) => e.nodeId);
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
