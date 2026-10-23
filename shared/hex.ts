import type { Coord } from './types';

/**
 * Axial coordinates for pointy-top hexagons.
 * The six directions run east, north-east, north-west, west, south-west, south-east.
 */
export const DIRECTIONS: readonly Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const ORIGIN: Coord = { q: 0, r: 0 };

export function coordKey(c: Coord): string {
  return `${c.q},${c.r}`;
}

export function parseKey(key: string): Coord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function addCoords(a: Coord, b: Coord): Coord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighborCoords(c: Coord): Coord[] {
  return DIRECTIONS.map((d) => addCoords(c, d));
}

/** The two hexes touching both a and b (they must be adjacent). */
export function commonNeighbors(a: Coord, b: Coord): Coord[] {
  const bKey = coordKey(b);
  return neighborCoords(a).filter((n) => {
    if (coordKey(n) === bKey) return false;
    return neighborCoords(b).some((m) => m.q === n.q && m.r === n.r);
  });
}

export function hexDistance(a: Coord, b: Coord): number {
  const ax = a.q;
  const az = a.r;
  const ay = -ax - az;
  const bx = b.q;
  const bz = b.r;
  const by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/** Pixel centre for a pointy-top hex with the given radius. */
export function hexToPixel(c: Coord, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (c.q + c.r / 2),
    y: size * 1.5 * c.r,
  };
}

export function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${(cx + size * Math.cos(angle)).toFixed(3)},${(cy + size * Math.sin(angle)).toFixed(3)}`);
  }
  return points.join(' ');
}
