import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pageArray } from '../common/pagination/paged.util';
import { decryptCredentials, encryptCredentials, maskCredentials } from './credentials.crypto';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — المزوّدُ والتسمية. */
const INTEGRATION_SEARCH_FIELDS = ['provider', 'label'] as const;
import { PaymentTerminalAdapter, TERMINAL_ADAPTERS, TerminalChargeRequest, TerminalStatusResult } from './payment-terminal.adapter';

const KNOWN_PROVIDERS: Record<IntegrationKind, string[]> = {
  PAYMENT_GATEWAY: ['MOCK'],
  BNPL: ['MOCK'],
  ECOMMERCE: ['MOCK'],
};

/**
 * المزوّدون التجريبيون — **ممنوعون في الإنتاج**.
 *
 * ⚠️ **ثغرة مالية لا تفصيلة تجميل:** `MockTerminalAdapter` يعيد
 * `approved: true` لكل مبلغ لا تنتهي هللاته بـ13، بلا أي اتصال بمزوّد.
 * فتاجرٌ على الإنتاج يربط «مزوّد تجريبي» يحصل على جهاز بطاقةٍ **يعتمد كل
 * عملية بلا تحصيل مال**، وتُختم فواتيره مسدَّدة. لا خسارة بيانات — خسارة
 * نقد حقيقي.
 *
 * والقائمة قاعدةٌ لا استثناء: أي محوّل تجريبي يُضاف لاحقاً (تقسيط · متجر ·
 * غيرها) **يُدرَج هنا**، وإلا تكرّرت الثغرة بنفس الشكل.
 */
const TEST_ONLY_PROVIDERS = new Set(['MOCK']);

/** بيئة الإنتاج تُقرأ عند كل فحص لا مرةً عند التحميل — فالاختبار يستطيع
 *  محاكاتها، ولا تتجمّد القيمة على ما كانت عليه لحظة الإقلاع. */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** الشكل الآمن للعرض: المفاتيح مقنَّعة، والمشفَّر لا يغادر الخادم. */
function toSafe(row: { id: string; kind: IntegrationKind; provider: string; label: string | null; enabled: boolean; credentials: string; createdAt: Date }) {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    label: row.label,
    enabled: row.enabled,
    credentials: maskCredentials(decryptCredentials(row.credentials)),
    createdAt: row.createdAt,
  };
}

