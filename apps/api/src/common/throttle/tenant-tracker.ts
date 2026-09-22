import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../auth/types';

/**
 * مفتاحُ المقنِّن بالمنشأة والمستخدم، والعنوانُ للمجهول وحدَه (`ق-١٢٧١`/ب).
 *
 * كان المفتاحُ عنوانَ `IP` للجميع (افتراضُ `@nestjs/throttler`): فرعٌ خلف `NAT` واحد بعشرة كاشيرات يقتسم
 * `600/دقيقة`، **ومنشأتان خلف عنوانٍ واحد تحجب إحداهما الأخرى** — والحدُّ يُقاس على من يطلب لا على
 * من يشاركه العنوان (قاعدةُ الفاعل).
 *
 * الرمزُ **يُتحقَّق منه بتوقيعه** لا يُفكّ وحسب: رمزٌ مزوَّر أو منتهٍ يسقط إلى المجهول فيُحاسَب بعنوانه —
 * فلا يشتري أحدٌ حصّةً مستقلّة برمزٍ يكتبه بنفسه. والتحقّقُ هنا لا يُغني عن `JwtAuthGuard` ولا يحلّ محلّه:
 * يقرأ الهويّةَ لمفتاح العدّ فقط، والإذنُ حكمُ الحارس بعده.
 *
 * ⚠️ الحارسُ العامّ (`APP_GUARD`) يسبق حرّاسَ المتحكّم فلا `req.user` بعدُ — لهذا يُقرأ الرأسُ لا الطلبُ المحلول.
 */
export function tenantTracker(jwt: JwtService): (req: Record<string, unknown>) => string {
  return (req) => {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const header = headers.authorization;
    const token = typeof header === 'string' && /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : null;
    if (token) {
      try {
        const p = jwt.verify<JwtPayload>(token);
        return `actor:${p.companyId ?? 'platform'}:${p.profileId}`;
      } catch {
        // ليس رمزَنا (مزوَّرٌ · منتهٍ · بمفتاحٍ آخر) — فصاحبُه مجهولٌ يُحاسَب بعنوانه
      }
    }
    const socket = req.socket as { remoteAddress?: string } | undefined;
    return `ip:${(req.ip as string | undefined) ?? socket?.remoteAddress ?? 'unknown'}`;
  };
}
