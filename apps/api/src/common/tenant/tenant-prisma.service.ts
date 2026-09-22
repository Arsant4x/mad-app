import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantScopeExtension } from './tenant-scope.extension';
import { withTransactionProbe } from './nested-transaction-probe';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `work` inside a single DB transaction that is scoped to `companyId`
   * on two independent layers:
   *  1. Every query against a tenant-scoped model automatically gets
   *     `companyId` merged into its `where`/`data` (tenantScopeExtension).
   *  2. `set_config('app.company_id', ...)` is set for the transaction, which
   *     Postgres RLS policies use to reject any row that doesn't match —
   *     even if a query somehow skipped layer 1 (e.g. raw SQL).
   *
   * `set_config` is used (not `SET LOCAL app.company_id = ...`) because it
   * accepts a bound parameter — string-interpolating `companyId` into raw SQL
   * would be an injection risk even though it's a server-generated UUID.
   *
   * `work` is typed against the stable, exported `Prisma.TransactionClient`
   * rather than the extended client's own (unstable/unexported) type — the
   * runtime object passed in is a strict superset of that interface, so the
   * cast below is safe. Prisma's extension type system doesn't currently
   * expose a clean way to carry the exact extended type across a function
   * boundary like this.
   */
  /**
   * ⚠️ `options` تصل إلى `$transaction` **لا إلى جسد المعاملة** — وهذا شرطُ
   * صحّتها لا تفصيلة أسلوب.
   *
   * `SET TRANSACTION ISOLATION LEVEL` يجب أن يسبق **أي** استعلام، وهذه الدالة
   * تُنفّذ `set_config` أول شيء. فطلبُ اللقطة من داخل الجسد يردّه Postgres —
   * مقيسٌ لا مفترَض:
   *
   *     BEGIN; SELECT set_config(…); SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
   *     ⇒ ERROR: SET TRANSACTION ISOLATION LEVEL must be called before any query
   *
   * فتُمرَّر إلى Prisma لتُضبط عند `BEGIN` نفسه. **والفرق ليس شكلياً**: مستدعٍ
   * يطلب لقطةً ولا يحصل عليها يبني ضمانةً على وهم — وقد كاد يقع هنا: بيان
   * التصدير كان سيُعلن `isolation: 'REPEATABLE READ'` ولا لقطة أصلاً.
   */
  async runInTenantContext<T>(
    companyId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number },
  ): Promise<T> {
    const scoped = this.prisma.$extends(tenantScopeExtension(companyId));
    // ⚠️ **كاشفُ المعاملة المتداخلة** (`ق-٣٦٢`): **يُبلّغ ولا يُسقط**، فالقياسُ
    //    يسبق المنع. **والمسارُ المعتاد قراءةٌ واحدة** من الحالة الجارية —
    //    ولا يُلتقط أثرُ النداء إلا عند التداخل، وهو نادر.
    return withTransactionProbe(() =>
      scoped.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        return work(tx as unknown as Prisma.TransactionClient);
      }, options),
    );
  }

  /**
   * **مسنَدُ الإدارة** (`ق-٦٧٥`): معاملةٌ لمدير المنصّة **لا لمستأجر** — تضبط
   * `app.platform_admin = 'true'` للمعاملة وحدَها، فتقبل سياساتُ الجداول ثنائية
   * النطاق ما هو للمنصّة (كتابةُ قالبٍ عامٍّ `companyId IS NULL` · قراءةٌ عبر
   * المنشآت حيث تنصّ السياسةُ على ذلك).
   *
   * ⚠️ **ليس مفتاحاً ثانياً لعزل المستأجر** — ما رُفض في `ق-٦٦٤` (ج) كان مفتاحاً
   * يفتح صفوفَ مستأجرٍ بغير سياقه. هذا مسارُ المنصّة الذي أُعلن دَيناً في
   * `KNOWN_WEAK` («حتى يُبنى للمنصّة مسارٌ بسياق أو دورٌ ثانٍ»): **مسارٌ بسياق**،
   * لا دورَ يتجاوز العزل. **ويُستدعى بعد أن يثبت الحارسُ هويّةَ مدير المنصّة** —
   * لا من مسارٍ يخدم مستأجراً. ولا امتدادَ حقنٍ هنا: العميلُ خامٌ داخل المعاملة.
   */
  async runAsPlatformAdmin<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T> {
    return withTransactionProbe(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
        return work(tx);
      }, options),
    );
  }

  /**
   * **مسندُ مصادقة مفتاح النظام** (`ق-١٢٩١` · ي/⑫A3) — على نمط `runAsPlatformAdmin`.
   *
   * المفتاحُ يُقدَّم **قبل أن يُعرف مستأجرُه**، فالسياقُ هو ما نبحث عنه ولا يمكن أن
   * يسبقه — كقراءة الهويّة في الدخول. ولولا هذا لعادت القراءةُ **فارغةً بنجاح** تحت
   * `FORCE` فيُردّ كلُّ مفتاحٍ صحيحٍ `401`، **وهو ما وقع في أوّل تشغيلٍ للحزمة**.
   *
   * ⚠️ **وحدودُه ثلاثة**: السياسةُ `FOR SELECT` فلا يُكتب بها شيء · ولا يستدعيه إلا
   * مسارُ المصادقة · **والبحثُ بالبادئة الفريدة** فلا يُعيد إلا صفّاً واحداً، وكلُّ ما
   * بعده داخل سياق منشأة المفتاح. **وليس مفتاحاً ثانياً لعزل المستأجر** — لا يفتح
   * صفَّ بياناتٍ واحداً، بل صفَّ المفتاح الذي قُدِّم سرُّه.
   */
  async runAsApiKeyLookup<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T> {
    return withTransactionProbe(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.api_key_auth', 'true', true)`;
        return work(tx);
      }, options),
    );
  }
}
