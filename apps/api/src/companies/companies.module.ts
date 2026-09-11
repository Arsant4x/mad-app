import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyMovementService } from './company-movement.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyMovementService],
  // Exported for DeletionRequestsModule: executing an approved deletion reuses
  // this service's cascade-tested remove() rather than growing a second path —
  // ومعيارُ الحركة (`ق-٥٤٦`) الذي يقرّر حذفاً أو إغلاقاً قبله.
  exports: [CompaniesService, CompanyMovementService],
})
export class CompaniesModule {}
