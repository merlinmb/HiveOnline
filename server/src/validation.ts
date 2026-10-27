import { z } from 'zod';
import { BUGS } from '../../shared/types';
import { BOT_LEVELS } from '../../shared/difficulty';

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be at most 20 characters.')
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
      'Use letters, numbers, dashes and underscores. Start with a letter or number.',
    ),
  email: z
    .string()
    .trim()
    .max(200)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid e-mail address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200, 'Password is too long.'),
});

export const loginSchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const verifySchema = z.object({
  token: z.string().min(10).max(500),
});

export const createGameSchema = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  expansions: z.boolean().optional(),
  tournamentOpening: z.boolean().optional(),
  opponent: z.enum(['human', 'computer']).optional(),
  difficulty: z.enum(['auto', ...BOT_LEVELS]).optional(),
});

/** Table codes are always 4–12 letters/digits; reject anything else before a DB lookup. */
export const GAME_CODE_PATTERN = /^[A-Za-z0-9]{4,12}$/;

export const joinGameSchema = z.object({
  code: z.string().trim().regex(GAME_CODE_PATTERN, 'That table code is not valid.'),
});

export const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light']),
});

export const coordSchema = z.object({
  q: z.number().int().min(-64).max(64),
  r: z.number().int().min(-64).max(64),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('place'),
    bug: z.enum(BUGS),
    q: z.number().int().min(-64).max(64),
    r: z.number().int().min(-64).max(64),
  }),
  z.object({
    type: z.literal('move'),
    from: coordSchema,
    to: coordSchema,
  }),
]);

export const gameIdSchema = z.object({
  gameId: z.string().min(1).max(64),
});

export const chatSchema = z.object({
  gameId: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(280),
});

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'hive',
  'hiveonline',
  'hivemind',
  'moderator',
  'support',
  'root',
  'staff',
  'official',
  'null',
  'undefined',
]);

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}
