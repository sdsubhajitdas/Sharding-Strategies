import { murmur3 } from "../hash/murmur3";
import type { HashFunction } from "../hash/types";
import { UnsupportedOperationError } from "../sharder";
import { RingSharder } from "./ring";

export const DEFAULT_VNODE_COUNT = 150;

/**
 * Same ring as `RingSharder` — same sorted array, same binary search,
 * same wrap-around — except each physical node occupies `vnodeCount`
 * ring positions instead of one. That's the entire behavioral fix: with
 * many small arcs per node instead of one big (and arbitrarily-sized)
 * arc, the law of large numbers evens out the balance problem and
 * spreads a dead node's neighbors across many survivors instead of one.
 *
 * This class overrides exactly two things from `RingSharder`:
 * `hashesForNode` (one position -> many) and `assertWeightSupported`
 * (now that a node can claim a proportional number of positions,
 * weighting has an actual implementation). Everything else — the sorted
 * array, `locate`'s binary search, `getNodes`, `stats` — is inherited
 * unchanged, because it was already written generically against
 * `hashesForNode` rather than assuming one position per node.
 */
export class VirtualNodeRingSharder extends RingSharder {
  override readonly name = "vnode-ring";

  private readonly vnodeCount: number;

  constructor(hashFn: HashFunction = murmur3, vnodeCount: number = DEFAULT_VNODE_COUNT) {
    super(hashFn);
    this.vnodeCount = vnodeCount;
  }

  protected override assertWeightSupported(weight?: number): void {
    if (weight !== undefined && weight <= 0) {
      throw new UnsupportedOperationError(this.name, "non-positive weight");
    }
  }

  protected override hashesForNode(id: string, weight: number): number[] {
    const count = Math.round(this.vnodeCount * weight);
    const hashes = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      // Suffix, not a second hash function — scatters one node across
      // `count` independent-looking positions using the single hash
      // function the sharder was configured with.
      hashes[i] = this.hashFn.hash(`${id}#${i}`);
    }
    return hashes;
  }
}
