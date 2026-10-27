import { randomUUID } from 'node:crypto';
import type { Server as SocketServer } from 'socket.io';
import cookie from 'cookie';
import type { AppConfig } from './config';
import { COOKIE_NAME, resolveSession } from './auth';
import type { DB } from './db';
import type { ComputerPlayer } from './bot';
import type { GameService } from './games';
import { HttpError } from './errors';
import { actionSchema, chatSchema, gameIdSchema } from './validation';
import { log } from './logger';
import { IllegalMoveError } from '../../shared/hive/engine';

const MAX_SOCKETS_PER_USER = 8;
const MAX_CHAT_ROOMS = 200;
/** A player cannot usefully move faster than this; it bounds socket spam. */
const ACTION_INTERVAL_MS = 250;

export interface ChatMessage {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  isGuest: boolean;
  text: string;
  at: number;
}

export interface RealtimeHandle {
  broadcastGame: (gameId: string) => void;
  broadcastLobby: () => void;
  onlineCount: () => number;
}

interface JoinPayload {
  gameId?: unknown;
}

type Ack = (response: Record<string, unknown>) => void;

function send(ack: unknown, payload: Record<string, unknown>): void {
  if (typeof ack === 'function') (ack as Ack)(payload);
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError || error instanceof IllegalMoveError) return error.message;
  log.error('Realtime handler failed:', (error as Error)?.message ?? String(error));
  return 'Something went wrong.';
}

