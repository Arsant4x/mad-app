import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * الحارس: **لا نظام صلاحيات ثانٍ في الواجهة**.
 *
 * ## ما يمنعه بالضبط
 *
 * ليس البحث في مجموعةٍ محسومة — ذاك استعلام. بل **إعادة كتابة قاعدة**:
 * فكّ الرمز `'all'`، أو «شاشة بلا أفعال تعني كل الأفعال»، أو التقاطع، أو
 * قراءة `revoked`. هذه أربع قواعد تعيش في `isActionAllowed` و
 * `effectiveGrants` على الخادم، ونسخةٌ منها في الواجهة **تفترق عند أول
 * تعديل بلا شكوى**: الشريط يُظهر رابطاً والصفحة ترفضه، أو العكس.
 *
 * وقد وقع هذا فعلاً قبل هذا البند: قاعدة `'all'` كانت مكتوبة مرتين، في
 * `AppShell.canSee` و`ScreenGuard`.
 *
 * ## المُميِّز — بنيويٌّ لا قائمة استثناءات
 *
 * محرِّرو القوالب (`OwnerTemplateModal` · `TemplateModal` ·
 * `DeveloperPanelPage`) يلمسون `allowedScreens` و`screenActions` بحقّ: هي
 * **محتوى نموذجٍ يُحرَّر**، لا سلطة المستخدم الحالي. والفرق ليس في المفردة
 * بل في الفاعل: أيٌّ منهم **لا يقرأ الفاعل الحالي إطلاقاً** — لا `useAuth`
 * ولا `usePermissions`.
 *
 * فالقاعدة: **ملفٌّ يقرأ الفاعل الحالي لا يجوز أن يحمل مفردةَ قاعدة**.
 * وهذا مُميِّزٌ من بنية الملف نفسه — لا قائمةَ أسماءٍ تتعفّن، ولا ثقب على
 * مقاس المخالفة القائمة.
 *
 * ⚠️ ويقرأ **الملفات المصدرية نفسها**: لا مخرَجَ أداةٍ رشّحت، ولا نوعاً
 * تُرجم. فالترشيح بين الحارس ومصدره يُبطله صامتاً (CLAUDE.md، خمس حوادث).
 */

const SRC = join(__dirname, '..');

/** الوحدة الوحيدة المسموح لها — وهي مستثناةٌ **بموضعها لا باسمها في قائمة**. */
const SOLE_OWNER = join('auth', 'PermissionsContext.tsx');

/** من يقرأ الفاعل الحالي. */
const READS_ACTOR = /\buse(Auth|Permissions)\b/;

/**
 * مفردات القواعد. كلٌّ منها **قاعدةٌ تعيش في الخادم**، لا اسمُ حقلٍ عابر.
 */
