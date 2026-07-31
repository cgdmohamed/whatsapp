import { Global, Injectable, Inject, Module } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import type { AuditAction } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../database/database.module';
import { auditLogs, type NewAuditLog } from '../../db/schema';
import { RequestContextModule } from '../context/request-context.module';
import { RequestContextService } from '../context/request-context.service';

export interface AuditRecordInput {
  actorUserId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const context = this.requestContext.current;
    const entry: NewAuditLog = {
      actorUserId: input.actorUserId ?? context.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Record<string, unknown> | null,
      ipAddress: input.ipAddress ?? context.ipAddress,
      userAgent: input.userAgent ?? context.userAgent,
    };

    try {
      await this.db.insert(auditLogs).values(entry);
    } catch (error) {
      // Audit logging must never break the primary request flow.
      console.error('Failed to write audit log entry', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  async countForEntity(action: AuditAction, entityType: string, entityId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, action), eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)));
    return rows[0]?.value ?? 0;
  }
}

@Global()
@Module({
  imports: [RequestContextModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
