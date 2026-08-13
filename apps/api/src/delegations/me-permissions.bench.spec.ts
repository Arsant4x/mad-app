import { ALLOWED_SCREENS, SCREEN_ACTIONS } from '../templates/screens';
import { Grant, grant, buildTree } from './permission-tree';
import { effectiveGrants } from './intersection';
import { rootGrantsFrom } from './root-grants';
import { splitLastLink } from './extinguished';
import { DelegationRow, chainsFor } from './chain-source';

/**
 * قياس كلفة `GET /me/permissions` — **الحساب لا الشبكة**.
 *
 * الشرط: «قِس كلفتها قبل التعميم». وما يُقاس هنا هو الجزء **الجديد**: الطيّ
 * من الصفوف الخام إلى الحكم. أما قراءتا القاعدة (القالب + الصفوف) فتمرّان
 * بمعاملة سياق المستأجر — **وهي مدفوعة في كل طلبٍ أصلاً** (قِيست 4.4 ms،
 * CLAUDE.md §القياس)، فلا تضيفها هذه النقطة.
 *
 * ⚠️ ويطبع الأرقام الخام ولا يدّعي عتبة: العتبة تُقارَن بما دُفع فعلاً.
 */

/**
 * 500 × 10 عيّنات لا 2000 × 20.
 *
 * الأصل أخذ 225 ثانية في وظيفةٍ **مانعة** — ثمنٌ يُدفع في كل طلب دمج مقابل
 * رقمٍ لا يتغيّر. والميزانية الأخفّ تأخذ 18 ثانية.
 *
 * والأرقام المطلقة تتحرّك مع حِمل الآلة في الحالتين (قِيس المسار الكامل
 * 236 µs بالميزانية الثقيلة و263 µs بالخفيفة، والآلة مشغولة في الثانية).
 * وما لا يتحرّك هو **الخلاصة**: نسبةٌ من رقمٍ واحد بالمئة إلى نسبةٍ مضاعفة،
 * من كلفةٍ تُدفع أصلاً في كل طلب. وعليها بُني القرار لا على الرقم المطلق.
 */
const N = 500;
const SAMPLES = 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** µs لكل استدعاء. */
function measure(label: string, fn: () => unknown): number {
  for (let i = 0; i < 200; i++) fn(); // إحماء JIT
  const samples: number[] = [];
  for (let r = 0; r < SAMPLES; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1000 / N);
  }
  const us = median(samples);
  // eslint-disable-next-line no-console
  console.log(`  ${label.padEnd(52)} ${us.toFixed(2)} µs`);
  return us;
}

