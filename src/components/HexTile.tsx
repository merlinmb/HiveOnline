import type { Bug, Color } from '../../shared/types';
import { hexCorners } from '../../shared/hex';
import { BugGlyph } from './BugIcon';

const OUTER = hexCorners(50, 50, 49);
const FACE = hexCorners(50, 50, 44.5);
const INNER = hexCorners(50, 50, 37);

export const BOARD_HEX_SIZE = 50;
export const BOARD_TILE_RADIUS = 48;

export function TileFace({ owner, bug }: { owner: Color; bug: Bug }) {
  return (
    <>
      <polygon points={OUTER} className={`tile-edge tile-edge-${owner}`} />
      <polygon points={FACE} className={`tile-face tile-face-${owner}`} />
      <polygon points={INNER} className={`tile-inner tile-inner-${owner}`} />
      <g className={`bug-glyph bug-glyph-${owner}`} transform="translate(23 23) scale(0.54)">
        <BugGlyph bug={bug} />
      </g>
    </>
  );
}

export function TileVisual({
  owner,
  bug,
  size = 72,
  className = '',
  ghost = false,
}: {
  owner: Color;
  bug: Bug;
  size?: number;
  className?: string;
  ghost?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`tile-visual ${ghost ? 'tile-ghost' : ''} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <TileFace owner={owner} bug={bug} />
    </svg>
  );
}

export function BoardTile({
  owner,
  bug,
  x,
  y,
  depth = 0,
  dimmed = false,
  ghost = false,
}: {
  owner: Color;
  bug: Bug;
  x: number;
  y: number;
  depth?: number;
  dimmed?: boolean;
  ghost?: boolean;
}) {
  const scale = (BOARD_TILE_RADIUS - depth * 1.4) / 49;
  return (
    <g
      className={`board-tile ${dimmed ? 'board-tile-dimmed' : ''} ${ghost ? 'board-tile-ghost' : ''}`}
      transform={`translate(${x} ${y + depth * 3.2}) scale(${scale}) translate(-50 -50)`}
    >
      <TileFace owner={owner} bug={bug} />
    </g>
  );
}

export function HexRing({
  x,
  y,
  radius,
  className = '',
}: {
  x: number;
  y: number;
  radius: number;
  className?: string;
}) {
  return (
    <polygon
      points={hexCorners(x, y, radius)}
      className={`hex-ring ${className}`}
      fill="none"
    />
  );
}

export function HexOutline({
  x,
  y,
  radius,
  className = '',
}: {
  x: number;
  y: number;
  radius: number;
  className?: string;
}) {
  return (
    <polygon
      points={hexCorners(x, y, radius)}
      className={`hex-outline ${className}`}
      fill="none"
    />
  );
}
