import { describe, expect, test } from "bun:test";
import { benchmark } from "./harness";

describe("benchmark", () => {
  test("runs the requested number of measured iterations and reports positive throughput", () => {
    let calls = 0;
    const result = benchmark(() => void calls++, { warmupIters: 100, measureIters: 1000 });
    expect(calls).toBe(1100); // warmup + measured
    expect(result.iterations).toBe(1000);
    expect(result.opsPerSec).toBeGreaterThan(0);
    expect(result.meanNs).toBeGreaterThan(0);
  });

  test("passes the iteration index to the benchmarked function", () => {
    const seen: number[] = [];
    benchmark((i) => seen.push(i), { warmupIters: 0, measureIters: 5 });
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });
});
