import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrimaryActivityService } from './primary-activity.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, PrimaryActivityService],
})
export class ActivitiesModule {}
