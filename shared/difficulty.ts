/**
 * Difficulty tuning for the computer opponent.
 *
 * The level is chosen from the human player's Elo rating, so the house
 * opponent keeps pace with the person across the table. A server operator or
 * a player can override it, but the defaults are deliberately conservative:
 * a fresh 1200 account meets the "skilled" profile, which already looks one
 * reply ahead.
 */

export const BOT_LEVELS = ['novice', 'casual', 'skilled', 'expert', 'master'] as const;

export type BotLevel = (typeof BOT_LEVELS)[number];

/** `auto` derives the level from the player's rating. */
export type BotDifficulty = 'auto' | BotLevel;

export interface BotTuning {
  level: BotLevel;
  label: string;
  description: string;
  /** Lowest rating that reaches this tier. */
  minRating: number;
  /** How many top moves get a one-reply threat check (0 = none). */
  searchWidth: number;
  /** Random jitter added to heuristic scores. */
  noise: number;
  /** Chance to play a random legal move instead of the best one. */
  blunder: number;
  /** How many candidates the language model may choose from (0 = no model). */
  llmCandidates: number;
  /** Model temperature. */
  temperature: number;
  /** How far below the best move the model may stray (-1 = no limit). */
  llmMargin: number;
}

export const BOT_TUNING: Record<BotLevel, BotTuning> = {
  novice: {
    level: 'novice',
    label: 'Novice',
    description: 'Learning the hive — misses threats and occasionally wanders.',
    minRating: 0,
    searchWidth: 0,
    noise: 3,
    blunder: 0.24,
    llmCandidates: 12,
    temperature: 0.8,
    llmMargin: -1,
  },
  casual: {
    level: 'casual',
    label: 'Casual',
    description: 'Knows the basics and defends obvious threats.',
    minRating: 1100,
    searchWidth: 4,
    noise: 1.6,
    blunder: 0.09,
    llmCandidates: 12,
    temperature: 0.55,
    llmMargin: 6,
  },
  skilled: {
    level: 'skilled',
    label: 'Skilled',
    description: 'Checks one reply ahead and punishes loose pieces.',
    minRating: 1200,
    searchWidth: 8,
    noise: 0.6,
    blunder: 0.02,
    llmCandidates: 8,
    temperature: 0.3,
    llmMargin: 2,
  },
  expert: {
    level: 'expert',
    label: 'Expert',
    description: 'Searches replies, blocks queen threats and applies pressure.',
    minRating: 1350,
    searchWidth: 12,
    noise: 0.25,
    blunder: 0,
    llmCandidates: 6,
    temperature: 0.2,
    llmMargin: 1,
  },
  master: {
    level: 'master',
    label: 'Master',
    description: 'Deep reply search with almost no give-aways.',
    minRating: 1500,
    searchWidth: 16,
    noise: 0.1,
    blunder: 0,
    llmCandidates: 4,
    temperature: 0.1,
    llmMargin: 0.5,
  },
};

export function tuningFor(level: BotLevel): BotTuning {
  return BOT_TUNING[level] ?? BOT_TUNING.skilled;
}

/** Map an Elo rating onto the matching difficulty tier. */
export function levelForRating(rating: number): BotLevel {
  const value = Number.isFinite(rating) ? rating : 1200;
  if (value >= BOT_TUNING.master.minRating) return 'master';
  if (value >= BOT_TUNING.expert.minRating) return 'expert';
  if (value >= BOT_TUNING.skilled.minRating) return 'skilled';
  if (value >= BOT_TUNING.casual.minRating) return 'casual';
  return 'novice';
}

export function levelLabel(level: BotLevel): string {
  return tuningFor(level).label;
}

export function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === 'string' && (BOT_LEVELS as readonly string[]).includes(value);
}

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === 'auto' || isBotLevel(value);
}

/** Normalise an untrusted difficulty value. */
export function parseBotDifficulty(value: unknown, fallback: BotDifficulty = 'auto'): BotDifficulty {
  return isBotDifficulty(value) ? value : fallback;
}
