import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './apiError';

/** خطأ axios مصطنع بشكل الردّ الحقيقي. */
const axiosError = (message: unknown) => ({ response: { data: { message } } });

describe('apiErrorMessage — استخراج رسالة الخادم', () => {
  it('يعيد رسالة الخادم النصية بدل الاحتياطي', () => {
    expect(apiErrorMessage(axiosError('الفرع غير موجود'), 'احتياطي')).toBe('الفرع غير موجود');
  });

  it('يسطّح مصفوفة التحقّق بفاصلٍ مقروء لا بالتصاق', () => {
    const out = apiErrorMessage(
      axiosError(['الراتب الأساسي يجب أن يكون رقماً', 'تاريخ المباشرة مطلوب']),
      'احتياطي',
    );
    // ⚠️ هنا كان العيب في النمط «الصحيح» المنسوخ: `setError(array)` يعرض
    // العنصرين ملتصقين بلا فاصل.
    expect(out).toBe('الراتب الأساسي يجب أن يكون رقماً · تاريخ المباشرة مطلوب');
  });

  it('يتجاهل العناصر الفارغة داخل المصفوفة', () => {
    expect(apiErrorMessage(axiosError(['', '  ', 'الحالة مطلوبة']), 'احتياطي')).toBe('الحالة مطلوبة');
  });

  it('يعود للاحتياطي عند مصفوفة فارغة — لا نصّ فارغ يبتلع العطل', () => {
    expect(apiErrorMessage(axiosError([]), 'احتياطي')).toBe('احتياطي');
  });

  it('يعود للاحتياطي عند انقطاع الشبكة (لا response أصلاً)', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'احتياطي')).toBe('احتياطي');
  });

  it('يعود للاحتياطي عند قيمٍ غير متوقَّعة بدل الانهيار', () => {
    expect(apiErrorMessage(null, 'احتياطي')).toBe('احتياطي');
    expect(apiErrorMessage(axiosError(undefined), 'احتياطي')).toBe('احتياطي');
    expect(apiErrorMessage(axiosError({ nested: true }), 'احتياطي')).toBe('احتياطي');
  });
});

/**
 * حارسٌ للحارس: يمنع عودة النمط الذي أُصلح للتوّ.
 *
 * `} catch {` بلا معامل **يرمي كائن الخطأ**، فرسالة الخادم لا تصل الشاشة —
 * وكان ذلك في اثني عشر موضعاً. توكيدٌ على الدالة وحدها لا يمنع أحداً من
 * كتابة `catch` أعمى جديد غداً، فيُفحص المصدر نفسه.
 *
 * الاستثناء الوحيد المسموح: `catch` فارغ **متعمَّد** لا يعرض خطأً أصلاً
 * (تدهور لطيف) — ويُعرف بأنه لا يستدعي `setError` داخله.
 */
describe('لا catch أعمى يبتلع رسالة الخادم', () => {
  it('كل catch يعرض خطأً يلتقط الكائن ويمرّ بـapiErrorMessage', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(join(__dirname, '..', 'pages'))) {
      const src = readFileSync(file, 'utf8');
      // `catch {` متبوعاً — خلال أسطر قليلة — بعرض خطأ.
      const re = /\}\s*catch\s*\{([\s\S]{0,200}?)\n\s*\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (/setError\s*\(/.test(m[1])) {
          offenders.push(`${file.split(/[\\/]/).slice(-2).join('/')} — catch بلا معامل يعرض خطأً`);
        }
      }
    }
    expect(offenders, `مواضع تبتلع رسالة الخادم:\n${offenders.join('\n')}`).toEqual([]);
  });
});

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}
