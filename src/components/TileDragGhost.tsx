import { createPortal } from 'react-dom';
import type { TileDrag } from '../lib/useTileDrag';
import { TileVisual } from './HexTile';

/**
 * The tile that follows the pointer while dragging. It is portalled to the
 * document body so no board or panel transform can clip or reposition it.
 */
export function TileDragGhost({ drag }: { drag: TileDrag }) {
  return createPortal(
    <div
      ref={drag.ghostRef}
      className={`tile-drag-ghost ${drag.tile ? 'is-active' : ''}`}
      aria-hidden="true"
    >
      {drag.tile ? <TileVisual owner={drag.tile.owner} bug={drag.tile.bug} size={86} /> : null}
    </div>,
    document.body,
  );
}
