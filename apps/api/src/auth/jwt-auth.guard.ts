import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { presentedApiKey } from '../api-keys/api-key-token.util';
import { MSG } from '../common/i18n/messages';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_ENROLMENT_SESSION_KEY } from './allow-enrolment-session.decorator';
import { JwtPayload, MFA_ENROLMENT_SCOPE } from './types';

/**
 * **بابُ الهويّة: رمزُ جلسةٍ أو مفتاحُ نظام** (`ق-١٢٩١` · ي/⑫A3).
 *
 * ## لماذا هنا لا في حارسٍ جديد
 *
 * `@UseGuards(JwtAuthGuard, TenantGuard)` مكتوبةٌ في **تسعةٍ وأربعين متحكّماً** (مقيس).
 * فحارسٌ جديد يعني تعديلَ تسعةٍ وأربعين موضعاً — **والتاسعُ والأربعون الذي يُنسى لا
 * يُنبّه عنه شيء**. وموضعٌ واحد يُغيَّر أرخصُ وأقلُّ خطأً.
 *
 * ## والفصلُ بين البابين مقصود
 *
 * المفتاحُ يُقدَّم بـ`X-Api-Key` أو `Authorization: ApiKey …` — **لا `Bearer`**: فخلطُهما
 * يجعل رمزاً منتهياً يُجرَّب مفتاحاً ومفتاحاً يُجرَّب رمزاً، فيصير سببُ الرفض غامضاً على
 * من يتكامل. **وما ليس مفتاحاً يمضي إلى `passport` كما كان** — فلا يتغيّر شيءٌ لمن يدخل
 * بجلسة.
 *
 * ⚠️ **والإذنُ ليس هنا**: هذا يُثبت الهويّةَ ويضع `req.user`؛ **والنطاقُ والحالةُ
 * والشاشةُ والفعل** كلُّها في `TenantGuard` بعده — كما للموظّف بالضبط.
 *
 * A session token is also checked live against its identity on every request: a token issued before
 * the last change of sign-in credentials is refused, as status is read live rather than trusted from
 * the token. The enrolment-only session reaches only the routes marked for it.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const presented = presentedApiKey(req.headers as unknown as Record<string, unknown>);
    if (presented) {
      req.user = await this.apiKeys.authenticate(presented);
      return true;
    }
    if (!((await super.canActivate(context)) as boolean)) return false;

    const payload = req.user as JwtPayload;
    if (payload.scope !== undefined) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_ENROLMENT_SESSION_KEY, [context.getHandler(), context.getClass()]);
      if (payload.scope !== MFA_ENROLMENT_SCOPE || !allowed) throw new UnauthorizedException(MSG.session_invalid);
    }
    const identity = await this.prisma.loginIdentity.findUnique({ where: { id: payload.sub }, select: { credentialVersion: true } });
    if (!identity || identity.credentialVersion !== (payload.cv ?? 0)) throw new UnauthorizedException(MSG.session_invalid);
    return true;
  }
}
