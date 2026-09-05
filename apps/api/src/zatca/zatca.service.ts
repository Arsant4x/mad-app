import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { decryptSecret, secretIsSet } from '../common/crypto/secret.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { computeDocumentTotals } from '../common/money/totals';
import { PrismaService } from '../prisma/prisma.service';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { invoiceTypeFor, latestChainHash, nextIcv } from './hash-chain.util';
import { buildUnsignedInvoiceXml } from './ubl/invoice-xml.util';
import { signInvoice } from './ubl/xades.util';
import { API_BASE, apiBaseFor } from './zatca-onboarding.service';

/** Only the company owner submits to the authority — clearing an invoice is a
 * legal act on the merchant's behalf, not routine data entry. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
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
   * Assembles everything the authority needs for one invoice, records the chain
   * link, then submits it using **this merchant's own certificate**, which the
   * platform holds on their behalf (CLAUDE.md §1 — the merchant is the end user
   * and never operates infrastructure).
   */
  async submitInvoice(companyId: string, actorType: string, invoiceId: string) {
    assertIsCompanyOwner(actorType);

    const company = await this.prisma.company.findUniqueOrThrow({
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

    if (!company.legalName?.trim() || !company.vatNumber?.trim()) {
      throw new BadRequestException(MSG.zatca_profile_incomplete);
    }

    // `zatca_credentials` is FORCE-RLS (it holds signing keys), so this has to
    // go through the tenant context — the raw client sees an empty table.
    const credential = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
    if (!credential || !secretIsSet(credential.productionCsidEnc)) {
      throw new BadRequestException(MSG.zatca_not_onboarded);
    }

    /**
     * ⚠️ **إعادة المحاولة على `P2002` — وهي ما يجعل القيد الفريد على `zatcaIcv`
     * علاجاً بدل عَرَضٍ آخر.**
     *
     * `nextIcv` يبني على `count()+1` بلا قفل، فجولتان متزامنتان تحسبان الموقع
     * نفسه. والقياس قبل القيد (٢٠٢٦-٠٨-١٥): من ١٢ جولة، **١١ حملت ICV مكرَّراً**
     * (`1,1,3,3,5,5,…`). ثم حوّل `@@unique([companyId, zatcaIcv])` الفسادَ
     * الصامت إلى `P2002` **ظاهر** — وهذا اللفّ يجعله يتقارب بدل أن يردّ 500.
     *
     * ## ولماذا اللفّ آمنٌ هنا بالذات — ثلاث خصائص من المصدر لا من الظنّ
     *
     * ① **المعاملة تنتهي قبل الشبكة.** توقيعُ المستند وإرساله في `dispatch`
     *    بعد إغلاقها، فالمحاولة المعادة تُعيد قراءاتٍ وبناءَ XML **فقط** —
     *    لا توقيع، ولا `fetch`، ولا خطر إرسالٍ مزدوج إلى الهيئة.
     *
     * ② **الـ`P2002` هنا لا يكون إلا الـICV.** الكتابة الوحيدة تضبط
     *    `zatcaUuid`/`zatcaPreviousHash`/`zatcaIcv`/`zatcaStatus`، و`zatcaUuid`
     *    **بلا قيد فرادة**؛ و`@@unique([companyId, no])` و`[companyId,
     *    clientSaleId]` لا يُكتب أيٌّ منهما هنا. فالدقّة **بنيوية**، ولا حاجة
     *    إلى ترشيح `e.meta?.target` كما في `quotes.service.ts`.
     *
     * ③ **التقارب مضمون.** معاملة الخاسر ترتدّ كاملةً، فتُقرأ الفاتورة في
     *    المحاولة التالية و`zatcaIcv` لا يزال `null`، ويعيد `nextIcv` العدّ وقد
     *    التزم الفائز.
     *
     * ⚠️ **وحدُّه معلَن**: `zatcaPreviousHash` (PIH) يتفرّع بالسباق نفسه
     * **ولا يمسّه هذا الإصلاح** — `latestChainHash` يقرأ المقبول (`CLEARED`)
     * وحده، وهو لا يتغيّر أثناء السباق فيأخذ المتزامنان الـPIH نفسه قبلَه
     * وبعدَه سواء. والعلاج المناظر **مستحيل**: تكرار PIH **مشروع** ومغطّى
     * باختبار قائم. (بند متابعة مسجَّل.)
     */
    const unsigned = await retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true, lines: true, relatedInvoice: { select: { no: true } } },
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
      // ارتدّت **قبل الشبكة** (`dispatch` بعد المعاملة) — فلم يُرسَل شيء، ولم
      // يُلتزم صفّ، ولا وجود لمستندٍ تُحفظ هويته. والشرط `?? ` هو ما يحمي
      // الحالة الأولى: صفٌّ ملتزَم يحمل UUID يُقرأ فيُعاد استعماله.
      const uuid = invoice.zatcaUuid ?? randomUUID();
      const previousHash = invoice.zatcaPreviousHash ?? (await latestChainHash(tx));
      const icv = invoice.zatcaIcv ?? (await nextIcv(tx));
      const invoiceType = invoiceTypeFor(invoice.customer.vatNumber);

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
       * **وموضعها قبل `tx.invoice.update` عمداً**: لو وقعت بعده لاعتمدنا على
       * ارتداد المعاملة لإلغاء `zatcaIcv` — وهو صحيحٌ اليوم **ويصير خاطئاً**
       * يوم يُنقل الترقيم خارجها. فالبوّابة **لا تستند إلى ترتيبٍ قد يتغيّر**.
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
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { zatcaUuid: uuid, zatcaPreviousHash: previousHash, zatcaIcv: icv, zatcaStatus: 'SUBMITTING' },
      });

      // كنسة التدوير (قرار المالك 2026-09-03): **المختوم = المرحَّل بالبناء** — المجاميع
      // المخزَّنة تُعاد من البنود بالدالة نفسها التي يستعملها الدفتر والمستند. فإن اختلفت
      // هللةً (فاتورةٌ قديمة بطريقةٍ سابقة، أو بنودٌ عُدّلت بلا إعادة حساب) **لا يُختم**
      // المستند ويُعلَن الفرق — فمستندٌ مختوم يخالف الدفتر أسوأ من مستندٍ لم يُختم.
      const recomputed = computeDocumentTotals(
        invoice.lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
      );
      const stored = { subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), total: Number(invoice.total) };
      for (const key of ['subtotal', 'taxTotal', 'total'] as const) {
        if (recomputed[key] !== stored[key]) {
          throw new ConflictException(
            `الفاتورة ${invoice.no}: ${key} المخزَّن ${stored[key]} لا يطابق المحسوب من بنودها ${recomputed[key]} — لا تُختم حتى تُصحَّح`,
          );
        }
      }

      const xml = buildUnsignedInvoiceXml({
        number: invoice.no,
        uuid,
        issuedAt: invoice.issueDate,
        invoiceType,
        // Credit/debit notes travel as the same Invoice structure with type
        // code 381/383 plus the original's reference and the reason — and
        // they occupy ordinary positions in the same ICV/PIH chain.
        documentType: invoice.docType === 'CREDIT_NOTE' ? 'credit' : invoice.docType === 'DEBIT_NOTE' ? 'debit' : 'invoice',
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
          street: invoice.customer.street,
          buildingNumber: invoice.customer.buildingNumber,
          district: invoice.customer.district,
          city: invoice.customer.city,
          postalCode: invoice.customer.postalCode,
        },
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
        })),
        currency: invoice.currency,
        subtotal: Number(invoice.subtotal),
        taxTotal: Number(invoice.taxTotal),
        total: Number(invoice.total),
        // The tax always goes to the authority in SAR, whatever the invoice is
        // denominated in.
        taxTotalSar: Number(invoice.baseTaxTotal ?? invoice.taxTotal),
      });

      return {
        xml,
        uuid,
        invoiceType,
        qr: {
          sellerName: company.legalName!,
          vatNumber: company.vatNumber!,
          issuedAt: invoice.issueDate,
          total: Number(invoice.total),
          vatAmount: Number(invoice.taxTotal),
        },
      };
      }),
    );

    return this.dispatch(companyId, invoiceId, credential, unsigned);
  }

  /**
   * Signs the document with the merchant's certificate, submits it, and
   * records the outcome. Any failure marks the invoice REJECTED with the
   * reason rather than leaving it stuck on SUBMITTING forever.
   */
  private async dispatch(
    companyId: string,
    invoiceId: string,
    credential: {
      environment: keyof typeof API_BASE;
      privateKeyEnc: string | null;
      productionCsidEnc: string | null;
      productionSecretEnc: string | null;
    },
    unsigned: {
      xml: string;
      uuid: string;
      invoiceType: 'standard' | 'simplified';
      qr: { sellerName: string; vatNumber: string; issuedAt: Date; total: number; vatAmount: number };
    },
  ) {
    try {
      // The certificate is the merchant's, held by the platform on their
      // behalf — signing happens here, in-process, and the key is decrypted
      // only for the duration of this call.
      const { signedXml, invoiceHash } = await signInvoice({
        unsignedXml: unsigned.xml,
        privateKeyPem: decryptSecret(credential.privateKeyEnc!),
        certificateBase64: decryptSecret(credential.productionCsidEnc!),
        qr: unsigned.qr,
      });

      // The hash is only knowable after the document is built, and it is what
      // the next invoice chains onto — so it is stored before the network call,
      // not after it succeeds.
      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.update({ where: { id: invoiceId }, data: { zatcaHash: invoiceHash } }),
      );

      // Standard (B2B) invoices are *cleared* before being given to the buyer;
      // simplified (B2C) ones are *reported* within 24h. Sending one down the
      // other's path is rejected.
      const path = unsigned.invoiceType === 'standard' ? '/invoices/clearance/single' : '/invoices/reporting/single';
      const token = decryptSecret(credential.productionCsidEnc!);
      const secret = decryptSecret(credential.productionSecretEnc!);

      const res = await fetch(`${apiBaseFor(credential.environment)}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          'Clearance-Status': unsigned.invoiceType === 'standard' ? '1' : '0',
          Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          invoiceHash,
          uuid: unsigned.uuid,
          // The authority takes the signed document base64-encoded.
          invoice: Buffer.from(signedXml, 'utf8').toString('base64'),
        }),
      });

      // كان يُقرأ `message` وحده — وهو **ليس من حقول استجابة هاتين النقطتين**.
      // فالمخزَّن عند أي رفض كان النصّ «HTTP 409» فقط، و`validationResults`
      // بكل رسائل الهيئة **تُهدَر**. ولا نقطة استعلام حالة لدى الهيئة (مؤكَّد
      // بفحص البوّابة حيّاً 2026-08-15)، فما لا يُخزَّن هنا **لا يُستعاد أبداً**.
      //
      // ⚠️ وهذا **تسجيلٌ لا تفسير**: القرار ما زال `res.ok` كما هو. تغييرُ ما
      // يُعدّ نجاحاً — و208 و409 خاصةً — قرارٌ مسجَّل بلا بدء، ولا يُتخذ هنا.
      // والنصّ يُقصّ عند ٥٠٠ حرف كسابقة `zatca-onboarding.service.ts:248`.
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const cleared = res.ok;
      const detail =
        typeof body.message === 'string' && body.message
          ? body.message
          : Object.keys(body).length > 0
            ? `HTTP ${res.status} — ${JSON.stringify(body)}`.slice(0, 500)
            : cleared
              ? null
              : `HTTP ${res.status}`;
      await this.recordResult(companyId, invoiceId, cleared, detail);
      return this.statusOf(companyId, invoiceId);
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`ZATCA submission failed for invoice ${invoiceId}: ${message}`);
      await this.recordResult(companyId, invoiceId, false, message);
      return this.statusOf(companyId, invoiceId);
    }
  }

  private recordResult(companyId: string, invoiceId: string, cleared: boolean, message: string | null) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({
        where: { id: invoiceId },
        data: {
          zatcaStatus: cleared ? 'CLEARED' : 'REJECTED',
          zatcaSubmittedAt: new Date(),
          zatcaMessage: message,
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
          zatcaSubmittedAt: true,
          zatcaMessage: true,
        },
      }),
    );
  }
}
