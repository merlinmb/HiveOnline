import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { clampSessionDays, createSession, hashPassword, verifyPassword } from '../src/auth';
import type { AppConfig } from '../src/config';
import { openDb } from '../src/db';
import { GameService } from '../src/games';
import { isSameOrigin } from '../src/origin';
import { createGame } from '../../shared/hive/engine';

describe('isSameOrigin', () => {
  it('allows clients that do not send an Origin header', () => {
    expect(isSameOrigin(undefined, 'hive.local:8085')).toBe(true);
  });

  it('matches the request host and the configured public URL', () => {
    expect(isSameOrigin('http://hive.local:8085', 'hive.local:8085')).toBe(true);
    expect(isSameOrigin('https://play.example.com', 'internal:3000', 'https://play.example.com/')).toBe(
      true,
    );
  });

  it('rejects unrelated origins', () => {
    expect(isSameOrigin('http://evil.example', 'hive.local:8085')).toBe(false);
    expect(isSameOrigin('http://hive.local:8085.evil.example', 'hive.local:8085')).toBe(false);
    expect(isSameOrigin('null', 'hive.local:8085')).toBe(false);
    expect(isSameOrigin('not a url', 'hive.local:8085')).toBe(false);
  });
});

describe('password hashing', () => {
  it('accepts the correct password only', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).toMatch(/^scrypt\$/);
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', stored)).resolves.toBe(false);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });
});

describe('session lifetime', () => {
  it('clamps configured days to a safe range', () => {
    expect(clampSessionDays(0)).toBe(1);
    expect(clampSessionDays(Number.NaN)).toBe(30);
    expect(clampSessionDays(45)).toBe(45);
    expect(clampSessionDays(1000)).toBe(90);
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-session-test-'));
  const db = openDb(dir);

  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps only the newest ten sessions per account', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, is_guest, is_bot, email_verified,
         rating, ranked_games, wins, losses, theme, created_at, last_seen)
       VALUES ('user-1', 'Tester', NULL, NULL, 0, 0, 1, 1200, 0, 0, 0, 'light', ?, ?)`,
    ).run(now, now);

    for (let i = 0; i < 12; i += 1) createSession(db, 'user-1', 30);

    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get('user-1') as {
        n: number;
      }
    ).n;
    expect(count).toBe(10);

    const span = (
      db
        .prepare('SELECT expires_at - created_at AS span FROM sessions WHERE user_id = ? LIMIT 1')
        .get('user-1') as { span: number }
    ).span;
    expect(span).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('stale game cleanup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-games-test-'));
  const db = openDb(dir);
  const config: AppConfig = {
    publicUrl: 'http://localhost',
    port: 3000,
    host: '127.0.0.1',
    dataDir: dir,
    configDir: dir,
    trustProxy: false,
    mailMode: 'log',
    smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '', allowNoAuth: false },
    zeptomail: { apiUrl: '', token: '' },
    ollama: { enabled: false, url: '', model: '', timeoutMs: 1000, minDelayMs: 0 },
    bot: { difficulty: 'auto' },
    registration: { allowGuests: true, requireVerifiedForRanked: true },
    sessionDays: 30,
  };
  const service = new GameService(db, config);
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const state = JSON.stringify(createGame());

  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('abandons old tables, hides stale lobby entries and keeps fresh ones', () => {
    const insertUser = db.prepare(
      `INSERT INTO users (id, username, email, password_hash, is_guest, is_bot, email_verified,
         rating, ranked_games, wins, losses, theme, created_at, last_seen)
       VALUES (?, ?, NULL, NULL, 0, 0, 1, 1200, 0, 0, 0, 'light', ?, ?)`,
    );
    insertUser.run('host-1', 'Hosty', now, now);
    insertUser.run('rival-1', 'Rival', now, now);

    const insertGame = db.prepare(
      `INSERT INTO games (id, code, host_id, guest_id, status, ranked, visibility, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'public', ?, ?, ?)`,
    );
    insertGame.run('old-waiting', 'OLDW01', 'host-1', null, 'waiting', state, now - 8 * DAY, now - 8 * DAY);
    insertGame.run('hidden-waiting', 'HIDW01', 'host-1', null, 'waiting', state, now - 2 * DAY, now - 2 * DAY);
    insertGame.run('new-waiting', 'NEWW01', 'host-1', null, 'waiting', state, now - 60_000, now - 60_000);
    insertGame.run('old-active', 'OLDA01', 'host-1', 'rival-1', 'active', state, now - 40 * DAY, now - 31 * DAY);
    insertGame.run('new-active', 'NEWA01', 'host-1', 'rival-1', 'active', state, now - 60_000, now - 60_000);

    expect(service.expireStaleGames(now)).toBe(2);

    const statusOf = (id: string) =>
      (db.prepare('SELECT status FROM games WHERE id = ?').get(id) as { status: string }).status;
    expect(statusOf('old-waiting')).toBe('abandoned');
    expect(statusOf('old-active')).toBe('abandoned');
    expect(statusOf('hidden-waiting')).toBe('waiting');
    expect(statusOf('new-waiting')).toBe('waiting');

    const snapshot = service.lobby(null);
    expect(snapshot.open.map((game) => game.id)).toEqual(['new-waiting']);
    expect(snapshot.live.map((game) => game.id)).toEqual(['new-active']);
    expect(snapshot.counts).toEqual({ waiting: 1, active: 1 });

    const expiredRow = service.getRowByCode('OLDW01');
    expect(expiredRow).toBeDefined();
    expect(() => service.viewForUser(expiredRow!, 'host-1')).toThrowError(/expired/i);
  });
});
