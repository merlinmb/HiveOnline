import fs from 'node:fs';
import path from 'node:path';
import { parseBotDifficulty, type BotDifficulty } from '../../shared/difficulty';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  allowNoAuth: boolean;
}

export type MailMode = 'smtp' | 'zeptomail' | 'log';

export interface ZeptoMailConfig {
  apiUrl: string;
  token: string;
}

export interface OllamaConfig {
  enabled: boolean;
  url: string;
  model: string;
  timeoutMs: number;
  minDelayMs: number;
}

export interface AppConfig {
  publicUrl: string;
  port: number;
  host: string;
  dataDir: string;
  configDir: string;
  mailMode: MailMode;
  smtp: SmtpConfig;
  zeptomail: ZeptoMailConfig;
  ollama: OllamaConfig;
  bot: {
    /** `auto` scales with the human's rating; a level pins every new game. */
    difficulty: BotDifficulty;
  };
  registration: {
    allowGuests: boolean;
    requireVerifiedForRanked: boolean;
  };
  sessionDays: number;
}

const isProduction = process.env.NODE_ENV === 'production';

function envBool(value: string | undefined, fallback: boolean): boolean {
  const parsed = envBoolOptional(value);
  return parsed ?? fallback;
}

function envBoolOptional(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function readJson(file: string): Partial<AppConfig> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[config] Could not read ${file}:`, (error as Error).message);
    }
    return null;
  }
}

export function loadConfig(): AppConfig {
  // The container uses absolute /config and /data. A production build run
  // directly on Windows should still stay inside the project folder.
  const containerPaths = isProduction && process.platform !== 'win32';
  const configDir = path.resolve(
    process.env.CONFIG_DIR ?? (containerPaths ? '/config' : 'config'),
  );
  const dataDir = path.resolve(
    process.env.DATA_DIR ?? (containerPaths ? '/data' : 'data'),
  );
  const file = path.join(configDir, 'app.json');
  const fileConfig = readJson(file) ?? {};

  const smtpHost = process.env.SMTP_HOST ?? fileConfig.smtp?.host ?? '';
  const rawMailMode = (process.env.MAIL_MODE ?? fileConfig.mailMode ?? '').toLowerCase();
  const mailMode: MailMode =
    rawMailMode === 'smtp' || rawMailMode === 'zeptomail' || rawMailMode === 'log'
      ? rawMailMode
      : smtpHost
        ? 'smtp'
        : 'log';

  const ollamaUrl = (
    process.env.OLLAMA_URL ??
    fileConfig.ollama?.url ??
    'http://localhost:11434'
  ).trim();
  const ollamaEnabled =
    envBoolOptional(process.env.OLLAMA_ENABLED) ??
    fileConfig.ollama?.enabled ??
    ollamaUrl.length > 0;

  const config: AppConfig = {
    publicUrl:
      process.env.PUBLIC_URL ??
      fileConfig.publicUrl ??
      (isProduction ? 'http://homebridge.local:8085' : 'http://localhost:5173'),
    port: Number(process.env.PORT ?? fileConfig.port ?? 3000),
    host: process.env.HOST ?? fileConfig.host ?? '0.0.0.0',
    dataDir: process.env.DATA_DIR ?? fileConfig.dataDir ?? dataDir,
    configDir,
    mailMode,
    smtp: {
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? fileConfig.smtp?.port ?? 587),
      secure: envBool(process.env.SMTP_SECURE, Boolean(fileConfig.smtp?.secure)),
      user: process.env.SMTP_USER ?? fileConfig.smtp?.user ?? '',
      pass: process.env.SMTP_PASS ?? fileConfig.smtp?.pass ?? '',
      from:
        process.env.SMTP_FROM ??
        fileConfig.smtp?.from ??
        'Hive Online <hive@homebridge.local>',
      allowNoAuth:
        envBoolOptional(process.env.SMTP_ALLOW_NO_AUTH) ??
        fileConfig.smtp?.allowNoAuth ??
        false,
    },
    zeptomail: {
      apiUrl:
        process.env.ZEPTOMAIL_API_URL ??
        fileConfig.zeptomail?.apiUrl ??
        'https://api.zeptomail.eu/v1.1/email',
      token: process.env.ZEPTOMAIL_TOKEN ?? fileConfig.zeptomail?.token ?? '',
    },
    ollama: {
      enabled: ollamaEnabled && ollamaUrl.length > 0,
      url: ollamaUrl.replace(/\/+$/, ''),
      model:
        process.env.OLLAMA_MODEL ??
        fileConfig.ollama?.model ??
        'llama3.1:8b',
      timeoutMs: envInt(
        process.env.OLLAMA_TIMEOUT_MS,
        fileConfig.ollama?.timeoutMs ?? 12_000,
        1_000,
        120_000,
      ),
      minDelayMs: envInt(
        process.env.BOT_MIN_DELAY_MS,
        fileConfig.ollama?.minDelayMs ?? 900,
        0,
        10_000,
      ),
    },
    bot: {
      difficulty: parseBotDifficulty(
        process.env.BOT_DIFFICULTY ?? fileConfig.bot?.difficulty ?? 'auto',
      ),
    },
    registration: {
      allowGuests:
        envBoolOptional(process.env.ALLOW_GUESTS) ??
        fileConfig.registration?.allowGuests ??
        true,
      requireVerifiedForRanked:
        envBoolOptional(process.env.REQUIRE_VERIFIED) ??
        fileConfig.registration?.requireVerifiedForRanked ??
        true,
    },
    sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(config.dataDir, { recursive: true });

  if (!fs.existsSync(file)) {
    try {
      fs.writeFileSync(
        file,
        `${JSON.stringify(
          {
            publicUrl: config.publicUrl,
            mailMode: config.mailMode,
            registration: config.registration,
            smtp: config.smtp,
            zeptomail: { apiUrl: config.zeptomail.apiUrl, token: '' },
            ollama: config.ollama,
            bot: config.bot,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      console.log(`[config] Created ${file}. Edit it to configure e-mail.`);
    } catch (error) {
      console.warn(`[config] Could not create ${file}:`, (error as Error).message);
    }
  }

  return config;
}
