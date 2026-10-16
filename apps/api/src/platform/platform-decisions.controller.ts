import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformDecisionStatus, PlatformRole } from '@mad-app/db';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { DecideDto, RequestDecisionDto } from './dto/platform-decision.dto';
import { PlatformDecisionsService } from './platform-decisions.service';

/**
 * **القراراتُ المنصّية الحرجة** (`ق-١٣١٨` · ⑪A1).
 *
 * **ولمن؟** لكلِّ دورٍ منصّيّ **أن يطلب ويُقرّ** — فالفصلُ هنا **بين شخصين لا بين دورين**:
 * محوُ منشأةٍ يقرّره الامتثال، **ويحتاج يداً ثانية أيّاً كان دورُها**. ولو حُصر الإقرارُ
 * في دورٍ واحدٍ لصار «اليدان» شرطاً لا يُستوفى إلا بموظّفَين في القسم نفسِه.
 *
 * ⚠️ **وحارسُ الدور يوجب إعلاناً**، فتُعلَن الأدوارُ الأربعة صراحةً (و`OWNER` بتعريفه).
 */
@Controller('admin/decisions')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@RequiresPlatformRole(PlatformRole.SUPPORT, PlatformRole.FINANCE, PlatformRole.OPERATIONS, PlatformRole.COMPLIANCE)
export class PlatformDecisionsController {
  constructor(private readonly service: PlatformDecisionsService) {}

  @Get()
  list(@Query('status') status?: PlatformDecisionStatus) {
    return this.service.list(status);
  }

  @Post()
  request(@Req() req: Request, @Body() dto: RequestDecisionDto) {
    const payload = req.user as JwtPayload;
    return this.service.request(dto.action, dto.targetId, dto.summary, payload.profileId, { subEnd: dto.subEnd });
  }

  @Post(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() dto: DecideDto) {
    const payload = req.user as JwtPayload;
    return this.service.decide(id, true, payload.profileId, dto.note);
  }

  @Post(':id/reject')
  reject(@Req() req: Request, @Param('id') id: string, @Body() dto: DecideDto) {
    const payload = req.user as JwtPayload;
    return this.service.decide(id, false, payload.profileId, dto.note);
  }
}
