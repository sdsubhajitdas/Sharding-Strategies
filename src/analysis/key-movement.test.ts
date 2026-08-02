import { describe, expect, test } from "bun:test";
import { measureKeyMovement } from "./key-movement";
import { ModuloSharder } from "../strategies/modulo";

describe("measureKeyMovement", () => {
  test("modulo resize (8 -> 9 nodes) moves close to N/(N+1) of all keys", () => {
    const result = measureKeyMovement(new ModuloSharder(), {
      keys: 100_000,
      nodesBefore: 8,
      nodesAfter: 9,
    });

    const expected = 8 / 9;
    expect(result.movedPct).toBeGreaterThan(expected - 0.02);
    expect(result.movedPct).toBeLessThanOrEqual(1);
  });

  test("modulo scale-in (9 -> 8 nodes) also moves close to N/(N+1) of all keys", () => {
    const result = measureKeyMovement(new ModuloSharder(), {
      keys: 100_000,
      nodesBefore: 9,
      nodesAfter: 8,
    });

    const expected = 8 / 9;
    expect(result.movedPct).toBeGreaterThan(expected - 0.02);
  });

  test("keys/nodesBefore/nodesAfter default sensibly (1M keys, 8 -> 9 nodes)", () => {
    const result = measureKeyMovement(new ModuloSharder(), { keys: 1000 });
    expect(result.keys).toBe(1000);
    expect(result.nodesBefore).toBe(8);
    expect(result.nodesAfter).toBe(9);
  });
});
