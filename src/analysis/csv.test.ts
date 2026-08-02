import { describe, expect, test } from "bun:test";
import { toCsv } from "./csv";
import { toMarkdownTable } from "./markdown-table";

describe("toCsv", () => {
  test("produces a header row plus one row per ExperimentRow", () => {
    const csv = toCsv([
      { experiment: "e1", strategy: "modulo", hashFn: "murmur3", params: { a: 1 }, metrics: { b: 2 } },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("experiment,strategy,hashFn,params,metrics");
    expect(lines[1]).toContain("e1,modulo,murmur3");
  });

  test("a comma inside a JSON column doesn't split the row into extra fields", () => {
    const csv = toCsv([
      { experiment: "e1", strategy: "s", hashFn: "h", params: { note: 'has,a comma and "quotes"' }, metrics: {} },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 data row, not split further by the embedded comma
    expect(csv).toContain("has,a comma");
  });
});

describe("toMarkdownTable", () => {
  test("renders a header, divider, and one row per input record", () => {
    const md = toMarkdownTable([{ a: 1, b: "x" }, { a: 2, b: "y" }]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("| a | b |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toBe("| 1 | x |");
    expect(lines[3]).toBe("| 2 | y |");
  });

  test("returns a placeholder for empty input", () => {
    expect(toMarkdownTable([])).toBe("_(no data)_");
  });
});
