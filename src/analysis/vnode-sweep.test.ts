import { describe, expect, test } from "bun:test";
import { measureVnodeSweepPoint } from "./vnode-sweep";
import { murmur3 } from "../hash/murmur3";

describe("measureVnodeSweepPoint", () => {
  test("higher vnode count substantially lowers CoV vs 1 vnode per node", () => {
    const one = measureVnodeSweepPoint(murmur3, 1, { balanceKeys: 50_000 });
    const oneFifty = measureVnodeSweepPoint(murmur3, 150, { balanceKeys: 50_000 });
    expect(oneFifty.coefficientOfVariation).toBeLessThan(one.coefficientOfVariation / 5);
  });

  test("bytesApprox scales with vnodeCount * nodeCount", () => {
    const low = measureVnodeSweepPoint(murmur3, 10, { nodeCount: 4, balanceKeys: 1000 });
    const high = measureVnodeSweepPoint(murmur3, 100, { nodeCount: 4, balanceKeys: 1000 });
    // 10x the positions should be roughly 10x the bytes (same string content per position).
    expect(high.bytesApprox).toBeGreaterThan(low.bytesApprox * 8);
    expect(high.bytesApprox).toBeLessThan(low.bytesApprox * 12);
  });

  test("buildTimeMs and lookupOpsPerSec are non-negative, sane numbers", () => {
    const result = measureVnodeSweepPoint(murmur3, 50, { balanceKeys: 1000, lookupOps: 1000 });
    expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.lookupOpsPerSec).toBeGreaterThan(0);
  });
});
