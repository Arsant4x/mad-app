import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { FilesModule } from '../files/files.module';
import { CompanyArchiveService } from './company-archive.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  // FilesModule للتخزين، وCompaniesModule لمعيار الحركة الذي يقسّم النسخةَ سنوياً (`ق-٥٥٤`).
  imports: [FilesModule, CompaniesModule],
  controllers: [ExportController],
  providers: [ExportService, CompanyArchiveService],
  // Exported for DeletionRequestsModule: نسخةُ الإغلاق تُنتَج من لقطة التصدير نفسِها — لا حزمةٌ ثانية.
  exports: [ExportService, CompanyArchiveService],
})
export class ExportModule {}
