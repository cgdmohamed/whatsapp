import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

@Injectable()
export class InboxMediaStorage {
  private readonly dir: string;

  constructor(configService: ConfigService) {
    this.dir = configService.get<string>('INBOX_MEDIA_DIR') ?? join(process.cwd(), 'data', 'inbox-media');
    mkdirSync(this.dir, { recursive: true });
  }

  pathFor(filename: string): string {
    return join(this.dir, filename);
  }

  exists(filename: string): boolean {
    return existsSync(this.pathFor(filename));
  }

  save(filename: string, buffer: Buffer): void {
    writeFileSync(this.pathFor(filename), buffer);
  }

  read(filename: string): Buffer {
    return readFileSync(this.pathFor(filename));
  }

  stream(filename: string): Readable {
    return createReadStream(this.pathFor(filename));
  }

  remove(filename: string): void {
    try {
      if (this.exists(filename)) {
        unlinkSync(this.pathFor(filename));
      }
    } catch {
      // best-effort cleanup
    }
  }
}
