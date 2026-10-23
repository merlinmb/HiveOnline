import Database from 'better-sqlite3';
import path from 'node:path';

export type DB = Database.Database;

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  is_guest: number;
  email_verified: number;
  rating: number;
  ranked_games: number;
  wins: number;
  losses: number;
  theme: ThemeName;
  created_at: number;
  last_seen: number;
}

export type ThemeName = 'dark' | 'light';

export interface PublicUser {
  id: string;
  username: string;
  rating: number;
  isGuest: boolean;
  emailVerified: boolean;
  rankedGames: number;
  wins: number;
  losses: number;
  createdAt: number;
}

export interface SelfUser extends PublicUser {
  email: string | null;
  theme: ThemeName;
}

export interface GameRow {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  ranked: number;
  visibility: 'public' | 'private';
  state: string;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
  winner_id: string | null;
  finish_reason: string | null;
}

export function openDb(dataDir: string): DB {
  const db = new Database(path.join(dataDir, 'hive.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email          TEXT UNIQUE COLLATE NOCASE,
      password_hash  TEXT,
      is_guest       INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      rating         INTEGER NOT NULL DEFAULT 1200,
      ranked_games   INTEGER NOT NULL DEFAULT 0,
      wins           INTEGER NOT NULL DEFAULT 0,
      losses         INTEGER NOT NULL DEFAULT 0,
      theme          TEXT NOT NULL DEFAULT 'dark',
      created_at     INTEGER NOT NULL,
      last_seen      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens(user_id);

    CREATE TABLE IF NOT EXISTS games (
      id            TEXT PRIMARY KEY,
      code          TEXT NOT NULL UNIQUE,
      host_id       TEXT NOT NULL REFERENCES users(id),
      guest_id      TEXT REFERENCES users(id),
      status        TEXT NOT NULL,
      ranked        INTEGER NOT NULL DEFAULT 0,
      visibility    TEXT NOT NULL DEFAULT 'public',
      state         TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      finished_at   INTEGER,
      winner_id     TEXT,
      finish_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS games_status ON games(status, visibility);
    CREATE INDEX IF NOT EXISTS games_host ON games(host_id);
    CREATE INDEX IF NOT EXISTS games_guest ON games(guest_id);
  `);

  // Lightweight migrations for databases created by earlier versions.
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === 'theme')) {
    db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'");
  }

  return db;
}

export function getUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByLogin(db: DB, login: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
    .get(login, login) as UserRow | undefined;
}

export function getUserByUsername(db: DB, username: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username) as UserRow | undefined;
}

export function touchUser(db: DB, id: string): void {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), id);
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    rating: row.rating,
    isGuest: row.is_guest === 1,
    emailVerified: row.email_verified === 1,
    rankedGames: row.ranked_games,
    wins: row.wins,
    losses: row.losses,
    createdAt: row.created_at,
  };
}

export function toSelfUser(row: UserRow): SelfUser {
  return { ...toPublicUser(row), email: row.email, theme: row.theme === 'light' ? 'light' : 'dark' };
}

const GUEST_ADJECTIVES = [
  'Swift',
  'Clever',
  'Golden',
  'Quiet',
  'Amber',
  'Bold',
  'Lucky',
  'Wandering',
  'Curious',
  'Royal',
  'Dusty',
  'Nimble',
  'Sunny',
  'Hidden',
  'Rapid',
  'Velvet',
  'Wild',
  'Copper',
  'Gentle',
  'Mossy',
];

const GUEST_NOUNS = [
  'Beetle',
  'Ant',
  'Spider',
  'Bee',
  'Hopper',
  'Ladybug',
  'Mosquito',
  'Wasp',
  'Moth',
  'Cricket',
  'Bumble',
  'Cicada',
  'Mantis',
  'Firefly',
  'Dragonfly',
  'Hornet',
  'Aphid',
  'Weaver',
  'Drone',
  'Nymph',
];

export function createGuestUser(db: DB): UserRow {
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO users (id, username, email, password_hash, is_guest, email_verified, rating, created_at, last_seen)
     VALUES (?, ?, NULL, NULL, 1, 0, 1200, ?, ?)`,
  );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const adjective = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)];
    const noun = GUEST_NOUNS[Math.floor(Math.random() * GUEST_NOUNS.length)];
    const number = 100 + Math.floor(Math.random() * 900);
    const username = `${adjective}${noun}${number}`;
    try {
      const id = crypto.randomUUID();
      insert.run(id, username, now, now);
      return getUserById(db, id) as UserRow;
    } catch (error) {
      if (!(error as Error).message.includes('UNIQUE')) throw error;
    }
  }
  throw new Error('Could not allocate a guest name.');
}
