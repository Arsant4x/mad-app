import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ZatcaEnvironment, ZatcaOnboardingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { decryptSecret, encryptSecret, secretIsSet } from '../common/crypto/secret.util';
import { CERT_EXPIRY_WARN_DAYS, certificateNotAfter, daysUntil } from './certificate-expiry.util';
import { MSG } from '../common/i18n/messages';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { StartOnboardingDto, SubmitOtpDto } from './dto/onboarding.dto';
import { csrToBase64, generateCsr, ZatcaEnv } from './csr.util';
import { defaultUnitSerial, ensureDefaultUnit, SOLUTION_NAME } from './egs-unit.util';
import { GENESIS_PREVIOUS_HASH } from './hash-chain.util';
import { wallClockOf } from '../common/wall-clock.util';
import { requeueFailedWithinTx } from '../outbox/outbox.service';
import { INVOICE_ISSUED } from '../shared/events/domain-events';
import { storableText } from '../common/i18n/storable-text';
import { buildUnsignedInvoiceXml, UblDocumentType, type UblInvoiceLine } from './ubl/invoice-xml.util';
import { signInvoice } from './ubl/xades.util';
import { computeDocumentTotals } from '../common/money/totals';
import { STANDARD_VAT_RATE } from '../common/vat/standard-rate';

/**
 * Fatoora onboarding, run by the platform on the merchant's behalf.
 *
 * The merchant's entire share of this is pasting one OTP from the Fatoora
 * portal. Everything else — keypair, CSR, certificate exchange, storage — is
 * the platform's job, because that is what a SaaS is (CLAUDE.md §1).
 *
 * ⚠️ The authority's endpoints and the exact request/response shapes must be
 * confirmed against the current ZATCA API documentation before onboarding a
 * real merchant. Nothing here has been exercised against a live portal.
 */

/**
 * Redirects every outbound ZATCA call, for tests and local staging.
 *
 * Without it a test that exercises the dispatch path would send real traffic to
 * a government API. Deliberately read at call time, not module load, so a test
 * can set it after the app has booted. **Must never be set in production** —
 * it would silently point clearance at somewhere that is not the authority.
 */
/**
 * بيئات الاختبار لدى الهيئة — **ممنوعة في الإنتاج**.
 *
 * ⚠️ ليست محوّلاً وهمياً من صنعنا: `SANDBOX` و`SIMULATION` نقاطٌ حقيقية لدى
 * هيئة الزكاة والضريبة والجمارك، وقوالب الشهادات تمنع خلطها بالإنتاج. لكن
 * الفصل من جهة الهيئة **لا يغني عن حاجزنا**: تاجرٌ يختار بيئة اختبار على
 * خادم الإنتاج يرى فواتيره «مقبولة» وتُختم `CLEARED` عندنا — **وهي غير
 * معتمدة نظاماً**. العطل لا يظهر حتى تصل المطالبة الضريبية.
 *
 * وهو نفس صنف ثغرة المزوّد التجريبي (CLAUDE.md): مسارُ اختبارٍ يُنتج مخرَجاً
 * يشبه الحقيقي.
 */
const TEST_ENVIRONMENTS: readonly ZatcaEnvironment[] = [ZatcaEnvironment.SANDBOX, ZatcaEnvironment.SIMULATION];

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** الافتراضي يتبع البيئة: تجربةٌ آمنة خارج الإنتاج، وحقيقةٌ داخله. */
export function defaultEnvironment(): ZatcaEnvironment {
  return isProduction() ? ZatcaEnvironment.PRODUCTION : ZatcaEnvironment.SANDBOX;
}

/** يرفض بيئة اختبار على الإنتاج — صراحةً بنصٍّ يشرح الأثر، لا صمتاً. */
export function assertEnvironmentAllowed(environment: ZatcaEnvironment): void {
  if (isProduction() && TEST_ENVIRONMENTS.includes(environment)) {
    throw new BadRequestException(MSG.zatca_test_environment_forbidden_in_production);
  }
}

export function apiBaseFor(environment: ZatcaEnvironment): string {
  // الحاجز الثاني — عند كل نداءٍ للهيئة: منع التهيئة لا يحمي بيانات اعتماد
  // أُنشئت قبل هذا الحاجز أو رحلت مع نسخة بيانات، وهي التي تختم الفواتير.
  assertEnvironmentAllowed(environment);
  return process.env.ZATCA_API_BASE_OVERRIDE?.trim() || API_BASE[environment];
}

