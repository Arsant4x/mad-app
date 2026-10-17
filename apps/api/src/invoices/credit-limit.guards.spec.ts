import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { sourceFiles, stripComments } from '../common/source-scan.util';
import { checkCreditLimit, NO_CREDIT_LIMIT } from './credit-limit.util';
import { CREDIT_CODE } from './credit-context';

/**
 * **حرّاسُ حدّ الائتمان — مشتقّةٌ من الشجرة لا من قائمةٍ بيد** (`ق-٣٣٨` … `ق-٣٤١`).
 *
 * ⚠️ **والصنفُ مُعلَن — تعليقاتٌ تُجرَّد والنصوصُ تبقى** (`ق-٣٧٥`): المفتشُ
 * يبحث عن **`settlement: 'IMMEDIATE'`** — **وهو قيمةٌ نصّية في موضع كود**.
 * **فتجريدُ النصوص يمحوه ويُعمي الحارس** — وهي عينُ الحادثة التي أعمت
 * `me-permissions` حين جُرِّدت سلاسلُه.
 */
const SRC = join(__dirname, '..');
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');

/**
 * ⭐ **الإعفاءُ من الحدّ يُصرَّح في مسارٍ واحدٍ معلوم** (`ق-٣٣٨`).
 *
 * **ولماذا حارسٌ والنوعُ يفرضه**: `TypeScript` يفرض **أن يُصرَّح**، **ولا يفرض
 * أن يكون التصريحُ صادقاً**. **ومستدعٍ رابعٌ يكتب `IMMEDIATE` ليمرّ** يُنتج
 * **باباً صامتاً على الحدّ كلِّه** — والنوعُ يراه سليماً.
 */
