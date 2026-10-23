import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config';
import {
  createEmailToken,
  createSession,
  destroySession,
  hashPassword,
  newId,
  setSessionCookie,
  clearSessionCookie,
  verifyEmailToken,
  verifyPassword,
  requireAuth,
  tokenFromRequest,
} from './auth';
import {
  createGuestUser,
  getUserById,
  getUserByLogin,
  toPublicUser,
  toSelfUser,
  type DB,
} from './db';
import { HttpError } from './errors';
import type { GameService } from './games';
import type { Mailer } from './mailer';
import type { RealtimeHandle } from './realtime';
import { rateLimit } from './rateLimit';
import {
  RESERVED_USERNAMES,
  createGameSchema,
  firstZodError,
  joinGameSchema,
  loginSchema,
  preferencesSchema,
  registerSchema,
  verifySchema,
} from './validation';

interface Deps {
  db: DB;
  config: AppConfig;
  mailer: Mailer;
  games: GameService;
  realtime: RealtimeHandle;
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

function asyncRoute(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createApiRouter({ db, config, mailer, games, realtime }: Deps): Router {
  const router = Router();

  const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
  const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 12 });
  const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
  const verifyLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

  router.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, time: Date.now() });
  });

  router.get('/meta', (_req, res) => {
    res.json({
      allowGuests: config.registration.allowGuests,
      requireVerifiedForRanked: config.registration.requireVerifiedForRanked,
      mailConfigured: mailer.configured,
      publicUrl: config.publicUrl,
      online: realtime.onlineCount(),
    });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ user: req.user ? toSelfUser(req.user) : null });
  });

  router.post(
    '/auth/register',
    registerLimiter,
    asyncRoute(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, firstZodError(parsed.error));

      const username = parsed.data.username;
      const email = parsed.data.email.trim().toLowerCase();
      if (RESERVED_USERNAMES.has(username.toLowerCase())) {
        throw new HttpError(400, 'That username is reserved. Please choose another.');
      }

      const byUsername = db
        .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
        .get(username);
      if (byUsername) throw new HttpError(409, 'That username is already taken.');
      const byEmail = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
      if (byEmail) throw new HttpError(409, 'An account with that e-mail already exists.');

      const passwordHash = await hashPassword(parsed.data.password);
      const id = newId();
      const now = Date.now();
      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, is_guest, email_verified, rating, created_at, last_seen)
         VALUES (?, ?, ?, ?, 0, 0, 1200, ?, ?)`,
      ).run(id, username, email, passwordHash, now, now);

      const token = createEmailToken(db, id);
      const user = getUserById(db, id) as NonNullable<ReturnType<typeof getUserById>>;
      const sent = await mailer.sendVerification(user, token);

      const session = createSession(db, id, config.sessionDays);
      setSessionCookie(res, session, config);
      res.status(201).json({ user: toSelfUser(user), verificationSent: sent });
    }),
  );

  router.post(
    '/auth/login',
    loginLimiter,
    asyncRoute(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, firstZodError(parsed.error));

      const user = getUserByLogin(db, parsed.data.login);
      if (!user || user.is_guest === 1) {
        throw new HttpError(401, 'Incorrect username or password.');
      }
      const valid = await verifyPassword(parsed.data.password, user.password_hash);
      if (!valid) throw new HttpError(401, 'Incorrect username or password.');

      const token = createSession(db, user.id, config.sessionDays);
      setSessionCookie(res, token, config);
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);
      res.json({ user: toSelfUser(user) });
    }),
  );

  router.post(
    '/auth/guest',
    authLimiter,
    asyncRoute(async (req, res) => {
      if (!config.registration.allowGuests) {
        throw new HttpError(403, 'Guest play is disabled on this server.');
      }
      const user = createGuestUser(db);
      const token = createSession(db, user.id, 7);
      setSessionCookie(res, token, config, 7);
      res.status(201).json({ user: toSelfUser(user) });
    }),
  );

  router.post('/auth/logout', (req, res) => {
    destroySession(db, req.sessionToken ?? tokenFromRequest(req));
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.post(
    '/auth/verify',
    verifyLimiter,
    asyncRoute(async (req, res) => {
      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'This verification link is not valid.');
      const user = verifyEmailToken(db, parsed.data.token);
      if (!user) throw new HttpError(400, 'This verification link is invalid or has expired.');
      res.json({ ok: true, user: toSelfUser(user) });
    }),
  );

  router.post(
    '/auth/resend',
    requireAuth,
    verifyLimiter,
    asyncRoute(async (req, res) => {
      const user = req.user as NonNullable<Request['user']>;
      if (user.is_guest === 1) throw new HttpError(400, 'Guest accounts do not have an e-mail address.');
      if (user.email_verified === 1) throw new HttpError(400, 'Your e-mail is already verified.');
      const token = createEmailToken(db, user.id);
      const sent = await mailer.sendVerification(user, token);
      res.json({ ok: true, verificationSent: sent });
    }),
  );

  router.get('/leaderboard', (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, username, rating, ranked_games, wins, losses
         FROM users
         WHERE is_guest = 0 AND email_verified = 1 AND ranked_games > 0
         ORDER BY rating DESC, wins DESC, username ASC
         LIMIT 100`,
      )
      .all() as Array<{
      id: string;
      username: string;
      rating: number;
      ranked_games: number;
      wins: number;
      losses: number;
    }>;

    const entries = rows.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      username: row.username,
      rating: row.rating,
      games: row.ranked_games,
      wins: row.wins,
      losses: row.losses,
    }));

    const me = req.user
      ? entries.find((entry) => entry.id === req.user?.id) ?? {
          id: req.user.id,
          username: req.user.username,
          rating: req.user.rating,
          games: req.user.ranked_games,
          wins: req.user.wins,
          losses: req.user.losses,
          rank: null,
        }
      : null;

    res.json({ entries, total: entries.length, me });
  });

  router.get('/lobby', requireAuth, (req, res) => {
    const snapshot = games.lobby(req.user?.id ?? null);
    res.json({ ...snapshot, online: realtime.onlineCount() });
  });

  router.get('/me/games', requireAuth, (req, res) => {
    res.json(games.myGames((req.user as NonNullable<Request['user']>).id));
  });

  router.patch(
    '/me/preferences',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = preferencesSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Choose the light or dark theme.');
      const user = req.user as NonNullable<Request['user']>;
      db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(parsed.data.theme, user.id);
      res.json({ ok: true, theme: parsed.data.theme });
    }),
  );

  router.post('/games', requireAuth, (req, res) => {
    const parsed = createGameSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, firstZodError(parsed.error));
    const view = games.createGame(req.user as NonNullable<Request['user']>, parsed.data);
    realtime.broadcastLobby();
    realtime.broadcastGame(view.id);
    res.status(201).json({ game: view });
  });

  router.post('/games/join', requireAuth, (req, res) => {
    const parsed = joinGameSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, firstZodError(parsed.error));
    const view = games.joinGame(req.user as NonNullable<Request['user']>, parsed.data.code);
    realtime.broadcastGame(view.id);
    realtime.broadcastLobby();
    res.json({ game: view });
  });

  router.post('/games/quick', requireAuth, (req, res) => {
    const parsed = createGameSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, firstZodError(parsed.error));
    const view = games.quickMatch(req.user as NonNullable<Request['user']>, parsed.data);
    realtime.broadcastGame(view.id);
    realtime.broadcastLobby();
    res.json({ game: view });
  });

  router.get('/games/:code', requireAuth, (req, res) => {
    const row = games.getRowByCode(req.params.code);
    if (!row) throw new HttpError(404, 'No table found with that code.');
    const user = req.user as NonNullable<Request['user']>;
    res.json({ game: games.viewForUser(row, user.id) });
  });

  router.get('/players/:username', (req, res) => {
    const user = db
      .prepare(
        `SELECT id, username, rating, ranked_games, wins, losses, created_at
         FROM users WHERE username = ? COLLATE NOCASE AND is_guest = 0`,
      )
      .get(req.params.username) as
      | {
          id: string;
          username: string;
          rating: number;
          ranked_games: number;
          wins: number;
          losses: number;
          created_at: number;
        }
      | undefined;
    if (!user) throw new HttpError(404, 'Player not found.');
    res.json({
      player: {
        id: user.id,
        username: user.username,
        rating: user.rating,
        rankedGames: user.ranked_games,
        wins: user.wins,
        losses: user.losses,
        createdAt: user.created_at,
      },
    });
  });

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  return router;
}
