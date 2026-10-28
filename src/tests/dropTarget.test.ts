import { describe, expect, it } from 'vitest';
import { dropTargets, nearestDropTarget } from '../lib/dropTarget';
import type { DragPayload } from '../lib/dropTarget';
import type { Action } from '../types';

const HEX = 50;
const STEP_X = HEX * Math.sqrt(3);
const STEP_Y = HEX * 1.5;

const ACTIONS: Action[] = [
  { type: 'place', bug: 'ant', q: 0, r: 0 },
  { type: 'place', bug: 'ant', q: 1, r: 0 },
  { type: 'place', bug: 'queen', q: 0, r: 1 },
  { type: 'move', from: { q: 0, r: 0 }, to: { q: 0, r: -1 } },
  { type: 'move', from: { q: 0, r: 0 }, to: { q: 1, r: -1 } },
  { type: 'move', from: { q: 2, r: 0 }, to: { q: 2, r: 1 } },
  // A move that ends where it started must never be a drop target.
  { type: 'move', from: { q: 0, r: 0 }, to: { q: 0, r: 0 } },
];

const handAnt: DragPayload = { kind: 'bug', bug: 'ant', owner: 'white' };
const handQueen: DragPayload = { kind: 'bug', bug: 'queen', owner: 'white' };
const boardPiece: DragPayload = {
  kind: 'cell',
  coord: { q: 0, r: 0 },
  bug: 'ant',
  owner: 'white',
};

describe('dropTargets', () => {
  it('offers every legal placement for the dragged bug only', () => {
    const targets = dropTargets(ACTIONS, handAnt, HEX);
    expect(targets.map((target) => target.key)).toEqual(['0,0', '1,0']);
    expect(targets[0].action).toMatchObject({ type: 'place', bug: 'ant', q: 0, r: 0 });
    expect(targets[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('converts coordinates to board pixels for the current hex size', () => {
    const [origin, east] = dropTargets(ACTIONS, handAnt, HEX);
    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(0);
    expect(east.x).toBeCloseTo(STEP_X);
    expect(east.y).toBeCloseTo(0);
  });

  it('offers only moves that start on the dragged piece', () => {
    const targets = dropTargets(ACTIONS, boardPiece, HEX);
    expect(targets.map((target) => target.key)).toEqual(['0,-1', '1,-1']);
    expect(targets.every((target) => target.action.type === 'move')).toBe(true);
  });

  it('returns nothing when the bug has no legal placement', () => {
    expect(dropTargets([], handQueen, HEX)).toEqual([]);
    expect(
      dropTargets(
        ACTIONS.filter((action) => action.type === 'move'),
        handAnt,
        HEX,
      ),
    ).toEqual([]);
  });
});

describe('nearestDropTarget', () => {
  const targets = dropTargets(ACTIONS, handAnt, HEX);

  it('snaps to the closest target inside the radius', () => {
    const snapped = nearestDropTarget({ x: STEP_X + 18, y: 14 }, targets, HEX * 0.95);
    expect(snapped?.key).toBe('1,0');
  });

  it('rejects points outside the radius', () => {
    expect(nearestDropTarget({ x: STEP_X + 120, y: 0 }, targets, HEX * 0.95)).toBeNull();
  });

  it('treats the radius as inclusive', () => {
    const radius = HEX * 0.95;
    expect(nearestDropTarget({ x: -radius, y: 0 }, targets, radius)?.key).toBe('0,0');
    expect(nearestDropTarget({ x: -radius - 0.01, y: 0 }, targets, radius)).toBeNull();
  });

  it('handles an empty target list', () => {
    expect(nearestDropTarget({ x: 0, y: 0 }, [], 50)).toBeNull();
  });
});