/**
 * ⏱ **مهلةٌ على كلّ اتصالٍ بالهيئة** (`ق-١١٩٨`/③ — مراجعةٌ خارجية).
 *
 * `fetch` بلا `signal` يبقى معلَّقاً ما بقي الاتصالُ مفتوحاً — و`undici` لا يقطعه قبل خمس
 * دقائقَ من صمتٍ على الترويسات. والإبلاغُ يجري من الطابور **منشأةً منشأةً في معاملةٍ واحدة**
 * (`OutboxService.dispatchForCompany`)، فاتصالٌ معلَّقٌ يوقف طابورَ المنشأة كلَّه بمدّته. صارت
 * الأربعةُ (الامتثال · عيّناتُه · الإنتاج · الإبلاغ) تحمل `AbortSignal.timeout` — والمهلةُ من
 * البيئة كي يقيسها الاختبارُ بلحظاتٍ لا بدقائق. **وانقضاؤها ليس جواباً** (`ق-٩٧١`): يُرمى
 * فيعود الطابورُ إليه بتراجعه.
 */
export const ZATCA_HTTP_TIMEOUT_MS_DEFAULT = 30_000;

export function zatcaHttpTimeoutMs(): number {
  const raw = Number(process.env.ZATCA_HTTP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : ZATCA_HTTP_TIMEOUT_MS_DEFAULT;
}

/** إشارةُ الإلغاء لنداءٍ واحد — تُصنع عند كلّ نداء، فالمهلةُ تبدأ من لحظته. */
export function zatcaFetchSignal(): AbortSignal {
  return AbortSignal.timeout(zatcaHttpTimeoutMs());
}

/** Per-environment API base. Kept beside the certificate template names in
 * csr.util so the two can't drift apart. */
export const API_BASE: Record<ZatcaEnvironment, string> = {
  SANDBOX: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  SIMULATION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  PRODUCTION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

/** Identifies this platform as the E-invoice Generation Solution. */
// `SOLUTION_NAME` وصيغةُ التسلسلي **مصدرهما `egs-unit.util.ts`** (`ق-١٦٩`): الجدول
// وطلبُ الشهادة يقرآن نصّاً واحداً، فلا يفترق تسلسليُّ الشهادة عن تسلسليّ الوحدة.

/**
 * The authority's conformance matrix: it will not issue a production CSID
 * until one sample of EVERY document kind the solution declared has passed
 * `/compliance/invoices` — standard and simplified, each as invoice, credit
 * note and debit note. Six documents. The CSR's default invoice-type flags
 * (`1100`, see StartOnboardingDto) declare both kinds, so all six are always
 * submitted. Order matters only in that the samples form their own PIH chain,
 * ICV 1→6 from the genesis hash, exactly like a real submission sequence.
 */
const COMPLIANCE_SAMPLES: ReadonlyArray<{ invoiceType: 'standard' | 'simplified'; documentType: UblDocumentType }> = [
  { invoiceType: 'standard', documentType: 'invoice' },
  { invoiceType: 'standard', documentType: 'credit' },
  { invoiceType: 'standard', documentType: 'debit' },
  { invoiceType: 'simplified', documentType: 'invoice' },
  { invoiceType: 'simplified', documentType: 'credit' },
  { invoiceType: 'simplified', documentType: 'debit' },
];

function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
  }
}

@Injectable()
export class ZatcaOnboardingService {
  private readonly logger = new Logger(ZatcaOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** `zatca_credentials` is FORCE-RLS, and rightly so — it holds signing keys.
   * Every read and write therefore goes through the tenant context; the raw
   * client would silently see an empty table. */
  private credential(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
  }

  /** Never exposes key material — only where the merchant is in the process. */
  async getStatus(companyId: string) {
    const [credential, company] = await Promise.all([
      this.credential(companyId),
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { legalName: true, vatNumber: true },
      }),
    ]);

