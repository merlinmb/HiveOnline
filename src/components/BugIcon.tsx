import type { Bug } from '../../shared/types';

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Queen() {
  return (
    <g {...strokeProps}>
      <path d="M50 30C38 30 30 40 30 53c0 17 9 28 20 28s20-11 20-28c0-13-8-23-20-23Z" fill="currentColor" opacity={0.07} />
      <path d="M50 34c-9 0-16 8-16 19 0 12 7 22 16 22s16-10 16-22c0-11-7-19-16-19Z" />
      <circle cx="50" cy="24" r="6.5" />
      <path d="M44 14 50 7l6 7M50 17v-4M44 19l-4-4M56 19l4-4" />
      <path d="M34 44C24 42 17 35 17 25c11 0 18 7 21 16M66 44c10-2 17-9 17-19-11 0-18 7-21 16" />
      <path d="M35 47c-7 7-8 15-5 22M65 47c7 7 8 15 5 22" />
      <path d="M41 51h18M39 59h22M43 67h14" opacity={0.7} />
    </g>
  );
}

function Spider() {
  return (
    <g {...strokeProps}>
      <ellipse cx="50" cy="57" rx="15" ry="17" fill="currentColor" opacity={0.08} />
      <ellipse cx="50" cy="57" rx="15" ry="17" />
      <circle cx="50" cy="31" r="8.5" />
      <path d="M43 35c-9-4-16-12-20-21M40 44C30 40 22 34 15 25M39 54c-11 0-21-5-28-14M40 63c-10 4-18 11-23 22M45 71c-7 8-9 17-8 26M57 35c9-4 16-12 20-21M60 44c10-4 18-10 25-19M61 54c11 0 21-5 28-14M60 63c10 4 18 11 23 22M55 71c7 8 9 17 8 26" />
      <circle cx="46.5" cy="29" r="1.6" fill="currentColor" />
      <circle cx="53.5" cy="29" r="1.6" fill="currentColor" />
    </g>
  );
}

function Beetle() {
  return (
    <g {...strokeProps}>
      <ellipse cx="50" cy="57" rx="21" ry="24" fill="currentColor" opacity={0.08} />
      <ellipse cx="50" cy="57" rx="21" ry="24" />
      <path d="M50 34v46" opacity={0.8} />
      <circle cx="50" cy="25" r="7.5" />
      <path d="M50 17v-6M45 20l-5-5M55 20l5-5M42 29c-3 2-6 3-9 3M58 29c3 2 6 3 9 3" />
      <path d="M31 45c-8-3-13-8-16-15M30 56c-10 0-17-3-22-9M31 67c-9 4-15 10-18 18M69 45c8-3 13-8 16-15M70 56c10 0 17-3 22-9M69 67c9 4 15 10 18 18" />
      <path d="M44 81l-4 7M56 81l4 7" />
    </g>
  );
}

function Grasshopper() {
  return (
    <g {...strokeProps}>
      <path d="M36 29c9 9 17 21 23 36 2 6 1 11-3 15" fill="currentColor" opacity={0.06} />
      <path d="M36 29c9 9 17 21 23 36 2 6 1 11-3 15" />
      <circle cx="33" cy="25" r="8" />
      <path d="M28 18C24 12 20 9 15 7M37 16c1-7 5-11 10-14" />
      <path d="M42 37c5 4 9 9 12 15M45 46l-8 6M49 55l-9 5M71 56c8-2 14 2 17 11l-13 5c-3-6-6-11-11-15" />
      <path d="M75 72l10 9M70 77l8 12" />
      <path d="M55 73c3 5 4 10 2 16" />
    </g>
  );
}

function Ant() {
  return (
    <g {...strokeProps}>
      <circle cx="50" cy="24" r="9.5" fill="currentColor" opacity={0.08} />
      <circle cx="50" cy="24" r="9.5" />
      <circle cx="50" cy="46" r="7" />
      <ellipse cx="50" cy="67" rx="13" ry="15" fill="currentColor" opacity={0.08} />
      <ellipse cx="50" cy="67" rx="13" ry="15" />
      <path d="M44 16 38 8M43 18l-9 1M56 16l6-8M57 18l9 1" />
      <path d="M44 44c-9 0-16 4-21 11M44 50c-8 3-13 8-16 16M56 44c9 0 16 4 21 11M56 50c8 3 13 8 16 16" />
      <path d="M50 39v-4M50 53v-4" opacity={0.6} />
    </g>
  );
}

function Ladybug() {
  return (
    <g {...strokeProps}>
      <circle cx="50" cy="56" r="25" fill="currentColor" opacity={0.08} />
      <circle cx="50" cy="56" r="25" />
      <path d="M50 32v49" />
      <circle cx="50" cy="29" r="9" fill="currentColor" opacity={0.12} />
      <circle cx="50" cy="29" r="9" />
      <path d="M44 21 39 15M56 21l5-6M41 33c-9 0-16 1-22 4M59 33c9 0 16 1 22 4" />
      <circle cx="38" cy="48" r="4" fill="currentColor" />
      <circle cx="62" cy="48" r="4" fill="currentColor" />
      <circle cx="37" cy="65" r="3.5" fill="currentColor" />
      <circle cx="63" cy="65" r="3.5" fill="currentColor" />
      <circle cx="50" cy="76" r="3" fill="currentColor" />
      <path d="M33 71c-5 5-8 10-9 16M67 71c5 5 8 10 9 16" />
    </g>
  );
}

function Mosquito() {
  return (
    <g {...strokeProps}>
      <path d="M50 31c-3 12-4 25-2 38 1 6 3 10 5 16" fill="currentColor" opacity={0.06} />
      <path d="M50 31c-3 12-4 25-2 38 1 6 3 10 5 16" />
      <circle cx="50" cy="24" r="6" />
      <path d="M50 18V8M50 30v4" />
      <path d="M47 31C35 24 22 20 10 22c6 11 18 17 33 18M53 31c12-7 25-11 37-9-6 11-18 17-33 18" fill="currentColor" opacity={0.07} />
      <path d="M47 31C35 24 22 20 10 22c6 11 18 17 33 18M53 31c12-7 25-11 37-9-6 11-18 17-33 18" />
      <path d="M46 38C34 42 24 51 18 65M45 45C32 52 25 63 22 78M54 38c12 4 22 13 28 27M55 45c13 7 20 18 23 33" />
      <path d="M50 51c-2 8-1 16 2 24" />
    </g>
  );
}

export function BugGlyph({ bug }: { bug: Bug }) {
  switch (bug) {
    case 'queen':
      return <Queen />;
    case 'spider':
      return <Spider />;
    case 'beetle':
      return <Beetle />;
    case 'grasshopper':
      return <Grasshopper />;
    case 'ant':
      return <Ant />;
    case 'ladybug':
      return <Ladybug />;
    case 'mosquito':
      return <Mosquito />;
    default:
      return null;
  }
}

export function BugIcon({
  bug,
  size = 24,
  className,
}: {
  bug: Bug;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <BugGlyph bug={bug} />
    </svg>
  );
}
