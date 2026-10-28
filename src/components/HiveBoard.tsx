import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { Action, Bug, Color, GameState, Position } from '../types';
import { coordKey, hexCorners, hexToPixel, parseKey } from '../../shared/hex';
import { heightAt, queenCoord, topAt } from '../../shared/hive/engine';
import { BUG_META } from '../../shared/types';
import type { BoardHitTest, DragPayload } from '../lib/dropTarget';
import { dropTargets, nearestDropTarget } from '../lib/dropTarget';
import { useMediaQuery } from '../lib/useMediaQuery';
import { BoardTile, BOARD_HEX_SIZE, HexOutline, HexRing } from './HexTile';

interface HiveBoardProps {
  state: GameState;
  legalActions: Action[];
  color: Color;
  canAct: boolean;
  selection: Position;
  onSelectionChange: (selection: Position) => void;
  onAction: (action: Action) => void;
  className?: string;
  /** Exposes board geometry to the drag hook. */
  dragRef?: Ref<BoardHitTest>;
  /** Cell the drag hook has snapped to, overriding the mouse hover. */
  previewKey?: string | null;
  /** Called on pointerdown over a movable piece. */
  onPieceDragStart?: (payload: DragPayload, event: ReactPointerEvent) => void;
  /** True once, when the click that follows a drag should be ignored. */
  consumeDragClick?: () => boolean;
  /** Set when the game is over; the loser's queen falls before the modal opens. */
  finishWinner?: Color | null;
  /**
   * Keeps the finish effect running - the queen falls once, then the shockwave
   * and shards loop - for as long as this stays true. The parent releases it
   * when the result modal is allowed to open.
   */
  finishHold?: boolean;
}

/** How far from a legal cell centre a drop still counts, in board units. */
const DROP_RADIUS = BOARD_HEX_SIZE * 0.95;

/** Six chips of the shattered queen, thrown outwards at 60° intervals. */
const FINISH_SHARDS = Array.from({ length: 6 }, (_, index) => {
  const angle = (Math.PI / 3) * index + Math.PI / 6;
  return {
    dx: Math.cos(angle) * BOARD_HEX_SIZE * 1.9,
    dy: Math.sin(angle) * BOARD_HEX_SIZE * 1.9,
    spin: index % 2 === 0 ? 220 : -180,
  };
});

interface PlacedCell {
  key: string;
  q: number;
  r: number;
  x: number;
  y: number;
  stack: GameState['cells'][string];
}

function sameCoord(a: { q: number; r: number }, b: { q: number; r: number }): boolean {
  return a.q === b.q && a.r === b.r;
}

