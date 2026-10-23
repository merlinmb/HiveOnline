import type { NextFunction, Request, Response } from 'express';

interface Entry {
  count: number;
  resetAt: number;
}

export function rateLimit(options: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}) {
  const buckets = new Map<string, Entry>();
  const { windowMs, max } = options;

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.key?.(req) ?? req.ip ?? 'unknown';
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}
