/** Minimal dependency-free ASCII table printer, shared by every standalone experiment script and `compare`. */
export function printTable(rows: ReadonlyArray<Record<string, string | number>>): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  const widths = columns.map((col) => Math.max(col.length, ...rows.map((r) => String(r[col]).length)));

  const formatRow = (values: string[]) => values.map((v, i) => v.padEnd(widths[i]!)).join("  ");

  console.log(formatRow(columns));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(formatRow(columns.map((col) => String(row[col]))));
  }
}