describe('كلفة `GET /me/permissions` — مقيسة لا مقدَّرة', () => {
  const FULL = rootGrantsFrom(true, [], null);

  it('يطبع الأرقام الخام لكل جزء', () => {
    // eslint-disable-next-line no-console
    console.log(`\n  ═══ ${ALLOWED_SCREENS.length} شاشة × ${SCREEN_ACTIONS.length} أفعال = ${FULL.size} زوجاً ═══`);

    measure('① اشتقاق السقف من القالب (168 زوجاً)', () => rootGrantsFrom(true, [], null));
    measure('① اشتقاق السقف — قالب مقيَّد', () => rootGrantsFrom(false, ['contracts', 'pos'], { contracts: ['view'] }));

    // سلسلة عمق 5 — أعمق مما يُتوقّع في منشأةٍ حقيقية.
    const deep: DelegationRow[] = [];
    let prev = 'owner';
    for (let i = 0; i < 5; i++) {
      const next = `u${i}`;
      deep.push({ grantorId: prev, granteeId: next, grants: [...FULL], state: 'ACTIVE' });
      prev = next;
    }
    measure('② طيّ الصفوف إلى مسارات (عمق 5)', () => chainsFor(deep, 'u4'));

    const [chain] = chainsFor(deep, 'u4');
    measure('③ التقاطع الكامل على السلسلة', () => effectiveGrants(FULL, chain));
    measure('④ فصل النافذ عن المنطفئ بأسبابه', () => splitLastLink(FULL, chain));
    measure('⑤ بناء الشجرة', () => buildTree());

    // المسار الكامل كما ينفّذه الطلب الواحد.
    const total = measure('⇒ الطلب الكامل (بلا قراءة القاعدة)', () => {
      const root = rootGrantsFrom(true, [], null);
      const chains = chainsFor(deep, 'u4');
      const eff = new Set<Grant>();
      for (const c of chains) for (const g of effectiveGrants(root, c)) eff.add(g);
      for (const c of chains) splitLastLink(root, c);
      return buildTree().length + eff.size;
    });

    // eslint-disable-next-line no-console
    console.log(`\n  ⇒ نسبةً إلى معاملة سياق المستأجر (4.4 ms) المدفوعة أصلاً: ${((total / 4400) * 100).toFixed(2)}%\n`);

    // الحارس الوحيد: أن يكون القياس قد جرى فعلاً. العتبة قرارُ المالك لا
    // قرار الاختبار — واختبارٌ يفرض رقماً يسقط على آلةٍ أبطأ بلا عطلٍ حقيقي.
    expect(total).toBeGreaterThan(0);
  });

  it('⭐ الحساب لا يتضخّم بالعمق — التقاطع لا يُنمّي', () => {
    // لو تضخّم أُسّياً لصارت الذاكرة المؤقتة ضرورةً — وهي محظورة (الملحق 1).
    // فالقياس هنا يحمي القرار لا الأداء وحده.
    /**
     * ⚠️ **الأصغر** لا الوسيط.
     *
     * الوسيط يقيس «الحالة النمطية بما فيها المقاطعات»، وهو ما نريده لتقدير
     * الكلفة الواقعية. أما هنا فالمقارنة **بين** قياسين، وضجيجٌ يصيب أحدهما
     * دون الآخر يفسد النسبة وحدها. والأصغر أقلّ العيّنات تلوّثاً بمقاطعةٍ
     * أو جمع مهملات — فهو التقدير الأمتن لعلاقةٍ بين رقمين على آلةٍ مشتركة
     * كآلة السير.
     */
    const at = (depth: number): number => {
      const rows: DelegationRow[] = [];
      let prev = 'owner';
      for (let i = 0; i < depth; i++) {
        rows.push({ grantorId: prev, granteeId: `u${i}`, grants: [...FULL], state: 'ACTIVE' });
        prev = `u${i}`;
      }
      const leaf = `u${depth - 1}`;
      for (let i = 0; i < 200; i++) chainsFor(rows, leaf);
      let best = Infinity;
      for (let r = 0; r < SAMPLES; r++) {
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < 300; i++) {
          const [c] = chainsFor(rows, leaf);
          effectiveGrants(FULL, c);
        }
        best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1000 / 300);
      }
      return best;
    };
    const d2 = at(2);
    const d10 = at(10);
    // eslint-disable-next-line no-console
    console.log(`\n  عمق 2: ${d2.toFixed(2)} µs · عمق 10: ${d10.toFixed(2)} µs · النسبة ×${(d10 / d2).toFixed(1)}\n`);
    // خطّي: خمسة أضعاف العمق ⇒ أقلّ من عشرين ضعف الزمن. الأُسّي يتجاوزها
    // بمراحل، والهامش واسعٌ كي لا يسقط الاختبار على آلةٍ مشغولة.
    expect(d10 / d2).toBeLessThan(20);
  });

  it('يوثّق أثقل حالة واقعية: 168 زوجاً على عمق 10', () => {
    const rows: DelegationRow[] = [];
    let prev = 'owner';
    for (let i = 0; i < 10; i++) {
      rows.push({ grantorId: prev, granteeId: `u${i}`, grants: [...FULL], state: 'ACTIVE' });
      prev = `u${i}`;
    }
    const us = measure('⇒ الأثقل: 168 زوجاً × عمق 10، المسار الكامل', () => {
      const root = rootGrantsFrom(true, [], null);
      const chains = chainsFor(rows, 'u9');
      const eff = new Set<Grant>();
      for (const c of chains) for (const g of effectiveGrants(root, c)) eff.add(g);
      for (const c of chains) splitLastLink(root, c);
      return buildTree();
    });
    // eslint-disable-next-line no-console
    console.log(`  ⇒ ${((us / 4400) * 100).toFixed(2)}% من معاملة سياق المستأجر\n`);
    expect(us).toBeGreaterThan(0);
  });
});
