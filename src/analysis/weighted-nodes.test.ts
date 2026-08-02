import { describe, expect, test } from "bun:test";
import { measureWeightedNodes } from "./weighted-nodes";
import { murmur3 } from "../hash/murmur3";

describe("measureWeightedNodes", () => {
  test("a weight-2 node receives ~2x the keys of a weight-1 node", () => {
    const result = measureWeightedNodes(murmur3, {
      keys: 300_000,
      weights: { light: 1, heavy: 2 },
    });
    const ratio = result.keysPerNode.heavy! / result.keysPerNode.light!;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.3);
  });

  test("keysPerWeightUnit is roughly consistent across differently-weighted nodes", () => {
    const result = measureWeightedNodes(murmur3, {
      keys: 300_000,
      weights: { "node-w1": 1, "node-w2": 2, "node-w3": 3 },
    });
    const units = Object.values(result.keysPerWeightUnit);
    const mean = units.reduce((a, b) => a + b, 0) / units.length;
    for (const unit of units) {
      expect(Math.abs(unit - mean) / mean).toBeLessThan(0.25);
    }
  });
});
