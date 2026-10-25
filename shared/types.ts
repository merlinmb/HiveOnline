import type { BotLevel } from './difficulty';

export const COLORS = ['white', 'black'] as const;
export type Color = (typeof COLORS)[number];

export const BUGS = [
  'queen',
  'spider',
  'beetle',
  'grasshopper',
  'ant',
  'ladybug',
  'mosquito',
] as const;
export type Bug = (typeof BUGS)[number];

export interface Coord {
  q: number;
  r: number;
}

export interface GameSettings {
  /** Adds the Ladybug and Mosquito to both players' sets. */
  expansions: boolean;
  /** Hive Ultimate / tournament rule: the Queen may not be placed on turn one. */
  tournamentOpening: boolean;
  /** Difficulty the computer opponent was seated at, if any. */
  botLevel?: BotLevel;
}

export interface PlacedTile {
  id: string;
  owner: Color;
  bug: Bug;
}

/** Cells are keyed `"q,r"` and each holds a stack, bottom first. */
export type Cells = Record<string, PlacedTile[]>;
export type Hand = Record<Bug, number>;

export interface PlaceAction {
  type: 'place';
  bug: Bug;
  q: number;
  r: number;
}

export interface MoveAction {
  type: 'move';
  from: Coord;
  to: Coord;
}

export type Action = PlaceAction | MoveAction;

export type HistoryKind = 'place' | 'move' | 'pass';

export interface HistoryEntry {
  n: number;
  player: Color;
  kind: HistoryKind;
  bug: Bug | null;
  from?: Coord;
  to?: Coord;
}

export interface LastMove {
  player: Color;
  kind: HistoryKind;
  bug: Bug | null;
  from?: Coord;
  to?: Coord;
}

export type FinishReason = 'queen' | 'stalemate' | 'resign';

export interface GameState {
  cells: Cells;
  hands: Record<Color, Hand>;
  turn: Color;
  nextTileId: number;
  /** How many tiles this player has placed from their hand (not moves). */
  placed: Record<Color, number>;
  queenPlaced: Record<Color, boolean>;
  settings: GameSettings;
  status: 'active' | 'finished';
  winner: Color | null;
  finishReason: FinishReason | null;
  history: HistoryEntry[];
  lastMove: LastMove | null;
  passes: number;
  moveNumber: number;
}

export interface BugMeta {
  bug: Bug;
  name: string;
  short: string;
  count: number;
  expansion: boolean;
  move: string;
}

export const BUG_META: Record<Bug, BugMeta> = {
  queen: {
    bug: 'queen',
    name: 'Queen Bee',
    short: 'Queen',
    count: 1,
    expansion: false,
    move: 'One space in any direction. Must be placed by your fourth turn — and until she is on the board, none of your pieces may move.',
  },
  spider: {
    bug: 'spider',
    name: 'Spider',
    short: 'Spider',
    count: 2,
    expansion: false,
    move: 'Exactly three spaces around the outside of the hive. It may not backtrack or end on its starting space.',
  },
  beetle: {
    bug: 'beetle',
    name: 'Beetle',
    short: 'Beetle',
    count: 2,
    expansion: false,
    move: 'One space, or climb on top of an adjacent piece. While on top it can keep crawling in any direction, and the piece underneath is pinned.',
  },
  grasshopper: {
    bug: 'grasshopper',
    name: 'Grasshopper',
    short: 'Hopper',
    count: 3,
    expansion: false,
    move: 'Jumps in a straight line over one or more pieces, landing on the first empty space beyond them.',
  },
  ant: {
    bug: 'ant',
    name: 'Soldier Ant',
    short: 'Ant',
    count: 3,
    expansion: false,
    move: 'Any number of spaces around the outside of the hive. The great escape artist.',
  },
  ladybug: {
    bug: 'ladybug',
    name: 'Ladybug',
    short: 'Ladybug',
    count: 1,
    expansion: true,
    move: 'Two spaces on top of the hive, then one space down onto an empty cell. It cannot end where it started.',
  },
  mosquito: {
    bug: 'mosquito',
    name: 'Mosquito',
    short: 'Mosquito',
    count: 1,
    expansion: true,
    move: 'Copies the movement of any piece it touches. On top of the hive it copies the Beetle.',
  },
};

export const BASE_BUGS: Bug[] = ['queen', 'spider', 'beetle', 'grasshopper', 'ant'];
export const EXPANSION_BUGS: Bug[] = ['ladybug', 'mosquito'];
