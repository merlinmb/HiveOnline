import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth';
import { api } from './api';
import type { MetaInfo } from './types';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  online: number;
  meta: MetaInfo | null;
  lobbyVersion: number;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  online: 0,
  meta: null,
  lobbyVersion: 0,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [lobbyVersion, setLobbyVersion] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const syncMeta = () => {
      api
        .meta()
        .then((value) => {
          if (cancelled) return;
          setMeta(value);
          // A socket connection already delivers live presence. Never let a
          // slower REST snapshot overwrite the fresher socket value.
          if (!connectedRef.current) setOnline(value.online);
        })
        .catch(() => undefined);
    };

    syncMeta();
    // Keep the public presence figure fresh for signed-out visitors, who have
    // no socket connection of their own.
    const timer = window.setInterval(syncMeta, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      connectedRef.current = false;
      setSocket(null);
      setConnected(false);
      return;
    }

    const next = io({
      withCredentials: true,
      autoConnect: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = next;
    setSocket(next);

    next.on('connect', () => {
      connectedRef.current = true;
      setConnected(true);
      setLobbyVersion((value) => value + 1);
      next.emit('presence', {}, (reply: { online?: number } | undefined) => {
        if (typeof reply?.online === 'number') setOnline(reply.online);
      });
    });
    next.on('disconnect', () => {
      connectedRef.current = false;
      setConnected(false);
    });
    next.on('connect_error', () => {
      connectedRef.current = false;
      setConnected(false);
    });
    next.on('online', (count: number) => setOnline(count));
    next.on('lobby:changed', () => setLobbyVersion((value) => value + 1));

    return () => {
      connectedRef.current = false;
      next.removeAllListeners();
      next.disconnect();
      if (socketRef.current === next) socketRef.current = null;
    };
  }, [user?.id]);

  const value = useMemo(
    () => ({ socket, connected, online, meta, lobbyVersion }),
    [socket, connected, online, meta, lobbyVersion],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
