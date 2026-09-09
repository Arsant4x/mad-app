import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): يبحث عن `actorType: 'COMPANY'`
// — **والقيمةُ داخل اقتباس**، فتجريدُ النصوص يمحوها ويُعمي الفحص.
readsDeclaredStrings();

/**
 * حارسان نصّيان على البند ٠ من ترتيب التنفيذ المعتمد — **نواة إنشاء واحدة**.
 *
 * قرار المالك 2026-08-14: القنوات الأخرى (مدير المنصة · وسيط · مندوب) **أدوارٌ
 * على نموذجٍ واحد لا مسارات موازية**. وقبل هذا التوحيد كان لإنشاء المنشأة جسمان
 * متطابقان بنيةً وترتيباً، وتعليقاهما العربيان منسوخان بالحرف — فأي إضافة
 * للتسجيل (نشاط · باقة · نوع الكيان) تُكتب مرتين **أو تُنسى في أحدهما**.
 *
 * ⚠️ وحدّهما معلَن: يحرسان أن **الشيفرة مكتوبة** بنواةٍ واحدة — لا أن السلوك
 * موحَّد. سلوكُ التساوي بين القناتين يحرسه `platform-admin.e2e-spec.ts`
 * و`auth-selfservice.e2e-spec.ts` على قاعدةٍ حيّة. (§8.1: «الكود صحيح» ≠
 * «الميزة تعمل».)
 */
describe('البند ٠ — نواة إنشاء واحدة', () => {
  const srcRoot = join(__dirname, '..');

  /** كل ملفات `.ts` تحت `apps/api/src` عدا الاختبارات والنواة نفسها. */
  const productionFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.ts')) continue;
        if (e.name.endsWith('.spec.ts')) continue;
        out.push(p);
      }
    };
    walk(srcRoot);
    return out;
  };

  it('لا مستدعي `loginIdentity.create` بـactorType COMPANY خارج النواة', () => {
    const files = productionFiles();
    // عكسُ الحارس: مسحٌ فارغ ينجح كذباً. لا بدّ أن يكون قد قرأ شيئاً فعلاً.
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const p of files) {
      if (p.endsWith('create-company-account.ts')) continue;
      const src = readFileSync(p, 'utf8');
      if (!src.includes('loginIdentity.create')) continue;
      // إنشاء موظف فرعي (`COMPANY_USER`) مسارٌ آخر مشروع — المحروس هو إنشاء
      // **المنشأة** وحده.
      if (/actorType:\s*'COMPANY'/.test(src)) {
        offenders.push(p.slice(srcRoot.length + 1).replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('مهلة السماح معرَّفة في موضع واحد', () => {
    const defs = productionFiles().filter((p) =>
      /const\s+FROZEN_TO_STOPPED_GRACE_DAYS\s*=/.test(readFileSync(p, 'utf8')),
    );
    expect(defs.map((p) => p.slice(srcRoot.length + 1).replace(/\\/g, '/'))).toEqual([
      'common/tenant/company-status.util.ts',
    ]);
  });
});
