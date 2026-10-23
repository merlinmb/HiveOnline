import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BugIcon } from '../components/BugIcon';
import { HandRack, HandSummary } from '../components/HandRack';
import { HiveBoard } from '../components/HiveBoard';
import { MoveLog } from '../components/MoveLog';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { Badge, Modal, Toggle } from '../components/Ui';
import { applyAction, createGame, getLegalActions } from '../../shared/hive/engine';
import type { Action, Color, GameState, Position } from '../types';
import type { User } from '../types';

const EMPTY_USER = (id: string, username: string): User => ({
  id,
  username,
  email: null,
  rating: 1200,
  isGuest: false,
  emailVerified: true,
  rankedGames: 0,
  wins: 0,
  losses: 0,
  createdAt: 0,
});

function reasonText(reason: GameState['finishReason']): string {
  switch (reason) {
    case 'queen':
      return 'Every side of the queen is surrounded.';
    case 'stalemate':
      return 'Two passes in a row — the hive is deadlocked.';
    default:
      return 'The game is over.';
  }
}

export default function Hotseat() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [names, setNames] = useState({ white: 'Player 1', black: 'Player 2' });
  const [past, setPast] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Position>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [draftWhite, setDraftWhite] = useState('Player 1');
  const [draftBlack, setDraftBlack] = useState('Player 2');
  const [draftExpansions, setDraftExpansions] = useState(false);
  const [draftTournament, setDraftTournament] = useState(false);

  const legalActions = useMemo(
    () => (game.status === 'active' ? getLegalActions(game) : []),
    [game],
  );
  const currentColor = game.turn;
  const canAct = game.status === 'active';
  const currentHand = game.hands[currentColor];
  const finished = game.status === 'finished';

  const pseudoPlayers = useMemo(
    () => ({
      white: EMPTY_USER('local-white', names.white),
      black: EMPTY_USER('local-black', names.black),
    }),
    [names],
  );

  const act = (action: Action) => {
    if (!canAct) return;
    try {
      const next = applyAction(game, action);
      setPast((stack) => [...stack.slice(-49), game]);
      setGame(next);
      setSelection(null);
    } catch {
      setSelection(null);
    }
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((stack) => stack.slice(0, -1));
    setGame(previous);
    setSelection(null);
    setResultDismissed(false);
  };

  const openSetup = () => {
    setDraftWhite(names.white);
    setDraftBlack(names.black);
    setDraftExpansions(game.settings.expansions);
    setDraftTournament(game.settings.tournamentOpening);
    setSetupOpen(true);
  };

  const startGame = () => {
    const white = draftWhite.trim() || 'Player 1';
    const black = draftBlack.trim() || 'Player 2';
    setNames({ white, black });
    setGame(
      createGame({
        expansions: draftExpansions,
        tournamentOpening: draftTournament,
      }),
    );
    setPast([]);
    setSelection(null);
    setResultDismissed(false);
    setSetupOpen(false);
  };

  const winnerName = game.winner ? names[game.winner] : null;
  const winnerColor = game.winner;

  return (
    <div className="page game-page hotseat-page">
      <header className="hotseat-head">
        <div>
          <div className="eyebrow">Same table, one screen</div>
          <h1>Pass &amp; play</h1>
          <p>
            A full game of Hive for two people in the same room. All information is open; just
            pass the screen when the turn changes.
          </p>
        </div>
        <div className="hotseat-head-actions">
          <span className="hotseat-players-note">
            <PlayerAvatar name={names.white} size={28} />
            <span>{names.white}</span>
            <span className="hotseat-vs">vs</span>
            <PlayerAvatar name={names.black} size={28} />
            <span>{names.black}</span>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={past.length === 0}>
            Undo move
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openSetup}>
            New game
          </button>
        </div>
      </header>

      <div className="game-layout">
        <div className="board-column">
          <div
            className={`player-card player-card-${'black'} ${
              !finished && currentColor === 'black' ? 'is-active' : ''
            } ${finished && winnerColor === 'black' ? 'is-winner' : ''}`}
          >
            <div className="player-card-top">
              <span className="color-chip color-chip-black" />
              <span className="player-color-label">Onyx</span>
              {!finished && currentColor === 'black' ? (
                <span className="to-move">
                  <span className="turn-dot is-active" />
                  To move
                </span>
              ) : null}
              <span className="local-tag">Local</span>
            </div>
            <div className="player-card-main">
              <PlayerAvatar name={names.black} size={44} />
              <div className="player-identity">
                <div className="player-name">{names.black}</div>
                <div className="player-meta">
                  <span className="meta-sep">Pass &amp; play</span>
                </div>
              </div>
            </div>
            <div className="player-card-foot">
              <span
                className={`queen-status ${
                  game.queenPlaced.black ? 'is-placed' : 'is-waiting'
                }`}
              >
                <BugIcon bug="queen" size={16} />
                {game.queenPlaced.black ? 'Queen placed' : 'Queen in hand'}
              </span>
              <HandSummary hand={game.hands.black} color="black" />
            </div>
          </div>

          <div className={`board-panel ${!finished && currentColor === 'white' ? 'is-black-turn' : ''}`}>
            <div className={`board-banner ${!finished ? 'is-live' : ''}`}>
              {finished ? (
                <>
                  <BugIcon bug="queen" size={18} />
                  <span>
                    {winnerName
                      ? `${winnerName} wins — ${reasonText(game.finishReason)}`
                      : 'Draw — the hive is deadlocked.'}
                  </span>
                </>
              ) : (
                <>
                  <span className="turn-dot is-active" />
                  <span>
                    {names[currentColor]} to move — {currentColor === 'white' ? 'Ivory' : 'Onyx'}
                  </span>
                  <span className="board-banner-aside">Move {game.moveNumber + 1}</span>
                </>
              )}
            </div>

            <HiveBoard
              state={game}
              legalActions={legalActions}
              color={currentColor}
              canAct={canAct}
              selection={selection}
              onSelectionChange={setSelection}
              onAction={act}
            />

            {!game.queenPlaced[currentColor] && !finished ? (
              <div className="board-hint">
                <BugIcon bug="queen" size={16} />
                {names[currentColor]}&apos;s queen must join by the fourth turn. Until then, no
                piece may move.
              </div>
            ) : null}
          </div>

          <HandRack
            hand={currentHand}
            color={currentColor}
            selected={selection?.kind === 'bug' ? selection.bug : null}
            onSelect={(bug) =>
              setSelection((current) =>
                current?.kind === 'bug' && current.bug === bug
                  ? null
                  : { kind: 'bug', bug },
              )
            }
            disabled={!canAct}
            label={`${names[currentColor]}'s tiles`}
          />

          <div
            className={`player-card player-card-white ${
              !finished && currentColor === 'white' ? 'is-active' : ''
            } ${finished && winnerColor === 'white' ? 'is-winner' : ''}`}
          >
            <div className="player-card-top">
              <span className="color-chip color-chip-white" />
              <span className="player-color-label">Ivory</span>
              {!finished && currentColor === 'white' ? (
                <span className="to-move">
                  <span className="turn-dot is-active" />
                  To move
                </span>
              ) : null}
              <span className="local-tag">Local</span>
            </div>
            <div className="player-card-main">
              <PlayerAvatar name={names.white} size={44} />
              <div className="player-identity">
                <div className="player-name">{names.white}</div>
                <div className="player-meta">
                  <span className="meta-sep">Pass &amp; play</span>
                </div>
              </div>
            </div>
            <div className="player-card-foot">
              <span
                className={`queen-status ${
                  game.queenPlaced.white ? 'is-placed' : 'is-waiting'
                }`}
              >
                <BugIcon bug="queen" size={16} />
                {game.queenPlaced.white ? 'Queen placed' : 'Queen in hand'}
              </span>
              <HandSummary hand={game.hands.white} color="white" />
            </div>
          </div>
        </div>

        <aside className="game-side">
          <div
            className={`turn-card ${!finished ? 'is-your-turn' : 'is-finished'}`}
          >
            <div className="turn-card-top">
              <span className="turn-card-label">
                {finished ? 'Game over' : 'Pass the device'}
              </span>
              <span className="move-counter">
                {past.length} {past.length === 1 ? 'move' : 'moves'} played
              </span>
            </div>
            <div className="turn-card-main">
              <span className={`color-chip color-chip-${finished ? winnerColor ?? 'white' : currentColor}`} />
              <div>
                <strong>
                  {finished
                    ? winnerName
                      ? `${winnerName} wins`
                      : 'Stalemate'
                    : `${names[currentColor]} to move`}
                </strong>
                <span>
                  {finished
                    ? reasonText(game.finishReason)
                    : `Hand the screen to ${names[currentColor]}. Select a tile, then a highlighted cell.`}
                </span>
              </div>
            </div>
            <div className="turn-card-actions">
              {selection ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelection(null)}>
                  Clear selection
                </button>
              ) : null}
              {finished ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openSetup}
                >
                  Rematch
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={undo}
                  disabled={past.length === 0}
                >
                  Undo
                </button>
              )}
            </div>
          </div>

          <div className="hotseat-note panel">
            <h3>
              <BugIcon bug="grasshopper" size={18} />
              At the table
            </h3>
            <ul>
              <li>
                <strong>Place or move.</strong> A turn is either adding one tile from your hand or
                moving one piece already in the hive.
              </li>
              <li>
                <strong>Queen by turn four.</strong> After that, moving is forbidden until she is
                placed.
              </li>
              <li>
                <strong>Surround to win.</strong> All six cells around a queen must be occupied —
                by either colour.
              </li>
            </ul>
          </div>

          <div className="side-panel-body local-log">
            <MoveLog history={game.history} players={pseudoPlayers} viewerColor={null} />
          </div>

          <div className="panel local-facts">
            <div className="game-fact">
              <span>Set</span>
              <strong>{game.settings.expansions ? 'Expanded' : 'Classic'}</strong>
            </div>
            <div className="game-fact">
              <span>Opening</span>
              <strong>{game.settings.tournamentOpening ? 'Tournament' : 'Standard'}</strong>
            </div>
            <div className="game-fact">
              <span>Turn</span>
              <strong>{game.moveNumber + 1}</strong>
            </div>
          </div>

          <Link to="/rules" className="text-link local-rules-link">
            Full rules and piece guide →
          </Link>
        </aside>
      </div>

      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Set the table"
        eyebrow="Pass & play"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSetupOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={startGame}>
              Start game
            </button>
          </>
        }
      >
        <div className="setup-names">
          <label className="field">
            <span className="field-label">
              <span className="color-chip color-chip-white" /> Ivory player
            </span>
            <input
              value={draftWhite}
              onChange={(event) => setDraftWhite(event.target.value)}
              maxLength={20}
              placeholder="Player 1"
            />
          </label>
          <label className="field">
            <span className="field-label">
              <span className="color-chip color-chip-black" /> Onyx player
            </span>
            <input
              value={draftBlack}
              onChange={(event) => setDraftBlack(event.target.value)}
              maxLength={20}
              placeholder="Player 2"
            />
          </label>
        </div>

        <div className="setup-toggles">
          <Toggle
            checked={draftExpansions}
            onChange={setDraftExpansions}
            label="Ladybug & Mosquito"
            description="Include both expansion pieces in each hand."
          />
          <Toggle
            checked={draftTournament}
            onChange={setDraftTournament}
            label="Tournament opening"
            description="The queen may not be played on the first turn."
          />
        </div>

        <div className="setup-summary">
          <div>
            <BugIcon bug="queen" size={20} />
            <span>
              {draftExpansions ? '12 pieces each' : '11 pieces each'} ·{' '}
              {draftTournament ? 'tournament opening' : 'standard opening'}
            </span>
          </div>
          <p>Starting a game clears the current board and move log.</p>
        </div>
      </Modal>

      <Modal
        open={finished && !resultDismissed}
        onClose={() => setResultDismissed(true)}
        title={winnerName ? `${winnerName} wins` : 'A draw'}
        eyebrow={winnerName ? `${winnerColor === 'white' ? 'Ivory' : 'Onyx'} takes the hive` : 'Stalemate'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setResultDismissed(true)}
            >
              View the board
            </button>
            <button type="button" className="btn btn-ghost" onClick={undo}>
              Undo last move
            </button>
            <button type="button" className="btn btn-primary" onClick={openSetup}>
              Rematch
            </button>
          </>
        }
      >
        <div className={`result-hero ${winnerName ? 'is-win' : 'is-draw'}`}>
          <span className="result-bug">
            <BugIcon bug={winnerColor === 'black' ? 'beetle' : 'queen'} size={56} />
          </span>
          <div>
            <h3>{reasonText(game.finishReason)}</h3>
            <p>
              {winnerName
                ? `${winnerName} surrounded the rival queen after ${game.history.length} actions.`
                : 'Neither queen could be surrounded — call it a draw and start again.'}
            </p>
          </div>
        </div>
        <div className="result-stats">
          <div>
            <span>Moves</span>
            <strong>{game.moveNumber}</strong>
          </div>
          <div>
            <span>Ivory</span>
            <strong>{names.white}</strong>
          </div>
          <div>
            <span>Onyx</span>
            <strong>{names.black}</strong>
          </div>
          <div>
            <span>Set</span>
            <strong>{game.settings.expansions ? 'Expanded' : 'Classic'}</strong>
          </div>
        </div>
        <p className="result-note">
          This is a local game, so no rating or history is recorded. Open an online table to play
          ranked.
        </p>
        <div className="button-row">
          <Link to="/lobby" className="btn btn-outline">
            Play someone online
          </Link>
        </div>
      </Modal>

      {!setupOpen && !finished ? (
        <div className="hotseat-floating">
          <span className={`color-chip color-chip-${currentColor}`} />
          <span>{names[currentColor]}</span>
          <span className="hotseat-floating-sep">·</span>
          <BugIcon bug="queen" size={15} />
          <span>{game.queenPlaced[currentColor] ? 'Queen placed' : 'Queen in hand'}</span>
        </div>
      ) : null}
    </div>
  );
}
