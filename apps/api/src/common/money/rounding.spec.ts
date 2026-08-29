import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { roundTo, SCALE, type RoundingContext } from './rounding';

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
};

describe('سياسة التدوير — السلوك', () => {
  /**
   * ⚠️ **التوكيدان التاليان يثبّتان عيباً قائماً لا سلوكاً مرغوباً.**
   *
   * الموجة توحّد مكان التدوير ولا تغيّر ناتجه — فلو تغيّر أحدهما بلا قصد
   * سقط الاختبار وأعلن التغيير بدل أن يمرّ صامتاً في مبالغ فواتير.
   * وإصلاحهما موجةٌ مستقلة تكنس كل مواضع التدوير معاً، منها ملفّا ZATCA.
   */
  it('⚠️ عيبٌ مثبَّت: حدّ IEEE-754 يدوّر نزولاً — 1.005 تعطي 1.00 لا 1.01', () => {
    expect(roundTo(1.005, 'LINE_AMOUNT')).toBe(1);
    // ونفس ناتج التعريفات الأربعة التي حلّت الوحدة محلّها — لا انحراف.
    expect(roundTo(1.005, 'LINE_AMOUNT')).toBe(Math.round(1.005 * 100) / 100);
  });

  it('⚠️ عيبٌ مثبَّت: النصف السالب يُقرَّب نحو الصفر — الإشعار الدائن يخالف الفاتورة', () => {
    expect(roundTo(1.005, 'LINE_AMOUNT')).toBe(1);
    expect(roundTo(-1.005, 'LINE_AMOUNT')).toBe(-1);
    // ⟵ لاحظ: القيمتان متساويتان في المقدار ومختلفتان في اتجاه التقريب.
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
