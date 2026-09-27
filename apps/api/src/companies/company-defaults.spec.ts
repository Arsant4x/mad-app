import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): يقرأ **العملةَ الافتراضية من
// `@default("SAR")` في المخطَّط** — وهي **داخل اقتباس**؛ **فتجريدُ النصوص
// يمحوها**.
readsDeclaredStrings();
import { Prisma } from '@mad-app/db';
import { createCompanyDefaults, DEFAULT_ACTIVITY_NAME, DEFAULT_CURRENCY } from './company-defaults';
import { regionForNewCompany } from '../common/region/regions';

/**
 * حارس «لا تُولد منشأة ناقصة».
 *
 * **الحادثة:** تعليق `BusinessActivity` وعد بأن كل منشأة تُبذَر بنشاط
 * افتراضي «فيستطيع بقية التطبيق افتراض وجوده بلا فحص null». ولم يكن ذلك
 * صحيحاً إلا لمنشأتَي العرض: الترحيل أنشأ الجدول بلا تعبئة، ومسار التسجيل
 * الحقيقي لا يمسّه. انكشف بقياس منشأة أُنشئت للتوّ — `activities []`.
 *
 * والحارس ذو شقّين لأن العطل ذو شقّين:
 *   ١. **السلوك**: الوحدة تُنشئ ما ينقص ولا تدهس ما وُجد.
 *   ٢. **الربط**: كل مسار يُنشئ منشأة يستدعيها — وهو ما غاب أصلاً. توكيدٌ
 *      على الوحدة وحدها كان سيمرّ بينما المنشآت تُولد ناقصة كما هي.
 */

/** عميل Prisma مزيّف يسجّل ما استُدعي — المطلوب فحص المنطق لا القاعدة. */
function fakeTx(opts: { hasActivity?: boolean; hasCurrency?: boolean } = {}) {
  const created = { activities: [] as unknown[], currencies: [] as unknown[] };
  const tx = {
    businessActivity: {
      findFirst: jest.fn().mockResolvedValue(opts.hasActivity ? { id: 'a1' } : null),
      create: jest.fn(({ data }: { data: unknown }) => {
        created.activities.push(data);
        return Promise.resolve(data);
      }),
    },
    currency: {
      findFirst: jest.fn().mockResolvedValue(opts.hasCurrency ? { id: 'c1' } : null),
      create: jest.fn(({ data }: { data: unknown }) => {
        created.currencies.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, raw: tx, created };
}

describe('افتراضيات المنشأة — لا تُولد ناقصة', () => {
  it('منشأة جديدة تحصل على نشاط وصفّ عملة أساس', async () => {
    const { tx, created } = fakeTx();
    const res = await createCompanyDefaults(tx, 'co-1');

    expect(res).toEqual({ activityCreated: true, currencyCreated: true });
    expect(created.activities).toEqual([
      expect.objectContaining({ companyId: 'co-1', name: DEFAULT_ACTIVITY_NAME }),
    ]);
    expect(created.currencies).toEqual([
      expect.objectContaining({ companyId: 'co-1', code: DEFAULT_CURRENCY.code, isBase: true, rate: 1 }),
    ]);
  });

  it('عملة الأساس تطابق ما يكتبه الميلادُ على `Company.baseCurrency` — صفٌّ لا يطابقه يوحي بأساسٍ آخر', () => {
    // ق-١٣٦٨: لا افتراضَ في القاعدة بعد اليوم — والمنشأةُ تولد بعملة إقليمها من السجلّ. وحين يُضاف إقليمٌ ثانٍ يرمي
    // `regionForNewCompany(undefined)` فيسقط هذا الاختبار — **وهو المقصود**: بذرةُ صفّ العملة تصير من عملة المنشأة لا ثابتاً.
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).not.toMatch(/baseCurrency\s+String\s+@default\(/);
    expect(DEFAULT_CURRENCY.code).toBe(regionForNewCompany(undefined).baseCurrency);
  });

  it('⚠️ عديم الأثر عند التكرار — لا يُنشئ شيئاً مرتين', async () => {
    const { tx, created } = fakeTx({ hasActivity: true, hasCurrency: true });
    const res = await createCompanyDefaults(tx, 'co-1');

    expect(res).toEqual({ activityCreated: false, currencyCreated: false });
    expect(created.activities).toHaveLength(0);
    expect(created.currencies).toHaveLength(0);
  });

  it('لا يمسّ منشأة تملك أحدهما — يُكمل الناقص وحده', async () => {
    const { tx, created } = fakeTx({ hasActivity: true, hasCurrency: false });
    const res = await createCompanyDefaults(tx, 'co-1');

    expect(res).toEqual({ activityCreated: false, currencyCreated: true });
    expect(created.activities).toHaveLength(0);
    expect(created.currencies).toHaveLength(1);
  });

  it('لا يخترع نوع نشاط حين لا يُعرف — نوعٌ خاطئ يقود منطق العقارات لفرعٍ غريب', async () => {
    const { tx, created } = fakeTx();
    await createCompanyDefaults(tx, 'co-1');
    expect((created.activities[0] as { activityType: unknown }).activityType).toBeNull();

    const withType = fakeTx();
    await createCompanyDefaults(withType.tx, 'co-2', 'عقارات');
    expect((withType.created.activities[0] as { activityType: unknown }).activityType).toBe('عقارات');
  });

  /**
   * ⭐ الشقّ الثاني — وهو الذي كان غائباً فعلاً.
   *
   * الوحدة قد تكون سليمة تماماً بينما لا يستدعيها أحد، وهو **حال العطل قبل
   * هذا الإصلاح بالضبط**: البذرة كانت تُنشئ النشاط لمنشأتَي العرض، والمنطق
   * موجود، ومسار التسجيل الحقيقي لا يمرّ به. فالحارس يفحص **الربط** لا
   * السلوك وحده — ومساراتُ الإنشاء تُقرأ من نفس موضع `createDefaultChart`،
   * فهي التي تُنشئ منشأة.
   */
  it('كل مسار يُنشئ منشأة يستدعي الافتراضيات — لا مسار يُفلت', () => {
    const paths = ['auth/auth.service.ts', 'companies/companies.service.ts'];
    const offenders: string[] = [];

    for (const rel of paths) {
      const src = readFileSync(join(__dirname, '..', rel), 'utf8');
      // `createDefaultChart` علامة مسار الإنشاء: حيثما وُجد وجب أن ترافقه
      // الافتراضيات، وإلا وُلدت المنشأة ناقصة من ذلك المسار.
      //
      // ⚠️ **بلا طرحٍ للاستيراد.** أول صياغة طرحت 1 «لسطر الاستيراد» —
      // والاستيراد لا يحوي قوساً (`createDefaultChart }` لا `…(`)، فلا يطابق
      // النمط أصلاً. فصار العدّ 0 والشرط `charts > 0` خاملاً، **ومرّ الحارس
      // على كسرٍ محقون**. كشفه الإثبات بالعكس وحده.
      const charts = (src.match(/createDefaultChart\(/g) ?? []).length;
      const defaults = (src.match(/createCompanyDefaults\(/g) ?? []).length;
      if (charts > 0 && defaults < charts) {
        offenders.push(`${rel}: ${charts} مسار إنشاء · ${defaults} استدعاء افتراضيات`);
      }
    }

    expect({ مسارات_تلد_منشأة_ناقصة: offenders }).toEqual({ مسارات_تلد_منشأة_ناقصة: [] });
  });
});
