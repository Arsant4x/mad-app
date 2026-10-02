import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * (ج) `ق-١٩٢` · `ق-٢٠١` — **حارسٌ يقرأ المصدر**: وقائعُ الانقطاع تُستنتَج على الخادم
 * من **أزمنة الرنّ**، بحدٍّ هو **إعدادُ المنشأة لا ثابتٌ في الكود**، ويُعرَض في التقرير.
 *
 * ما يحرسه بعينه:
 * - عودةُ ثابتٍ للحدّ (`120_000`، `GAP_MS = …`) — فيصير الحكم «دقيقتان» قيداً لا إعداداً.
 * - استبدالُ نافذة الرنّ بـ«آخر واقعة» (`findFirst … desc`) — فتُفترَض المزامنة مرتّبةً
 *   وقد نهى التوجيه: «قِسه ولا تفترض ترتيباً».
 * - حذفُ الواقعة المدموجة قبل إعادة بيوعها — فتنفصل الفواتير عن كل واقعة (`SetNull`).
 * - سقوطُ الاستنتاج يُسقط البيع — والبيعُ التزم قبله.
 * - جدولُ الوقائع بلا الطبقة الثانية (`FORCE ROW LEVEL SECURITY`) أو خارج قائمة النطاق.
 */
describe('(ج) وقائعُ الانقطاع — الحدُّ إعدادٌ والنافذةُ من الرنّ', () => {
  const api = join(__dirname, '..', '..');
  /** الكود بلا تعليقاته — كي لا يُحسب مثالٌ مكتوب في تعليقٍ عودةً للعطل. */
  const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const service = codeOnly(readFileSync(join(__dirname, 'pos.service.ts'), 'utf8'));

  it('🔴 الحدّ يُقرأ من إعداد المنشأة — ولا ثابتَ دقائقٍ في الخدمة', () => {
    expect(service.length).toBeGreaterThan(5000); // قراءةٌ فاشلة تُسقط ولا تمرّ
    expect(service).toContain('select: { posOfflineGapMinutes: true }');
    expect(service).toContain('company.posOfflineGapMinutes * 60_000');
    expect(service).not.toMatch(/\b(120_000|120000)\b/);
    expect(service).not.toMatch(/[Gg][Aa][Pp]\w*\s*=\s*\d/);
  });

  it('🔴 النافذة من زمن الرنّ — تقاطعٌ على [الرنّ − الحدّ، الرنّ + الحدّ] لا «آخر واقعة»', () => {
    // نطاق الاستنتاج وحده — فالتقرير يرتّب تنازلياً وذلك مشروع.
    const from = service.indexOf('private async recordOfflineIncident(');
    // نهايةُ النطاق رأسُ التقرير — وصار يأخذ فروعَ القارئ (توجيه ٢٧٥ · ق-١٥٨١).
    const to = service.indexOf('listIncidents(companyId: string, allowedBranchIds');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const inference = service.slice(from, to);
    // التزامن: القفل الاستشاريّ على المنشأة يسبق القراءة — وإلا أنشأت المزامناتُ المتزامنة وقائعَ مكرّرة.
    const lock = inference.indexOf("pg_advisory_xact_lock(hashtext(${'pos_offline_incident:' + companyId}))");
    expect(lock).toBeGreaterThan(-1);
    expect(inference.indexOf('posOfflineIncident.findMany')).toBeGreaterThan(lock);
    expect(inference).toContain('const ringAt = new Date(ringAtIso)');
    expect(inference).toContain('startedAt: { lte: hi }, endedAt: { gte: lo }');
    expect(inference).not.toMatch(/findFirst/);
    expect(inference).not.toMatch(/'desc'|take: 1\b/);
  });

  it('🔴 الجَسْر يعيد بيوعَ المدموجة قبل حذفها', () => {
    const repoint = service.indexOf("invoice.updateMany({ where: { offlineIncidentId: { in: ids } }, data: { offlineIncidentId: survivor.id } })");
    const remove = service.indexOf('posOfflineIncident.deleteMany({ where: { id: { in: ids } } })');
    expect(repoint).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(repoint);
  });

  it('🔴 سقوطُ الاستنتاج لا يُسقط بيعاً التزم — والتقرير يعلن أنه استنتاجٌ بحدّه', () => {
    expect(service).toMatch(/await this\.recordOfflineIncident\([^)]*\)\.catch\(/);
    expect(service).toContain('inferred: true as const');
    expect(service).toContain('gapMinutes: company.posOfflineGapMinutes');
    expect(service).toContain('gapMinutes: r.gapMinutes');
  });

  it('🔴 المخطَّط: الإعداد بافتراض دقيقتَين، والواقعة تحمل حدَّها، والفاتورة تنفصل لا تُحذف', () => {
    const schema = readFileSync(join(api, 'prisma', 'schema.prisma'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(schema.length).toBeGreaterThan(10_000);
    expect(schema).toMatch(/posOfflineGapMinutes\s+Int\s+@default\(2\)/);
    expect(schema).toMatch(/model PosOfflineIncident \{[\s\S]*?gapMinutes\s+Int[\s\S]*?@@map\("pos_offline_incidents"\)/);
    expect(schema).toMatch(/offlineIncident\s+PosOfflineIncident\?\s+@relation\(fields: \[offlineIncidentId\], references: \[id\], onDelete: SetNull\)/);
  });

  it('🔴 الطبقتان: الجدول في قائمة النطاق، وهجرتُه تفرض RLS بـFORCE', () => {
    const scope = readFileSync(join(__dirname, '..', 'common', 'tenant', 'tenant-scope.extension.ts'), 'utf8');
    expect(scope).toContain("'PosOfflineIncident',");
    const migration = readFileSync(join(api, 'prisma', 'migrations', '20260905210000_pos_offline_incidents', 'migration.sql'), 'utf8');
    expect(migration.length).toBeGreaterThan(500);
    expect(migration).toContain('ALTER TABLE "pos_offline_incidents" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE "pos_offline_incidents" FORCE ROW LEVEL SECURITY;');
    expect(migration).toMatch(/CREATE POLICY tenant_isolation_pos_offline_incidents ON "pos_offline_incidents"\s+USING\s+\("companyId" = current_setting\('app\.company_id', true\)\)\s+WITH CHECK \("companyId" = current_setting\('app\.company_id', true\)\)/);
  });

  it('🔴 الإعداد يُحدّ بالشكل: بين دقيقةٍ ويوم', () => {
    const dto = readFileSync(join(__dirname, '..', 'company-profile', 'dto', 'update-company-profile.dto.ts'), 'utf8');
    expect(dto).toMatch(/@IsInt\(\)\s+@Min\(1\)\s+@Max\(1440\)\s+posOfflineGapMinutes\?: number;/);
  });
});