export function declaresImmediate(source: string): boolean {
  // ⚠️ **التعليقاتُ وحدها تُجرَّد**: شرحٌ يذكر `IMMEDIATE` ليس تصريحاً،
  //    **والسلسلةُ نفسُها هي المطلوب** فلا تُمحى.
  return /settlement\s*:\s*['"`]IMMEDIATE['"`]/.test(stripComments(source));
}

export function immediateDeclarers(files: string[]): string[] {
  return files
    .filter((f) => declaresImmediate(readFileSync(f, 'utf8')))
    .map(rel)
    .sort();
}

describe('حدُّ الائتمان — الإعفاءُ مسارٌ واحدٌ معلوم', () => {
  const GUILTY = "await create(dto, { settlement: 'IMMEDIATE', actor: null });";
  const INNOCENT = [
    "// البيعُ الفوريّ (settlement: 'IMMEDIATE') لا يُفحص — وهذا شرحٌ لا تصريح.",
    "await create(dto, { settlement: 'ON_ACCOUNT', actor });",
  ].join('\n');

  it('🔴 المُكتشِفُ مُثبَتٌ بحالتين قبل أن يُقرأ حكمُه', () => {
    // ⚠️ **حالتان معلومتان يدوياً** (`ق-٣٧٠` · `ق-٣٩٠`) على **نصٍّ مصنوع**:
    //    موجبةٌ تُدان، وسالبةٌ **بنفس الكلمة في موضعٍ ليس تصريحاً**.
    expect(declaresImmediate(GUILTY)).toBe(true);
    // 🔴 **والسالبةُ تُثبت أنه لا يرى ما ليس فيه**: الكلمةُ نفسُها في تعليق.
    expect(declaresImmediate(INNOCENT)).toBe(false);
  });

  it('🔴 والماسحُ نفسُه مُثبَتٌ على ملفَّين مصنوعَين — لا على الشجرة وحدها', () => {
    // ⚠️ **الغلافُ يُثبَت كما يُثبَت لبُّه** (`ق-٣٧٠` · `ق-٣٨٨`): قراءةُ الملفّ
    //    وتحويلُ المسار **طبقتان بينهما وبين الحكم**، **وخضرةٌ على الشجرة وحدها
    //    لا تُثبت أنهما تعملان** — فقد تخضرّ يوم تفرغ الشجرة.
    const dir = mkdtempSync(join(tmpdir(), 'credit-guard-'));
    try {
      writeFileSync(join(dir, 'guilty.ts'), GUILTY, 'utf8');
      writeFileSync(join(dir, 'innocent.ts'), INNOCENT, 'utf8');
      const found = immediateDeclarers([join(dir, 'guilty.ts'), join(dir, 'innocent.ts')]);
      // **الاسمُ يُقرأ من المُخرَج** — فبلاغٌ لا يسمّي الملفّ لا يُنتفَع به.
      expect(found.map((f) => f.split('/').pop())).toEqual(['guilty.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('⭐ ولا يصرّح بالإعفاء إلا الكاشير — على الشجرة كما هي', () => {
    // ⚠️ **مشتقٌّ من القرص لا مكتوبٌ بالمسار**: مستدعٍ جديد يُلتقط بلا تعديل
    //    الحارس. **والقائمةُ المسموحة تُسمّى صراحةً ولا تُستنتج من نوعٍ ولا
    //    مجلّد** — فاستنتاجُ النوع يوسّع الباب بلا أن يُقرأ.
    const files = sourceFiles(SRC).filter((f) => !/\.spec\.ts$/.test(f));
    expect(immediateDeclarers(files)).toEqual(['pos/pos.service.ts']);
  });
});

describe('حدُّ الائتمان — البوّابةُ تسبق الكتابة، والمصدرُ واحد', () => {
  const invoices = () => stripComments(readFileSync(join(__dirname, 'invoices.service.ts'), 'utf8'));

  it('⭐ الفحصُ قبل إنشاء الفاتورة — لا بعده', () => {
    // بوّابةٌ تُفحص بعد الإنشاء **تصير تقريراً لا منعاً**، وتحرق رقمَ مستندٍ
    // في كل رفض — والعدّادُ ذرّيٌّ لا يعيد المحروق (`ق-٣٣١`③).
    const code = invoices();
    const gate = code.indexOf('this.gateCreditLimit(');
    const write = code.indexOf('tx.invoice.create(');
    expect({ gate: gate >= 0, write: write >= 0 }).toEqual({ gate: true, write: true });
    expect(gate).toBeLessThan(write);
  });

  it('⭐ والتعرّضُ من المصدر الواحد — لا حسابَ ثانٍ في بوّابة الحدّ', () => {
    // `ق-٣٤١`: «المتبقّي» كان في ثلاثة مواضع، **وحدٌّ يحسبه بنفسه يصير رابعاً**
    // — وتاجرٌ يقرأ رقمين مختلفين يفقد الثقة في الاثنين.
    const util = stripComments(readFileSync(join(__dirname, 'credit-limit.util.ts'), 'utf8'));
    expect(util).toContain('exposureOf(');
    for (const forbidden of ['allocations', 'baseTotal', 'creditNote', 'payment.findMany']) {
      expect({ forbidden, present: util.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });
});

describe('حدُّ الائتمان — الرمزُ واحدٌ عبر الحزمتين', () => {
  it('⭐ رمزُ الواجهة يطابق رمزَ الخادم — يُقرأ من ملفّه لا يُفترض', () => {
    // ⚠️ **نسختان لسلسلةٍ واحدة عبر حزمتين** — **ولا نوعَ يربطهما**: الواجهة
    //    لا تستورد من الخادم. **فافتراقُهما لا يكسر بناءً ولا اختباراً**،
    //    **بل يُخفي زرَّ التجاوز صامتاً** فيُقرأ الرفضُ منعاً صلباً.
    //
    //    والقراءةُ **من الملفّ لحظتَها** لا من نسخةٍ هنا (القاعدة السابعة).
    const web = readFileSync(join(SRC, '..', '..', 'web', 'src', 'api', 'invoices.ts'), 'utf8');
    const declared = /export const CREDIT_LIMIT_EXCEEDED\s*=\s*'([^']+)'/.exec(stripComments(web))?.[1];
    expect({ web: declared }).toEqual({ web: CREDIT_CODE.exceeded });
  });
});

describe('حدُّ الائتمان — صفرٌ يعني بلا حدّ', () => {
  /** معاملةٌ مزيَّفة تسجّل ما قُرئ — **فيُقاس أن التعرّض لم يُستعلَم أصلاً**. */
  const fakeTx = (creditLimit: number) => {
    const reads: string[] = [];
    const tx = {
      customer: {
        findUnique: async () => {
          reads.push('customer');
          return { name: 'عميل', creditLimit };
        },
      },
      invoice: {
        findMany: async () => {
          reads.push('invoice');
          return [];
        },
      },
      creditNote: { findMany: async () => (reads.push('creditNote'), []) },
      payment: { findMany: async () => (reads.push('payment'), []) },
    };
    return { tx, reads };
  };

  it('🔴 عميلٌ بلا حدّ لا يُفحص ولا يُستعلَم تعرّضُه', async () => {
    // ⚠️ **وهذا شرطُ ألّا تكسر الميزةُ كلَّ عميلٍ قائم**: الحقلُ افتراضُه صفر،
    //    **وكلُّ عميلٍ في المنصّة اليوم عليه** — فقراءةُ الصفر حدّاً **تمنع كل
    //    بيعٍ آجلٍ لحظةَ التفعيل**، وهو انحدارٌ شاملٌ يبدو ميزة.
    const { tx, reads } = fakeTx(NO_CREDIT_LIMIT);
    const check = await checkCreditLimit(tx as never, { companyId: 'co1', customerId: 'c1', issueDate: new Date(), addingBase: 999_999 });

    expect({ exceeded: check.exceeded, limit: check.limit }).toEqual({ exceeded: false, limit: NO_CREDIT_LIMIT });
    // **والكلفةُ مقيسةٌ لا مرجَّحة**: استعلامُ الأعمار **لم يقع**.
    expect(reads).toEqual(['customer']);
  });
});
