import type { HashFunction } from "./types";

const POLYNOMIAL = 0x1021;

/**
 * CRC16-CCITT lookup table, derived at module load from the standard
 * bit-shifting algorithm rather than pasted as 256 magic numbers — the
 * table's origin stays legible instead of being an opaque blob.
 */
function buildTable(): Uint16Array {
  const table = new Uint16Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let crc = byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ POLYNOMIAL) & 0xffff : (crc << 1) & 0xffff;
    }
    table[byte] = crc;
  }
  return table;
}

const TABLE = buildTable();
const encoder = new TextEncoder();

/**
 * CRC16-CCITT / CRC-16-XMODEM (poly 0x1021, init 0, no reflection, no
 * final XOR) — the exact checksum Redis Cluster uses for its
 * `CRC16(key) % 16384` slot routing. Returns the raw 16-bit value,
 * [0, 65535].
 */
export function crc16(input: string): number {
  const bytes = encoder.encode(input);
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ TABLE[((crc >> 8) ^ bytes[i]!) & 0xff]!) & 0xffff;
  }
  return crc;
}

const MODULUS = 2 ** 15; // 32768

/**
 * The same formula Redis Cluster routes keys with — CRC16(key) % N —
 * except N = 2^15 (32768) here instead of Redis's 2^14 (16384).
 *
 * Doubling the slot count roughly halves the expected virtual-node
 * collision rate at this repo's default vnode count (see the
 * vnode-collision analysis: ~13.3% of an 8-node/150-vnode ring's
 * positions collide at 2^12, ~3.6% at 2^14), but it doesn't eliminate
 * the problem at the node counts the bench suite already sweeps up to
 * — a bounded hash range and unbounded ring-position growth
 * (nodeCount * vnodeCount) are fundamentally in tension no matter how
 * large a fixed N you pick. Not yet wired into HASH_FUNCTIONS/the
 * strategy comparison sweeps — that scoping decision (standalone
 * hash-quality entry vs. full sweep vs. paired with a Redis-Cluster-
 * style fixed-slot strategy) is still open.
 */
export const crc16Mod32768: HashFunction = {
  name: "crc16-32768",
  hash(input: string): number {
    return crc16(input) % MODULUS;
  },
};
