import type { Bug, Color, Hand } from '../../shared/types';
import { BUGS, BUG_META } from '../../shared/types';
import { BugIcon } from './BugIcon';
import { TileVisual } from './HexTile';

export function HandRack({
  hand,
  color,
  selected,
  onSelect,
  disabled = false,
  label = 'Your tiles',
}: {
  hand: Hand;
  color: Color;
  selected: Bug | null;
  onSelect: (bug: Bug) => void;
  disabled?: boolean;
  label?: string;
}) {
  const available = BUGS.filter((bug) => hand[bug] > 0);
  const total = available.reduce((sum, bug) => sum + hand[bug], 0);

  return (
    <div className={`hand-rack ${disabled ? 'is-disabled' : ''}`}>
      <div className="hand-head">
        <div className="hand-title">
          <span className={`color-chip color-chip-${color}`} />
          {label}
        </div>
        <div className="hand-count">{total} left</div>
      </div>
      {available.length === 0 ? (
        <div className="hand-empty">All of your tiles are on the board.</div>
      ) : (
        <div className="hand-cards">
          {available.map((bug) => {
            const count = hand[bug];
            const isSelected = selected === bug;
            return (
              <button
                key={bug}
                type="button"
                className={`hand-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelect(bug)}
                disabled={disabled}
                aria-pressed={isSelected}
                title={BUG_META[bug].move}
              >
                <span className="hand-card-art">
                  <TileVisual owner={color} bug={bug} size={62} />
                  {count > 1 ? <span className="hand-card-count">×{count}</span> : null}
                </span>
                <span className="hand-card-name">{BUG_META[bug].short}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HandSummary({ hand, color }: { hand: Hand; color: Color }) {
  const available = BUGS.filter((bug) => hand[bug] > 0);
  if (available.length === 0) {
    return <span className="hand-summary-empty">All tiles played</span>;
  }
  return (
    <span className={`hand-summary hand-summary-${color}`}>
      {available.map((bug) => (
        <span className="hand-summary-item" key={bug} title={`${BUG_META[bug].name} ×${hand[bug]}`}>
          <BugIcon bug={bug} size={15} />
          <span>{hand[bug]}</span>
        </span>
      ))}
    </span>
  );
}
