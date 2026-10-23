import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from './config';
import { log } from './logger';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Accepts `Name <address>` or a bare address. */
export function splitAddress(value: string): { name: string; address: string } {
  const match = value.trim().match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, '').trim() || 'Hive Online',
      address: match[2].trim(),
    };
  }
  return { name: 'Hive Online', address: value.trim() };
}

export class Mailer {
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfig) {
    if (this.config.mailMode === 'smtp' && this.config.smtp.host) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth:
          this.config.smtp.user || this.config.smtp.pass
            ? { user: this.config.smtp.user, pass: this.config.smtp.pass }
            : undefined,
      });
      const auth = this.config.smtp.user ? 'authenticated' : 'no authentication';
      log.info(
        `Mail enabled via SMTP ${this.config.smtp.host}:${this.config.smtp.port} (${auth}).`,
      );
      if (!this.config.smtp.user && !this.config.smtp.allowNoAuth) {
        log.warn(
          'SMTP is configured without credentials. Set SMTP_ALLOW_NO_AUTH=true for an open relay such as Mailpit.',
        );
      }
    } else if (this.config.mailMode === 'zeptomail' && this.config.zeptomail.token) {
      log.info(`Mail enabled via ZeptoMail (${this.config.zeptomail.apiUrl}).`);
    } else if (this.config.mailMode === 'zeptomail') {
      log.warn(
        'MAIL_MODE=zeptomail but ZEPTOMAIL_TOKEN is empty. Verification links will be written to the container log instead.',
      );
    } else {
      log.warn(
        'E-mail is not configured. Verification links will be written to the container log instead. Set MAIL_MODE and the matching mail settings to enable delivery.',
      );
    }
  }

  get configured(): boolean {
    if (this.config.mailMode === 'smtp') return Boolean(this.config.smtp.host);
    if (this.config.mailMode === 'zeptomail') return Boolean(this.config.zeptomail.token);
    return false;
  }

  get mode(): AppConfig['mailMode'] {
    return this.config.mailMode;
  }

  verificationUrl(token: string): string {
    return `${this.config.publicUrl.replace(/\/$/, '')}/verify?token=${encodeURIComponent(token)}`;
  }

  async sendVerification(
    user: { username: string; email: string | null },
    token: string,
  ): Promise<boolean> {
    if (!user.email) return false;
    const url = this.verificationUrl(token);

    if (this.config.mailMode === 'zeptomail') {
      if (!this.config.zeptomail.token) {
        log.warn(`Verification link for ${user.username} <${user.email}>: ${url}`);
        return false;
      }
      return this.sendViaZeptoMail(user, url);
    }

    if (!this.transporter) {
      log.warn(`Verification link for ${user.username} <${user.email}>: ${url}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.smtp.from,
        to: user.email,
        subject: 'Verify your Hive Online account',
        text: this.verificationText(user, url),
        html: this.verificationHtml(user, url),
      });
      return true;
    } catch (error) {
      log.error(`Could not send verification e-mail to ${user.email}:`, (error as Error).message);
      log.warn(`Verification link for ${user.username}: ${url}`);
      return false;
    }
  }

  private verificationText(user: { username: string }, url: string): string {
    return `Welcome to Hive Online, ${user.username}.\n\nVerify your e-mail (link valid for 48 hours):\n${url}\n`;
  }

  private verificationHtml(user: { username: string }, url: string): string {
    const safeName = escapeHtml(user.username);
    return `
      <div style="background:#0f1412;padding:32px;font-family:Georgia,serif;color:#f3efe2">
        <div style="max-width:560px;margin:0 auto;background:#19231e;border:1px solid #33443a;border-radius:18px;padding:36px">
          <div style="font-size:13px;letter-spacing:3px;color:#e7b34a;text-transform:uppercase">Hive Online</div>
          <h1 style="font-size:30px;margin:12px 0 8px;font-weight:600">Welcome to the hive, ${safeName}.</h1>
          <p style="font-family:Arial,sans-serif;line-height:1.6;color:#c9d1c6">
            Confirm your e-mail address to unlock ranked games and appear on the leaderboard.
          </p>
          <p style="margin:28px 0">
            <a href="${url}" style="display:inline-block;background:#e7b34a;color:#17130c;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;padding:14px 26px;border-radius:10px">
              Verify my e-mail
            </a>
          </p>
          <p style="font-family:Arial,sans-serif;font-size:13px;color:#8fa094;line-height:1.6">
            This link expires in 48 hours. If you did not create this account you can ignore this message.
          </p>
          <p style="font-family:Arial,sans-serif;font-size:12px;color:#61726a;word-break:break-all">
            ${url}
          </p>
        </div>
      </div>`;
  }

  private async sendViaZeptoMail(
    user: { username: string; email: string | null },
    url: string,
  ): Promise<boolean> {
    const from = splitAddress(this.config.smtp.from);
    const body = {
      from: { address: from.address, name: from.name },
      to: [
        {
          email_address: {
            address: user.email,
            name: user.username,
          },
        },
      ],
      subject: 'Verify your Hive Online account',
      textbody: this.verificationText(user, url),
      htmlbody: this.verificationHtml(user, url),
    };

    try {
      const response = await fetch(this.config.zeptomail.apiUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Zoho-enczapikey ${this.config.zeptomail.token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        log.error(
          `ZeptoMail rejected the verification e-mail (${response.status}): ${detail.slice(0, 300)}`,
        );
        log.warn(`Verification link for ${user.username}: ${url}`);
        return false;
      }
      return true;
    } catch (error) {
      log.error(`Could not reach ZeptoMail:`, (error as Error).message);
      log.warn(`Verification link for ${user.username}: ${url}`);
      return false;
    }
  }

  async testConnection(): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      log.info('SMTP connection verified.');
    } catch (error) {
      log.warn('SMTP connection test failed:', (error as Error).message);
    }
  }
}
