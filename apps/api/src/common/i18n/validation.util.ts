import { BadRequestException, ValidationError } from '@nestjs/common';
import { Language } from './messages';

/**
 * تعريب رسائل `class-validator`.
 *
 * **لماذا في الخادم لا في الواجهة:** الرسائل تولد هنا بالإنجليزية
 * (`baseSalary must be a number conforming to the specified constraints`)
 * وتصل المستخدم العربي كما هي. وتعريبها في الواجهة يعني تحليل نصٍّ إنجليزي
 * بتعابير نمطية في كل شاشة — هشٌّ ومكرَّر. وهنا نملك **مفتاح القيد** نفسه
 * (`isNumber` · `isDateString` …) لا نصَّه، فالترجمة تصير مطابقةً لا تخميناً،
 * وتغطي **كل مسار في الـAPI** دفعةً واحدة لا الاثني عشر التي رُصدت.
 *
 * المسار: `validationExceptionFactory` يحوّل كل خطأ إلى حمولةٍ مقروءة آلياً
 * (`@v:<القيد>|<الحقل>|<إضافة>`)، و`HttpExceptionFilter` يترجمها بلغة الطلب.
 * فصلُ التوليد عن الترجمة مقصود: اللغة تُعرف عند الردّ لا عند التحقّق.
 */
const PREFIX = '@v:';

/** نصوص القيود. `{field}` اسم الحقل بعد ترجمته، و`{extra}` قيمة مستخرَجة. */
const CONSTRAINTS: Record<string, { ar: string; en: string }> = {
  isNotEmpty: { ar: '{field} مطلوب', en: '{field} is required' },
  isDefined: { ar: '{field} مطلوب', en: '{field} is required' },
  isString: { ar: '{field} يجب أن يكون نصاً', en: '{field} must be text' },
  isNumber: { ar: '{field} يجب أن يكون رقماً', en: '{field} must be a number' },
  isInt: { ar: '{field} يجب أن يكون رقماً صحيحاً', en: '{field} must be a whole number' },
  isPositive: { ar: '{field} يجب أن يكون أكبر من صفر', en: '{field} must be greater than zero' },
  isBoolean: { ar: '{field} يجب أن يكون نعم أو لا', en: '{field} must be true or false' },
  isBooleanString: { ar: '{field} يجب أن يكون نعم أو لا', en: '{field} must be true or false' },
  isDateString: { ar: '{field} يجب أن يكون تاريخاً صالحاً', en: '{field} must be a valid date' },
  isISO8601: { ar: '{field} يجب أن يكون تاريخاً صالحاً', en: '{field} must be a valid date' },
  isArray: { ar: '{field} يجب أن يكون قائمة', en: '{field} must be a list' },
  arrayNotEmpty: { ar: '{field} لا يمكن أن يكون فارغاً', en: '{field} cannot be empty' },
  isObject: { ar: '{field} يجب أن يكون كائناً', en: '{field} must be an object' },
  isUuid: { ar: '{field} معرّف غير صالح', en: '{field} is not a valid identifier' },
  isEmail: { ar: '{field} بريد إلكتروني غير صالح', en: '{field} is not a valid email' },
  isLatitude: { ar: '{field} خط عرض غير صالح', en: '{field} is not a valid latitude' },
  isLongitude: { ar: '{field} خط طول غير صالح', en: '{field} is not a valid longitude' },
  min: { ar: '{field} لا يقل عن {extra}', en: '{field} must not be less than {extra}' },
  max: { ar: '{field} لا يزيد عن {extra}', en: '{field} must not be greater than {extra}' },
  length: { ar: '{field} طوله خارج الحد المسموح', en: '{field} has an invalid length' },
  isIn: { ar: '{field} يجب أن يكون أحد: {extra}', en: '{field} must be one of: {extra}' },
  isEnum: { ar: '{field} يجب أن يكون أحد: {extra}', en: '{field} must be one of: {extra}' },
  whitelistValidation: { ar: 'حقل غير معروف: {field}', en: 'Unknown field: {field}' },
};

/** احتياطيٌّ لأي قيدٍ لم يُدرَج — يبقى عربياً ولا يُفشي نصّاً إنجليزياً. */
const FALLBACK = { ar: 'قيمة غير صالحة في {field}', en: 'Invalid value for {field}' };

/**
 * أسماء الحقول كما يراها المستخدم.
 *
 * ليست ترجمةً حرفية بل **اسم الحقل في الشاشة**: `fullName` تظهر «اسم الموظف»
 * لا «الاسم الكامل»، لأن الرسالة تُقرأ بجانب الحقل نفسه. وما لا يوجد هنا
 * يُعرض باسمه البرمجي — نقصٌ مقروء أفضل من ترجمةٍ مخترَعة.
 */
