/**
 * Rough approximation of a JS string's heap footprint (~2 bytes per
 * UTF-16 code unit plus a fixed per-object overhead for the string header).
 * This is a stated approximation for the cost side of the tradeoff table,
 * not an exact measurement of V8 internals.
 */
const STRING_OVERHEAD_BYTES = 24;

export function approxStringBytes(value: string): number {
  return value.length * 2 + STRING_OVERHEAD_BYTES;
}

export function approxStringArrayBytes(values: readonly string[]): number {
  let total = 0;
  for (const value of values) total += approxStringBytes(value);
  return total;
}
