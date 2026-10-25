import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { ChatPanel } from '../components/ChatPanel';
import { HandRack } from '../components/HandRack';
import { HiveBoard } from '../components/HiveBoard';
import { LogoMark } from '../components/LogoMark';
import { MoveLog } from '../components/MoveLog';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { PlayerCard } from '../components/PlayerCard';
import { Badge, CopyButton, EmptyState, Modal, Spinner } from '../components/Ui';
import { formatRelative } from '../lib/format';
import { useSocket } from '../socket';
import { useToast } from '../toast';
import type {
  Action,
  ChatMessage,
  Color,
  GameView,
  Position,
} from '../types';
import { BUG_META } from '../../shared/types';
import { levelLabel } from '../../shared/difficulty';

function colorName(color: Color): string {
  return color === 'white' ? 'Ivory' : 'Onyx';
}

function reasonText(reason: GameView['finishReason']): string {
  switch (reason) {
    case 'queen':
      return 'The queen was surrounded on all six sides.';
    case 'stalemate':
      return 'Both players passed in succession - the hive is deadlocked.';
    case 'resign':
      return 'A resignation ended the game.';
    default:
      return 'The game is complete.';
  }
}

function finishLabel(reason: GameView['finishReason']): string {
  switch (reason) {
    case 'queen':
      return 'Queen surrounded';
    case 'stalemate':
      return 'Stalemate';
    case 'resign':
      return 'Resignation';
    default:
      return 'Complete';
  }
}

