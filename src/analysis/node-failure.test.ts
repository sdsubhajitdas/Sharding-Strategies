import { describe, expect, test } from "bun:test";
import { measureNodeFailure } from "./node-failure";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";

describe("measureNodeFailure", () => {
  test("modulo spreads a dead node's keys close to evenly across survivors", () => {
    const result = measureNodeFailure(new ModuloSharder(), { keys: 50_000, nodeCount: 3 });
    expect(result.maxSurvivorSharePct).toBeLessThan(0.6);
    expect(result.minSurvivorSharePct).toBeGreaterThan(0.4);
  });

  test("plain ring dumps ~all of a dead node's keys onto a single successor", () => {
    const result = measureNodeFailure(new RingSharder(), { keys: 50_000, nodeCount: 3 });
    expect(result.maxSurvivorSharePct).toBeGreaterThan(0.9);
    expect(result.minSurvivorSharePct).toBeLessThan(0.1);
  });

  test("survivorDeltas sums to deadNodeKeyCount", () => {
    const result = measureNodeFailure(new ModuloSharder(), { keys: 20_000, nodeCount: 4 });
    const summed = Object.values(result.survivorDeltas).reduce((a, b) => a + b, 0);
    expect(summed).toBe(result.deadNodeKeyCount);
  });
});
