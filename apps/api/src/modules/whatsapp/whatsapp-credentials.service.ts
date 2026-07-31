import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { CryptoService } from '../../common/crypto/crypto.module';
import { settings } from '../../db/schema';
import type { WhatsAppSettingsDto } from '@wa/shared';

const NAMESPACE = 'whatsapp';
const KEY_APP_SECRET = 'app_secret';
const KEY_VERIFY_TOKEN = 'verify_token';
const KEY_GRAPH_API_VERSION = 'graph_api_version';

export const DEFAULT_GRAPH_API_VERSION = 'v21.0';

@Injectable()
export class WhatsAppCredentialsService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async getGraphApiVersion(): Promise<string> {
    const stored = await this.readPublicSetting(KEY_GRAPH_API_VERSION);
    return stored ?? this.configService.get<string>('META_GRAPH_API_VERSION') ?? DEFAULT_GRAPH_API_VERSION;
  }

  async setGraphApiVersion(version: string): Promise<void> {
    await this.upsertPublicSetting(KEY_GRAPH_API_VERSION, version);
  }

  async getAppSecret(): Promise<string | undefined> {
    const stored = await this.readSecretSetting(KEY_APP_SECRET);
    return stored ?? this.configService.get<string>('META_APP_SECRET');
  }

  async setAppSecret(value: string): Promise<void> {
    await this.upsertSecretSetting(KEY_APP_SECRET, value);
  }

  async getVerifyToken(): Promise<string | undefined> {
    const stored = await this.readSecretSetting(KEY_VERIFY_TOKEN);
    return stored ?? this.configService.get<string>('META_VERIFY_TOKEN');
  }

  async setVerifyToken(value: string): Promise<void> {
    await this.upsertSecretSetting(KEY_VERIFY_TOKEN, value);
  }

  async hasStoredAppSecret(): Promise<boolean> {
    return (await this.readSecretSetting(KEY_APP_SECRET)) !== undefined;
  }

  async hasStoredVerifyToken(): Promise<boolean> {
    return (await this.readSecretSetting(KEY_VERIFY_TOKEN)) !== undefined;
  }

  async getSettingsSummary(): Promise<WhatsAppSettingsDto> {
    return {
      graphApiVersion: await this.getGraphApiVersion(),
      hasAppSecret: await this.hasStoredAppSecret(),
      hasVerifyToken: await this.hasStoredVerifyToken(),
    };
  }

  private async readPublicSetting(key: string): Promise<string | undefined> {
    const [row] = await this.db
      .select()
      .from(settings)
      .where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, key)));
    return row?.publicValue ?? undefined;
  }

  private async upsertPublicSetting(key: string, value: string): Promise<void> {
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key, publicValue: value })
      .onConflictDoUpdate({
        target: [settings.namespace, settings.key],
        set: { publicValue: value },
      });
  }

  private async readSecretSetting(key: string): Promise<string | undefined> {
    const [row] = await this.db
      .select()
      .from(settings)
      .where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, key)));
    if (!row?.encryptedValue) {
      return undefined;
    }
    return this.cryptoService.decrypt(row.encryptedValue);
  }

  private async upsertSecretSetting(key: string, value: string): Promise<void> {
    const encryptedValue = this.cryptoService.encrypt(value);
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key, encryptedValue })
      .onConflictDoUpdate({
        target: [settings.namespace, settings.key],
        set: { encryptedValue },
      });
  }
}
