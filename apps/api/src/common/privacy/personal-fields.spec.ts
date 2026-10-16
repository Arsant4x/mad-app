import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@mad-app/db';
import { stripComments } from '../source-scan.util';
import {
  ADDRESS_PART_NAMES,
  CONTACT_FIELD_NAMES,
  DECLARED_NOT_REDACTED,
  FREE_TEXT_FIELD_NAMES,
  REDACTED_FIELD_NAMES,
  REDACTED_VALUE,
  isRedactedKey,
} from './personal-fields';

/**
 * حارسُ الحقول الشخصية في سجلّ التدقيق (`ق-١٢٧٨`/②).
 *
 * ثلاثةٌ يحرسها، وكلٌّ منها أُسقط بكسرٍ محتمل قبل الالتزام:
 *
 * ① **الاشتقاقُ من المخطَّط لا من قائمةٍ تُكتب يداً**: كلُّ حقلٍ نصّيٍّ في `schema.prisma`
 *    اسمُه يشبه حقلَ تواصلٍ أو ملاحظةً حرّة **إمّا مستبعَدٌ وإمّا مُعلَنٌ بحجّته** — فحقلٌ
 *    `contactEmail` يُضاف غداً يُسقط الحزمةَ حتى يُقرَّر. (عائلةُ `ق-٥٤٥`.)
 * ② **القيمةُ لا تعود**: `safeDetails` تكتب العلامةَ لا القيمة — يُقرأ من مصدر المعترض
 *    **مجرَّداً من التعليقات** (`§8.24`: حارسٌ يعاقب على التوثيق يُنتج شيفرةً صامتة).
 * ③ **المصدرُ واحد**: المحوُ يقرأ الأسماءَ من هذا الملفّ — فلا قائمتان تفترقان.
 */

const SRC = join(__dirname, '..', '..');

/** ما يشبه الشخصيَّ في المخطَّط — الاسمُ وحدَه، فالنموذجُ لا يعني المعترضَ (يقرأ جسمَ الطلب). */
// ⚖️ ومُعرِّفاتُ الشخص بأسمائها في الطلب (`ق-١٣٤٥` · توجيه ٢٨٦): لا تبقى أعمدةً صريحةً في المخطَّط بعد التشفير — فإن عاد عمودٌ
// باسمها صريحاً (`otherId` · `nationalId` …) أسقطه ① حتى يُستبعَد من السجلّ أو يُعلَن.
const LOOKS_PERSONAL = /^(phone|mobile|email|website|address|street|district|postalCode|buildingNo|additionalNumber|unitNumber|notes?|reason|description|remark|comment|memo|name|fullName|tenant|orgName|otherId|tenantIdNumber|nationalId|salaryIban|socialInsuranceNo)$/i;

/** Pay is personal whatever surrounds the word, and it is usually a number, not text. */
const LOOKS_LIKE_PAY = /(salary|wage|allowance|bonus|overtime|payroll|gratuity|stipend)/i;
const READ_TYPES = new Set(['String', 'Decimal', 'Int', 'BigInt', 'Float']);

type ModelShape = { fields: readonly { kind: string; type: string; name: string }[] };

/**
 * A column stored encrypted is named in request bodies by its plain name (the client sends `baseSalary`,
 * the table keeps `baseSalaryCipher`), so the suffix is dropped before the name is judged.
 */
function personalNamesOf(models: readonly ModelShape[]): string[] {
  const names = new Set<string>();
  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind !== 'scalar' || !READ_TYPES.has(f.type)) continue;
      const requestName = f.name.replace(/(Cipher|Index)$/, '');
      if (LOOKS_PERSONAL.test(requestName) || LOOKS_LIKE_PAY.test(requestName)) names.add(requestName);
    }
  }
  return [...names].sort();
}

