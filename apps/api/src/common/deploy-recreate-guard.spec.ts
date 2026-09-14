import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): سكربتَي صدفةٍ وملفَّي `Dockerfile` — ولا شيفرةَ `TypeScript`.
readsDeclaredStrings();

/**
 * `ق-٧١٧` — **حارسُ إعادة الإنشاء في `deploy.sh` مشروطٌ بسياق البناء — ومُثبَتٌ بالعكس على الحالات الثلاث.**
 *
 * الواقعة (نشر 2026-09-14 · `31874f4 → edfc31c`): خرج `deploy.sh` بـ`1` لأن `web` لم تُعَد إنشاؤها —
 * ولا ملفَّ من مصادر بنائها تغيّر، فبُنيت الصورةُ نفسُها ولم يُعِد `compose` الحاوية. **إنذارٌ كاذبٌ يُقرأ
 * يدوياً مرّةً يُقرأ «معروفاً» بعد ثلاث** (قرار المالك — التوجيه ١٥٦؛ وقد قِيس ذلك في جدار الأدراج شهراً).
 *
 * **ما يُحرَس هنا** — وسكربتاتُ التشغيل لا تعمل في السير، فيُثبت بنيتُها وتُشغَّل كتلتُها على `docker` مزيَّف:
 *   ① مصادرُ البناء **تُقرأ من `Dockerfile` نفسِه** (أسطرُ `COPY` بلا `--from=`) — لا من قائمةٍ ثانية؛ ويُطابَق
 *      ما يقرؤه السكربت بما يقرؤه محلِّلٌ مستقلٌّ هنا من الملفّ نفسِه.
 *   ② `touching_sources` بحالتين معلومتين: ملفٌّ تحت `apps/web` يمسّ web ولا يمسّ api؛ وملفٌّ في `docs/` لا يمسّ أحداً؛
 *      و`packages/shared` يمسّ الاثنين.
 *   ③ **كتلةُ الحارس كما هي في `deploy.sh`** (تُقتطع بين علامتَيها — لا نسخةٌ منها) تُشغَّل ثلاثاً:
 *      بلا تغييرٍ في المصادر والصورةُ نفسُها ⇒ ○ مشروع ولا إسقاط · مصادرُ تغيّرت ولم تُعَد ⇒ إسقاط يسمّي
 *      الملفّ · صورةٌ جديدة ولم تُعَد ⇒ إسقاط يسمّي الصورة.
 *
 * حدُّه المعلَن: `docker` و`compose` مزيَّفان — فالإثباتُ إثباتُ منطق الحارس لا إثباتُ النشر؛ والنشرُ التالي
 * على المنشور هو ما يُثبت الوصلَ (`ق-٥٧٦`).
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO_ROOT, ...p), 'utf8');
const DEPLOY = read('deploy.sh');
const GUARD = read('ops', 'deploy', 'recreate-guard.sh');

function bash(script: string, args: string[] = [], input = ''): { code: number; out: string } {
  const r = spawnSync('bash', [script, ...args], { cwd: REPO_ROOT, input, encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** يستدعي دالّةً من `recreate-guard.sh` بعد `source` — بمعطياتها وبمدخلٍ قياسيّ. */
