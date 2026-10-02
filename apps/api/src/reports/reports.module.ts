import { Module } from '@nestjs/common';
import { PermissionsModule } from '../delegations/permissions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  // بطاقاتُ لوحة التحكم تُحسب من صلاحيات القارئ النافذة (`ق-١٥٨٠`) — من المصدر الذي تقرؤه الواجهة، لا نسخةٍ ثانية.
  imports: [PermissionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
