import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { loadConfig } from './config';
import { openDb } from './db';
import { cleanupAuth, optionalAuth } from './auth';
import { Mailer } from './mailer';
import { GameService } from './games';
import { ComputerPlayer } from './bot';
import { attachRealtime, type RealtimeHandle } from './realtime';
import { createApiRouter } from './routes';
import { HttpError } from './errors';
import { log } from './logger';
import { isSameOrigin } from './origin';
import { ZodError } from 'zod';

const config = loadConfig();
const db = openDb(config.dataDir);
const mailer = new Mailer(config);
const games = new GameService(db, config);

// The computer opponent needs the realtime handle to broadcast its moves, but
// the handle is created after it. Route notifications through this holder.
const liveHandle: { current: RealtimeHandle | null } = { current: null };
const bot = new ComputerPlayer(db, config, games, (gameId, finished) => {
  liveHandle.current?.broadcastGame(gameId);
  if (finished) liveHandle.current?.broadcastLobby();
});

const app = express();
app.disable('x-powered-by');
// The published port is usually hit directly, so only trust forwarded headers
// when an operator explicitly says a reverse proxy sits in front. Otherwise a
// client could spoof X-Forwarded-For and bypass the IP rate limiters.
app.set('trust proxy', config.trustProxy ? 1 : false);

/** Host values are echoed into a CSP header, so keep them to safe characters. */
function safeHost(value: string | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9.\-:[\]]+$/.test(value) ? value : null;
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (process.env.NODE_ENV === 'production') {
    // The websocket origin mirrors the host the request arrived on; `'self'`
    // alone is not honoured by every browser for ws:// connections.
    const host = safeHost(req.headers.host);
    const connectSrc = ["'self'", ...(host ? [`ws://${host}`, `wss://${host}`] : [])];
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src ${connectSrc.join(' ')}`,
    );
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '128kb' }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  serveClient: false,
  maxHttpBufferSize: 256 * 1024,
  pingTimeout: 20_000,
  // Socket.IO bypasses the Express middleware chain, so validate the browser
  // origin here as well; otherwise any website could open an authenticated
  // socket with a visitor's cookies.
  allowRequest: (req, callback) => {
    const allowed = isSameOrigin(
      req.headers.origin,
      req.headers.host,
      config.publicUrl,
    );
    if (!allowed) {
      log.warn(`Rejected socket handshake from unexpected origin: ${req.headers.origin ?? 'unknown'}`);
    }
    callback(null, allowed);
  },
});

const realtime = attachRealtime(io, db, config, games, bot);
liveHandle.current = realtime;

app.use('/api', optionalAuth(db), createApiRouter({ db, config, mailer, games, realtime, bot }));

const clientDir = path.resolve(process.env.CLIENT_DIR ?? path.join(process.cwd(), 'dist', 'client'));
const indexFile = path.join(clientDir, 'index.html');

if (fs.existsSync(clientDir)) {
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      },
    }),
  );
}

app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res, next) => {
  if (!fs.existsSync(indexFile)) {
    next();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(indexFile);
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

interface HttpErrorLike {
  status?: number;
  message?: string;
  type?: string;
  stack?: string;
}

app.use((error: HttpErrorLike, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON.' });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request too large.' });
    return;
  }
  log.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error.stack ?? error.message);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

cleanupAuth(db);
const cleanupInterval = setInterval(() => cleanupAuth(db), 60 * 60 * 1000);
cleanupInterval.unref();

// Abandoned tables would otherwise sit in the lobby forever and count against
// players' open-game limits.
games.expireStaleGames();
const expiryInterval = setInterval(() => {
  if (games.expireStaleGames() > 0) realtime.broadcastLobby();
}, 6 * 60 * 60 * 1000);
expiryInterval.unref();

server.listen(config.port, config.host, () => {
  log.info(`Hive Online listening on http://${config.host}:${config.port}`);
  log.info(`Public URL: ${config.publicUrl}`);
  log.info(`Data directory: ${config.dataDir}`);
  log.info(
    config.ollama.enabled
      ? `Computer opponent: ${config.ollama.model} via ${config.ollama.url} (heuristic fallback ready).`
      : 'Computer opponent: built-in heuristic (Ollama disabled).',
  );
  void mailer.testConnection();
  bot.start();
});

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down.`);
  clearInterval(cleanupInterval);
  clearInterval(expiryInterval);
  io.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason);
});
