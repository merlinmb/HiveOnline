import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Position } from '../types';
import type { Action } from '../types';
import type { BoardHitTest, DragPayload } from './dropTarget';

/**
 * Pointer distance that separates a click from a drag. Touch needs a little
 * more slack because fingers wobble on the way down.
 */
const MOUSE_THRESHOLD = 7;
const TOUCH_THRESHOLD = 12;

interface DragSession {
  payload: DragPayload;
  pointerId: number;
  startX: number;
  startY: number;
  activated: boolean;
}

export interface TileDrag {
  /** Call from pointerdown on a rack card or a movable board piece. */
  beginDrag: (payload: DragPayload, event: ReactPointerEvent) => void;
  /** True when the click that follows a drag should be ignored. */
  consumeDragClick: () => boolean;
  /** Cell key under the pointer, used by the board's snap preview. */
  previewKey: string | null;
  ghostRef: RefObject<HTMLDivElement | null>;
  /** The tile to draw under the pointer, or null when nothing is dragging. */
  tile: { owner: DragPayload['owner']; bug: DragPayload['bug'] } | null;
}

interface TileDragOptions {
  enabled: boolean;
  boardRef: RefObject<BoardHitTest | null>;
  onAction: (action: Action) => void;
  onSelect: (position: Position) => void;
}

function selectionFor(payload: DragPayload): Position {
  return payload.kind === 'bug'
    ? { kind: 'bug', bug: payload.bug }
    : { kind: 'cell', coord: payload.coord };
}

/**
 * Drag and drop for Hive tiles.
 *
 * A gesture only becomes a drag once the pointer has travelled far enough;
 * everything shorter stays a click so the existing select-then-place flow is
 * completely untouched. While dragging, the hovered legal cell is mirrored
 * into `previewKey`, which the board already knows how to render as a snapped
 * ghost tile.
 */
export function useTileDrag({
  enabled,
  boardRef,
  onAction,
  onSelect,
}: TileDragOptions): TileDrag {
  const [dragged, setDragged] = useState<DragPayload | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const positionGhost = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y };
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  }, []);

  // The ghost only mounts with the drag state, so place it on the very first
  // frame after activation; later moves are written straight to the DOM.
  useLayoutEffect(() => {
    if (!dragged) {
      ghostRef.current?.classList.remove('is-snapped');
      return;
    }
    if (pointerRef.current) positionGhost(pointerRef.current.x, pointerRef.current.y);
  }, [dragged, positionGhost]);

  const finish = useCallback(
    (event: PointerEvent | null, cancelled: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      if (event && event.pointerId !== session.pointerId) return;

      const target =
        !cancelled && session.activated && event
          ? (boardRef.current?.hitTest(event.clientX, event.clientY, session.payload) ?? null)
          : null;

      sessionRef.current = null;
      detachRef.current?.();
      detachRef.current = null;
      pointerRef.current = null;
      setDragged(null);
      setPreviewKey(null);
      ghostRef.current?.classList.remove('is-snapped');
      document.body.classList.remove('is-tile-dragging');

      if (target) onAction(target.action);

      if (session.activated) {
        // The browser fires click immediately after pointerup. Swallow that
        // one click, then make sure a stale flag can never eat a later press.
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    },
    [boardRef, onAction],
  );

  const beginDrag = useCallback(
    (payload: DragPayload, event: ReactPointerEvent) => {
      if (!enabledRef.current) return;
      if (!event.isPrimary || event.button !== 0) return;
      if (sessionRef.current) return;

      suppressClickRef.current = false;
      const session: DragSession = {
        payload,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        activated: false,
      };
      sessionRef.current = session;
      pointerRef.current = { x: event.clientX, y: event.clientY };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== session.pointerId) return;

        if (!session.activated) {
          const threshold =
            moveEvent.pointerType === 'touch' ? TOUCH_THRESHOLD : MOUSE_THRESHOLD;
          const moved = Math.hypot(
            moveEvent.clientX - session.startX,
            moveEvent.clientY - session.startY,
          );
          if (moved < threshold) return;

          session.activated = true;
          suppressClickRef.current = true;
          document.body.classList.add('is-tile-dragging');
          setDragged(session.payload);
          onSelect(selectionFor(session.payload));
        }

        positionGhost(moveEvent.clientX, moveEvent.clientY);
        const key =
          boardRef.current?.hitTest(moveEvent.clientX, moveEvent.clientY, session.payload)?.key ??
          null;
        setPreviewKey((current) => (current === key ? current : key));
        ghostRef.current?.classList.toggle('is-snapped', key !== null);
      };

      const onUp = (upEvent: PointerEvent) => finish(upEvent, false);
      const onCancel = () => finish(null, true);
      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') finish(null, true);
      };
      const onBlur = () => finish(null, true);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('blur', onBlur);

      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('blur', onBlur);
      };
    },
    [boardRef, finish, onSelect, positionGhost],
  );

  const consumeDragClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
      document.body.classList.remove('is-tile-dragging');
    },
    [],
  );

  return {
    beginDrag,
    consumeDragClick,
    previewKey,
    ghostRef,
    tile: dragged ? { owner: dragged.owner, bug: dragged.bug } : null,
  };
}
