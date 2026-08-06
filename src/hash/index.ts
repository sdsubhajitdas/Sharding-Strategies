import { murmur3 } from "./murmur3";
import { md5Truncated } from "./md5";
import type { HashFunction } from "./types";

export type { HashFunction } from "./types";
export { murmur3 } from "./murmur3";
export { md5Truncated } from "./md5";
// crc16/crc16Mod32768 are intentionally not exported here / not in
// HASH_FUNCTIONS below — their bounded output range interacts badly
// with ring-style virtual node placement (see the comment in
// src/hash/crc16.ts), and whether/how to wire that into the strategy
// sweeps is still an open decision. Import from "./crc16" directly.
export { checkHashQuality } from "./quality";
export type { HashQualityReport } from "./quality";

/** Every unbounded-range hash function this package ships, for experiments that need to sweep across all of them. */
export const HASH_FUNCTIONS: readonly HashFunction[] = [murmur3, md5Truncated];
