import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@mad-app/db';
import { clientDrift, clientModels, schemaModels } from '../../test/prisma-client-fingerprint';
import { relativeCost, relativeCostVerdict } from './relative-cost.util';
import { readsDeclaredStrings } from './source-scan.util';

/**
 * **بصمةُ عميل Prisma — مُثبَتةٌ في الاتجاهين** (`ق-٤١٧` · `ق-٤١٨`).
 *
 * ⚠️ **والصياغةُ منقولةٌ عن المخطّط الحقيقيّ لا مؤلَّفة** (`ق-٤١٨`): **العيّنةُ
 * المؤلَّفة أنظفُ من الواقع فتُخفي ما يكسره** — **وقد وقع ذلك في اليوم نفسه**:
 * عادُّ بلاغاتٍ مرّ بخمس حالاتٍ مصنوعة **وهو أعمى**، لأن أُطُرَه لم تحمل السطرَ
 * الذي يبدأ به الأثرُ الحقيقيّ. **فالمقاطعُ هنا مقتطعةٌ من `schema.prisma`.**
 */
const SCHEMA_PATH = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
const SCHEMA = readFileSync(SCHEMA_PATH, 'utf8');

/** مُدخَلُ المرجع — **ملفٌّ لا صلةَ له بـPrisma ولا بالمخطّط**، وحجمُه من حجمه. */
const MESSAGES_PATH = join(__dirname, 'i18n', 'messages.ts');

/**
 * **السقفُ النسبيّ — رقمٌ لا وصف** (شرطُ المالك ②).
 *
 * **والاختيارُ مقيس** (2026-09-10): المخطّطُ **١٦٨ ك.ب** وملفُّ الرسائل **٦٩
 * ك.ب** — **فالنسبةُ الطبيعية تدور حول اثنين إلى ثلاثة** بحكم الحجم والعمل.
 * **وستّةٌ تترك ضعفَي هامشٍ للتذبذب** — **وتمسك تدهوراً يضاعف الكلفة**، وهو
 * أقلُّ تدهورٍ يستحقّ أن يُسأل عنه.
 *
 * ⚠️ **ولا يُرفع حين يسقط**: **سقوطُه دعوى** — إمّا أن البصمة تدهورت، **أو أن
 * المرجعَ لم يعد من جنسها** (ملفُّ الرسائل انكمش مثلاً). **وكلاهما يُقرأ لا
 * يُسكَت عنه.**
 */
const MAX_FINGERPRINT_RATIO = 6;

