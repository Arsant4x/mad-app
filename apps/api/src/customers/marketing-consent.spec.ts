import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripComments, stripCommentsAndStrings } from '../common/source-scan.util';
import { CONSENT_SOURCES, ConsentEvent, MARKETING_CHANNELS, latestEvent, marketingState, mayReceiveMarketing } from './marketing-consent.util';

/**
 * **بوّابةُ الإرسال التسويقيّ: حكمٌ واحد لا يُعاد حسابُه** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * قسمان: **سلوكُ البوّابة** (وقائعُ مصنوعةٌ هنا لا صفوفٌ من قاعدة) · **وحارسٌ يمنع أن
 * يقرّر أحدٌ خارجَها** — فمُرسِلٌ يقارن الحقولَ بيده يخطئ في حالةٍ واحدة (رجوعٌ بعد موافقة،
 * أو قناةٌ غيرُ التي وافق عليها) **والخطأُ رسالةٌ خرجت ولا تُستردّ**.
 */
const SRC = join(__dirname, '..');
const GATE = join(__dirname, 'marketing-consent.util.ts');

const ev = (channel: string, granted: boolean, at: string, createdAt = at): ConsentEvent => ({ channel, granted, at: new Date(at), createdAt: new Date(createdAt) });

/**
 * **من يقرأ جدولَ الموافقات يقرّر بالبوّابة** — بحثاً عن `<x>.marketingConsent` في شيفرةٍ
 * مجرَّدةٍ من التعليقات والسلاسل (`§8.24`: حارسٌ يعاقب على التوثيق يُنتج شيفرةً صامتة).
 */
export function decidesOutsideGate(files: readonly { path: string; source: string }[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    // ⚠️ **مُجرِّدان لا واحد**: قراءةُ الجدول تُقرأ على نصٍّ بلا سلاسل (فمثالٌ في سلسلةٍ ليس
    //    قراءة)، **ومسارُ الاستيراد نفسُه سلسلة** — فيُقرأ على نصٍّ جُرِّدت تعليقاتُه وحدَها.
    //    (أوّلُ صياغةٍ جرّدت الاثنين فأدانت الملفَّ الوحيد الذي يستورد البوّابة فعلاً.)
    const readsTable = /\.marketingConsent\s*\./.test(stripCommentsAndStrings(f.source));
    const usesGate = /from\s+['"][^'"]*marketing-consent\.util['"]/.test(stripComments(f.source));
    if (readsTable && !usesGate) out.push(f.path);
  }
  return out;
}

