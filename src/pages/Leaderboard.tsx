import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { Badge, EmptyState, Spinner } from '../components/Ui';
import { winRate } from '../lib/format';
import type { LeaderboardEntry } from '../types';

function rankMedal(rank: number): string {
  return rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .leaderboard()
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        setMe(result.me);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Could not load the leaderboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const topRating = entries[0]?.rating;

  return (
    <div className="page leaderboard-page">
      <header className="page-head leaderboard-head">
        <div>
          <div className="eyebrow">The ladder</div>
          <h1>Who owns the hive?</h1>
          <p>
            Every verified, ranked game moves the needle. Ratings start at 1200; the top of this
            table is earned one surround at a time.
          </p>
        </div>
        <div className="lobby-head-stats">
          <div className="head-stat">
            <span className="head-stat-value">{entries.length}</span>
            <span className="head-stat-label">ranked players</span>
          </div>
          <div className="head-stat">
            <span className="head-stat-value">{topRating ?? '—'}</span>
            <span className="head-stat-label">top rating</span>
          </div>
          {me?.rank ? (
            <div className="head-stat">
              <span className="head-stat-value">#{me.rank}</span>
              <span className="head-stat-label">your rank</span>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="panel">
          <Spinner label="Counting the swarm…" />
        </div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : entries.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="The ladder is empty"
            icon={<BugIcon bug="queen" size={52} />}
          >
            No ranked games have been completed yet. Verify your account, find a verified opponent
            and you could be the first name on this board.
          </EmptyState>
          <div className="button-row centered">
            <Link to="/lobby" className="btn btn-primary">
              Open the first table
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="podium-grid">
            {podium.map((entry) => (
              <article
                className={`podium-card podium-${entry.rank} ${entry.id === user?.id ? 'is-you' : ''}`}
                key={entry.id}
              >
                <div className="podium-rank">{rankMedal(entry.rank ?? 0)}</div>
                <div className="podium-avatar">
                  <PlayerAvatar name={entry.username} size={entry.rank === 1 ? 68 : 56} />
                  {entry.rank === 1 ? (
                    <span className="podium-crown">
                      <BugIcon bug="queen" size={22} />
                    </span>
                  ) : null}
                </div>
                <h3>{entry.username}</h3>
                <div className="podium-rating">{entry.rating}</div>
                <div className="podium-meta">
                  <span>{entry.games} ranked</span>
                  <span>·</span>
                  <span>{winRate(entry.wins, entry.losses)} win rate</span>
                </div>
                {entry.id === user?.id ? <Badge tone="gold">You</Badge> : null}
              </article>
            ))}
          </div>

          <section className="panel ladder-panel">
            <div className="ladder-head">
              <div>
                <h2>The top 100</h2>
                <p>Ratings update as soon as a ranked game finishes.</p>
              </div>
              <span className="ladder-legend">
                <span className="legend-dot" /> verified accounts only
              </span>
            </div>

            <div className="ladder-table" role="table" aria-label="Leaderboard">
              <div className="ladder-row ladder-header" role="row">
                <span role="columnheader">Rank</span>
                <span role="columnheader">Player</span>
                <span role="columnheader" className="ladder-num">
                  Rating
                </span>
                <span role="columnheader" className="ladder-num ladder-hide-sm">
                  Games
                </span>
                <span role="columnheader" className="ladder-num ladder-hide-sm">
                  W / L
                </span>
                <span role="columnheader" className="ladder-num ladder-hide-xs">
                  Win rate
                </span>
              </div>

              {rest.map((entry) => (
                <div
                  className={`ladder-row ${entry.id === user?.id ? 'is-you' : ''}`}
                  role="row"
                  key={entry.id}
                >
                  <span className="ladder-rank" role="cell">
                    {entry.rank}
                  </span>
                  <span className="ladder-player" role="cell">
                    <PlayerAvatar name={entry.username} size={32} />
                    <span className="ladder-name">{entry.username}</span>
                    {entry.id === user?.id ? <Badge tone="gold">You</Badge> : null}
                  </span>
                  <span className="ladder-rating" role="cell">
                    {entry.rating}
                  </span>
                  <span className="ladder-num ladder-hide-sm" role="cell">
                    {entry.games}
                  </span>
                  <span className="ladder-num ladder-hide-sm" role="cell">
                    {entry.wins} / {entry.losses}
                  </span>
                  <span className="ladder-num ladder-hide-xs" role="cell">
                    {winRate(entry.wins, entry.losses)}
                  </span>
                </div>
              ))}

              {podium.length > 0 ? (
                <div className="ladder-row ladder-podium-note">
                  <span className="ladder-rank">★</span>
                  <span className="ladder-player">
                    <span className="ladder-name">
                      {podium.map((entry) => entry.username).join(' · ')} lead the hive
                    </span>
                  </span>
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}

      {user ? (
        <section className="panel your-standing">
          <div className="your-standing-left">
            <PlayerAvatar name={user.username} size={52} isGuest={user.isGuest} />
            <div>
              <div className="eyebrow">Your standing</div>
              <h2>{user.username}</h2>
              <p>
                {user.isGuest
                  ? 'Guest sessions do not appear on the ladder. Create an account to start a rating.'
                  : user.emailVerified
                    ? me?.rank
                      ? `Ranked #${me.rank} of ${entries.length} with ${me.games} ranked games played.`
                      : 'Your rating is ready — finish a ranked game to enter the table.'
                    : 'Verify your e-mail address to make your games count for ranking.'}
              </p>
            </div>
          </div>
          <div className="your-standing-stats">
            <div>
              <span>Rating</span>
              <strong>{me?.rating ?? user.rating}</strong>
            </div>
            <div>
              <span>Ranked</span>
              <strong>{me?.games ?? user.rankedGames}</strong>
            </div>
            <div>
              <span>Record</span>
              <strong>
                {(me?.wins ?? user.wins)}–{(me?.losses ?? user.losses)}
              </strong>
            </div>
          </div>
          <div className="button-row">
            {user.isGuest ? (
              <Link to="/register" className="btn btn-primary btn-sm">
                Create an account
              </Link>
            ) : !user.emailVerified ? (
              <Link to="/profile" className="btn btn-primary btn-sm">
                Verify e-mail
              </Link>
            ) : (
              <Link to="/lobby" className="btn btn-primary btn-sm">
                Play a ranked game
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="panel your-standing guest-standing">
          <div className="your-standing-left">
            <span className="guest-standing-icon">
              <BugIcon bug="ant" size={40} />
            </span>
            <div>
              <div className="eyebrow">Not on the ladder yet</div>
              <h2>Play a ranked game</h2>
              <p>Create an account and verify your e-mail to earn a rating and a place here.</p>
            </div>
          </div>
          <div className="button-row">
            <Link to="/register" className="btn btn-primary btn-sm">
              Create account
            </Link>
            <Link to="/login" className="btn btn-ghost btn-sm">
              Sign in
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
