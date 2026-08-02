import { describe, expect, test } from "bun:test";
import { murmur3 } from "../src/hash/murmur3";
import { VirtualNodeRingSharder } from "../src/strategies/vnode-ring";

describe("ring construction time", () => {
  // Regression guard: an earlier implementation re-sorted every existing
  // position on every single addNode call, making an n-node build cost
  // O(n^2 log n) — building 2000 nodes at the default 150 vnodes took
  // ~97 seconds. The fix (merge new positions into the existing sorted
  // array in one linear pass, instead of re-sorting everything) brought
  // that down to under a second. This asserts a generous bound so that
  // class of regression fails CI instead of silently reappearing.
  test("building a 2000-node, 150-vnode ring completes well under the old O(n^2 log n) cost", () => {
    const ring = new VirtualNodeRingSharder(murmur3);
    const startNs = Bun.nanoseconds();
    for (let i = 0; i < 2000; i++) ring.addNode(`node-${i}`);
    const elapsedMs = (Bun.nanoseconds() - startNs) / 1e6;
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
