import { describe, expect, test } from "bun:test";
import { measureKeyMovement } from "./key-movement";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";
import type { Sharder } from "../sharder";

/**
 * A single resize event on a plain ring (one position per node) has huge
 * run-to-run variance: the amount of ring a new node "steals" depends
 * entirely on where its one hash happens to land relative to its
 * neighbors. Averaging many independent trials (distinct node/key
 * namespaces per trial, so each draws fresh random hash positions) is
 * what makes "the mean approaches 1/(N+1)" a meaningful, non-flaky
 * assertion instead of a coin flip against a single random draw.
 */
function averageMovedPct(makeSharder: () => Sharder, trials: number, nodesBefore: number, keysPerTrial: number): number {
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const sharder = makeSharder();
    for (let i = 0; i < nodesBefore; i++) sharder.addNode(`t${t}-node-${i}`);

    const keys = new Array<string>(keysPerTrial);
    const before = new Array<string>(keysPerTrial);
    for (let i = 0; i < keysPerTrial; i++) {
      const key = `t${t}-key-${i}`;
      keys[i] = key;
      before[i] = sharder.getNode(key);
    }

    sharder.addNode(`t${t}-node-${nodesBefore}`);

    let moved = 0;
    for (let i = 0; i < keysPerTrial; i++) {
      if (sharder.getNode(keys[i]!) !== before[i]) moved++;
    }
    total += moved / keysPerTrial;
  }
  return total / trials;
}

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

  test("ring resize (8 -> 9 nodes) moves close to 1/(N+1) of all keys, on average across trials", () => {
    // A single trial is too high-variance to assert against directly —
    // see the comment on averageMovedPct above.
    const mean = averageMovedPct(() => new RingSharder(), 30, 8, 20_000);
    const expected = 1 / 9;
    expect(mean).toBeGreaterThan(expected * 0.5);
    expect(mean).toBeLessThan(expected * 2);
  });
});
