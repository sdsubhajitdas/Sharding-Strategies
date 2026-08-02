import { describe, expect, test } from "bun:test";
import { measureLoadBalance } from "./load-balance";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";

describe("measureLoadBalance", () => {
  test("modulo distributes keys almost perfectly evenly (low CoV)", () => {
    const result = measureLoadBalance(new ModuloSharder(), { keys: 200_000, nodeCount: 8 });
    expect(result.coefficientOfVariation).toBeLessThan(0.01);
  });

  test("plain ring is meaningfully less balanced than modulo — the regression is real, not noise", () => {
    const modulo = measureLoadBalance(new ModuloSharder(), { keys: 200_000, nodeCount: 8 });
    const ring = measureLoadBalance(new RingSharder(), { keys: 200_000, nodeCount: 8 });
    // Plain ring's single position per node means arc sizes vary by
    // chance; this is expected to be dramatically worse than modulo,
    // not a rounding difference.
    expect(ring.coefficientOfVariation).toBeGreaterThan(modulo.coefficientOfVariation * 10);
  });

  test("min/max/mean/stddev are internally consistent", () => {
    const result = measureLoadBalance(new ModuloSharder(), { keys: 10_000, nodeCount: 4 });
    expect(result.min).toBeLessThanOrEqual(result.mean);
    expect(result.max).toBeGreaterThanOrEqual(result.mean);
    expect(result.stddev).toBeGreaterThanOrEqual(0);
  });
});