export function HiveBoard({
  state,
  legalActions,
  color,
  canAct,
  selection,
  onSelectionChange,
  onAction,
  className = '',
  dragRef,
  previewKey = null,
  onPieceDragStart,
  consumeDragClick,
  finishWinner = null,
  finishHold = false,
}: HiveBoardProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const [falling, setFalling] = useState<Color | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastMoveNumber = useRef(state.moveNumber);
  const gradientId = `board-glow-${useId().replaceAll(':', '')}`;
  const narrow = useMediaQuery('(max-width: 720px)');
  const short = useMediaQuery('(max-height: 540px)');
  // Narrow screens and short landscape tables each need their own framing so the
  // tiles stay finger-sized. The desktop frame keeps more breathing room.
  const frame = narrow ? 'phone' : short ? 'short' : 'wide';

  const cells = useMemo<PlacedCell[]>(
    () =>
      Object.entries(state.cells)
        .filter(([, stack]) => stack.length > 0)
        .map(([key, stack]) => {
          const { q, r } = parseKey(key);
          const { x, y } = hexToPixel({ q, r }, BOARD_HEX_SIZE);
          return { key, q, r, x, y, stack };
        }),
    [state.cells],
  );

  const selectedCoord = selection?.kind === 'cell' ? selection.coord : null;

  const placementActions = useMemo(() => {
    const map = new Map<string, Extract<Action, { type: 'place' }>>();
    if (selection?.kind !== 'bug' || !canAct) return map;
    for (const action of legalActions) {
      if (action.type === 'place' && action.bug === selection.bug) {
        map.set(coordKey({ q: action.q, r: action.r }), action);
      }
    }
    return map;
  }, [legalActions, selection, canAct]);

  const moveActions = useMemo(() => {
    const map = new Map<string, Extract<Action, { type: 'move' }>>();
    if (!selectedCoord || !canAct) return map;
    for (const action of legalActions) {
      if (
        action.type === 'move' &&
        sameCoord(action.from, selectedCoord) &&
        !sameCoord(action.to, selectedCoord)
      ) {
        map.set(coordKey(action.to), action);
      }
    }
    return map;
  }, [legalActions, selectedCoord, canAct]);

  const movable = useMemo(() => {
    const set = new Set<string>();
    if (!canAct) return set;
    for (const action of legalActions) {
      if (action.type === 'move') set.add(coordKey(action.from));
    }
    return set;
  }, [legalActions, canAct]);

  const hitTest = useCallback(
    (clientX: number, clientY: number, payload: DragPayload) => {
      if (!canAct) return null;
      const svg = svgRef.current;
      if (!svg) return null;
      const matrix = svg.getScreenCTM();
      if (!matrix) return null;

      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(matrix.inverse());

      return nearestDropTarget(
        local,
        dropTargets(legalActions, payload, BOARD_HEX_SIZE),
        DROP_RADIUS,
      );
    },
    [canAct, legalActions],
  );

  useImperativeHandle(dragRef, () => ({ hitTest }), [hitTest]);

  // The defeated queen falls once and the shockwave/shard effect loops for as
  // long as the parent holds the result modal back. Releasing the hold puts the
  // board straight again, so the modal opens onto a clean board.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!finishWinner || !finishHold) {
      setFalling(null);
      return;
    }
    const loser: Color = finishWinner === 'white' ? 'black' : 'white';
    if (!queenCoord(stateRef.current, loser)) return;
    setFalling(loser);
  }, [finishWinner, finishHold]);

  const fallingQueen = falling ? queenCoord(state, falling) : null;
  const fallingPixel = fallingQueen ? hexToPixel(fallingQueen, BOARD_HEX_SIZE) : null;
  const fallingKey = fallingQueen ? coordKey(fallingQueen) : null;

  // Pop the tile that just arrived, but never on the initial render.
  useEffect(() => {
    if (state.moveNumber === lastMoveNumber.current) return;
    lastMoveNumber.current = state.moveNumber;
    const to = state.lastMove?.to;
    if (!to) return;
    setLandedKey(coordKey(to));
    const timer = window.setTimeout(() => setLandedKey(null), 380);
    return () => window.clearTimeout(timer);
  }, [state.moveNumber, state.lastMove]);

  const emptyNeighbours = useMemo(() => {
    if (cells.length === 0) return [];
    const set = new Map<string, { x: number; y: number }>();
    const occupied = new Set(cells.map((cell) => cell.key));
    for (const cell of cells) {
      for (const direction of [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ]) {
        const q = cell.q + direction.q;
        const r = cell.r + direction.r;
        const key = coordKey({ q, r });
        if (!occupied.has(key)) {
          const { x, y } = hexToPixel({ q, r }, BOARD_HEX_SIZE);
          set.set(key, { x, y });
        }
      }
    }
    return [...set.entries()].map(([key, value]) => ({ key, ...value }));
  }, [cells]);

  const viewBox = useMemo(() => {
    if (cells.length === 0) {
      if (frame === 'phone') return { x: -205, y: -180, w: 410, h: 360 };
      if (frame === 'short') return { x: -260, y: -173, w: 520, h: 346 };
      return { x: -390, y: -310, w: 780, h: 620 };
    }
    const xs = cells.map((cell) => cell.x);
    const ys = cells.map((cell) => cell.y);
    const padX = frame === 'phone' ? 76 : frame === 'short' ? 90 : 120;
    const padY = frame === 'phone' ? 66 : frame === 'short' ? 70 : 110;
    const minX = Math.min(...xs) - padX;
    const maxX = Math.max(...xs) + padX;
    const minY = Math.min(...ys) - padY;
    const maxY = Math.max(...ys) + padY;
    let w = Math.max(frame === 'phone' ? 380 : frame === 'short' ? 520 : 600, maxX - minX);
    let h = Math.max(frame === 'phone' ? 332 : frame === 'short' ? 347 : 500, maxY - minY);
    const ratio = frame === 'phone' ? 1.14 : frame === 'short' ? 1.5 : 1.42;
    if (w / h > ratio) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [cells, frame]);

  const selectedTile =
    selectedCoord && state.cells[coordKey(selectedCoord)]
      ? state.cells[coordKey(selectedCoord)][state.cells[coordKey(selectedCoord)].length - 1]
      : null;

  const ghostKey = previewKey ?? hovered;
  const hoveredCoord = ghostKey ? parseKey(ghostKey) : null;
  const hoveredPixel = hoveredCoord ? hexToPixel(hoveredCoord, BOARD_HEX_SIZE) : null;
  const ghost =
    selection?.kind === 'bug' && ghostKey && placementActions.has(ghostKey)
      ? { owner: color, bug: selection.bug }
      : selection?.kind === 'cell' &&
          ghostKey &&
          moveActions.has(ghostKey) &&
          selectedTile
        ? { owner: selectedTile.owner, bug: selectedTile.bug }
        : null;

  const dangers = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number }> = [];
    for (const owner of ['white', 'black'] as Color[]) {
      const coord = queenCoord(state, owner);
      if (!coord) continue;
      let occupiedNeighbours = 0;
      for (const direction of [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ]) {
        if (heightAt(state, { q: coord.q + direction.q, r: coord.r + direction.r }) > 0) {
          occupiedNeighbours += 1;
        }
      }
      if (occupiedNeighbours >= 5) {
        const { x, y } = hexToPixel(coord, BOARD_HEX_SIZE);
        list.push({ key: coordKey(coord), x, y });
      }
    }
    return list;
  }, [state]);

  const handleCellClick = (key: string) => {
    if (!canAct) return;
    if (consumeDragClick?.()) return;
    const coord = parseKey(key);

    const move = moveActions.get(key);
    if (move) {
      onAction(move);
      onSelectionChange(null);
      return;
    }

    const place = placementActions.get(key);
    if (place) {
      onAction(place);
      onSelectionChange(null);
      return;
    }

    const top = topAt(state, coord);
    if (top?.owner === color && movable.has(key)) {
      if (selection?.kind === 'cell' && sameCoord(selection.coord, coord)) {
        onSelectionChange(null);
      } else {
        onSelectionChange({ kind: 'cell', coord: { q: coord.q, r: coord.r } });
      }
      return;
    }

    onSelectionChange(null);
  };

  const hitKeys = new Set<string>();
  for (const cell of cells) hitKeys.add(cell.key);
  for (const key of placementActions.keys()) hitKeys.add(key);
  for (const key of moveActions.keys()) hitKeys.add(key);

  const last = state.lastMove;

  return (
    <div className={`hive-board ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className={`board-svg ${canAct ? 'is-live' : ''}`}
        role="application"
        aria-label="Hive game board"
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#31452f" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#1a261e" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0b100d" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.w}
          height={viewBox.h}
          fill={`url(#${gradientId})`}
        />

        {cells.length === 0 ? (
          <>
            <polygon
              points={hexCorners(0, 0, BOARD_HEX_SIZE - 4)}
              className="start-hex"
            />
            <text x={0} y={frame === 'wide' ? 110 : 88} textAnchor="middle" className="board-empty-title">
              The hive begins here
            </text>
            <text x={0} y={frame === 'wide' ? 140 : 118} textAnchor="middle" className="board-empty-sub">
              {canAct ? 'Place your first tile to open the game' : 'Waiting for the first tile'}
            </text>
          </>
        ) : null}

        {emptyNeighbours.map((cell) => (
          <HexOutline
            key={`ghost-${cell.key}`}
            x={cell.x}
            y={cell.y}
            radius={BOARD_HEX_SIZE - 3}
            className="empty-cell"
          />
        ))}

        {cells.map((cell) => (
          <g
            key={cell.key}
            className={
              [
                landedKey === cell.key ? 'board-tile-landed' : '',
                fallingKey === cell.key ? 'board-tile-defeated' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            {cell.stack.map((tile, index) => (
              <BoardTile
                key={tile.id}
                owner={tile.owner}
                bug={tile.bug}
                x={cell.x}
                y={cell.y}
                depth={cell.stack.length - 1 - index}
                dimmed={cell.stack.length > 1 && index < cell.stack.length - 1}
              />
            ))}
          </g>
        ))}

        {cells.map((cell) => {
          const top = cell.stack[cell.stack.length - 1];
          const isSelected = selectedCoord ? coordKey(selectedCoord) === cell.key : false;
          const isLastTo = last?.to ? coordKey(last.to) === cell.key : false;
          const isLastFrom = last?.from ? coordKey(last.from) === cell.key : false;
          const danger = dangers.some((item) => item.key === cell.key);
          return (
            <g key={`decor-${cell.key}`}>
              {movable.has(cell.key) && canAct ? (
                <HexRing x={cell.x} y={cell.y} radius={BOARD_HEX_SIZE - 2} className="movable-ring" />
              ) : null}
              {isLastTo ? (
                <HexRing x={cell.x} y={cell.y} radius={BOARD_HEX_SIZE - 1} className="last-ring" />
              ) : null}
              {isLastFrom ? (
                <HexRing x={cell.x} y={cell.y} radius={BOARD_HEX_SIZE + 2} className="last-from-ring" />
              ) : null}
              {isSelected ? (
                <HexRing x={cell.x} y={cell.y} radius={BOARD_HEX_SIZE + 4} className="selected-ring" />
              ) : null}
              {danger ? (
                <HexRing x={cell.x} y={cell.y} radius={BOARD_HEX_SIZE + 3} className="danger-ring" />
              ) : null}
              {cell.stack.length > 1 ? (
                <g className="stack-badge" transform={`translate(${cell.x + 27} ${cell.y + 33})`}>
                  <circle r="12" />
                  <text textAnchor="middle" dy="4">
                    {cell.stack.length}
                  </text>
                </g>
              ) : null}
              <title>{`${top.owner === 'white' ? 'White' : 'Black'} ${BUG_META[top.bug].name}${
                cell.stack.length > 1 ? ` (stack of ${cell.stack.length})` : ''
              }`}</title>
            </g>
          );
        })}

        {falling && fallingPixel ? (
          <g className="finish-fx" aria-hidden="true">
            <circle
              cx={fallingPixel.x}
              cy={fallingPixel.y}
              r={BOARD_HEX_SIZE * 0.82}
              className="finish-shockwave"
            />
            <circle
              cx={fallingPixel.x}
              cy={fallingPixel.y}
              r={BOARD_HEX_SIZE * 0.82}
              className="finish-shockwave is-late"
            />
            {FINISH_SHARDS.map((shard, index) => (
              <g
                key={`shard-${index}`}
                transform={`translate(${fallingPixel.x} ${fallingPixel.y}) rotate(${index * 60}) translate(${BOARD_HEX_SIZE * 0.62} 0)`}
              >
                <polygon
                  points="-9,-5 10,0 -9,5"
                  className="finish-shard"
                  style={
                    {
                      '--shard-dx': `${shard.dx}px`,
                      '--shard-dy': `${shard.dy}px`,
                      '--shard-spin': `${shard.spin}deg`,
                    } as CSSProperties
                  }
                />
              </g>
            ))}
          </g>
        ) : null}

        {[...placementActions.entries()].map(([key, action]) => {
          const { x, y } = hexToPixel({ q: action.q, r: action.r }, BOARD_HEX_SIZE);
          return (
            <g
              key={`place-${key}`}
              className={`placement-marker ${previewKey === key ? 'is-snapped' : ''}`}
            >
              <polygon
                points={hexCorners(x, y, BOARD_HEX_SIZE - 3)}
                className="placement-fill"
              />
              <circle cx={x} cy={y} r={4.5} className="placement-dot" />
            </g>
          );
        })}

        {[...moveActions.entries()].map(([key, action]) => {
          const { x, y } = hexToPixel(action.to, BOARD_HEX_SIZE);
          return (
            <g
              key={`move-${key}`}
              className={`move-marker ${previewKey === key ? 'is-snapped' : ''}`}
            >
              <circle cx={x} cy={y} r={22} className="move-halo" />
              <circle cx={x} cy={y} r={7} className="move-dot" />
            </g>
          );
        })}

        {ghost && hoveredPixel ? (
          <g className="ghost-tile">
            <BoardTile
              owner={ghost.owner}
              bug={ghost.bug}
              x={hoveredPixel.x}
              y={hoveredPixel.y}
              ghost
            />
          </g>
        ) : null}

        {canAct ? (
          <g className="hit-layer">
            {[...hitKeys].map((key) => {
              const coord = parseKey(key);
              const { x, y } = hexToPixel(coord, BOARD_HEX_SIZE);
              const actionable =
                moveActions.has(key) || placementActions.has(key) || movable.has(key);
              return (
                <g
                  key={`hit-${key}`}
                  className={`cell-hit ${actionable ? 'is-actionable' : ''}`}
                  role="button"
                  tabIndex={actionable ? 0 : -1}
                  aria-label={`Cell ${key}`}
                  onClick={() => handleCellClick(key)}
                  onPointerDown={(event) => {
                    if (!canAct || !onPieceDragStart) return;
                    if (!event.isPrimary || event.button !== 0) return;
                    const top = topAt(state, coord);
                    if (top?.owner !== color || !movable.has(key)) return;
                    onPieceDragStart(
                      {
                        kind: 'cell',
                        coord: { q: coord.q, r: coord.r },
                        owner: top.owner,
                        bug: top.bug,
                      },
                      event,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCellClick(key);
                    }
                  }}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered((value) => (value === key ? null : value))}
                  onFocus={() => setHovered(key)}
                  onBlur={() => setHovered((value) => (value === key ? null : value))}
                >
                  <polygon points={hexCorners(x, y, BOARD_HEX_SIZE - 1)} fill="transparent" />
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
