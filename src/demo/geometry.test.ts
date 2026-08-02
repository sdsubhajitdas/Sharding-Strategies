import { describe, expect, test } from "bun:test";
import { ansi, colorFor, hashToAngle, NODE_COLORS } from "./geometry";

describe("hashToAngle", () => {
  test("maps 0 to angle 0", () => {
    expect(hashToAngle(0)).toBe(0);
  });

  test("maps the max uint32 to just under a full turn (2*PI)", () => {
    const angle = hashToAngle(2 ** 32 - 1);
    expect(angle).toBeGreaterThan(Math.PI * 2 - 0.001);
    expect(angle).toBeLessThan(Math.PI * 2);
  });

  test("maps the midpoint to roughly PI", () => {
    const angle = hashToAngle(2 ** 31);
    expect(angle).toBeCloseTo(Math.PI, 3);
  });
});

describe("colorFor", () => {
  test("cycles through NODE_COLORS", () => {
    expect(colorFor(0)).toBe(NODE_COLORS[0]!);
    expect(colorFor(NODE_COLORS.length)).toBe(NODE_COLORS[0]!);
    expect(colorFor(NODE_COLORS.length + 1)).toBe(NODE_COLORS[1]!);
  });
});

describe("ansi", () => {
  test("wraps text in the given color code and resets after", () => {
    expect(ansi(31, "X")).toBe("\x1b[31mX\x1b[0m");
  });
});
