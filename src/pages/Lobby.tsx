import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { Badge, EmptyState, Spinner, Toggle } from '../components/Ui';
import { useSocket } from '../socket';
import { useToast } from '../toast';
import { formatRelative, plural } from '../lib/format';
import type { Color, GameSummary, LobbySnapshot } from '../types';

function myColor(game: GameSummary, userId: string): Color | null {
  if (game.players.white?.id === userId) return 'white';
  if (game.players.black?.id === userId) return 'black';
  return null;
}

function GameSettingsBadges({ game }: { game: GameSummary }) {
  return (
    <span className="settings-badges">
      <Badge tone={game.ranked ? 'gold' : game.rankedPotential ? 'green' : 'muted'}>
        {game.ranked ? 'Ranked' : game.rankedPotential ? 'Ranked if verified' : 'Casual'}
      </Badge>
      {game.settings.expansions ? <Badge tone="blue">Expanded</Badge> : null}
      {game.settings.tournamentOpening ? <Badge tone="green">Tournament</Badge> : null}
      {game.visibility === 'private' ? <Badge tone="muted">Private</Badge> : null}
    </span>
  );
}

function OpenTableCard({
  game,
  onJoin,
  busy,
}: {
  game: GameSummary;
  onJoin: (code: string) => void;
  busy: boolean;
}) {
  const host = game.players.white;
  return (
    <article className="table-card">
      <div className="table-card-head">
        <div className="table-host">
          <PlayerAvatar
            name={host?.username ?? 'Hive'}
            size={42}
            isGuest={Boolean(host?.isGuest)}
          />
          <div className="table-host-copy">
            <strong>{host?.username ?? 'Unknown host'}</strong>
            <span>
              {host?.isGuest ? 'Guest' : `${host?.rating ?? 1200} rating`}
              {host && host.rankedGames > 0
                ? ` · ${host.wins}W ${host.losses}L`
                : ' · no ranked games'}
            </span>
          </div>
        </div>
        <span className="table-code">#{game.code}</span>
      </div>

      <GameSettingsBadges game={game} />

      <div className="table-card-foot">
        <span className="table-time">
          <span className="pulse-dot" />
          Opened {formatRelative(game.createdAt)}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onJoin(game.code)}
          disabled={busy}
        >
          Take a seat
        </button>
      </div>
    </article>
  );
}

function LiveTableCard({ game }: { game: GameSummary }) {
  const white = game.players.white;
  const black = game.players.black;
  return (
    <Link to={`/g/${game.code}`} className="live-card">
      <div className="live-card-top">
        <Badge tone={game.ranked ? 'gold' : 'muted'}>{game.ranked ? 'Ranked' : 'Casual'}</Badge>
        <span className="live-move">Move {game.moveNumber}</span>
      </div>
      <div className="live-players">
        <div className="live-player">
          <span className="color-chip color-chip-white" />
          <PlayerAvatar
            name={white?.username ?? 'Ivory'}
            size={30}
            isGuest={Boolean(white?.isGuest)}
          />
          <span>{white?.username ?? 'Ivory'}</span>
        </div>
        <span className="live-versus">vs</span>
        <div className="live-player">
          <span className="color-chip color-chip-black" />
          <PlayerAvatar
            name={black?.username ?? 'Onyx'}
            size={30}
            isGuest={Boolean(black?.isGuest)}
          />
          <span>{black?.username ?? 'Onyx'}</span>
        </div>
      </div>
      <div className="live-foot">
        <span className={`turn-pill turn-pill-${game.turn}`}>
          <span className="turn-dot is-active" />
          {game.turn === 'white' ? 'Ivory' : 'Onyx'} to move
        </span>
        <span className="watch-link">Watch →</span>
      </div>
    </Link>
  );
}

function MyGameRow({ game, userId }: { game: GameSummary; userId: string }) {
  const color = myColor(game, userId);
  const opponent = color === 'white' ? game.players.black : game.players.white;
  const myTurn = color !== null && game.status === 'active' && game.turn === color;
  return (
    <Link to={`/g/${game.code}`} className={`my-game-row ${myTurn ? 'is-your-turn' : ''}`}>
      <span className={`my-game-color color-chip color-chip-${color ?? 'white'}`} />
      <div className="my-game-copy">
        <strong>{opponent ? opponent.username : 'Waiting for a challenger'}</strong>
        <span>
          {game.status === 'waiting'
            ? 'Open table · share the code'
            : myTurn
              ? 'Your move'
              : `${game.turn === 'white' ? 'Ivory' : 'Onyx'} to move`}
        </span>
      </div>
      <span className="my-game-code">#{game.code}</span>
    </Link>
  );
}

