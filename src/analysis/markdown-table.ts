/** Renders rows as a GitHub-flavored Markdown table, for RESULTS.md. */
export function toMarkdownTable(rows: ReadonlyArray<Record<string, string | number>>): string {
  if (rows.length === 0) return "_(no data)_";
  const columns = Object.keys(rows[0]!);
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((c) => String(row[c])).join(" | ")} |`).join("\n");
  return [header, divider, body].join("\n");
}
