import { coordKey, hexDistance, neighborCoords } from '../../shared/hex';
import {
  applyAction,
  getLegalActions,
  opponent,
  queenCoord,
  topAt,
} from '../../shared/hive/engine';
import {
  BUGS,
  BUG_META,
  type Action,
  type Color,
  type GameState,
} from '../../shared/types';
import type { AppConfig } from './config';
import { getBotUser, getUserById, type DB, type GameRow, type UserRow } from './db';
import type { GameService } from './games';
import { log } from './logger';
import {
  levelForRating,
  tuningFor,
  type BotLevel,
  type BotTuning,
} from '../../shared/difficulty';

export interface RankedAction {
  action: Action;
  score: number;
}

const WIN_SCORE = 10_000;
const DEFAULT_NOISE = 0.4;
/** Safety valve: thrashing the search must never block the event loop for long. */
const THREAT_BUDGET_MS = 600;

function destinationOf(action: Action): { q: number; r: number } {
  return action.type === 'place' ? { q: action.q, r: action.r } : action.to;
}

function topOwner(state: GameState, coord: { q: number; r: number }): Color | null {
  return topAt(state, coord)?.owner ?? null;
}

/** How many of a queen's six sides are occupied by pieces of `color`. */
function coverage(state: GameState, queen: { q: number; r: number }, color: Color): number {
  return neighborCoords(queen).filter((coord) => topOwner(state, coord) === color).length;
}

function ownQueenThreat(state: GameState, color: Color): number {
  const queen = queenCoord(state, color);
  return queen ? coverage(state, queen, opponent(color)) : 0;
}

interface EvalContext {
  enemy: Color;
  enemyQueen: { q: number; r: number } | null;
  ownThreat: number;
}

function evalContext(state: GameState, color: Color): EvalContext {
  return {
    enemy: opponent(color),
    enemyQueen: queenCoord(state, opponent(color)),
    ownThreat: ownQueenThreat(state, color),
  };
}

/**
 * Score one action from `color`'s point of view. `context` is captured before
 * the action so coverage deltas can be measured on the resulting board.
 */
