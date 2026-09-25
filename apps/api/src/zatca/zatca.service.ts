import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { decryptSecret, secretIsSet } from '../common/crypto/secret.util';
import { issuedWallClock } from '../common/wall-clock.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { computeDocumentTotals } from '../common/money/totals';
import { PrismaService } from '../prisma/prisma.service';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { ensureDefaultUnit } from './egs-unit.util';
import { invoiceTypeFor, isExportInvoice, nextIcv, previousChainHash } from './hash-chain.util';
import { buildUnsignedInvoiceXml, ublCategoryOf } from './ubl/invoice-xml.util';
import { STANDARD_VAT_RATE } from '../common/vat/standard-rate';
import { invoiceHashOfSigned, signInvoice, verifySignedInvoice } from './ubl/xades.util';
import { API_BASE, apiBaseFor, zatcaFetchSignal } from './zatca-onboarding.service';
import { INVOICE_ISSUED } from '../shared/events/domain-events';
import { storableText } from '../common/i18n/storable-text';
import { LINE_ORDER } from '../common/document-lines.util';
import { AuthorityMessage, zatcaWarningsOf } from './authority-warnings.util';

/** Only the company owner submits to the authority — clearing an invoice is a
 * legal act on the merchant's behalf, not routine data entry. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
  }
}

type SellerRow = {
  legalName: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  address: string | null;
  street: string | null;
  buildingNumber: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
};

type CredentialRow = {
  environment: keyof typeof API_BASE;
  privateKeyEnc: string | null;
  productionCsidEnc: string | null;
  productionSecretEnc: string | null;
};

/**
 * ادّعاءُ ختمٍ (`SUBMITTING`) أقدمُ من هذا **متروك**: عمليةٌ سقطت بين حجز الموقع
 * والتوقيع (انقطاعُ عملية، لا رفضٌ) — فيُجاز حجزُه من جديد بدل أن يبقى المستند
 * معلَّقاً إلى الأبد. عشرُ دقائق أضعافُ أطولِ توقيعٍ مقيس (١٠–٣٦ مللي ثانية).
 */
const STALE_CLAIM_MS = 10 * 60_000;

/** يُخزَّن نصاً في `zatcaMessage` كسائر الأسباب — فالواجهة تعرضه كما هو. */
export const STORED_DOC_CORRUPT = 'تلفٌ في المستند المخزَّن: تجزئته لا تطابق ما وُقّع عليه — لم يُرسَل';

/**
 * ⚖️ **جوابُ الهيئة يُقرأ من رمز الحالة لا من النصّ** (`ق-٩٧١`/١).
 *
 * قبولٌ (`2xx`) أو ردٌّ (`400` — «لم تُجَز/لم تُبلَّغ» بنتائج التحقّق) **جوابٌ على المستند**
 * فيُكتب `CLEARED`/`REJECTED`. **وما عداه ليس جواباً عليه**: اعتمادٌ مرفوض (`401`/`403`)
 * أو تكرارٌ (`409`) أو حصارٌ (`429`) أو خادمٌ معطَّل (`5xx`) أو رمزٌ لا نعرفه — **فيُرمى
 * ويعود الطابورُ إليه بتراجعه**، والمستندُ كما هو. **والشكُّ يُعيد ولا يُغلق**: `REJECTED`
 * صار إغلاقاً (`ق-٩٥٨`) لا يُفتح إلا ببدلٍ برقمٍ جديد، فجوابٌ لم يصدر لا يُكتب.
 */
export function authorityVerdict(status: number): 'accepted' | 'rejected' | null {
  if (status >= 200 && status < 300) return 'accepted';
  if (status === 400) return 'rejected';
  return null;
}

/**
 * ⚖️ **سقوطُ المحاولة ليس جواباً** (`ق-٩٧١`): يُرمى — فالطابورُ يعدّ المحاولةَ ويعود بتراجعه
 * (`PENDING` ثم `FAILED` **معلَناً** عند الاستنفاد، لا `REJECTED` — «فالتعذّرُ ليس جواباً»)،
 * والإرسالُ اليدويّ يردّه `503` برسالةٍ تسمّي ما وقع وما سيقع. والسببُ الأخير يُكتب في
 * `zatcaMessage` كي يُرى في الصفّ — وحالةُ المستند لا تُمسّ.
 */
export class ZatcaAttemptFailedException extends ServiceUnavailableException {
  constructor(public readonly reason: string) {
    super(formatMessage(MSG.zatca_attempt_failed, { reason }));
  }
}