function guardFn(fn: string, args: string[], input = ''): { code: number; out: string } {
  const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
  const r = spawnSync('bash', ['-c', `source ops/deploy/recreate-guard.sh && ${fn} ${quoted}`], { cwd: REPO_ROOT, input, encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status ?? -1, out: r.stdout };
}

/** محلِّلٌ مستقلٌّ لأسطر COPY — يقرأ الملفَّ نفسَه الذي يقرؤه السكربت. */
function copySources(dockerfile: string): string[] {
  return read(dockerfile)
    .split('\n')
    .filter((l) => /^COPY\s/.test(l) && !l.includes('--from='))
    .flatMap((l) => l.trim().split(/\s+/).slice(1, -1).filter((t) => !t.startsWith('--')));
}

describe('حارسُ إعادة الإنشاء مشروطٌ بسياق البناء — يُقرأ من Dockerfile ويُثبَت بالعكس (ق-٧١٧)', () => {
  it('⓪ deploy.sh يستدعي دوالَّ الحارس من ملفّها، ولم يعد فيه بقاءٌ «مشروعٌ» بلا قراءةٍ لسياق البناء', () => {
    expect(DEPLOY).toMatch(/source \.\/ops\/deploy\/recreate-guard\.sh/);
    for (const fn of ['touching_sources', 'service_dockerfile', 'image_tag_id']) {
      expect(DEPLOY).toContain(fn);
      expect(GUARD).toMatch(new RegExp(`^${fn}\\(\\)`, 'm'));
    }
    expect(DEPLOY).toContain('ق-٧١٧');
    // الأصفرُ القديم — «لا التزام جديد وصل، فهذا سلوك مشروع» بلا قراءةٍ للمصادر — زال
    expect(DEPLOY).not.toContain('ولا التزام جديد وصل، فهذا سلوك مشروع');
  });

  it('① مصادرُ البناء تُقرأ من Dockerfile نفسِه — ومطابقةٌ لمحلِّلٍ مستقلّ (web · api)', () => {
    for (const df of ['apps/web/Dockerfile', 'apps/api/Dockerfile']) {
      const expected = copySources(df);
      expect(expected.length).toBeGreaterThan(3); // حارسٌ على المجسّ: الملفُّ قُرئ فعلاً
      const r = guardFn('build_sources', [df]);
      expect(r.code).toBe(0);
      expect(r.out.trim().split('\n')).toEqual(expected);
    }
    // ما يُنسخ من مرحلةٍ سابقة ليس مصدراً من الشجرة
    expect(guardFn('build_sources', ['apps/web/Dockerfile']).out).not.toMatch(/dist|node_modules/);
  });

  it('② touching_sources بحالتين: apps/web يمسّ web لا api · docs لا يمسّ أحداً · packages/shared يمسّ الاثنين', () => {
    const webHit = guardFn('touching_sources', ['apps/web/Dockerfile'], 'docs/x.md\napps/web/src/App.tsx\n');
    expect(webHit.code).toBe(0);
    expect(webHit.out.trim()).toBe('apps/web/src/App.tsx');
    const apiMiss = guardFn('touching_sources', ['apps/api/Dockerfile'], 'docs/x.md\napps/web/src/App.tsx\n');
    expect(apiMiss.code).toBe(1);
    expect(apiMiss.out.trim()).toBe('');
    expect(guardFn('touching_sources', ['apps/web/Dockerfile'], 'docs/x.md\nCLAUDE.md\n').code).toBe(1);
    for (const df of ['apps/web/Dockerfile', 'apps/api/Dockerfile']) {
      expect(guardFn('touching_sources', [df], 'packages/shared/src/index.ts\n').code).toBe(0);
      // الملفُّ نفسُه و.dockerignore من السياق أيضاً
      expect(guardFn('touching_sources', [df], `${df}\n`).code).toBe(0);
      expect(guardFn('touching_sources', [df], '.dockerignore\n').code).toBe(0);
    }
  });

  it('③ Dockerfile الخدمة يُقرأ من إعداد compose المطبَّع — ويُردّ نسبياً إلى الجذر', () => {
    const cfg = 'services:\n  api:\n    build:\n      context: /opt/mad-app\n      dockerfile: apps/api/Dockerfile\n  web:\n    build:\n      context: /opt/mad-app\n      dockerfile: /opt/mad-app/apps/web/Dockerfile\nnetworks:\n  default: {}\n';
    expect(guardFn('service_dockerfile', ['web', '/opt/mad-app'], cfg).out.trim()).toBe('apps/web/Dockerfile');
    expect(guardFn('service_dockerfile', ['api', '/opt/mad-app'], cfg).out.trim()).toBe('apps/api/Dockerfile');
    expect(guardFn('service_dockerfile', ['minio', '/opt/mad-app'], cfg).out.trim()).toBe('');
  });

  it('⭐ ④ كتلةُ الحارس كما هي في deploy.sh — بلا تغييرٍ في المصادر تمرّ (○)، وبتغييرٍ أو بصورةٍ جديدة تُسقط', () => {
    const pass = bash('ops/deploy/recreate-guard.selftest.sh', ['1']);
    expect(pass.code).toBe(0);
    expect(pass.out).toMatch(/○ «web»: لم تُعَد إنشاؤها — ولا ملفَّ من مصادر بنائها \(apps\/web\/Dockerfile · COPY\) تغيّر/);
    expect(pass.out).not.toMatch(/✖/);

    const touched = bash('ops/deploy/recreate-guard.selftest.sh', ['2']);
    expect(touched.code).toBe(1);
    expect(touched.out).toMatch(/«web»: لم تُمَسّ .* مصادرَ بنائها تغيّرت: apps\/web\/src\/x\.ts/);
    expect(touched.out).toMatch(/الحارس أسقط النشر/);

    const rebuilt = bash('ops/deploy/recreate-guard.selftest.sh', ['3']);
    expect(rebuilt.code).toBe(1);
    expect(rebuilt.out).toMatch(/«web»: لم تُمَسّ .* صورةً جديدة بُنيت \(web000000000 ← web111111111\)/);
  });
});