describe('الموافقةُ التسويقية — البوّابةُ وحكمُها (ق-١٣٠٣ · ك/⑰A1)', () => {
  it('⭐ ① لا واقعةَ = لا إرسال — فالصمتُ ليس موافقة (النظام م٢٥)', () => {
    expect(mayReceiveMarketing([], 'SMS')).toEqual({ allowed: false, reason: 'NEVER_GRANTED' });
  });

  it('② موافقةٌ تُجيز قناتَها وحدَها — ولكلِّ قناةٍ خيارُها (اللائحة م٢٨/٢)', () => {
    const events = [ev('SMS', true, '2026-09-01')];
    expect(mayReceiveMarketing(events, 'SMS').allowed).toBe(true);
    expect(mayReceiveMarketing(events, 'EMAIL')).toEqual({ allowed: false, reason: 'NEVER_GRANTED' });
  });

  it('🔴 ③ والرجوعُ يغلب ما قبله — في أيّ وقت (النظام م٥/٢)', () => {
    const events = [ev('SMS', true, '2026-09-01'), ev('SMS', false, '2026-09-10')];
    expect(mayReceiveMarketing(events, 'SMS')).toEqual({ allowed: false, reason: 'WITHDRAWN', at: new Date('2026-09-10') });
  });

  it('④ وموافقةٌ بعد رجوعٍ تُجيز من جديد — فالرجوعُ ليس حظراً أبدياً', () => {
    const events = [ev('SMS', true, '2026-09-01'), ev('SMS', false, '2026-09-10'), ev('SMS', true, '2026-09-20')];
    expect(mayReceiveMarketing(events, 'SMS').allowed).toBe(true);
  });

  it('⑤ والتساوي في اليوم يُفصَل بترتيب التسجيل — وهو الأقربُ إلى ما وقع', () => {
    const same = '2026-09-05T00:00:00.000Z';
    const events = [ev('SMS', true, same, '2026-09-05T09:00:00.000Z'), ev('SMS', false, same, '2026-09-05T11:00:00.000Z')];
    expect(mayReceiveMarketing(events, 'SMS').allowed).toBe(false);
    // والترتيبُ في المصفوفة لا يغيّر الحكم — فالقراءةُ قد تعود بأيّ ترتيب.
    expect(mayReceiveMarketing([...events].reverse(), 'SMS').allowed).toBe(false);
  });

  it('⑥ والحالةُ تُعلن كلَّ قناةٍ صراحةً — فقناةٌ لم تُذكر تظهر «لا» لا فراغاً', () => {
    const state = marketingState([ev('EMAIL', true, '2026-09-01')]);
    expect(Object.keys(state).sort()).toEqual([...MARKETING_CHANNELS].sort());
    expect(state.EMAIL.allowed).toBe(true);
    expect(state.SMS.allowed).toBe(false);
  });

  it('⑦ وواقعةُ قناةٍ أخرى لا تُقرأ لهذه — `latestEvent` يرشّح بالقناة', () => {
    expect(latestEvent([ev('EMAIL', true, '2026-09-20')], 'SMS')).toBeNull();
  });

  it('⑧ والكتالوجان غيرُ فارغين ولا يتقاطعان — فمجسٌّ على قائمةٍ خاوية لا يشهد بشيء', () => {
    expect(MARKETING_CHANNELS.length).toBeGreaterThanOrEqual(3);
    expect(CONSENT_SOURCES.length).toBeGreaterThanOrEqual(4);
    expect(MARKETING_CHANNELS.filter((c) => (CONSENT_SOURCES as readonly string[]).includes(c))).toEqual([]);
  });

  describe('🔴 وحارسٌ يمنع أن يقرّر أحدٌ خارج البوّابة', () => {
    const files = sourceFiles(SRC)
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && p !== GATE)
      .map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), source: readFileSync(p, 'utf8') }));

    it('⓪ السطحُ غيرُ فارغ — والملفُّ الذي يقرأ الجدولَ اليوم موجودٌ فيه', () => {
      expect(files.length).toBeGreaterThan(200);
      expect(files.some((f) => f.path === 'customers/customers.service.ts')).toBe(true);
    });

    it('🔴 لا ملفَّ يقرأ جدولَ الموافقات بلا البوّابة', () => {
      expect(decidesOutsideGate(files)).toEqual([]);
    });

    it('🔴 والمُكتشِفُ مُثبَتٌ بحالتَين على نصٍّ مصنوعٍ هنا', () => {
      const withoutGate = { path: 'x/sender.ts', source: 'const rows = await tx.marketingConsent.findMany({}); if (rows[0].granted) send();' };
      expect(decidesOutsideGate([withoutGate])).toEqual(['x/sender.ts']);

      const withGate = { path: 'x/sender.ts', source: "import { mayReceiveMarketing } from '../customers/marketing-consent.util';\nconst rows = await tx.marketingConsent.findMany({});" };
      expect(decidesOutsideGate([withGate])).toEqual([]);

      // ⚠️ ونصٌّ داخل سلسلةٍ أو تعليقٍ ليس قراءة (`§8.24`) — وإلا أدان الحارسُ توثيقَه.
      const inComment = { path: 'x/doc.ts', source: '// مثال: tx.marketingConsent.findMany\nconst s = "tx.marketingConsent.findMany";' };
      expect(decidesOutsideGate([inComment])).toEqual([]);
    });
  });
});
