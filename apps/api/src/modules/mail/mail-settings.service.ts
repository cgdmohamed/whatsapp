import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { CryptoService } from '../../common/crypto/crypto.module';
import { settings } from '../../db/schema';

const NAMESPACE = 'mail';
const KEY_PASSWORD = 'password';
const KEY_CONFIG = 'config';
const KEY_TEST = 'last_test';

export interface MailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  replyTo: string;
}

export interface MailConfigDto extends MailConfig {
  lastTestAt: string | null;
  lastTestError: string | null;
  lastSentAt: string | null;
  lastFailedAt: string | null;
}

export interface SaveMailConfigInput {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

function mask(value: string | undefined): string {
  if (!value) return '';
  return value.length <= 4 ? '••••' : `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

@Injectable()
export class MailSettingsService {
  private readonly logger = new Logger(MailSettingsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async getConfig(): Promise<MailConfig> {
    const stored = await this.readConfigValue();
    const env = this.configService;
    return {
      enabled: stored.enabled ?? env.get<boolean>('MAIL_ENABLED', false),
      host: stored.host ?? env.get<string>('MAIL_HOST', ''),
      port: stored.port ?? env.get<number>('MAIL_PORT', 587),
      secure: stored.secure ?? env.get<boolean>('MAIL_SECURE', true),
      username: stored.username ?? env.get<string>('MAIL_USERNAME', ''),
      hasPassword: Boolean(await this.readSecret(KEY_PASSWORD)) || Boolean(env.get<string>('MAIL_PASSWORD')),
      fromEmail: stored.fromEmail ?? env.get<string>('MAIL_FROM_EMAIL', ''),
      fromName: stored.fromName ?? env.get<string>('MAIL_FROM_NAME', ''),
      replyTo: stored.replyTo ?? env.get<string>('MAIL_REPLY_TO', ''),
    };
  }

  async getConfigDto(): Promise<MailConfigDto> {
    const [config, lastTest] = await Promise.all([this.getConfig(), this.readLastTest()]);
    const lastEvent = await this.lastEventTimes();
    return {
      ...config,
      lastTestAt: lastTest?.at ?? null,
      lastTestError: lastTest?.error ?? null,
      lastSentAt: lastEvent.sentAt,
      lastFailedAt: lastEvent.failedAt,
    };
  }

  async save(input: SaveMailConfigInput): Promise<MailConfigDto> {
    const current = await this.readConfigValue();
    const next = {
      enabled: input.enabled ?? current.enabled,
      host: input.host ?? current.host,
      port: input.port ?? current.port,
      secure: input.secure ?? current.secure,
      username: input.username ?? current.username,
      fromEmail: input.fromEmail ?? current.fromEmail,
      fromName: input.fromName ?? current.fromName,
      replyTo: input.replyTo ?? current.replyTo,
    };
    await this.upsertConfigValue(next);
    if (input.password) {
      const encrypted = this.cryptoService.encrypt(input.password);
      await this.upsertSecret(KEY_PASSWORD, encrypted);
      this.logger.log('SMTP password replaced (stored encrypted)');
    }
    return this.getConfigDto();
  }

  async getPassword(): Promise<string | undefined> {
    const row = await this.readSecret(KEY_PASSWORD);
    if (row) return this.cryptoService.decrypt(row);
    return this.configService.get<string>('MAIL_PASSWORD') || undefined;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = await this.getConfig();
    const password = await this.getPassword();
    let transporter: Transporter<SMTPTransport.SentMessageInfo> | undefined;
    try {
      transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.username ? { user: config.username, pass: password ?? '' } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      await transporter.verify();
      await this.writeLastTest({ ok: true, at: new Date().toISOString(), error: null });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.writeLastTest({ ok: false, at: new Date().toISOString(), error: message });
      this.logger.warn(`SMTP connection test failed: ${message}`);
      return { ok: false, error: message };
    } finally {
      transporter?.close();
    }
  }

  async recordSent(providerMessageId: string): Promise<void> {
    await this.writeMarker('sent', providerMessageId);
  }

  async recordFailed(): Promise<void> {
    await this.writeMarker('failed', null);
  }

  getMasked(username: string): string {
    return mask(username);
  }

  maskPassword(): string {
    return '••••••••';
  }

  async queueHealth(): Promise<{ active: number; waiting: number; failed: number }> {
    const row = await this.readConfigValue();
    void row;
    return { active: 0, waiting: 0, failed: 0 };
  }

  // ---------- persistence ----------

  private async readConfigValue(): Promise<Partial<MailConfig>> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, KEY_CONFIG)));
    if (!row?.publicValue) return {};
    try {
      return JSON.parse(row.publicValue) as Partial<MailConfig>;
    } catch {
      return {};
    }
  }

  private async upsertConfigValue(value: Partial<MailConfig>): Promise<void> {
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key: KEY_CONFIG, publicValue: JSON.stringify(value) })
      .onConflictDoUpdate({ target: [settings.namespace, settings.key], set: { publicValue: JSON.stringify(value) } });
  }

  private async readSecret(key: string): Promise<string | undefined> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, key)));
    return row?.encryptedValue ?? undefined;
  }

  private async upsertSecret(key: string, encryptedValue: string): Promise<void> {
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key, encryptedValue })
      .onConflictDoUpdate({ target: [settings.namespace, settings.key], set: { encryptedValue } });
  }

  private async readLastTest(): Promise<{ at: string | null; error: string | null } | null> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, KEY_TEST)));
    if (!row?.publicValue) return null;
    try {
      return JSON.parse(row.publicValue) as { at: string | null; error: string | null };
    } catch {
      return null;
    }
  }

  private async writeLastTest(value: { ok: boolean; at: string; error: string | null }): Promise<void> {
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key: KEY_TEST, publicValue: JSON.stringify({ at: value.at, error: value.error }) })
      .onConflictDoUpdate({ target: [settings.namespace, settings.key], set: { publicValue: JSON.stringify({ at: value.at, error: value.error }) } });
  }

  private async writeMarker(kind: 'sent' | 'failed', value: string | null): Promise<void> {
    const key = `last_${kind}`;
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key, publicValue: new Date().toISOString() })
      .onConflictDoUpdate({ target: [settings.namespace, settings.key], set: { publicValue: new Date().toISOString() } });
    void value;
  }

  private async lastEventTimes(): Promise<{ sentAt: string | null; failedAt: string | null }> {
    const [sent] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, 'last_sent')));
    const [failed] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, 'last_failed')));
    return { sentAt: sent?.publicValue ?? null, failedAt: failed?.publicValue ?? null };
  }
}
