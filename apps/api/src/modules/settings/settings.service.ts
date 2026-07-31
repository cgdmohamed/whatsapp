import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { SettingsDto, PublicSettingsDto } from '@wa/shared';
import { DEFAULT_SETTINGS, type DefaultSettings } from '@wa/config';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { CryptoService } from '../../common/crypto/crypto.module';
import { settings } from '../../db/schema';

const NAMESPACE = 'app';

export type SettingsKey = keyof SettingsDto;

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly cryptoService: CryptoService,
  ) {}

  async getAll(): Promise<SettingsDto> {
    const rows = await this.db.select().from(settings).where(eq(settings.namespace, NAMESPACE));
    const map = new Map(rows.map((row) => [row.key, row.publicValue ?? undefined]));

    return {
      companyName: this.read(map, 'companyName'),
      defaultTimezone: this.read(map, 'defaultTimezone'),
      defaultCountry: this.read(map, 'defaultCountry'),
      defaultLanguage: this.read(map, 'defaultLanguage') as SettingsDto['defaultLanguage'],
      maxImportFileSizeMb: this.readNumber(map, 'maxImportFileSizeMb'),
      sessionDurationMinutes: this.readNumber(map, 'sessionDurationMinutes'),
      campaignSendingConcurrency: this.readNumber(map, 'campaignSendingConcurrency'),
      campaignMessagesPerMinute: this.readNumber(map, 'campaignMessagesPerMinute'),
    };
  }

  async getPublic(): Promise<PublicSettingsDto> {
    const all = await this.getAll();
    return {
      companyName: all.companyName,
      defaultTimezone: all.defaultTimezone,
      defaultCountry: all.defaultCountry,
      defaultLanguage: all.defaultLanguage,
    };
  }

  async updateAll(dto: SettingsDto): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(dto) as Array<[SettingsKey, unknown]>) {
        const stringValue = String(value);
        await tx
          .insert(settings)
          .values({ namespace: NAMESPACE, key, publicValue: stringValue })
          .onConflictDoUpdate({
            target: [settings.namespace, settings.key],
            set: { publicValue: stringValue },
          });
      }
    });
  }

  async getSecret(key: string): Promise<string | undefined> {
    const [row] = await this.db
      .select()
      .from(settings)
      .where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, key)));
    if (!row?.encryptedValue) {
      return undefined;
    }
    return this.cryptoService.decrypt(row.encryptedValue);
  }

  async setSecret(key: string, value: string): Promise<void> {
    const encryptedValue = this.cryptoService.encrypt(value);
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key, encryptedValue })
      .onConflictDoUpdate({
        target: [settings.namespace, settings.key],
        set: { encryptedValue },
      });
  }

  private read(map: Map<string, string | undefined>, key: SettingsKey): string {
    const value = map.get(key);
    const fallback = DEFAULT_SETTINGS[key as keyof DefaultSettings];
    return value ?? String(fallback);
  }

  private readNumber(map: Map<string, string | undefined>, key: SettingsKey): number {
    const value = map.get(key);
    if (value === undefined) {
      return DEFAULT_SETTINGS[key as keyof DefaultSettings] as number;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (DEFAULT_SETTINGS[key as keyof DefaultSettings] as number);
  }
}
