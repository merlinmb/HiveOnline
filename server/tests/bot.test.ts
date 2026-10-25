import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions, applyAction } from '../../shared/hive/engine';
import { coordKey } from '../../shared/hex';
import type { Action, Bug, Color, GameState } from '../../shared/types';
import {
  buildMovePrompt,
  describeAction,
  parseMoveIndex,
  planMove,
  rankActions,
} from '../src/bot';
import { levelForRating, tuningFor } from '../../shared/difficulty';

function boardState(
  tiles: { owner: Color; bug: Bug; q: number; r: number }[],
  turn: Color = 'white',
): GameState {
  const state = createGame();
  state.cells = {};
  state.turn = turn;
  state.placed = { white: 0, black: 0 };
  state.queenPlaced = { white: false, black: false };
  let id = 1;
  for (const tile of tiles) {
    const key = coordKey({ q: tile.q, r: tile.r });
    state.cells[key] = [
      ...(state.cells[key] ?? []),
      { id: `t${id++}`, owner: tile.owner, bug: tile.bug },
    ];
    state.placed[tile.owner] += 1;
    if (tile.bug === 'queen') state.queenPlaced[tile.owner] = true;
  }
  return state;
}

/** True when `action` lets the opponent finish the game on their next move. */
function allowsImmediateLoss(state: GameState, action: Action, color: Color): boolean {
  let next: GameState;
  try {
    next = applyAction(state, action);
  } catch {
    return false;
  }
  if (next.status === 'finished') return next.winner !== color;
  return getLegalActions(next).some((reply) => {
    const after = applyAction(next, reply);
    return after.status === 'finished' && after.winner !== color;
  });
}

