import { coordKey, hexToPixel } from '../../shared/hex';
import type { Action, Bug, Color, Coord } from '../types';

/**
 * A tile being dragged: either a fresh tile from the rack or one that is
 * already sitting on the board.
 */
export type DragPayload =
  | { kind: 'bug'; bug: Bug; owner: Color }
  | { kind: 'cell'; coord: Coord; bug: Bug; owner: Color };

/** A legal landing spot for the dragged tile, in board pixels. */
export interface DropTarget {
  key: string;
  coord: Coord;
  action: Action;
  x: number;
  y: number;
}

/** The geometry API a board exposes to the drag hook. */
export interface BoardHitTest {
  hitTest(clientX: number, clientY: number, payload: DragPayload): DropTarget | null;
}

/** Every legal destination for `payload`, converted to board pixels. */
export function dropTargets(
  legalActions: Action[],
  payload: DragPayload,
  hexSize: number,
): DropTarget[] {
  const targets: DropTarget[] = [];

  for (const action of legalActions) {
    if (action.type === 'place') {
      if (payload.kind !== 'bug' || action.bug !== payload.bug) continue;
      const coord = { q: action.q, r: action.r };
      const { x, y } = hexToPixel(coord, hexSize);
      targets.push({ key: coordKey(coord), coord, action, x, y });
    } else {
      if (payload.kind !== 'cell') continue;
      if (action.from.q !== payload.coord.q || action.from.r !== payload.coord.r) continue;
      if (action.to.q === payload.coord.q && action.to.r === payload.coord.r) continue;
      const { x, y } = hexToPixel(action.to, hexSize);
      targets.push({ key: coordKey(action.to), coord: action.to, action, x, y });
    }
  }

  return targets;
}

/**
 * The closest legal destination to a point, provided it is within
 * `maxDistance` board units. Cells are spaced at least 75 units apart at the
 * board's own size, so a threshold just under one hex radius is unambiguous.
 */
export function nearestDropTarget(
  point: { x: number; y: number },
  targets: DropTarget[],
  maxDistance: number,
): DropTarget | null {
  let best: DropTarget | null = null;
  let bestDistance = Infinity;

  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= maxDistance && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }

  return best;
}