function ResultRow({ game, userId }: { game: GameSummary; userId: string }) {
  const color = myColor(game, userId);
  const won = game.winner && color === game.winner;
  const draw = !game.winner;
  const opponent = color === 'white' ? game.players.black : game.players.white;
  return (
    <Link to={`/g/${game.code}`} className="result-row">
      <span className={`result-pill ${draw ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}>
        {draw ? 'D' : won ? 'W' : 'L'}
      </span>
      <div className="result-copy">
        <strong>vs {opponent?.username ?? 'Unknown'}</strong>
        <span>
          {game.ranked ? 'Ranked' : 'Casual'} · {formatRelative(game.updatedAt)}
        </span>
      </div>
      <span className="result-code">#{game.code}</span>
    </Link>
  );
}

export default function Lobby() {
  const { user } = useAuth();
  const { lobbyVersion, connected, online } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [mine, setMine] = useState<{
    active: GameSummary[];
    recent: GameSummary[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [expansions, setExpansions] = useState(false);
  const [tournamentOpening, setTournamentOpening] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [snapshot, own] = await Promise.all([api.lobby(), api.myGames()]);
        setLobby(snapshot);
        setMine(own);
        setLoadError(null);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Could not load the lobby.';
        if (!silent) setLoadError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (lobbyVersion === 0) return;
    void load(true);
  }, [lobbyVersion, load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!user) return null;

  const join = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      toast('Enter a table code to join.', 'error');
      return;
    }
    setJoining(clean);
    try {
      const result = await api.joinGame(clean);
      navigate(`/g/${result.game.code}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not join that table.', 'error');
    } finally {
      setJoining(null);
      setJoinBusy(false);
    }
  };

  const quickMatch = async () => {
    setQuickBusy(true);
    try {
      const result = await api.quickMatch({ expansions, tournamentOpening });
      navigate(`/g/${result.game.code}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Quick match failed.', 'error');
    } finally {
      setQuickBusy(false);
    }
  };

  const create = async () => {
    setCreateBusy(true);
    try {
      const result = await api.createGame({ visibility, expansions, tournamentOpening });
      navigate(`/g/${result.game.code}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not open a table.', 'error');
    } finally {
      setCreateBusy(false);
    }
  };

  const openCount = lobby?.open.length ?? 0;
  const activeGames = mine?.active ?? [];
  const yourTurn = activeGames.filter(
    (game) => game.status === 'active' && game.turn === myColor(game, user.id),
  ).length;

  return (
    <div className="page lobby-page">
      <header className="page-head lobby-head">
        <div>
          <div className="eyebrow">The lobby</div>
          <h1>Find a table.</h1>
          <p>
            {user.isGuest
              ? 'You are playing as a guest — welcome. Everything here is casual, and your name will vanish with the session.'
              : 'Open a table, join a code, or take the next open seat in the hive.'}
          </p>
        </div>
        <div className="lobby-head-stats">
          <div className="head-stat">
            <span className="head-stat-value">{online}</span>
            <span className="head-stat-label">online</span>
          </div>
          <div className="head-stat">
            <span className="head-stat-value">{openCount}</span>
            <span className="head-stat-label">open tables</span>
          </div>
          <div className="head-stat">
            <span className="head-stat-value">{lobby?.counts.active ?? 0}</span>
            <span className="head-stat-label">games live</span>
          </div>
        </div>
      </header>

      {!user.isGuest && !user.emailVerified ? (
        <div className="notice notice-gold lobby-notice">
          <BugIcon bug="queen" size={22} />
          <div>
            <strong>Your account is not verified yet.</strong> You can play everything, but only
            verified accounts earn ranked Elo. <Link to="/profile">Finish verification →</Link>
          </div>
        </div>
      ) : null}

      {yourTurn > 0 ? (
        <div className="notice notice-green lobby-notice">
          <span className="turn-dot is-active" />
          <div>
            <strong>
              {plural(yourTurn, 'table is', 'tables are')} waiting on your move.
            </strong>{' '}
            <Link to="#your-tables">Jump back in →</Link>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="form-error">
          {loadError}{' '}
          <button type="button" className="link-button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="panel start-panel">
        <div className="start-copy">
          <div className="eyebrow">Start a game</div>
          <h2>A fresh hive, your rules.</h2>
          <p>
            Classic Hive includes the Queen, Ants, Beetles, Spiders and Grasshoppers. Add the
            Ladybug and Mosquito, or forbid the first-turn Queen for tournament openings.
          </p>
          <div className="start-toggles">
            <Toggle
              checked={expansions}
              onChange={setExpansions}
              label="Ladybug & Mosquito"
              description="Add both expansion pieces to each side."
            />
            <Toggle
              checked={tournamentOpening}
              onChange={setTournamentOpening}
              label="Tournament opening"
              description="The Queen cannot be placed on the first turn."
            />
          </div>
        </div>

        <div className="start-actions">
          <div className="start-quick">
            <div>
              <strong>Quick match</strong>
              <span>Join the oldest open public table, or open one yourself.</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void quickMatch()}
              disabled={quickBusy}
            >
              {quickBusy ? 'Matching…' : 'Find a game'}
            </button>
          </div>

          <div className="start-divider">
            <span>or open a table</span>
          </div>

          <div className="segmented" role="group" aria-label="Table visibility">
            <button
              type="button"
              className={visibility === 'public' ? 'is-active' : ''}
              onClick={() => setVisibility('public')}
            >
              Public
              <span>Anyone in the lobby can join</span>
            </button>
            <button
              type="button"
              className={visibility === 'private' ? 'is-active' : ''}
              onClick={() => setVisibility('private')}
            >
              Private
              <span>Invite with a six-character code</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => void create()}
            disabled={createBusy}
          >
            {createBusy
              ? 'Opening…'
              : visibility === 'private'
                ? 'Create private table'
                : 'Open public table'}
          </button>
        </div>
      </section>

      <div className="lobby-grid">
        <section className="lobby-column">
          <div className="section-row">
            <div>
              <h2>Open tables</h2>
              <p>Hives waiting for a second player.</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void load(true)}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading && !lobby ? (
            <div className="panel">
              <Spinner label="Reading the lobby…" />
            </div>
          ) : openCount === 0 ? (
            <div className="panel">
              <EmptyState
                title="No open tables right now"
                icon={<BugIcon bug="ant" size={46} />}
              >
                Open a public table and the next player through the door can sit down. Or use
                quick match to start the queue.
              </EmptyState>
            </div>
          ) : (
            <div className="table-grid">
              {lobby?.open.map((game) => (
                <OpenTableCard
                  key={game.id}
                  game={game}
                  onJoin={(code) => void join(code)}
                  busy={joining !== null}
                />
              ))}
            </div>
          )}

          <div className="section-row live-section-head">
            <div>
              <h2>Live games</h2>
              <p>Watch a hive in progress — spectators see every move.</p>
            </div>
            <span className="live-count">
              <span className={`connection-dot ${connected ? 'is-on' : ''}`} />
              {connected ? 'Live' : 'Reconnecting'}
            </span>
          </div>

          {lobby?.live.length ? (
            <div className="live-grid">
              {lobby.live.map((game) => (
                <LiveTableCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <EmptyState title="The hive is quiet" icon={<BugIcon bug="beetle" size={42} />}>
                No public games are in progress at the moment. Start one and make some noise.
              </EmptyState>
            </div>
          )}
        </section>

        <aside className="lobby-side" id="your-tables">
          <div className="panel side-panel">
            <div className="side-panel-head">
              <h2>Your tables</h2>
              <Link to="/profile" className="text-link">
                Profile
              </Link>
            </div>
            {activeGames.length === 0 ? (
              <div className="side-empty">
                <p>No games in progress.</p>
                <span>Every table you open or join will be kept here.</span>
              </div>
            ) : (
              <div className="my-games">
                {activeGames.map((game) => (
                  <MyGameRow key={game.id} game={game} userId={user.id} />
                ))}
              </div>
            )}
          </div>

          <div className="panel side-panel">
            <div className="side-panel-head">
              <h2>Have a code?</h2>
            </div>
            <p className="side-panel-copy">
              Enter the six characters your host shared. Codes are not case-sensitive.
            </p>
            <form
              className="code-form"
              onSubmit={(event) => {
                event.preventDefault();
                void join(joinCode);
              }}
            >
              <input
                value={joinCode}
                onChange={(event) =>
                  setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                }
                placeholder="HIVE42"
                aria-label="Table code"
                className="code-input"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={joinBusy || joining !== null || joinCode.length < 4}
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>

          <div className="panel side-panel ranked-panel">
            <span className="ranked-panel-icon">
              <BugIcon bug="queen" size={30} />
            </span>
            <div>
              <h2>How ranked works</h2>
              <p>
                A game is ranked when both players are verified accounts. Guests and unverified
                accounts play casual games only.
              </p>
              <Link to="/leaderboard" className="text-link">
                See the leaderboard →
              </Link>
            </div>
          </div>

          {mine?.recent.length ? (
            <div className="panel side-panel">
              <div className="side-panel-head">
                <h2>Recent results</h2>
              </div>
              <div className="results-list">
                {mine.recent.slice(0, 5).map((game) => (
                  <ResultRow key={game.id} game={game} userId={user.id} />
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
