import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformDecisionAction, PlatformDecisionStatus, PlatformRole } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformDecisionsService } from './platform-decisions.service';

class RequestDecisionDto {
  @IsIn(Object.values(PlatformDecisionAction))
  action!: PlatformDecisionAction;

  @IsString()
  @MinLength(1)
  targetId!: string;

  /** ملخّصُ الأثر كما سيقرؤه المُقرّ — **إلزاميّ**: إقرارٌ على معرّفٍ مجرَّد ليس إقراراً. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  summary!: string;
}

class DecideDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

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
    return this.service.request(dto.action, dto.targetId, dto.summary, payload.profileId);
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