describe('computer opponent ranking', () => {
  it('ranks a queen-closing move as an outright win', () => {
    // Onyx queen at the origin with five of her six sides sealed. The white
    // ant at (1,1) can step into the last gap at (0,1).
    const state = boardState([
      { owner: 'black', bug: 'queen', q: 0, r: 0 },
      { owner: 'white', bug: 'ant', q: 1, r: 0 },
      { owner: 'white', bug: 'spider', q: 1, r: -1 },
      { owner: 'white', bug: 'grasshopper', q: 0, r: -1 },
      { owner: 'white', bug: 'beetle', q: -1, r: 0 },
      { owner: 'white', bug: 'ant', q: -1, r: 1 },
      { owner: 'white', bug: 'ant', q: 1, r: 1 },
      { owner: 'white', bug: 'queen', q: 2, r: 0 },
    ]);

    const actions = getLegalActions(state);
    expect(actions.some((action) => action.type === 'move' && action.to.q === 0 && action.to.r === 1)).toBe(true);

    const ranked = rankActions(state, actions);
    expect(ranked).toHaveLength(actions.length);
    const winner = ranked.find(
      (entry) => entry.action.type === 'move' && entry.action.to.q === 0 && entry.action.to.r === 1,
    );
    expect(winner?.score).toBe(10_000);
    expect(ranked[0]?.score).toBe(10_000);
  });

  it('keeps every candidate legal and sorted by score', () => {
    const state = createGame();
    const actions = getLegalActions(state);
    const ranked = rankActions(state, actions, 'white');

    expect(ranked).toHaveLength(actions.length);
    expect(ranked.every((entry) => Number.isFinite(entry.score))).toBe(true);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});

describe('computer opponent difficulty', () => {
  it('maps ratings onto tiers that only get stronger', () => {
    expect(levelForRating(900)).toBe('novice');
    expect(levelForRating(1099)).toBe('novice');
    expect(levelForRating(1100)).toBe('casual');
    expect(levelForRating(1199)).toBe('casual');
    expect(levelForRating(1200)).toBe('skilled');
    expect(levelForRating(1349)).toBe('skilled');
    expect(levelForRating(1350)).toBe('expert');
    expect(levelForRating(1500)).toBe('master');
    expect(levelForRating(1900)).toBe('master');
    expect(tuningFor('master').searchWidth).toBeGreaterThan(tuningFor('skilled').searchWidth);
    expect(tuningFor('novice').blunder).toBeGreaterThan(0);
    expect(tuningFor('master').blunder).toBe(0);
  });

  it('frees a queen side instead of chasing a greedy attack that loses next move', () => {
    // White's queen has five occupied sides: four black pieces plus White's own
    // ant on (1, 0). (0, 1) is the only gap, and Black's grasshopper at (0, -2)
    // can hop over the ant and the queen to fill it. The one-ply evaluation
    // loves the beetle climbing onto the black spider at (1, -1), but that
    // leaves the queen boxed in. Moving the ant off the queen's side reopens a
    // second side, so Black can no longer finish the queen in one move.
    const state = boardState(
      [
        { owner: 'white', bug: 'queen', q: 0, r: 0 },
        { owner: 'white', bug: 'ant', q: 1, r: 0 },
        { owner: 'white', bug: 'beetle', q: 2, r: -1 },
        { owner: 'black', bug: 'spider', q: 1, r: -1 },
        { owner: 'black', bug: 'ant', q: 0, r: -1 },
        { owner: 'black', bug: 'beetle', q: -1, r: 0 },
        { owner: 'black', bug: 'ant', q: -1, r: 1 },
        { owner: 'black', bug: 'grasshopper', q: 0, r: -2 },
        { owner: 'black', bug: 'queen', q: 1, r: -2 },
      ],
      'white',
    );

    const legal = getLegalActions(state);
    const greedy = rankActions(state, legal, 'white', { noise: 0 });
    expect(greedy[0]?.action.type).toBe('move');
    expect(allowsImmediateLoss(state, greedy[0]!.action, 'white')).toBe(true);

    // The reply search rejects every move that lets Black fill the last gap.
    const plan = planMove(state, tuningFor('expert'));
    expect(plan.action).not.toBeNull();
    expect(allowsImmediateLoss(state, plan.action!, 'white')).toBe(false);
    expect(plan.action?.type).toBe('move');
  });
});

describe('computer opponent protocol', () => {
  it('reads a move number from clean JSON, prose and fenced JSON', () => {
    expect(parseMoveIndex('{"move": 3}', 5)).toBe(3);
    expect(parseMoveIndex('{"move": "2"}', 5)).toBe(2);
    expect(parseMoveIndex('I would choose move 4.', 5)).toBe(4);
    expect(parseMoveIndex('```json\n{"move": 1}\n```', 5)).toBe(1);
  });

  it('rejects out-of-range or non-numeric answers', () => {
    expect(parseMoveIndex('{"move": 0}', 5)).toBeNull();
    expect(parseMoveIndex('{"move": 6}', 5)).toBeNull();
    expect(parseMoveIndex('{"move": "later"}', 5)).toBeNull();
    expect(parseMoveIndex('', 5)).toBeNull();
  });

  it('describes every candidate in the prompt', () => {
    const state = createGame();
    const ranked = rankActions(state, getLegalActions(state), 'white');
    const candidates = ranked.slice(0, 5);
    const prompt = buildMovePrompt(state, candidates, 'HiveMind');

    expect(prompt).toContain('You are HiveMind');
    expect(prompt).toContain('Candidate moves:');
    for (const [index, candidate] of candidates.entries()) {
      expect(prompt).toContain(`${index + 1}. ${describeAction(state, candidate.action)}`);
    }
    expect(prompt).toContain('{"move": <number>}');
  });

  it('describes placements and moves in plain language', () => {
    const state = createGame();
    expect(describeAction(state, { type: 'place', bug: 'ant', q: 0, r: 0 })).toBe(
      'Place Soldier Ant at (0, 0)',
    );

    const withTiles = boardState([
      { owner: 'black', bug: 'ant', q: 0, r: 0 },
      { owner: 'white', bug: 'beetle', q: 1, r: 0 },
    ]);
    expect(
      describeAction(withTiles, { type: 'move', from: { q: 1, r: 0 }, to: { q: 0, r: 0 } }),
    ).toBe('Move Beetle from (1, 0) onto black Soldier Ant at (0, 0)');
  });
});
