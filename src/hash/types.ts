/**
 * All hash functions in this package produce an unsigned 32-bit integer
 * (range [0, 2^32)). That's the width murmur3/xxhash produce natively, and
 * it's what MD5-truncated hashing (Ketama-style) truncates down to — so
 * every strategy can do plain `number` arithmetic for ring positions
 * without reaching for bigint.
 */
export interface HashFunction {
  readonly name: string;
  hash(input: string): number;
}
