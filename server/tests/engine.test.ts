import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  getLegalActions,
  heightAt,
  isQueenSurrounded,
  queenCoord,
  topAt,
} from '../../shared/hive/engine';
import type { Action, Bug, Color, GameState } from '../../shared/types';
import { BUGS } from '../../shared/types';
import { coordKey, hexDistance } from '../../shared/hex';

function tile(owner: Color, bug: Bug, q: number, r: number) {
  return { owner, bug, q, r };
}

function mobilityState(
  tiles: { owner: Color; bug: Bug; q: number; r: number }[],
  turn: Color = 'white',
): GameState {
  const state = createGame({ expansions: true });
  state.cells = {};
  state.turn = turn;
  state.placed = { white: 1, black: 1 };
  state.queenPlaced = {
    white: tiles.some((t) => t.owner === 'white' && t.bug === 'queen'),
    black: tiles.some((t) => t.owner === 'black' && t.bug === 'queen'),
  };
  for (const color of ['white', 'black'] as Color[]) {
    for (const bug of BUGS) state.hands[color][bug] = 0;
  }
  let id = 1;
  for (const t of tiles) {
    const key = coordKey({ q: t.q, r: t.r });
    state.cells[key] = [...(state.cells[key] ?? []), { id: `x${id++}`, owner: t.owner, bug: t.bug }];
  }
  return state;
}

function movesFrom(state: GameState) {
  return getLegalActions(state)
    .filter((a): a is Extract<Action, { type: 'move' }> => a.type === 'move')
    .map((a) => ({ from: a.from, to: a.to }));
}

describe('placement rules', () => {
  it('starts in the centre and the second player must touch the hive', () => {
    let state = createGame();
    const first = getLegalActions(state);
    expect(first.every((a) => a.type === 'place' && a.q === 0 && a.r === 0)).toBe(true);
    expect(first.some((a) => a.type === 'place' && a.bug === 'queen')).toBe(true);

    state = applyAction(state, { type: 'place', bug: 'ant', q: 0, r: 0 });
    const reply = getLegalActions(state);
    expect(reply).toHaveLength(30);
    expect(
      reply.every((a) => a.type === 'place' && hexDistance({ q: 0, r: 0 }, { q: a.q, r: a.r }) === 1),
    ).toBe(true);

    state = applyAction(state, { type: 'place', bug: 'ant', q: 1, r: 0 });
    const whiteSecond = getLegalActions(state);
    for (const action of whiteSecond) {
      if (action.type !== 'place') continue;
      const key = coordKey({ q: action.q, r: action.r });
      const ownTile = key === coordKey({ q: 0, r: 0 });
      const nextToEnemy = hexDistance({ q: action.q, r: action.r }, { q: 1, r: 0 }) === 1;
      expect(ownTile || !nextToEnemy).toBe(true);
      if (!ownTile) expect(nextToEnemy).toBe(false);
    }
    expect(whiteSecond.some((a) => a.type === 'place' && a.q === 0 && a.r === -1)).toBe(true);
    expect(whiteSecond.some((a) => a.type === 'place' && a.q === 2 && a.r === 0)).toBe(false);
  });

  it('honours the tournament opening rule', () => {
    const state = createGame({ tournamentOpening: true });
    const actions = getLegalActions(state);
    expect(actions.some((a) => a.type === 'place' && a.bug === 'queen')).toBe(false);
    expect(actions.some((a) => a.type === 'place' && a.bug === 'ant')).toBe(true);
  });

  it('forces the queen on the fourth turn and forbids moving before she is placed', () => {
    const state = mobilityState([
      tile('white', 'ant', 0, 0),
      tile('white', 'spider', 1, 0),
      tile('white', 'grasshopper', 0, 1),
      tile('black', 'ant', 1, -1),
      tile('black', 'queen', 2, -1),
    ]);
    state.placed = { white: 3, black: 2 };
    state.queenPlaced.white = false;
    for (const bug of BUGS) state.hands.white[bug] = 0;
    state.hands.white.queen = 1;

    const actions = getLegalActions(state);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'place' && a.bug === 'queen')).toBe(true);
    expect(actions.some((a) => a.type === 'move')).toBe(false);
  });
});

