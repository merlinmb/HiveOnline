import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { TileVisual } from '../components/HexTile';
import { LogoMark } from '../components/LogoMark';
import { useSocket } from '../socket';
import { useToast } from '../toast';

type Mode = 'login' | 'register';

export default function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register, playAsGuest } = useAuth();
  const { meta } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/lobby';
  const isRegister = mode === 'register';
  const guestUpgrade = Boolean(user?.isGuest && isRegister);

  useEffect(() => {
    if (user && !guestUpgrade) navigate(from, { replace: true });
  }, [user, guestUpgrade, from, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isRegister && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (isRegister) {
        const result = await register({ username, email, password });
        toast(
          result.verificationSent
            ? 'Account created. Check your inbox to verify your e-mail.'
            : 'Account created. Mail is not configured on this server — ask the admin to verify your account.',
          'success',
        );
      } else {
        await login(username, password);
        toast('Welcome back to the hive.', 'success');
      }
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const startGuest = async () => {
    setGuestBusy(true);
    setError(null);
    try {
      await playAsGuest();
      navigate('/lobby');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start a guest session.');
    } finally {
      setGuestBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside">
          <div className="auth-aside-top">
            <span className="auth-seal">
              <LogoMark size={48} />
            </span>
            <div>
              <div className="eyebrow">Hive Online</div>
              <h1>
                {isRegister ? 'Claim a seat at the table.' : 'Back to the hive.'}
              </h1>
            </div>
          </div>

          <p className="auth-aside-copy">
            {isRegister
              ? 'An account keeps your rating, your match history and your place on the leaderboard. Verify your e-mail to make your games ranked.'
              : 'Sign in to reach your tables, your rating and everyone waiting in the lobby.'}
          </p>

          <div className="auth-benefits">
            <div className="auth-benefit">
              <span className="benefit-icon">
                <BugIcon bug="queen" size={22} />
              </span>
              <div>
                <strong>Ranked Elo</strong>
                <span>Start at 1200 and climb one verified game at a time.</span>
              </div>
            </div>
            <div className="auth-benefit">
              <span className="benefit-icon">
                <BugIcon bug="ant" size={22} />
              </span>
              <div>
                <strong>Tables that wait</strong>
                <span>Games persist when you close the tab or lose signal.</span>
              </div>
            </div>
            <div className="auth-benefit">
              <span className="benefit-icon">
                <BugIcon bug="beetle" size={22} />
              </span>
              <div>
                <strong>Private invite codes</strong>
                <span>Open a table for exactly one friend, no lobby required.</span>
              </div>
            </div>
          </div>

          <div className="auth-tiles" aria-hidden="true">
            <div className="auth-tile auth-tile-one">
              <TileVisual owner="white" bug="ladybug" size={72} />
            </div>
            <div className="auth-tile auth-tile-two">
              <TileVisual owner="black" bug="mosquito" size={64} />
            </div>
            <div className="auth-tile auth-tile-three">
              <TileVisual owner="white" bug="grasshopper" size={58} />
            </div>
          </div>
        </aside>

        <div className="auth-card panel">
          <div className="auth-card-head">
            <div className="eyebrow">{isRegister ? 'New account' : 'Welcome back'}</div>
            <h2>{isRegister ? 'Create your account' : 'Sign in'}</h2>
            <p>
              {isRegister
                ? 'Choose a name the hive will remember.'
                : 'Use your username or e-mail address.'}
            </p>
          </div>

          {guestUpgrade ? (
            <div className="notice notice-gold">
              You are currently playing as <strong>{user?.username}</strong>. Creating an account
              starts a fresh, permanent identity — your guest games and rating stay behind.
            </div>
          ) : null}

          {isRegister && meta && !meta.mailConfigured ? (
            <div className="notice notice-gold">
              <BugIcon bug="beetle" size={22} />
              <div>
                <strong>E-mail delivery is not set up on this server.</strong> You can create an
                account and play right away, but an admin has to verify your address before your
                games count for ranking.
              </div>
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}

          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span className="field-label">{isRegister ? 'Username' : 'Username or e-mail'}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete={isRegister ? 'username' : 'username'}
                autoFocus
                required
                minLength={isRegister ? 3 : 1}
                maxLength={200}
                placeholder={isRegister ? 'QueenOfSix' : 'QueenOfSix or you@example.com'}
                aria-invalid={Boolean(error)}
              />
              {isRegister ? (
                <span className="field-hint">3–20 characters. Letters, numbers, dashes, underscores.</span>
              ) : null}
            </label>

            {isRegister ? (
              <label className="field">
                <span className="field-label">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  maxLength={200}
                  placeholder="you@example.com"
                />
                <span className="field-hint">
                  Used only for verification and account recovery. Never shown to other players.
                </span>
              </label>
            ) : null}

            <label className="field">
              <span className="field-label">Password</span>
              <span className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                  minLength={isRegister ? 8 : 1}
                  maxLength={200}
                  placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {isRegister ? (
              <label className="field">
                <span className="field-label">Confirm password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={200}
                  placeholder="Repeat your password"
                />
              </label>
            ) : null}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="auth-switch">
            {isRegister ? (
              <>
                Already have a seat? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New to the hive? <Link to="/register">Create an account</Link>
              </>
            )}
          </div>

          {meta?.allowGuests !== false ? (
            <div className="auth-guest">
              <span className="auth-divider">
                <span>or</span>
              </span>
              <button
                type="button"
                className="btn btn-outline btn-block"
                onClick={() => void startGuest()}
                disabled={guestBusy}
              >
                {guestBusy ? 'Finding a name…' : 'Continue as a guest'}
              </button>
              <p>Casual games only. Guest names and results disappear with the session.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
