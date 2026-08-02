import { ansi, colorFor, hashToAngle } from "./geometry";
import type { HashFunction } from "../hash/types";

export interface AsciiRingOptions {
  width?: number;
  height?: number;
  movedKeys?: ReadonlySet<string>;
}

/**
 * Draws the ring as an ASCII circle: node letters on the outer ring at
 * their real hash-derived angle (so the uneven clustering that causes
 * the balance problem is visible, not hidden behind evenly-spaced
 * placeholder dots), sample keys as small dots on an inner ring colored
 * by whichever node currently owns them. Keys in `movedKeys` are drawn
 * as ✱ instead of • so a resize's effect is visible at a glance.
 */
export function renderAsciiRing(
  nodeIds: readonly string[],
  hashFn: HashFunction,
  sampleKeys: readonly string[],
  ownerOf: (key: string) => string,
  options: AsciiRingOptions = {}
): string {
  const width = options.width ?? 61;
  const height = options.height ?? 23;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const rx = cx - 3;
  const ry = cy - 2;
  const keyRx = rx - 4;
  const keyRy = ry - 3;

  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill(" "));

  const plot = (x: number, y: number, value: string) => {
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y]![x] = value;
  };

  // Faint outline so the geometry reads as a circle even before anything is plotted on it.
  for (let i = 0; i < 240; i++) {
    const angle = (i / 240) * Math.PI * 2;
    const x = Math.round(cx + rx * Math.cos(angle));
    const y = Math.round(cy + ry * Math.sin(angle));
    if (y >= 0 && y < height && x >= 0 && x < width && grid[y]![x] === " ") plot(x, y, "·");
  }

  const nodeColor = new Map<string, number>();
  nodeIds.forEach((id, i) => nodeColor.set(id, colorFor(i)));

  nodeIds.forEach((id, i) => {
    const angle = hashToAngle(hashFn.hash(id));
    const x = Math.round(cx + rx * Math.cos(angle));
    const y = Math.round(cy + ry * Math.sin(angle));
    const label = String.fromCharCode(65 + (i % 26));
    plot(x, y, ansi(colorFor(i), label));
  });

  for (const key of sampleKeys) {
    const owner = ownerOf(key);
    const color = nodeColor.get(owner) ?? 37;
    const angle = hashToAngle(hashFn.hash(key));
    const x = Math.round(cx + keyRx * Math.cos(angle));
    const y = Math.round(cy + keyRy * Math.sin(angle));
    const mark = options.movedKeys?.has(key) ? "✱" : "•";
    plot(x, y, ansi(color, mark));
  }

  const legend = nodeIds
    .map((id, i) => ansi(colorFor(i), `${String.fromCharCode(65 + (i % 26))}=${id}`))
    .join("  ");

  return [...grid.map((row) => row.join("")), "", legend].join("\n");
}
