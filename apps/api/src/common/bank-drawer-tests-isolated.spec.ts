import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): ملفّاتِ الاختبار نفسَها — فالحارسُ يحرس ما يفعله الاختبارُ لا ما يدّعيه.
readsDeclaredStrings();

/**
 * `ق-٧٢٢` — **كلُّ اختبارٍ يُنشئ بنكاً أو درجاً يعزل نفسَه بمنشأةٍ يصنعها ويزيلها — لا يستهلك رموزَ منشأة العرض.**
 *
 * الواقعة (`ق-٧١٢` · `ق-٧١٨`): `276` من `371` بنكاً في منشأة العرض على التطوير أنشأتها الاختباراتُ وكتبت
 * عليها، فاستُنفد نطاقا البنوك (`1100–1199` · `1601–1999` — `499` رمزاً) **بلا تاجرٍ واحد** — والمولّدُ
 * `MAX+1` لا يعود إلى الفجوات (`ق-١٩٨`). «فالضغطُ من صنعنا لا من المنتج، والمولّدُ سليمٌ يخدم تاجراً، ونحن من
 * أرهقه» (قرار المالك — التوجيه ١٥٧): لا نطاقَ ثالثاً ولا مسَّ بالمولّد — **والعلاجُ عزلُ الاختبار بمنشأته**
 * (`test/isolated-company.ts`)، وهو نصُّ `§8.30`: «المسابيرُ الحيّة تصنع صفوفَها ولا تعتمد على ما تركته البذرة».
 *
 * ما يُحرَس: كلُّ ملفّ اختبارٍ يُنشئ بنكاً أو درجاً (`POST /banks` · `POST /cash-drawers` · إنشاءٌ مباشر) **لا يدخل
 * بحساب منشأة العرض** (`demo-company-a` / `demo-company-b`) — بل يصنع منشأتَه. المقيسُ قبل العلاج: `18` ملفاً من
 * `19` على منشأة العرض؛ وبعده `0`.
 *
 * حدُّه المعلَن: يمسك الإنشاءَ بصيغه المعروفة (المسارُ الحرفيّ · `bank.create` · `cashDrawer.create`)؛ ومسارٌ يُبنى
 * غداً بصيغةٍ أخرى يُضاف هنا لا يُترك.
 */
const API_ROOT = join(__dirname, '..', '..');
const RX_CREATES = /\.post\(\s*[`'"]\/(banks|cash-drawers)\b|\b(bank|cashDrawer)\.create\(|banksService\.create\(|cashDrawersService\.create\(/;
// دخولٌ فعليّ بحساب العرض — لا مجرّدُ ذكرٍ في تعليق
const RX_DEMO_LOGIN = /username:\s*['"`]demo-company-[ab]['"`]/;

function specFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) specFiles(full, out);
    else if (/\.(e2e-spec|spec)\.ts$/.test(name)) out.push(full);
  }
  return out;
}

export function bankOrDrawerCreators(files: string[]): string[] {
  return files.filter((f) => RX_CREATES.test(readFileSync(f, 'utf8')));
}

export function creatorsOnDemoCompany(files: string[]): string[] {
  return bankOrDrawerCreators(files).filter((f) => RX_DEMO_LOGIN.test(readFileSync(f, 'utf8')));
}

describe('اختباراتُ البنوك والأدراج معزولةٌ بمنشآتها — لا تستهلك رموزَ منشأة العرض (ق-٧٢٢)', () => {
  const files = [...specFiles(join(API_ROOT, 'test')), ...specFiles(join(API_ROOT, 'src'))].filter((f) => !f.endsWith('bank-drawer-tests-isolated.spec.ts'));

  it('⓪ حارسٌ على المجسّ: السطحُ غيرُ فارغ — ثمّة ملفّاتٌ تُنشئ بنوكاً أو أدراجاً', () => {
    const creators = bankOrDrawerCreators(files);
    expect(creators.length).toBeGreaterThanOrEqual(10);
    expect(creators.map((f) => relative(API_ROOT, f).replace(/\\/g, '/'))).toEqual(expect.arrayContaining(['test/bank-postings.e2e-spec.ts', 'test/cash-drawers.e2e-spec.ts']));
  });

  it('🔴 لا ملفَّ يُنشئ بنكاً أو درجاً ويدخل بحساب منشأة العرض', () => {
    expect(creatorsOnDemoCompany(files).map((f) => relative(API_ROOT, f).replace(/\\/g, '/'))).toEqual([]);
  });

  it('المُكتشِف مُثبَتٌ بحالتين: ملفٌّ يُنشئ بنكاً بحساب العرض يُمسك — وملفٌّ معزولٌ يمرّ', () => {
    const tmp = join(__dirname, '__iso-probe__');
    const write = (name: string, body: string) => {
      const p = join(tmp, name);
      require('fs').mkdirSync(tmp, { recursive: true });
      require('fs').writeFileSync(p, body);
      return p;
    };
    try {
      const bad = write('bad.e2e-spec.ts', `login({ username: 'demo-company-a' }); http().post('/banks').send({});`);
      const good = write('good.e2e-spec.ts', `const c = await registerIsolatedCompany(app, 'x'); http().post('/banks').send({});`);
      const none = write('none.e2e-spec.ts', `login({ username: 'demo-company-a' }); http().get('/banks');`);
      // ذكرٌ في تعليقٍ ليس دخولاً — فلا يُمسك
      const mention = write('mention.e2e-spec.ts', `// كان يدخل بـ demo-company-a قبل العزل\nhttp().post('/cash-drawers').send({});`);
      expect(creatorsOnDemoCompany([bad, good, none, mention])).toEqual([bad]);
      expect(bankOrDrawerCreators([bad, good, none, mention])).toEqual([bad, good, mention]);
    } finally {
      require('fs').rmSync(tmp, { recursive: true, force: true });
    }
  });
});
