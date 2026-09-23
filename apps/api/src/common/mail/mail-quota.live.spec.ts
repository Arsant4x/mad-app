import { LIVE_SPEC_TIMEOUT_MS } from '../../../test/live-spec-timeout';
import { PrismaService } from '../../prisma/prisma.service';
import { MailQuotaService } from './mail-quota.service';
import { mailQuotaCrossing } from './mail-quota.util';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * ⑬A1 (`ق-١٣٣٣`) — **عدّادُ البريد حيّاً على القاعدة**: نافذةُ «آخر أربعٍ وعشرين ساعة» وموضعٌ فريدٌ لكلِّ رسالة.
 *
 * **ولماذا حيّاً**: العدُّ زيادةٌ ذرّية بـ`INSERT … ON CONFLICT DO UPDATE … RETURNING` — **وقاعدةٌ تمسّ الزيادةَ
 * الذرّية لا يُثبتها إلا مسارٌ حيّ** (`§8.5`: «مكتوبة» ليست «تعمل»). فهذا الحارس:
 *   ① يُثبت النافذةَ المتحرّكة: دلوُ ما قبل أربعٍ وعشرين ساعة يخرج، ودلاءُ ما دونها تبقى.
 *   ② ⭐ يُثبت **الموضعَ الفريد تحت التزامن**: رسائلُ متزامنةٌ تأخذ مواضعَ مختلفة — **فالعبورُ يقع لرسالةٍ واحدة
 *      بالضبط**، لا لاثنتين ولا لصفر. (الصيغةُ الأولى جمعت النافذةَ بعد الزيادة فرأت رسالتان المجموعَ نفسَه.)
 *
 * **ساعاتٌ معزولة** في ماضٍ بعيدٍ عشوائيّ — فلا تلتقي بعدّ رسائلَ حقيقية ولا بتشغيلٍ آخر — **وتُزال في
 * `afterAll`**. حدُّه المعلَن: يشهد لقاعدة الاختبار ودورِ اتصالها، لا لقاعدة الإنتاج.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('⑬A1 — عدّادُ البريد حيّاً: نافذةُ ٢٤ ساعة وموضعٌ فريدٌ لكلِّ رسالة (ق-١٣٣٣)', () => {
  const prisma = new PrismaService();
  const quota = new MailQuotaService(prisma);
  // أوّلُ ساعةٍ في يومٍ عشوائيّ بين 1990 و2009 — بعيدٌ عن كلِّ عدٍّ حقيقيّ.
  const base = Date.UTC(1990 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27));
  const at = (hours: number, minutes = 0): Date => new Date(base + hours * 3_600_000 + minutes * 60_000);

  afterAll(async () => {
    const removed = await prisma.$executeRaw`DELETE FROM "mail_send_counts" WHERE "hour" >= ${at(-48)} AND "hour" <= ${at(400)}`;
    // مصادقةُ التنظيف: ما أُنشئ هنا يُزال هنا — ولا يبقى أثرٌ يُقرأ عدّاً في تشغيلٍ آخر.
    expect(removed).toBeGreaterThan(0);
    await prisma.$disconnect();
  });

  it('① النافذةُ متحرّكة: دلوُ ما قبل أربعٍ وعشرين ساعة يخرج، وما دونها يبقى', async () => {
    expect(await quota.recordSend(at(0, 5))).toEqual({ before: 0, after: 1 });
    expect(await quota.recordSend(at(0, 10))).toEqual({ before: 1, after: 2 });
    expect(await quota.recordSend(at(1, 5))).toEqual({ before: 2, after: 3 });
    // آخرُ دقيقةٍ في الساعة الثالثة والعشرين: النافذةُ من الساعة صفر — فالدلاءُ الثلاثة كلُّها فيها.
    expect(await quota.recordSend(at(23, 59))).toEqual({ before: 3, after: 4 });
    // أوّلُ الساعة الرابعة والعشرين: النافذةُ من الساعة الأولى — **فرسالتا الساعة صفر خرجتا**.
    expect(await quota.recordSend(at(24, 1))).toEqual({ before: 2, after: 3 });
  });

  it('⭐ ② رسائلُ متزامنةٌ تأخذ مواضعَ مختلفة — فالعبورُ يقع لرسالةٍ واحدة بالضبط', async () => {
    const N = 30;
    const results = await Promise.all(Array.from({ length: N }, () => quota.recordSend(at(100, 1))));
    const positions = results.map((r) => r.after).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    for (const r of results) expect(r.before).toBe(r.after - 1);

    // وبحدٍّ معلَنٍ عشرين: إنذارٌ واحدٌ عند السادسة عشرة (٨٠٪) وبلوغٌ واحدٌ عند العشرين — لا اثنان ولا صفر.
    const crossings = results.map((r) => mailQuotaCrossing(r.before, r.after, 20));
    expect(crossings.filter((c) => c === 'warn')).toHaveLength(1);
    expect(crossings.filter((c) => c === 'limit')).toHaveLength(1);
  });
});
