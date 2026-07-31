import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { WhatsAppAccountStatus } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { whatsappAccounts, type NewWhatsAppAccount, type WhatsAppAccountRow } from '../../db/schema';

@Injectable()
export class WhatsAppAccountsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  getFirst(): Promise<WhatsAppAccountRow | undefined> {
    return this.db.query.whatsappAccounts.findFirst({ orderBy: asc(whatsappAccounts.createdAt) });
  }

  insert(data: NewWhatsAppAccount): Promise<WhatsAppAccountRow | undefined> {
    return this.db.insert(whatsappAccounts).values(data).returning().then((rows) => rows[0]);
  }

  update(id: string, values: Partial<NewWhatsAppAccount>): Promise<WhatsAppAccountRow | undefined> {
    return this.db
      .update(whatsappAccounts)
      .set(values)
      .where(eq(whatsappAccounts.id, id))
      .returning()
      .then((rows) => rows[0]);
  }

  setStatus(id: string, status: WhatsAppAccountStatus): Promise<WhatsAppAccountRow | undefined> {
    return this.update(id, { status });
  }

  recordConnectionTest(id: string, success: boolean, errorMessage?: string): Promise<WhatsAppAccountRow | undefined> {
    return this.update(id, {
      status: success ? 'CONNECTED' : 'ERROR',
      lastConnectionTestAt: new Date(),
      lastConnectionError: success ? null : (errorMessage ?? null),
    });
  }

  setAccessToken(
    id: string,
    encryptedAccessToken: string,
    accessTokenLastFour: string,
  ): Promise<WhatsAppAccountRow | undefined> {
    return this.update(id, {
      encryptedAccessToken,
      accessTokenLastFour,
      tokenUpdatedAt: new Date(),
    });
  }

  setBusinessAccountInfo(id: string, metaBusinessAccountId: string | null): Promise<WhatsAppAccountRow | undefined> {
    return this.update(id, { metaBusinessAccountId });
  }
}
