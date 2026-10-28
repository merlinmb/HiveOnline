import { useEffect, useState } from 'react';
import type { Color } from '../types';

/**
 * How long the defeated queen's fall runs, and how long its shockwave keeps
 * looping, before the result modal may open. The fall itself takes 1.3s; the
 * shockwave and shard burst then repeat on a 1.2s cycle, so this is set to two
 * whole cycles after the fall to cut on a clean frame.
 */
export const FINISH_ANIMATION_MS = 2400;

/** True once the result modal is allowed to open. */
export function useResultReveal(finished: boolean, animate: boolean): boolean {
  // The reveal is derived during render so a game that ends while we watch
  // never flashes the modal open for a frame before the animation starts.
  const [state, setState] = useState({
    finished,
    animate,
    revealed: !finished || !animate,
  });

  if (state.finished !== finished || state.animate !== animate) {
    setState({ finished, animate, revealed: !finished || !animate });
  }

  useEffect(() => {
    if (!finished || !animate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState((prev) => ({ ...prev, revealed: true }));
      return;
    }
    const timer = window.setTimeout(
      () => setState((prev) => ({ ...prev, revealed: true })),
      FINISH_ANIMATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [finished, animate]);

  return state.finished === finished && state.animate === animate
    ? state.revealed
    : !finished || !animate;
}

/** The colour that lost the game, or null for a draw. */
export function loserOf(winner: Color | null | undefined): Color | null {
  if (!winner) return null;
  return winner === 'white' ? 'black' : 'white';
}
