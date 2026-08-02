import { hashToAngle } from "./geometry";
import type { HashFunction } from "../hash/types";

const SVG_COLORS: readonly string[] = [
  "#e05252",
  "#4caf50",
  "#e0b040",
  "#4a7fd6",
  "#a05cd6",
  "#3ab7b7",
  "#e0709a",
  "#8a9a3a",
];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Static SVG version of the same ring diagram, for embedding directly in the post rather than a terminal screenshot. */
export function renderSvgRing(
  nodeIds: readonly string[],
  hashFn: HashFunction,
  sampleKeys: readonly string[],
  ownerOf: (key: string) => string
): string {
  const size = 480;
  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size / 2 - 60;
  const keyRadius = ringRadius - 28;

  const colorFor = (i: number) => SVG_COLORS[i % SVG_COLORS.length]!;
  const nodeColor = new Map<string, string>();
  nodeIds.forEach((id, i) => nodeColor.set(id, colorFor(i)));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="monospace" font-size="12">`,
    `<rect width="${size}" height="${size}" fill="#ffffff" />`,
    `<circle cx="${cx}" cy="${cy}" r="${ringRadius}" fill="none" stroke="#999" stroke-width="1" stroke-dasharray="2,4" />`,
  ];

  for (const key of sampleKeys) {
    const owner = ownerOf(key);
    const color = nodeColor.get(owner) ?? "#999999";
    const angle = hashToAngle(hashFn.hash(key));
    const x = cx + keyRadius * Math.cos(angle);
    const y = cy + keyRadius * Math.sin(angle);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`);
  }

  nodeIds.forEach((id, i) => {
    const angle = hashToAngle(hashFn.hash(id));
    const x = cx + ringRadius * Math.cos(angle);
    const y = cy + ringRadius * Math.sin(angle);
    const color = colorFor(i);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${color}" stroke="#222222" stroke-width="1" />`);
    const labelX = cx + (ringRadius + 18) * Math.cos(angle);
    const labelY = cy + (ringRadius + 18) * Math.sin(angle);
    parts.push(
      `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${color}" text-anchor="middle">${escapeXml(id)}</text>`
    );
  });

  parts.push("</svg>");
  return parts.join("\n");
}
