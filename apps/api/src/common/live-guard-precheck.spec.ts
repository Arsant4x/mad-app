import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { driftMessage, migrationDrift, migrationsOnDisk } from '../../test/live-db-migrations';

/**
 * `ق-٢٠٨` — **حارسٌ يقرأ المصدر** على شرط الحرّاس الحيّة: القاعدةُ على آخر هجرة قبل الحكم.
 *
 * ما يحرسه:
 *   · المُكتشِف يمسك الاتجاهَين (متأخّرة · لا يعرفها المصدر) ويترك التطابق — مُثبَتٌ بحالاتٍ معلومة؛
 *   · الشرطُ موصولٌ في `package.json` (`setupFilesAfterEnv`) — فحارسٌ لا يُشغَّل تلقائياً وثيقةٌ لا حماية؛
 *   · كل اختبارٍ يفتح عميلَ قاعدةٍ مباشرةً يحمل اسم `.live.spec.ts` (أو هو `e2e-spec`) — كي لا يفلت من الشرط باسمٍ آخر.
 */
const API = join(__dirname, '..', '..');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('الحارسُ الحيّ يتحقّق أن القاعدة على آخر هجرة قبل أن يحكم', () => {
  it('المُكتشِف مُثبَت بحالتَين في كل اتجاه', () => {
    expect(driftMessage(migrationDrift(['a', 'b'], ['a', 'b']))).toBeNull();
    const behind = migrationDrift(['a', 'b', 'c'], ['a']);
    expect(behind).toEqual({ behind: ['b', 'c'], unknown: [] });
    expect(driftMessage(behind)).toContain('متأخّرة بـ2 هجرة: b · c');
    const unknown = migrationDrift(['a'], ['a', 'z_orphan']);
    expect(unknown).toEqual({ behind: [], unknown: ['z_orphan'] });
    expect(driftMessage(unknown)).toContain('لا يعرفها المصدر: z_orphan');
    const both = driftMessage(migrationDrift(['a', 'b'], ['a', 'z']));
    expect(both).toContain('متأخّرة بـ1 هجرة: b');
    expect(both).toContain('لا يعرفها المصدر: z');
  });

  it('السطح غير فارغ — مجلّدات الهجرات تُقرأ فعلاً ولا يُحتسب ملفُ القفل', () => {
    const onDisk = migrationsOnDisk();
    expect(onDisk.length).toBeGreaterThan(80);
    expect(onDisk).not.toContain('migration_lock.toml');
    expect(onDisk.every((m) => /^\d{14}_/.test(m))).toBe(true);
  });

  it('🔴 الشرطُ موصولٌ تلقائياً بكل حارسٍ حيّ — من `package.json` لا من كل ملف', () => {
    const pkg = JSON.parse(readFileSync(join(API, 'package.json'), 'utf8')) as { jest?: { setupFilesAfterEnv?: string[] } };
    expect(pkg.jest?.setupFilesAfterEnv ?? []).toContain('<rootDir>/test/live-db-precheck.ts');
    const setup = readFileSync(join(API, 'test', 'live-db-precheck.ts'), 'utf8');
    expect(setup).toContain('assertDbAtLatestMigration()');
    expect(setup).toMatch(/\\\.live\\\.spec\\\.ts\$/);
  });

  it('🔴 كل اختبارٍ يفتح عميلَ قاعدةٍ مباشرةً يمرّ من الشرط — باسمه `.live.spec.ts` أو `e2e-spec`', () => {
    const offenders = [join(API, 'src'), join(API, 'test')]
      .flatMap((root) => files(root))
      .filter((f) => /\.spec\.ts$/.test(f) && !/\.live\.spec\.ts$|\.e2e-spec\.ts$/.test(f))
      .filter((f) => /new PrismaClient\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(API, f).split('\\').join('/'));
    expect(offenders).toEqual([]);
  });
});
