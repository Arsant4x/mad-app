import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@mad-app/db';
import { Request } from 'express';
import { JwtPayload } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { formatMessage, MSG } from '../i18n/messages';
import { PLATFORM_ROLES_KEY } from './platform-role.decorator';

/**
 * Runs after JwtAuthGuard on platform-admin-only routes (company/template
 * management). Unlike TenantGuard, a platform admin has no companyId and no
 * permission template to check — the only gate is actorType itself.
 *
 * ⭐ **ومن 2026-09-23 (`ق-١٣١٢` · ⑪A2) صار للدور حسابٌ كذلك**: الفاعلُ منصّيٌّ **ودورُه
 * يُقرأ حيّاً من القاعدة** ثم يُطابق ما يشترطه المسار.
 *
 * ## لماذا يُقرأ الدورُ من القاعدة لا من الرمز
 *
 * **دورٌ يُسحب ينفذ في الطلب التالي** — ورمزٌ يحمله يُبقيه سارياً حتى ينتهي أجلُه. وهي
 * نظيرةُ `ق-١٢٥٨` بعينها (حالُ الموظف تُقرأ من القاعدة لا من الرمز)، **والكلفةُ استعلامٌ
 * واحدٌ على مساراتِ المنصّة وحدَها** — وهي مساراتٌ يسلكها أفرادٌ معدودون لا تجّار.
 *
 * ## و`OWNER` يمرّ كلَّ مسار
 *
 * **بتعريفه لا باستثناء**: هو الدورُ الذي كان قائماً وحدَه قبل هذا البند، **فلا أحدَ
 * يفقد بابَه بهذه الإضافة** — والتضييقُ يقع على من يُعيَّن بعدها.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;
    if (!payload) throw new UnauthorizedException();
    if (payload.actorType !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException(MSG.platform_admin_only);
    }

    const required = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(PLATFORM_ROLES_KEY, [context.getHandler(), context.getClass()]);
    // ⚠️ مسارٌ بلا اشتراطٍ **لا يُقرأ «للجميع»**: يُدينه حارسٌ ساكن، ويمرّ هنا للمالك وحدَه
    //    حتى يُعلَن — فالصمتُ يُضيّق ولا يُوسّع.
    const allowed = required ?? [];

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.profileId }, select: { role: true } });
    // مديرٌ حُذف ورمزُه حيّ — يُردّ بالاسم لا بخطأ قاعدة.
    if (!admin) throw new ForbiddenException(MSG.platform_admin_only);

    if (admin.role === PlatformRole.OWNER || allowed.includes(admin.role)) return true;
    throw new ForbiddenException(formatMessage(MSG.platform_role_denied, { role: PLATFORM_ROLE_LABEL[admin.role] }));
  }
}

/** التسميةُ العربية للدور — تُقرأ في رسالة الرفض، فيُعرف **لماذا** رُدّ لا أنه رُدّ. */
export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  OWNER: 'مالك المنصّة',
  SUPPORT: 'الدعم الفني',
  FINANCE: 'المالية',
  OPERATIONS: 'التشغيل',
  COMPLIANCE: 'الامتثال',
};