/**
 * ربط المنشأة بمزوّديها (مستند: adapters قابلة للاستبدال + مفاتيح مشفّرة).
 *
 * المفاتيح تُشفَّر لحظة الوصول ولا تُفكّ إلا داخل استدعاء المزوّد؛ كل
 * القراءات تُرجع قناع «•••• آخر 4». اتصال فعّال واحد لكل نوع — يحسمها فهرس
 * جزئي في القاعدة وفحص هنا (قاعدة الطبقتين 6.6).
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.integrationConnection.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); // ترتيبٌ تامّ للقطع في الذاكرة (`ق-٣٥٦`)
      // الصفوفُ تُنظَّف من أسرارها قبل أن تخرج (`toSafe`) — فالقطعُ في الذاكرة بعد التنظيف.
      return pageArray(query, rows.map(toSafe), INTEGRATION_SEARCH_FIELDS);
    });
  }

  create(companyId: string, dto: { kind: IntegrationKind; provider: string; label?: string; credentials: Record<string, string> }) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      if (!KNOWN_PROVIDERS[dto.kind]?.includes(dto.provider)) throw new BadRequestException(MSG.integration_unknown_provider);
      // الحاجز الأول: منع دخول المزوّد التجريبي أصلاً. رفضٌ صريح بنصّ عربي
      // يشرح السبب — لا تجاهل صامت يترك التاجر يظن أن الربط تمّ.
      if (isProduction() && TEST_ONLY_PROVIDERS.has(dto.provider)) {
        throw new BadRequestException(MSG.integration_mock_forbidden_in_production);
      }
      if (!Object.keys(dto.credentials ?? {}).length) throw new BadRequestException(MSG.integration_credentials_required);

      const activeSame = await tx.integrationConnection.findFirst({ where: { kind: dto.kind, enabled: true } });
      if (activeSame) throw new ConflictException(MSG.integration_kind_already_active);

      const created = await tx.integrationConnection.create({
        data: {
          kind: dto.kind,
          provider: dto.provider,
          label: dto.label,
          credentials: encryptCredentials(dto.credentials),
        } as unknown as Prisma.IntegrationConnectionUncheckedCreateInput,
      });
      return toSafe(created);
    });
  }

  setEnabled(companyId: string, id: string, enabled: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.integrationConnection.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.integration_not_found);
      if (enabled) {
        const activeSame = await tx.integrationConnection.findFirst({ where: { kind: existing.kind, enabled: true, id: { not: id } } });
        if (activeSame) throw new ConflictException(MSG.integration_kind_already_active);
      }
      const updated = await tx.integrationConnection.update({ where: { id }, data: { enabled } });
      return toSafe(updated);
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.integrationConnection.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.integration_not_found);
      await tx.integrationConnection.delete({ where: { id } });
    });
  }

  /**
   * **بوابةُ الدفع الفعّالة إن وُجدت** — يسألها الكاشير قبل أن يقبل جزءَ بطاقة (`ق-١٤٠١`).
   * `null` حين تعمل المنشأةُ بلا ربط (السلوكُ السابق يبقى الافتراض؛ والاتصالُ **يختار** البوابة).
   *
   * الحاجز الثاني — وهو الأهم عملياً: منعُ الإنشاء لا يحمي صفّاً **موجوداً سلفاً**. اتصالٌ تجريبي أُنشئ قبل
   * هذا الحاجز، أو رحل مع نسخة بيانات، يبقى فعّالاً ويعتمد كل بطاقة — فالفحصُ يقع عند كلِّ استعمال.
   *
   * **والرمي لا الإعادة بـ`null`**: الإعادةُ بـ`null` تعني «لا بوابة» فيمرّ البيعُ كأنه بلا ربط — أي **يُختم مسدَّداً
   * بلا مال**، وهو العطلُ بعينه. وكذلك اتصالٌ فعّالٌ بلا محوّلٍ مسجَّل: يُرفض ولا يُعامَل كغيابه.
   */
  async activeGateway(tx: Prisma.TransactionClient): Promise<{ id: string; provider: string; adapter: PaymentTerminalAdapter } | null> {
    const conn = await tx.integrationConnection.findFirst({ where: { kind: 'PAYMENT_GATEWAY', enabled: true }, select: { id: true, provider: true } });
    if (!conn) return null;
    return { id: conn.id, provider: conn.provider, adapter: adapterFor(conn.provider) };
  }

  /**
   * ما تقرؤه شاشةُ الكاشير: أفعّالٌ الربطُ، وبأيّ مزوّدٍ ومهلة — بلا مفاتيح (`ق-١٤٠١`).
   * **على مستوى المنشأة بحقّها**: الربطُ للمنشأة لا لفرع.
   */
  gatewayMode(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const gateway = await this.activeGateway(tx);
      return gateway ? { active: true as const, provider: gateway.provider, deadlineMs: gateway.adapter.chargeDeadlineMs } : { active: false as const };
    });
  }

  /**
   * ⭐ **الشحنُ خارج كلِّ معاملة، بمهلة المحوّل** (`ق-١٤٠١` · `ق-١٣٩٨`).
   *
   * الاتصالُ يُقرأ في معاملةٍ قصيرة تُلتزم **قبل** نداء المزوّد — فلا تبقى معاملةُ قاعدةٍ مفتوحةً على طرفٍ ثالث (القياس ②
   * في الموجز: جهازٌ يستغرق ستّ ثوانٍ داخل معاملة الخمس ثوانٍ ⟸ المالُ قُبل والبيعُ سقط). والمفاتيحُ تُفكّ هنا وحدَها،
   * مباشرةً إلى النداء. **وما لم يُجب في المهلة أو انقطع ⟸ `UNKNOWN` — لا رفضٌ ولا قبول**: المالُ قد يكون قُبض.
   */
  async chargeWithDeadline(companyId: string, provider: string, request: TerminalChargeRequest): Promise<ChargeOutcome> {
    // ما يسقط قبل النداء لم يُرسل شيئاً — فليس معلّقاً: يعود مسمّىً ليُعاد المحاولةُ إلى ما قبل الإرسال.
    let conn: { provider: string; credentials: string };
    let adapter: PaymentTerminalAdapter;
    try {
      conn = await this.connectionFor(companyId, provider);
      adapter = adapterFor(conn.provider);
    } catch (e) {
      return { kind: 'NOT_SENT', error: e };
    }
    const deadlineMs = adapter.chargeDeadlineMs;
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<'EXPIRED'>((resolve) => {
      timer = setTimeout(() => resolve('EXPIRED'), deadlineMs);
    });
    try {
      const result = await Promise.race([adapter.charge(decryptCredentials(conn.credentials), request), expired]);
      // نصٌّ يُخزَّن لا مفتاحٌ يعبر المرشِّح: `formatMessage` يحمل فاصلاً داخلياً (بايت NUL) لا يقبله عمودٌ نصّي.
      if (result === 'EXPIRED') return { kind: 'UNKNOWN', detail: resolveMessage(formatMessage(MSG.pos_attempt_deadline_passed, { seconds: String(Math.round(deadlineMs / 1000)) }), DEFAULT_LANGUAGE) };
      if (!result.approved) return { kind: 'DECLINED', reason: result.declineReason ?? null };
      // مرجعُ المزوّد، وإلا فمرجعُنا الذي يُستعلم به عنده (معرّفُ المحاولة) — فصفُّ «قبله المزوّد» لا يبقى بلا مرجع.
      return { kind: 'APPROVED', providerRef: result.providerRef ?? request.reference, approvalCode: result.approvalCode ?? null };
    } catch (e) {
      return { kind: 'UNKNOWN', detail: textOf(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * **جوابُ المزوّد عن مرجع** (`ق-١٣٩٩`: «جوابُ المزوّد أوّلاً») — خارج كلِّ معاملة كالشحن.
   * تعذُّرُ الوصول ليس جواباً: يعود `PENDING` فيبقى المعلّقُ معلّقاً — لا رفضَ يُخمَّن من صمت.
   */
  async queryStatus(companyId: string, provider: string, reference: string): Promise<TerminalStatusResult & { unreachable?: string }> {
    try {
      const conn = await this.connectionFor(companyId, provider);
      return await adapterFor(conn.provider).status(decryptCredentials(conn.credentials), reference);
    } catch (e) {
      // ربطٌ تغيّر أو مزوّدٌ لا يُبلغ: لم يُجب أحد — فلا رفضَ ولا قبول، والحسمُ اليدويّ بدليلٍ متاح.
      return { state: 'PENDING', unreachable: textOf(e) };
    }
  }

  /** مهلةُ محوّل مزوّدٍ بعينه — يقرؤها الحاسمُ ليعرف متى يصير «لا أثر» جواباً. */
  deadlineOf(provider: string): number {
    return adapterFor(provider).chargeDeadlineMs;
  }

  /** الاتصالُ الفعّالُ لمزوّد المحاولة — في معاملةٍ قصيرة تُلتزم قبل أيّ نداء. تغيُّرُه بعد إنشاء المحاولة يُرفض مسمّىً. */
  private async connectionFor(companyId: string, provider: string) {
    const conn = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.integrationConnection.findFirst({ where: { kind: 'PAYMENT_GATEWAY', enabled: true }, select: { provider: true, credentials: true } }),
    );
    if (!conn || conn.provider !== provider) throw new ConflictException(formatMessage(MSG.pos_attempt_gateway_changed, { provider }));
    return conn;
  }
}

/** نتيجةُ الشحن كما تقرؤها النواة — والمعلّقُ حالٌ مسمّاة لا خطأ. */
export type ChargeOutcome =
  | { kind: 'APPROVED'; providerRef: string; approvalCode: string | null }
  | { kind: 'DECLINED'; reason: string | null }
  | { kind: 'UNKNOWN'; detail: string }
  /** سقط قبل نداء المزوّد (ربطٌ تغيّر · محوّلٌ ممنوع) — لم يُرسل شيءٌ فلا مالَ في الطريق. */
  | { kind: 'NOT_SENT'; error: unknown };

/** نصُّ خطأٍ يُخزَّن ويُعرض — مفتاحُ الرسالة يُحلّ إلى نصّه (لا فاصلَ داخليّاً يبلغ عموداً نصّياً). */
function textOf(e: unknown): string {
  return resolveMessage(e instanceof Error ? e.message : String(e), DEFAULT_LANGUAGE);
}

/**
 * المحوّلُ لمزوّدٍ — **بحاجز الإنتاج عند كلِّ استعمال** وبرفضٍ صريحٍ لاتصالٍ بلا محوّلٍ مسجَّل (لا `null`: الغيابُ
 * يمرّ البيعَ بلا مال).
 */
function adapterFor(provider: string): PaymentTerminalAdapter {
  if (isProduction() && TEST_ONLY_PROVIDERS.has(provider)) {
    throw new BadRequestException(MSG.integration_mock_forbidden_in_production);
  }
  const adapter = TERMINAL_ADAPTERS[provider];
  if (!adapter) throw new ConflictException(formatMessage(MSG.integration_adapter_missing, { provider }));
  return adapter;
}