export default function GameRoom() {
  const { code = '' } = useParams();
  const { user, refresh } = useAuth();
  const { socket, connected } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameView | null>(null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Position>(null);
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [moveBusy, setMoveBusy] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [resignBusy, setResignBusy] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [newGameBusy, setNewGameBusy] = useState(false);
  const finishedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResultDismissed(false);
    setSelection(null);
    setChats([]);
    try {
      let view: GameView;
      try {
        const result = await api.getGame(code);
        view = result.game;
      } catch (caught) {
        // A private table is invisible until you are seated — try the invite code.
        if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404)) {
          const joined = await api.joinGame(code);
          view = joined.game;
        } else {
          throw caught;
        }
      }

      const seated =
        view.players.white?.id === user?.id || view.players.black?.id === user?.id;
      if (!seated && view.status === 'waiting' && !view.players.black) {
        try {
          const joined = await api.joinGame(view.code);
          view = joined.game;
        } catch {
          // Leave them on the table as a spectator if the race was lost.
        }
      }
      setGame(view);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not open this table. Check the code and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [code, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket || !game) return;
    let active = true;

    const joinRoom = () => {
      socket.emit(
        'game:join',
        { gameId: game.id },
        (response: { ok?: boolean; game?: GameView; chats?: ChatMessage[]; error?: string }) => {
          if (!active) return;
          if (response?.ok) {
            if (response.game) setGame(response.game);
            setChats(response.chats ?? []);
          } else {
            toast(response?.error ?? 'Could not join the table channel.', 'error');
          }
        },
      );
    };

    const onUpdate = (view: GameView) => {
      if (view.id === game.id) setGame(view);
    };
    const onChat = (message: ChatMessage) => {
      if (message.gameId === game.id) {
        setChats((current) => [...current.slice(-59), message]);
      }
    };

    joinRoom();
    socket.on('game:update', onUpdate);
    socket.on('game:chat', onChat);
    socket.on('connect', joinRoom);

    return () => {
      active = false;
      socket.off('game:update', onUpdate);
      socket.off('game:chat', onChat);
      socket.off('connect', joinRoom);
    };
  }, [socket, game?.id, toast]);

  useEffect(() => {
    setSelection(null);
  }, [game?.state.moveNumber]);

  useEffect(() => {
    if (game?.status === 'finished' && finishedRef.current !== game.id) {
      finishedRef.current = game.id;
      void refresh();
    }
  }, [game?.status, game?.id, refresh]);

  const myColor: Color | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.players.white?.id === user.id) return 'white';
    if (game.players.black?.id === user.id) return 'black';
    return null;
  }, [game, user]);

  const spectator = myColor === null;
  const myTurn =
    Boolean(game) && game?.status === 'active' && myColor !== null && game?.state.turn === myColor;
  const canAct = myTurn && !moveBusy;

  const opponent =
    myColor === 'white' ? game?.players.black : myColor === 'black' ? game?.players.white : null;

  const inviteLink = game ? `${window.location.origin}/g/${game.code}` : '';

  const sendAction = useCallback(
    (action: Action) => {
      if (!socket || !game || !canAct) return;
      setMoveBusy(true);
      setSelection(null);
      socket.emit(
        'game:action',
        { gameId: game.id, action },
        (response: { ok?: boolean; error?: string }) => {
          setMoveBusy(false);
          if (!response?.ok) {
            toast(response?.error ?? 'That move was refused.', 'error');
          }
        },
      );
      window.setTimeout(() => setMoveBusy(false), 6000);
    },
    [socket, game, canAct, toast],
  );

  const sendChat = useCallback(
    (text: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket || !game) {
          resolve(false);
          return;
        }
        socket.emit(
          'game:chat',
          { gameId: game.id, text },
          (response: { ok?: boolean; error?: string }) => {
            if (response?.ok) {
              resolve(true);
            } else {
              toast(response?.error ?? 'Message not sent.', 'error');
              resolve(false);
            }
          },
        );
      }),
    [socket, game, toast],
  );

  const resign = () => {
    if (!socket || !game) return;
    setResignBusy(true);
    socket.emit(
      'game:resign',
      { gameId: game.id },
      (response: { ok?: boolean; error?: string }) => {
        setResignBusy(false);
        setResignOpen(false);
        if (!response?.ok) toast(response?.error ?? 'Could not resign.', 'error');
      },
    );
  };

  const openNewTable = async () => {
    if (!game) return;
    setNewGameBusy(true);
    try {
      const result = await api.createGame({
        visibility: game.computer ? 'private' : 'public',
        expansions: game.settings.expansions,
        tournamentOpening: game.settings.tournamentOpening,
        opponent: game.computer ? 'computer' : 'human',
        difficulty: game.botLevel ?? 'auto',
      });
      navigate(`/g/${result.game.code}`);
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not open a table.', 'error');
    } finally {
      setNewGameBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page game-page">
        <div className="panel game-loading">
          <LogoMark size={48} />
          <Spinner label="Opening the table…" />
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="page narrow-page">
        <div className="panel game-error-panel">
          <div className="verify-mark status-error">
            <span className="verify-x">×</span>
          </div>
          <div className="eyebrow">Table unavailable</div>
          <h1>We couldn&apos;t open that hive.</h1>
          <p>{error ?? 'This table no longer exists.'}</p>
          <div className="button-row centered">
            <Link to="/lobby" className="btn btn-primary">
              Back to the lobby
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel =
    game.status === 'waiting' ? 'Open table' : game.status === 'active' ? 'In play' : 'Finished';

  if (game.status === 'waiting') {
    return (
      <div className="page game-page">
        <div className="game-topbar">
          <Link to="/lobby" className="back-link">
            ← Lobby
          </Link>
          <div className="game-title">
            <span className="game-title-label">Table</span>
            <span className="game-code">#{game.code}</span>
            <Badge tone="green">{statusLabel}</Badge>
            {game.rankedPotential && !game.players.white?.isGuest ? (
              <Badge tone="gold">Ranked ready</Badge>
            ) : null}
          </div>
          <div className="game-top-actions">
            <span className={`connection-pill ${connected ? 'is-on' : ''}`}>
              <span className="connection-dot" />
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
        </div>

        <div className="waiting-room panel">
          <div className="waiting-glow" aria-hidden="true" />
          <div className="waiting-art" aria-hidden="true">
            <div className="waiting-ring waiting-ring-one" />
            <div className="waiting-ring waiting-ring-two" />
            <div className="waiting-hex waiting-hex-one">
              <BugIcon bug="queen" size={42} />
            </div>
            <div className="waiting-hex waiting-hex-two">
              <BugIcon bug="ant" size={30} />
            </div>
            <div className="waiting-hex waiting-hex-three">
              <BugIcon bug="beetle" size={28} />
            </div>
          </div>

          <div className="waiting-copy">
            <div className="eyebrow">Table open</div>
            <h1>Waiting for a challenger.</h1>
            <p>
              Send the code — or the whole link — to the person you want across the hive. The
              table stays open while you wait.
            </p>

            <div className="waiting-code">
              <div>
                <span className="waiting-code-label">Invite code</span>
                <strong>{game.code}</strong>
              </div>
              <CopyButton value={game.code} label="Copy code" copiedLabel="Copied" />
            </div>

            <div className="waiting-link">
              <span>{inviteLink}</span>
              <CopyButton
                value={inviteLink}
                label="Copy link"
                copiedLabel="Copied"
                className="btn btn-ghost btn-sm"
              />
            </div>

            <div className="waiting-facts">
              <div>
                <span className="waiting-fact-label">Host</span>
                <strong>{game.players.white?.username}</strong>
              </div>
              <div>
                <span className="waiting-fact-label">Visibility</span>
                <strong>{game.visibility === 'public' ? 'Public' : 'Private'}</strong>
              </div>
              <div>
                <span className="waiting-fact-label">Pieces</span>
                <strong>{game.settings.expansions ? 'Expanded set' : 'Classic set'}</strong>
              </div>
              <div>
                <span className="waiting-fact-label">Opening</span>
                <strong>{game.settings.tournamentOpening ? 'Tournament' : 'Standard'}</strong>
              </div>
            </div>

            <div className="button-row waiting-actions">
              <Link to="/lobby" className="btn btn-ghost">
                Back to the lobby
              </Link>
              {game.visibility === 'public' ? (
                <span className="waiting-note">
                  <span className="pulse-dot" />
                  Listed in the public lobby
                </span>
              ) : (
                <span className="waiting-note">
                  <span className="pulse-dot" />
                  Only people with this code can join
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const turnPlayer =
    game.state.turn === 'white' ? game.players.white : game.players.black;
  const currentHand = myColor ? game.state.hands[myColor] : game.state.hands[game.state.turn];
  const handColor = myColor ?? game.state.turn;
  // The rack and your identity card live on the left, the rival at the top of
  // the right-hand column.
  const selfColor: Color = myColor ?? 'white';
  const rivalColor: Color = selfColor === 'white' ? 'black' : 'white';
  const botPlayer = game.players.white?.isBot
    ? game.players.white
    : game.players.black?.isBot
      ? game.players.black
      : null;

  const resultTitle = game.winner
    ? myColor === null
      ? `${colorName(game.winner)} wins`
      : game.winner === myColor
        ? 'Victory'
        : 'Defeat'
    : 'A draw';
  const resultSubline = game.winner
    ? myColor === null
      ? game.finishReason === 'resign'
        ? `${game.players[game.winner]?.username ?? colorName(game.winner)} takes the hive by resignation.`
        : `${game.players[game.winner]?.username ?? colorName(game.winner)} closes the hive.`
      : game.winner === myColor
        ? game.finishReason === 'resign'
          ? 'Your rival resigned. The hive is yours.'
          : 'You closed the hive. Every side of their queen is sealed.'
        : game.finishReason === 'resign'
          ? 'You resigned. The hive belongs to your rival this time.'
          : 'Your queen is surrounded. The hive belongs to your rival this time.'
    : 'Neither queen could be surrounded before the hive locked up.';

  return (
    <div className="page game-page">
      <div className="game-topbar">
        <Link to="/lobby" className="back-link">
          ← Lobby
        </Link>
        <div className="game-title">
          <span className="game-title-label">Table</span>
          <span className="game-code">#{game.code}</span>
          <Badge tone={game.status === 'finished' ? 'muted' : 'green'} className="game-badge-status">
            {statusLabel}
          </Badge>
          <Badge tone={game.ranked ? 'gold' : 'muted'} className="game-badge-mode">
            {game.ranked ? 'Ranked' : 'Casual'}
          </Badge>
          {game.computer ? (
            <Badge tone="blue" className="game-badge-optional">
              vs {game.players.black?.username ?? 'Computer'}
            </Badge>
          ) : null}
          {game.settings.expansions ? (
            <Badge tone="blue" className="game-badge-optional">
              Expanded
            </Badge>
          ) : null}
          {game.settings.tournamentOpening ? (
            <Badge tone="green" className="game-badge-optional">
              Tournament
            </Badge>
          ) : null}
          {spectator ? (
            <Badge tone="muted" className="game-badge-mode">
              Spectating
            </Badge>
          ) : null}
        </div>
        <div className="game-top-actions">
          <span className={`connection-pill ${connected ? 'is-on' : ''}`}>
            <span className="connection-dot" />
            {connected ? 'Connected' : 'Reconnecting'}
          </span>
          <CopyButton value={inviteLink} label="Copy invite link" className="btn btn-ghost btn-sm" />
        </div>
      </div>

      <div className="mobile-match" aria-label="Players at this table">
        <div
          className={`mobile-player mobile-player-${selfColor} ${
            game.status === 'active' && game.state.turn === selfColor ? 'is-active' : ''
          }`}
        >
          <span className={`color-chip color-chip-${selfColor}`} />
          {game.players[selfColor] ? (
            <PlayerAvatar
              name={game.players[selfColor]!.username}
              size={30}
              isGuest={game.players[selfColor]!.isGuest}
              isBot={game.players[selfColor]!.isBot}
            />
          ) : (
            <span className="avatar avatar-empty" aria-hidden="true">
              ?
            </span>
          )}
          <div className="mobile-player-copy">
            <strong>
              <span className="mobile-player-name">
                {game.players[selfColor]?.username ?? 'Empty seat'}
              </span>
            </strong>
            <span>
              {game.players[selfColor]?.isBot
                ? `Computer${game.botLevel ? ` · ${levelLabel(game.botLevel)}` : ''}`
                : game.players[selfColor]
                  ? `${game.players[selfColor]!.rating}${
                      game.players[selfColor]!.isGuest ? ' · Guest' : ' rating'
                    }`
                  : colorName(selfColor)}
              {myColor === selfColor ? <span className="mobile-you">You</span> : null}
            </span>
          </div>
          {game.status === 'active' && game.state.turn === selfColor ? (
            <span className="turn-dot is-active" aria-label="To move" />
          ) : null}
        </div>

        <div
          className={`mobile-player mobile-player-${rivalColor} is-rival ${
            game.status === 'active' && game.state.turn === rivalColor ? 'is-active' : ''
          }`}
        >
          <span className={`color-chip color-chip-${rivalColor}`} />
          {game.players[rivalColor] ? (
            <PlayerAvatar
              name={game.players[rivalColor]!.username}
              size={30}
              isGuest={game.players[rivalColor]!.isGuest}
              isBot={game.players[rivalColor]!.isBot}
            />
          ) : (
            <span className="avatar avatar-empty" aria-hidden="true">
              ?
            </span>
          )}
          <div className="mobile-player-copy">
            <strong>
              <span className="mobile-player-name">
                {game.players[rivalColor]?.username ?? 'Waiting'}
              </span>
            </strong>
            <span>
              {game.players[rivalColor]?.isBot
                ? `Computer${game.botLevel ? ` · ${levelLabel(game.botLevel)}` : ''}`
                : game.players[rivalColor]
                  ? `${game.players[rivalColor]!.rating}${
                      game.players[rivalColor]!.isGuest ? ' · Guest' : ' rating'
                    }`
                  : colorName(rivalColor)}
            </span>
          </div>
          {game.status === 'active' && game.state.turn === rivalColor ? (
            <span className="turn-dot is-active" aria-label="To move" />
          ) : null}
        </div>
      </div>

      <div className="game-layout">
        <div className="hand-column">
          <HandRack
            hand={currentHand}
            color={handColor}
            selected={selection?.kind === 'bug' ? selection.bug : null}
            onSelect={(bug) =>
              setSelection((current) =>
                current?.kind === 'bug' && current.bug === bug
                  ? null
                  : { kind: 'bug', bug },
              )
            }
            disabled={!canAct}
            label={
              myColor
                ? myTurn
                  ? 'Your tiles — choose one'
                  : 'Your tiles'
                : `${colorName(handColor)} tiles`
            }
          />

          <PlayerCard
            player={game.players[selfColor]}
            color={selfColor}
            isYou={myColor === selfColor}
            active={game.status === 'active' && game.state.turn === selfColor}
            queenPlaced={game.state.queenPlaced[selfColor]}
            hand={game.state.hands[selfColor]}
            winner={game.status === 'finished' && game.state.winner === selfColor}
            botLevel={game.botLevel}
          />
        </div>

        <div className="board-column">
          <div className={`board-panel ${myTurn ? 'is-your-turn' : ''}`}>
            <div className={`board-banner ${myTurn ? 'is-live' : ''}`}>
              {game.status === 'finished' ? (
                <>
                  <BugIcon bug="queen" size={18} />
                  <span>
                    {game.winner
                      ? `${colorName(game.winner)} wins — ${reasonText(game.finishReason)}`
                      : 'Draw — the hive is deadlocked.'}
                  </span>
                </>
              ) : spectator ? (
                <>
                  <span className="spectator-eye" aria-hidden="true">
                    ◉
                  </span>
                  <span>
                    Spectating · {colorName(game.state.turn)} to move
                    {turnPlayer ? ` (${turnPlayer.username})` : ''}
                  </span>
                </>
              ) : myTurn ? (
                <>
                  <span className="turn-dot is-active" />
                  <span>
                    Your move — place a tile or move a piece
                    {moveBusy ? ' · sending…' : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>
                    Waiting for {opponent?.username ?? colorName(game.state.turn)} to move
                  </span>
                </>
              )}
            </div>

            <HiveBoard
              state={game.state}
              legalActions={game.legalActions}
              color={myColor ?? game.state.turn}
              canAct={canAct}
              selection={selection}
              onSelectionChange={setSelection}
              onAction={sendAction}
            />

            {myColor && !game.state.queenPlaced[myColor] && game.status === 'active' ? (
              <div className="board-hint">
                <BugIcon bug="queen" size={16} />
                Your queen must join the hive by your fourth turn — until then, your pieces cannot
                move.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="game-side">
          <div
            className={`turn-card ${myTurn ? 'is-your-turn' : ''} ${
              game.status === 'finished' ? 'is-finished' : ''
            }`}
          >
            <div className="turn-card-top">
              <span className="turn-card-label">
                {game.status === 'finished'
                  ? 'Game over'
                  : myTurn
                    ? 'Your turn'
                    : spectator
                      ? 'Spectating'
                      : 'Opponent thinking'}
              </span>
              <span className="move-counter">Move {game.state.moveNumber}</span>
            </div>
            <div className="turn-card-main">
              {myColor ? (
                <span className={`color-chip color-chip-${myColor}`} />
              ) : (
                <span className={`color-chip color-chip-${game.state.turn}`} />
              )}
              <div>
                <strong>
                  {game.status === 'finished'
                    ? game.winner
                      ? `${colorName(game.winner)} wins`
                      : 'Stalemate'
                    : spectator
                      ? `${colorName(game.state.turn)} to move`
                      : myTurn
                        ? 'The hive is yours to shape'
                        : `${opponent?.username ?? 'Opponent'} is choosing`}
                </strong>
                <span>
                  {game.status === 'finished'
                    ? reasonText(game.finishReason)
                    : myTurn
                      ? 'Select a tile in your rack, then a highlighted cell. Select a board piece to see its moves.'
                      : 'Moves appear here the moment they are made.'}
                </span>
              </div>
            </div>
            <div className="turn-card-actions">
              {selection ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelection(null)}>
                  Clear selection
                </button>
              ) : null}
              {myColor && game.status === 'active' ? (
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => setResignOpen(true)}
                >
                  Resign
                </button>
              ) : null}
              {game.status === 'finished' ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setResultDismissed(false)}
                >
                  Show result
                </button>
              ) : null}
            </div>
          </div>

          <PlayerCard
            player={game.players[rivalColor]}
            color={rivalColor}
            isYou={myColor === rivalColor}
            active={game.status === 'active' && game.state.turn === rivalColor}
            queenPlaced={game.state.queenPlaced[rivalColor]}
            hand={game.state.hands[rivalColor]}
            winner={game.status === 'finished' && game.state.winner === rivalColor}
            botLevel={game.botLevel}
          />

          <div className="side-tabs" role="tablist" aria-label="Table panels">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'log'}
              className={tab === 'log' ? 'is-active' : ''}
              onClick={() => setTab('log')}
            >
              Move log
              <span>{game.state.history.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              className={tab === 'chat' ? 'is-active' : ''}
              onClick={() => setTab('chat')}
            >
              Chat
              <span>{chats.length}</span>
            </button>
          </div>

          <div className="side-panel-body">
            {tab === 'log' ? (
              <MoveLog
                history={game.state.history}
                players={game.players}
                viewerColor={myColor}
              />
            ) : (
              <ChatPanel
                messages={chats}
                user={user!}
                onSend={sendChat}
                connected={connected}
              />
            )}
          </div>

          <div className="game-facts panel">
            <div className="game-fact">
              <span>Code</span>
              <strong>#{game.code}</strong>
            </div>
            <div className="game-fact">
              <span>Opened</span>
              <strong>{formatRelative(game.createdAt)}</strong>
            </div>
            <div className="game-fact">
              <span>Set</span>
              <strong>{game.settings.expansions ? 'Expanded' : 'Classic'}</strong>
            </div>
            <div className="game-fact">
              <span>Opening</span>
              <strong>{game.settings.tournamentOpening ? 'Tournament' : 'Standard'}</strong>
            </div>
            {game.ranked ? (
              <div className="game-fact game-fact-wide">
                <span>Ranked game</span>
                <strong>Elo is on the line</strong>
              </div>
            ) : null}
            {game.computer ? (
              <div className="game-fact game-fact-wide">
                <span>Opponent</span>
                <strong>
                  {botPlayer?.username ?? 'Computer'}
                  {game.botLevel ? ` · ${levelLabel(game.botLevel)}` : ''} · casual
                </strong>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <Modal
        open={resignOpen}
        onClose={() => setResignOpen(false)}
        title="Resign this game?"
        eyebrow="No way back"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setResignOpen(false)}>
              Keep playing
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={resign}
              disabled={resignBusy}
            >
              {resignBusy ? 'Resigning…' : 'Resign game'}
            </button>
          </>
        }
      >
        <p>
          {game.ranked
            ? 'This is a ranked game. Resigning counts as a loss and will affect both ratings.'
            : 'The game will end immediately and your opponent will be declared the winner.'}
        </p>
        <p className="muted">
          {BUG_META.queen.name}s rarely surrender — but sometimes the hive is already lost.
        </p>
      </Modal>

      <Modal
        open={game.status === 'finished' && !resultDismissed}
        onClose={() => setResultDismissed(true)}
        title={resultTitle}
        eyebrow={game.ranked ? 'Ranked result' : 'Casual result'}
        wide
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setResultDismissed(true)}
            >
              View the board
            </button>
            {myColor ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void openNewTable()}
                disabled={newGameBusy}
              >
                {newGameBusy ? 'Opening…' : game.computer ? 'Play HiveMind again' : 'Open a new table'}
              </button>
            ) : (
              <Link to="/lobby" className="btn btn-primary">
                Back to the lobby
              </Link>
            )}
          </>
        }
      >
        <div className={`result-hero ${game.winner === myColor && myColor ? 'is-win' : game.winner ? 'is-loss' : 'is-draw'}`}>
          <span className="result-bug">
            <BugIcon bug={game.winner === 'white' ? 'queen' : game.winner === 'black' ? 'beetle' : 'spider'} size={56} />
          </span>
          <div>
            <h3>{resultSubline}</h3>
            <p>{reasonText(game.finishReason)}</p>
          </div>
        </div>
        <div className="result-stats">
          <div>
            <span>Moves</span>
            <strong>{game.state.moveNumber}</strong>
          </div>
          <div>
            <span>Table</span>
            <strong>#{game.code}</strong>
          </div>
          <div>
            <span>Result</span>
            <strong>{game.ranked ? 'Ranked' : 'Casual'}</strong>
          </div>
          <div>
            <span>Finish</span>
            <strong>{finishLabel(game.finishReason)}</strong>
          </div>
        </div>
        {game.ranked && myColor ? (
          <p className="result-note">
            Ratings update immediately. Check your profile for your new Elo.
          </p>
        ) : null}
      </Modal>

      {game.state.status === 'active' && game.legalActions.length === 0 ? (
        <div className="panel game-warning">
          <EmptyState title="No legal actions" icon={<BugIcon bug="spider" size={38} />}>
            The hive is in an unusual state. The turn will pass automatically.
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
