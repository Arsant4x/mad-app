import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';

/** What the reader sees instead of a route name. Keyed by the first path
 * segment, which is how the interceptor groups entries. */
const ENTITY_LABELS: Record<string, string> = {
  accounts: 'دليل الحسابات',
  journal: 'قيد يومية',
  fiscal: 'السنة المالية',
  'fiscal-years': 'السنة المالية',
  invoices: 'فاتورة مبيعات',
  customers: 'عميل',
  suppliers: 'مورد',
  purchases: 'فاتورة مشتريات',
  products: 'منتج',
  inventory: 'حركة مخزون',
  warehouses: 'مستودع',
  properties: 'عقار',
  units: 'وحدة',
  contracts: 'عقد إيجار',
  reservations: 'حجز',
  maintenance: 'طلب صيانة',
  warranties: 'ضمان',
  employees: 'موظف',
  leaves: 'إجازة',
  banks: 'حساب بنكي',
  transactions: 'حركة بنكية',
  obligations: 'التزام حكومي',
  reports: 'تقرير',
  scripts: 'قالب رسالة',
  branches: 'فرع',
  activities: 'نشاط',
  currencies: 'عملة',
  reminders: 'تذكيرات التحصيل',
  subscription: 'الاشتراك',
  'company-profile': 'بيانات المنشأة',
  'company-users': 'حساب موظف',
  zatca: 'الفوترة الإلكترونية',
  files: 'ملف',
};

const ACTION_VERBS: Record<string, string> = {
  add: 'أضاف',
  edit: 'عدّل',
  delete: 'حذف',
  record: 'سجّل',
  review: 'اعتمد',
  view: 'اطّلع على',
  audit: 'راجع سجل',
};

export interface AuditEntryInput {
  companyId: string;
  actorType: string;
  actorId: string;
  actorName: string;
  screen: string;
  action: string;
  entity: string;
  entityId: string | null;
  method: string;
  path: string;
  details: Record<string, unknown> | null;
  ip: string | null;
}

/**
 * Turns one request into a sentence a non-technical owner can read — SPEC 12.2
 * asks for a comprehensible change, not a JSON dump. A name from the payload is
 * appended when there is one, because "عدّل عميل" is far less useful than
 * "عدّل عميل «مؤسسة النخيل»".
 */
function buildSummary(input: AuditEntryInput): string {
  const verb = ACTION_VERBS[input.action] ?? 'نفّذ إجراءً على';
  const entity = ENTITY_LABELS[input.entity] ?? input.entity;

  const d = input.details ?? {};
  const named = ['name', 'fullName', 'orgName', 'title', 'subject', 'tenant', 'no', 'legalName'].map((k) => d[k]).find((v) => typeof v === 'string' && v.trim());

  // Sub-resources read better as their own thing: /contracts/:id/payments is a
  // payment on a lease, not an edit of the lease row.
  const segments = input.path.split('/').filter(Boolean);
  const tail = segments.length > 2 ? segments[segments.length - 1] : null;
  const tailLabel = tail && !/^[0-9a-f-]{8,}$/i.test(tail) ? SUB_RESOURCE_LABELS[tail] ?? null : null;

  const subject = tailLabel ? `${tailLabel} على ${entity}` : entity;
  return named ? `${verb} ${subject} «${named}»` : `${verb} ${subject}`;
}

/** Sub-routes worth naming in the sentence. */
const SUB_RESOURCE_LABELS: Record<string, string> = {
  payments: 'دفعة',
  cancel: 'إلغاء',
  renew: 'تجديد',
  claims: 'مطالبة',
  deposits: 'تأمين',
  settle: 'تسوية تأمين',
  handovers: 'نموذج تسليم',
  sign: 'توقيع نموذج',
  'key-money': 'تقبيل',
  attachments: 'مرفق',
  approve: 'موافقة على',
  reject: 'رفض',
  close: 'إقفال',
  reopen: 'إعادة فتح',
  toggle: 'تحديث حالة',
  submit: 'إرسال',
  renewal: 'تجديد',
  types: 'نوع',
  requests: 'طلب',
  movements: 'حركة',
};

@Injectable()
export class AuditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /** Writes one entry. Runs in the tenant's own context so RLS applies to the
   * trail exactly as it does to the data it describes.
   *
   * Retries transient failures: the write opens its own transaction, and on a
   * busy server the transaction pool can momentarily starve ("transaction not
   * found / max wait exceeded"). The interceptor deliberately never fails the
   * request over an audit write, which means a dropped write here would vanish
   * silently — so this layer absorbs the blip instead of losing the trail. */
  async record(input: AuditEntryInput): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.writeEntry(input);
        return;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
    throw lastError;
  }

  /** One short-lived batch transaction: set the RLS variable, insert the row.
   * Deliberately NOT runInTenantContext — that opens an *interactive*
   * transaction held across client round-trips, and audit writes are frequent
   * enough that under load they starve the transaction pool (which is exactly
   * when trail entries silently vanished). A sequential batch holds the
   * connection for microseconds and RLS still checks the same boundary. */
  private async writeEntry(input: AuditEntryInput): Promise<void> {
    const summary = buildSummary(input);
    await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT set_config('app.company_id', ${input.companyId}, true)`,
      this.prisma.auditLog.create({
        data: {
          companyId: input.companyId,
          actorType: input.actorType,
          actorId: input.actorId,
          actorName: input.actorName,
          screen: input.screen,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          summary,
          details: (input.details ?? Prisma.DbNull) as Prisma.InputJsonValue,
          ip: input.ip,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      }),
    ]);
  }

  /**
   * Reads the trail, newest first. Filterable by actor, screen and date so an
   * owner can answer "what did this employee do last week" — the question the
   * log exists for.
   */
  /**
   * ⚠️ **ومرشّح `action` أُضيف لأن قراراً اشترط أن يُوجَد فعلٌ بحثاً**
   * (`ق-١٤٣`، الاعتماد الذاتي): سجلٌّ يحمل الواقعة **ولا يُرشَّح عليها** يجعل
   * المدقّق يقلّب الصفحات — **والقدرة على التسجيل ليست قدرةً على الإيجاد**.
   */
  list(companyId: string, filters: { actorId?: string; screen?: string; action?: string; entityId?: string; from?: string; to?: string; limit?: number }) {
    const take = Math.min(Math.max(filters.limit ?? 200, 1), 500);
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.auditLog.findMany({
        where: {
          ...(filters.actorId ? { actorId: filters.actorId } : {}),
          ...(filters.screen ? { screen: filters.screen } : {}),
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.entityId ? { entityId: filters.entityId } : {}),
          ...(filters.from || filters.to
            ? {
                createdAt: {
                  ...(filters.from ? { gte: new Date(filters.from) } : {}),
                  // Inclusive of the whole end day, not midnight at its start.
                  ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    );
  }
}
