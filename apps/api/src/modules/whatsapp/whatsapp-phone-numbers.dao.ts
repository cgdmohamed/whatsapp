import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  whatsappPhoneNumbers,
  type NewWhatsAppPhoneNumber,
  type WhatsAppPhoneNumberRow,
} from '../../db/schema';

@Injectable()
export class WhatsAppPhoneNumbersDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  listByAccount(accountId: string): Promise<WhatsAppPhoneNumberRow[]> {
    return this.db
      .select()
      .from(whatsappPhoneNumbers)
      .where(eq(whatsappPhoneNumbers.whatsappAccountId, accountId))
      .orderBy(whatsappPhoneNumbers.isDefault, whatsappPhoneNumbers.createdAt);
  }

  findDefault(accountId: string): Promise<WhatsAppPhoneNumberRow | undefined> {
    return this.db.query.whatsappPhoneNumbers.findFirst({
      where: eq(whatsappPhoneNumbers.whatsappAccountId, accountId),
      orderBy: (table, { desc }) => [desc(table.isDefault)],
    });
  }

  async replaceAllForAccount(accountId: string, numbers: NewWhatsAppPhoneNumber[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(whatsappPhoneNumbers)
        .where(eq(whatsappPhoneNumbers.whatsappAccountId, accountId));
      if (numbers.length > 0) {
        await tx.insert(whatsappPhoneNumbers).values(numbers);
      }
    });
  }
}