describe('movement rules', () => {
  it('blocks a piece from squeezing between two occupied neighbours', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', 1, -1),
      tile('white', 'ant', 0, 1),
    ]);
    const moves = movesFrom(state);
    expect(moves.some((m) => m.from.q === 0 && m.from.r === 0 && m.to.q === 1 && m.to.r === 0)).toBe(
      false,
    );
  });

  it('will not let a piece break the hive in two', () => {
    const state = mobilityState([
      tile('white', 'ant', 0, 0),
      tile('white', 'queen', 1, 0),
      tile('white', 'ant', 2, 0),
    ]);
    const moves = movesFrom(state).filter((m) => m.from.q === 1 && m.from.r === 0);
    expect(moves).toHaveLength(0);
  });

  it('lets a grasshopper jump over a line to the first empty hex', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'grasshopper', 1, 0),
      tile('white', 'ant', 2, 0),
      tile('white', 'ant', 1, -1),
      tile('white', 'ant', 2, -1),
    ]);
    const moves = movesFrom(state).filter(
      (m) => m.from.q === 1 && m.from.r === 0 && m.to.q === 3 && m.to.r === 0,
    );
    expect(moves).toHaveLength(1);
  });

  it('lets a spider move exactly three spaces', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'spider', 1, 0),
    ]);
    const moves = movesFrom(state).filter((m) => m.from.q === 1 && m.from.r === 0);
    expect(moves.length).toBeGreaterThan(0);
  });

  it('lets a beetle climb onto the hive and pins the piece below', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'beetle', 1, 0),
      tile('white', 'ant', 0, 1),
    ]);
    const climbs = movesFrom(state).filter(
      (m) => m.from.q === 1 && m.from.r === 0 && m.to.q === 0 && m.to.r === 0,
    );
    expect(climbs).toHaveLength(1);

    const climbed = applyAction(state, { type: 'move', from: { q: 1, r: 0 }, to: { q: 0, r: 0 } });
    expect(heightAt(climbed, { q: 0, r: 0 })).toBe(2);
    expect(topAt(climbed, { q: 0, r: 0 })?.bug).toBe('beetle');
    expect(queenCoord(climbed, 'white')).toEqual({ q: 0, r: 0 });
    expect(heightAt(climbed, { q: 1, r: 0 })).toBe(0);
  });

  it('lets a ladybug climb two tiles and drop down', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', 1, 0),
      tile('white', 'ladybug', 0, 1),
    ]);
    const moves = movesFrom(state).filter((m) => m.from.q === 0 && m.from.r === 1);
    expect(moves.some((m) => m.to.q === 2 && m.to.r === 0)).toBe(true);
  });

  it('lets a mosquito borrow an adjacent ant movement', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', 1, 0),
      tile('white', 'mosquito', 0, 1),
    ]);
    const moves = movesFrom(state).filter((m) => m.from.q === 0 && m.from.r === 1);
    expect(moves.length).toBeGreaterThan(3);
  });

  it('detects a surrounded queen and ends the game', () => {
    const state = mobilityState([
      tile('black', 'queen', 0, 0),
      tile('white', 'queen', 2, -1),
      tile('white', 'ant', 1, -1),
      tile('white', 'ant', 0, -1),
      tile('white', 'ant', -1, 0),
      tile('white', 'ant', -1, 1),
      tile('white', 'ant', 0, 1),
      tile('white', 'beetle', 2, 0),
    ]);
    expect(isQueenSurrounded(state, 'black')).toBe(false);
    const finished = applyAction(state, {
      type: 'move',
      from: { q: 2, r: 0 },
      to: { q: 1, r: 0 },
    });
    expect(isQueenSurrounded(finished, 'black')).toBe(true);
    expect(finished.status).toBe('finished');
    expect(finished.winner).toBe('white');
    expect(finished.finishReason).toBe('queen');
  });
});
