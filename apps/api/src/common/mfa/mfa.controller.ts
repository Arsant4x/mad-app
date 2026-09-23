import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtPayload } from '../../auth/types';
import { MfaService } from './mfa.service';

class MfaCodeDto {
  /** الرمزُ من التطبيق (ستُّ خانات) أو رمزُ استرداد — والخدمةُ تميّزهما. */
  @IsString()
  @MinLength(6)
  code!: string;
}

/**
 * **المصادقةُ المتعدّدة — لصاحب الحساب نفسِه** (`ق-١٣١٨` · ⑨A1 — باب `⑨ الصلاحيات`، مُسح).
 *
 * **بلا حارس شاشةٍ ولا دور**: كلُّ فاعلٍ يُفعّلها **على حسابه هو** — والهويّةُ من الرمز،
 * فلا يمسّ أحدٌ حسابَ غيره. **وهي قاعدةُ الفاعل بعينها** (`§3.5`): حمايةُ حسابي قراري.
 *
 * ⚠️ **ولا مسارَ يُعطّلها لغيرك** — فمن ملك جلسةً لا يُسقط عاملَ صاحبها الثاني.
 */
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  status(@Req() req: Request) {
    return this.mfa.status((req.user as JwtPayload).sub);
  }

  /** يبدأ التسجيل — **ولا يُفعّل شيئاً**: السرُّ يُعرض مرّةً، والتفعيلُ بالتأكيد. */
  @Post('begin')
  begin(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.mfa.begin(payload.sub, payload.username);
  }

  /** يُكمل التسجيل برمزٍ من التطبيق، ويُسلّم رموزَ الاسترداد **مرّةً واحدة**. */
  @Post('confirm')
  confirm(@Req() req: Request, @Body() dto: MfaCodeDto) {
    return this.mfa.confirm((req.user as JwtPayload).sub, dto.code);
  }

  /** يُلغيها — **برمزٍ حيّ**، فلا يُلغيها من استولى على جلسةٍ مفتوحة. */
  @Post('disable')
  disable(@Req() req: Request, @Body() dto: MfaCodeDto) {
    return this.mfa.disable((req.user as JwtPayload).sub, dto.code);
  }
}
