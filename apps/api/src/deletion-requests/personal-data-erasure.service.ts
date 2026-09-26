import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CONTACT_FIELD_NAMES } from '../common/privacy/personal-fields';
import { CompaniesService } from '../companies/companies.service';
import { CompanyMovementService, retentionDeadline } from '../companies/company-movement.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { REOPEN_WINDOW_DAYS, reopenUntil } from '../common/tenant/reopen-window';
import { ArchiveManifest } from '../export/company-archive.service';
import { delegateName } from '../export/export-scope';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';

/**
 * الإتلافُ حقٌّ يُطلب وسياسةٌ تُطبَّق معاً (`ق-٥٥٩`):
 *
 * - **(ب) مسارٌ صريح**: صاحبُ المنشأة المغلقة يطلب محوَ غير الملزِم الآن (حقٌّ منصوص — م٤/٥)،
 *   فيُقرَّر باسم من قرّر ويُنفَّذ.
 * - **(ج) سياسةٌ حين لا يطلب أحد**: بعد انقضاء نافذة إعادة الفتح يُمحى غيرُ الملزِم آلياً،
 *   ويبقى الملزِم مجمَّداً حتى «أيهما أطول» (م١٨/٢/أ) ثم يُتلف عند `retainUntil`.
 *
 * **والتأخيرُ مبرَّرٌ بسببٍ يُكتب** (`DEFERRAL_REASON`) — ويُعرَض التصميمُ على مستشارٍ قبل أول
 * عميل؛ ولا يُقرأ حكمُ المالك فتوى.
 *
 * **ما هو «غيرُ الملزِم»؟** — حقولٌ شخصيةٌ لا يشترطها نصٌّ في السجل المحفوظ: الفاتورةُ تشترط
 * اسمَ العميل وعنوانَه ورقمَه الضريبيّ (لائحةُ ض.ق.م م٥٣) **لا هاتفَه**؛ فالهواتفُ تُمحى
 * والأسماءُ والعناوينُ تبقى. **والقائمةُ محروسة** (`personal-data-erasure.spec.ts`): كلُّ حقلٍ
 * شخصيٍّ في المخطّط (هاتف · بريد · موقع · عنوان) إمّا في `ERASED_FIELDS` وإمّا في `KEPT_FIELDS`
 * بحجّته — فحقلٌ جديدٌ غداً يُسقط الحارسَ حتى يُقرَّر.
 *
 * **حدُّه المعلَن**: حقولُ الملاحظات الحرّة (`notes`) تبقى مع مستنداتها — قد تحمل شخصياً، وهو
 * فراغٌ يُعرض على المستشار. **والمنشأةُ ذاتُ سجلّ المهام أو التفويض لا تُحذف صلباً** عند
 * `retainUntil` (`Restrict` — `ق-١١٠`): يُسجَّل تعذّرُها ويُعرَض، ولا يُبنى حذفٌ حول السجلّ.
 * **ويكتمل الإتلافُ خلال أربعةَ عشرَ يوماً من دوران النسخ الاحتياطية** (`ق-٥٦٠`).
 *
 * والنافذةُ نفسُها (`REOPEN_WINDOW_DAYS`) تعيش في `common/tenant/reopen-window.ts` — فحارسُ
 * المستأجر يقولها في رسالة المغلق.
 */
export { REOPEN_WINDOW_DAYS, reopenUntil };

/** سببُ تأخير المحو — يُكتب في أثر التدقيق لا يُصمت (`ق-٥٥٩`). */
export const DEFERRAL_REASON = 'يبقى غيرُ الملزِم مدّةَ نافذة العودة لأن الغرض — إمكانُ العودة — لم ينتهِ بعد';

export interface PersonalField {
  model: Prisma.ModelName;
  field: string;
  reason: string;
}

/** ما يُمحى — شخصيٌّ لا يشترطه نصٌّ في السجل المحفوظ. */
export const ERASED_FIELDS: ReadonlyArray<PersonalField> = [
  { model: 'Customer', field: 'phone', reason: 'هاتفُ العميل ليس من حقول الفاتورة (م٥٣/٥/هـ: الاسمُ والعنوان) — فيبقيان ويُمحى الهاتف' },
  { model: 'Supplier', field: 'phone', reason: 'هاتفُ المورّد ليس من حقول المستند المحفوظ' },
  { model: 'Employee', field: 'phone', reason: 'هاتفُ الموظّف ليس من سجلّ العمل الملزِم — والاسمُ والراتبُ يبقيان (مدّةُ حفظ بيانات العمل لم تُبحث: فراغ)' },
  { model: 'Contract', field: 'phone', reason: 'هاتفُ طرف العقد ليس من العقد المحفوظ نفسِه' },
  { model: 'Reservation', field: 'phone', reason: 'هاتفُ الحاجز ليس من سجلٍّ ملزِم' },
  { model: 'Company', field: 'phone', reason: 'بيانُ تواصل حساب التاجر — نحن جهةُ التحكم فيه ولا غرضَ له بعد نافذة العودة' },
  { model: 'Company', field: 'email', reason: 'بريدُ تواصل حساب التاجر — لا يشترطه مستندٌ محفوظ، وغرضُه (التواصل) ينتهي بانتهاء نافذة العودة' },
  { model: 'Company', field: 'website', reason: 'موقعُ المنشأة الإلكترونيّ — بيانُ تعريفٍ اختياريّ لا يشترطه مستندٌ محفوظ' },
];

