import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import cookie from 'cookie';
import type { AppConfig } from './config';
import { getUserById, touchUser, type DB, type UserRow } from './db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
      sessionToken?: string;
    }
  }
}

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: import('node:crypto').ScryptOptions,
) => Promise<Buffer>;
export const COOKIE_NAME = 'hive_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = (await scryptAsync(password, salt, 64, { N, r, p })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = (await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function newId(): string {
  return randomUUID();
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: DB, userId: string, days = 30): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, now, now + days * 24 * 60 * 60 * 1000);
  return token;
}

export function resolveSession(db: DB, token: string | undefined): UserRow | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash(token), Date.now()) as { user_id: string } | undefined;
  if (!row) return null;
  const user = getUserById(db, row.user_id);
  if (!user) return null;
  if (Date.now() - user.last_seen > 5 * 60 * 1000) touchUser(db, user.id);
  return user;
}

export function destroySession(db: DB, token: string | undefined): void {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function setSessionCookie(
  res: Response,
  token: string,
  config: AppConfig,
  days = config.sessionDays,
): void {
  const maxAge = Math.min(days, 30) * 24 * 60 * 60 * 1000 || SESSION_MAX_AGE_MS;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    maxAge,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
  });
}

export function tokenFromRequest(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const parsed = cookie.parse(header);
  return parsed[COOKIE_NAME];
}

export function optionalAuth(db: DB): RequestHandler {
  return (req, _res, next) => {
    try {
      const token = tokenFromRequest(req);
      const user = resolveSession(db, token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    } catch (error) {
      console.error('[auth] session lookup failed', (error as Error).message);
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  next();
}

export function createEmailToken(db: DB, userId: string, hours = 48): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND used_at IS NULL').run(userId);
  db.prepare(
    'INSERT INTO email_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, now, now + hours * 60 * 60 * 1000);
  return token;
}

export function verifyEmailToken(db: DB, token: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM email_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .get(tokenHash(token), Date.now()) as { user_id: string } | undefined;
  if (!row) return null;

  const user = getUserById(db, row.user_id);
  if (!user) return null;

  const now = Date.now();
  db.transaction(() => {
    db.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?').run(now, tokenHash(token));
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
  })();

  return getUserById(db, user.id) ?? null;
}

export function cleanupAuth(db: DB): void {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM email_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(now);
}
