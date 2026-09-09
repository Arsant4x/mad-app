import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): مقروءُه **مخطَّطُ Prisma** — أسماءُ
// أعمدةٍ وأنواعُها — **لا شيفرةَ `TypeScript` يبحث فيها عن نمطٍ برمجيّ**.
readsDeclaredStrings();
import { formatMoney, roundTo, SCALE, toHalalas, type RoundingContext } from './rounding';

/**
 * حارسان على سياسة التدوير — أحدهما سلوكي والآخر بنيوي.
 *
 * ## لماذا حارسان لا واحد
 *
 * الاختبار السلوكي يثبت أن الدالة تدوّر صحيحاً. **ولا يثبت أن أحداً يستعملها**،
 * ولا أن عمود القاعدة يتّسع للدقّة التي تعد بها. وثلاثة من عيوب هذا اليوم
 * كانت من هذا الصنف بعينه: شيءٌ يعمل وحده ولا يتّصل بما بجواره.
 *
 * ## الحارس البنيوي — ويقرأ الاتجاهين
 *
 * ⚠️ حارسٌ يفحص «هل كل سياق في `SCALE` له عمود؟» **يمرّ على عمودٍ جديد وُلد
 * بدقّة خاطئة**، لأنه لا يسأل عنه أصلاً. فيُفحص الاتجاهان:
 *
 *   ① كل عمودٍ مصنَّف: موجودٌ في المخطَّط فعلاً، ودقّته = دقّة سياقه.
 *   ② كل عمود كميةٍ أو سعرِ وحدةٍ في المخطَّط: **مصنَّفٌ هنا**.
 *
 * والثاني هو الذي يمسك الحالة القادمة: `PurchaseLine.quantity` في الموجة
 * التالية، و`InventoryLayer.unitCost` بعدها. من ينسخ عموداً من `InvoiceLine`
 * القديم يسقط عند الفحص، لا بعد شهرٍ في تقرير.
 *
 * ⚠️ **وحدّ الحارس معلَن**: يحرس **بالاسم**. عمودٌ يحمل معنى الكمية باسمٍ لا
 * يطابق النمط (`litresDelivered` مثلاً) لا يراه. ولا يُرفع هذا الحدّ بتوسيع
 * النمط تخميناً — يُرفع بتصنيف العمود يدوياً حين يُخلق.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'apps', 'api', 'prisma', 'schema.prisma');
const SRC_ROOT = join(REPO_ROOT, 'apps', 'api', 'src');

/** كل عمود `Decimal` في المخطَّط، مقروءاً من المخطَّط نفسه لا من قائمة مكتوبة. */
function declaredDecimals(): Map<string, { precision: number; scale: number }> {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const out = new Map<string, { precision: number; scale: number }>();

  // النماذج تُقسَّم على `^model X {` ... `^}` — والقراءة سطراً سطراً لأن
  // تعبيراً واحداً يمتد عبر النموذج كله يلتقط أقواس الحقول المتداخلة.
  let model: string | null = null;
  for (const raw of schema.split(/\r?\n/)) {
    const line = raw.trim();
    const start = /^model\s+(\w+)\s*\{/.exec(line);
    if (start) { model = start[1]; continue; }
    if (line === '}') { model = null; continue; }
    if (!model) continue;

    const field = /^(\w+)\s+Decimal\??\s.*@db\.Decimal\((\d+),\s*(\d+)\)/.exec(line);
    if (field) out.set(`${model}.${field[1]}`, { precision: Number(field[2]), scale: Number(field[3]) });
  }
  return out;
}

/**
 * **الأدوار — مشتقّة من الاسم، لا قائمة أعمدة.**
 *
 * ⚠️ قائمةٌ بثمانية أسماء كانت ستمرّ على `PurchaseLine.quantity` في الموجة
 * التالية و`InventoryLayer.unitCost` بعدها — لأنها لا تسأل عنهما أصلاً. وهي
 * العلّة نفسها التي عولجت في التصدير (#59 · #61): **يُشتقّ من المخطَّط، ولا
 * يُكتب بيد**.
 *
 * فالحارس يمسح كل عمود `Decimal` ويسأل: **أيّ دورٍ يؤدّيه اسمه؟** ومن أدّى
 * دوراً وجب أن يحمل مقياسه.
 */
const ROLES = [
  {
    name: 'كمية',
    context: 'DERIVED_QUANTITY' as const,
    matches: /^(qty|quantity|minStock)$|(Qty|Quantity|Stock)$/,
  },
  {
    name: 'سعر أو تكلفة وحدة',
    context: 'UNIT_PRICE' as const,
    matches: /^(price|cost|unitPrice|unitCost)$|(Price|Cost)$/,
  },
] satisfies { name: string; context: RoundingContext; matches: RegExp }[];

/**
 * **الاستثناءات — بيضاء بحجّة مكتوبة، لا تخطٍّ صامت.**
 *
 * عمودٌ يطابق دوراً ولا يحمل مقياسه **يُذكر هنا بسببه**. والصمت ممنوع: النمط
 * الذي «لا يلتقطه» عمودٌ ما يُخفي القرار بدل أن يعلنه — وهو ما فعلته صياغتي
 * الأولى حين أسقطت `cost` من المفردات فبدت `maintenance_requests` مغطّاةً
 * وهي خارج الفحص أصلاً.
 */
const EXCLUSIONS: Record<string, string> = {
  'MaintenanceRequest.cost':
    'تكلفة البلاغ كاملاً — مبلغ لا سعرُ وحدة. لا كمية تُضرب فيه، فمقياسه مقياس المبالغ (18,2).',
  'MaintenanceRequest.baseCost':
    'نظير `cost` بالعملة الأساسية — نفس الحجّة، ونفس المقياس، ويتحرّكان معاً.',
  'InventoryWriteOff.baseCost':
    'تكلفة ما خرج من الطبقات في واقعة الشطب كلها — **مبلغٌ مُرحَّل لا سعرُ وحدة**: هو نفسه مدينُ قيد `5800`، فمقياسه مقياس المبالغ (18,2) وإلا اختلف الجدول عن سطر القيد.',
};

/**
 * ⭐ **مطابقةُ نصّ الهيئة — لا اجتهادٌ بعد اليوم** (بحث 2026-09-04، `ق-١٣٤`).
 *
 * كُتبت سياسة التدوير عندنا **بحجّةٍ هندسية**: حدُّ IEEE يجعل `1.005` يصير `1.00`،
 * و`Math.round` غير متناظرة حول الصفر فتترك هللةً بين الفاتورة وإشعارها. **ولم
 * يكن قد قُرئ نصٌّ يفرض طريقة.** فقُرئ:
 *
 * > *«Rounding shall be performed by using "half-up" rounding. Half-up means that
 * > half-way values are always rounded up.»*
 * > — ZATCA · **Electronic Invoice XML Implementation Standard v1.2 (2023-05-19)**
 * > · §10 «Rounding» · ص 29. وهو **مُدمَجٌ قانونياً** في قرار المحافظ 62738
 * > (23/11/1443هـ) الملحق (2): المعيار وقاموس البيانات «جزءٌ أساسي… يجب الالتزام بهما».
 *
 * **فالبنكيّ (half-even) والبتر مستبعدان بنصّ** — وهو ما يجعل هذا الحارس حجّةً
 * لا رأياً: **رقماه من نصّ الهيئة حرفياً**.
 *
 * ## والفرق الوحيد عن نصّها — معلَنٌ لا مخفيّ
 *
 * دالّتنا **نصفٌ بعيداً عن الصفر**، والنصّ **نصفٌ لأعلى**. ويتطابقان على كل قيمةٍ
 * غير سالبة، ويفترقان على السالبة وحدها (`−0.125` ⇒ نحن `−0.13` والنصّ `−0.12`).
 *
 * **ولا يبلغ ذلك مستنداً**: مبالغ الإشعارات تُخزَّن **موجبة** ونوعُ المستند يحمل
 * الاتجاه — كما تستقبلها الهيئة. فالسالب داخليٌّ في الدفتر وحده (ردٌّ أو عكس).
 * **والنصّ نفسه صامتٌ عن السالب**: كل أمثلته موجبة، ولا ترد كلمة `negative` في
 * المعيار كلّه — فالتناظر حول الصفر يبقى الأسلم للدفتر، وهو اجتهادٌ **في موضعٍ
 * لا نصّ فيه**، لا مخالفةً لنصّ.
 */
describe('التدوير يطابق نصّ الهيئة — نصفٌ لأعلى', () => {
  it('حالتا المعيار الحدّيتان بنصّهما: 123.4949 ⇒ 123.49 و123.4951 ⇒ 123.50', () => {
    expect(roundTo(123.4949, 'LINE_AMOUNT')).toBe(123.49);
    expect(roundTo(123.4951, 'LINE_AMOUNT')).toBe(123.5);
  });

  it('والنصف يصعد لا ينزل — وهو ما يستبعد البنكيّ والبتر', () => {
    // البنكيّ (half-even) يعطي 0.12 و2.68 و1.00؛ والبتر يعطي 0.12 و2.67 و1.00.
    expect(roundTo(0.125, 'LINE_AMOUNT')).toBe(0.13);
    expect(roundTo(2.675, 'LINE_AMOUNT')).toBe(2.68);
    expect(roundTo(1.005, 'LINE_AMOUNT')).toBe(1.01);
  });

  it('وسعرُ الوحدة لا يُقرَّب إلى منزلتين — فالمعيار لا يقيّد منازله', () => {
    // «Unit price amount does not set restrictions on number of decimals» (§7.3)،
    // ولا قاعدة `BR-DEC` تغطّي BT-146. وعمودُنا `Decimal(18,6)` يحفظ ذلك —
    // وتقريبُه إلى منزلتين كان سيخسر دقّةً **يسمح بها النصّ** ويراكم خطأً.
    expect(roundTo(12.3456789, 'UNIT_PRICE')).toBe(12.345679);
  });
});

describe('سياسة التدوير — السلوك (بعد كنسة التدوير 2026-09-03)', () => {
  /**
   * ⭐ العيبان اللذان كانا مثبَّتَين هنا «عيباً قائماً» صارا **سلوكاً مطلوباً**:
   * الأول حدّ IEEE-754، والثاني عدم التناظر حول الصفر. والتوكيدات أدناه تحرس
   * الإصلاح بالعكس — من أعاد `Math.round(x * 100) / 100` سقط هنا قبل أن يصل هللةٌ
   * ضائعة إلى مرتجع.
   */
  it('[SPEC 6.1] ⭐ حدّ IEEE-754 لا يخدعه: 1.005 تعطي 1.01 لا 1.00 — وكذلك على المقادير الكبيرة', () => {
    expect(roundTo(1.005, 'LINE_AMOUNT')).toBe(1.01);
    expect(roundTo(2.675, 'LINE_AMOUNT')).toBe(2.68);
    expect(roundTo(1234567.005, 'LINE_AMOUNT')).toBe(1234567.01); // إضافة EPSILON كانت ستفشل هنا
    expect(roundTo(0.1 + 0.2, 'LINE_AMOUNT')).toBe(0.3);
    // والدليل أن العيب كان قائماً: التعريف القديم يعطي 1.00
    expect(Math.round(1.005 * 100) / 100).toBe(1);
  });

  it('[SPEC 6.1] ⭐ متناظرٌ حول الصفر: الإشعار الدائن يردّ ما حصّلته الفاتورة بالضبط', () => {
    const samples = [1.005, 0.125, 0.375, 2.5, 0.015, 12345.675, 0.005, 1.115];
    for (const x of samples) {
      expect(roundTo(-x, 'LINE_AMOUNT')).toBe(-roundTo(x, 'LINE_AMOUNT'));
    }
    expect(roundTo(0.125, 'LINE_AMOUNT')).toBe(0.13);
    expect(roundTo(-0.125, 'LINE_AMOUNT')).toBe(-0.13);
    // والدليل أن العيب كان قائماً: Math.round(-12.5) = -12 و Math.round(12.5) = 13
    expect(Math.round(-12.5)).toBe(-12);
    expect(Math.round(12.5)).toBe(13);
  });

  it('لا صفرٌ سالب، والقيم غير المنتهية تعود كما هي لا مقنَّعة', () => {
    expect(Object.is(roundTo(-0.001, 'LINE_AMOUNT'), 0)).toBe(true);
    expect(Object.is(roundTo(-0, 'LINE_AMOUNT'), 0)).toBe(true);
    expect(roundTo(Number.NaN, 'LINE_AMOUNT')).toBeNaN();
    expect(roundTo(Number.POSITIVE_INFINITY, 'LINE_AMOUNT')).toBe(Number.POSITIVE_INFINITY);
    expect(roundTo(1e-7, 'LINE_AMOUNT')).toBe(0); // صيغةٌ أسّية في String(value)
  });

  it('يدوّر ما دون النصف نزولاً وما فوقه صعوداً — السلوك القاعدي سليم', () => {
    expect(roundTo(1.0049, 'LINE_AMOUNT')).toBe(1.0);
    expect(roundTo(1.006, 'LINE_AMOUNT')).toBe(1.01);
  });

  it('كل سياق يدوّر بعدد خاناته لا بخانتين', () => {
    expect(roundTo(1.23456789, 'DERIVED_QUANTITY')).toBe(1.235);
    expect(roundTo(1.23456789, 'UNIT_PRICE')).toBe(1.234568);
    expect(roundTo(1.23456789, 'UNIT_COST')).toBe(1.234568);
    expect(roundTo(1.23456789, 'VAT_AMOUNT')).toBe(1.23);
    expect(roundTo(1.0005, 'DERIVED_QUANTITY')).toBe(1.001); // نصفٌ على الخانة الثالثة
  });

  it('formatMoney يدوّر بالسياسة ثم ينسّق — لا toFixed على قيمةٍ خام', () => {
    expect(formatMoney(1.005)).toBe('1.01');
    expect(formatMoney(-1.005)).toBe('-1.01');
    expect(formatMoney(-0.001)).toBe('0.00'); // لا "-0.00"
    expect(formatMoney(280)).toBe('280.00');
    expect(formatMoney(1.23456789, 'UNIT_PRICE')).toBe('1.234568');
    // والدليل أن toFixed الخام كان يخالف Math.round على الأنصاف السالبة:
    expect((-0.125).toFixed(2)).toBe('-0.13');
    expect(Math.round(-0.125 * 100) / 100).toBe(-0.12);
  });

  it('toHalalas عددٌ صحيح موقَّع بعد التدوير — 1.13 تعطي 113 لا 112', () => {
    expect(toHalalas(1.13)).toBe(113);
    expect(toHalalas(-1.13)).toBe(-113);
    expect(toHalalas(1.005)).toBe(101);
    expect(toHalalas(0)).toBe(0);
  });
});

describe('حارس: دقّة المخطَّط تطابق سياسة التدوير — في الاتجاهين', () => {
  const decimals = declaredDecimals();

  it('⓪ حارسٌ على المجسّ: القراءة من المخطَّط نجحت فعلاً', () => {
    // بلا هذا يمرّ كل ما تحته على خريطةٍ فارغة — وهو أخطر أشكال الأخضر الكاذب.
    expect(decimals.size).toBeGreaterThan(20);
    expect(decimals.has('InvoiceLine.quantity')).toBe(true);
  });

  it('⓪ب ودورا الأسعار والتكاليف يتقاسمان مقياساً واحداً — وإلا وجب فصلهما', () => {
    // الفحص أدناه يستعمل `UNIT_PRICE` لدور «سعر أو تكلفة وحدة» كلّه. فإن
    // افترقا يوماً صار الفحص يقيس أحدهما بمقياس الآخر — بصمت.
    expect(SCALE.UNIT_COST).toBe(SCALE.UNIT_PRICE);
  });

  it('① ⭐ كل عمود يؤدّي دوراً يحمل مقياس دوره — مشتقّاً من المخطَّط', () => {
    const wrong: string[] = [];
    for (const [column, declared] of decimals) {
      if (column in EXCLUSIONS) continue;
      const field = column.split('.')[1];
      const role = ROLES.find((r) => r.matches.test(field));
      if (!role) continue;
      const expected = SCALE[role.context];
      if (declared.scale !== expected) wrong.push(`${column} (${role.name}): ${declared.scale} ≠ ${expected}`);
    }
    expect(wrong).toEqual([]);
  });

  it('② ⭐ كل استثناء يسمّي عموداً قائماً **ويؤدّي دوراً فعلاً**', () => {
    /**
     * الاتجاه المعاكس: استثناءٌ لعمودٍ محذوف أو لا يطابق دوراً أصلاً هو
     * **إعفاءٌ من لا شيء** — يبقى في الملف يوهم بأن حالةً عولجت، ويُقرأ بعد
     * سنة على أنه قرار. فيسقط الحارس عليه.
     */
    const stale = Object.keys(EXCLUSIONS).filter((column) => !decimals.has(column));
    expect(stale).toEqual([]);

    const pointless = Object.keys(EXCLUSIONS).filter(
      (column) => !ROLES.some((r) => r.matches.test(column.split('.')[1])),
    );
    expect(pointless).toEqual([]);
  });

  it('③ ولكل استثناء حجّةٌ مكتوبة لا فراغ', () => {
    for (const [column, reason] of Object.entries(EXCLUSIONS)) {
      expect({ column, hasReason: reason.trim().length > 30 }).toEqual({ column, hasReason: true });
    }
  });
});

describe('حارس: تعريف واحد للتدوير لا خمسة', () => {
  it('⭐ لا ملف خارج `common/money` يعرّف دالة تدوير', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!entry.endsWith('.ts')) continue;
        if (path.includes(join('common', 'money'))) continue;
        const body = readFileSync(path, 'utf8');
        if (/^\s*(export\s+)?(const|function)\s+round\d*\s*[=(:]/m.test(body)) offenders.push(path.slice(REPO_ROOT.length + 1));
      }
    };
    walk(SRC_ROOT);
    expect(offenders).toEqual([]);
  });
});

