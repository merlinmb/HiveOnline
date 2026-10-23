import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BugIcon } from '../components/BugIcon';
import { LogoMark } from '../components/LogoMark';
import { useToast } from '../toast';

type Status = 'idle' | 'checking' | 'success' | 'error';

export default function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { user, setUser, refresh } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [mailSent, setMailSent] = useState<boolean | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    setStatus('checking');
    api
      .verify(token)
      .then((result) => {
        setUser(result.user);
        setStatus('success');
        toast('E-mail verified. Your games now count for ranking.', 'success');
      })
      .catch((error: unknown) => {
        setStatus('error');
        setMessage(
          error instanceof ApiError ? error.message : 'This verification link could not be used.',
        );
      });
  }, [token, setUser, toast]);

  const resend = async () => {
    setResending(true);
    try {
      const result = await api.resend();
      setMailSent(result.verificationSent);
      toast(
        result.verificationSent
          ? 'A fresh verification link is on its way.'
          : 'Mail is not configured. Ask the server admin to verify your account.',
        result.verificationSent ? 'success' : 'info',
      );
      await refresh();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not resend the link.', 'error');
    } finally {
      setResending(false);
    }
  };

  const alreadyVerified = user?.emailVerified && !token;

  return (
    <div className="page narrow-page verify-page">
      <div className="panel verify-panel">
        <div className={`verify-mark status-${status}`}>
          {status === 'checking' ? (
            <span className="spinner" />
          ) : status === 'error' ? (
            <span className="verify-x">×</span>
          ) : (
            <BugIcon bug="queen" size={48} />
          )}
        </div>

        {status === 'checking' ? (
          <>
            <div className="eyebrow">One moment</div>
            <h1>Checking your link…</h1>
            <p>The hive is confirming that this address belongs to you.</p>
          </>
        ) : null}

        {status === 'success' || alreadyVerified ? (
          <>
            <div className="eyebrow">Verified</div>
            <h1>You&apos;re part of the hive.</h1>
            <p>
              {user ? (
                <>
                  <strong>{user.username}</strong>, your e-mail is confirmed. Ranked games now
                  count toward your rating and the leaderboard.
                </>
              ) : (
                'Your e-mail is confirmed. Sign in to start a ranked game.'
              )}
            </p>
            <div className="button-row centered">
              <Link to={user ? '/lobby' : '/login'} className="btn btn-primary">
                {user ? 'Go to the lobby' : 'Sign in'}
              </Link>
              <Link to={user ? '/profile' : '/rules'} className="btn btn-ghost">
                {user ? 'View your profile' : 'Read the rules'}
              </Link>
            </div>
          </>
        ) : null}

        {status === 'error' ? (
          <>
            <div className="eyebrow">Link not valid</div>
            <h1>That link has gone stale.</h1>
            <p>{message ?? 'Verification links expire after a while, or may already have been used.'}</p>
            {user && !user.emailVerified ? (
              <div className="verify-resend">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void resend()}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Send a fresh link'}
                </button>
                {mailSent === false ? (
                  <p className="field-hint">
                    The server has no mail configured. Ask the admin to run the verify-user tool.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="button-row centered">
                <Link to="/login" className="btn btn-primary">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-ghost">
                  Create an account
                </Link>
              </div>
            )}
          </>
        ) : null}

        {status === 'idle' && !alreadyVerified ? (
          <>
            <div className="eyebrow">E-mail verification</div>
            <h1>Open the link from your inbox.</h1>
            <p>
              We&apos;ve sent a verification link to your e-mail address. Open it to unlock ranked
              play. If the message is missing, check your spam folder.
            </p>
            {user && !user.emailVerified ? (
              <div className="verify-resend">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void resend()}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Resend verification e-mail'}
                </button>
                <p className="field-hint">
                  Signed in as <strong>{user.username}</strong>.{' '}
                  {user.email ? `The link will go to ${user.email}.` : ''}
                </p>
                {mailSent === false ? (
                  <p className="field-hint">
                    No mail server is configured — ask the admin to verify your account manually.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="button-row centered">
                <Link to="/login" className="btn btn-primary">
                  Sign in
                </Link>
                <Link to="/" className="btn btn-ghost">
                  Back home
                </Link>
              </div>
            )}
          </>
        ) : null}

        <div className="verify-brand">
          <LogoMark size={22} />
          <span>Hive Online account security</span>
        </div>
      </div>
    </div>
  );
}