/** ما يبقى بحجّته — لا فراغَ صامتاً. */
export const KEPT_FIELDS: ReadonlyArray<PersonalField> = [
  { model: 'Company', field: 'address', reason: 'عنوانُ المنشأة على فواتيرها المحفوظة (م٥٣/٥/هـ)' },
  { model: 'Property', field: 'address', reason: 'عنوانُ عقارٍ لا شخص' },
];

/**
 * الحقولُ التي يعدّها الحارسُ شخصيةً في المخطّط — بأسمائها لا بقائمة نماذج.
 * **ومصدرُها واحدٌ مع سجلّ التدقيق** (`common/privacy/personal-fields`): ما يُمحى من جدوله
 * لا يبقى في `details` (`ق-١٢٧٨`/②) — وقائمتان تفترقان تعني حقلاً يُمحى ويبقى.
 */
export const PERSONAL_FIELD_NAMES = CONTACT_FIELD_NAMES;

export const SYSTEM_ACTOR = { id: 'system', username: 'المحو الآليّ' } as const;

export interface EraseReport {
  companyId: string;
  trigger: 'REQUEST' | 'WINDOW';
  counts: Record<string, number>;
  /** حدودٌ تُعلَن مع كلِّ محو — لا تُكتشف بعده (`ق-١٢٧٨`/②). */
  limits: string[];
}

/**
 * ما لا يبلغه المحو — **يُقال في الردّ** لا يُسكَت عنه:
 * سجلُّ التدقيق **وقائعُ لا حالات** ولا يُعدَّل ولا يُحذف (الملحقُ ١ لقرار الهيئة)، فصفوفُه
 * السابقة لـ`ق-١٢٧٨` تحمل قيمَ حقول التواصل كما وصلت؛ **والجديدُ لا يحملها** (تُستبعَد عند
 * الكتابة). وهذا حدٌّ **معلَن** لا عطلٌ مكتوم.
 */
export const AUDIT_RETENTION_NOTICE =
 'سجلّاتٌ قديمةٌ محفوظةٌ نظاماً: أثرُ التدقيق لا يُعدَّل ولا يُحذف (متطلّبُ الهيئة)، فما سُجّل قبل استبعاد حقول التواصل يبقى كما هو؛ وما يُسجَّل بعده لا يحمل قيمةَ هاتفٍ ولا بريدٍ ولا ملاحظةٍ حرّة.';

type UpdateManyDelegate = { updateMany: (args: unknown) => Promise<{ count: number }> };

@Injectable()
export class PersonalDataErasureService {
  private readonly logger = new Logger(PersonalDataErasureService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly movement: CompanyMovementService,
  ) {}

