import { Prisma } from '@mad-app/db';
import { CONVERGENT_ENSURE_MODELS, isConvergentConflict, NUMBERED_MODELS, NUMBERING_COLUMNS, retryOnUniqueConflict } from './retry-on-conflict.util';

/**
 * `ق-١١٩٨`/④ — إعادةُ المحاولة محصورةٌ في قيد الرقم.
 *
 * كانت تُعيد على أيّ `P2002` ثماني مرّات: قيدٌ ثابت (رمزُ حسابٍ مكرَّر) يُعاد ثمانياً ثم يسقط
 * بالخطأ نفسِه — الحالةُ ② سقطت على الشيفرة القديمة بـ`8` نداءات. والقياسُ بعدد النداءات لا
 * بالزمن، فالمهلُ عشوائية. **وشكلُ الخطأ كما يصل من القاعدة** (`target: null` والنموذجُ وحدَه)
 * مقيسٌ في `test/retry-on-conflict-shape.e2e-spec.ts` — فالحالاتُ هنا تُبنى على الشكلين.
 */
function p2002(meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta });
}

async function callsUntilThrow(error: Error): Promise<number> {
  let calls = 0;
  await expect(
    retryOnUniqueConflict(async () => {
      calls += 1;
      throw error;
    }),
  ).rejects.toBe(error);
  return calls;
}

describe('retryOnUniqueConflict — محصورةٌ في قيد الرقم (ق-١١٩٨/④)', () => {
  it('النماذجُ المرقَّمة مشتقّةٌ من المخطّط — والمعروفةُ فيها، وغيرُها ليس فيها', () => {
    expect(NUMBERING_COLUMNS).toEqual(['no', 'zatcaIcv', 'seq']);
    for (const m of ['Invoice', 'JournalEntry', 'Payment', 'SupplierPayment', 'Purchase', 'GoodsReceipt', 'StockOpening', 'InventoryWriteOff', 'Quote', 'Contract', 'TaskLog', 'DelegationLog']) {
      expect(NUMBERED_MODELS.has(m)).toBe(true);
    }
    for (const m of ['Account', 'Unit', 'Product', 'Customer', 'Company', 'Bank']) expect(NUMBERED_MODELS.has(m)).toBe(false);
  });

  it('① تصادمُ رقمٍ يُعاد حتى الاستنفاد — بأعمدة القيد أو بالنموذج حين يغيب الهدف (كما تبلّغ القاعدة)', async () => {
    expect(await callsUntilThrow(p2002({ modelName: 'Invoice', target: ['companyId', 'no'] }))).toBe(8);
    expect(await callsUntilThrow(p2002({ modelName: 'Invoice', target: ['egsUnitId', 'zatcaIcv'] }))).toBe(8);
    expect(await callsUntilThrow(p2002({ modelName: 'TaskLog', target: ['companyId', 'seq'] }))).toBe(8);
    // الشكلُ المقيس على Postgres بدور التطبيق: الهدفُ `null` والنموذجُ وحدَه يدلّ.
    expect(await callsUntilThrow(p2002({ modelName: 'JournalEntry', target: null }))).toBe(8);
    expect(await callsUntilThrow(p2002({ modelName: 'Payment', target: null }))).toBe(8);
  });

  it('🔴 ② قيدٌ ليس رقماً لا يُعاد: نداءٌ واحد ثم الخطأُ نفسُه', async () => {
    expect(await callsUntilThrow(p2002({ modelName: 'Account', target: ['companyId', 'code'] }))).toBe(1);
    expect(await callsUntilThrow(p2002({ modelName: 'Account', target: null }))).toBe(1);
    expect(await callsUntilThrow(p2002({ modelName: 'InventoryBatch', target: ['companyId', 'productId', 'batchNo'] }))).toBe(1);
    expect(await callsUntilThrow(p2002({ modelName: 'LoginIdentity', target: ['username'] }))).toBe(1);
    // ولا `meta` أصلاً — فلا دليلَ على رقمٍ فلا إعادة.
    expect(await callsUntilThrow(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 'test' }))).toBe(1);
  });

  it('③ وما ليس `P2002` لا يُعاد — ولو حمل الاسم', async () => {
    expect(await callsUntilThrow(new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'test', meta: { modelName: 'Invoice', target: ['no'] } }))).toBe(1);
    expect(await callsUntilThrow(new Error('no'))).toBe(1);
  });

  it('④ الناجحُ بعد تصادمٍ يعود بقيمته — والعدُّ يشهد للإعادة', async () => {
    let calls = 0;
    const value = await retryOnUniqueConflict(async () => {
      calls += 1;
      if (calls < 3) throw p2002({ modelName: 'Invoice', target: null });
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(calls).toBe(3);
  });

  it('⑤ مصادقةُ المسبار: أعمدةُ القيد تُقدَّم على النموذج حين تصل — فنموذجٌ مرقَّم بقيدٍ ليس رقماً لا يُعاد', () => {
    expect(isConvergentConflict(p2002({ modelName: 'Invoice', target: ['companyId', 'clientSaleId'] }))).toBe(false);
    expect(isConvergentConflict(p2002({ modelName: 'Invoice', target: 'no' }))).toBe(true);
    expect(isConvergentConflict(p2002({ modelName: 'Account', target: ['companyId', 'no'] }))).toBe(true);
  });

  it('⑥ «أنشئ إن لم تجد» يُقارَب بالتكرار — وحدةُ الهيئة الافتراضية وحدَها، بالاسم وبسببها (أمسكته المحطة: icv-concurrency ①)', () => {
    expect([...CONVERGENT_ENSURE_MODELS]).toEqual(['EgsUnit']);
    // الشكلُ الحيّ تحت دور التطبيق: بلا أعمدة — فالاسمُ هو الفيصل.
    expect(isConvergentConflict(p2002({ modelName: 'EgsUnit', target: null }))).toBe(true);
    // ونموذجٌ آخر بالشكل نفسِه لا يُعاد — فالاستثناءُ اسمٌ لا نمط.
    expect(isConvergentConflict(p2002({ modelName: 'Warehouse', target: null }))).toBe(false);
  });
});
