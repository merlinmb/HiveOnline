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
import { attachRealtime } from './realtime';
import { createApiRouter } from './routes';
import { HttpError } from './errors';
import { log } from './logger';
import { ZodError } from 'zod';

const config = loadConfig();
const db = openDb(config.dataDir);
const mailer = new Mailer(config);
const games = new GameService(db, config);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self' ws: wss:",
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
});

const realtime = attachRealtime(io, db, config, games);

app.use('/api', optionalAuth(db), createApiRouter({ db, config, mailer, games, realtime }));

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

server.listen(config.port, config.host, () => {
  log.info(`Hive Online listening on http://${config.host}:${config.port}`);
  log.info(`Public URL: ${config.publicUrl}`);
  log.info(`Data directory: ${config.dataDir}`);
  void mailer.testConnection();
});

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down.`);
  clearInterval(cleanupInterval);
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