const RULE_TOKENS: { pattern: RegExp; rule: string }[] = [
  { pattern: /allowedScreens/, rule: "الشاشات المسموحة — ومعها فكّ الرمز 'all'" },
  { pattern: /isAllScreens/, rule: 'قاعدة «كل الشاشات»' },
  { pattern: /screenActions/, rule: 'قاعدة «شاشة بلا أفعال ⇒ كل الأفعال»' },
  { pattern: /\.revoked\b/, rule: 'قاعدة السحب المتتالي' },
  { pattern: /\bgrantable\b.*\.(filter|reduce)\(|\.granted\b/, rule: 'التقاطع' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'test') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('لا نظام صلاحيات ثانٍ في الواجهة', () => {
  const files = walk(SRC);

  it('يقرأ ملفاتٍ فعلاً — حارسٌ على شجرةٍ فارغة ليس حارساً', () => {
    // الفخّ الذي أوقعنا مرتين: مسارٌ خاطئ يعطي صفر ملفات، فيمرّ الحارس
    // بنجاحٍ تامّ وهو لم يفحص شيئاً.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith(join('auth', 'PermissionsContext.tsx')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('layout', 'AppShell.tsx')))).toBe(true);
  });

  it('⭐ ملفٌّ يقرأ الفاعل الحالي لا يحمل مفردةَ قاعدة', () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      if (rel === SOLE_OWNER || rel.split(sep).join('/') === SOLE_OWNER.split(sep).join('/')) continue;
      const text = readFileSync(file, 'utf8');
      if (!READS_ACTOR.test(text)) continue;
      // التعليقات تشرح القاعدة ولا تنفّذها — والفحص على الشيفرة.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*)/.test(l))
        .join('\n');
      for (const { pattern, rule } of RULE_TOKENS) {
        if (pattern.test(code)) violations.push(`${rel} ⟵ ${rule}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('⭐ محرِّرو القوالب لا يقرؤون الفاعل — وهو ما يجعل الاستثناء بنيوياً', () => {
    // لو استورد أحدهم `useAuth` يوماً لسقط الفحص أعلاه عليه — وهذا مقصود:
    // خلطُ تحرير القالب بقراءة سلطة المستخدم هو بالضبط ما لا يُراد.
    const editors = [
      join('pages', 'companyUsers', 'OwnerTemplateModal.tsx'),
      join('pages', 'companyUsers', 'CompanyUsersPage.tsx'),
      join('pages', 'developer', 'TemplateModal.tsx'),
      join('pages', 'developer', 'DeveloperPanelPage.tsx'),
    ];
    for (const rel of editors) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      expect({ file: rel, readsActor: READS_ACTOR.test(text) }).toEqual({ file: rel, readsActor: false });
    }
  });

  /**
   * الصياغة الأولى لهذا الفحص بحثت عن `grants.includes(` في كل ملف — فاصطادت
   * `SupportAccessCard` حيث `grants` **موافقات دعمٍ فنّي** لا صلاحيات. تشابهُ
   * اسمٍ لا مخالفة.
   *
   * والدرس أن الفحص النصّي العريض يشتري تغطيةً بثمن ثقةٍ كاذبة: استثناءٌ
   * واحد يُضاف اليوم يصير ثقباً غداً. فالمُميِّز الصحيح **العقد لا النصّ**:
   * ما دامت الوحدة لا تُصدِّر المصفوفة الخام، فلا ملفَّ يستطيع البحث فيها
   * بنفسه — **يستحيل** لا «ممنوع».
   */
  it('⭐ الوحدة لا تُصدِّر المصفوفة الخام — فالبحث الذاتي مستحيل لا ممنوع', () => {
    const contract = readFileSync(join(SRC, SOLE_OWNER), 'utf8');
    const iface = contract.slice(contract.indexOf('interface PermissionsValue'));
    const body = iface.slice(0, iface.indexOf('\n}'));
    expect(/^\s*grants\s*:/m.test(body)).toBe(false);
    // وما يُصدَّر دوالٌّ محسومة لا موادّ خام.
    expect(/canSee:\s*\(screen: string\) => boolean/.test(body)).toBe(true);
    expect(/can:\s*\(screen: string, action: string\) => boolean/.test(body)).toBe(true);
  });

  it('⭐ لا يُنتزَع من `usePermissions()` إلا ما في عقدها', () => {
    // درعُ المستقبل: لو أُضيف `grants` إلى العقد يوماً وبدأ زرٌّ ينتزعه،
    // سقط هنا — قبل أن ينتشر في مئة موضع.
    const ALLOWED = new Set(['loading', 'canSee', 'can', 'extinguished', 'grantable', 'chains', 'tree', 'refresh']);
    const bad: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      if (rel.split(sep).join('/') === SOLE_OWNER.split(sep).join('/')) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*usePermissions\(\)/g)) {
        for (const raw of m[1].split(',')) {
          const name = raw.split(':')[0].trim();
          if (name && !ALLOWED.has(name)) bad.push(`${rel} ⟵ ${name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
