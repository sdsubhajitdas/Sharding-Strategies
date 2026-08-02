import { describe, expect, test } from "bun:test";
import { runStrategyComparison, runVnodeSweep } from "./lookup-throughput";

describe("runStrategyComparison", () => {
  test("returns one row per strategy with positive throughput", () => {
    const rows = runStrategyComparison();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.opsPerSec as number).toBeGreaterThan(0);
      expect(row.positions as number).toBeGreaterThan(0);
    }
  });
});

describe("runVnodeSweep", () => {
  test("throughput generally decreases as vnode count (and position count) rises", () => {
    const rows = runVnodeSweep();
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    expect(last.positions as number).toBeGreaterThan(first.positions as number);
    expect(last.opsPerSec as number).toBeLessThan(first.opsPerSec as number);
  });
});
