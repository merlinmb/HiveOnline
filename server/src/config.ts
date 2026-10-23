import fs from 'node:fs';
import path from 'node:path';

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

export interface AppConfig {
  publicUrl: string;
  port: number;
  host: string;
  dataDir: string;
  configDir: string;
  mailMode: MailMode;
  smtp: SmtpConfig;
  zeptomail: ZeptoMailConfig;
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
  const configDir = path.resolve(process.env.CONFIG_DIR ?? (isProduction ? '/config' : 'config'));
  const dataDir = path.resolve(process.env.DATA_DIR ?? (isProduction ? '/data' : 'data'));
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