    return {
      status: credential?.status ?? ZatcaOnboardingStatus.NOT_STARTED,
      environment: credential?.environment ?? ZatcaEnvironment.SANDBOX,
      hasKeys: secretIsSet(credential?.privateKeyEnc),
      hasComplianceCertificate: secretIsSet(credential?.complianceCsidEnc),
      hasProductionCertificate: secretIsSet(credential?.productionCsidEnc),
      onboardedAt: credential?.onboardedAt ?? null,
      // انتهاءُ الشهادة: التاريخُ وما بقي — والتاجرُ يرى «تنتهي بعد ١٢ يوماً» قبل أن تُرفض فاتورةٌ واحدة.
      certificateNotAfter: credential?.certificateNotAfter ?? null,
      certificateDaysLeft: credential?.certificateNotAfter ? daysUntil(credential.certificateNotAfter, new Date()) : null,
      certificateExpiringSoon: credential?.certificateNotAfter ? daysUntil(credential.certificateNotAfter, new Date()) <= CERT_EXPIRY_WARN_DAYS : false,
      lastError: credential?.lastError ?? null,
      // Surfaced so the screen can explain what's missing instead of failing
      // only once the merchant presses the button.
      profileComplete: Boolean(company.legalName?.trim() && company.vatNumber?.trim()),
    };
  }

  /**
   * Step 1 — generate this merchant's keypair and CSR.
   *
   * Refuses to regenerate once a production certificate exists: the key is
   * what that certificate was issued against, so replacing it would silently
   * invalidate the merchant's ability to clear invoices.
   */
  async start(companyId: string, actorType: string, dto: StartOnboardingDto) {
    assertIsCompanyOwner(actorType);

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { legalName: true, vatNumber: true, address: true },
    });
    if (!company.legalName?.trim() || !company.vatNumber?.trim()) {
      throw new BadRequestException(MSG.zatca_profile_incomplete);
    }

    const existing = await this.credential(companyId);
    if (existing && secretIsSet(existing.productionCsidEnc)) {
      throw new BadRequestException(MSG.zatca_already_onboarded);
    }

    // الافتراضي يتبع البيئة لا العكس: `SANDBOX` هو الصواب على جهاز مطوّر،
    // وهو **الفخّ نفسه** على الإنتاج — تاجرٌ لا يمرّر الحقل يُهيَّأ على بيئة
    // اختبار ويظنّ فواتيره معتمدة. وطلبُ شهادة إنتاج لا يخيف: لا تُصدَر إلا
    // برمز OTP حقيقي من بوابة فاتورة، ولا يملكه إلا تاجرٌ حقيقي.
    const environment = (dto.environment ?? defaultEnvironment()) as ZatcaEnvironment;
    assertEnvironmentAllowed(environment);
    const { privateKeyPem, csrPem } = await generateCsr(
      {
        organizationName: company.legalName.trim(),
        vatNumber: company.vatNumber.trim(),
        organizationUnit: dto.branchName?.trim() || company.legalName.trim(),
        commonName: `${SOLUTION_NAME}-${company.vatNumber.trim()}`,
        registeredAddress: dto.registeredAddress?.trim() || company.address?.trim() || 'Saudi Arabia',
        businessCategory: dto.businessCategory?.trim() || 'General',
        // `1-<solution>|2-<model>|3-<serial>` identifies this EGS unit — **the
        // default one**; a POS terminal (wave د) gets its own serial and CSR.
        serialNumber: defaultUnitSerial(companyId),
        invoiceType: dto.invoiceType?.trim() || '1100',
      },
      environment as ZatcaEnv,
    );

    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الوحدة الافتراضية أولاً — فالشهادة **لوحدة** لا لمنشأة (`ق-١٥٣`)، والصفّ
      // يُربط بها من لحظة ولادته. عديمة الأثر إن وُجدت (تعبئة الهجرة أو ربطٌ سابق).
      const unit = await ensureDefaultUnit(tx, companyId);
      await tx.zatcaCredential.upsert({
        where: { companyId },
        create: {
          companyId,
          egsUnitId: unit.id,
          privateKeyEnc: encryptSecret(privateKeyPem),
          csr: csrPem,
          environment,
          status: ZatcaOnboardingStatus.AWAITING_OTP,
        },
        update: {
          egsUnitId: unit.id,
          privateKeyEnc: encryptSecret(privateKeyPem),
          csr: csrPem,
          environment,
          status: ZatcaOnboardingStatus.AWAITING_OTP,
          lastError: null,
        },
      });
    });

    return this.getStatus(companyId);
  }

  /**
   * Step 2 — exchange the merchant's OTP for a compliance certificate.
   *
   * The OTP is short-lived and single-use, so it is passed straight through
   * and never stored.
   */
  async submitOtp(companyId: string, actorType: string, dto: SubmitOtpDto) {
    assertIsCompanyOwner(actorType);

    const credential = await this.credential(companyId);
    if (!credential?.csr) throw new BadRequestException(MSG.zatca_onboarding_not_started);

    try {
      const res = await fetch(`${apiBaseFor(credential.environment)}/compliance`, {
        method: 'POST',
        signal: zatcaFetchSignal(),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          OTP: dto.otp,
        },
        body: JSON.stringify({ csr: csrToBase64(credential.csr) }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        binarySecurityToken?: string;
        secret?: string;
        // The authority's identifier for this compliance request. Numeric in
        // the responses seen so far, but stored as text — it is an opaque
        // handle we echo back, never something we compute with.
        requestID?: string | number;
        errors?: unknown;
      };

      if (!res.ok || !body.binarySecurityToken || !body.secret) {
        return this.fail(companyId, `HTTP ${res.status} — ${JSON.stringify(body.errors ?? body)}`.slice(0, 500));
      }

      // Pulled out of `body` before the callback: TypeScript drops property
      // narrowing inside a closure, so `body.secret` would read as possibly
      // undefined there despite the guard above.
      const { binarySecurityToken, secret } = body;

      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.zatcaCredential.update({
          where: { companyId },
          data: {
            complianceCsidEnc: encryptSecret(binarySecurityToken),
            complianceSecretEnc: encryptSecret(secret),
            // معرّفٌ من الهيئة يُكتب نصّاً: النداءُ في موضع الكتابة نفسِه (`ق-٩٨٢`) — فحارسُ الأعمدة
            // المعلَنة يقرأ الشكلَ لا المتغيّر، واختصارُ الخاصّية كان يخفي عنه ما مرّ بالمصدر وما لم يمرّ.
            complianceRequestId: storableText(body.requestID),
            status: ZatcaOnboardingStatus.COMPLIANCE_ISSUED,
            lastError: null,
          },
        }),
      );

      // Holding the certificate is not yet compliance: the production CSID is
      // only granted after the six sample documents pass, so they are run
      // here, immediately, while the merchant is still watching the screen.
      const checkError = await this.runComplianceChecks(companyId, {
        environment: credential.environment,
        privateKeyEnc: credential.privateKeyEnc,
        complianceCsid: binarySecurityToken,
        complianceSecret: secret,
      });
      if (checkError) return this.fail(companyId, checkError);

      return this.getStatus(companyId);
    } catch (e) {
      this.logger.warn(`ZATCA compliance request failed for company ${companyId}: ${(e as Error).message}`);
      return this.fail(companyId, (e as Error).message);
    }
  }

  /**
   * Builds, signs and submits the six conformance samples with the freshly
   * issued compliance CSID. Returns `null` when every sample passes, or a
   * description of the first failure. Sequential on purpose: the samples form
   * a PIH chain, so document N+1 embeds N's hash.
   */
  private async runComplianceChecks(
    companyId: string,
    input: { environment: ZatcaEnvironment; privateKeyEnc: string | null; complianceCsid: string; complianceSecret: string },
  ): Promise<string | null> {
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

    const seller = {
      name: company.legalName!,
      vatNumber: company.vatNumber,
      crNumber: company.crNumber,
      street: company.street ?? company.address,
      buildingNumber: company.buildingNumber,
      district: company.district,
      city: company.city,
      postalCode: company.postalCode,
    };
    const privateKeyPem = decryptSecret(input.privateKeyEnc!);
    // عيّناتُ الامتثال لا جهازَ لها، فتُصدَر UTC بلاحقة `Z` — صيغةٌ تُجيزها الهيئة
    // بلا زعمِ محليٍّ لا نعرفه (`ق-١٨٥`).
    const issued = wallClockOf(new Date(), 0);

    let pih = GENESIS_PREVIOUS_HASH;
    for (let i = 0; i < COMPLIANCE_SAMPLES.length; i++) {
      const sample = COMPLIANCE_SAMPLES[i];
      const number = `CMP-${i + 1}`;
      // A credit/debit sample references its own type's invoice sample —
      // the authority validates the reference's presence, not its target.
      const referencedInvoice = sample.invoiceType === 'standard' ? 'CMP-1' : 'CMP-4';
      const uuid = randomUUID();

      // ⑧ عيّنةُ الفاتورة المبسَّطة تحمل سطراً بنسبة الصفر بسببه (`VATEX-SA-35` — الأدوية والمعدات
      // الطبية): فيُثبَت مسارُ الفئة والسبب **أمام الهيئة** لا أمامنا (الموجز §٤-ج). والمجاميعُ
      // من الدالّة الواحدة لا أرقاماً مكتوبة. ⚠️ لم يُجرَّب على بيئة الاختبار بعد — أوّلُ تشغيلٍ
      // حيٍّ للامتثال هو الإثبات، ويُردّ السطرُ بسطرٍ إن رفضته الهيئة.
      const sampleLines: UblInvoiceLine[] = [
        { description: 'عينة فحص الامتثال', quantity: 1, unitPrice: 100, taxRate: STANDARD_VAT_RATE, taxCategory: 'S' },
        // ④B1/⑤A3: عيّنةُ الفاتورة الكاملة تحمل سطراً بخصمٍ (BT-136 · AllowanceCharge على السطر) — يُثبَت أمام الهيئة.
        ...(sample.invoiceType === 'standard' && sample.documentType === 'invoice'
          ? [{ description: 'عينة خصم على السطر', quantity: 2, unitPrice: 30, discount: 10, taxRate: STANDARD_VAT_RATE, taxCategory: 'S' as const }]
          : []),
        ...(sample.invoiceType === 'simplified' && sample.documentType === 'invoice'
          ? [{ description: 'عينة نسبة الصفر — دواء', quantity: 1, unitPrice: 50, taxRate: 0, taxCategory: 'Z' as const, taxExemptionReasonCode: 'VATEX-SA-35' }]
          : []),
      ];
      const sampleTotals = computeDocumentTotals(sampleLines);

      const unsigned = buildUnsignedInvoiceXml({
        number,
        uuid,
        issued,
        invoiceType: sample.invoiceType,
        documentType: sample.documentType,
        billingReference: sample.documentType === 'invoice' ? undefined : { invoiceNumber: referencedInvoice },
        adjustmentReason: sample.documentType === 'invoice' ? undefined : 'عينة فحص الامتثال — تصحيح',
        icv: i + 1,
        pih,
        seller,
        // A standard sample needs a VAT-registered buyer; a simplified one a
        // plain cash customer. Both synthetic — nothing is billed.
        buyer:
          sample.invoiceType === 'standard'
            ? { name: 'شركة عينة الامتثال', vatNumber: '399999999900003', street: 'طريق العينة', buildingNumber: '1111', district: 'حي العينة', city: 'الرياض', postalCode: '12345' }
            : { name: 'عميل نقدي', vatNumber: null },
        lines: sampleLines,
        currency: 'SAR',
        subtotal: sampleTotals.subtotal,
        taxTotal: sampleTotals.taxTotal,
        total: sampleTotals.total,
        taxTotalSar: sampleTotals.taxTotal,
      });

      const { signedXml, invoiceHash } = await signInvoice({
        unsignedXml: unsigned,
        privateKeyPem,
        certificateBase64: input.complianceCsid,
        qr: { sellerName: seller.name, vatNumber: seller.vatNumber!, issued, total: sampleTotals.total, vatAmount: sampleTotals.taxTotal },
      });

      const res = await fetch(`${apiBaseFor(input.environment)}/compliance/invoices`, {
        method: 'POST',
        signal: zatcaFetchSignal(),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          Authorization: `Basic ${Buffer.from(`${input.complianceCsid}:${input.complianceSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({ invoiceHash, uuid, invoice: Buffer.from(signedXml, 'utf8').toString('base64') }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: unknown };
        return `compliance ${sample.invoiceType}/${sample.documentType}: HTTP ${res.status} — ${JSON.stringify(body.errors ?? body)}`.slice(0, 500);
      }

      pih = invoiceHash;
    }
    return null;
  }

  /**
   * Step 3 — swap the compliance certificate for a production one, which is
   * what actually clears real invoices.
   *
   * The authority only issues this after the merchant's solution has passed
   * the conformance checks (run automatically at the end of `submitOtp`), so
   * a rejection here usually means those haven't completed rather than that
   * anything is misconfigured.
   *
   * ⚠️ TODO (deferred) — production CSID **renewal**: `PATCH
   * /production/csids`. A production certificate expires; the renewal call
   * authenticates with the *current* production CSID and returns a re-issued
   * one against the same key. **Trigger condition:** the certificate entering
   * its expiry window (parse `notAfter` from the stored certificate; renew
   * ~30 days before). Needs a scheduled sweep over `zatca_credentials` plus
   * the PATCH + certificate swap — none of which exists yet. Until built, an
   * expired certificate surfaces as clearance rejections and the recovery is
   * manual re-onboarding with a fresh OTP.
   */
  async requestProductionCertificate(companyId: string, actorType: string) {
    assertIsCompanyOwner(actorType);

    const credential = await this.credential(companyId);
    // Both halves are required: the certificate authenticates the call, the
    // request id tells the authority WHICH conformance run to check. A
    // credential from before that id was captured must redo the OTP step
    // rather than send a request the authority can only reject.
    if (!credential || !secretIsSet(credential.complianceCsidEnc) || !credential.complianceRequestId) {
      throw new BadRequestException(MSG.zatca_compliance_required);
    }

    const token = decryptSecret(credential.complianceCsidEnc!);
    const secret = decryptSecret(credential.complianceSecretEnc!);

    try {
      const res = await fetch(`${apiBaseFor(credential.environment)}/production/csids`, {
        method: 'POST',
        signal: zatcaFetchSignal(),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
        },
        // The authority's own request id, captured at the OTP step — NOT our
        // row id. Matching this to the passed conformance run is precisely
        // what gates the production certificate; sending a local uuid means
        // it is never issued.
        body: JSON.stringify({ compliance_request_id: credential.complianceRequestId }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        binarySecurityToken?: string;
        secret?: string;
        errors?: unknown;
      };

      if (!res.ok || !body.binarySecurityToken || !body.secret) {
        return this.fail(companyId, `HTTP ${res.status} — ${JSON.stringify(body.errors ?? body)}`.slice(0, 500));
      }

      // Destructured for the same narrowing reason as in `submitOtp`.
      const { binarySecurityToken, secret: productionSecret } = body;

      const requeued = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.zatcaCredential.update({
          where: { companyId },
          data: {
            productionCsidEnc: encryptSecret(binarySecurityToken),
            productionSecretEnc: encryptSecret(productionSecret),
            // **نهايةُ الصلاحية تُقرأ من الشهادة لحظةَ حفظها** (`ق-١٢٧٩` · ز/⑤A1) — لا تُحسب بسنةٍ
            // تُضاف، ولا تُترك حتى ترفض الهيئةُ فواتيرَ يومٍ كامل. وشهادةٌ لا تُقرأ تُترك `null`
            // **ولا تُسقط الإصدار** — والغيابُ يظهر في الحالة بدل أن يُفترض «سليمة».
            certificateNotAfter: certificateNotAfter(binarySecurityToken),
            expiryNotifiedAt: null,
            status: ZatcaOnboardingStatus.PRODUCTION_ISSUED,
            onboardedAt: new Date(),
            lastError: null,
          },
        });
        // ⭐ الربطُ يُعيد ما فشل قبله (`ق-١٨٢`/٣): فواتيرُ منشأةٍ كانت تُصدر بلا
        // شهادة سقطت في الطابور ستّ مراتٍ ثم `FAILED` — تعود كلُّها إلى الإرسال
        // في المعاملة نفسها التي كتبت الشهادة، **فلا فاتورة تُنسى**.
        return requeueFailedWithinTx(tx, INVOICE_ISSUED);
      });
      if (requeued > 0) this.logger.log(`ZATCA production CSID issued for company ${companyId}: أُعيد ${requeued} حدث إصدارٍ فاشل إلى الطابور`);

      return this.getStatus(companyId);
    } catch (e) {
      this.logger.warn(`ZATCA production CSID request failed for company ${companyId}: ${(e as Error).message}`);
      return this.fail(companyId, (e as Error).message);
    }
  }

  /** Records why onboarding stopped so the merchant sees something actionable
   * rather than a generic retry prompt. النصُّ من جواب الهيئة أو من `fetch` — فيمرّ بـ`storableText`
   * (`ق-٩٨٢`): بايتٌ صفريٌّ فيه كان يُسقط الكتابةَ ويُبقي الحالةَ بلا سبب. */
  private async fail(companyId: string, message: string) {
    await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.update({
        where: { companyId },
        data: { status: ZatcaOnboardingStatus.FAILED, lastError: storableText(message) },
      }),
    );
    return this.getStatus(companyId);
  }
}
