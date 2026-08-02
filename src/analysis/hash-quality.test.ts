import { describe, expect, test } from "bun:test";
import { run } from "./hash-quality";

describe("hash-quality run()", () => {
  test("produces one row per hash function with a low CoV", () => {
    const rows = run();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.experiment).toBe("hash-quality");
      expect(row.metrics.coefficientOfVariation).toBeLessThan(0.05);
    }
  });
});
