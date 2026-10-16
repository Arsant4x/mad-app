import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesController, CompanySubscriptionController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyMovementService } from './company-movement.service';

@Module({
  // The owner reset link reuses the sign-in module's reset delivery rather than a second one.
  imports: [AuthModule],
  // متحكّمان لأن دورَيهما مختلفان (`ق-١٣١٧`): الحسابُ تشغيلٌ، والاشتراكُ مالية.
  controllers: [CompaniesController, CompanySubscriptionController],
  providers: [CompaniesService, CompanyMovementService],
  // Exported for DeletionRequestsModule: executing an approved deletion reuses
  // this service's cascade-tested remove() rather than growing a second path —
  // ومعيارُ الحركة (`ق-٥٤٦`) الذي يقرّر حذفاً أو إغلاقاً قبله.
  exports: [CompaniesService, CompanyMovementService],
})
export class CompaniesModule {}
