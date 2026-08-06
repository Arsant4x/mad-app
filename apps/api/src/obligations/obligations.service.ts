import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { VatDeclarationQueryDto } from './dto/vat-declaration-query.dto';
import { MSG } from '../common/i18n/messages';

/** The standard 9-item checklist from the mockup, verbatim — no due date, no
 * amount, no penalty, no recurrence. Auto-seeded per company on first read
 * (see `list`) rather than at signup, so it works regardless of how the
 * company was created. */
export const STANDARD_OBLIGATIONS: { body: string; title: string }[] = [
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'تقديم إقرار ضريبة القيمة المضافة (شهري أو ربع سنوي)' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'تقديم الإقرار الزكوي / ضريبة الدخل السنوي' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'الالتزام بمتطلبات الفوترة الإلكترونية: QR، رقم تسلسلي، حفظ النسخ' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'سداد الضريبة المستحقة قبل نهاية مهلة الإقرار' },
  { body: 'وزارة التجارة', title: 'تجديد السجل التجاري قبل انتهائه' },
  { body: 'وزارة التجارة', title: 'تحديث العنوان الوطني وبيانات المنشأة عند أي تغيير' },
  { body: 'وزارة التجارة', title: 'إيداع القوائم المالية للشركات الملزمة' },
  { body: 'التأمينات الاجتماعية', title: 'رفع أجور الموظفين وسداد الاشتراكات الشهرية قبل نهاية المهلة' },
  { body: 'التأمينات الاجتماعية', title: 'تسجيل الموظفين الجدد وإنهاء اشتراك المنتهية خدماتهم بالمهلة النظامية' },
];

@Injectable()
export class ObligationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.governmentObligation.findMany({ orderBy: { order: 'asc' } });
      if (existing.length > 0) return existing;

      await tx.governmentObligation.createMany({
        // companyId omitted on purpose — injected per-row at runtime by the
        // tenant scope extension (see accounts.service.ts for why this cast
        // exists).
        data: STANDARD_OBLIGATIONS.map((o, i) => ({ body: o.body, title: o.title, order: i })) as unknown as Prisma.GovernmentObligationCreateManyInput[],
      });
      return tx.governmentObligation.findMany({ orderBy: { order: 'asc' } });
    });
  }

  toggle(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.governmentObligation.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.obligation_not_found);
      return tx.governmentObligation.update({ where: { id }, data: { done: !existing.done } });
    });
  }

  vatDeclaration(companyId: string, query: VatDeclarationQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const quarterMonths: Record<number, [number, number]> = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };
      const [startMonth, endMonth] = quarterMonths[query.quarter];
      const from = new Date(Date.UTC(query.year, startMonth - 1, 1));
      const to = new Date(Date.UTC(query.year, endMonth, 0));

      const [invoices, purchases] = await Promise.all([
        tx.invoice.findMany({ where: { issueDate: { gte: from, lte: to } }, select: { subtotal: true, taxTotal: true } }),
        tx.purchase.findMany({ where: { date: { gte: from, lte: to } }, select: { subtotal: true, taxAmount: true, exempt: true, excludeFromVat: true } }),
      ]);

      const salesStandard = invoices.reduce((s, v) => s + Number(v.subtotal), 0);
      const salesStandardVat = invoices.reduce((s, v) => s + Number(v.taxTotal), 0);

      // A purchase with no valid tax invoice is dropped from the declaration
      // entirely (matching the mockup): its input VAT can't be reclaimed, so it
      // must not reduce the net VAT owed. Reported separately for transparency.
      const declarablePurchases = purchases.filter((p) => !p.excludeFromVat);
      const excludedPurchases = purchases.filter((p) => p.excludeFromVat);

      const taxablePurchases = declarablePurchases.filter((p) => !p.exempt);
      const exemptPurchases = declarablePurchases.filter((p) => p.exempt);
      const purchasesStandard = taxablePurchases.reduce((s, p) => s + Number(p.subtotal), 0);
      const purchasesStandardVat = taxablePurchases.reduce((s, p) => s + Number(p.taxAmount), 0);
      const purchasesExempt = exemptPurchases.reduce((s, p) => s + Number(p.subtotal), 0);
      const purchasesExcluded = excludedPurchases.reduce((s, p) => s + Number(p.subtotal), 0);

      return {
        year: query.year,
        quarter: query.quarter,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        salesStandard,
        salesStandardVat,
        purchasesStandard,
        purchasesStandardVat,
        purchasesExempt,
        purchasesExcluded,
        excludedCount: excludedPurchases.length,
        totalPurchases: purchasesStandard + purchasesExempt,
        netVat: salesStandardVat - purchasesStandardVat,
        invoiceCount: invoices.length,
        purchaseCount: purchases.length,
      };
    });
  }
}