export function attachRealtime(
  io: SocketServer,
  db: DB,
  config: AppConfig,
  games: GameService,
  bot: ComputerPlayer,
): RealtimeHandle {
  const presence = new Map<string, Set<string>>();
  const chats = new Map<string, ChatMessage[]>();
  const lastActionAt = new Map<string, number>();
  const lastChatAt = new Map<string, number>();

  const onlineCount = () => presence.size;

  const broadcastOnline = () => {
    io.emit('online', onlineCount());
  };

  const broadcastLobby = () => {
    io.emit('lobby:changed');
  };

  const broadcastGame = (gameId: string) => {
    const row = games.getRowById(gameId);
    if (!row) return;
    io.to(`game:${gameId}`).emit('game:update', games.view(row));
  };

  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie ?? '');
      const user = resolveSession(db, cookies[COOKIE_NAME]);
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data.user = user;
      next();
    } catch (error) {
      log.warn('Socket auth failed:', (error as Error).message);
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; username: string; is_guest: number };

    // A tab-reload storm (or a script) must not accumulate sockets. Keep the
    // newest connections and drop the oldest one for this account.
    let sockets = presence.get(user.id);
    if (!sockets) {
      sockets = new Set();
      presence.set(user.id, sockets);
    }
    while (sockets.size >= MAX_SOCKETS_PER_USER) {
      const oldest = sockets.values().next().value as string | undefined;
      if (!oldest) break;
      sockets.delete(oldest);
      io.sockets.sockets.get(oldest)?.disconnect(true);
    }
    sockets.add(socket.id);
    broadcastOnline();
    log.debug(`Socket connected: ${user.username} (${socket.id}).`);

    // Presence is also available on demand: a client that misses the initial
    // broadcast (or reconnects) can ask for the current figure.
    socket.on('presence', (_payload: unknown, ack: unknown) => {
      send(ack, { online: onlineCount() });
    });

    socket.on('game:join', (payload: JoinPayload, ack: unknown) => {
      const parsed = gameIdSchema.safeParse(payload);
      if (!parsed.success) {
        send(ack, { ok: false, error: 'Invalid game.' });
        return;
      }
      const row = games.getRowById(parsed.data.gameId);
      if (!row) {
        send(ack, { ok: false, error: 'Game not found.' });
        return;
      }
      if (!games.canView(row, user.id)) {
        send(ack, { ok: false, error: 'This table is private.' });
        return;
      }
      if (row.status === 'abandoned') {
        send(ack, { ok: false, error: 'This table has expired.' });
        return;
      }
      const room = `game:${row.id}`;
      socket.join(room);
      send(ack, {
        ok: true,
        game: games.view(row),
        chats: chats.get(row.id) ?? [],
        online: onlineCount(),
      });
      // A reconnect (or an unfinished table opened afresh) may land on a turn
      // that is waiting for the computer.
      bot.schedule(row.id);
    });

    socket.on('game:action', (payload: unknown, ack: unknown) => {
      try {
        const body = payload as { gameId?: unknown; action?: unknown };
        const gameParsed = gameIdSchema.safeParse(body);
        const actionParsed = actionSchema.safeParse(body?.action);
        if (!gameParsed.success || !actionParsed.success) {
          send(ack, { ok: false, error: 'That move could not be read.' });
          return;
        }
        const now = Date.now();
        if (now - (lastActionAt.get(user.id) ?? 0) < ACTION_INTERVAL_MS) {
          send(ack, { ok: false, error: 'Slow down a little.' });
          return;
        }
        lastActionAt.set(user.id, now);
        const row = games.performAction(gameParsed.data.gameId, user.id, actionParsed.data);
        broadcastGame(row.id);
        if (row.status === 'finished') broadcastLobby();
        else bot.schedule(row.id);
        send(ack, { ok: true });
      } catch (error) {
        send(ack, { ok: false, error: errorMessage(error) });
      }
    });

    socket.on('game:resign', (payload: unknown, ack: unknown) => {
      try {
        const parsed = gameIdSchema.safeParse(payload);
        if (!parsed.success) {
          send(ack, { ok: false, error: 'Invalid game.' });
          return;
        }
        const row = games.resign(parsed.data.gameId, user.id);
        broadcastGame(row.id);
        broadcastLobby();
        send(ack, { ok: true });
      } catch (error) {
        send(ack, { ok: false, error: errorMessage(error) });
      }
    });

    socket.on('game:chat', (payload: unknown, ack: unknown) => {
      try {
        const parsed = chatSchema.safeParse(payload);
        if (!parsed.success) {
          send(ack, { ok: false, error: 'Messages must be 1–280 characters.' });
          return;
        }
        const now = Date.now();
        if (now - (lastChatAt.get(user.id) ?? 0) < 700) {
          send(ack, { ok: false, error: 'Slow down a little.' });
          return;
        }
        const row = games.getRowById(parsed.data.gameId);
        if (!row) {
          send(ack, { ok: false, error: 'Game not found.' });
          return;
        }
        if (!games.canView(row, user.id)) {
          send(ack, { ok: false, error: 'This table is private.' });
          return;
        }
        lastChatAt.set(user.id, now);
        const message: ChatMessage = {
          id: randomUUID(),
          gameId: row.id,
          userId: user.id,
          username: user.username,
          isGuest: user.is_guest === 1,
          text: parsed.data.text,
          at: now,
        };
        const list = chats.get(row.id) ?? [];
        list.push(message);
        if (list.length > 60) list.splice(0, list.length - 60);
        // Re-insert so the map is ordered oldest-first for the LRU trim below.
        chats.delete(row.id);
        chats.set(row.id, list);
        if (chats.size > MAX_CHAT_ROOMS) {
          const oldestRoom = chats.keys().next().value as string | undefined;
          if (oldestRoom) chats.delete(oldestRoom);
        }
        socket.join(`game:${row.id}`);
        io.to(`game:${row.id}`).emit('game:chat', message);
        send(ack, { ok: true });
      } catch (error) {
        send(ack, { ok: false, error: errorMessage(error) });
      }
    });

    socket.on('disconnect', () => {
      const sockets = presence.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          presence.delete(user.id);
          lastActionAt.delete(user.id);
          lastChatAt.delete(user.id);
        }
      }
      broadcastOnline();
    });
  });

  return { broadcastGame, broadcastLobby, onlineCount };
}
