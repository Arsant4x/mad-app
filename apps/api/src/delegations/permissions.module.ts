import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

// `TenantPrismaModule` و`PrismaModule` عامّتان (`@Global`) — لا تُستورَدان.
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule {}
