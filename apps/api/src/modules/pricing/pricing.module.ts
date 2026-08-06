import { Module } from '@nestjs/common';

import { CostResolverService } from './cost-resolver.service';
import { MessageCostsController } from './message-costs.controller';
import { MessageCostsDao } from './message-costs.dao';
import { PricingRuleSetsController } from './pricing-rule-sets.controller';
import { PricingRuleSetsDao } from './pricing-rule-sets.dao';
import { PricingRuleSetsService } from './pricing-rule-sets.service';

@Module({
  controllers: [PricingRuleSetsController, MessageCostsController],
  providers: [PricingRuleSetsDao, PricingRuleSetsService, MessageCostsDao, CostResolverService],
  exports: [PricingRuleSetsDao, PricingRuleSetsService, MessageCostsDao, CostResolverService],
})
export class PricingModule {}
