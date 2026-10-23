import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { BugIcon } from '../components/BugIcon';
import { HiveBoard } from '../components/HiveBoard';
import { LogoMark } from '../components/LogoMark';
import { useSocket } from '../socket';
import { useToast } from '../toast';
import { createGame } from '../../shared/hive/engine';
import { coordKey } from '../../shared/hex';
import { BUGS, BUG_META, type Bug, type Color } from '../../shared/types';

const DEMO_TILES: Array<{ owner: Color; bug: Bug; q: number; r: number }> = [
  { owner: 'white', bug: 'queen', q: 0, r: 0 },
  { owner: 'black', bug: 'queen', q: 1, r: 0 },
  { owner: 'white', bug: 'ant', q: 0, r: -1 },
  { owner: 'black', bug: 'spider', q: 1, r: -1 },
  { owner: 'white', bug: 'spider', q: -1, r: 0 },
  { owner: 'black', bug: 'grasshopper', q: 2, r: 0 },
  { owner: 'white', bug: 'beetle', q: -1, r: 1 },
  { owner: 'black', bug: 'ant', q: 2, r: -1 },
  { owner: 'white', bug: 'grasshopper', q: 0, r: 1 },
  { owner: 'black', bug: 'beetle', q: 1, r: 1 },
  { owner: 'white', bug: 'ladybug', q: -1, r: 2 },
  { owner: 'black', bug: 'mosquito', q: 2, r: -2 },
];

function useDemoGame() {
  return useMemo(() => {
    const state = createGame({ expansions: true });
    DEMO_TILES.forEach((tile, index) => {
      state.hands[tile.owner][tile.bug] -= 1;
      const key = coordKey({ q: tile.q, r: tile.r });
      state.cells[key] = [
        ...(state.cells[key] ?? []),
        { id: `demo-${index}`, owner: tile.owner, bug: tile.bug },
      ];
    });
    state.queenPlaced = { white: true, black: true };
    state.placed = { white: 6, black: 6 };
    state.moveNumber = 15;
    state.turn = 'white';
    state.lastMove = {
      player: 'black',
      kind: 'move',
      bug: 'mosquito',
      from: { q: 2, r: -1 },
      to: { q: 2, r: -2 },
    };
    return state;
  }, []);
}

