import { BudgetAlertsService } from '../src/modules/budget/budget-alerts.service';

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-1',
    name: 'Global monthly cap',
    scopeType: 'GLOBAL',
    scopeId: null,
    currency: 'USD',
    periodType: 'MONTHLY',
    amountLimit: '100.0000',
    warningThresholdPercentage: 70,
    criticalThresholdPercentage: 90,
    hardStopEnabled: true,
    allowAdminOverride: true,
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildService(usage: { totalUsage: number }) {
  const store = new Map<string, { publicValue: string | null }>();
  const db = {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const row = store.get('budget-alerts:last-levels');
          return Promise.resolve(row ? [{ publicValue: row.publicValue }] : []);
        }),
      }),
    })),
    insert: jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((values: { publicValue: string }) => ({
        onConflictDoUpdate: jest.fn().mockImplementation(() => {
          store.set('budget-alerts:last-levels', { publicValue: values.publicValue });
          return Promise.resolve([]);
        }),
      })),
    })),
  };
  const dao = {
    activePolicies: jest.fn().mockResolvedValue([policy()]),
    usageForPolicy: jest.fn().mockResolvedValue({
      estimatedUsage: usage.totalUsage,
      confirmedUsage: usage.totalUsage,
      adjustedUsage: usage.totalUsage,
      totalUsage: usage.totalUsage,
    }),
  };
  const notificationsService = {
    notifyTargets: jest.fn().mockResolvedValue(undefined),
  };
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BudgetAlertsService(dao as never, notificationsService as never, auditService as never, db as never);
  return { service, dao, notificationsService, auditService, db };
}

describe('BudgetAlertsService', () => {
  it('notifies admins when usage crosses the warning threshold', async () => {
    const { service, notificationsService, auditService } = buildService({ totalUsage: 75 });
    const notified = await service.checkAll(new Date('2026-08-05T00:00:00Z'));
    expect(notified).toBe(1);
    expect(notificationsService.notifyTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['ADMIN'],
        type: 'SYSTEM',
        severity: 'WARNING',
        entityType: 'budget_policy',
        entityId: 'policy-1',
        category: 'management',
        email: expect.objectContaining({ templateKey: 'budget-alert' }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'budget.warning' }));
  });

  it('does not re-notify while the level stays the same', async () => {
    const { service, notificationsService } = buildService({ totalUsage: 75 });
    await service.checkAll(new Date('2026-08-05T00:00:00Z'));
    notificationsService.notifyTargets.mockClear();
    await service.checkAll(new Date('2026-08-05T01:00:00Z'));
    expect(notificationsService.notifyTargets).not.toHaveBeenCalled();
  });

  it('notifies again when usage escalates to critical', async () => {
    const { service, notificationsService, auditService, dao } = buildService({ totalUsage: 75 });
    await service.checkAll(new Date('2026-08-05T00:00:00Z'));
    dao.usageForPolicy.mockResolvedValue({ estimatedUsage: 95, confirmedUsage: 95, adjustedUsage: 95, totalUsage: 95 });
    notificationsService.notifyTargets.mockClear();
    await service.checkAll(new Date('2026-08-05T02:00:00Z'));
    expect(notificationsService.notifyTargets).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'ERROR' }),
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'budget.critical' }));
  });

  it('does not notify when usage is within limits', async () => {
    const { service, notificationsService } = buildService({ totalUsage: 50 });
    const notified = await service.checkAll(new Date('2026-08-05T00:00:00Z'));
    expect(notified).toBe(0);
    expect(notificationsService.notifyTargets).not.toHaveBeenCalled();
  });
});
