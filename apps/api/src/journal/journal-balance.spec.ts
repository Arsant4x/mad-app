import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { createJournalEntry } from './journal-posting.util';

/**
 * **القيدُ يتوازن بما يُخزَّن لا بما يُحسب** (توجيه ٢٧٤ الكتلة ٥ · مراجعة 3.3 البند 2).
 *
 * السطرُ يُخزَّن بخانتين (`Decimal(18,2)`)، وكان الفحصُ يقارن المجموعين الخامَين بسماحٍ `0.001`: فقيدٌ متوازنٌ قبل التقريب
 * يُخزَّن غيرَ متوازن (`33.334 + 33.333 + 33.333` مدين مقابل `100` دائن يُخزَّن `99.99` مقابل `100.00`)، وقيدٌ بفرقٍ
 * دون السماح يمرّ (`0.005` مقابل `0.0045`). وهذا هو المدخلُ الذي تمرّ به المساراتُ كلُّها، اليدويُّ والآليّ، فيُحرس هنا لا
 * في الـDTO وحدَه: كلُّ سطرٍ يُقرأ بالهللة بعد التدوير بسياسة المنصّة (`toHalalas`)، والمجموعان يتساويان تماماً.
 *
 * والفحصُ أوّلُ ما في الدالّة قبل أيّ قراءة، فيُختبر بمعاملةٍ وهمية: ما يمرّ منه يبلغها فيرمي علامتَه، وما يُرفض لا يبلغها.
 */
const REACHED = 'reached-the-transaction';
const tx = new Proxy({}, { get: () => { throw new Error(REACHED); } }) as unknown as Prisma.TransactionClient;
const entry = (debits: number[], credits: number[]) => ({
  companyId: 'c',
  date: new Date('2026-01-15'),
  memo: 'm',
  auto: true,
  lines: [...debits.map((d) => ({ accountId: 'd', debit: d, credit: 0 })), ...credits.map((c) => ({ accountId: 'c', debit: 0, credit: c }))],
});
const verdict = async (debits: number[], credits: number[]): Promise<'refused' | 'passed'> => {
  try {
    await createJournalEntry(tx, entry(debits, credits));
  } catch (e) {
    if (e instanceof BadRequestException && e.message === MSG.journal_entry_unbalanced) return 'refused';
    if (e instanceof Error && e.message === REACHED) return 'passed';
    throw e;
  }
  throw new Error('createJournalEntry returned without touching the transaction');
};

describe('القيدُ يتوازن بما يُخزَّن: بالهللة بعد التدوير لا بسماحٍ على الخام (مراجعة 3.3 البند 2)', () => {
  it('الضابط: متوازنٌ بخانتين يمرّ، وما يتوازن بعد التدوير يمرّ، وفرقُ هللةٍ صريحٌ يُرفض', async () => {
    expect({
      twoPlaces: await verdict([33.33, 33.33, 33.34], [100]),
      roundsEqual: await verdict([10.0004], [10.0001]),
      oneHalala: await verdict([100], [99.99]),
      zero: await verdict([0], [0]),
    }).toEqual({ twoPlaces: 'passed', roundsEqual: 'passed', oneHalala: 'refused', zero: 'refused' });
  });

  it('🔴 متوازنٌ قبل التدوير ويُخزَّن غيرَ متوازن يُرفض: 33.334 + 33.333 + 33.333 مقابل 100 (99.99 مقابل 100.00)', async () => {
    expect(await verdict([33.334, 33.333, 33.333], [100])).toBe('refused');
  });

  it('🔴 فرقٌ دون السماح القديم يُرفض حين يصير فرقَ هللة: 0.005 مقابل 0.0045 (0.01 مقابل 0.00)', async () => {
    expect(await verdict([0.005], [0.0045])).toBe('refused');
  });

  it('🔴 وكذلك 3.335 + 3.335 مقابل 6.67 (6.68 مقابل 6.67)', async () => {
    expect(await verdict([3.335, 3.335], [6.67])).toBe('refused');
  });
});
