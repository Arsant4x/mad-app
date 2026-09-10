import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripCommentsAndStrings } from './source-scan.util';

/**
 * **فرعٌ يأتي من الطلب يمرّ بـ`resolveBranchId`** (`ق-٥١٢`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * `resolveBranchId` يفعل شيئَين: **يتحقّق أن الفرعَ موجود**، **ثم أنه من فروع
 * المستخدم** (`assertBranchAllowed`). **وخدمةٌ تكتفي بالأوّل تكتب فرعاً لا
 * يملكه صاحبُ الطلب** — **ولا يُكشَف بالاستعمال**: الصفُّ يبدو سليماً لمن يراه،
 * **ويظهر أثرُه في تقريرٍ بالفرع بعد شهور**.
 *
 * **والمقيس** (2026-09-11): **ثمانيةُ `DTO` تقبل فرعاً** · **وتسعُ خدماتٍ
 * تتحقّق** · **وموضعان كانا يكتبان الفرعَ كما وصل**: فتحُ مناوبةٍ في نقطة
 * البيع، وإنشاءُ عرض سعر. **وثالثٌ بدا ثغرةً وليس**: إنشاءُ الدرج **مغلقٌ على
 * مالك المنشأة ونطاقُه `all`**.
 *
 * ── فالحارسُ يقرأ الشكل ───────────────────────────────────────────────────
 *
 * **كتابةُ `branchId` من `dto` في ملفٍّ لا يستدعي `resolveBranchId`** — تُدان
 * باسم الملفّ. **مشتقٌّ من الشجرة لا من قائمةِ خدمات**، فخدمةٌ تُكتب غداً تدخل
 * الحراسةَ بلا لمس هذا الملفّ.
 *
 * ── حدّاه المعلَنان ───────────────────────────────────────────────────────
 *
 * ⚠️ **① يقرأ الكودَ المفرَّغ من النصوص والتعليقات** — **فمثالٌ في شرحٍ لا
 * يُدان** (`ق-٣٣١`). **ويُعلن صنفَه** بذلك (`ق-٣٧٥`).
 *
 * ⚠️ **② ويحرس الكتابةَ لا القراءة**: مرشِّحُ قراءةٍ بفرعٍ من الطلب
 * (`where: { branchId: dto.branchId }`) **لا يكتب صفّاً** — **وحمايتُه أن
 * الكتابةَ قبله تحقّقت**. **فمن أراد حراسةَ القراءة يقيسها في مكانٍ آخر.**
 */
const SRC = join(__dirname, '..');

/** كتابةُ الفرع من الطلب — `branchId: dto.…` داخل كائنِ بيانات. */
export const WRITES_BRANCH_FROM_DTO = /\bbranchId\s*:\s*dto\b/;

/** الملفُّ يمرّ بالمصدر الواحد. */
export const USES_RESOLVER = /\bresolveBranchId\s*\(/;

/**
 * ⚠️ **ولا استثناءَ «الملفُّ يستدعي المُحلِّل»** — **وقد كُتب أوّلَ مرّةٍ كذلك
 * ثم رُفض**: **ملفٌّ فيه استدعاءٌ واحدٌ صحيح يُخفي كتابةً خاماً ثانية** —
 * **وهو مفتاحٌ ضعيفٌ بسطح الملفّ** من عائلة `ق-٤٩٧`.
 *
 * ⇒ **فالقاعدةُ مطلقة: صفرُ كتابةٍ خام** — **والشكلُ الصحيح متغيّرٌ محلولٌ
 * لا حقلُ طلب**. **وقد بلغتها الشجرةُ فعلاً**، فالحدُّ ليس طموحاً بل واقعاً.
 */
export function offenders(root = SRC): string[] {
  const out: string[] = [];
  for (const file of sourceFiles(root)) {
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    if (WRITES_BRANCH_FROM_DTO.test(code)) out.push(relative(SRC, file).replace(/\\/g, '/'));
  }
  return out;
}

describe('فرعٌ من الطلب يمرّ بالمصدر الواحد (ق-٥١٢)', () => {
  it('🔴 لا خدمةَ تكتب فرعاً من الطلب بلا `resolveBranchId`', () => {
    const bad = offenders();
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ملفّاتٌ تكتب \`branchId\` من الطلب مباشرةً: ${bad.join(' · ')}`,
          '',
          'وفحصُ وجودِ الفرع لا يكفي — فالمطلوب أنه من فروع صاحب الطلب.',
          'مرّره بـ`resolveBranchId(tx, dto.branchId, allowedBranchIds)` واكتب ما يعيده.',
          '',
          '⚠️ ولا يكفي أن يستدعيه الملفُّ في موضعٍ آخر: استدعاءٌ صحيحٌ واحد',
          '   يُخفي كتابةً خاماً ثانية — فالقاعدةُ مطلقة، والشكلُ متغيّرٌ محلول.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('⓪ السطحُ غيرُ فارغ — والمصدرُ الواحد مستعمَلٌ فعلاً', () => {
    // مجسٌّ للمجسّ: صفرُ مستعملين يعني أن القراءةَ أخفقت لا أن الفرعَ لا يُحرَس.
    const users = sourceFiles(SRC).filter((f) => USES_RESOLVER.test(stripCommentsAndStrings(readFileSync(f, 'utf8'))));
    expect(users.length).toBeGreaterThanOrEqual(8);
  });

  it('🔴 والمُكتشِفان مُثبَتان بحالتَين: يُدينان الكتابةَ الخام ويتركان الممرَّرة', () => {
    const raw = 'await tx.quote.create({ data: { branchId: dto.branchId } });';
    const checked = ['const branchId = await resolveBranchId(tx, dto.branchId, allowed);', 'await tx.quote.create({ data: { branchId } });'].join('\n');

    expect(WRITES_BRANCH_FROM_DTO.test(raw)).toBe(true);
    expect(USES_RESOLVER.test(raw)).toBe(false);
    expect(USES_RESOLVER.test(checked)).toBe(true);
    expect(WRITES_BRANCH_FROM_DTO.test(checked)).toBe(false);
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ', () => {
    const commented = '// كان هنا branchId: dto.branchId قبل الإصلاح';
    expect(WRITES_BRANCH_FROM_DTO.test(stripCommentsAndStrings(commented))).toBe(false);
  });
});
