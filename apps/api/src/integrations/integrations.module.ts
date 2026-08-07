import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  // POS consults the active payment gateway before taking a card.
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
