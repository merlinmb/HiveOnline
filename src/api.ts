import type {
  GameView,
  LobbySnapshot,
  LeaderboardEntry,
  MetaInfo,
  User,
} from './types';
import type { BotDifficulty } from '../shared/difficulty';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => request<{ user: User | null }>('/auth/me'),
  register: (input: { username: string; email: string; password: string }) =>
    post<{ user: User; verificationSent: boolean }>('/auth/register', input),
  login: (input: { login: string; password: string }) =>
    post<{ user: User }>('/auth/login', input),
  guest: () => post<{ user: User }>('/auth/guest'),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  verify: (token: string) => post<{ ok: boolean; user: User }>('/auth/verify', { token }),
  resend: () => post<{ ok: boolean; verificationSent: boolean }>('/auth/resend'),
  meta: () => request<MetaInfo>('/meta'),
  updatePreferences: (input: { theme: 'dark' | 'light' }) =>
    patch<{ ok: boolean; theme: 'dark' | 'light' }>('/me/preferences', input),
  leaderboard: () =>
    request<{ entries: LeaderboardEntry[]; total: number; me: LeaderboardEntry | null }>(
      '/leaderboard',
    ),
  lobby: () => request<LobbySnapshot>('/lobby'),
  myGames: () => request<{ active: GameView[]; recent: GameView[] }>('/me/games'),
  createGame: (input: {
    visibility?: 'public' | 'private';
    expansions?: boolean;
    tournamentOpening?: boolean;
    opponent?: 'human' | 'computer';
    difficulty?: BotDifficulty;
  }) => post<{ game: GameView }>('/games', input),
  joinGame: (code: string) => post<{ game: GameView }>('/games/join', { code }),
  quickMatch: (input: { expansions?: boolean; tournamentOpening?: boolean }) =>
    post<{ game: GameView }>('/games/quick', input),
  getGame: (code: string) => request<{ game: GameView }>(`/games/${encodeURIComponent(code)}`),
};
