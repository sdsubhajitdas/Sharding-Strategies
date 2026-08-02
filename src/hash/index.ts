import { murmur3 } from "./murmur3";
import { md5Truncated } from "./md5";
import type { HashFunction } from "./types";

export type { HashFunction } from "./types";
export { murmur3 } from "./murmur3";
export { md5Truncated } from "./md5";
export { checkHashQuality } from "./quality";
export type { HashQualityReport } from "./quality";

/** Every hash function this package ships, for experiments that need to sweep across all of them. */
export const HASH_FUNCTIONS: readonly HashFunction[] = [murmur3, md5Truncated];
