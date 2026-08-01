import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { mediaFiles, type MediaFileRow, type NewMediaFile } from '../../db/schema';

@Injectable()
export class MediaFilesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  insert(values: NewMediaFile): Promise<MediaFileRow> {
    return this.db.insert(mediaFiles).values(values).returning().then((rows) => rows[0]!);
  }

  findById(id: string): Promise<MediaFileRow | undefined> {
    return this.db.query.mediaFiles.findFirst({ where: eq(mediaFiles.id, id) });
  }

  findByMessageId(messageId: string): Promise<MediaFileRow | undefined> {
    return this.db.query.mediaFiles.findFirst({ where: eq(mediaFiles.messageId, messageId) });
  }

  async update(id: string, patch: Partial<MediaFileRow>): Promise<MediaFileRow | undefined> {
    const rows = await this.db.update(mediaFiles).set(patch).where(eq(mediaFiles.id, id)).returning();
    return rows[0];
  }

  async markStored(
    id: string,
    storedFilename: string,
    contentType: string,
    sizeBytes: number,
    sha256: string,
  ): Promise<MediaFileRow | undefined> {
    return this.update(id, {
      storedFilename,
      contentType,
      sizeBytes,
      sha256,
      status: 'STORED',
      errorMessage: null,
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<MediaFileRow | undefined> {
    return this.update(id, { status: 'FAILED', errorMessage });
  }

  async markSent(id: string): Promise<MediaFileRow | undefined> {
    return this.update(id, { status: 'SENT' });
  }
}
