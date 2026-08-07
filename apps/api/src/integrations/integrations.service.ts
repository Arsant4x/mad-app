import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { decryptCredentials, encryptCredentials, maskCredentials } from './credentials.crypto';
import { TERMINAL_ADAPTERS, TerminalChargeRequest, TerminalChargeResult } from './payment-terminal.adapter';

const KNOWN_PROVIDERS: Record<IntegrationKind, string[]> = {
  PAYMENT_GATEWAY: ['MOCK'],
  BNPL: ['MOCK'],
  ECOMMERCE: ['MOCK'],
};

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

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.integrationConnection.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toSafe);
    });
  }

  create(companyId: string, dto: { kind: IntegrationKind; provider: string; label?: string; credentials: Record<string, string> }) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      if (!KNOWN_PROVIDERS[dto.kind]?.includes(dto.provider)) throw new BadRequestException(MSG.integration_unknown_provider);
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
    const adapter = TERMINAL_ADAPTERS[conn.provider];
    if (!adapter) return null;
    // The ONLY place credentials are decrypted — straight into the call.
    return adapter.charge(decryptCredentials(conn.credentials), request);
  }
}
