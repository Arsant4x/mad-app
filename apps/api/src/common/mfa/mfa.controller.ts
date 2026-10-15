import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AllowEnrolmentSession } from '../../auth/allow-enrolment-session.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtPayload } from '../../auth/types';
import { ThrottleByClientIp } from '../throttle/throttler-options';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaService } from './mfa.service';

/**
 * **المصادقةُ المتعدّدة — لصاحب الحساب نفسِه** (`ق-١٣١٨` · ⑨A1 — باب `⑨ الصلاحيات`، مُسح).
 *
 * **بلا حارس شاشةٍ ولا دور**: كلُّ فاعلٍ يُفعّلها **على حسابه هو** — والهويّةُ من الرمز،
 * فلا يمسّ أحدٌ حسابَ غيره. **وهي قاعدةُ الفاعل بعينها** (`§3.5`): حمايةُ حسابي قراري.
 *
 * ⚠️ **ولا مسارَ يُعطّلها لغيرك** — فمن ملك جلسةً لا يُسقط عاملَ صاحبها الثاني.
 *
 * Status, begin and confirm also accept the enrolment-only session of a platform administrator who
 * must enrol before getting a session. Confirm and disable check the current password, so they are
 * counted per address like sign-in.
 */
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  @AllowEnrolmentSession()
  status(@Req() req: Request) {
    return this.mfa.status((req.user as JwtPayload).sub);
  }

  /** يبدأ التسجيل — **ولا يُفعّل شيئاً**: السرُّ يُعرض مرّةً، والتفعيلُ بالتأكيد. */
  @Post('begin')
  @AllowEnrolmentSession()
  begin(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.mfa.begin(payload.sub, payload.username);
  }

  /** Completes enrolment with a code from the app and the current password, and hands the recovery codes once. */
  @Post('confirm')
  @AllowEnrolmentSession()
  @ThrottleByClientIp(10)
  confirm(@Req() req: Request, @Body() dto: MfaCodeDto) {
    const payload = req.user as JwtPayload;
    return this.mfa.confirm(payload.sub, dto.code, dto.currentPassword, payload.sid);
  }

  /** Turns it off with a live code and the current password, so an open session alone cannot remove it. */
  @Post('disable')
  @ThrottleByClientIp(10)
  disable(@Req() req: Request, @Body() dto: MfaCodeDto) {
    const payload = req.user as JwtPayload;
    return this.mfa.disable(payload.sub, dto.code, dto.currentPassword, payload.sid);
  }
}
