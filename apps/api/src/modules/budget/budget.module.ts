import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { BudgetAlertsScheduler } from './budget-alerts.scheduler';
import { BudgetAlertsService } from './budget-alerts.service';
import { BudgetAlertsWorker } from './budget-alerts.worker';
import { BudgetPoliciesController } from './budget-policies.controller';
import { BudgetPoliciesDao } from './budget-policies.dao';
import { BudgetService } from './budget.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BudgetPoliciesController],
  providers: [BudgetPoliciesDao, BudgetService, BudgetAlertsService, BudgetAlertsWorker, BudgetAlertsScheduler],
  exports: [BudgetPoliciesDao, BudgetService, BudgetAlertsService],
})
export class BudgetModule {}
