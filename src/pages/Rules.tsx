import { Link } from 'react-router-dom';
import { BugIcon } from '../components/BugIcon';
import { TileVisual } from '../components/HexTile';
import { Badge } from '../components/Ui';
import { BASE_BUGS, BUG_META, EXPANSION_BUGS } from '../../shared/types';

const SECTIONS = [
  { id: 'objective', label: 'Objective' },
  { id: 'turns', label: 'A turn' },
  { id: 'queen', label: 'The queen rule' },
  { id: 'movement', label: 'Movement' },
  { id: 'pieces', label: 'The pieces' },
  { id: 'winning', label: 'Winning' },
  { id: 'expansions', label: 'Expansions' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'interface', label: 'In this app' },
];

export default function Rules() {
  return (
    <div className="page rules-page">
      <header className="rules-hero">
        <div className="rules-hero-copy">
          <div className="eyebrow">The rulebook</div>
          <h1>The whole game, on one page.</h1>
          <p>
            Hive is a two-player game with no board and no luck. Each player has a small army of
            hexagonal tiles; the hive grows from the pieces as they are placed. Surround the enemy
            queen and the game is yours.
          </p>
          <div className="rules-facts">
            <div>
              <strong>2</strong>
              <span>players</span>
            </div>
            <div>
              <strong>15–30</strong>
              <span>minutes</span>
            </div>
            <div>
              <strong>0</strong>
              <span>dice</span>
            </div>
            <div>
              <strong>11</strong>
              <span>tiles each</span>
            </div>
          </div>
        </div>
        <div className="rules-hero-art" aria-hidden="true">
          <div className="rules-hex rules-hex-one">
            <TileVisual owner="white" bug="queen" size={92} />
          </div>
          <div className="rules-hex rules-hex-two">
            <TileVisual owner="black" bug="beetle" size={76} />
          </div>
          <div className="rules-hex rules-hex-three">
            <TileVisual owner="white" bug="ant" size={66} />
          </div>
          <div className="rules-hex rules-hex-four">
            <TileVisual owner="black" bug="spider" size={58} />
          </div>
        </div>
      </header>

      <div className="rules-layout">
        <aside className="rules-nav">
          <div className="rules-nav-inner">
            <span className="rules-nav-title">On this page</span>
            {SECTIONS.map((section, index) => (
              <a href={`#${section.id}`} key={section.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {section.label}
              </a>
            ))}
            <Link to="/local" className="btn btn-primary btn-sm rules-nav-cta">
              Try pass &amp; play
            </Link>
          </div>
        </aside>

        <div className="rules-body">
          <section className="rules-section" id="objective">
            <div className="rules-section-head">
              <span className="rules-index">01</span>
              <div>
                <div className="eyebrow">The goal</div>
                <h2>Surround the queen.</h2>
              </div>
            </div>
            <p>
              Each player has one Queen Bee. You win by occupying all six cells around your
              opponent&apos;s queen. The surrounding pieces can belong to either player — a queen
              can be trapped by her own guard.
            </p>
            <div className="rule-callout">
              <BugIcon bug="queen" size={26} />
              <p>
                The hive is one connected group of tiles. Nothing may be placed or moved in a way
                that splits it into separate islands.
              </p>
            </div>
          </section>

          <section className="rules-section" id="turns">
            <div className="rules-section-head">
              <span className="rules-index">02</span>
              <div>
                <div className="eyebrow">On your turn</div>
                <h2>Place one tile, or move one piece.</h2>
              </div>
            </div>
            <div className="rule-steps">
              <div className="rule-step">
                <span className="rule-step-num">A</span>
                <div>
                  <h3>Place</h3>
                  <p>
                    Take any tile from your hand and add it to the hive. The first tile of the
                    game is placed anywhere; every later tile must touch at least one existing
                    piece. Tiles cannot be placed on top of the hive except by a Beetle.
                  </p>
                </div>
              </div>
              <div className="rule-step">
                <span className="rule-step-num">B</span>
                <div>
                  <h3>Move</h3>
                  <p>
                    Move one piece that is already in the hive according to its own movement rule.
                    A move must leave the hive connected, and a piece cannot squeeze through a gap
                    that is too narrow for it.
                  </p>
                </div>
              </div>
            </div>
            <p className="rule-subtle">
              You cannot pass while you have a legal move. In this app, the turn passes
              automatically when no legal action exists — two passes in a row end the game as a
              stalemate.
            </p>
          </section>

          <section className="rules-section" id="queen">
            <div className="rules-section-head">
              <span className="rules-index">03</span>
              <div>
                <div className="eyebrow">The queen rule</div>
                <h2>She must join the hive by turn four.</h2>
              </div>
            </div>
            <p>
              Your Queen Bee must be placed on or before your fourth turn. Until your queen is on
              the board, none of your pieces may move — you may only place new tiles. From the
              fourth turn onward, if the queen is still in your hand, placing her is the only legal
              action.
            </p>
            <div className="rule-diagram">
              <div className="rule-turn">
                <span>Turn 1</span>
                <strong>Any tile</strong>
              </div>
              <span className="rule-arrow">→</span>
              <div className="rule-turn">
                <span>Turn 2</span>
                <strong>Any tile</strong>
              </div>
              <span className="rule-arrow">→</span>
              <div className="rule-turn">
                <span>Turn 3</span>
                <strong>Any tile</strong>
              </div>
              <span className="rule-arrow">→</span>
              <div className="rule-turn is-queen">
                <span>Turn 4</span>
                <strong>Queen required</strong>
              </div>
            </div>
          </section>

          <section className="rules-section" id="movement">
            <div className="rules-section-head">
              <span className="rules-index">04</span>
              <div>
                <div className="eyebrow">Getting around</div>
                <h2>Slide, climb, jump, crawl.</h2>
              </div>
            </div>
            <div className="movement-grid">
              <div className="movement-card">
                <h3>The sliding rule</h3>
                <p>
                  A piece that walks around the hive must fit through the gap it moves into. If
                  the two cells on either side of the gap are both occupied, the piece cannot pass.
                </p>
              </div>
              <div className="movement-card">
                <h3>The one-hive rule</h3>
                <p>
                  After any placement or move, every tile in play must remain part of a single
                  connected group. Moving the last piece out of a cell cannot break the hive apart.
                </p>
              </div>
              <div className="movement-card">
                <h3>Stacking</h3>
                <p>
                  Only Beetles (and a Mosquito copying a Beetle) may climb on top of the hive.
                  A piece under a Beetle is pinned — it cannot move until the Beetle leaves.
                </p>
              </div>
              <div className="movement-card">
                <h3>No take-backs</h3>
                <p>
                  A move is final once made. In pass &amp; play, the local table offers an undo
                  button for friendly corrections.
                </p>
              </div>
            </div>
          </section>

          <section className="rules-section" id="pieces">
            <div className="rules-section-head">
              <span className="rules-index">05</span>
              <div>
                <div className="eyebrow">The swarm</div>
                <h2>Every piece moves its own way.</h2>
              </div>
            </div>

            <div className="piece-list">
              {BASE_BUGS.map((bug) => {
                const info = BUG_META[bug];
                return (
                  <article className="piece-card" key={bug}>
                    <div className={`piece-art piece-art-${bug}`}>
                      <TileVisual owner="white" bug={bug} size={82} />
                    </div>
                    <div className="piece-copy">
                      <div className="piece-head">
                        <h3>{info.name}</h3>
                        <Badge tone="muted">×{info.count}</Badge>
                      </div>
                      <p>{info.move}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rules-subhead">
              <div className="eyebrow">Expansion pieces</div>
              <p>Included when the table is created with the expanded set.</p>
            </div>
            <div className="piece-list">
              {EXPANSION_BUGS.map((bug) => {
                const info = BUG_META[bug];
                return (
                  <article className="piece-card piece-expansion" key={bug}>
                    <div className={`piece-art piece-art-${bug}`}>
                      <TileVisual owner="black" bug={bug} size={82} />
                    </div>
                    <div className="piece-copy">
                      <div className="piece-head">
                        <h3>{info.name}</h3>
                        <Badge tone="blue">Expansion</Badge>
                        <Badge tone="muted">×{info.count}</Badge>
                      </div>
                      <p>{info.move}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rules-section" id="winning">
            <div className="rules-section-head">
              <span className="rules-index">06</span>
              <div>
                <div className="eyebrow">Ending the game</div>
                <h2>When the queen is sealed.</h2>
              </div>
            </div>
            <div className="win-grid">
              <div className="win-card is-win">
                <span className="win-symbol">♛</span>
                <h3>Victory</h3>
                <p>
                  All six neighbours of the enemy queen are occupied. The last surrounding piece
                  may belong to either player.
                </p>
              </div>
              <div className="win-card is-draw">
                <span className="win-symbol">◐</span>
                <h3>Stalemate</h3>
                <p>
                  If both queens are surrounded by the same move, or both players pass in
                  succession, the game is a draw.
                </p>
              </div>
              <div className="win-card is-loss">
                <span className="win-symbol">⚑</span>
                <h3>Resignation</h3>
                <p>
                  Either player may resign an online game. In a ranked game, resignation counts as
                  a loss for the player who resigns.
                </p>
              </div>
            </div>
          </section>

          <section className="rules-section" id="expansions">
            <div className="rules-section-head">
              <span className="rules-index">07</span>
              <div>
                <div className="eyebrow">Optional rules</div>
                <h2>Change the shape of the hive.</h2>
              </div>
            </div>

            <div className="option-row">
              <div className="option-icon">
                <BugIcon bug="ladybug" size={34} />
                <BugIcon bug="mosquito" size={34} />
              </div>
              <div>
                <h3>Ladybug &amp; Mosquito</h3>
                <p>
                  Adds one Ladybug and one Mosquito to each player&apos;s hand. The Ladybug travels
                  two spaces across the top of the hive then drops one space down; the Mosquito
                  copies the movement of any piece it touches, or the Beetle when it is on top.
                </p>
              </div>
            </div>

            <div className="option-row">
              <div className="option-icon">
                <BugIcon bug="queen" size={38} />
              </div>
              <div>
                <h3>Tournament opening</h3>
                <p>
                  The Queen Bee may not be placed on a player&apos;s first turn. This keeps the
                  opening varied and prevents an early queen rush. All other queen rules still
                  apply.
                </p>
              </div>
            </div>

            <div className="option-row">
              <div className="option-icon">
                <BugIcon bug="spider" size={36} />
              </div>
              <div>
                <h3>Classic rules</h3>
                <p>
                  The base game uses the Queen, two Spiders, two Beetles, three Grasshoppers and
                  three Ants — eleven tiles per player. No extra pieces, no opening restriction.
                </p>
              </div>
            </div>
          </section>

          <section className="rules-section" id="ranking">
            <div className="rules-section-head">
              <span className="rules-index">08</span>
              <div>
                <div className="eyebrow">The ladder</div>
                <h2>How ranked play works here.</h2>
              </div>
            </div>
            <p>
              A game is ranked only when both players are registered accounts with verified
              e-mail addresses. Guests, unverified accounts and games against either of them are
              casual and do not affect ratings.
            </p>
            <div className="ranking-facts">
              <div>
                <strong>1200</strong>
                <span>Starting rating for every new account</span>
              </div>
              <div>
                <strong>40 / 32 / 24</strong>
                <span>K-factor for your first 10, next 20, then all later games</span>
              </div>
              <div>
                <strong>Draws count</strong>
                <span>Both players receive the Elo result of a drawn game</span>
              </div>
            </div>
            <p className="rule-subtle">
              Ratings are calculated with the standard Elo formula, with no winner bonus for
              colour. The leaderboard lists verified players with at least one ranked game.
            </p>
          </section>

          <section className="rules-section" id="interface">
            <div className="rules-section-head">
              <span className="rules-index">09</span>
              <div>
                <div className="eyebrow">In this app</div>
                <h2>Small conveniences, same game.</h2>
              </div>
            </div>
            <ul className="interface-list">
              <li>
                <strong>Legal moves are highlighted.</strong> Select a tile in your rack to see
                every legal placement; select one of your pieces on the board to see its legal
                destinations.
              </li>
              <li>
                <strong>The move log is authoritative.</strong> Every placement, move and automatic
                pass appears in order, along with the current turn count.
              </li>
              <li>
                <strong>Your queen deadline is visible.</strong> A reminder under the board appears
                whenever your queen is still in hand.
              </li>
              <li>
                <strong>Tables persist.</strong> Close the tab and return later; the game is stored
                on the server. The lobby shows every table where it is your turn.
              </li>
              <li>
                <strong>Spectators are welcome.</strong> Public games can be watched from the lobby,
                with both hands and the live move log visible.
              </li>
            </ul>
          </section>

          <div className="rules-footer-cta">
            <div>
              <div className="eyebrow">Ready?</div>
              <h2>Open a table and grow a hive.</h2>
            </div>
            <div className="button-row">
              <Link to="/lobby" className="btn btn-primary">
                Find an opponent
              </Link>
              <Link to="/local" className="btn btn-ghost">
                Pass &amp; play
              </Link>
            </div>
          </div>

          <p className="rules-credit">
            Hive is designed by John Yianni and published by Gen42 Games. This is a fan-made,
            self-hosted implementation for private play.
          </p>
        </div>
      </div>
    </div>
  );
}
