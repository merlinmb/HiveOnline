import type { Color, Hand, User } from '../types';
import { BugIcon } from './BugIcon';
import { HandSummary } from './HandRack';
import { PlayerAvatar } from './PlayerAvatar';
import { Badge } from './Ui';

export function StatusDot({ active }: { active: boolean }) {
  return <span className={`turn-dot ${active ? 'is-active' : ''}`} aria-hidden="true" />;
}

export function PlayerCard({
  player,
  color,
  isYou,
  active,
  queenPlaced,
  hand,
  winner,
  waitingLabel = 'Waiting for a challenger',
}: {
  player: User | null;
  color: Color;
  isYou: boolean;
  active: boolean;
  queenPlaced: boolean;
  hand: Hand | null;
  winner?: boolean;
  waitingLabel?: string;
}) {
  return (
    <div className={`player-card player-card-${color} ${active ? 'is-active' : ''} ${winner ? 'is-winner' : ''}`}>
      <div className="player-card-top">
        <span className={`color-chip color-chip-${color}`} />
        <span className="player-color-label">{color === 'white' ? 'Ivory' : 'Onyx'}</span>
        {isYou ? <Badge tone="gold">You</Badge> : null}
        {player?.isGuest ? <Badge tone="muted">Guest</Badge> : null}
        {active ? (
          <span className="to-move">
            <StatusDot active />
            To move
          </span>
        ) : null}
      </div>

      <div className="player-card-main">
        {player ? (
          <>
            <PlayerAvatar name={player.username} size={44} isGuest={player.isGuest} />
            <div className="player-identity">
              <div className="player-name">{player.username}</div>
              <div className="player-meta">
                <span className="rating-value">{player.rating}</span>
                <span className="meta-sep">·</span>
                <span>
                  {player.rankedGames > 0
                    ? `${player.wins}W ${player.losses}L`
                    : 'Unranked'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="avatar avatar-empty" aria-hidden="true">
              ?
            </span>
            <div className="player-identity">
              <div className="player-name muted">{waitingLabel}</div>
              <div className="player-meta">Invite a friend with the table code</div>
            </div>
          </>
        )}
      </div>

      <div className="player-card-foot">
        <span className={`queen-status ${queenPlaced ? 'is-placed' : 'is-waiting'}`}>
          <BugIcon bug="queen" size={16} />
          {queenPlaced ? 'Queen placed' : 'Queen in hand'}
        </span>
        {hand ? <HandSummary hand={hand} color={color} /> : null}
      </div>
    </div>
  );
}
