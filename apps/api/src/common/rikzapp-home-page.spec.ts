import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// يقرأ نصوصاً معلَنة عمداً: الصفحةُ ملفُّ HTML، والممنوعُ فيها نصٌّ لا شيفرة.
readsDeclaredStrings();

/**
 * ⚖️ **حدودُ صفحة التعريف العامة** (`ق-١٦٥٣` · `ق-١٦٥٤`، بحكم صاحب المشروع، توجيه ٢٨٥):
 * صفحةٌ ثابتةٌ في `sites/rikzapp-home/public/` لا تُفهرس حتى الإطلاق، ولا شيفرةَ فيها ولا نموذجَ
 * ولا طلبَ لطرفٍ ثالث، **وإنجليزيةٌ كلُّها** بنصّ طلب البرنامج حرفاً، **ولا عربيّةَ فيها إلا «رِكز»
 * بكسرته شعاراً نصّياً بجانب «Rikz»**، واسمُ الشركة في أسفلها كما سُمّي (حكمُ صاحب المشروع بعد
 * المعاينة المنشورة، ملحقٌ بـ`ق-١٦٥٣`). والقاعدةُ ٢٧: قاعدةٌ بلا بوّابةٍ تُنسى في أوّل ضغط.
 *
 * ⚠️ **وحدُّها**: تقرأ الملفّاتِ في المستودع لا ما رُفع إلى Cloudflare، فما يُرفع يُرفع من
 * `main`. ولا ترى معنى النصّ الإنجليزيّ خارج فقرة الطلب، والممنوعُ هنا كلماتٌ مسمّاة.
 */
const PUBLIC = join(__dirname, '..', '..', '..', '..', 'sites', 'rikzapp-home', 'public');
const read = (f: string): string => readFileSync(join(PUBLIC, f), 'utf8');

/** نصُّ طلب البرنامج كما كتبه صاحبُ المشروع (توجيه ٢٨٥، البند ٧)، ولا يُعدَّل وحدَه. */
const APPLICATION_TEXT =
  "We're building Rikz, a cloud accounting and business management platform for small and medium businesses in Saudi Arabia, built on one accounting core with activity-specific modules. The first module, for landlords and property management offices, is in active development ahead of launch, designed for ZATCA Phase 2 e-invoicing.";

