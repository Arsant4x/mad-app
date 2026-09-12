import { ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { TENANT_SCOPED_MODELS } from '../common/tenant/tenant-scope.extension';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';
import { AuditService } from '../audit/audit.service';
import { delegateName, exportedModels, ZATCA_LINK_FIELDS } from './export-scope';

type DelegateLike = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  count: (args?: unknown) => Promise<number>;
};

/** حدودٌ تُقال للتاجر في الحزمة نفسها — لا تُترك ليكتشفها. */
const EXPORT_NOTES = {
  المحذوفات:
    'الصفوف المحذوفة تُصدَّر بعلامة `deletedAt`. والحذف الناعم مطبَّق على تسعة نماذج فقط؛ ' +
    'وما عداها يُحذف فعلياً من القاعدة فلا وجود له ليُصدَّر. أي أن العلامة تعني «ما نعرف أنه حُذف».',
  'أسرار الفوترة الإلكترونية':
    'مفاتيح التوقيع وشهادات الهيئة **لا تُصدَّر إطلاقاً**. ويُصدَّر بدلها ملخّص الربط في `zatcaLink` ' +
    '(الحالة والبيئة وتاريخ الربط) — فتعرف أنك كنت مربوطاً، ولا تحمل الحزمة ما يُنتحَل به توقيعك.',
  المرفقات: 'هذه النسخة تحمل **بيانات** المرفقات (الاسم والحجم والنوع والمفتاح) لا الملفات نفسها.',
} as const;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * ⚠️ **مقصورٌ على المالك — وهذا تضييقٌ مقصود لا سهو** (قرار المالك
   * 2026-08-16).
   *
   * التصدير يُخرج **قاعدة البيانات كلها** في ملفٍ واحد. فجعلُه صلاحيةً
   * مفوَّضة يعني أن موظّفاً بشاشتين يستطيع أن يمشي بها — **وهي ثغرة تسريبٍ
   * بيد موظّف**، لا تفصيلةَ صلاحيات.
   *
   * وهو في دالةٍ مسمّاة لا فحصٍ مبثوثٍ في الجسد: موضعٌ واحد يُقرأ ويُختبَر
   * ويظهر في أثر التدقيق باسمه.
   */
  private assertMayExport(actorType: string): void {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.export_owner_only);
  }

  /**
   * نسخة المنشأة من بياناتها.
   *
   * تعمل أثناء التجميد بالتصميم — قاعدة المالك للاشتراك المنقضي «اطّلاع
   * **وتصدير** فقط»، ومَن يقرّر الرحيل يحتاج بياناته ليقرّر بها.
   */
  async exportAll(companyId: string, actorType: string, actor?: { id: string; name: string }) {
    this.assertMayExport(actorType);

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { orgName: true, legalName: true, vatNumber: true, crNumber: true, subStart: true, subEnd: true, createdAt: true },
    });

    const models = exportedModels();
    const payload = await this.snapshot(companyId);

    // حدثٌ في سجل التدقيق: من · متى · الحجم. والفشل لا يُسقط التصدير — أثرٌ
    // ناقص أهون من حرمان التاجر من بياناته، ويُسجَّل في السجل التقني.
    await this.audit
      .record({
        companyId,
        actorType,
        actorId: actor?.id ?? 'unknown',
        actorName: actor?.name ?? 'unknown',
        screen: 'export',
        action: 'export',
        entity: 'CompanyData',
        entityId: companyId,
        method: 'GET',
        path: '/export',
        details: { tables: models.length, rows: payload.manifest.totalRows, bytes: payload.manifest.bytes },
        ip: null,
      })
      .catch((e) => this.logger.error(`تعذّر تسجيل حدث التصدير: ${String(e)}`));

    return {
      format: 'mad-app-export',
      version: 2,
      exportedAt: new Date().toISOString(),
      company,
      notes: EXPORT_NOTES,
      ...payload,
    };
  }

  /**
   * يبني الحزمة **ويُطابقها بالقاعدة قبل تسليمها**.
   *
   * ## لماذا لقطة `REPEATABLE READ`
   *
   * المطابقة تقرأ القاعدة **مرّتين**: مرةً لتجمع الصفوف، ومرةً لتعدّها. وبين
   * القراءتين نافذةٌ يكتب فيها المستخدمون — فيختلف العددان **بلا أي عطل**،
   * ويسقط التصدير عشوائياً على المنشآت النشطة وحدها.
   *
   * وذلك أسوأ من غياب الحارس: **حارسٌ يُزعج يُعطَّل، وحارسٌ يُعطَّل لا يحرس.**
   * فاللقطة تجعل المقياس والمقيس من **لحظةٍ واحدة**، فأي فرقٍ بعدها عطلٌ
   * حقيقي لا سباق.
   *
   * ## ولماذا العدّ استعلامٌ مستقلّ لا `array.length` وحده
   *
   * `length` يقيس ما بنيناه بما بنيناه — يطابق نفسه دائماً. و`count()` سؤالٌ
   * جديد للقاعدة، فهو **يقرأ المصدر لا المخرَج**. (وهي القاعدة التي انتُهكت
   * مراراً هذا اليوم.)
   */
  /**
   * اللقطةُ المطابَقة وحدَها — بلا تدقيقٍ ولا ترويسة — **لنسخة الإغلاق** (`ق-٥٥٤`) التي تُنتَج
   * على الخادم عند الموافقة لا بطلب التاجر: المصدرُ الواحدُ نفسُه، فلا حزمتان تتباعدان.
   */
  snapshot(companyId: string) {
    return this.buildVerified(companyId, exportedModels());
  }

  /** ملاحظاتُ الحدود — تُكتب في الحزمة وفي نسخة الإغلاق سواء. */
  static get notes() {
    return EXPORT_NOTES;
  }

  private async buildVerified(companyId: string, models: string[]) {
    return this.tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
      const data: Record<string, unknown[]> = {};
      const rows: Record<string, number> = {};

      /**
       * 🔴 **المرشّحُ يُكتب صراحةً لما لا يحقنه الامتداد** (2026-09-12).
       *
       * `findMany()` بلا وسائط داخل سياق المستأجر **يُرشَّح بالامتداد لنماذج
       * `TENANT_SCOPED_MODELS` وحدَها** — و`CompanyUser` و`PermissionTemplate` ليسا
       * فيها (عمداً، حتى يُحسم مبدأ القاعدة) **وبلا سياسةٍ في القاعدة أيضاً**.
       * فكانت الحزمةُ تحمل **حساباتِ الموظفين وقوالبَ كلّ المنشآت**: مقيسٌ بالتشغيل
       * على منشأة العرض — `42` حساباً منها `20` لغيرها، و`130` قالباً منها `20` لغيرها.
       * **تسريبٌ بين مستأجرين عبر تصدير المالك ولقطة الإغلاق** — كان التعليقُ في
       * `export-scope` يقول «المرشّحُ الطبيعيُّ `companyId` يتكفّل به»، **وهو لا يوجد**.
       *
       * فالمرشّحُ هنا **يُشتقّ من القائمة نفسِها**: ما ليس فيها يُقيَّد بـ`companyId`
       * صراحةً — والعدُّ بالمرشّح نفسِه كي تبقى المطابقةُ سؤالاً عن الشيء نفسِه.
       */
      const argsFor = (model: string): { where: { companyId: string } } | undefined =>
        TENANT_SCOPED_MODELS.has(model as Prisma.ModelName) ? undefined : { where: { companyId } };

      for (const model of models) {
        const delegate = (tx as unknown as Record<string, DelegateLike>)[delegateName(model)];
        if (!delegate?.findMany) {
          throw new InternalServerErrorException(`مندوب Prisma غير موجود للنموذج ${model}`);
        }
        data[delegateName(model)] = await delegate.findMany(argsFor(model));
      }

      // العدّ **بعد** الجمع وفي اللقطة نفسها — سؤالٌ مستقلّ عن نفس اللحظة.
      const mismatches: string[] = [];
      for (const model of models) {
        const key = delegateName(model);
        const delegate = (tx as unknown as Record<string, DelegateLike>)[key];
        const counted = await delegate.count(argsFor(model));
        rows[key] = counted;
        if (counted !== data[key].length) {
          mismatches.push(`${key}: الحزمة ${data[key].length} · القاعدة ${counted}`);
        }
      }

      if (mismatches.length > 0) {
        // **ولا يُسلَّم ناقصاً.** حزمةٌ ناقصة تبدو كاملة أسوأ من تصديرٍ فاشل:
        // التاجر يبني عليها قراره بالرحيل ولا يعرف ما ضاع.
        throw new InternalServerErrorException(
          `تفاوت بين الحزمة والقاعدة — لم تُسلَّم: ${mismatches.join(' | ')}`,
        );
      }

      // ملخّص ربط الهيئة: **وجودٌ لا قيمة** — بقائمةٍ بيضاء من الحقول.
      const credential = await (
        tx as unknown as { zatcaCredential: { findUnique: (a: unknown) => Promise<Record<string, unknown> | null> } }
      ).zatcaCredential.findUnique({ where: { companyId }, select: Object.fromEntries(ZATCA_LINK_FIELDS.map((f) => [f, true])) });

      const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
      const totalRows = Object.values(rows).reduce((sum, n) => sum + n, 0);

      return {
        manifest: {
          generatedAt: new Date().toISOString(),
          tables: models.length,
          totalRows,
          bytes,
          rows,
          verifiedAgainstDatabase: true as const,
          isolation: 'REPEATABLE READ' as const,
        },
        zatcaLink: credential,
        data,
      };
      },
      // ⚠️ **اللقطة تُطلب هنا لا في الجسد.** طلبها بعد بدء المعاملة يردّه
      // Postgres بـ«must be called before any query» — فتمضي بلا لقطة ويُعلن
      // البيانُ ضمانةً لا وجود لها. (مقيسٌ قبل الاعتماد.)
      //
      // والمهلة موسَّعة: التصدير يقرأ ستّين جدولاً مرّتين، ومهلة المستأجر
      // الافتراضية (5s) مقيسةٌ لطلبٍ عادي لا لمسحٍ كامل.
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 10_000 },
    );
  }
}
