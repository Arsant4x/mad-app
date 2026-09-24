import { describe, expect, it, vi } from 'vitest';
import { wireSaleOf, type QueuedSale } from './posQueue';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.04 ث — ثلاثةُ أضعافه دون الافتراضيّ،
//    فالميزانيةُ الافتراضيُّ نفسُه). معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * 🔴 **طابورُ الأوفلاين يُرسل حقولَ البيع وحدَها** (`ق-١٤٠١`).
 *
 * كان `flushQueue` يُرسل `QueuedSale` كما خُزِّن — بحقول الإيصال المؤقّت — والخادمُ يرفض كلَّ حقلٍ لا يعرفه
 * (`forbidNonWhitelisted`). **مقيسٌ على الخادم بالجسم نفسِه**: `400` —
 * «property display/total/vatAmount/zatcaQr should not exist» — **فالبيعُ الأوفلاين لا يُزامَن أبداً**.
 */
describe('🔴 طابورُ الأوفلاين على السلك (ق-١٤٠١)', () => {
  const queued: QueuedSale = {
    clientSaleId: 'c1',
    offlineRef: 'OFF-1',
    ringAt: '2026-09-24T10:00:00.000Z',
    ringOffsetMin: 180,
    lines: [{ productId: 'p1', quantity: 1 }],
    paymentMethod: 'CARD',
    cardDeviceReference: 'RRN-1',
    display: [{ name: 'صنف', quantity: 1, unitPrice: 100 }],
    total: 115,
    vatAmount: 15,
    zatcaQr: 'QR',
  };

  it('حقولُ العرض لا تبلغ السلك — والباقي حقولُ مزامنة البيع', () => {
    expect(Object.keys(wireSaleOf(queued)).sort()).toEqual(['cardDeviceReference', 'clientSaleId', 'lines', 'offlineRef', 'paymentMethod', 'ringAt', 'ringOffsetMin']);
  });

  it('ورقمُ مرجع الجهاز يعبر حين يوجد ولا يُخترع حين يغيب — والمقسّمُ يحمل أجزاءه', () => {
    const cash: QueuedSale = { ...queued, paymentMethod: 'CASH', cardDeviceReference: undefined };
    expect(wireSaleOf(cash)).not.toHaveProperty('cardDeviceReference');
    const split = wireSaleOf({ ...queued, paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 15 }, { method: 'CARD', amount: 100 }] });
    expect(split.payments).toEqual([{ method: 'CASH', amount: 15 }, { method: 'CARD', amount: 100 }]);
    expect(split.cardDeviceReference).toBe('RRN-1');
  });
});
