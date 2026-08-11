import { describe, expect, it } from 'vitest';
import type { InvoiceStatus } from '../../api/invoices';
import { badgeOf } from '../../lib/statusBadge';
import { STATUS_META, ZATCA_STATUS_META } from './statusMeta';

/**
 * الاختبار ٣ — كل حالة يعرفها النوع لها وصفٌ يُعرض.
 *
 * يحرس العطل الثاني الذي وصل الإنتاج: `PARTIAL` أُضيفت إلى `schema.prisma`
 * وإلى `recomputeInvoiceStatus` في 4.5 **ونُسيت هنا**، فانهارت `/invoices`
 * ونافذة تفاصيل العميل عند أول فاتورة مسدَّدة جزئياً — وهي حالة لم تنتجها
 * بيانات قديمة قط، فبقي العطب كامناً ثلاثة أيام حتى بذرةِ عرضٍ على خادم منشور.
 *
 * ⚠️ **حدّ هذا الملف:** يقارن الخريطة بالنوع المكتوب في `api/invoices.ts` —
 * لا بـ`schema.prisma`. تطابقُ النوع مع القاعدة يحرسه اختبار الخادم
 * `invoice-outstanding.e2e-spec.ts`، والعلاج الجذري (توليد الأنواع من Prisma)
 * مرشَّح ② مسجَّل. فهذان الملفان يكمّلان بعضهما ولا يغني أحدهما عن الآخر.
 */
const ALL_STATUSES: InvoiceStatus[] = ['DUE', 'PARTIAL', 'PAID', 'OVERDUE'];

describe('الاختبار ٣ — خريطة حالات الفاتورة شاملة', () => {
  it.each(ALL_STATUSES)('الحالة %s لها وصف عربي وصنف شارة', (status) => {
    const meta = STATUS_META[status];
    expect(meta).toBeDefined();
    expect(meta.label.trim().length).toBeGreaterThan(0);
    // badgeClass قد تكون فارغة عمداً (شارة محايدة) — المهم أنها معرَّفة.
    expect(typeof meta.badgeClass).toBe('string');
  });

  it('لا مفتاح زائد في الخريطة لا يعرفه النوع', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('PARTIAL خارج STATUS_ORDER عمداً — مشتقّة لا يضبطها مستخدم', async () => {
    const { STATUS_ORDER } = await import('./statusMeta');
    expect(STATUS_ORDER).not.toContain('PARTIAL');
    // ومع ذلك تُعرض: غيابها من مُنتقي التغيير لا يعني غيابها من الشارات.
    expect(STATUS_META.PARTIAL.label).toBe('مسدَّدة جزئياً');
  });

  it('كل حالة ZATCA لها وصف كذلك', () => {
    for (const [key, meta] of Object.entries(ZATCA_STATUS_META)) {
      expect(meta, `الحالة ${key} بلا وصف`).toBeDefined();
      expect(meta.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('وقراءة كل حالة عبر الحارس لا ترمي — الطبقتان معاً', () => {
    for (const s of ALL_STATUSES) {
      expect(() => badgeOf(STATUS_META, s).badgeClass).not.toThrow();
    }
  });
});
