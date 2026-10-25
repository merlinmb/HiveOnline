import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config';
import {
  getBotUser,
  getUserById,
  toPublicUser,
  type DB,
  type GameRow,
  type PublicUser,
  type UserRow,
} from './db';
import { HttpError } from './errors';
import {
  applyAction,
  createGame,
  getLegalActions,
  resignGame,
} from '../../shared/hive/engine';
import type {
  Action,
  Color,
  FinishReason,
  GameSettings,
  GameState,
} from '../../shared/types';
import {
  levelForRating,
  type BotDifficulty,
  type BotLevel,
} from '../../shared/difficulty';
import { rateGame } from './elo';
import { log } from './logger';

export interface GameSummary {
  id: string;
  code: string;
  status: GameRow['status'];
  ranked: boolean;
  rankedPotential: boolean;
  /** True when one of the seats is the built-in computer opponent. */
  computer: boolean;
  /** Difficulty the computer is seated at (null for human games). */
  botLevel: BotLevel | null;
  visibility: GameRow['visibility'];
  createdAt: number;
  updatedAt: number;
  players: { white: PublicUser | null; black: PublicUser | null };
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
}

export interface CreateGameOptions {
  visibility?: 'public' | 'private';
  expansions?: boolean;
  tournamentOpening?: boolean;
  /** `computer` seats HiveMind as Onyx in a private, casual game. */
  opponent?: 'human' | 'computer';
  /** `auto` follows the host's rating; a level pins the game. */
  difficulty?: BotDifficulty;
}

function stateOf(row: GameRow): GameState {
  try {
    return JSON.parse(row.state) as GameState;
  } catch {
    throw new HttpError(500, 'This game record is corrupted.');
  }
}

function codeAlphabet(): string {
  return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
}

function makeCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += codeAlphabet()[Math.floor(Math.random() * codeAlphabet().length)];
  }
  return code;
}

export class GameService {
  constructor(
    private readonly db: DB,
    private readonly config: AppConfig,
  ) {}

  rankedEligible(user: UserRow): boolean {
    if (user.is_guest === 1 || user.is_bot === 1) return false;
    if (this.config.registration.requireVerifiedForRanked && user.email_verified !== 1) {
      return false;
    }
    return true;
  }

  private playersFor(row: GameRow): { white: PublicUser | null; black: PublicUser | null } {
    const host = getUserById(this.db, row.host_id);
    const guest = row.guest_id ? getUserById(this.db, row.guest_id) : null;
    return {
      white: host ? toPublicUser(host) : null,
      black: guest ? toPublicUser(guest) : null,
    };
  }

