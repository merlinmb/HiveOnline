import {
  addCoords,
  commonNeighbors,
  coordKey,
  coordsEqual,
  hexDistance,
  neighborCoords,
  ORIGIN,
  parseKey,
} from '../hex';
import {
  BASE_BUGS,
  BUGS,
  BUG_META,
  EXPANSION_BUGS,
  type Action,
  type Bug,
  type Cells,
  type Color,
  type Coord,
  type FinishReason,
  type GameSettings,
  type GameState,
  type Hand,
  type HistoryEntry,
  type PlacedTile,
} from '../types';

export class IllegalMoveError extends Error {}

export function opponent(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function emptyHand(): Hand {
  return Object.fromEntries(BUGS.map((bug) => [bug, 0])) as Hand;
}

export function handFor(settings: GameSettings): Hand {
  const hand = emptyHand();
  for (const bug of BASE_BUGS) hand[bug] = BUG_META[bug].count;
  if (settings.expansions) {
    for (const bug of EXPANSION_BUGS) hand[bug] = BUG_META[bug].count;
  }
  return hand;
}

export function createGame(settings: Partial<GameSettings> = {}): GameState {
  const resolved: GameSettings = {
    expansions: Boolean(settings.expansions),
    tournamentOpening: Boolean(settings.tournamentOpening),
  };
  return {
    cells: {},
    hands: {
      white: handFor(resolved),
      black: handFor(resolved),
    },
    turn: 'white',
    nextTileId: 1,
    placed: { white: 0, black: 0 },
    queenPlaced: { white: false, black: false },
    settings: resolved,
    status: 'active',
    winner: null,
    finishReason: null,
    history: [],
    lastMove: null,
    passes: 0,
    moveNumber: 0,
  };
}

export function cloneGame(state: GameState): GameState {
  return structuredClone(state);
}

export function cellAt(state: GameState, coord: Coord): PlacedTile[] | undefined {
  return state.cells[coordKey(coord)];
}

export function heightAt(state: GameState, coord: Coord): number {
  return state.cells[coordKey(coord)]?.length ?? 0;
}

export function topAt(state: GameState, coord: Coord): PlacedTile | undefined {
  const stack = state.cells[coordKey(coord)];
  return stack?.[stack.length - 1];
}

export function occupiedCoords(state: GameState): Coord[] {
  return Object.keys(state.cells)
    .filter((key) => (state.cells[key]?.length ?? 0) > 0)
    .map(parseKey);
}

export function queenCoord(state: GameState, color: Color): Coord | null {
  for (const [key, stack] of Object.entries(state.cells)) {
    if (stack.some((tile) => tile.owner === color && tile.bug === 'queen')) {
      return parseKey(key);
    }
  }
  return null;
}

export function isQueenSurrounded(state: GameState, color: Color): boolean {
  const queen = queenCoord(state, color);
  if (!queen) return false;
  return neighborCoords(queen).every((c) => heightAt(state, c) > 0);
}

export function hiveConnected(cells: Cells): boolean {
  const keys = Object.keys(cells).filter((key) => (cells[key]?.length ?? 0) > 0);
  if (keys.length <= 1) return true;
  const seen = new Set<string>([keys[0]]);
  const queue = [keys[0]];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    for (const neighbor of neighborCoords(parseKey(key))) {
      const nk = coordKey(neighbor);
      if (!seen.has(nk) && (cells[nk]?.length ?? 0) > 0) {
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  return seen.size === keys.length;
}

function cellCount(state: GameState): number {
  return Object.values(state.cells).filter((stack) => stack.length > 0).length;
}

function placementCells(state: GameState, color: Color): Coord[] {
  if (cellCount(state) === 0) return [ORIGIN];

  const enemy = opponent(color);
  const result = new Map<string, Coord>();
  const occupied = occupiedCoords(state);

  if (state.placed[color] === 0) {
    // A player's very first tile only needs to touch the existing hive, even if it touches an enemy.
    for (const coord of occupied) {
      for (const neighbor of neighborCoords(coord)) {
        if (heightAt(state, neighbor) === 0) result.set(coordKey(neighbor), neighbor);
      }
    }
    return [...result.values()];
  }

  for (const coord of occupied) {
    if (topAt(state, coord)?.owner !== color) continue;
    for (const neighbor of neighborCoords(coord)) {
      if (heightAt(state, neighbor) > 0) continue;
      const touchesEnemy = neighborCoords(neighbor).some(
        (n) => topAt(state, n)?.owner === enemy,
      );
      if (!touchesEnemy) result.set(coordKey(neighbor), neighbor);
    }
  }
  return [...result.values()];
}

function slideStepAllowed(state: GameState, from: Coord, to: Coord): boolean {
  if (heightAt(state, to) > 0) return false;
  if (hexDistance(from, to) !== 1) return false;
  const shared = commonNeighbors(from, to);
  // A piece cannot squeeze through a gap that is closed on both sides.
  return !shared.every((coord) => heightAt(state, coord) > 0);
}

/**
 * During a slide the piece is lifted out of its starting cell, so the hive it
 * must stay in contact with excludes that cell when it was the only tile there.
 */
function touchesHive(state: GameState, origin: Coord, cell: Coord): boolean {
  const emptyOrigin = heightAt(state, origin) === 1;
  return neighborCoords(cell).some((neighbor) => {
    if (emptyOrigin && coordsEqual(neighbor, origin)) return false;
    return heightAt(state, neighbor) > 0;
  });
}

function slidingExact(state: GameState, from: Coord, steps: number): Coord[] {
  const destinations = new Map<string, Coord>();
  const visited = new Set<string>([coordKey(from)]);

  const walk = (current: Coord, depth: number) => {
    if (depth === steps) {
      destinations.set(coordKey(current), current);
      return;
    }
    for (const next of neighborCoords(current)) {
      const key = coordKey(next);
      if (visited.has(key)) continue;
      if (!slideStepAllowed(state, current, next)) continue;
      if (!touchesHive(state, from, next)) continue;
      visited.add(key);
      walk(next, depth + 1);
      visited.delete(key);
    }
  };

  walk(from, 0);
  return [...destinations.values()];
}

function slidingReach(state: GameState, from: Coord): Coord[] {
  const destinations = new Map<string, Coord>();
  const visited = new Set<string>([coordKey(from)]);

  const walk = (current: Coord, depth: number) => {
    if (depth > 0) destinations.set(coordKey(current), current);
    if (depth > 64) return;
    for (const next of neighborCoords(current)) {
      const key = coordKey(next);
      if (visited.has(key)) continue;
      if (!slideStepAllowed(state, current, next)) continue;
      if (!touchesHive(state, from, next)) continue;
      visited.add(key);
      walk(next, depth + 1);
      visited.delete(key);
    }
  };

  walk(from, 0);
  return [...destinations.values()];
}

function beetleGateBlocks(state: GameState, from: Coord, to: Coord): boolean {
  const fromHeight = heightAt(state, from) - 1;
  const toHeight = heightAt(state, to);
  return commonNeighbors(from, to).every(
    (coord) => heightAt(state, coord) > fromHeight && heightAt(state, coord) > toHeight,
  );
}

function beetleDestinations(state: GameState, from: Coord): Coord[] {
  const onTop = heightAt(state, from) > 1;
  const result: Coord[] = [];
  for (const next of neighborCoords(from)) {
    const occupied = heightAt(state, next) > 0;
    if (onTop) {
      if (!beetleGateBlocks(state, from, next)) result.push(next);
    } else if (occupied) {
      // Climbing onto an adjacent piece is always allowed.
      result.push(next);
    } else if (slideStepAllowed(state, from, next) && touchesHive(state, from, next)) {
      result.push(next);
    }
  }
  return result;
}

function grasshopperDestinations(state: GameState, from: Coord): Coord[] {
  const result: Coord[] = [];
  for (const direction of [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ] as Coord[]) {
    let current = addCoords(from, direction);
    if (heightAt(state, current) === 0) continue;
    while (heightAt(state, current) > 0) current = addCoords(current, direction);
    result.push(current);
  }
  return result;
}

function ladybugDestinations(state: GameState, from: Coord): Coord[] {
  if (heightAt(state, from) > 1) return [];
  const result = new Map<string, Coord>();
  const fromKey = coordKey(from);

  for (const first of neighborCoords(from)) {
    if (heightAt(state, first) === 0) continue;
    for (const second of neighborCoords(first)) {
      const secondKey = coordKey(second);
      if (secondKey === coordKey(first) || secondKey === fromKey) continue;
      if (heightAt(state, second) === 0) continue;
      for (const landing of neighborCoords(second)) {
        const landingKey = coordKey(landing);
        if (landingKey === fromKey) continue;
        if (heightAt(state, landing) > 0) continue;
        result.set(landingKey, landing);
      }
    }
  }
  return [...result.values()];
}

function rawDestinations(state: GameState, from: Coord, bug: Bug): Coord[] {
  switch (bug) {
    case 'queen':
      return slidingExact(state, from, 1);
    case 'spider':
      return slidingExact(state, from, 3);
    case 'ant':
      return slidingReach(state, from);
    case 'grasshopper':
      return grasshopperDestinations(state, from);
    case 'beetle':
      return beetleDestinations(state, from);
    case 'ladybug':
      return ladybugDestinations(state, from);
    case 'mosquito': {
      if (heightAt(state, from) > 1) return beetleDestinations(state, from);
      const abilities = new Set<Bug>();
      for (const neighbor of neighborCoords(from)) {
        const tile = topAt(state, neighbor);
        if (tile && tile.bug !== 'mosquito') abilities.add(tile.bug);
      }
      const result = new Map<string, Coord>();
      for (const ability of abilities) {
        for (const destination of rawDestinations(state, from, ability)) {
          result.set(coordKey(destination), destination);
        }
      }
      return [...result.values()];
    }
    default:
      return [];
  }
}

function removalKeepsHiveWhole(state: GameState, from: Coord): boolean {
  const stack = cellAt(state, from);
  if (!stack) return false;
  if (stack.length > 1) return true;
  const cells: Cells = { ...state.cells };
  delete cells[coordKey(from)];
  return hiveConnected(cells);
}

function moveKeepsHiveWhole(state: GameState, from: Coord, to: Coord): boolean {
  if (!removalKeepsHiveWhole(state, from)) return false;

  const stack = cellAt(state, from);
  if (!stack) return false;
  const tile = stack[stack.length - 1];
  const cells: Cells = { ...state.cells };
  const remaining = stack.slice(0, -1);
  if (remaining.length > 0) cells[coordKey(from)] = remaining;
  else delete cells[coordKey(from)];
  cells[coordKey(to)] = [...(cells[coordKey(to)] ?? []), tile];
  return hiveConnected(cells);
}

export function getLegalActions(state: GameState): Action[] {
  if (state.status !== 'active') return [];

  const color = state.turn;
  const actions: Action[] = [];
  const mustPlaceQueen = !state.queenPlaced[color] && state.placed[color] >= 3;

  for (const bug of BUGS) {
    if (state.hands[color][bug] <= 0) continue;
    if (mustPlaceQueen && bug !== 'queen') continue;
    if (state.settings.tournamentOpening && state.placed[color] === 0 && bug === 'queen') {
      continue;
    }
    for (const cell of placementCells(state, color)) {
      actions.push({ type: 'place', bug, q: cell.q, r: cell.r });
    }
  }

  if (state.queenPlaced[color]) {
    for (const from of occupiedCoords(state)) {
      const tile = topAt(state, from);
      if (!tile || tile.owner !== color) continue;
      if (!removalKeepsHiveWhole(state, from)) continue;
      for (const to of rawDestinations(state, from, tile.bug)) {
        if (coordsEqual(from, to)) continue;
        if (!moveKeepsHiveWhole(state, from, to)) continue;
        actions.push({ type: 'move', from, to });
      }
    }
  }

  return actions;
}

export function actionsEqual(a: Action, b: Action): boolean {
  if (a.type === 'place' && b.type === 'place') {
    return a.bug === b.bug && a.q === b.q && a.r === b.r;
  }
  if (a.type === 'move' && b.type === 'move') {
    return coordsEqual(a.from, b.from) && coordsEqual(a.to, b.to);
  }
  return false;
}

function finishGame(state: GameState, winner: Color | null, reason: FinishReason): void {
  state.status = 'finished';
  state.winner = winner;
  state.finishReason = reason;
}

function checkQueens(state: GameState): void {
  const whiteSurrounded = isQueenSurrounded(state, 'white');
  const blackSurrounded = isQueenSurrounded(state, 'black');
  if (whiteSurrounded && blackSurrounded) {
    finishGame(state, null, 'stalemate');
  } else if (blackSurrounded) {
    finishGame(state, 'white', 'queen');
  } else if (whiteSurrounded) {
    finishGame(state, 'black', 'queen');
  }
}

function advanceTurn(state: GameState): void {
  if (state.status !== 'active') return;

  for (let i = 0; i < 2; i += 1) {
    if (getLegalActions(state).length > 0) return;

    state.passes += 1;
    const entry: HistoryEntry = {
      n: state.history.length + 1,
      player: state.turn,
      kind: 'pass',
      bug: null,
    };
    state.history.push(entry);
    state.lastMove = { player: state.turn, kind: 'pass', bug: null };

    if (state.passes >= 2) {
      finishGame(state, null, 'stalemate');
      return;
    }
    state.turn = opponent(state.turn);
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  const legal = getLegalActions(state).find((candidate) => actionsEqual(candidate, action));
  if (!legal) throw new IllegalMoveError('That move is not legal.');

  const next = cloneGame(state);
  const acting = next.turn;
  next.passes = 0;

  if (action.type === 'place') {
    if (next.hands[acting][action.bug] <= 0) throw new IllegalMoveError('No such tile in hand.');
    next.hands[acting][action.bug] -= 1;
    const tile: PlacedTile = {
      id: `t${next.nextTileId}`,
      owner: acting,
      bug: action.bug,
    };
    next.nextTileId += 1;
    const key = coordKey({ q: action.q, r: action.r });
    next.cells[key] = [...(next.cells[key] ?? []), tile];
    next.placed[acting] += 1;
    if (action.bug === 'queen') next.queenPlaced[acting] = true;
    next.history.push({
      n: next.history.length + 1,
      player: acting,
      kind: 'place',
      bug: action.bug,
      to: { q: action.q, r: action.r },
    });
    next.lastMove = {
      player: acting,
      kind: 'place',
      bug: action.bug,
      to: { q: action.q, r: action.r },
    };
  } else {
    const fromKey = coordKey(action.from);
    const toKey = coordKey(action.to);
    const stack = next.cells[fromKey];
    if (!stack || stack.length === 0) throw new IllegalMoveError('There is no piece to move.');
    const tile = stack[stack.length - 1];
    const remaining = stack.slice(0, -1);
    if (remaining.length > 0) next.cells[fromKey] = remaining;
    else delete next.cells[fromKey];
    next.cells[toKey] = [...(next.cells[toKey] ?? []), tile];
    next.history.push({
      n: next.history.length + 1,
      player: acting,
      kind: 'move',
      bug: tile.bug,
      from: action.from,
      to: action.to,
    });
    next.lastMove = {
      player: acting,
      kind: 'move',
      bug: tile.bug,
      from: action.from,
      to: action.to,
    };
  }

  next.moveNumber += 1;
  next.turn = opponent(acting);
  checkQueens(next);
  advanceTurn(next);
  return next;
}

export function resignGame(state: GameState, color: Color): GameState {
  const next = cloneGame(state);
  finishGame(next, opponent(color), 'resign');
  next.history.push({
    n: next.history.length + 1,
    player: color,
    kind: 'pass',
    bug: null,
  });
  return next;
}

/** Cells containing a movable piece for the current player. */
export function movableCells(state: GameState): Coord[] {
  const cells = new Map<string, Coord>();
  for (const action of getLegalActions(state)) {
    if (action.type === 'move') cells.set(coordKey(action.from), action.from);
  }
  return [...cells.values()];
}

export function actionKey(action: Action): string {
  return action.type === 'place'
    ? `p:${action.bug}:${action.q},${action.r}`
    : `m:${action.from.q},${action.from.r}:${action.to.q},${action.to.r}`;
}

export function handCount(hand: Hand): number {
  return BUGS.reduce((sum, bug) => sum + hand[bug], 0);
}

export function describeHistory(entry: HistoryEntry): string {
  const player = entry.player === 'white' ? 'White' : 'Black';
  if (entry.kind === 'pass') return `${player}'s turn was passed — no legal move`;
  const name = entry.bug ? BUG_META[entry.bug].name : 'piece';
  if (entry.kind === 'place') return `${player} placed ${name}`;
  return `${player} moved ${name}`;
}
