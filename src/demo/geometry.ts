/** Shared angle math and color palette for the ASCII and SVG ring renderers. */

const TWO_PI = Math.PI * 2;
const MAX_UINT32 = 2 ** 32;

/** Maps a hash function's uint32 output to an angle in radians, so ring positions are drawn where they actually hash — including the real clustering that motivates the balance experiment, not evenly spaced placeholder dots. */
export function hashToAngle(hash: number): number {
  return (hash / MAX_UINT32) * TWO_PI;
}

/** 16-color ANSI codes, cycled — enough visually distinct colors for the small node counts this demo uses. */
export const NODE_COLORS: readonly number[] = [31, 32, 33, 34, 35, 36, 91, 92, 93, 94, 95, 96];

export function colorFor(nodeIndex: number): number {
  return NODE_COLORS[nodeIndex % NODE_COLORS.length]!;
}

export function ansi(code: number, text: string): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}
