import type { Action, Bug, Color, FinishReason, GameSettings, GameState } from '../shared/types';
import type { BotDifficulty, BotLevel } from '../shared/difficulty';

export interface User {
  id: string;
  username: string;
  email?: string | null;
  rating: number;
  isGuest: boolean;
  isBot: boolean;
  emailVerified: boolean;
  rankedGames: number;
  wins: number;
  losses: number;
  theme?: 'dark' | 'light';
  createdAt: number;
}

export interface GameSummary {
  id: string;
  code: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  ranked: boolean;
  rankedPotential: boolean;
  computer: boolean;
  botLevel: BotLevel | null;
  visibility: 'public' | 'private';
  createdAt: number;
  updatedAt: number;
  players: { white: User | null; black: User | null };
  settings: GameSettings;
  turn: Color;
  moveNumber: number;
  winner: Color | null;
  finishReason: FinishReason | null;
}

export interface GameView extends GameSummary {
  state: GameState;
  legalActions: Action[];
}

export interface LobbySnapshot {
  open: GameSummary[];
  live: GameSummary[];
  counts: { waiting: number; active: number };
  online: number;
}

export interface ChatMessage {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  isGuest: boolean;
  text: string;
  at: number;
}

export interface LeaderboardEntry {
  rank: number | null;
  id: string;
  username: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
}

export interface MetaInfo {
  allowGuests: boolean;
  requireVerifiedForRanked: boolean;
  mailConfigured: boolean;
  publicUrl: string;
  online: number;
  computer: {
    enabled: boolean;
    name: string;
    ai: boolean;
    model: string | null;
    /** `auto` scales with the player's rating; a level is pinned server-side. */
    difficulty: BotDifficulty;
  };
}

export type Position = { kind: 'bug'; bug: Bug } | { kind: 'cell'; coord: { q: number; r: number } } | null;

export type {
  Action,
  Bug,
  BugMeta,
  Cells,
  Color,
  Coord,
  FinishReason,
  GameSettings,
  GameState,
  Hand,
  HistoryEntry,
  LastMove,
  PlacedTile,
} from '../shared/types';
