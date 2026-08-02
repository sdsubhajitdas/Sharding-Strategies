import type { HashFunction } from "./types";

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const SEED = 0;

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

/**
 * MurmurHash3 (x86_32 variant), hand-rolled from the public-domain
 * reference algorithm (Austin Appleby / smhasher). Operates on the UTF-8
 * byte representation of the input so multi-byte characters hash the same
 * way any other spec-compliant x86_32 implementation would hash them.
 */
function murmur3X86_32(bytes: Uint8Array, seed: number): number {
  let h1 = seed | 0;
  const len = bytes.length;
  const blockCount = len >>> 2;

  for (let i = 0; i < blockCount; i++) {
    const offset = i * 4;
    let k1 =
      (bytes[offset]! |
        (bytes[offset + 1]! << 8) |
        (bytes[offset + 2]! << 16) |
        (bytes[offset + 3]! << 24)) |
      0;

    k1 = Math.imul(k1, C1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, C2);

    h1 ^= k1;
    h1 = rotl32(h1, 13);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  // Tail: the 0-3 bytes left over that don't fill a full 4-byte block.
  // These get mixed into a partial k1 but never trigger the h1 rotate/add
  // step above — that's what makes this the "tail" case in the reference
  // algorithm rather than just a short final block.
  let k1 = 0;
  const tailStart = blockCount * 4;
  const remainder = len & 3;
  if (remainder === 3) k1 ^= bytes[tailStart + 2]! << 16;
  if (remainder >= 2) k1 ^= bytes[tailStart + 1]! << 8;
  if (remainder >= 1) {
    k1 ^= bytes[tailStart]!;
    k1 = Math.imul(k1, C1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, C2);
    h1 ^= k1;
  }

  // Finalization ("fmix"): forces every bit of the digest to avalanche so
  // similar inputs don't produce nearby outputs.
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

const encoder = new TextEncoder();

export const murmur3: HashFunction = {
  name: "murmur3",
  hash(input: string): number {
    return murmur3X86_32(encoder.encode(input), SEED);
  },
};