export default function Landing() {
  const { user, playAsGuest } = useAuth();
  const { meta, online } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [guestBusy, setGuestBusy] = useState(false);
  const demo = useDemoGame();

  const startGuest = async () => {
    setGuestBusy(true);
    try {
      await playAsGuest();
      navigate('/lobby');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not start a guest session.', 'error');
    } finally {
      setGuestBusy(false);
    }
  };

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow">
            <span className="eyebrow-rule" />
            A self-hosted hive
          </div>
          <h1>
            Two players.
            <br />
            <em>One living hive.</em>
          </h1>
          <p className="hero-lede">
            The classic tile-laying duel, played live in your browser. Build the hive, pin your
            rival&apos;s pieces and surround the queen — no luck, no dice, just the next good move.
          </p>

          <div className="button-row hero-actions">
            {user ? (
              <Link to="/lobby" className="btn btn-primary btn-lg">
                Enter the lobby
                <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <>
                {meta?.allowGuests !== false ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => void startGuest()}
                    disabled={guestBusy}
                  >
                    {guestBusy ? 'Finding a name…' : 'Play as a guest'}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : null}
                <Link to="/register" className="btn btn-ghost btn-lg">
                  Create an account
                </Link>
              </>
            )}
          </div>

          <div className="hero-note">
            {user ? (
              <span>
                Signed in as <strong>{user.username}</strong>
                {user.isGuest ? ' · guest session' : ` · ${user.rating} rating`}
              </span>
            ) : (
              <span>
                Free to play. Guests can jump straight in; accounts unlock ranked games and a
                permanent rating.
              </span>
            )}
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{online > 0 ? online : '—'}</span>
              <span className="hero-stat-label">players online</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">13</span>
              <span className="hero-stat-label">tiles per side</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">0</span>
              <span className="hero-stat-label">dice rolled</span>
            </div>
          </div>
        </div>

        <div className="hero-stage">
          <div className="hero-board-frame">
            <div className="hero-board-topline">
              <span className="turn-indicator">
                <span className="turn-dot is-active" />
                Ivory to move
              </span>
              <span className="hero-board-tag">Move 15</span>
            </div>
            <HiveBoard
              state={demo}
              legalActions={[]}
              color="white"
              canAct={false}
              selection={null}
              onSelectionChange={() => undefined}
              onAction={() => undefined}
              className="hero-board"
            />
            <div className="hero-board-foot">
              <span className="mini-tile-stack">
                <span className="mini-tile mini-tile-white" />
                <span className="mini-tile mini-tile-black" />
              </span>
              <span>Surround the queen to win</span>
            </div>
          </div>

          <div className="floating-card floating-card-rank">
            <span className="floating-card-icon">
              <BugIcon bug="queen" size={20} />
            </span>
            <div>
              <strong>Ranked Elo</strong>
              <span>Every verified game counts</span>
            </div>
          </div>

          <div className="floating-card floating-card-code">
            <BugIcon bug="ant" size={22} />
            <div>
              <span className="floating-card-label">Table code</span>
              <strong>HIVE42</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-strip" aria-label="At a glance">
        <div className="strip-item">
          <span className="strip-number">01</span>
          <div>
            <h3>Live or shoulder to shoulder</h3>
            <p>Challenge someone across the network, or share one screen in hot-seat mode.</p>
          </div>
        </div>
        <div className="strip-item">
          <span className="strip-number">02</span>
          <div>
            <h3>Invite with six characters</h3>
            <p>Open a private table and send the code. No lobbies, no waiting rooms, no fuss.</p>
          </div>
        </div>
        <div className="strip-item">
          <span className="strip-number">03</span>
          <div>
            <h3>Fair, verified ranking</h3>
            <p>An Elo rating built only from games between confirmed accounts.</p>
          </div>
        </div>
      </section>

      <section className="section how-section">
        <div className="section-head">
          <div>
            <div className="eyebrow">How it works</div>
            <h2>From first click to final surround</h2>
          </div>
          <p className="section-lede">
            Hive is easy to learn and endlessly sharp. Place a tile or move one already in the
            hive; the only hard part is seeing the move your opponent will miss.
          </p>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-index">1</span>
            <div className="step-art step-art-guest">
              <LogoMark size={58} />
            </div>
            <h3>Sit down in seconds</h3>
            <p>
              Choose a guest name and you are in. Registered players get a permanent profile,
              match history and a rating.
            </p>
          </article>
          <article className="step-card">
            <span className="step-index">2</span>
            <div className="step-art step-art-table">
              <span className="step-hex step-hex-a">♛</span>
              <span className="step-hex step-hex-b">♞</span>
              <span className="step-hex step-hex-c">♝</span>
            </div>
            <h3>Open a table or match up</h3>
            <p>
              Create a public table, send a private invite code, or hit quick match to find the
              first available opponent.
            </p>
          </article>
          <article className="step-card">
            <span className="step-index">3</span>
            <div className="step-art step-art-win">
              <span className="win-ring">
                <BugIcon bug="queen" size={40} />
              </span>
            </div>
            <h3>Close the hive</h3>
            <p>
              Get your queen out by turn four, then work with ants, beetles and spiders to seal
              every side of your rival&apos;s queen.
            </p>
          </article>
        </div>
      </section>

      <section className="section bug-section">
        <div className="section-head">
          <div>
            <div className="eyebrow">The swarm</div>
            <h2>Seven pieces. Seven personalities.</h2>
          </div>
          <p className="section-lede">
            Every piece moves differently. The expanded set adds the devious Ladybug and the
            shape-shifting Mosquito to both players&apos; hands.
          </p>
        </div>

        <div className="bug-grid">
          {BUGS.map((bug) => {
            const metaInfo = BUG_META[bug];
            return (
              <article className={`bug-card ${metaInfo.expansion ? 'is-expansion' : ''}`} key={bug}>
                <div className={`bug-card-icon bug-icon-${bug}`}>
                  <BugIcon bug={bug} size={38} />
                </div>
                <div className="bug-card-head">
                  <h3>{metaInfo.name}</h3>
                  <span className="bug-count">×{metaInfo.count}</span>
                </div>
                <p>{metaInfo.move}</p>
                {metaInfo.expansion ? <span className="bug-tag">Expansion</span> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="section fair-section">
        <div className="fair-panel">
          <div className="fair-copy">
            <div className="eyebrow">Built for a small circle</div>
            <h2>A hive of your own.</h2>
            <p>
              Hive Online is designed to live on your own network: no adverts, no tracking, no
              third-party accounts. Invite the people you actually want to play with.
            </p>
            <div className="fair-features">
              <div>
                <span className="fair-check">✓</span>
                <div>
                  <strong>Persistent games</strong>
                  <span>Refresh, reconnect or come back later — the table is still there.</span>
                </div>
              </div>
              <div>
                <span className="fair-check">✓</span>
                <div>
                  <strong>Casual and ranked</strong>
                  <span>Guests play freely; verified accounts build an Elo record.</span>
                </div>
              </div>
              <div>
                <span className="fair-check">✓</span>
                <div>
                  <strong>One screen, two minds</strong>
                  <span>A full hot-seat mode for the oldest way to play.</span>
                </div>
              </div>
            </div>
            <div className="button-row">
              <Link to="/rules" className="btn btn-ghost">
                Read the full rules
              </Link>
              <Link to="/local" className="btn btn-outline">
                Try pass &amp; play
              </Link>
            </div>
          </div>

          <div className="fair-art" aria-hidden="true">
            <div className="fair-ring fair-ring-one" />
            <div className="fair-ring fair-ring-two" />
            <div className="fair-quote">
              <span className="quote-mark">“</span>
              <p>
                The best move is rarely the loudest one. Keep the hive tight, keep your options
                open.
              </p>
              <span className="quote-foot">— a note pinned above the table</span>
            </div>
            <div className="fair-tile fair-tile-one">
              <BugIcon bug="beetle" size={34} />
            </div>
            <div className="fair-tile fair-tile-two">
              <BugIcon bug="spider" size={30} />
            </div>
            <div className="fair-tile fair-tile-three">
              <BugIcon bug="ladybug" size={26} />
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <div>
            <div className="eyebrow">Your move</div>
            <h2>The hive is already humming.</h2>
            <p>Open a table, share the code, and find out who sees one move further.</p>
          </div>
          <div className="button-row">
            {user ? (
              <Link to="/lobby" className="btn btn-primary btn-lg">
                Go to the lobby
              </Link>
            ) : (
              <>
                {meta?.allowGuests !== false ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => void startGuest()}
                    disabled={guestBusy}
                  >
                    {guestBusy ? 'One moment…' : 'Play as a guest'}
                  </button>
                ) : null}
                <Link to="/register" className="btn btn-ghost btn-lg">
                  Create an account
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
