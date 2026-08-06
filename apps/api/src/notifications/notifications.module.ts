import { Module } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EscalationService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