function evaluateMove(
  state: GameState,
  action: Action,
  color: Color,
  context: EvalContext,
  noise: number,
): number {
  let next: GameState;
  try {
    next = applyAction(state, action);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  if (next.status === 'finished') {
    return next.winner === color ? WIN_SCORE : next.winner === null ? 0 : -WIN_SCORE;
  }

  let score = (Math.random() - 0.5) * noise;

  const enemyQueen = queenCoord(next, context.enemy);
  const ownQueen = queenCoord(next, color);

  // Surrounding the enemy queen is the win condition; adding a new side is
  // far more valuable than shuffling pieces elsewhere.
  if (enemyQueen) {
    const before = context.enemyQueen ? coverage(state, context.enemyQueen, color) : 0;
    score += (coverage(next, enemyQueen, color) - before) * 10;
  }

  // Losing sides around our own queen is the main defensive signal.
  if (ownQueen) {
    score -= (coverage(next, ownQueen, context.enemy) - context.ownThreat) * 9;
  }

  const destination = destinationOf(action);
  if (enemyQueen) {
    const distance = hexDistance(destination, enemyQueen);
    score += Math.max(0, 3 - distance) * 0.8;
  }

  // A beetle sitting on an enemy tile pins it and counts as pressure.
  const destinationStack = next.cells[coordKey(destination)];
  if (destinationStack && destinationStack.length >= 2) {
    const top = destinationStack[destinationStack.length - 1];
    const below = destinationStack[destinationStack.length - 2];
    if (top.owner === color && below.owner === context.enemy) score += 3;
  }

  // Timing rules: the queen should normally join by turn three or four.
  if (action.type === 'place' && action.bug === 'queen') {
    if (state.placed[color] === 2) score += 3;
    else if (state.placed[color] === 3) score += 1.5;
    else if (state.placed[color] === 0) score -= 1;
  }
  if (action.type === 'move' && topAt(state, action.from)?.bug === 'queen') score -= 2;

  // Slight preference for the pieces that create lasting pressure.
  if (action.type === 'place') {
    if (action.bug === 'ant') score += 0.4;
    else if (action.bug === 'beetle') score += 0.3;
    else if (action.bug === 'spider') score -= 0.1;
  }

  return score;
}

export interface RankOptions {
  /** Symmetric random jitter, so weaker tiers can misjudge close calls. */
  noise?: number;
}

/**
 * Rank every legal move with a one-ply evaluation. The list is used both as
 * the fallback opponent and as the candidate set offered to the language
 * model, which keeps the model's choice legal and grounded.
 */
export function rankActions(
  state: GameState,
  actions: Action[],
  color: Color = state.turn,
  options: RankOptions = {},
): RankedAction[] {
  const noise = options.noise ?? DEFAULT_NOISE;
  const context = evalContext(state, color);
  const ranked = actions.map((action) => ({
    action,
    score: evaluateMove(state, action, color, context, noise),
  }));

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Two-ply safety net: for the strongest-looking moves, ask whether the
 * opponent can immediately finish our queen. Only replies that land next to
 * our queen can do damage, so the extra work stays small even late in a game.
 */
export function deepenWithThreats(
  state: GameState,
  ranked: RankedAction[],
  color: Color,
  width: number,
  budgetMs = THREAT_BUDGET_MS,
): RankedAction[] {
  if (width <= 0 || ranked.length === 0) return ranked;

  const started = Date.now();
  const refined = ranked.map((entry) => ({ ...entry }));
  const widthLimit = Math.min(width, refined.length);

  for (let index = 0; index < widthLimit; index += 1) {
    if (Date.now() - started > budgetMs) break;
    const entry = refined[index];
    if (!Number.isFinite(entry.score) || entry.score <= -WIN_SCORE) continue;

    let next: GameState;
    try {
      next = applyAction(state, entry.action);
    } catch {
      continue;
    }
    if (next.status === 'finished') continue;

    const ourQueen = queenCoord(next, color);
    if (!ourQueen) continue;

    const context = evalContext(next, color);
    let worst = entry.score;

    for (const reply of getLegalActions(next)) {
      if (hexDistance(destinationOf(reply), ourQueen) > 1) continue;
      const value = evaluateMove(next, reply, color, context, 0);
      if (value < worst) worst = value;
      if (worst <= -WIN_SCORE) break;
    }

    refined[index].score = entry.score * 0.6 + worst * 0.4;
  }

  refined.sort((a, b) => b.score - a.score);
  return refined;
}

export interface PlannedMove {
  ranked: RankedAction[];
  action: Action | null;
  /** True when the tier deliberately played a random legal move. */
  blunder: boolean;
}

/** Pick a move for the given tuning profile, without any model in the loop. */
export function planMove(
  state: GameState,
  tuning: BotTuning,
  random: () => number = Math.random,
): PlannedMove {
  const legal = getLegalActions(state);
  if (legal.length === 0) return { ranked: [], action: null, blunder: false };

  if (tuning.blunder > 0 && random() < tuning.blunder) {
    const action = legal[Math.floor(random() * legal.length)] ?? legal[0];
    return { ranked: rankActions(state, legal, state.turn, { noise: tuning.noise }), action, blunder: true };
  }

  const ranked = deepenWithThreats(
    state,
    rankActions(state, legal, state.turn, { noise: tuning.noise }),
    state.turn,
    tuning.searchWidth,
  );

  return { ranked, action: ranked[0]?.action ?? null, blunder: false };
}


export function describeAction(state: GameState, action: Action): string {
  if (action.type === 'place') {
    const name = BUG_META[action.bug].name;
    const stack = state.cells[coordKey(action)] ?? [];
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      return `Place ${name} at (${action.q}, ${action.r}) on top of ${top.owner} ${BUG_META[top.bug].name}`;
    }
    return `Place ${name} at (${action.q}, ${action.r})`;
  }

  const tile = topAt(state, action.from);
  const name = tile ? BUG_META[tile.bug].name : 'piece';
  const stack = state.cells[coordKey(action.to)] ?? [];
  const destination =
    stack.length > 0
      ? `onto ${stack[stack.length - 1].owner} ${BUG_META[stack[stack.length - 1].bug].name} at (${action.to.q}, ${action.to.r})`
      : `to (${action.to.q}, ${action.to.r})`;
  return `Move ${name} from (${action.from.q}, ${action.from.r}) ${destination}`;
}

function boardText(state: GameState): string {
  const keys = Object.keys(state.cells)
    .filter((key) => (state.cells[key]?.length ?? 0) > 0)
    .sort((a, b) => {
      const [aq, ar] = a.split(',').map(Number);
      const [bq, br] = b.split(',').map(Number);
      return aq - bq || ar - br;
    });

  if (keys.length === 0) return '(the board is empty)';

  return keys
    .map((key) => {
      const stack = state.cells[key];
      const tiles = stack
        .map((tile) => `${tile.owner} ${BUG_META[tile.bug].name}`)
        .join(' -> ');
      return `${key}: ${tiles}`;
    })
    .join('\n');
}

function handText(state: GameState, color: Color): string {
  const parts = BUGS.filter((bug) => state.hands[color][bug] > 0).map(
    (bug) => `${BUG_META[bug].name} x${state.hands[color][bug]}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'no tiles left';
}

export function buildMovePrompt(
  state: GameState,
  candidates: RankedAction[],
  botName = 'HiveMind',
): string {
  const color = state.turn;
  const enemy = opponent(color);
  const whiteQueen = queenCoord(state, 'white');
  const blackQueen = queenCoord(state, 'black');
  const queenText = (label: string, coord: { q: number; r: number } | null) =>
    `${label}: ${coord ? `(${coord.q}, ${coord.r})` : 'still in hand'}`;

  const lines = [
    `You are ${botName}, playing ${color === 'white' ? 'Ivory (white)' : 'Onyx (black)'} in Hive.`,
    `Move number ${state.moveNumber + 1}. It is your turn.`,
    '',
    'Board (stack bottom -> top):',
    boardText(state),
    '',
    `Your hand: ${handText(state, color)}`,
    `Opponent hand: ${handText(state, enemy)}`,
    queenText('Ivory queen', whiteQueen),
    queenText('Onyx queen', blackQueen),
    '',
    'Candidate moves:',
    ...candidates.map(
      (candidate, index) => `${index + 1}. ${describeAction(state, candidate.action)}`,
    ),
    '',
    `Choose the single strongest move for ${color === 'white' ? 'Ivory' : 'Onyx'}. Reply with JSON only: {"move": <number>}`,
  ];
  return lines.join('\n');
}

export function parseMoveIndex(content: string, count: number): number | null {
  const text = (content ?? '').trim();
  let value: unknown;
  try {
    const parsed = JSON.parse(text) as { move?: unknown };
    value = parsed?.move;
  } catch {
    const match = text.match(/-?\d+/);
    value = match ? Number(match[0]) : null;
  }
  const index = Number(value);
  if (!Number.isInteger(index) || index < 1 || index > count) return null;
  return index;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class ComputerPlayer {
  private pending = new Set<string>();
  /** Only one table talks to the model at a time; others use the search. */
  private llmInFlight = false;
  private lastWarmupAt = 0;
  private lastLlmErrorAt = 0;

  constructor(
    private readonly db: DB,
    private readonly config: AppConfig,
    private readonly games: GameService,
    private readonly notify: (gameId: string, finished: boolean) => void,
  ) {}

  get enabled(): boolean {
    return this.config.ollama.enabled;
  }

  get model(): string {
    return this.config.ollama.model;
  }

  private botId(): string | null {
    return getBotUser(this.db)?.id ?? null;
  }

  private currentPlayerId(row: GameRow, state: GameState): string | null {
    return state.turn === 'white' ? row.host_id : row.guest_id;
  }

  /**
   * The level a game was seated at, or one derived from the human's rating for
   * older records and auto games.
   */
  levelForGame(row: GameRow, state: GameState, botId: string): BotLevel {
    const stored = state.settings.botLevel;
    if (stored) return stored;
    if (this.config.bot.difficulty !== 'auto') return this.config.bot.difficulty;
    const humanId = row.host_id === botId ? row.guest_id : row.host_id;
    const human = humanId ? getUserById(this.db, humanId) : null;
    return levelForRating(human?.rating ?? 1200);
  }

  /** Fire-and-forget: schedule one computer move for this game, if it is due. */
  schedule(gameId: string): void {
    if (this.pending.has(gameId)) return;
    const botId = this.botId();
    if (!botId) return;

    const row = this.games.getRowById(gameId);
    if (!row || row.status !== 'active') return;
    let state: GameState;
    try {
      state = JSON.parse(row.state) as GameState;
    } catch {
      return;
    }
    if (state.status !== 'active') return;
    if (this.currentPlayerId(row, state) !== botId) return;
    // An active game with no legal moves is already handled by the engine's
    // auto-pass; never spin on it if an old record somehow reaches this point.
    if (getLegalActions(state).length === 0) return;

    this.pending.add(gameId);
    const timer = setTimeout(() => {
      void this.run(gameId);
    }, this.config.ollama.minDelayMs);
    timer.unref();
  }

  /** Load the model and resume any games left waiting on the computer. */
  start(): void {
    this.warmup();
    const rows = this.db
      .prepare("SELECT id FROM games WHERE status = 'active'")
      .all() as Array<{ id: string }>;
    for (const row of rows) this.schedule(row.id);
  }

  /** Preload the Ollama model so the first reply does not include a cold start. */
  warmup(force = false): void {
    if (!this.enabled) return;
    if (!force && Date.now() - this.lastWarmupAt < 5 * 60_000) return;
    this.lastWarmupAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    timer.unref();

    void fetch(`${normalizeUrl(this.config.ollama.url)}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: this.config.ollama.model,
        prompt: 'Reply with the single word ready.',
        stream: false,
        keep_alive: '30m',
        options: { num_predict: 1, temperature: 0 },
      }),
    })
      .then((response) => {
        if (!response.ok) {
          this.warnLlm(`Ollama returned HTTP ${response.status}.`);
          return;
        }
        log.info(
          `Computer opponent ready: ${this.config.ollama.model} at ${normalizeUrl(this.config.ollama.url)}.`,
        );
      })
      .catch((error: unknown) => {
        this.warnLlm(
          `Ollama is not reachable at ${normalizeUrl(this.config.ollama.url)} (${
            (error as Error).message
          }); using the built-in heuristic instead.`,
        );
      })
      .finally(() => clearTimeout(timer));
  }

  private warnLlm(message: string): void {
    // A dead model should not flood the log once per move.
    if (Date.now() - this.lastLlmErrorAt < 60_000) return;
    this.lastLlmErrorAt = Date.now();
    log.warn(message);
  }

  private async run(gameId: string): Promise<void> {
    try {
      const row = this.games.getRowById(gameId);
      if (!row || row.status !== 'active') return;

      let state: GameState;
      try {
        state = JSON.parse(row.state) as GameState;
      } catch {
        return;
      }
      if (state.status !== 'active') return;

      const botId = this.botId();
      if (!botId || this.currentPlayerId(row, state) !== botId) return;

      const bot = getUserById(this.db, botId);
      if (!bot) return;

      const level = this.levelForGame(row, state, botId);
      const tuning = tuningFor(level);
      const plan = planMove(state, tuning);
      let action = plan.action;
      if (!action) return;

      let engine: 'ollama' | 'heuristic' | 'blunder' = plan.blunder ? 'blunder' : 'heuristic';

      if (!plan.blunder && this.enabled && tuning.llmCandidates > 0) {
        const candidates = plan.ranked.slice(0, tuning.llmCandidates);
        const picked = await this.askOllama(state, candidates, bot.username, tuning);
        if (picked) {
          const best = plan.ranked[0]?.score ?? picked.score;
          const accepted =
            tuning.llmMargin < 0 || picked.score >= best - tuning.llmMargin;
          if (accepted) {
            action = picked.action;
            engine = 'ollama';
          }
        }
      }

      // The human may have resigned or another request may have advanced the
      // game while the model was thinking.
      const latest = this.games.getRowById(gameId);
      if (!latest || latest.status !== 'active') return;
      const latestState = JSON.parse(latest.state) as GameState;
      if (
        latestState.status !== 'active' ||
        latestState.turn !== state.turn ||
        latestState.moveNumber !== state.moveNumber
      ) {
        return;
      }

      this.games.performAction(gameId, bot.id, action);
      const updated = this.games.getRowById(gameId);
      if (updated) {
        log.info(
          `Game ${updated.code}: ${bot.username} plays ${describeAction(state, action)} (${engine}, ${level}).`,
        );
        this.notify(gameId, updated.status === 'finished');
      }
    } catch (error) {
      log.warn(`Computer move failed for game ${gameId}:`, (error as Error).message);
    } finally {
      this.pending.delete(gameId);
      // If the turn came straight back (the human had no legal move and the
      // engine auto-passed), keep playing instead of stalling the table.
      this.schedule(gameId);
    }
  }

  private async askOllama(
    state: GameState,
    candidates: RankedAction[],
    botName: string,
    tuning: BotTuning,
  ): Promise<{ action: Action; score: number } | null> {
    if (candidates.length === 0) return null;
    // With several tables running at once a single model would queue and time
    // out, so the first table gets the model and the rest use the search.
    if (this.llmInFlight) return null;
    this.llmInFlight = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.ollama.timeoutMs);
    timer.unref();

    try {
      const response = await fetch(`${normalizeUrl(this.config.ollama.url)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.ollama.model,
          stream: false,
          keep_alive: '30m',
          format: 'json',
          options: {
            temperature: tuning.temperature,
            num_predict: 24,
            num_ctx: 4096,
          },
          messages: [
            {
              role: 'system',
              content:
                'You are HiveMind, an expert Hive board-game opponent. ' +
                'Choose exactly one move from the numbered legal candidates. ' +
                'Hive rules: the Queen must join by your fourth turn; pieces move around the outside of the hive; ' +
                'Beetles may climb onto other tiles; a Queen loses when all six of her sides are occupied. ' +
                'Prioritise surrounding the enemy Queen, defend your own Queen, and prefer concrete pressure over drifting moves. ' +
                'Never invent a move. Reply only as JSON: {"move": <number>}.',
            },
            {
              role: 'user',
              content: buildMovePrompt(state, candidates, botName),
            },
          ],
        }),
      });

      if (!response.ok) {
        this.warnLlm(`Ollama chat returned HTTP ${response.status}.`);
        return null;
      }

      const payload = (await response.json()) as {
        message?: { content?: string };
      };
      const index = parseMoveIndex(payload.message?.content ?? '', candidates.length);
      if (index === null) {
        this.warnLlm(
          `Ollama returned an unusable move: ${String(payload.message?.content).slice(0, 120)}`,
        );
        return null;
      }
      const entry = candidates[index - 1];
      return entry ? { action: entry.action, score: entry.score } : null;
    } catch (error) {
      this.warnLlm(`Ollama move request failed: ${(error as Error).message}`);
      return null;
    } finally {
      this.llmInFlight = false;
      clearTimeout(timer);
    }
  }
}
