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

  it('moves a spider exactly three spaces and never one or two', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'spider', 1, 0),
    ]);
    const moves = movesFrom(state).filter((m) => m.from.q === 1 && m.from.r === 0);
    // The only three-step route keeps contact with the queen and ends west of
    // the hive; no adjacent one-step sliding move is offered.
    expect(moves).toEqual([{ from: { q: 1, r: 0 }, to: { q: -1, r: 0 } }]);
  });

  it('walks a spider three spaces along the hive, not by straight distance', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', 1, 0),
      tile('white', 'ant', 2, 0),
      tile('white', 'spider', 3, 0),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === 3 && m.from.r === 0)
      .map((m) => coordKey(m.to))
      .sort();
    expect(targets).toEqual(['0,1', '1,-1']);
  });

  it('lets a spider finish two hexes away when the path is three steps', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', 1, 0),
      tile('black', 'ant', 2, 0),
      tile('black', 'ant', 1, -1),
      tile('white', 'spider', 0, 1),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === 0 && m.from.r === 1)
      .map((m) => coordKey(m.to))
      .sort();
    expect(targets).toEqual(['0,-1', '3,0']);
  });

  it('lets a spider use a gap beside its vacated cell but not a gap with no tile alongside', () => {
    // Live position from game #UBPXST. The spider starts at (-1,2); the hive
    // leaves a gap between the ivory ant at (-1,1) and the onyx queen at (1,1).
    // Those two tiles meet only at a corner, so the gap is open: the route
    // (-1,2) -> (0,1) -> (0,2) -> (1,2) is legal, and its middle step is flanked
    // by the onyx queen and by the spider's own vacated cell.
    // (2,1) is not reachable: the shortest way there starts with
    // (-1,2) -> (0,2), whose two flanking cells are both empty, so the spider
    // would slide through open space instead of along a tile.
    const state = mobilityState([
      tile('white', 'queen', 0, -1),
      tile('black', 'ant', 1, -1),
      tile('white', 'beetle', 0, 0),
      tile('black', 'ant', 1, 0),
      tile('white', 'grasshopper', 2, 0),
      tile('black', 'beetle', 2, 0),
      tile('white', 'ant', -1, 1),
      tile('black', 'queen', 1, 1),
      tile('white', 'spider', -1, 2),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === -1 && m.from.r === 2)
      .map((m) => coordKey(m.to))
      .sort();
    expect(targets).toEqual(['-1,0', '1,2']);
  });

  it('opens the corner gap beside the vacated cell for a spider step', () => {
    // Minimal version: the ivory ant (-1,1) and onyx queen (1,1) meet only at a
    // corner, so the spider can cross the middle gap on its second step, hugging
    // the queen. Crossing a gap with no tile alongside is still refused.
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', -1, 1),
      tile('black', 'ant', 1, 0),
      tile('black', 'queen', 1, 1),
      tile('white', 'spider', -1, 2),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === -1 && m.from.r === 2)
      .map((m) => coordKey(m.to))
      .sort();
    expect(targets).toEqual(['-1,0', '1,2']);
  });

  it('refuses the two-hex-away bay crossing for a spider (live game R5VE38)', () => {
    // The reported position: the white spider at (-2,-1) was offered the cell
    // (0,-2) sitting in the notch between the onyx hopper (-1,-1) and the onyx
    // queen (1,-3). Three slides reach it only the long way round:
    // (-2,-1) -> (-1,-2) -> (0,-3) -> (0,-2). That first hop out of (-1,-2)
    // crosses the edge between (-1,-2) and (0,-3), whose two flanking cells
    // (0,-2) and (-1,-3) are both empty - the spider would leave the hive and
    // rejoin it. Refused, so only the walk that hugs a tile all the way round
    // survives: (-2,-1) -> (-1,-2) -> (0,-2) -> (0,-3), landing on (0,-3).
    const state = mobilityState([
      tile('white', 'grasshopper', 0, 0),
      tile('black', 'beetle', 0, -1),
      tile('black', 'beetle', 1, -2),
      tile('black', 'queen', 1, -3),
      tile('white', 'queen', 0, 1),
      tile('black', 'grasshopper', -1, -1),
      tile('white', 'beetle', -1, 2),
      tile('white', 'spider', -2, -1),
      tile('black', 'ant', 1, 1),
      tile('white', 'ant', 1, -4),
      tile('black', 'grasshopper', 2, 1),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === -2 && m.from.r === -1)
      .map((m) => coordKey(m.to))
      .sort();
    expect(targets).toEqual(['-1,1', '0,-3']);
  });

  it('lets an ant leave that same gap once its own cell is treated as vacated', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'ant', -1, 1),
      tile('black', 'ant', 1, 0),
      tile('black', 'queen', 1, 1),
      tile('white', 'ant', -1, 2),
    ]);
    const targets = movesFrom(state)
      .filter((m) => m.from.q === -1 && m.from.r === 2)
      .map((m) => coordKey(m.to));
    // The ant's second step (0,1) -> (0,2) is flanked by the onyx queen and the
    // ant's own vacated cell; it must be able to continue around the hive.
    expect(targets).toContain('0,2');
    expect(targets).toContain('1,2');
  });

  it('does not let a spider squeeze through a closed gate', () => {
    const state = mobilityState([
      tile('white', 'queen', 0, 0),
      tile('white', 'spider', 1, 0),
      tile('white', 'grasshopper', 2, 0),
      tile('black', 'grasshopper', 1, -1),
      tile('white', 'ant', 1, 1),
      tile('white', 'grasshopper', 2, -1),
    ]);
    // Every one-step exit from (1,0) passes between two occupied tiles, and a
    // spider may not jump over a gap.
    expect(movesFrom(state).filter((m) => m.from.q === 1 && m.from.r === 0)).toHaveLength(0);
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