  /**
   * محوُ غير الملزِم لمنشأةٍ مغلقة — تحت سياقها (الجداولُ تحت `FORCE`)؛ ولا مرشِّحَ حذفٍ ناعمٍ
   * على العميل، فالصفوفُ في السلّة تُمحى مع الحيّة (السلّةُ ليست ملاذاً). وحسابُ التاجر نفسُه
   * بلا سياق (`companies` بلا RLS).
   */
  async erase(companyId: string, actor: { id: string; username: string }, trigger: 'REQUEST' | 'WINDOW'): Promise<EraseReport> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { status: true, erasedAt: true } });
    if (company.status !== 'CLOSED') throw new ConflictException('erasure requires a CLOSED company');
    const counts: Record<string, number> = {};
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      for (const f of ERASED_FIELDS) {
        if (f.model === 'Company') continue;
        const delegate = (tx as unknown as Record<string, UpdateManyDelegate>)[delegateName(f.model)];
        const result = await delegate.updateMany({ where: { companyId, [f.field]: { not: null } }, data: { [f.field]: null } });
        counts[`${f.model}.${f.field}`] = result.count;
      }
    });
    const companyFields = Object.fromEntries(ERASED_FIELDS.filter((f) => f.model === 'Company').map((f) => [f.field, null]));
    await this.prisma.company.update({ where: { id: companyId }, data: { ...companyFields, erasedAt: new Date() } });
    await this.audit
      .record({
        companyId,
        actorType: trigger === 'WINDOW' ? 'SYSTEM' : 'PLATFORM_ADMIN',
        actorId: actor.id,
        actorName: actor.username,
        screen: 'export',
        action: 'erase',
        entity: 'CompanyData',
        entityId: companyId,
        method: trigger === 'WINDOW' ? 'CRON' : 'POST',
        path: trigger === 'WINDOW' ? 'erasure.sweep' : '/admin/deletion-requests/:id/approve',
        details: { trigger, counts, deferralReason: DEFERRAL_REASON, auditNotice: AUDIT_RETENTION_NOTICE },
        ip: null,
      })
      .catch((e) => this.logger.error(`تعذّر تسجيل حدث المحو: ${String(e)}`));
    this.logger.warn(`Erased non-mandatory personal data of company ${companyId} (${trigger}): ${JSON.stringify(counts)}`);
    return { companyId, trigger, counts, limits: [AUDIT_RETENTION_NOTICE] };
  }

  /**
   * المسحُ اليوميّ (`ق-٥٥٩/ج`): ① غيرُ الملزِم يُمحى بعد نافذة العودة · ② عند `retainUntil`
   * تُحذف نسخةُ الإغلاق من المخزن ويُحذف الحسابُ صلباً — **وما ترفضه القاعدةُ (سجلٌّ ملحق —
   * `ق-١١٠`) يُسجَّل تعذّرُه ويُعرَض، ولا يُلتفّ عليه**.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: SCHEDULE_TIME_ZONE })
  async sweep(now: Date = new Date()): Promise<{ erased: string[]; deleted: string[]; blocked: string[]; retained: string[] }> {
    const erased: string[] = [];
    const deleted: string[] = [];
    const blocked: string[] = [];
    const retained: string[] = [];
    const windowCutoff = new Date(now.getTime() - REOPEN_WINDOW_DAYS * 24 * 3600 * 1000);

    const due = await this.prisma.company.findMany({
      where: { status: 'CLOSED', erasedAt: null, closedAt: { lt: windowCutoff } },
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.erase(id, SYSTEM_ACTOR, 'WINDOW');
        erased.push(id);
      } catch (e) {
        this.logger.error(`تعذّر المحوُ الآليّ للمنشأة ${id}: ${String(e)}`);
      }
    }

    const expired = await this.prisma.company.findMany({ where: { status: 'CLOSED', retainUntil: { lt: now } }, select: { id: true, orgName: true, closedAt: true } });
    for (const { id, orgName, closedAt } of expired) {
      // ⚖️ (`ق-١٤٧٠` · التوجيه ٢٦٦ §٤و) **يُعاد قياسُ الحفظ لحظةَ الحذف** — كما تفعل السلّة — ولا يُوثق بـ`retainUntil`
      //    المخزَّن: حُسب لحظةَ الموافقة، **وما كُتب بين القياس وختم الإغلاق** (فاتورةٌ أثناء إنتاج النسخة والمنشأةُ
      //    ما زالت نشطة) **أو ما حسبه معيارٌ أضيق** (عقاراتٌ بلا عقود) لا يراه. فإن كان الأجلُ المقيسُ بعد الآن
      //    لا يُحذف شيء — ولا نسختُه — ويُمدّ الأجلُ ويُعلَن.
      if (closedAt) {
        const kept = await this.movement.retention(id);
        const deadline = kept.models.length > 0 ? retentionDeadline(closedAt, kept.models) : null;
        if (deadline && deadline > now) {
          await this.prisma.company.update({ where: { id }, data: { retainUntil: deadline } });
          retained.push(id);
          this.logger.warn(`Final erasure of company ${id} ("${orgName}") withheld: records under retention (${kept.labels.join('، ')}) — retainUntil extended to ${deadline.toISOString()}`);
          continue;
        }
      }
      const latest = await this.prisma.accountDeletionRequest.findFirst({ where: { companyId: id, archiveProducedAt: { not: null } }, orderBy: { archiveProducedAt: 'desc' } });
      for (const f of ((latest?.archiveManifest as unknown as ArchiveManifest | null)?.files ?? [])) {
        await this.files.deleteArchiveObject(f.key).catch((e) => this.logger.warn(`تعذّر حذف ملفّ النسخة ${f.key}: ${String(e)}`));
      }
      try {
        await this.companiesService.remove(id);
        deleted.push(id);
        this.logger.warn(`Hard-deleted company ${id} ("${orgName}") at the end of its retention (${DEFERRAL_REASON})`);
      } catch (e) {
        blocked.push(id);
        this.logger.warn(`Final erasure of company ${id} ("${orgName}") blocked by an append-only record (ق-١١٠): ${(e as Error).message}`);
      }
    }
    return { erased, deleted, blocked, retained };
  }
}
