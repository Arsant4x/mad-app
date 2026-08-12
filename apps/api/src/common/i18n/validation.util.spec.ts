import { ValidationError } from '@nestjs/common';
import { localizeValidation, validationExceptionFactory } from './validation.util';

/**
 * حارس تعريب رسائل `class-validator`.
 *
 * **الحادثة:** كانت رسائل التحقّق تصل المستخدم العربي بالإنجليزية الخام
 * (`baseSalary must be a number conforming to the specified constraints`)
 * لأنها تولد داخل المكتبة ولا تمرّ بكتالوج الرسائل. ورسالة إنجليزية في
 * تطبيق عربي **عطلٌ لا نقص**.
 *
 * والحارس يقف عند الحدّ الحقيقي: الحمولة **كما يبنيها المصنع فعلاً**، لا
 * نصاً مفتعلاً يشبهها — فلو تغيّرت صيغة الحمولة غداً سقط الاختبار، وهو
 * المطلوب.
 */
const err = (property: string, constraints: Record<string, string>, children: ValidationError[] = []) =>
  ({ property, constraints, children }) as ValidationError;

/** الحمولات كما يبنيها المصنع. */
const payloads = (...errors: ValidationError[]): string[] =>
  (validationExceptionFactory(errors).getResponse() as { message: string[] }).message;

/** ترجمة كل الرسائل بلغةٍ ما. */
const say = (lang: 'ar' | 'en', ...errors: ValidationError[]): (string | null)[] =>
  payloads(...errors).map((m) => localizeValidation(m, lang));

describe('تعريب رسائل التحقّق', () => {
  it('يترجم القيود الشائعة بالعربية مع اسم الحقل كما يراه المستخدم', () => {
    expect(
      say(
        'ar',
        err('baseSalary', { isNumber: 'baseSalary must be a number conforming to the specified constraints' }),
        err('hireDate', { isDateString: 'hireDate must be a valid ISO 8601 date string' }),
        err('fullName', { isNotEmpty: 'fullName should not be empty' }),
      ),
    ).toEqual([
      'الراتب الأساسي يجب أن يكون رقماً',
      'تاريخ المباشرة يجب أن يكون تاريخاً صالحاً',
      'اسم الموظف مطلوب',
    ]);
  });

  it('لا يُفشي كلمةً إنجليزية في الردّ العربي', () => {
    const [ar] = say('ar', err('baseSalary', { isNumber: 'baseSalary must be a number conforming to the specified constraints' }));
    expect(ar).not.toMatch(/[a-z]{4,}/i);
  });

  it('يستخرج الحدّ العددي من نصّ المكتبة', () => {
    expect(say('ar', err('months', { min: 'months must not be less than 1' }))).toEqual(['عدد الأشهر لا يقل عن 1']);
  });

  it('يستخرج قائمة الخيارات ويفصلها بفاصلةٍ عربية', () => {
    expect(
      say('ar', err('status', { isEnum: 'status must be one of the following values: ACTIVE, SUSPENDED' })),
    ).toEqual(['الحالة يجب أن يكون أحد: ACTIVE، SUSPENDED']);
  });

  it('يعرّب رفض الحقل الزائد (forbidNonWhitelisted)', () => {
    expect(say('ar', err('salary', { whitelistValidation: 'property salary should not exist' }))).toEqual([
      'حقل غير معروف: salary',
    ]);
  });

  it('يترجم إلى الإنجليزية حين يطلبها العميل', () => {
    expect(say('en', err('baseSalary', { isNumber: 'x' }))).toEqual(['Base salary must be a number']);
  });

  it('يسطّح الحقول المتداخلة ويعرض اسم الحقل الورقي لا المسار', () => {
    expect(
      say('ar', err('items', {}, [err('0', {}, [err('quantity', { isNumber: 'quantity must be a number' })])])),
    ).toEqual(['الكمية يجب أن يكون رقماً']);
  });

  it('قيدٌ غير مُدرَج يبقى عربياً ولا يُفشي نصّ المكتبة', () => {
    expect(say('ar', err('phone', { isMobilePhone: 'phone must be a phone number' }))).toEqual([
      'قيمة غير صالحة في رقم الجوال',
    ]);
  });

  it('حقلٌ بلا ترجمة يظهر باسمه البرمجي — نقصٌ مقروء لا اسمٌ مخترَع', () => {
    expect(say('ar', err('someNewField', { isString: 'x' }))).toEqual(['someNewField يجب أن يكون نصاً']);
  });

  it('ردّ 400 لا يخرج بلا سبب أبداً', () => {
    const out = say('ar');
    expect(out).toHaveLength(1);
    expect(out[0]).toBeTruthy();
  });

  it('يمرّر ما ليس حمولة تحقّق كما هو — فلا يبتلع رسائل الكتالوج', () => {
    expect(localizeValidation('invoice.not_found', 'ar')).toBeNull();
    expect(localizeValidation('نصّ حرّ', 'ar')).toBeNull();
  });
});
