import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { BudgetUsage } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { AuditService } from '../../common/audit/audit.module';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { toMoney } from '../../common/money';
import { settings, type BudgetPolicyRow } from '../../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BudgetPoliciesDao, periodFor, usageStatus } from './budget-policies.dao';

const NAMESPACE = 'budget-alerts';
const KEY = 'last-levels';

interface StoredLevel {
  level: BudgetUsage['status'];
  periodKey: string;
  at: string;
}

type AlertLevel = 'WARNING' | 'CRITICAL' | 'BLOCKED';

const LEVEL_ORDER: Record<BudgetUsage['status'], number> = { OK: 0, WARNING: 1, CRITICAL: 2, BLOCKED: 3 };

@Injectable()
export class BudgetAlertsService {
  private readonly logger = new Logger(BudgetAlertsService.name);

  constructor(
    private readonly dao: BudgetPoliciesDao,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async checkAll(asOf = new Date()): Promise<number> {
    const policies = await this.dao.activePolicies(asOf);
    let notified = 0;
    for (const policy of policies) {
      if (await this.checkPolicy(policy, asOf)) {
        notified += 1;
      }
    }
    if (notified > 0) {
      this.logger.log(`Budget alerts dispatched for ${notified} policy(-ies)`);
    }
    return notified;
  }

  private async checkPolicy(policy: BudgetPolicyRow, asOf: Date): Promise<boolean> {
    const period = periodFor(policy, asOf);
    const usage = await this.dao.usageForPolicy(policy, period.start, period.end);
    const limit = toMoney(policy.amountLimit) ?? 0;
    const status = usageStatus(policy, usage, limit);
    const periodKey = this.periodKey(policy, asOf);
    const stored = await this.readLevels();
    const prev = stored[policy.id];

    if (status === 'OK') {
      if (prev?.periodKey !== periodKey || prev?.level !== 'OK') {
        await this.writeLevel(policy.id, { level: 'OK', periodKey, at: asOf.toISOString() });
      }
      return false;
    }

    const newPeriod = prev?.periodKey !== periodKey;
    const escalated = !prev || prev.level === 'OK' || newPeriod || LEVEL_ORDER[status] > LEVEL_ORDER[prev.level];
    if (!escalated) {
      return false;
    }

    await this.notify(policy, usage, limit, status, asOf);
    await this.writeLevel(policy.id, { level: status, periodKey, at: asOf.toISOString() });
    return true;
  }

  private periodKey(policy: BudgetPolicyRow, asOf: Date): string {
    const period = periodFor(policy, asOf);
    return period.start ? period.start.toISOString().slice(0, 10) : 'lifetime';
  }

  private async notify(
    policy: BudgetPolicyRow,
    usage: { totalUsage: number },
    limit: number,
    status: AlertLevel,
    asOf: Date,
  ): Promise<void> {
    const percent = limit > 0 ? (usage.totalUsage / limit) * 100 : 0;
    const severity = status === 'CRITICAL' || status === 'BLOCKED' ? 'ERROR' : 'WARNING';
    const scopeLabel = `${policy.scopeType}:${policy.scopeId ?? 'ALL'}`;

    await this.notificationsService.notifyTargets({
      roles: ['ADMIN'],
      type: 'SYSTEM',
      severity,
      titleAr: `تنبيه الميزانية: ${policy.name}`,
      titleEn: `Budget alert: ${policy.name}`,
      messageAr: `استهلاك ميزانية «${policy.name}» وصل إلى ${percent.toFixed(1)}% (الحالة: ${status}).`,
      messageEn: `Budget "${policy.name}" usage reached ${percent.toFixed(1)}% (status: ${status}).`,
      actionUrl: '/settings/whatsapp-pricing',
      entityType: 'budget_policy',
      entityId: policy.id,
      category: 'management',
      email: {
        templateKey: 'budget-alert',
        vars: {
          level: status,
          policyName: policy.name,
          scopeType: scopeLabel,
          periodType: policy.periodType,
          currency: policy.currency,
          amountLimit: limit.toFixed(2),
          totalUsage: usage.totalUsage.toFixed(2),
          usagePercentage: percent.toFixed(1),
          at: asOf.toISOString(),
        },
      },
    });

    await this.auditService.record({
      action:
        status === 'BLOCKED'
          ? AUDIT_ACTIONS.BUDGET_HARD_STOP
          : status === 'CRITICAL'
            ? AUDIT_ACTIONS.BUDGET_CRITICAL
            : AUDIT_ACTIONS.BUDGET_WARNING,
      entityType: 'budget_policy',
      entityId: policy.id,
      metadata: { status, usagePercentage: percent, totalUsage: usage.totalUsage, amountLimit: limit },
    });
  }

  private async readLevels(): Promise<Record<string, StoredLevel>> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, KEY)));
    if (!row?.publicValue) {
      return {};
    }
    try {
      return JSON.parse(row.publicValue) as Record<string, StoredLevel>;
    } catch {
      return {};
    }
  }

  private async writeLevel(policyId: string, level: StoredLevel): Promise<void> {
    const current = await this.readLevels();
    current[policyId] = level;
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key: KEY, publicValue: JSON.stringify(current) })
      .onConflictDoUpdate({
        target: [settings.namespace, settings.key],
        set: { publicValue: JSON.stringify(current) },
      });
  }
}