  private summaryFor(row: GameRow): GameSummary {
    const state = stateOf(row);
    const host = getUserById(this.db, row.host_id);
    const guest = row.guest_id ? getUserById(this.db, row.guest_id) : null;
    const computer = Boolean(host?.is_bot === 1 || guest?.is_bot === 1);
    const human = host?.is_bot === 1 ? guest : guest?.is_bot === 1 ? host : null;
    const botLevel = computer
      ? state.settings.botLevel ?? levelForRating(human?.rating ?? 1200)
      : null;
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      ranked: row.ranked === 1,
      rankedPotential: guest?.is_bot === 1 ? false : host ? this.rankedEligible(host) : false,
      computer,
      botLevel,
      visibility: row.visibility,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      players: this.playersFor(row),
      settings: state.settings,
      turn: state.turn,
      moveNumber: state.moveNumber,
      winner: state.winner,
      finishReason: state.finishReason,
    };
  }

  view(row: GameRow): GameView {
    const state = stateOf(row);
    return {
      ...this.summaryFor(row),
      state,
      legalActions: state.status === 'active' ? getLegalActions(state) : [],
    };
  }

  getRowById(id: string): GameRow | undefined {
    return this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined;
  }

  getRowByCode(code: string): GameRow | undefined {
    return this.db
      .prepare('SELECT * FROM games WHERE code = ?')
      .get(code.trim().toUpperCase()) as GameRow | undefined;
  }

  canView(row: GameRow, userId: string): boolean {
    return row.visibility === 'public' || row.host_id === userId || row.guest_id === userId;
  }

  viewForUser(row: GameRow, userId: string): GameView {
    if (!this.canView(row, userId)) throw new HttpError(403, 'This table is private.');
    return this.view(row);
  }

  /** Resolve the seated difficulty, honouring the server override first. */
  private botLevelFor(user: UserRow, requested?: BotDifficulty): BotLevel {
    if (this.config.bot.difficulty !== 'auto') return this.config.bot.difficulty;
    if (requested && requested !== 'auto') return requested;
    return levelForRating(user.rating);
  }

  createGame(user: UserRow, options: CreateGameOptions = {}): GameView {
    const versusComputer = options.opponent === 'computer';
    const botLevel = versusComputer ? this.botLevelFor(user, options.difficulty) : null;
    const settings: GameSettings = {
      expansions: Boolean(options.expansions),
      tournamentOpening: Boolean(options.tournamentOpening),
      ...(botLevel ? { botLevel } : {}),
    };
    const state = createGame(settings);
    const now = Date.now();
    const id = randomUUID();
    const bot = versusComputer ? getBotUser(this.db) : null;
    if (versusComputer && !bot) {
      throw new HttpError(503, 'The computer opponent is not available on this server.');
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = makeCode();
      try {
        if (versusComputer && bot) {
          // HiveMind always takes Onyx. Computer games are private and casual
          // so they never appear in the lobby or touch the rated ladder.
          this.db
            .prepare(
              `INSERT INTO games (id, code, host_id, guest_id, status, ranked, visibility, state, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'active', 0, 'private', ?, ?, ?)`,
            )
            .run(id, code, user.id, bot.id, JSON.stringify(state), now, now);
        } else {
          this.db
            .prepare(
              `INSERT INTO games (id, code, host_id, guest_id, status, ranked, visibility, state, created_at, updated_at)
               VALUES (?, ?, ?, NULL, 'waiting', 0, ?, ?, ?, ?)`,
            )
            .run(
              id,
              code,
              user.id,
              options.visibility === 'private' ? 'private' : 'public',
              JSON.stringify(state),
              now,
              now,
            );
        }
        const row = this.getRowById(id);
        if (!row) throw new HttpError(500, 'Could not create the game.');
        log.info(
          versusComputer
            ? `Game ${code} created by ${user.username} against the computer (${botLevel ?? 'auto'}).`
            : `Game ${code} created by ${user.username} (${row.visibility}).`,
        );
        return this.view(row);
      } catch (error) {
        if (!(error as Error).message.includes('UNIQUE')) throw error;
      }
    }
    throw new HttpError(500, 'Could not allocate a table code.');
  }

  joinGame(user: UserRow, code: string): GameView {
    const row = this.getRowByCode(code);
    if (!row) throw new HttpError(404, 'No table found with that code.');

    if (row.host_id === user.id || row.guest_id === user.id) {
      return this.viewForUser(row, user.id);
    }
    if (row.status === 'waiting' && row.guest_id === null) {
      const host = getUserById(this.db, row.host_id);
      const ranked = Boolean(host && this.rankedEligible(host) && this.rankedEligible(user));
      const now = Date.now();
      const update = this.db
        .prepare(
          `UPDATE games SET guest_id = ?, status = 'active', ranked = ?, updated_at = ?
           WHERE id = ? AND guest_id IS NULL AND status = 'waiting'`,
        )
        .run(user.id, ranked ? 1 : 0, now, row.id);
      if (update.changes === 0) {
        throw new HttpError(409, 'That table was just taken. Try another one.');
      }
      const updated = this.getRowById(row.id);
      if (!updated) throw new HttpError(500, 'Could not join that game.');
      log.info(
        `Game ${updated.code}: ${user.username} joined ${host?.username ?? 'host'} (${
          updated.ranked ? 'ranked' : 'casual'
        }).`,
      );
      return this.view(updated);
    }
    throw new HttpError(409, 'That table is already full.');
  }

  quickMatch(user: UserRow, options: CreateGameOptions = {}): GameView {
    const candidate = this.db
      .prepare(
        `SELECT * FROM games
         WHERE status = 'waiting' AND visibility = 'public' AND host_id != ? AND guest_id IS NULL
           AND host_id NOT IN (SELECT id FROM users WHERE is_bot = 1)
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get(user.id) as GameRow | undefined;

    if (candidate) return this.joinGame(user, candidate.code);
    return this.createGame(user, { visibility: 'public', ...options });
  }

  lobby(userId: string | null): LobbySnapshot {
    const openRows = this.db
      .prepare(
        `SELECT * FROM games
         WHERE status = 'waiting' AND visibility = 'public' AND guest_id IS NULL
           AND host_id NOT IN (SELECT id FROM users WHERE is_bot = 1)
           AND (? IS NULL OR host_id != ?)
         ORDER BY created_at DESC LIMIT 24`,
      )
      .all(userId, userId) as GameRow[];

    const liveRows = this.db
      .prepare(
        `SELECT * FROM games
         WHERE status = 'active' AND visibility = 'public'
           AND host_id NOT IN (SELECT id FROM users WHERE is_bot = 1)
           AND (guest_id IS NULL OR guest_id NOT IN (SELECT id FROM users WHERE is_bot = 1))
         ORDER BY updated_at DESC LIMIT 24`,
      )
      .all() as GameRow[];

    const waiting = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM games WHERE status = 'waiting'
             AND host_id NOT IN (SELECT id FROM users WHERE is_bot = 1)
             AND (guest_id IS NULL OR guest_id NOT IN (SELECT id FROM users WHERE is_bot = 1))`,
        )
        .get() as { n: number }
    ).n;
    const active = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM games WHERE status = 'active'
             AND host_id NOT IN (SELECT id FROM users WHERE is_bot = 1)
             AND (guest_id IS NULL OR guest_id NOT IN (SELECT id FROM users WHERE is_bot = 1))`,
        )
        .get() as { n: number }
    ).n;

    return {
      open: openRows.map((row) => this.summaryFor(row)),
      live: liveRows.map((row) => this.summaryFor(row)),
      counts: { waiting, active },
    };
  }

  myGames(userId: string): { active: GameSummary[]; recent: GameSummary[] } {
    const rows = this.db
      .prepare(
        `SELECT * FROM games WHERE host_id = ? OR guest_id = ?
         ORDER BY updated_at DESC LIMIT 40`,
      )
      .all(userId, userId) as GameRow[];

    const active = rows
      .filter((row) => row.status === 'waiting' || row.status === 'active')
      .map((row) => this.summaryFor(row));
    const recent = rows
      .filter((row) => row.status === 'finished')
      .slice(0, 8)
      .map((row) => this.summaryFor(row));

    return { active, recent };
  }

  /** @returns the updated row, or null for a draw / finished game. */
  performAction(gameId: string, userId: string, action: Action): GameRow {
    const row = this.getRowById(gameId);
    if (!row) throw new HttpError(404, 'Game not found.');
    if (row.status !== 'active') throw new HttpError(409, 'This game is not active.');

    const color: Color | null =
      row.host_id === userId ? 'white' : row.guest_id === userId ? 'black' : null;
    if (!color) throw new HttpError(403, 'You are not a player in this game.');

    const state = stateOf(row);
    if (state.turn !== color) throw new HttpError(409, 'It is not your turn.');

    const next = applyAction(state, action);
    const now = Date.now();

    if (next.status === 'finished') {
      this.finishRow(row, next, now);
    } else {
      this.db
        .prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(next), now, row.id);
    }

    const updated = this.getRowById(gameId);
    if (!updated) throw new HttpError(500, 'Game disappeared.');
    return updated;
  }

  resign(gameId: string, userId: string): GameRow {
    const row = this.getRowById(gameId);
    if (!row) throw new HttpError(404, 'Game not found.');
    if (row.status !== 'active') throw new HttpError(409, 'This game is not active.');
    const color: Color | null =
      row.host_id === userId ? 'white' : row.guest_id === userId ? 'black' : null;
    if (!color) throw new HttpError(403, 'You are not a player in this game.');

    const state = stateOf(row);
    const next = resignGame(state, color);
    this.finishRow(row, next, Date.now());
    log.info(`Game ${row.code}: ${color} resigned.`);
    return this.getRowById(gameId) as GameRow;
  }

  private finishRow(row: GameRow, state: GameState, now: number): void {
    const host = getUserById(this.db, row.host_id);
    const guest = row.guest_id ? getUserById(this.db, row.guest_id) : null;
    const winnerId =
      state.winner === 'white' ? row.host_id : state.winner === 'black' ? row.guest_id : null;

    const updateGame = this.db.prepare(
      `UPDATE games
       SET state = ?, status = 'finished', updated_at = ?, finished_at = ?,
           winner_id = ?, finish_reason = ?
       WHERE id = ?`,
    );

    const transaction = this.db.transaction(() => {
      updateGame.run(
        JSON.stringify(state),
        now,
        now,
        winnerId,
        state.finishReason,
        row.id,
      );

      if (row.ranked === 1 && host && guest) {
        const result = state.winner ?? 'draw';
        const ratings = rateGame(
          { rating: host.rating, games: host.ranked_games },
          { rating: guest.rating, games: guest.ranked_games },
          result,
        );
        const updatePlayer = this.db.prepare(
          `UPDATE users
           SET rating = ?, ranked_games = ranked_games + 1,
               wins = wins + ?, losses = losses + ?
           WHERE id = ?`,
        );
        updatePlayer.run(ratings.white, result === 'white' ? 1 : 0, result === 'black' ? 1 : 0, host.id);
        updatePlayer.run(ratings.black, result === 'black' ? 1 : 0, result === 'white' ? 1 : 0, guest.id);
        log.info(
          `Ranked game ${row.code} finished (${result}); ${host.username} ${ratings.whiteDelta >= 0 ? '+' : ''}${ratings.whiteDelta}, ${guest.username} ${ratings.blackDelta >= 0 ? '+' : ''}${ratings.blackDelta}.`,
        );
      } else {
        log.info(
          `Casual game ${row.code} finished: ${
            state.winner ? `${state.winner} wins` : 'draw'
          } (${state.finishReason ?? 'unknown'}).`,
        );
      }
    });

    transaction();
  }
}
