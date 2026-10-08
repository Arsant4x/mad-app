import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';

type Tx = Prisma.TransactionClient;

/** الطبقةُ الثانية بعد `@OwnerOnly` في المتحكّم: الخدمةُ نفسُها لا تكتب لغير مالك المنشأة. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.form_signing_settings_owner_only);
}

/** ⚖️ «المدّةُ سبعةُ أيّامٍ افتراضاً يغيّرها التاجرُ لكلِّ نوع» (`ق-١٦٣٣` ⑬، وأعادها توجيه ٢٨٧ ④ بنصّها). */
export const DEFAULT_SIGN_PERIOD_DAYS = 7;

/** مدّةُ التوقيع لنوعٍ في المنشأة: ما غيّره التاجرُ أو الافتراض — تُقرأ عند الإرسال وتُختم على النموذج. */
export async function signPeriodDaysFor(tx: Tx, formTypeId: string): Promise<number> {
  const row = await tx.formTypeSetting.findFirst({ where: { formTypeId }, select: { signPeriodDays: true } });
  return row?.signPeriodDays ?? DEFAULT_SIGN_PERIOD_DAYS;
}

/**
 * ⚖️ **إعدادُ توقيع النماذج للمنشأة** (توجيه ٢٨٧ ② و④ · النموذجُ المرئيُّ المُقرّ، الشاشة ٢ «قوالبُ المنشأة وإعدادُ التوقيع»).
 *
 * **الفاعلُ مالكُ المنشأة** («الحدُّ يضعه التاجر، والضابطُ مالكُ المنشأة» · `ق-١٥٩١`)، والقراءةُ لكلِّ فاعل لأن الموظّفَ يرى المدّةَ قبل أن
 * يرسل. **ونفاذٌ فوق الحدّ شرطٌ وتحته خيار** (`ق-١٦٣٣` ①ب)، والحدُّ بقيمة الكيان كلِّها بعملة أساس المنشأة (`ق-١٦٣٥` ①)، والفارغُ لا يشترط.
 * **والمدّةُ لكلِّ نوعٍ** من أنواع قوالب المنشأة، وما لم يُغيَّر فسبعةُ أيّام.
 */
@Injectable()
export class FormSigningSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  get(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.read(tx, companyId));
  }

  update(
    companyId: string,
    actorType: string,
    input: { nafathThreshold?: number | null; periods?: ReadonlyArray<{ formTypeId: string; signPeriodDays: number }> },
  ) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      if (input.nafathThreshold !== undefined) {
        await tx.company.update({ where: { id: companyId }, data: { formsNafathThreshold: input.nafathThreshold === null ? null : new Prisma.Decimal(input.nafathThreshold) } });
      }
      if (input.periods?.length) {
        const known = new Set((await this.typesOf(tx)).map((t) => t.id));
        for (const p of input.periods) {
          if (!known.has(p.formTypeId)) throw new BadRequestException(formatMessage(MSG.form_signing_type_unknown, { id: p.formTypeId }));
          await tx.formTypeSetting.upsert({
            where: { companyId_formTypeId: { companyId, formTypeId: p.formTypeId } },
            create: { companyId, formTypeId: p.formTypeId, signPeriodDays: p.signPeriodDays },
            update: { signPeriodDays: p.signPeriodDays },
          });
        }
      }
      return this.read(tx, companyId);
    });
  }

  /** أنواعُ قوالب المنشأة — ما تعبّئه فعلاً، لا الكتالوجُ كلُّه. */
  private async typesOf(tx: Tx) {
    const rows = await tx.formTemplate.findMany({
      where: { companyId: { not: null } },
      select: { formType: { select: { id: true, code: true, name: true } } },
      distinct: ['formTypeId'],
    });
    return rows.map((r) => r.formType).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  private async read(tx: Tx, companyId: string) {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { formsNafathThreshold: true, baseCurrency: true } });
    const settings = new Map((await tx.formTypeSetting.findMany({ select: { formTypeId: true, signPeriodDays: true } })).map((s) => [s.formTypeId, s.signPeriodDays]));
    const types = await this.typesOf(tx);
    return {
      nafathThreshold: company.formsNafathThreshold === null ? null : company.formsNafathThreshold.toString(),
      currency: company.baseCurrency,
      defaultSignPeriodDays: DEFAULT_SIGN_PERIOD_DAYS,
      types: types.map((t) => ({
        formTypeId: t.id,
        code: t.code,
        name: t.name,
        signPeriodDays: settings.get(t.id) ?? DEFAULT_SIGN_PERIOD_DAYS,
        isDefault: !settings.has(t.id),
      })),
    };
  }
}