/**
 * حارس كنسة التدوير (قرار المالك 2026-09-03) — **لا تدويرَ مالٍ خام خارج `common/money`**.
 *
 * التعريف الواحد لا يكفي: اثنان وخمسون موضعاً كانت تدوّر «بيدها» بـ`Math.round(x * 100) / 100`
 * أو `Number(x.toFixed(2))` أو `x.toFixed(2)` في رسالة — بينها ملفّا ZATCA اللذان يختمان
 * المستند. فمن أعاد واحداً منها أعاد الافتراقَ بين المختوم والمرحَّل بصمت. يمسح الخادم
 * (`apps/api/src`) والواجهة (`apps/web/src` — فيها نسختها `lib/money.ts`) معاً، ويستثني
 * ملفات الاختبار (تُثبت العيب القديم بذكره) وملفَّي السياسة نفسَيهما.
 *
 * حدّه معلَن: يحرس **الشكل** — `Math.round(x * 1000) / 10` للنِّسَب ليس مالاً ولا يُمسك،
 * و`toFixed(1)` لأحجام الملفات كذلك. تدويرٌ ماليّ بشكلٍ آخر يُضاف هنا حين يُرى، لا يُفترض.
 */
describe('حارس كنسة التدوير: لا تدويرَ مالٍ خام خارج common/money', () => {
  const WEB_ROOT = join(REPO_ROOT, 'apps', 'web', 'src');
  /**
   * ⚠️ **الحارس يعرف أشكالاً، ولا يعرف المعنى** — فكل شكلٍ جديد يُضاف حين يُرى.
   * وقد نجا `Math.floor(x * 100) / 100` منه سنةً كاملة في
   * `installment-schedule.util.ts`، **وهو نفسه علّة رقمٍ خاطئ**: عقدٌ بـ`3.03` على
   * ثلاثة يعطي `1.00 · 1.00 · 1.03`. فالقاعدة الآن **كل إزاحةٍ عشرية بالضرب في
   * `100` ثم قسمةٍ عليها** أياً كانت دالّة التقريب (`round` · `floor` · `ceil` ·
   * `trunc`)، **وكل `toFixed` بأي عدد منازل** — لا الاثنتين وحدهما.
   */
  const RAW_ROUNDING = [
    { name: 'Math.round/floor/ceil/trunc(x * 100) / 100', re: /Math\.(round|floor|ceil|trunc)\([^\n;]*\*\s*100\s*\)\s*\/\s*100(?![\d.])/ },
    { name: 'Number(x.toFixed(2))', re: /Number\([^\n;]*\.toFixed\(\s*2\s*\)\s*\)/ },
    { name: 'x.toFixed(2)', re: /\.toFixed\(\s*2\s*\)/ },
    { name: '~~(x * 100) / 100', re: /~~\([^\n;]*\*\s*100\s*\)\s*\/\s*100(?![\d.])/ },
  ];
  const POLICY_FILES = [join('common', 'money', 'rounding.ts'), join('common', 'money', 'allocation.ts'), join('lib', 'money.ts')];

  function offendersIn(root: string): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) { if (entry !== 'node_modules' && entry !== 'dist') walk(path); continue; }
        if (!/\.tsx?$/.test(entry) || /\.(spec|test)\.tsx?$/.test(entry)) continue;
        if (POLICY_FILES.some((p) => path.endsWith(p))) continue;
        // ⚠️ التعليقات تُجرَّد قبل الفحص. **وإلا صار شرحُ العطل عطلاً**: تعليقٌ
        // يقول «وكان هنا `Math.floor(...)`» يُقرأ مخالفةً، فيُدفع المؤلّف إلى
        // حذف الشرح لا إلى إصلاح الشيفرة. وهي عائلةُ «الحارس يقرأ حرفياته».
        const body = readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        for (const rule of RAW_ROUNDING) {
          const m = rule.re.exec(body);
          if (m) found.push(`${path.slice(REPO_ROOT.length + 1)} — ${rule.name}: ${m[0].slice(0, 60)}`);
        }
      }
    };
    walk(root);
    return found;
  }

  it('⓪ السطح غير فارغ — وإلا فالحارس يفحص العدم', () => {
    let files = 0;
    const count = (dir: string) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) { if (e !== 'node_modules') count(p); } else if (/\.tsx?$/.test(e)) files++; } };
    count(SRC_ROOT);
    count(WEB_ROOT);
    expect(files).toBeGreaterThan(200);
  });

  it('⭐ الخادم: لا Math.round(x*100)/100 ولا toFixed(2) خارج السياسة', () => {
    expect(offendersIn(SRC_ROOT)).toEqual([]);
  });

  it('⭐ الواجهة: لا Math.round(x*100)/100 ولا Number(x.toFixed(2)) خارج lib/money.ts', () => {
    expect(offendersIn(WEB_ROOT)).toEqual([]);
  });

  it('الأنماط تمسك ما يجب وتترك ما يجب — مُثبَتةٌ بحالتَين', () => {
    const hits = (s: string) => RAW_ROUNDING.filter((r) => r.re.test(s)).map((r) => r.name);
    const SHIFT = 'Math.round/floor/ceil/trunc(x * 100) / 100';
    expect(hits('const a = Math.round(x * 100) / 100;')).toEqual([SHIFT]);
    // الشكل الذي نجا سنةً: `floor` بدل `round` — علّةُ رقمٍ خاطئ في جدول الأقساط.
    expect(hits('const base = Math.floor((value / count) * 100) / 100;')).toEqual([SHIFT]);
    expect(hits('const a = Math.ceil(x * 100) / 100;')).toEqual([SHIFT]);
    expect(hits('const a = ~~(x * 100) / 100;')).toEqual(['~~(x * 100) / 100']);
    expect(hits('const a = Number((x - y).toFixed(2));')).toEqual(['Number(x.toFixed(2))', 'x.toFixed(2)']);
    expect(hits('`${n.toFixed(2)} ر.س`')).toEqual(['x.toFixed(2)']);
    expect(hits('Math.round((part / total) * 1000) / 10')).toEqual([]); // نسبةٌ مئوية لا مال
    expect(hits('Math.round(ms / 86400000)')).toEqual([]); // أيام
    expect(hits('(bytes / 1048576).toFixed(1)')).toEqual([]); // حجم ملف
    expect(hits('Math.round(amount * 1000) / 1000')).toEqual([]); // ثلاث خانات — ليس النمط المحروس (يُضاف حين يُرى)
  });
});
