import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LogoMark } from './components/LogoMark';
import { SocketProvider } from './socket';
import { ThemeProvider } from './theme';
import { ToastProvider } from './toast';
import AuthPage from './pages/AuthPage';
import GameRoom from './pages/GameRoom';
import Hotseat from './pages/Hotseat';
import Landing from './pages/Landing';
import Leaderboard from './pages/Leaderboard';
import Lobby from './pages/Lobby';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Rules from './pages/Rules';
import VerifyPage from './pages/Verify';

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  return null;
}

function PageLoader({ label = 'Loading the hive…' }: { label?: string }) {
  return (
    <div className="page-loader">
      <LogoMark size={54} />
      <span className="spinner" />
      <p>{label}</p>
    </div>
  );
}

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="verify" element={<VerifyPage />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="rules" element={<Rules />} />
        <Route path="local" element={<Hotseat />} />
        <Route
          path="lobby"
          element={
            <RequireUser>
              <Lobby />
            </RequireUser>
          }
        />
        <Route
          path="g/:code"
          element={
            <RequireUser>
              <GameRoom />
            </RequireUser>
          }
        />
        <Route
          path="profile"
          element={
            <RequireUser>
              <Profile />
            </RequireUser>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <ScrollToTop />
            <AppRoutes />
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
