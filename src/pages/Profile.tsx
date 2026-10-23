import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { Badge, EmptyState, Spinner } from '../components/Ui';
import { formatDate, formatRelative, winRate } from '../lib/format';
import { useTheme } from '../theme';
import { useToast } from '../toast';
import type { Color, GameSummary, LeaderboardEntry } from '../types';

function myColor(game: GameSummary, userId: string): Color | null {
  if (game.players.white?.id === userId) return 'white';
  if (game.players.black?.id === userId) return 'black';
  return null;
}

function AccountRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="account-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [games, setGames] = useState<{
    active: GameSummary[];
    recent: GameSummary[];
  } | null>(null);
  const [rank, setRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = async () => {
    try {
      const [own, ladder] = await Promise.all([api.myGames(), api.leaderboard()]);
      setGames(own);
      setRank(ladder.me);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const active = games?.active ?? [];
  const recent = games?.recent ?? [];
  const rankedGames = rank?.games ?? user.rankedGames;
  const wins = rank?.wins ?? user.wins;
  const losses = rank?.losses ?? user.losses;
  const rating = rank?.rating ?? user.rating;

  const resend = async () => {
    setResending(true);
    try {
      const result = await api.resend();
      toast(
        result.verificationSent
          ? 'Verification e-mail sent. Check your inbox.'
          : 'Mail is not configured on this server. Ask the admin to verify your account.',
        result.verificationSent ? 'success' : 'info',
      );
      await refresh();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not resend the e-mail.', 'error');
    } finally {
      setResending(false);
    }
  };

  const signOut = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="page profile-page">
      <header className="profile-hero panel">
        <div className="profile-hero-main">
          <PlayerAvatar name={user.username} size={86} isGuest={user.isGuest} />
          <div className="profile-identity">
            <div className="eyebrow">{user.isGuest ? 'Guest session' : 'Member of the hive'}</div>
            <h1>{user.username}</h1>
            <div className="profile-badges">
              {user.isGuest ? (
                <Badge tone="muted">Guest</Badge>
              ) : user.emailVerified ? (
                <Badge tone="green">Verified</Badge>
              ) : (
                <Badge tone="danger">Unverified</Badge>
              )}
              {rank?.rank ? <Badge tone="gold">Rank #{rank.rank}</Badge> : null}
              {active.length > 0 ? <Badge tone="blue">{active.length} tables open</Badge> : null}
            </div>
            <p className="profile-sub">
              {user.isGuest
                ? 'A temporary name at the table. Create an account to keep your rating, history and seat.'
                : `Playing since ${formatDate(user.createdAt)}. ${
                    user.emailVerified
                      ? 'Your ranked games count toward the leaderboard.'
                      : 'Verify your e-mail to unlock ranked play.'
                  }`}
            </p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <span>Rating</span>
            <strong>{user.isGuest ? '—' : rating}</strong>
            <small>{user.isGuest ? 'casual only' : rankedGames < 10 ? 'provisional' : 'established'}</small>
          </div>
          <div className="profile-stat">
            <span>Ranked games</span>
            <strong>{user.isGuest ? 0 : rankedGames}</strong>
            <small>completed</small>
          </div>
          <div className="profile-stat">
            <span>Record</span>
            <strong>
              {user.isGuest ? '—' : `${wins}–${losses}`}
            </strong>
            <small>{user.isGuest ? 'not recorded' : `${winRate(wins, losses)} win rate`}</small>
          </div>
          <div className="profile-stat">
            <span>Tables open</span>
            <strong>{active.length}</strong>
            <small>waiting or live</small>
          </div>
        </div>
      </header>

      {!user.isGuest && !user.emailVerified ? (
        <div className="notice notice-gold profile-notice">
          <BugIcon bug="queen" size={24} />
          <div>
            <strong>Verify your e-mail to play ranked.</strong>
            <p>
              We sent a link to {user.email ?? 'your address'}. It may be in your spam folder. If
              mail is not configured, the server admin can verify you with the account tool.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void resend()}
            disabled={resending}
          >
            {resending ? 'Sending…' : 'Resend link'}
          </button>
        </div>
      ) : null}

      {user.isGuest ? (
        <div className="panel guest-upsell">
          <div className="guest-upsell-art">
            <BugIcon bug="queen" size={52} />
          </div>
          <div>
            <div className="eyebrow">Keep your seat</div>
            <h2>Turn this guest into a member.</h2>
            <p>
              A registered account keeps your name, rating and match history, and lets you play
              ranked games against verified opponents.
            </p>
            <div className="button-row">
              <Link to="/register" className="btn btn-primary">
                Create an account
              </Link>
              <Link to="/lobby" className="btn btn-ghost">
                Keep playing as guest
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="profile-grid">
        <div className="profile-main">
          <section className="profile-section">
            <div className="section-row">
              <div>
                <h2>Tables in progress</h2>
                <p>Games stay here until they are finished.</p>
              </div>
              <Link to="/lobby" className="text-link">
                Find a game →
              </Link>
            </div>

            {loading && !games ? (
              <div className="panel">
                <Spinner label="Loading your games…" />
              </div>
            ) : active.length === 0 ? (
              <div className="panel">
                <EmptyState title="No open tables" icon={<BugIcon bug="ant" size={44} />}>
                  Open a table or join a code from the lobby. Every game you start will appear here.
                </EmptyState>
              </div>
            ) : (
              <div className="profile-games">
                {active.map((game) => {
                  const color = myColor(game, user.id);
                  const opponent = color === 'white' ? game.players.black : game.players.white;
                  const yourTurn =
                    game.status === 'active' && color !== null && game.turn === color;
                  return (
                    <Link
                      to={`/g/${game.code}`}
                      className={`profile-game-card ${yourTurn ? 'is-your-turn' : ''}`}
                      key={game.id}
                    >
                      <span className={`profile-game-chip color-chip color-chip-${color ?? 'white'}`} />
                      <div className="profile-game-copy">
                        <strong>
                          {opponent ? `vs ${opponent.username}` : 'Waiting for a challenger'}
                        </strong>
                        <span>
                          {game.status === 'waiting'
                            ? `Table open · #${game.code} · share the code`
                            : yourTurn
                              ? 'Your move — get back to the hive'
                              : `${game.turn === 'white' ? 'Ivory' : 'Onyx'} is thinking`}
                        </span>
                      </div>
                      <div className="profile-game-meta">
                        <Badge tone={game.ranked ? 'gold' : 'muted'}>
                          {game.ranked ? 'Ranked' : 'Casual'}
                        </Badge>
                        {game.settings.expansions ? <Badge tone="blue">Expanded</Badge> : null}
                        <span className="profile-game-time">
                          {formatRelative(game.updatedAt)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="profile-section">
            <div className="section-row">
              <div>
                <h2>Recent results</h2>
                <p>The last few finished hives.</p>
              </div>
              {rank?.rank ? (
                <Link to="/leaderboard" className="text-link">
                  Leaderboard →
                </Link>
              ) : null}
            </div>

            {recent.length === 0 ? (
              <div className="panel">
                <EmptyState title="No finished games yet" icon={<BugIcon bug="spider" size={44} />}>
                  Your first result will land here — win or lose.
                </EmptyState>
              </div>
            ) : (
              <div className="panel results-table">
                {recent.map((game) => {
                  const color = myColor(game, user.id);
                  const opponent = color === 'white' ? game.players.black : game.players.white;
                  const won = game.winner !== null && color === game.winner;
                  const draw = game.winner === null;
                  return (
                    <Link to={`/g/${game.code}`} className="profile-result-row" key={game.id}>
                      <span
                        className={`result-pill ${draw ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}
                      >
                        {draw ? 'D' : won ? 'W' : 'L'}
                      </span>
                      <div className="result-copy">
                        <strong>
                          {won ? 'Victory' : draw ? 'Draw' : 'Defeat'} vs{' '}
                          {opponent?.username ?? 'Unknown'}
                        </strong>
                        <span>
                          {game.ranked ? 'Ranked' : 'Casual'} ·{' '}
                          {game.finishReason === 'queen'
                            ? 'queen surrounded'
                            : game.finishReason === 'resign'
                              ? 'resignation'
                              : 'stalemate'}{' '}
                          · {formatRelative(game.updatedAt)}
                        </span>
                      </div>
                      <span className="result-code">#{game.code}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="profile-side">
          <section className="panel account-panel">
            <div className="side-panel-head">
              <h2>Account</h2>
              <Badge tone={user.isGuest ? 'muted' : 'green'}>
                {user.isGuest ? 'Guest' : 'Registered'}
              </Badge>
            </div>
            <div className="account-rows">
              <AccountRow label="Username">{user.username}</AccountRow>
              <AccountRow label="E-mail">
                {user.isGuest ? 'Not set' : user.email ?? 'Not set'}
              </AccountRow>
              <AccountRow label="Status">
                {user.isGuest ? (
                  'Temporary session'
                ) : user.emailVerified ? (
                  <span className="status-good">Verified</span>
                ) : (
                  <span className="status-warn">Verification pending</span>
                )}
              </AccountRow>
              <AccountRow label="Joined">{formatDate(user.createdAt)}</AccountRow>
              <div className="account-row">
                <span>Appearance</span>
                <div className="theme-choices" role="group" aria-label="Colour theme">
                  <button
                    type="button"
                    className={theme === 'light' ? 'is-active' : ''}
                    onClick={() => setTheme('light')}
                    aria-pressed={theme === 'light'}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={theme === 'dark' ? 'is-active' : ''}
                    onClick={() => setTheme('dark')}
                    aria-pressed={theme === 'dark'}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => void signOut()}
              disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : user.isGuest ? 'End guest session' : 'Sign out'}
            </button>
          </section>

          <section className="panel profile-rank-panel">
            <div className="side-panel-head">
              <h2>Ranking</h2>
            </div>
            {user.isGuest ? (
              <>
                <p className="side-panel-copy">
                  Guests are welcome at every casual table, but ratings are reserved for verified
                  members.
                </p>
                <Link to="/register" className="btn btn-primary btn-block">
                  Create a ranked account
                </Link>
              </>
            ) : !user.emailVerified ? (
              <>
                <p className="side-panel-copy">
                  Your account is registered, but ranked games need a verified e-mail address.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => void resend()}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Send verification link'}
                </button>
              </>
            ) : (
              <>
                <div className="rank-display">
                  <span className="rank-number">{rating}</span>
                  <span className="rank-label">Elo rating</span>
                </div>
                <div className="rank-detail">
                  <span>
                    {rank?.rank ? `Rank #${rank.rank}` : 'Unranked until your first game'}
                  </span>
                  <span>
                    {rankedGames} {rankedGames === 1 ? 'game' : 'games'} played
                  </span>
                </div>
                <Link to="/leaderboard" className="btn btn-outline btn-block">
                  View the ladder
                </Link>
              </>
            )}
          </section>

          <section className="panel profile-tip">
            <BugIcon bug="beetle" size={30} />
            <div>
              <h3>Table tip</h3>
              <p>
                A beetle on top of an enemy piece can pin it out of the game. Climb early, and the
                centre becomes yours.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
