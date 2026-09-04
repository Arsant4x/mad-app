import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { postWriteOffEntry, writeOffPostingLines } from './auto-posting.util';
import { WRITEOFF_REASONS, writeOffReason } from '../common/writeoff-reasons';

/**
 * **قيد الشطب بلا سطر ضريبة** (`SPEC 30.5` · `ق-١٣٨`).
 *
 * الاختبار على **الدالة النقيّة** لا على قاعدة بيانات: ما يُثبَت هنا شكلُ القيد
 * وقرارُ المسار، وكلاهما لا يحتاج جدولاً. (المسار الكامل — الطبقات والحركة
 * والاعتماد — يُثبَت بـe2e في موجة الكيان.)
 */
const IDS = { expenseAccountId: 'acc-5800', inventoryAccountId: 'acc-1300' };

/** الرموز تُقرأ من مصدرها لا تُكتب هنا — قائمةٌ منسوخة تحرس نسختها. */
const noAdjustment = WRITEOFF_REASONS.filter((r) => r.taxPath === 'NO_ADJUSTMENT').map((r) => r.code);
const deemedSupply = WRITEOFF_REASONS.filter((r) => r.taxPath === 'DEEMED_SUPPLY').map((r) => r.code);

describe('قيد شطب المخزون — سطران بلا ضريبة', () => {
  it('توكيدُ سلامة: المساران كلاهما ممثَّل في المصدر', () => {
    // قائمةٌ فارغة تجعل حلقات `for` أدناه تمرّ بلا أن تفحص شيئاً — وهو
    // بالضبط ما يجعل الاختبار يطمئن كذباً.
    expect({ noAdjustment: noAdjustment.length > 0, deemedSupply: deemedSupply.length > 0 })
      .toEqual({ noAdjustment: true, deemedSupply: true });
  });

  it('🔴 سطران اثنان لا ثالث — ولا حساب ضريبةٍ بينهما', () => {
    for (const code of noAdjustment) {
      const lines = writeOffPostingLines({ baseCost: 240, reasonCode: code }, IDS);
      expect(`${code}: ${lines.length} سطر`).toBe(`${code}: 2 سطر`);
      // الحسابان هما المُمرَّران وحدهما — فلا سطرَ ضريبةٍ تسلّل بحسابٍ ثالث.
      expect(new Set(lines.map((l) => l.accountId))).toEqual(new Set([IDS.expenseAccountId, IDS.inventoryAccountId]));
    }
  });

  it('مدين المصروف = دائن المخزون = التكلفة، مدوَّرةً كما يُدوَّر المال', () => {
    const lines = writeOffPostingLines({ baseCost: 12.345, reasonCode: noAdjustment[0] }, IDS);
    const expense = lines.find((l) => l.accountId === IDS.expenseAccountId)!;
    const inventory = lines.find((l) => l.accountId === IDS.inventoryAccountId)!;
    expect({ debit: expense.debit, credit: expense.credit }).toEqual({ debit: 12.35, credit: 0 });
    expect({ debit: inventory.debit, credit: inventory.credit }).toEqual({ debit: 0, credit: 12.35 });
  });

  it('🔴 والتوريد الاعتباري يُرفض صراحةً — لا يُرحَّل شطباً بلا ضريبة', () => {
    for (const code of deemedSupply) {
      expect(() => writeOffPostingLines({ baseCost: 100, reasonCode: code }, IDS)).toThrow(BadRequestException);
      // والرسالة تسمّي السبب بلافتته كي يعرف القارئ أيّ بندٍ وُقف عليه.
      expect(() => writeOffPostingLines({ baseCost: 100, reasonCode: code }, IDS))
        .toThrow(writeOffReason(code)!.label);
    }
  });

  it('🔴 ورمزٌ مجهول يُوقف الترحيل ولا يُصنَّف بالصمت', () => {
    expect(() => writeOffPostingLines({ baseCost: 100, reasonCode: 'WHATEVER' }, IDS)).toThrow(RangeError);
  });

  it('وتكلفةٌ غير موجبة لا تُرحَّل أصلاً — قبل أن تُلمس قاعدة', async () => {
    // `tx` غير مستعمَل في هذا المسار عمداً: لو لُمس لسقط الاختبار بـ`TypeError`
    // بدل أن يمرّ — وهو الإثبات بالعكس لهذا الشرط بعينه.
    const tx = null as never;
    for (const cost of [0, -5]) {
      await expect(postWriteOffEntry(tx, 'c1', { ref: 'WO-1', date: new Date(), baseCost: cost, reasonCode: noAdjustment[0] }))
        .resolves.toBeNull();
    }
  });

  it('🔴 والقيد يحمل سنده في الشيفرة — فمن ظنّه ناقصاً يجد النصّ لا التخمين (ق-١٣٨)', () => {
    const source = readFileSync(join(__dirname, 'auto-posting.util.ts'), 'utf8');
    expect(source.length).toBeGreaterThan(1000); // قراءةٌ فاشلة تُسقط ولا تمرّ
    const section = source.slice(source.indexOf('قيد شطب المخزون'), source.indexOf('export interface PurchaseForPosting'));
    expect(section.length).toBeGreaterThan(500);
    for (const citation of ['م١٥(٤)', 'م٤٩(٥)', 'دليل خصم المدخلات']) {
      expect(`${citation}: ${section.includes(citation)}`).toBe(`${citation}: true`);
    }
  });
});
