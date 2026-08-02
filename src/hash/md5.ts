import { createHash } from "node:crypto";
import type { HashFunction } from "./types";

/**
 * MD5 digest truncated to its first 4 bytes, read little-endian — the
 * same scheme Ketama/libketama uses for memcached consistent hashing.
 * MD5 is used here purely as a well-distributed, universally available
 * hash; nothing about this usage is security-sensitive.
 */
export const md5Truncated: HashFunction = {
  name: "md5",
  hash(input: string): number {
    const digest = createHash("md5").update(input).digest();
    return digest.readUInt32LE(0);
  },
};