const BANNED_MARKUP = [/<script\b/i, /<form\b/i, /<input\b/i, /<iframe\b/i, /\son[a-z]+\s*=/i];
const BANNED_WORDS = ['متوافق', 'compliant', 'pricing', 'أسعار', 'اشترك', 'sign up', 'analytics', 'gtag'];
const EXTERNAL = /(?:src|href)\s*=\s*["']https?:\/\//i;
const BARE_NAME = new RegExp(`ر(?!${'\\u0650'})كز`);

/** ما يخالف حدودَ الصفحة في نصّها، مسمّىً. */
export function pageViolations(html: string): string[] {
  const out: string[] = [];
  for (const re of BANNED_MARKUP) if (re.test(html)) out.push(`وسمٌ ممنوع ${re.source}`);
  const lower = html.toLowerCase();
  for (const w of BANNED_WORDS) if (lower.includes(w.toLowerCase())) out.push(`كلمةٌ ممنوعة «${w}»`);
  if (EXTERNAL.test(html)) out.push('طلبٌ لطرفٍ ثالث');
  if (BARE_NAME.test(html)) out.push('الاسمُ العربيّ بلا كسرة');
  return out;
}

/** الموضعان الوحيدان المسموحُ فيهما بحرفٍ عربيّ: الشعارُ النصّيّ واسمُ الشركة. */
const ALLOWED_ARABIC = [
  /<span class="wordmark-ar" lang="ar" dir="rtl">[^<]*<\/span>/g,
  /<p class="company"><span lang="ar" dir="rtl">[^<]*<\/span><\/p>/g,
];

/** ما في الصفحة من نصٍّ عربيٍّ خارج الموضعين المسموحين. */
export function arabicOutsideWordmark(html: string): string[] {
  let rest = html;
  for (const re of ALLOWED_ARABIC) rest = rest.replace(re, '');
  return [...rest.matchAll(/[؀-ۿ][؀-ۿ\s]*/g)].map((m) => m[0].trim());
}

/** نصُّ أوّلِ فقرةٍ في القسم الإنجليزيّ بلا وسوم ولا فراغاتٍ زائدة. */
function englishParagraph(html: string): string {
  const section = html.match(/<section class="english[^"]*"[\s\S]*?<\/section>/)?.[0] ?? '';
  const p = section.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
  return p.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

describe('حدودُ صفحة التعريف العامة (ق-١٦٥٣ · ق-١٦٥٤)', () => {
  it('⓪ المسبارُ يرى: يُصيب كلَّ ممنوعٍ مزروع، ولا يُصيب صفحةً سليمة', () => {
    // مصادقةُ المسبار بحالتين (القاعدة ٢٩).
    // ⚠️ النصُّ المصنوع حرفياً داخل الاستدعاء: `probe-two-cases` يجمع متغيّراتِ النصّ المصنوع بنمطٍ
    //    يمتدّ من أوّل `const X = [` إلى أوّل `].join(` بعده، فيبتلع تعريفاً بينهما ولا يراه.
    expect(pageViolations('<html lang="en"><p>رِكز</p><a href="mailto:x@example.com">x</a></html>')).toEqual([]);
    const clean = '<html lang="en"><p>رِكز</p><a href="mailto:x@example.com">x</a></html>';
    const planted = [
      ['<scr', 'ipt>'].join(''),
      ['<fo', 'rm>'].join(''),
      '<img onerror="x">',
      ['منصّة متو', 'افقة'].join(''),
      ['ZATCA compl', 'iant'].join(''),
      '<link href="https://fonts.example.com/a.css">',
      ['ر', 'كز'].join(''),
    ];
    for (const bad of planted) expect(pageViolations(clean + bad)).not.toEqual([]);
  });

  it('⓪ب مسبارُ العربيّة يرى: يتركها في الشعار واسم الشركة، ويُصيبها في أيّ موضعٍ غيرهما', () => {
    expect(arabicOutsideWordmark('<p class="wordmark"><span class="wordmark-ar" lang="ar" dir="rtl">رِكز</span></p><p class="company"><span lang="ar" dir="rtl">شركة</span></p>')).toEqual([]);
    expect(arabicOutsideWordmark('<title>Rikz · رِكز</title>')).toHaveLength(1);
    expect(arabicOutsideWordmark('<section lang="ar"><h2>منصّة سحابية</h2></section>')).toHaveLength(1);
    expect(arabicOutsideWordmark('<span class="wordmark-ar">رِكز</span>')).toHaveLength(1);
  });

  it('① الصفحةُ تُقرأ فعلاً، وإنجليزيةٌ كلُّها، و«رِكز» شعاراً نصّياً وحدَه', () => {
    const html = read('index.html');
    expect(html).toMatch(/<html lang="en" dir="ltr">/);
    expect(html.indexOf('<section class="english')).toBeGreaterThan(0);
    expect(html).not.toMatch(/<section class="arabic"/);
    expect(html).toMatch(/<span class="wordmark-ar" lang="ar" dir="rtl">رِكز<\/span>/);
    expect(arabicOutsideWordmark(html)).toEqual([]);
  });

  it('② النصُّ الإنجليزيّ يطابق نصَّ الطلب حرفاً', () => {
    expect(englishParagraph(read('index.html'))).toBe(APPLICATION_TEXT);
  });

  it('③ لا فهرسة بالوسم في الصفحة وبالترويسة، وrobots.txt يسمح بالزحف للجميع', () => {
    expect(read('index.html')).toMatch(/<meta name="robots" content="noindex/);
    // ⚖️ (ق-١٦٥٣) robots.txt يسمح ولا يمنع: المراجعةُ الآلية للبرنامج قد تحترمه فلا تفتح الصفحة، والزاحفُ
    //    الممنوعُ لا يقرأ noindex أصلاً. فلا سطرَ Disallow بمسارٍ غيرِ فارغ.
    const robots = read('robots.txt').split(/\r?\n/).map((l) => l.trim());
    expect(robots).toEqual(expect.arrayContaining(['User-agent: *', 'Allow: /']));
    expect(robots.filter((l) => /^disallow:\s*\S/i.test(l))).toEqual([]);
    const headers = read('_headers').split(/\r?\n/);
    expect(headers[0].trim()).toBe('/*');
    expect(headers.map((l) => l.trim())).toEqual(expect.arrayContaining(['X-Robots-Tag: noindex, nofollow']));
  });

  it('④ لا شيفرةَ ولا نموذجَ ولا طلبَ لطرفٍ ثالث ولا كلمةً ممنوعة، والاسمُ بكسرته', () => {
    const html = read('index.html');
    expect(pageViolations(html)).toEqual([]);
    expect(html).toContain(['ر', 'ِ', 'كز'].join(''));
    expect(read('style.css')).not.toMatch(/@import|url\(\s*["']?https?:/i);
    const csp = read('_headers').split(/\r?\n/).find((l) => l.includes('Content-Security-Policy')) ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/script-src/);
  });
});
