import { describe, expect, test } from "bun:test";
import { renderAsciiRing } from "./ascii-ring";
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

describe("renderAsciiRing", () => {
  test("output has the requested number of rows plus a blank line and legend", () => {
    const hashFn = fakeHash({ a: 0, b: 1_000_000_000 });
    const output = renderAsciiRing(["a", "b"], hashFn, [], () => "a", { width: 41, height: 15 });
    const lines = output.split("\n");
    expect(lines).toHaveLength(15 + 2); // grid rows + blank + legend
  });

  test("legend lists every node id with its assigned letter", () => {
    const hashFn = fakeHash({ a: 0, b: 1_000_000_000, c: 2_000_000_000 });
    const output = renderAsciiRing(["a", "b", "c"], hashFn, [], () => "a");
    expect(output).toContain("A=a");
    expect(output).toContain("B=b");
    expect(output).toContain("C=c");
  });

  test("a moved key is rendered with the star marker, an unmoved one with a bullet", () => {
    const hashFn = fakeHash({ node: 0, movedKey: 500_000_000, staticKey: 1_500_000_000 });
    const withMoved = renderAsciiRing(["node"], hashFn, ["movedKey", "staticKey"], () => "node", {
      movedKeys: new Set(["movedKey"]),
    });
    expect(withMoved).toContain("✱");
    expect(withMoved).toContain("•");
  });

  test("no movedKeys means every key uses the bullet marker, never the star", () => {
    const hashFn = fakeHash({ node: 0, k1: 500_000_000, k2: 1_500_000_000 });
    const output = renderAsciiRing(["node"], hashFn, ["k1", "k2"], () => "node");
    expect(output).not.toContain("✱");
  });
});
