import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ExportModule } from '../export/export.module';
import { AdminDeletionRequestsController, DeletionRequestsController } from './deletion-requests.controller';
import { DeletionRequestsService } from './deletion-requests.service';

@Module({
  // CompaniesModule provides the one existing, cascade-tested company removal
  // path — execution reuses it rather than growing a second delete.
  // ExportModule: نسخةُ الإغلاق تُنتَج من لقطة التصدير نفسِها قبل أيّ إغلاق (`ق-٥٥٤`).
  imports: [CompaniesModule, ExportModule],
  controllers: [DeletionRequestsController, AdminDeletionRequestsController],
  providers: [DeletionRequestsService],
})
export class DeletionRequestsModule {}
