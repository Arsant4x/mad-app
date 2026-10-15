import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { ListPlatformAuditQueryDto } from './dto/list-platform-audit-query.dto';
import { PlatformAuditPageResponse } from './dto/platform-audit-responses.dto';
import { PlatformAuditService } from './platform-audit.service';

/**
 * Read only, for the platform owner: no other role is listed, and the owner passes every
 * platform route by definition. There is no route to change or delete a row.
 */
@Controller('admin/platform-audit-log')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@RequiresPlatformRole()
export class PlatformAuditController {
  constructor(private readonly platformAudit: PlatformAuditService) {}

  @Get()
  @ApiOkResponse({ type: PlatformAuditPageResponse })
  list(@Query() query: ListPlatformAuditQueryDto) {
    return this.platformAudit.list(query);
  }
}
