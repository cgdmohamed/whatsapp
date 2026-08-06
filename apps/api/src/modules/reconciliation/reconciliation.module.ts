import { Module } from '@nestjs/common';

import { PricingModule } from '../pricing/pricing.module';
import { CostReconciliationController } from './cost-reconciliation.controller';
import { CostReconciliationDao } from './cost-reconciliation.dao';
import { CostReconciliationService } from './cost-reconciliation.service';
import { ReconciliationStorage } from './cost-reconciliation.storage';

@Module({
  imports: [PricingModule],
  controllers: [CostReconciliationController],
  providers: [CostReconciliationDao, CostReconciliationService, ReconciliationStorage],
})
export class ReconciliationModule {}
