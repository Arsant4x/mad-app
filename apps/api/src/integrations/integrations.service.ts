import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pageArray } from '../common/pagination/paged.util';
import { decryptCredentials, encryptCredentials, maskCredentials } from './credentials.crypto';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — المزوّدُ والتسمية. */
const INTEGRATION_SEARCH_FIELDS = ['provider', 'label'] as const;
import { TERMINAL_ADAPTERS, TerminalChargeRequest, TerminalChargeResult } from './payment-terminal.adapter';

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
   * بوابة الدفع الفعّالة إن وُجدت — يسألها الكاشير قبل تمرير البطاقة.
   * Returns null when the company runs terminal-less (the pre-adapter
   * behavior stays the default; a connection OPTS IN to the gateway).
   */
  async chargeCardIfConfigured(tx: Prisma.TransactionClient, request: TerminalChargeRequest): Promise<TerminalChargeResult | null> {
    const conn = await tx.integrationConnection.findFirst({ where: { kind: 'PAYMENT_GATEWAY', enabled: true } });
    if (!conn) return null;

    /**
     * الحاجز الثاني — وهو الأهم عملياً: منعُ الإنشاء لا يحمي صفّاً **موجوداً
     * سلفاً**. اتصالٌ تجريبي أُنشئ قبل هذا الحاجز، أو رحل مع نسخة بيانات،
     * يبقى فعّالاً ويعتمد كل بطاقة. فالفحص يقع عند لحظة الشحن نفسها.
     *
     * والرمي لا الإعادة بـ`null`: الإعادة بـ`null` تعني «لا بوابة» فيمرّ
     * البيع كأنه نقدي — أي **يُختم مسدَّداً بلا مال** وهو العطل بعينه.
     * الرفض الصريح يوقف البيع ويُظهر السبب للكاشير.
     */
    if (isProduction() && TEST_ONLY_PROVIDERS.has(conn.provider)) {
      throw new BadRequestException(MSG.integration_mock_forbidden_in_production);
    }

    const adapter = TERMINAL_ADAPTERS[conn.provider];
    if (!adapter) return null;
    // The ONLY place credentials are decrypted — straight into the call.
    return adapter.charge(decryptCredentials(conn.credentials), request);
  }
}