const FIELDS: Record<string, { ar: string; en: string }> = {
  fullName: { ar: 'اسم الموظف', en: 'Employee name' },
  jobTitle: { ar: 'المسمّى الوظيفي', en: 'Job title' },
  department: { ar: 'القسم', en: 'Department' },
  hireDate: { ar: 'تاريخ المباشرة', en: 'Hire date' },
  baseSalary: { ar: 'الراتب الأساسي', en: 'Base salary' },
  branchId: { ar: 'الفرع', en: 'Branch' },
  name: { ar: 'الاسم', en: 'Name' },
  code: { ar: 'الرمز', en: 'Code' },
  phone: { ar: 'رقم الجوال', en: 'Phone' },
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  status: { ar: 'الحالة', en: 'Status' },
  iban: { ar: 'الآيبان', en: 'IBAN' },
  openingBalance: { ar: 'الرصيد الافتتاحي', en: 'Opening balance' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  quantity: { ar: 'الكمية', en: 'Quantity' },
  unitPrice: { ar: 'سعر الوحدة', en: 'Unit price' },
  price: { ar: 'السعر', en: 'Price' },
  date: { ar: 'التاريخ', en: 'Date' },
  dueDate: { ar: 'تاريخ الاستحقاق', en: 'Due date' },
  issueDate: { ar: 'تاريخ الإصدار', en: 'Issue date' },
  startDate: { ar: 'تاريخ البداية', en: 'Start date' },
  endDate: { ar: 'تاريخ النهاية', en: 'End date' },
  customerId: { ar: 'العميل', en: 'Customer' },
  supplierId: { ar: 'المورّد', en: 'Supplier' },
  productId: { ar: 'المنتج', en: 'Product' },
  accountId: { ar: 'الحساب', en: 'Account' },
  invoiceId: { ar: 'الفاتورة', en: 'Invoice' },
  vatNumber: { ar: 'الرقم الضريبي', en: 'VAT number' },
  crNumber: { ar: 'رقم السجل التجاري', en: 'CR number' },
  username: { ar: 'اسم المستخدم', en: 'Username' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  orgName: { ar: 'اسم المنشأة', en: 'Organization name' },
  notes: { ar: 'الملاحظات', en: 'Notes' },
  description: { ar: 'الوصف', en: 'Description' },
  months: { ar: 'عدد الأشهر', en: 'Months' },
  items: { ar: 'البنود', en: 'Items' },
  lines: { ar: 'السطور', en: 'Lines' },
};

/**
 * يستخرج القيمة المفيدة من نصّ `class-validator` الإنجليزي.
 *
 * القيمة العددية للحد (`min`/`max`) وقائمة الخيارات (`isIn`/`isEnum`) لا
 * تصل في `ValidationError` منفصلةً عن النص، فتُقرأ منه هنا — في مكانٍ واحد
 * وقتَ التوليد، لا في كل شاشة.
 */
function extractFrom(constraint: string, text: string): string {
  if (constraint === 'min' || constraint === 'max') {
    const nums = text.match(/-?\d+(?:\.\d+)?/g);
    return nums ? nums[nums.length - 1] : '';
  }
  if (constraint === 'isIn' || constraint === 'isEnum') {
    const idx = text.indexOf(':');
    // بلا مسافات: الحمولة تُنقل كسطرٍ واحد ويفصلها `|` وحده.
    return idx === -1 ? '' : text.slice(idx + 1).trim().split(/\s*,\s*/).join(',');
  }
  return '';
}

/** يسطّح شجرة الأخطاء (مع `@ValidateNested`) إلى حمولات مسطّحة. */
function flatten(errors: ValidationError[], path = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const property = path ? `${path}.${err.property}` : err.property;
    for (const [constraint, text] of Object.entries(err.constraints ?? {})) {
      out.push(`${PREFIX}${constraint}|${property}|${extractFrom(constraint, String(text))}`);
    }
    if (err.children?.length) out.push(...flatten(err.children, property));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = flatten(errors);
  return new BadRequestException({
    statusCode: 400,
    // لا يبقى فارغاً أبداً: ردٌّ 400 بلا سبب هو العطل الذي نُصلحه.
    message: messages.length ? messages : [`${PREFIX}fallback|`],
    error: 'Bad Request',
  });
}

/** يترجم حمولة تحقّق. يعيد `null` لأي نصٍّ ليس منها — فيمرّ كما هو. */
export function localizeValidation(raw: string, language: Language): string | null {
  if (typeof raw !== 'string' || !raw.startsWith(PREFIX)) return null;
  const [constraint, property = '', extra = ''] = raw.slice(PREFIX.length).split('|');

  const template = CONSTRAINTS[constraint] ?? FALLBACK;
  // اسم الحقل الأخير في المسار: `items.0.quantity` ⇒ `quantity`.
  const leaf = property.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? property;
  const field = FIELDS[leaf]?.[language] ?? leaf;

  return template[language].split('{field}').join(field).split('{extra}').join(extra.split(',').join('، '));
}