function schemaPersonalNames(): string[] {
  return personalNamesOf(Prisma.dmmf.datamodel.models);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

describe('الحقولُ الشخصية في سجلّ التدقيق — مشتقّةٌ من المخطَّط، ومصدرُها واحد (ق-١٢٧٨/②)', () => {
  it('⓪ حارسٌ على المجسّ: المخطَّطُ يُقرأ فعلاً ويجد أسماءً معروفة', () => {
    const names = schemaPersonalNames();
    // مسبارٌ بحالتين: اسمٌ يقينُ وجوده، واسمٌ يقينُ غيابه.
    expect(names).toContain('phone');
    expect(names).toContain('notes');
    expect(names).not.toContain('qtyRemaining');
    expect(names.length).toBeGreaterThan(8);
  });

  it('reads numeric pay columns, and encrypted columns by their request names', () => {
    const shape = (fields: [string, string][]) => [{ fields: fields.map(([name, type]) => ({ kind: 'scalar', type, name })) }];
    // A numeric pay column must be seen, a numeric non-pay column must not.
    expect(personalNamesOf(shape([['housingAllowance', 'Decimal'], ['qtyRemaining', 'Decimal']]))).toEqual(['housingAllowance']);
    // An encrypted column is judged by the name the client sends.
    expect(personalNamesOf(shape([['baseSalaryCipher', 'String'], ['nationalIdIndex', 'String']]))).toEqual(['baseSalary', 'nationalId']);
    // A relation is not a column.
    expect(personalNamesOf([{ fields: [{ kind: 'object', type: 'Employee', name: 'salaryHolder' }] }])).toEqual([]);
    // And the schema itself carries the employee salary under its request name.
    expect(schemaPersonalNames()).toContain('baseSalary');
  });

  it('⭐ ① كلُّ اسمٍ يشبه الشخصيَّ في المخطَّط: مستبعَدٌ أو مُعلَنٌ بحجّته — لا ثالث', () => {
    const declared = new Set(DECLARED_NOT_REDACTED.map((d) => d.field.toLowerCase()));
    const orphans = schemaPersonalNames().filter((n) => !REDACTED_FIELD_NAMES.has(n.toLowerCase()) && !declared.has(n.toLowerCase()));
    expect(orphans).toEqual([]);
    // ولا إعلانَ بلا سبب — وإلا صار مفتاحَ إسكات.
    expect(DECLARED_NOT_REDACTED.filter((d) => d.reason.trim().length < 10)).toEqual([]);
  });

  it('⭐ ② المعترضُ يستبعد بالقيمة لا يقنّعها — ويقرأ الأسماءَ من هذا الملفّ', () => {
    const src = stripComments(readFileSync(join(SRC, 'audit', 'audit.interceptor.ts'), 'utf8'));
    expect(src).toContain("from '../common/privacy/personal-fields'");
    expect(src).toContain('isRedactedKey(key)');
    expect(src).toContain('REDACTED_VALUE');
    // قناعٌ بآخر أربعةٍ يُبقي بياناً شخصياً — فلا `slice(-4)` ولا `•` في المعترض.
    expect(/slice\(-\d\)|•{2,}/.test(src)).toBe(false);
  });

  it('⭐ ③ المحوُ يقرأ الأسماءَ من المصدر نفسِه — لا قائمةَ ثانية تفترق', () => {
    const src = stripComments(readFileSync(join(SRC, 'deletion-requests', 'personal-data-erasure.service.ts'), 'utf8'));
    expect(src).toContain("from '../common/privacy/personal-fields'");
    expect(src).toContain('PERSONAL_FIELD_NAMES = CONTACT_FIELD_NAMES');
  });

  it('④ الدالّةُ تُطابق بالاسم بلا حساسيةٍ لحالة الأحرف، والعلامةُ ليست فارغة', () => {
    expect(isRedactedKey('phone')).toBe(true);
    expect(isRedactedKey('Notes')).toBe(true);
    expect(isRedactedKey('POSTALCODE')).toBe(true);
    expect(isRedactedKey('name')).toBe(false);
    expect(isRedactedKey('total')).toBe(false);
    // ⚖️ توجيه ٢٨٦: معرّفُ المشتري البديل ورقمُ هويّة المستأجر — اسمُ الحقل يُكتب وقيمتُه لا تُكتب؛ والمخطّطُ (رمزٌ لا رقم) يبقى.
    expect(isRedactedKey('otherId')).toBe(true);
    expect(isRedactedKey('tenantIdNumber')).toBe(true);
    expect(isRedactedKey('otherIdScheme')).toBe(false);
    expect(isRedactedKey('baseSalary')).toBe(true);
    expect(REDACTED_VALUE.length).toBeGreaterThan(5);
    expect([...CONTACT_FIELD_NAMES, ...ADDRESS_PART_NAMES, ...FREE_TEXT_FIELD_NAMES].every((n) => REDACTED_FIELD_NAMES.has(n))).toBe(true);
  });

  it('⑤ كلُّ جدولٍ دوريٍّ يوميٍّ فأطول يُعلن منطقتَه — والحاويةُ UTC فجدولٌ بلا منطقة يقع في ساعةٍ غير المكتوبة (ق-١٢٧٩)', () => {
    const offenders: string[] = [];
    let crons = 0;
    for (const file of walk(SRC)) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/@Cron\(([^)]*)\)/g)) {
        crons += 1;
        const args = m[1];
        // ما يعمل كلَّ دقيقةٍ لا تعنيه المنطقة — يُستثنى بالاسم لا بالصمت.
        if (/EVERY_MINUTE|EVERY_\d+_(SECONDS|MINUTES)/.test(args)) continue;
        if (!/timeZone:\s*SCHEDULE_TIME_ZONE/.test(args)) offenders.push(`${file.slice(SRC.length + 1)} ⟵ ${args.trim().slice(0, 60)}`);
      }
    }
    expect(crons).toBeGreaterThanOrEqual(6);
    expect(offenders).toEqual([]);
  });
});
