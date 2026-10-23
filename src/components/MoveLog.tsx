import { useEffect, useRef } from 'react';
import type { Color, HistoryEntry, User } from '../types';
import { BUG_META } from '../../shared/types';

function playerLabel(
  color: Color,
  viewerColor: Color | null,
  players: { white: User | null; black: User | null },
): string {
  if (viewerColor === color) return 'You';
  const name = players[color]?.username;
  if (name) return name;
  return color === 'white' ? 'Ivory' : 'Onyx';
}

export function MoveLog({
  history,
  players,
  viewerColor,
}: {
  history: HistoryEntry[];
  players: { white: User | null; black: User | null };
  viewerColor: Color | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [history.length]);

  return (
    <div className="move-log">
      <div className="panel-subhead">
        <span>Move log</span>
        <span className="muted">{history.length} actions</span>
      </div>
      <div className="move-log-body" ref={bodyRef}>
        {history.length === 0 ? (
          <p className="log-empty">The hive is waiting for its first tile.</p>
        ) : (
          history.map((entry) => {
            const label = playerLabel(entry.player, viewerColor, players);
            let text = '';
            if (entry.kind === 'pass') text = 'had no legal move — turn passed';
            else if (entry.kind === 'place' && entry.bug)
              text = `placed ${BUG_META[entry.bug].name}`;
            else if (entry.bug) text = `moved ${BUG_META[entry.bug].name}`;
            return (
              <div className={`log-row ${entry.kind === 'pass' ? 'is-pass' : ''}`} key={entry.n}>
                <span className="log-n">{entry.n}</span>
                <span className={`log-dot log-dot-${entry.player}`} />
                <span className="log-text">
                  <strong>{label}</strong> {text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
