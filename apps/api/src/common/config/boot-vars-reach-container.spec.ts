import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from '../source-scan.util';
import { bootGuardedVariables } from './production-secrets';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): ملفَّ التركيب `YAML` — ولا شيفرةَ `TypeScript`.
readsDeclaredStrings();

/**
 * ⑬A1 (`ق-١٣٣٣`) — **ما يطلبه حارسُ الإقلاع يبلغ الحاوية**.
 *
 * **الواقعة**: أُضيف `MAIL_DAILY_LIMIT` إلى حارس الإقلاع — **و`docker-compose.prod.yml` يسرد بيئةَ `api` بالاسم
 * ولم يكن فيها**. فلو ضبطه المالكُ في `.env.production` لما بلغ الحاويةَ، **ولرُفض الإقلاعُ بـ«غير مضبوط» عن
 * قيمةٍ كتبها بيده** — والعطلُ في ملفٍّ ثالثٍ لا يذكره الخطأ. أمسكه هذا الحارسُ قبل الالتزام.
 *
 * **مشتقٌّ لا مسرود**: الأسماءُ من `bootGuardedVariables()` — فقاعدةٌ تُضاف إلى الحارس غداً تدخل الفحصَ بلا لمس
 * هذا الملفّ. **والتركيبُ يُقرأ بالمسافة البادئة** لا بمكتبة `YAML` (ليست اعتماداً معلَناً للحزمة)، **ويُصادَق
 * المسبار** بحالتين معلومتين قبل الوثوق بجوابه.
 */
export function composeServiceEnvKeys(compose: string, service: string): string[] | null {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${service}:`);
  if (start < 0) return null;
  const indentOf = (l: string) => l.length - l.trimStart().length;

  // حدودُ الخدمة حتى أوّل سطرٍ ذي معنى بمسافةٍ أقلَّ من أربع — والتعليقُ والفارغُ لا يحدّانها.
  let envAt = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) continue;
    if (indentOf(lines[i]) < 4) break;
    if (lines[i] === '    environment:') {
      envAt = i;
      break;
    }
  }
  if (envAt < 0) return null;

  const keys: string[] = [];
  for (let j = envAt + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === '' || t.startsWith('#')) continue;
    if (indentOf(lines[j]) < 6) break;
    const m = /^([A-Z][A-Z0-9_]*):/.exec(t);
    if (m && indentOf(lines[j]) === 6) keys.push(m[1]);
  }
  return keys;
}

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const COMPOSE = readFileSync(join(REPO_ROOT, 'docker-compose.prod.yml'), 'utf8');

describe('⑬A1 — ما يطلبه حارسُ الإقلاع يبلغ حاويةَ الخادم (ق-١٣٣٣)', () => {
  it('المسبارُ مُصادَق: يرى مفاتيحَ معلومةً في التركيب الحقيقيّ، ويفتقد ما حُذف من تركيبٍ مصنوع', () => {
    const keys = composeServiceEnvKeys(COMPOSE, 'api');
    expect(keys).not.toBeNull();
    expect(keys).toEqual(expect.arrayContaining(['NODE_ENV', 'DATABASE_URL', 'JWT_ACCESS_SECRET', 'SMTP_HOST']));

    // تركيبٌ مصنوعٌ بدالّة (لا حرفياً): مفتاحان، وتعليقٌ بينهما، ثم خدمةٌ تالية بمفتاحٍ لا يُنسب إلى الأولى.
    const made = ['services:', '  api:', '    environment:', '      A_KEY: 1', '      # تعليق', '      B_KEY: ${B:-}', '  web:', '    environment:', '      C_KEY: 3', ''].join('\r\n');
    expect(composeServiceEnvKeys(made, 'api')).toEqual(['A_KEY', 'B_KEY']);
    expect(composeServiceEnvKeys(made, 'web')).toEqual(['C_KEY']);
    expect(composeServiceEnvKeys(made, 'nope')).toBeNull();
  });

  it('⭐ كلُّ متغيّرٍ يقرؤه حارسُ الإقلاع يُمرَّر إلى بيئة api', () => {
    const keys = new Set(composeServiceEnvKeys(COMPOSE, 'api') ?? []);
    const guarded = bootGuardedVariables();
    // مصادقةُ الاشتقاق: القائمةُ ليست فارغة وتحمل ما أُضيف في ⑬A1.
    expect(guarded).toEqual(expect.arrayContaining(['JWT_ACCESS_SECRET', 'SMTP_FROM', 'MAIL_DAILY_LIMIT']));
    expect(guarded.filter((name) => !keys.has(name))).toEqual([]);
  });
});

describe('second factor required for platform accounts reaches production', () => {
  it('the compose file passes MFA_REQUIRED_FOR_PLATFORM_ADMIN to the api with true as its default', () => {
    expect(COMPOSE.split(/\r?\n/)).toContain('      MFA_REQUIRED_FOR_PLATFORM_ADMIN: ${MFA_REQUIRED_FOR_PLATFORM_ADMIN:-true}');
  });

  it('the production example file sets it to true', () => {
    const example = readFileSync(join(REPO_ROOT, '.env.production.example'), 'utf8');
    expect(example.split(/\r?\n/)).toContain('MFA_REQUIRED_FOR_PLATFORM_ADMIN=true');
  });
});
