import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
  // Exported for DeletionRequestsModule: executing an approved deletion reuses
  // this service's cascade-tested remove() rather than growing a second path.
  exports: [CompaniesService],
})
export class CompaniesModule {}
