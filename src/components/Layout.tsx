import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useSocket } from '../socket';
import { useTheme } from '../theme';
import { LogoMark } from './LogoMark';
import { PlayerAvatar } from './PlayerAvatar';

export function Layout() {
  const { user, logout } = useAuth();
  const { online, connected } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const navItems = (
    <>
      <NavLink to="/lobby" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        Play
      </NavLink>
      <NavLink
        to="/leaderboard"
        className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
      >
        Leaderboard
      </NavLink>
      <NavLink to="/rules" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        Rules
      </NavLink>
      <NavLink to="/local" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        Hot-seat
      </NavLink>
    </>
  );

  return (
    <div className="app-shell">
      <div className="background-ornaments" aria-hidden="true">
        <div className="glow glow-one" />
        <div className="glow glow-two" />
        <svg className="ornament-hex ornament-one" viewBox="0 0 200 200">
          <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
          <polygon points="100,34 157,67 157,133 100,166 43,133 43,67" />
        </svg>
        <svg className="ornament-hex ornament-two" viewBox="0 0 200 200">
          <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
        </svg>
      </div>

      <header className="site-header">
        <div className="header-inner">
          <Link to={user ? '/lobby' : '/'} className="brand" aria-label="Hive Online home">
            <LogoMark size={40} />
            <span className="brand-type">
              <span className="brand-name">HIVE</span>
              <span className="brand-sub">online</span>
            </span>
          </Link>

          <nav className="main-nav" aria-label="Main">
            {navItems}
          </nav>

          <div className="header-actions">
            {user && connected ? (
              <span className="online-pill" title={`${online} players online`}>
                <span className="online-dot" />
                {online}
              </span>
            ) : null}

            {user ? (
              <>
                <Link to="/profile" className="user-chip">
                  <PlayerAvatar name={user.username} size={34} isGuest={user.isGuest} />
                  <span className="user-chip-copy">
                    <span className="user-chip-name">{user.username}</span>
                    <span className="user-chip-meta">
                      {user.isGuest ? 'Guest' : `${user.rating} rating`}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleLogout}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H9" />
                    <path d="M15 8l4 4-4 4M19 12H9" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Create account
                </Link>
              </>
            )}

            <button
              type="button"
              className="icon-button theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
              aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8a8.4 8.4 0 1 0 10.4 10.4Z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <span />
              <span />
            </button>
          </div>
        </div>

        {mobileOpen ? <nav className="mobile-nav">{navItems}</nav> : null}
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <LogoMark size={26} />
            <span>Hive Online</span>
          </div>
          <p>
            A self-hosted, fan-made implementation of Hive — designed by John Yianni and published by
            Gen42 Games.
          </p>
          <div className="footer-links">
            <Link to="/rules">How to play</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/local">Pass &amp; play</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
