import { describe, expect, test } from "bun:test";
import { murmur3 } from "./murmur3";
import { md5Truncated } from "./md5";
import { checkHashQuality } from "./quality";
import type { HashFunction } from "./types";

const MAX_UINT32 = 2 ** 32;

function expectValidUint32(value: number) {
  expect(Number.isInteger(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThan(MAX_UINT32);
}

describe("murmur3", () => {
  test("hashes the empty string to 0 (mathematically forced by the algorithm, seed 0)", () => {
    expect(murmur3.hash("")).toBe(0);
  });

  test("is deterministic", () => {
    expect(murmur3.hash("hello-world")).toBe(murmur3.hash("hello-world"));
  });

  test("produces a valid uint32 for ascii, unicode, and long inputs", () => {
    expectValidUint32(murmur3.hash("plain-ascii-key"));
    expectValidUint32(murmur3.hash("emoji-🎉-key"));
    expectValidUint32(murmur3.hash("x".repeat(1000)));
  });

  test("avalanches: a one-character change produces an unrelated output", () => {
    const a = murmur3.hash("key-0000");
    const b = murmur3.hash("key-0001");
    expect(a).not.toBe(b);
    // A weak hash tends to change by a small, predictable delta; a real
    // avalanche should not leave the two outputs suspiciously close.
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  test("produces distinct outputs across 10k sequential keys (no gross collisions)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) seen.add(murmur3.hash(`key-${i}`));
    expect(seen.size).toBe(10_000);
  });
});

describe("md5Truncated", () => {
  test("is deterministic", () => {
    expect(md5Truncated.hash("hello-world")).toBe(md5Truncated.hash("hello-world"));
  });

  test("produces a valid uint32", () => {
    expectValidUint32(md5Truncated.hash("plain-ascii-key"));
    expectValidUint32(md5Truncated.hash(""));
  });

  test("produces distinct outputs across 10k sequential keys (no gross collisions)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) seen.add(md5Truncated.hash(`key-${i}`));
    expect(seen.size).toBe(10_000);
  });
});

describe("checkHashQuality", () => {
  // With 1M keys over 1000 buckets (mean 1000/bucket), a uniform hash's
  // bucket counts behave like a binomial distribution: expected stddev is
  // sqrt(mean) ~= 31.6, i.e. CoV ~= 0.0316. 0.05 gives headroom above that
  // statistical noise floor while still failing on a genuinely bad hash.
  test("reports a low coefficient of variation for murmur3", () => {
    const report = checkHashQuality(murmur3, { keys: 1_000_000, buckets: 1000 });
    expect(report.coefficientOfVariation).toBeLessThan(0.05);
  });

  test("reports a low coefficient of variation for md5Truncated", () => {
    const report = checkHashQuality(md5Truncated, { keys: 1_000_000, buckets: 1000 });
    expect(report.coefficientOfVariation).toBeLessThan(0.05);
  });

  test("catches a deliberately bad hash function with a high CoV", () => {
    // Sums character codes: clusters short keys with similar characters
    // into a narrow range of outputs instead of spreading them uniformly.
    const badHash: HashFunction = {
      name: "bad-sum-of-charcodes",
      hash(input: string): number {
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input.charCodeAt(i);
        return sum >>> 0;
      },
    };

    const good = checkHashQuality(murmur3, { keys: 50_000, buckets: 1000 });
    const bad = checkHashQuality(badHash, { keys: 50_000, buckets: 1000 });

    expect(bad.coefficientOfVariation).toBeGreaterThan(good.coefficientOfVariation * 3);
  });
});