@Injectable()
export class ZatcaService {
  private readonly logger = new Logger(ZatcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /**
   * ⭐ **«صادرٌ لم يصل»** — تقريرُ ما أُصدر ولم تقبله الهيئة بعد (`ق-١٨٢`/٢ · شرطُ
   * قبول ⑤ في `ق-١٩٦`).
   *
   * **لماذا**: منشأةٌ في المرحلة الثانية تُصدر فواتيرَ يفشل إرسالُها ستّ مراتٍ
   * ثم `FAILED` **بصمت** — لا يراها أحدٌ إلا في جدول الطابور. وبعد الختم المتزامن
   * يزول حتى العَرَض: الإيصال يخرج مكتملَ الشكل وإن لم يصل الهيئة أبداً. فهذا
   * التقرير **هو ما يُبقي العلّةَ مرئيّة** — بعددها وأقدمها، لا بإشعارٍ يُغلق.
   *
   * **ما يُحسب «لم يصل»**: كل مستندٍ حالتُه غيرُ `CLEARED` — لم يُرسَل، أو معلَّقٌ
   * في الإرسال، أو مختومٌ لم يُبلَّغ، أو رُدّ. **و`onboarded`** يقول للواجهة إن كان
   * الغيابُ مخالفةً (منشأةٌ مربوطة) أم حالاً طبيعياً لمنشأةٍ لم تدخل موجتها —
   * **ولا نعرف الموجة**: حدٌّ معلَن، فحقلُ موجة المنشأة بندٌ مستقل.
   *
   * **على مستوى المنشأة بحقّها**: ما لم يصل الهيئةَ يُعدّ على المنشأة كلِّها —
   * فالمخالفةُ مخالفةُ المنشأة برقمها الضريبيّ، والفرعُ لا يستر مستنداً لم
   * يُبلَّغ.
   */
  async unreported(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const [credential, items, failedQueue] = await Promise.all([
        tx.zatcaCredential.findUnique({ where: { companyId }, select: { productionCsidEnc: true } }),
        tx.invoice.findMany({
          where: { zatcaStatus: { not: 'CLEARED' } },
          orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
          take: 200,
          select: { id: true, no: true, docType: true, issueDate: true, total: true, zatcaStatus: true, zatcaMessage: true },
        }),
        tx.outboxEvent.count({ where: { type: INVOICE_ISSUED, status: 'FAILED' } }),
      ]);
      const count = await tx.invoice.count({ where: { zatcaStatus: { not: 'CLEARED' } } });
      const byStatus: Record<string, number> = {};
      for (const row of await tx.invoice.groupBy({ by: ['zatcaStatus'], where: { zatcaStatus: { not: 'CLEARED' } }, _count: { _all: true } })) {
        byStatus[row.zatcaStatus] = row._count._all;
      }
      return {
        onboarded: Boolean(credential && secretIsSet(credential.productionCsidEnc)),
        count,
        oldestIssueDate: items[0]?.issueDate ?? null,
        byStatus,
        /** أحداثُ إصدارٍ استُنفدت محاولاتها — تعود إلى الطابور عند الربط (`requeueFailedWithinTx`). */
        failedQueue,
        items,
      };
    });
  }

  /**
   * ⭐ **الختمُ ثم الإبلاغ — مفصولان** (`ق-١٨٧` · `ق-١٩٦`).
   *
   * كان التوقيعُ والإرسالُ فعلاً واحداً بعد الإنشاء عبر الطابور، فيُطبع الإيصال
   * **قبل** أن يوجد ختم. الآن `stampIfNeeded` يوقّع **ويحفظ** المستندَ الموقَّع
   * ورمزَه التساعي، و`report` يُرسل **المحفوظ حرفاً** — فما طُبع على الإيصال هو ما
   * تصل الهيئة، وما تصل الهيئة هو ما وُقّع عليه (يُتحقَّق قبل الإرسال).
   *
   * يستدعيه المالكُ من الشاشة **ومُعالِجُ الطابور** (`INVOICE_ISSUED`): مستندٌ ختمه
   * الكاشير عند البيع يجد ختمَه محفوظاً فيُبلَّغ فقط؛ ومستندٌ لم يُختم يُختم هنا.
   *
   * ⚖️ **وسقوطُ المحاولة يُرمى** (`ق-٩٧١`) — توقيعاً كان أو نقلاً أو جواباً ليس على المستند:
   * فالطابورُ يعود إليه بتراجعه، والشاشةُ تقرأ `503` بسببه، والمستندُ كما هو. و`REJECTED`
   * لا يُكتب إلا على جوابٍ من الهيئة (`report`).
   */
  async submitInvoice(companyId: string, actorType: string, invoiceId: string) {
    assertIsCompanyOwner(actorType);
    const ctx = await this.requireOnboarded(companyId);
    const stamped = await this.stampIfNeeded(companyId, invoiceId, ctx);
    if (stamped.qrPayload === null) throw new ZatcaAttemptFailedException(stamped.failure);
    return this.report(companyId, invoiceId, ctx.credential);
  }

  /**
   * 📌 **جوابُ الهيئة يختم حدثَ الطابور** (`ق-٩٨٣`) — مدخلُ مُعالِج الطابور (`INVOICE_ISSUED`).
   *
   * عقدُ الحدث: «أوصِل المستندَ إلى الهيئة». فمستندٌ **أجابت عنه** (`CLEARED`/`REJECTED` — يدوياً
   * من الشاشة أو من دورةٍ سابقة) مُوصَلٌ، ويعود حدثُه `SENT` بلا إرسال. وكان الطابورُ يعود إلى
   * مردودةٍ رُدّت يدوياً فيسقط بـ«لا تُعاد» ستّاً ثم `FAILED` — ضجيجٌ في «صادرٌ لم يصل» عن مستندٍ
   * وصل ورُدّ (قِيس في `ق-٩٧٩`). `actorType` = COMPANY: الإرسال فعلُ المنشأة لا فعلُ مستخدمٍ
   * بعينه، والصفّ لا يحمل فاعلاً لأن الواقعة وقعت وقت الإنشاء لا وقت الإرسال.
   */
  async deliverIssued(companyId: string, invoiceId: string): Promise<void> {
    const existing = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUnique({ where: { id: invoiceId }, select: { zatcaStatus: true } }),
    );
    if (existing?.zatcaStatus === 'CLEARED' || existing?.zatcaStatus === 'REJECTED') return;
    await this.submitInvoice(companyId, 'COMPANY', invoiceId);
  }

  /**
   * ⭐ **الختمُ المتزامن لإيصال الكاشير — لا يرمي أبداً** (`ق-١٩٦`/١).
   *
   * «سقوطُ الختم عند البيع لا يُسقط البيع»: يُعاد `{ qrPayload: null, error }`
   * فيخرج الإيصال بالوسوم الخمسة **وتنبيهٍ للكاشير**، والطابور يعيد الختم
   * والإبلاغ لاحقاً. ويُعاد `null` بلا خطأ لحالتَين ليستا سقوطاً: منشأةٌ في
   * المرحلة الأولى (لا شهادة)، **والفاتورة القياسية** (`ق-١٩٦`/٢: الهيئة تختمها
   * بالإجازة، فختمُنا لا يُغنيها — تبقى على مسارها).
   */
  async stampForReceipt(companyId: string, invoiceId: string): Promise<{ qrPayload: string | null; error: string | null }> {
    try {
      const ctx = await this.onboardedContext(companyId);
      if (!ctx) return { qrPayload: null, error: null };
      const buyer = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.findUnique({ where: { id: invoiceId }, select: { customer: { select: { kind: true, vatNumber: true, country: true } }, lines: { ...LINE_ORDER, select: { taxExemptionReasonCode: true } } } }),
      );
      if (!buyer) throw new NotFoundException(MSG.invoice_not_found);
      if (invoiceTypeFor(buyer.customer, buyer.lines) === 'standard') return { qrPayload: null, error: null };
      const stamped = await this.stampIfNeeded(companyId, invoiceId, ctx);
      return { qrPayload: stamped.qrPayload, error: stamped.failure ?? null };
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`ZATCA stamp at sale failed for invoice ${invoiceId}: ${message}`);
      return { qrPayload: null, error: message };
    }
  }

  /** الشهادةُ وملفُ المنشأة أو رميٌ بالسبب — للمسار الذي يحقّ له أن يرفض (الإرسال اليدوي والطابور). */
  private async requireOnboarded(companyId: string): Promise<{ company: SellerRow; credential: CredentialRow }> {
    const company = await this.sellerRow(companyId);
    if (!company.legalName?.trim() || !company.vatNumber?.trim()) {
      throw new BadRequestException(MSG.zatca_profile_incomplete);
    }
    // `zatca_credentials` is FORCE-RLS (it holds signing keys), so this has to
    // go through the tenant context — the raw client sees an empty table.
    const credential = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
    if (!credential || !secretIsSet(credential.productionCsidEnc)) {
      throw new BadRequestException(MSG.zatca_not_onboarded);
    }
    return { company, credential };
  }

  /** كـ`requireOnboarded` لكن يُعيد `null` بدل الرمي — لمسارٍ لا يحقّ له أن يوقف البيع. */
  private async onboardedContext(companyId: string): Promise<{ company: SellerRow; credential: CredentialRow } | null> {
    const company = await this.sellerRow(companyId);
    if (!company.legalName?.trim() || !company.vatNumber?.trim()) return null;
    const credential = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
    if (!credential || !secretIsSet(credential.productionCsidEnc)) return null;
    return { company, credential };
  }

  private sellerRow(companyId: string): Promise<SellerRow> {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        legalName: true,
        vatNumber: true,
        crNumber: true,
        address: true,
        street: true,
        buildingNumber: true,
        district: true,
        city: true,
        postalCode: true,
      },
    });
  }

  /**
   * ⭐ **يختم مرةً، ويُعيد المحفوظَ ما لم يتغيّر المحتوى.**
   *
   * توقيعٌ جديد يُغيّر الوسمَين ٧ و٩ في الرمز، **فيصير ما على إيصال العميل غيرَ ما
   * تصل الهيئة**. فمستندٌ **مختوم** (`STAMPED`) لا يُوقَّع ثانيةً أبداً — يُعاد
   * المحفوظ. ومستندٌ **مردود** (`REJECTED`) **لا يُوقَّع ولا يُعاد** (`ق-٩٥٨` · `ق-٩٦٤`):
   * الهيئةُ تُبقي عدّادَه وتجزئتَه كما هما، والتصحيحُ مستندٌ جديد بعدّادٍ وتجزئةٍ جديدَين
   * (`InvoicesService.issueReplacement`) — فالنداءُ عليه يُرفض باسمه. (وكان قبل الحكم
   * يُعاد بناءُ محتواه ويُوقَّع على موقعه إن تغيّر — ذهب مع التعديل الذي كان يُجيزه.)
   *
   * **والادّعاءُ ذرّي**: مُعالِجُ الطابور يعمل كل دقيقة والكاشير يختم عند البيع —
   * فلو التقيا في نافذة الميلّي ثانية لوُقّع مرتَين. `updateMany` المشروطُ بالحالة
   * يجعل من يفوز به المالكَ الوحيد للتوقيع، والآخر يُردّ `Conflict` (يعود الطابور
   * بعد دقيقة، والكاشير يطبع الوسوم الخمسة). **الامتناع بالشكل لا بالحظّ.**
   */
  private async stampIfNeeded(
    companyId: string,
    invoiceId: string,
    ctx: { company: SellerRow; credential: CredentialRow },
  ): Promise<{ qrPayload: string; failure?: undefined } | { qrPayload: null; failure: string }> {
    const existing = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUnique({ where: { id: invoiceId }, select: { zatcaStatus: true, zatcaSignedXml: true, zatcaQrPayload: true, zatcaHash: true } }),
    );
    if (!existing) throw new NotFoundException(MSG.invoice_not_found);
    if (existing.zatcaStatus === 'CLEARED') throw new BadRequestException(MSG.zatca_already_cleared);
    // ⚖️ **المردودةُ تُغلق ولا تُمسّ** (`ق-٩٥٨` · `ق-٩٦٤`): لا إعادةَ إرسال ولا توقيعَ ثانياً —
    // الهيئة: تجزئةُ المردود وعدّادُه لا يُغيَّران ولا يُعاد استعمالُهما، والتصحيحُ مستندٌ
    // جديد. فالرفضُ باسمه يسمّي المخرج: أصدِر بدلاً. (وكان هنا مسبارٌ يعيد توقيعَها إن
    // تغيّر محتواها — ذهب مع التعديل الذي كان يُجيزه.)
    if (existing.zatcaStatus === 'REJECTED') throw new BadRequestException(MSG.zatca_rejected_not_resubmittable);
    if (existing.zatcaStatus === 'STAMPED' && existing.zatcaSignedXml && existing.zatcaQrPayload && existing.zatcaHash) {
      return { qrPayload: existing.zatcaQrPayload };
    }

    /**
     * ⚠️ **إعادة المحاولة على `P2002` — وهي ما يجعل القيد الفريد على `zatcaIcv`
     * علاجاً بدل عَرَضٍ آخر.**
     *
     * `nextIcv` يبني على `count()+1` بلا قفل، فجولتان متزامنتان تحسبان الموقع
     * نفسه. والقياس قبل القيد (٢٠٢٦-٠٨-١٥): من ١٢ جولة، **١١ حملت ICV مكرَّراً**
     * (`1,1,3,3,5,5,…`). ثم حوّل القيدُ الفريد على الموقع الفسادَ الصامت إلى
     * `P2002` **ظاهر** — وهذا اللفّ يجعله يتقارب بدل أن يردّ 500. (كان القيد على
     * المنشأة، وصار في الدفعة (ب) على الوحدة: `@@unique([egsUnitId, zatcaIcv])`.)
     *
     * ## ولماذا اللفّ آمنٌ هنا بالذات — ثلاث خصائص من المصدر لا من الظنّ
     *
     * ① **المعاملة تنتهي قبل التوقيع والشبكة.** فالمحاولة المعادة تُعيد قراءاتٍ
     *    وبناءَ XML **فقط** — لا توقيع، ولا `fetch`، ولا خطر إرسالٍ مزدوج.
     *
     * ② **الـ`P2002` هنا لا يكون إلا الـICV.** الكتابة الوحيدة تضبط
     *    `zatcaUuid`/`zatcaPreviousHash`/`zatcaIcv`/`zatcaStatus`، و`zatcaUuid`
     *    **بلا قيد فرادة**؛ و`@@unique([companyId, no])` و`[companyId,
     *    clientSaleId]` لا يُكتب أيٌّ منهما هنا. فالدقّة **بنيوية**.
     *
     * ③ **التقارب مضمون.** معاملة الخاسر ترتدّ كاملةً (والادّعاءُ معها)، فتُقرأ
     *    الفاتورة في المحاولة التالية و`zatcaIcv` لا يزال `null`، ويعيد `nextIcv`
     *    العدّ وقد التزم الفائز.
     *
     * ⚖️ **و`PIH` لم يعد يتفرّع بالسباق** (`ق-١١٩٨`/⑦ — كان بنداً معلَناً هنا):
     * `previousChainHash` تقرأ بصمةَ الموقع `ICV − 1` بعينه، فالخاسرُ في السباق
     * يجد سلفَه محجوزاً غيرَ مختوم **فيُرفض** (`ConflictException` لا `P2002` —
     * فلا يلفّه هذا اللفّ) ويعود الطابورُ إليه بعد أن يُختم سلفُه. **ولا موقعَ
     * يُتخطّى**: تكرارُ `PIH` الذي كان «مشروعاً» هو التفرّعُ الذي يُمنع الآن.
     */
    const unsigned = await retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => this.claimAndBuild(tx, companyId, invoiceId, ctx.company)),
    );

    try {
      // The certificate is the merchant's, held by the platform on their
      // behalf — signing happens here, in-process, and the key is decrypted
      // only for the duration of this call.
      const { signedXml, invoiceHash, qrBase64 } = await signInvoice({
        unsignedXml: unsigned.xml,
        privateKeyPem: decryptSecret(ctx.credential.privateKeyEnc!),
        certificateBase64: decryptSecret(ctx.credential.productionCsidEnc!),
        qr: unsigned.qr,
      });
      // يُحفظ **قبل** أي شبكة: التجزئة يحتاجها المستند التالي (PIH)، والمستند
      // والرمز يحتاجهما الإيصال الآن والإبلاغ لاحقاً — حرفاً.
      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.update({
          where: { id: invoiceId },
          data: { zatcaHash: invoiceHash, zatcaSignedXml: signedXml, zatcaQrPayload: qrBase64, zatcaStampedAt: new Date(), zatcaStatus: 'STAMPED', zatcaMessage: null },
        }),
      );
      return { qrPayload: qrBase64 };
    } catch (e) {
      // سقط التوقيعُ بعد حجز الموقع: **ليس جواباً من الهيئة** (`ق-٩٧١`) فلا يُكتب مردوداً —
      // يُحرَّر الادّعاء (`NOT_SUBMITTED`) **والموقعُ معه** (`ق-١١٩٨`/⑦: موقعٌ بلا بصمةٍ يحبس
      // ما بعده) فيأخذه التالي بلا فجوة، ويُكتب السبب. **ولا يُرمى هنا**: الكاشير يطبع
      // الوسوم الخمسة، و`submitInvoice` يرمي من بعدُ للطابور والشاشة. (أخطاءُ البناء والتحقّق
      // قبل التوقيع تبقى استثناءاتٍ تُرمى: مستندٌ لا يُبنى ليس مردوداً بل مرفوضٌ قبل أن يُحجز
      // له شيء.)
      const message = (e as Error).message;
      this.logger.warn(`ZATCA signing failed for invoice ${invoiceId}: ${message}`);
      await this.releaseClaim(companyId, invoiceId, message);
      return { qrPayload: null, failure: message };
    }
  }

  /**
   * حجزُ الموقع في السلسلة وبناءُ المستند غير الموقَّع — داخل معاملةٍ واحدة.
   * الادّعاءُ في `updateMany` المشروط هو ما يمنع توقيعَين متزامنَين (انظر `stampIfNeeded`).
   * (كان له وضعُ `probe` يبني المردودَ بلا ادّعاءٍ ليقارنه بمحفوظه — ذهب مع إعادة توقيع المردود، `ق-٩٦٤`.)
   */
  private async claimAndBuild(tx: Prisma.TransactionClient, companyId: string, invoiceId: string, company: SellerRow) {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        // ⚖️ بترتيبها المعلَن (`ق-١٤١٢`): `cbc:ID` يُكتب بترتيب هذه القراءة — فالمختومُ والمعروضُ والمطبوعُ ترتيبٌ واحد.
        lines: LINE_ORDER,
        relatedInvoice: { select: { no: true } },
        // ④A1: مراجعُ الدفعات المقدَّمة المطبَّقة — رقمُ مستندها ولحظتُه وسطرُه (فئةً ونسبةً) كما صدر.
        prepaymentsApplied: {
          select: { net: true, vat: true, prepaymentInvoice: { select: { no: true, issueDate: true, issuedAt: true, issuedOffsetMin: true, lines: { ...LINE_ORDER, select: { taxRate: true, taxCategory: true, taxExemptionReasonCode: true } } } } },
        },
      },
    });
    if (!invoice) throw new NotFoundException(MSG.invoice_not_found);
    if (invoice.zatcaStatus === 'CLEARED') throw new BadRequestException(MSG.zatca_already_cleared);

    // The chain link is assigned once and kept: re-submitting a rejected
    // invoice must reuse its UUID, position and counter, not mint new ones,
    // or the chain would gain a gap.
    //
    // ⚠️ **ومحاولةٌ معادة بعد `P2002` تُولّد UUID جديداً — وهذا ليس مخالفةً
    // للقاعدة أعلاه.** القاعدة عن مستندٍ **أُرسل ورُفض**: له وجودٌ لدى
    // الهيئة وموقعٌ محجوز، فتغييرُ هويته يُحدث فجوة. والمحاولة المعادة هنا
    // ارتدّت **قبل التوقيع** — فلم يُرسَل شيء، ولم يُلتزم صفّ، ولا وجود لمستندٍ
    // تُحفظ هويته. والشرط `?? ` هو ما يحمي الحالة الأولى: صفٌّ ملتزَم يحمل UUID
    // يُقرأ فيُعاد استعماله.
    const uuid = invoice.zatcaUuid ?? randomUUID();

    /**
     * ⭐ **الوحدة قبل العدّاد والسلسلة — لأنهما لها** (`ق-١٧٧`، الدفعة ب).
     *
     * الهيئة: «تسلسلٌ واحد لكل `EGS` ربطها» (الدليل الفني المفصّل v2)، و`ICV`
     * يبدأ من `1` لكل `CSID` (موظف الهيئة، مجتمع فاتورة 7680). فالوحدة تُحسم
     * **أولاً**، ثم يُعَدّ داخلها ويُقرأ آخر مقبولٍ فيها. واليوم وحدةٌ افتراضية
     * واحدة لكل منشأة، فالأرقام لم تتغيّر — والتعبئة في (أ) هي ما جعل كل مستندٍ
     * قائمٍ يحمل وحدته سلفاً، فلا مستندَ بلا وحدة يفلت من العدّ.
     *
     * ومستندٌ أُعيد إرساله يحمل وحدته وموقعه وسلفَه من المحاولة الأولى (`??`)،
     * فلا يُعاد عدُّه — الوحدة الافتراضية تُنشأ إن غابت، لا افتراضٌ أن التعبئة
     * أدركت هذه المنشأة.
     */
    const unit = await ensureDefaultUnit(tx, companyId);
    // الموقعُ أوّلاً ثم سلفُه: `PIH` بصمةُ الموقع `ICV − 1` أيّاً كانت حالتُه (`ق-١١٩٨`/⑦) —
    // وسلفٌ محجوزٌ لم يُختم بعد يرفض الختمَ الآن فيعود الطابورُ إليه، لا يُتخطّى.
    const icv = invoice.zatcaIcv ?? (await nextIcv(tx, unit.id));
    const previousHash = invoice.zatcaPreviousHash ?? (await previousChainHash(tx, unit.id, icv));
    const invoiceType = invoiceTypeFor(invoice.customer, invoice.lines);
    // ⑤A3: علَمُ الصادرات من بلد المشتري وسطر صادراتٍ معاً؛ ومشترٍ أجنبيٌّ يحمل رقمَ تسجيلٍ سعوديّاً تناقضٌ يُرفض باسمه (BR-KSA-46).
    const exportInvoice = isExportInvoice(invoice.customer, invoice.lines);
    if (exportInvoice && invoice.customer.vatNumber?.trim()) throw new ConflictException(formatMessage(MSG.zatca_export_buyer_vat, { customer: invoice.customer.name }));

    /**
     * ⭐ **بوّابة عنوان المشتري — قبل أول كتابة** (`BR-KSA-63`).
     *
     * الهيئة تشترط على **الفاتورة القياسية** لمشترٍ في السعودية عنواناً
     * مبنيّاً كاملاً: الشارع · رقم المبنى · الحي · المدينة · الرمز البريدي.
     * **ولا تشترطه على المبسطة** — فبيع الكاشير لا يُحمَّل ما ليس عليه.
     *
     * ⚠️ **والعطل الذي تمنعه كان صامتاً تماماً**: بانِي المستند يقبل هذه
     * الحقول منذ كُتب، **ومصدرها لم يكن في `Customer` أصلاً** — فكان يُصدَّر
     * `<cbc:StreetName></cbc:StreetName>` وأخواتها **فارغةً في كل فاتورة
     * أعمال**. مستندٌ يبدو مكتملاً، يُرَدّ من الهيئة، **والسبب لا يظهر عندنا
     * في أي موضع**.
     *
     * **وموضعها قبل الادّعاء عمداً**: لو وقعت بعده لاعتمدنا على ارتداد المعاملة
     * لإلغاء `zatcaIcv` — وهو صحيحٌ اليوم **ويصير خاطئاً** يوم يُنقل الترقيم
     * خارجها. فالبوّابة **لا تستند إلى ترتيبٍ قد يتغيّر**.
     *
     * والرسالة **تسمّي الناقص بالاسم** — فمن يصطدم بها يعرف ماذا يُكمل.
     */
    if (invoiceType === 'standard') {
      const required: Record<string, string | null> = {
        'الشارع': invoice.customer.street,
        'رقم المبنى': invoice.customer.buildingNumber,
        'الحي': invoice.customer.district,
        'المدينة': invoice.customer.city,
        'الرمز البريدي': invoice.customer.postalCode,
      };
      const missing = Object.entries(required)
        .filter(([, value]) => !value?.trim())
        .map(([label]) => label);
      if (missing.length) {
        throw new BadRequestException(
          formatMessage(MSG.zatca_buyer_address_incomplete, { customer: invoice.customer.name, missing: missing.join(' · ') }),
        );
      }
      // BR-KSA-81 (②A1): مشترٍ بلا رقمٍ ضريبيّ على فاتورةٍ كاملة يحتاج معرّفَه البديل (BT-46) بمخطّطه — يُسمّى الناقصُ هنا لا في ردّ الهيئة.
      if (!invoice.customer.vatNumber?.trim() && !(invoice.customer.otherIdScheme && invoice.customer.otherId)) {
        throw new BadRequestException(formatMessage(MSG.zatca_buyer_id_missing, { customer: invoice.customer.name }));
      }
    }

    // ⭐ **الادّعاء** (`ق-١٩٦`): الوحدةُ والموقعُ والسلفُ والحالةُ في كتابةٍ واحدة
    // **مشروطةٍ بأن لا أحدَ يختم الآن** — من يفوز بها يوقّع وحده. `CHECK
    // "invoices_icv_requires_unit"` في القاعدة يرفض موقعاً بلا وحدة بالشكل (`ق-١٥٩`).
    {
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          OR: [
            // ⚖️ **لا `REJECTED` هنا** (`ق-٩٦٤`): المردودةُ لا تُدّعى ولا تُوقَّع ثانيةً — عدّادُها
            // وتجزئتُها كما هما، ومخرجُها بدلٌ جديد. المنعُ بالشكل: `updateMany` لا يجدها.
            { zatcaStatus: 'NOT_SUBMITTED' },
            // مختومٌ بلا مستندٍ محفوظ لا يقع بالشكل — لكن إن وقع فلا يُترك عالقاً.
            { zatcaStatus: 'STAMPED', zatcaSignedXml: null },
            // ادّعاءٌ متروك: عمليةٌ سقطت بين الحجز والتوقيع.
            { zatcaStatus: 'SUBMITTING', updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
          ],
        },
        data: { egsUnitId: unit.id, zatcaUuid: uuid, zatcaPreviousHash: previousHash, zatcaIcv: icv, zatcaStatus: 'SUBMITTING' },
      });
      if (claimed.count === 0) throw new ConflictException(MSG.zatca_stamp_in_progress);
    }

    // كنسة التدوير (قرار المالك 2026-09-03): **المختوم = المرحَّل بالبناء** — المجاميع
    // المخزَّنة تُعاد من البنود بالدالة نفسها التي يستعملها الدفتر والمستند. فإن اختلفت
    // هللةً (فاتورةٌ قديمة بطريقةٍ سابقة، أو بنودٌ عُدّلت بلا إعادة حساب) **لا يُختم**
    // المستند ويُعلَن الفرق — فمستندٌ مختوم يخالف الدفتر أسوأ من مستندٍ لم يُختم.
    // ⑧ ما لا يُختم يُرمى باسمه قبل أيّ بناء: سطرٌ قديم بصفرٍ بلا فئة، أو فئةٌ بلا سببها (`BR-KSA-CL-04`).
    if (invoice.lines.some((l) => l.taxCategory === 'LEGACY_ZERO')) throw new ConflictException(MSG.zatca_legacy_zero_unstampable);
    if (invoice.lines.some((l) => l.taxCategory !== 'S' && l.taxCategory !== 'LEGACY_STANDARD' && !l.taxExemptionReasonCode)) {
      throw new ConflictException(MSG.zatca_reason_missing);
    }
    const recomputed = computeDocumentTotals(
      invoice.lines.map((l) => ({
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        taxRate: Number(l.taxRate),
        taxCategory: l.taxCategory,
        taxExemptionReasonCode: l.taxExemptionReasonCode,
        taxExemptionReason: l.taxExemptionReason,
      })),
    );
    const stored = { subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), total: Number(invoice.total) };
    for (const key of ['subtotal', 'taxTotal', 'total'] as const) {
      if (recomputed[key] !== stored[key]) {
        throw new ConflictException(
          `الفاتورة ${invoice.no}: ${key} المخزَّن ${stored[key]} لا يطابق المحسوب من بنودها ${recomputed[key]} — لا تُختم حتى تُصحَّح`,
        );
      }
    }

    // يومُ الإصدار ووقتُه من لحظة الجهاز وانحرافه — لا من عمود اليوم وحده (`ق-١٨٥`).
    const issued = issuedWallClock(invoice);
    const xml = buildUnsignedInvoiceXml({
      number: invoice.no,
      uuid,
      issued,
      invoiceType,
      // Credit/debit notes travel as the same Invoice structure with type
      // code 381/383 plus the original's reference and the reason — and
      // they occupy ordinary positions in the same ICV/PIH chain.
      documentType: invoice.docType === 'CREDIT_NOTE' ? 'credit' : invoice.docType === 'DEBIT_NOTE' ? 'debit' : invoice.docType === 'PREPAYMENT' ? 'prepayment' : 'invoice',
      // ⑤A3: KSA-2 — الصادراتُ مشتقّة؛ والباقي أصفارٌ معلَنة (غيرُ مبنيّة).
      flags: { export: exportInvoice },
      billingReference: invoice.relatedInvoice ? { invoiceNumber: invoice.relatedInvoice.no } : undefined,
      adjustmentReason: invoice.adjustmentReason ?? undefined,
      icv,
      pih: previousHash,
      seller: {
        name: company.legalName!,
        vatNumber: company.vatNumber,
        crNumber: company.crNumber,
        // The structured parts the authority reads. `address` is the
        // display line and is deliberately not parsed into these — it falls
        // back only where the merchant has left a part blank.
        street: company.street ?? company.address,
        buildingNumber: company.buildingNumber,
        district: company.district,
        city: company.city,
        postalCode: company.postalCode,
      },
      buyer: {
        name: invoice.customer.name,
        vatNumber: invoice.customer.vatNumber,
        // ②A1: معرّفٌ بديل بمخطّطه (BR-KSA-14) وبلدُ المشتري (BT-55) — من بطاقته لا ثابتَين.
        otherId:
          invoice.customer.otherIdScheme && invoice.customer.otherId
            ? { scheme: invoice.customer.otherIdScheme, id: invoice.customer.otherId }
            : null,
        country: invoice.customer.country,
        street: invoice.customer.street,
        buildingNumber: invoice.customer.buildingNumber,
        district: invoice.customer.district,
        city: invoice.customer.city,
        postalCode: invoice.customer.postalCode,
      },
      lines: invoice.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitCode: l.unitCode ?? null,
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        taxRate: Number(l.taxRate),
        // ⑧ الفئةُ والسببُ كما نُسخا على السطر لحظةَ البيع — لا من البطاقة اليوم.
        taxCategory: l.taxCategory,
        taxExemptionReasonCode: l.taxExemptionReasonCode,
        taxExemptionReason: l.taxExemptionReason,
      })),
      currency: invoice.currency,
      subtotal: Number(invoice.subtotal),
      taxTotal: Number(invoice.taxTotal),
      total: Number(invoice.total),
      // The tax always goes to the authority in SAR, whatever the invoice is
      // denominated in.
      taxTotalSar: Number(invoice.baseTaxTotal ?? invoice.taxTotal),
      // ④A1: كلُّ دفعةٍ مقدَّمة مطبَّقة سطرُ مرجعٍ (KSA-26…34) — وعاؤها وضريبتُها كما على مستندها، وفئتُه ونسبتُه من سطره الواحد.
      prepayments: invoice.prepaymentsApplied.map((p) => {
        const line = p.prepaymentInvoice.lines[0];
        return {
          number: p.prepaymentInvoice.no,
          issued: issuedWallClock(p.prepaymentInvoice),
          taxable: Number(p.net),
          tax: Number(p.vat),
          category: line ? ublCategoryOf({ taxCategory: line.taxCategory, taxExemptionReasonCode: line.taxExemptionReasonCode }) : 'S',
          rate: line ? Number(line.taxRate) : STANDARD_VAT_RATE,
        };
      }),
    });

    return {
      xml,
      uuid,
      invoiceType,
      qr: {
        sellerName: company.legalName!,
        vatNumber: company.vatNumber!,
        issued,
        total: Number(invoice.total),
        vatAmount: Number(invoice.taxTotal),
      },
    };
  }

  /**
   * ⭐ **الإبلاغ: يُرسل المحفوظَ حرفاً — بعد أن يُثبَت أنه ما وُقّع عليه** (`ق-١٩٦`/٤).
   *
   * «حارسٌ يمنع الكتابة لا يكشف فساداً في التخزين»: حارسُ التعديل يحمي **من نيّة**،
   * وهذا يحمي **من عطل** — تُعاد تجزئةُ المستند من بايتاته المخزَّنة (بلا العقد
   * الثلاث المستثناة) وتُقارَن بـ`zatcaHash` الذي حُفظ لحظةَ التوقيع، ويُتحقَّق
   * التوقيعُ نفسه بشهادته. مستندٌ لا يطابق **لا يُرسَل**: يُرمى بسببٍ مسمّى (`ق-٩٧١` —
   * ليس جواباً من الهيئة فلا يُكتب مردوداً)، ويبقى ظاهراً في «صادرٌ لم يصل» حتى يُنظَر فيه.
   *
   * ⚖️ **والجوابُ يُقرأ من رمز الحالة** (`authorityVerdict`): قبولٌ أو ردٌّ يُكتبان؛ وما ليس
   * جواباً على المستند — سقوطُ `fetch` · اعتمادٌ · حصارٌ · خادمٌ — **يُرمى** فيعود الطابور.
   */
  private async report(companyId: string, invoiceId: string, credential: CredentialRow) {
    const stored = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { zatcaSignedXml: true, zatcaHash: true, zatcaUuid: true, customer: { select: { kind: true, vatNumber: true, country: true } }, lines: { ...LINE_ORDER, select: { taxExemptionReasonCode: true } } },
      }),
    );
    if (!stored) throw new NotFoundException(MSG.invoice_not_found);
    if (!stored.zatcaSignedXml || !stored.zatcaHash || !stored.zatcaUuid) throw new ConflictException(MSG.zatca_not_stamped);

    const recomputed = invoiceHashOfSigned(stored.zatcaSignedXml);
    const signatureOk = await verifySignedInvoice(stored.zatcaSignedXml).catch(() => false);
    if (recomputed !== stored.zatcaHash || !signatureOk) {
      this.logger.error(`ZATCA stored document for invoice ${invoiceId} failed integrity: hash ${recomputed === stored.zatcaHash ? 'ok' : 'MISMATCH'}, signature ${signatureOk ? 'ok' : 'INVALID'}`);
      await this.recordAttempt(companyId, invoiceId, STORED_DOC_CORRUPT);
      throw new ZatcaAttemptFailedException(STORED_DOC_CORRUPT);
    }

    try {
      // Standard (B2B) invoices are *cleared* before being given to the buyer;
      // simplified (B2C) ones are *reported* within 24h. Sending one down the
      // other's path is rejected.
      const invoiceType = invoiceTypeFor(stored.customer, stored.lines);
      const path = invoiceType === 'standard' ? '/invoices/clearance/single' : '/invoices/reporting/single';
      const token = decryptSecret(credential.productionCsidEnc!);
      const secret = decryptSecret(credential.productionSecretEnc!);

      // ⏱ مهلةٌ على الاتصال (`ق-١١٩٨`/③): اتصالٌ معلَّقٌ كان يوقف طابورَ المنشأة بمدّة صمت `undici`.
      const res = await fetch(`${apiBaseFor(credential.environment)}${path}`, {
        method: 'POST',
        signal: zatcaFetchSignal(),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          'Clearance-Status': invoiceType === 'standard' ? '1' : '0',
          Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          invoiceHash: stored.zatcaHash,
          uuid: stored.zatcaUuid,
          // The authority takes the signed document base64-encoded — the stored bytes, verbatim.
          invoice: Buffer.from(stored.zatcaSignedXml, 'utf8').toString('base64'),
        }),
      });

      // كان يُقرأ `message` وحده — وهو **ليس من حقول استجابة هاتين النقطتين**.
      // فالمخزَّن عند أي رفض كان النصّ «HTTP 409» فقط، و`validationResults`
      // بكل رسائل الهيئة **تُهدَر**. ولا نقطة استعلام حالة لدى الهيئة (مؤكَّد
      // بفحص البوّابة حيّاً 2026-08-15)، فما لا يُخزَّن هنا **لا يُستعاد أبداً**.
      //
      // ⚖️ والقرارُ من رمز الحالة لا من النصّ (`ق-٩٧١`/١ — `authorityVerdict`): `2xx` قبولٌ
      // و`400` ردٌّ، **وما عداه ليس جواباً على المستند** (`401`/`403`/`409`/`429`/`5xx`)
      // فيُرمى ويعود الطابور — والنصّ يبقى للسجلّ لا للحكم، ويُقصّ عند ٥٠٠ حرف
      // كسابقة `zatca-onboarding.service.ts:248`.
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const verdict = authorityVerdict(res.status);
      const detail =
        typeof body.message === 'string' && body.message
          ? body.message
          : Object.keys(body).length > 0
            ? `HTTP ${res.status} — ${JSON.stringify(body)}`.slice(0, 500)
            : verdict === 'accepted'
              ? null
              : `HTTP ${res.status}`;
      if (verdict === null) {
        // الرمزُ في أول السبب دائماً — فهو الفيصل، والنصُّ بعده للسجلّ.
        const reason = detail && !detail.startsWith(`HTTP ${res.status}`) ? `HTTP ${res.status} — ${detail}` : (detail ?? `HTTP ${res.status}`);
        this.logger.warn(`ZATCA answered ${res.status} for invoice ${invoiceId} — not a verdict on the document, will retry: ${reason}`);
        await this.recordAttempt(companyId, invoiceId, reason);
        throw new ZatcaAttemptFailedException(reason);
      }
      await this.recordResult(companyId, invoiceId, verdict === 'accepted', detail, zatcaWarningsOf(body));
      return this.statusOf(companyId, invoiceId);
    } catch (e) {
      if (e instanceof ZatcaAttemptFailedException) throw e;
      // سقوطُ النقل — `fetch` رمى (انقطاعٌ · منفذٌ لا يصغي · مهلة): لا جوابَ فلا `REJECTED`
      // (`ق-٩٧١`)؛ يُكتب السببُ ويُرمى فيعود الطابورُ إليه بتراجعه.
      const message = (e as Error).message;
      this.logger.warn(`ZATCA submission failed for invoice ${invoiceId}: ${message}`);
      await this.recordAttempt(companyId, invoiceId, message);
      throw new ZatcaAttemptFailedException(message);
    }
  }

  /**
   * سببُ آخر محاولةٍ لم تُجب عنها الهيئة — يُرى في الصفّ؛ والحالةُ ولحظةُ الإرسال لا تُمسّان.
   *
   * ⚖️ كلُّ ما يُكتب في `zatcaMessage` يمرّ بـ`storableText` (`ق-٩٨٢`): نصٌّ من الهيئة أو من `fetch`
   * يحمل بايتاً صفريّاً كان يُسقط الكتابةَ كلَّها فيضيع الردُّ ويُكتب نصُّ `Prisma` في صفّ التاجر.
   */
  private recordAttempt(companyId: string, invoiceId: string, reason: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({ where: { id: invoiceId }, data: { zatcaMessage: storableText(reason) } }),
    );
  }

  /** تحريرُ ادّعاء الختم بعد سقوط التوقيع — الموقعُ (`ICV`/`UUID`/`PIH`) يبقى ليُعاد استعمالُه. */
  /**
   * تحريرُ ادّعاء الختم بعد سقوط التوقيع — **والموقعُ يُحرَّر معه** (`ق-١١٩٨`/⑦).
   *
   * كان الموقعُ (`ICV`/`UUID`/`PIH`) يبقى محجوزاً «للمحاولة التالية» — ومستندٌ لم يُوقَّع لم
   * يُرسَل، فلا هويّةَ له عند الهيئة تُحفظ. وبعد أن صار سلفُ كلّ مستندٍ **موقعَه السابق بعينه**،
   * موقعٌ محجوزٌ بلا بصمةٍ يحبس ما بعده حتى يُوقَّع — وما لا يُوقَّع (شهادةٌ فاسدة · مبلغٌ يفيض
   * على حدّ الرمز) كان سيحبس سلسلةَ المنشأة كلَّها. فيُحرَّر الموقعُ ويأخذه المستندُ التالي بلا
   * فجوة، **ويأخذ هذا المستندُ موقعاً وهويّةً جديدَين حين يُعاد** — وهو ما كان يقع أصلاً عند
   * الارتداد قبل التوقيع (`P2002`).
   */
  private releaseClaim(companyId: string, invoiceId: string, reason: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({
        where: { id: invoiceId },
        data: { zatcaStatus: 'NOT_SUBMITTED', zatcaMessage: storableText(reason), zatcaIcv: null, zatcaUuid: null, zatcaPreviousHash: null },
      }),
    );
  }

  /**
   * جوابُ الهيئة على المستند — الحالةُ والنصُّ **وتحذيراتُها** (`ق-١٢٧٩` · ز/⑤A2).
   *
   * التحذيرُ يُحفظ ولا يُغيّر الحكم: مستندٌ مقبولٌ بملاحظاتٍ يبقى `CLEARED` — وتُرى ملاحظاتُه.
   *
   * **وآخرُ جوابٍ هو المحفوظ** — كما `zatcaMessage` تماماً: جوابٌ بلا تحذيراتٍ يكتب `NULL`،
   * فالحقلُ يصف **الجوابَ الأخير** لا اتحادَ الأجوبة. (والمعامل إلزاميٌّ عمداً: اختياريٌّ
   * يُغري بمُستدعٍ يُغفله فيبقى تحذيرُ جوابٍ سابقٍ منسوباً إلى جوابٍ لاحقٍ لم يقله.)
   */
  private recordResult(companyId: string, invoiceId: string, cleared: boolean, message: string | null, warnings: AuthorityMessage[] | null) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({
        where: { id: invoiceId },
        data: {
          zatcaStatus: cleared ? 'CLEARED' : 'REJECTED',
          zatcaSubmittedAt: new Date(),
          zatcaMessage: storableText(message),
          // `InputJsonValue` لا تقبل واجهةً مسمّاةً (لا فهرسَ نصّيّ فيها) — فالتحويلُ عبر `unknown`.
          // **والتنقيةُ في موضع الكتابة** (`ق-٩٨٢`): البايتُ الصفريُّ يرفضه `JSONB` كما يرفضه عمودُ
          // النصّ، فلا يكفي أن يُنقّى في المحلّل — يُرى هنا حيث يُكتب.
          zatcaWarnings: warnings
            ? (warnings.map((w) => ({ ...w, code: storableText(w.code) ?? '', message: storableText(w.message) ?? '' })) as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      }),
    );
  }

  private statusOf(companyId: string, invoiceId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: {
          id: true,
          no: true,
          zatcaStatus: true,
          zatcaUuid: true,
          zatcaHash: true,
          zatcaPreviousHash: true,
          zatcaIcv: true,
          zatcaStampedAt: true,
          zatcaSubmittedAt: true,
          zatcaMessage: true,
        },
      }),
    );
  }
}
