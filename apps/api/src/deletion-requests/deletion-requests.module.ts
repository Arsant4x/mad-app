import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ExportModule } from '../export/export.module';
import { FilesModule } from '../files/files.module';
import { AdminDeletionRequestsController, DeletionRequestsController } from './deletion-requests.controller';
import { DeletionRequestsService } from './deletion-requests.service';
import { PersonalDataErasureService } from './personal-data-erasure.service';

@Module({
  // CompaniesModule provides the one existing, cascade-tested company removal
  // path — execution reuses it rather than growing a second delete.
  // ExportModule: نسخةُ الإغلاق تُنتَج من لقطة التصدير نفسِها قبل أيّ إغلاق (`ق-٥٥٤`).
  // FilesModule: المسحُ اليوميّ يحذف ملفّاتِ النسخة عند انقضاء أجلها (`ق-٥٥٩`).
  imports: [CompaniesModule, ExportModule, FilesModule],
  controllers: [DeletionRequestsController, AdminDeletionRequestsController],
  providers: [DeletionRequestsService, PersonalDataErasureService],
})
export class DeletionRequestsModule {}
