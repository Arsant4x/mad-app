import { PrismaClient } from '@mad-app/db';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * `ق-٧٠٧` — **دورُ التطبيق يخطّط لكلّ تنفيذٍ خطّةً مخصَّصة: `plan_cache_mode = force_custom_plan` — مقروءاً من القاعدة.**
 *
 * الواقعة (`ق-٧٠٤` · 2026-09-13): عبارةٌ واحدة في ميزان المراجعة والتدفّق النقديّ تستغرق بالخطّة
 * المخصَّصة `10 ms` وبالخطّة العامّة — التي تبلغها ذاكرةُ عبارات Prisma بعد خمس تنفيذات — `36,679 ms`
 * (`Nested Loop` · `86,092,441` صفّاً مرفوضاً): المخطِّطُ لا يرى انتقائيةَ معلمة المنشأة في الخطّة
 * العامّة. **وتحت عزل الصفوف كلُّ عبارةٍ تحمل `"companyId" = current_setting(…)` مرشَّحةٌ لها.**
 *
 * العلاجُ إعدادٌ على الدور في هجرة (`20260914100000_plan_cache_mode_custom`) — **وإعدادٌ غيرُ مرئيٍّ
 * بلا حارسٍ يُزال بعد سنةٍ بحسن نيّة** (قرار المالك — التوجيه ١٥٤: «حارسٌ يقرأ الإعدادَ من القاعدة
 * ويسقط إن زال — كما في `FORCE RLS`»). فهذا الحارس:
 *   ① يقرأ القيمةَ الفعّالة على جلسة التطبيق نفسِها (`SHOW`) — لا ملفَّ إعدادٍ ولا هجرةً.
 *   ② ويقرأ ثباتَها على الدور (`pg_roles.rolconfig`) — فـ`SET` في جلسةٍ عابرة لا يكفي.
 *   ③ ويُثبت المجسَّ بحالتين: `SET LOCAL … auto` داخل معاملةٍ تُرجَع يجب أن يقرأه `SHOW` `auto`.
 *
 * **حدُّه المعلَن**: يشهد لدور الاتصال الذي يعمل به الاختبار (وهو دورُ التطبيق في التركيب) — لا لدورٍ آخر.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;
const MIGRATION = join(__dirname, '..', '..', 'prisma', 'migrations', '20260914100000_plan_cache_mode_custom', 'migration.sql');

d('خطّةٌ مخصَّصة لكلّ تنفيذ — plan_cache_mode = force_custom_plan على دور التطبيق (ق-٧٠٧)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('الهجرةُ موجودةٌ وتحمل سببَها — لا إعدادَ بلا حجّةٍ مكتوبة', () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/ALTER ROLE CURRENT_USER SET plan_cache_mode = 'force_custom_plan'/);
    expect(sql).toMatch(/ق-٧٠٧/);
    expect(sql).toMatch(/36,679 ms/); // الرقمُ المقيس الذي يبرّر الإعداد — يبقى في نصّه
  });

  it('⭐ ① القيمةُ الفعّالة على جلسة التطبيق: force_custom_plan', async () => {
    const rows = await prisma.$queryRaw<{ plan_cache_mode: string }[]>`SHOW plan_cache_mode`;
    expect(rows[0]?.plan_cache_mode).toBe('force_custom_plan');
  });

  it('⭐ ② ثابتةٌ على الدور لا على الجلسة: pg_roles.rolconfig يحملها', async () => {
    const rows = await prisma.$queryRaw<{ rolname: string; rolconfig: string[] | null }[]>`
      SELECT rolname, rolconfig FROM pg_roles WHERE rolname = current_user`;
    expect(rows).toHaveLength(1);
    expect(rows[0].rolconfig ?? []).toEqual(expect.arrayContaining(['plan_cache_mode=force_custom_plan']));
  });

  // ⭐ الإثباتُ العكسيّ مبنيٌّ في الحارس: مجسٌّ يقرأ الثابتَ دائماً لا يشهد بشيء.
  it('المجسُّ مُثبَتٌ بحالتين: SET LOCAL auto داخل معاملةٍ تُرجَع يقرؤه SHOW auto — ثم تعود القيمةُ الثابتة', async () => {
    const inside = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL plan_cache_mode = auto`;
      const r = await tx.$queryRaw<{ plan_cache_mode: string }[]>`SHOW plan_cache_mode`;
      return r[0]?.plan_cache_mode;
    });
    expect(inside).toBe('auto');
    const after = await prisma.$queryRaw<{ plan_cache_mode: string }[]>`SHOW plan_cache_mode`;
    expect(after[0]?.plan_cache_mode).toBe('force_custom_plan');
  });
});
