import { describe, expect, test } from "bun:test";
import { renderSvgRing } from "./svg-ring";
import type { HashFunction } from "../hash/types";

function fakeHash(fixed: Record<string, number>): HashFunction {
  return {
    name: "fake",
    hash(input: string): number {
      const value = fixed[input];
      if (value === undefined) throw new Error(`fakeHash: no fixture for "${input}"`);
      return value;
    },
  };
}

describe("renderSvgRing", () => {
  test("produces well-formed, self-contained SVG", () => {
    const hashFn = fakeHash({ a: 0, b: 1_000_000_000, key1: 500_000_000 });
    const svg = renderSvgRing(["a", "b"], hashFn, ["key1"], () => "a");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  test("emits one labeled circle per node and one circle per key", () => {
    const hashFn = fakeHash({ a: 0, b: 1_000_000_000, c: 2_000_000_000, key1: 500_000_000, key2: 1_500_000_000 });
    const svg = renderSvgRing(["a", "b", "c"], hashFn, ["key1", "key2"], () => "a");
    expect(svg).toContain(">a<");
    expect(svg).toContain(">b<");
    expect(svg).toContain(">c<");
    // 3 node circles (r=7) + 2 key circles (r=3) + 1 outline circle (r=180... variable) = at least 6 <circle
    const circleCount = (svg.match(/<circle/g) ?? []).length;
    expect(circleCount).toBeGreaterThanOrEqual(6);
  });

  test("escapes XML-unsafe characters in node id labels", () => {
    const hashFn = fakeHash({ "<node>&": 0 });
    const svg = renderSvgRing(["<node>&"], hashFn, [], () => "<node>&");
    expect(svg).not.toContain("<node>&<");
    expect(svg).toContain("&lt;node&gt;&amp;");
  });
});
