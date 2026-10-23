type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, ...args: unknown[]) {
  const stamp = new Date().toISOString();
  const line = `${stamp} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

export const log = {
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.LOG_LEVEL === 'debug') write('debug', message, ...args);
  },
  info: (message: string, ...args: unknown[]) => write('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => write('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => write('error', message, ...args),
};
