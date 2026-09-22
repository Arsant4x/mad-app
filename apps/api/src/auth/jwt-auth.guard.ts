import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { presentedApiKey } from '../api-keys/api-key-token.util';

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
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly apiKeys: ApiKeysService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const presented = presentedApiKey(req.headers as unknown as Record<string, unknown>);
    if (presented) {
      req.user = await this.apiKeys.authenticate(presented);
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