describe('بصمةُ العميل — تُدين النقصَ وتترك الزيادة', () => {
  it('🔴 حقلٌ في المخطّط لا يعرفه العميل يُدان **باسمه**', () => {
    // ⚠️ **مقطعٌ منقولٌ عن المخطّط** — بترتيبه ومسافاته كما هي.
    const real = ['model Company {', '  id                   String  @id @default(uuid())', '  creditLimitHardBlock Boolean @default(false)', '}'].join('\n');
    const schema = schemaModels(real);
    const client = new Map([['Company', new Set(['id'])]]);
    // **الاسمُ يُقرأ من المخرَج** — فبلاغٌ يقول «تفاوت» لا يُنهي البحث.
    expect(clientDrift(schema, client)).toEqual(['Company.creditLimitHardBlock']);
  });

  it('🔴 ونموذجٌ كاملٌ لا يعرفه العميل يُدان باسمه', () => {
    const schema = schemaModels(['model Invoice {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map())).toEqual(['Invoice']);
  });

  it('🔴 والزيادةُ تُترك — فعميلٌ أحدثُ لا يُسقط فرعاً سليماً', () => {
    // **الاتجاهُ واحدٌ عمداً**: حقلٌ ناقصٌ يكسر، وزائدٌ لا يكسر — **وإدانةُ
    //  الاتجاهين تُسقط الحزمةَ على فرعٍ سليمٍ متأخّر**، وهو ضجيجٌ يُعطَّل.
    const schema = schemaModels(['model Company {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map([['Company', new Set(['id', 'fieldFromANewerBranch'])]]))).toEqual([]);
  });

  it('🔴 والتعليقاتُ لا تُقرأ حقولاً — وإلا أدان المخطّطَ بشرحه', () => {
    // ⚠️ **الصياغةُ الواقعية**: تعليقُ `///` فوق الحقل، وهو النمطُ الغالب هنا.
    const real = ['model Company {', '  /// حدُّ الائتمان — شرحٌ لا حقل', '  id String @id', '}'].join('\n');
    expect(schemaModels(real).get('Company')).toEqual(new Set(['id']));
  });

  it('⭐ والشجرةُ كما هي: العميلُ يعرف كلَّ ما يعلنه المخطّط', () => {
    // **وهذه هي الحالةُ السالبة على الواقع**: لو أدانت شيئاً هنا لكان الحارسُ
    // نفسُه معطوباً — **فخضرتُها شرطُ تصديقِ حمرتِها**.
    expect(clientDrift(schemaModels(SCHEMA), clientModels(Prisma.dmmf))).toEqual([]);
  });

  describe('🔬 وكلفتُه مقيسةٌ نسبةً إلى مرجعٍ في التشغيل نفسه (ق-٤٨٨)', () => {
    /**
     * **الموضوع**: البصمةُ كاملةً — قراءةُ المخطّط، واشتقاقُ نماذجه، ومقارنتُها
     * بنماذج العميل. **وهي ما يُشغَّل فعلاً مرّةً لكلّ عملية `jest`.**
     */
    const fingerprint = () => clientDrift(schemaModels(readFileSync(SCHEMA_PATH, 'utf8')), clientModels(Prisma.dmmf));

    /**
     * **والمرجعُ من الجنس نفسه ولا صلةَ له بالبصمة** (شرطُ المالك ①): **قراءةُ
     * ملفٍّ من القرص ثم بناءُ خريطةِ مطابقاتٍ منه** — وهو ما تفعله البصمة
     * بالضبط، **على مُدخَلٍ لا يمسّ Prisma ولا المخطّط**: ملفُّ الرسائل.
     *
     * ⚠️ **ولا رقمَ محفوظٌ من تشغيلٍ سابق**: **محفوظٌ يعيدنا إلى السقف المطلق
     * من بابٍ آخر** — فيُقاس المرجعُ في التشغيل عينه وبالتناوب.
     */
    const reference = () => {
      // ⚠️ **إعلانُ الصنف** (`ق-٣٧٥`): **يقرأ نصّاً عمداً لا كوداً** — فليس
      // يبحث عن نمطٍ برمجيّ يُدين به أحداً، **بل يؤدّي شغلاً من جنس البصمة
      // على مُدخَلٍ لا صلةَ له بها**. **والتجريدُ هنا يُنقص الشغلَ فيُفسد
      // المرجع** — وهو مقياسُ كلفةٍ لا حارس.
      readsDeclaredStrings();
      const text = readFileSync(MESSAGES_PATH, 'utf8');
      const map = new Map<string, Set<string>>();
      for (const m of text.matchAll(/\b([a-z_][a-z0-9_]*)\s*:\s*'([^']*)'/gi)) {
        if (!map.has(m[1])) map.set(m[1], new Set());
        map.get(m[1])!.add(m[2]);
      }
      return map;
    };

    it('🔴 البصمةُ رخيصةٌ نسبةً إلى ما حولها', () => {
      const cost = relativeCost(fingerprint, reference, 10);
      // eslint-disable-next-line no-console
      console.log(
        `\n▶ كلفةُ البصمة: ${cost.subjectMs.toFixed(1)} م.ث · والمرجع ${cost.referenceMs.toFixed(1)} م.ث ⇒ ${cost.ratio.toFixed(1)}× (السقف ${MAX_FINGERPRINT_RATIO}×)\n`,
      );
      // **الحكمُ بوجهه** (`ق-٤٩٠`): من يراه أحمرَ بعد شهرٍ يقرأ الرسالة لا
      // السجل — **وأسهلُ ما يفعله حينها أسوأُ ما يفعله**.
      const verdict = relativeCostVerdict(cost, MAX_FINGERPRINT_RATIO, 'كلفةُ بصمة العميل', 'مرجعٌ من جنسها');
      if (verdict) throw new Error(verdict);
      expect(cost.ratio).toBeLessThan(MAX_FINGERPRINT_RATIO);
    });

    it('🔴 ومُثبَتةٌ بالعكس: بصمةٌ أُبطئت عمداً تُسقط التأكيد', () => {
      /**
       * ── صياغتان سقطتا قبل هذه، وكلتاهما درسٌ ──────────────────────────
       *
       * **① إبطاءٌ بخمسين ملّي ثانية ثابتة** — مرّ هدوءاً **وسقط تحت الحِمل**:
       * **المرجعُ نفسُه صار ٣٩ م.ث** (من ١٫٦). **مقدارٌ مطلقٌ في مقياسٍ نسبيّ
       * — وهو الداءُ الذي بُني المقياسُ لإزالته** (`ق-٤٨٩`).
       *
       * **② ثم إبطاءٌ بتكرار المرجع ثمانيَ مرّات** — مرّ محلياً **وسقط في
       * السير**: `4.48` والسقفُ `6`. **والحسابُ كان يقول «ثمانيةٌ حتماً»** —
       * **وأخطأ لأن ثماني قراءاتٍ متتابعةٍ لملفٍّ واحد أرخصُ من قراءةٍ
       * منفردة**: الذاكرةُ الوسيطة للقرص، والمُطابِقُ محمَّى. **فالتكرارُ لا
       * يضرب الكلفةَ في عدده.**
       *
       * ⇒ **③ فالإبطاءُ تكرارُ الموضوع نفسِه** — **والنسبةُ تصير عددَ
       * التكرارات مضروباً في نسبةِ الموضوع إلى المرجع**. **وعشرون تكراراً
       * تتجاوز ستّةً ما دامت النسبةُ فوق `0.3`** — **والمقيسُ يدور حول اثنين**،
       * **فالهامشُ سبعةُ أضعاف**. ⚠️ **والتحمية تُصيب الموضوعَ هنا كما تصيب
       * المرجعَ هناك — فلا يبقى طرفٌ يستفيد وحده.**
       */
      const SLOWDOWN_REPEATS = 20;
      const slowed = () => {
        for (let i = 0; i < SLOWDOWN_REPEATS; i++) fingerprint();
      };
      const cost = relativeCost(slowed, reference, 3);
      expect(cost.ratio).toBeGreaterThanOrEqual(MAX_FINGERPRINT_RATIO);
    });
  });
});
