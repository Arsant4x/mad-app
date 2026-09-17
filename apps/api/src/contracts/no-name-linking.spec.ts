/**
 * حارسٌ: **المستأجرُ يُربط بالعميل بالمعرّف لا بالاسم** (`§6.3` · `ق-٤٩٧` · `ق-١٠٢٨` · `ق-١٠٢٩`/②).
 *
 * كانت في `contracts.service.ts` دالّةٌ `syncTenantCustomer` تبحث عن العميل **باسمه**
 * (`customer.findFirst({ where: { name } })`) فتدهس هاتفَه أو تُنشئه ضمنياً — فاندمج مستأجران
 * بالاسم نفسِه في عميلٍ واحد، والتُهم عميلُ بيعٍ قائم، وسقط عقدٌ جديد بخطأِ خادمٍ خامٍ حين كان
 * الاسمُ في السلة (`ق-١٠٢٠`). حُذفت بحكم المالك، والعقدُ يُنشأ بـ`customerId` يُختار أو يُنشأ صراحةً.
 *
 * ما يُمنع في وحدة العقود (بلا ملفّات الاختبار):
 *   ① عودةُ الاسم `syncTenantCustomer` أو أيُّ بحثٍ عن عميلٍ بالاسم (`customer.findFirst` / `findMany`
 *      مع `name` في شرطه) — فالعميلُ يُقرأ بمعرّفه وحدَه.
 *   ② إنشاءُ عميلٍ من داخل وحدة العقود (`customer.create`) — الإنشاءُ الصريح بابُه وحدةُ العملاء.
 *   ③ قراءةُ `dto.tenant` أو `dto.phone` — فالحقلان مشتقّان من العميل لا مُدخَلان.
 *
 * يقرأ المصدرَ لا المخرَج (`§8.7`)، ويجرّد التعليقاتِ قبل المطابقة كي لا يُدين شرحَ ما مُنع (`§8.24`)،
 * ويُثبَت أنه يرى (must-hit على عيّناتٍ تُبنى بدالّة) وأنه لا يُدين البريء (must-miss على الملفّ الحيّ).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACTS_DIR = join(__dirname);

/** يجرّد التعليقات (سطريةً وكتليةً) مع حفظ المواضع كي يصدق رقمُ السطر. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

export interface NameLinkingHit {
  rule: string;
  line: number;
  text: string;
}

/** الأسماءُ الممنوعة تُبنى من أجزاءٍ كي لا تظهر حرفياً في هذا الملفّ فيُدين نفسَه (`§8.7` الوجه السادس عشر). */
const banned = () => ({
  syncName: ['sync', 'Tenant', 'Customer'].join(''),
  findByName: /\bcustomer\.find(First|Many)\s*\(\s*\{[^}]*where\s*:\s*\{[^}]*\bname\b/s,
  createCustomer: /\bcustomer\.create\s*\(/,
  dtoTenant: /\bdto\.(tenant|phone)\b/,
});

export function findNameLinking(source: string): NameLinkingHit[] {
  const hits: NameLinkingHit[] = [];
  const clean = stripComments(source);
  const b = banned();
  const lines = clean.split(/\r?\n/);
  lines.forEach((text, i) => {
    const line = i + 1;
    if (text.includes(b.syncName)) hits.push({ rule: 'sync-by-name', line, text: text.trim() });
    if (b.createCustomer.test(text)) hits.push({ rule: 'creates-customer', line, text: text.trim() });
    if (b.dtoTenant.test(text)) hits.push({ rule: 'reads-dto-tenant', line, text: text.trim() });
  });
  // البحثُ بالاسم قد يمتدّ على أسطرٍ — يُطابَق على الملفّ كلِّه ويُنسب إلى سطر بدايته.
  const m = b.findByName.exec(clean);
  if (m) hits.push({ rule: 'finds-customer-by-name', line: clean.slice(0, m.index).split('\n').length, text: m[0].split('\n')[0].trim() });
  return hits;
}

const listSources = (dir: string): string[] =>
  readdirSync(dir)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts') && !n.endsWith('.e2e-spec.ts'))
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isFile());

describe('حارسُ الربط بالمعرّف — وحدةُ العقود لا تبحث عن عميلٍ بالاسم ولا تُنشئه', () => {
  it('يرى ما بُني ليمسكه (must-hit) — عيّناتٌ بصياغةِ مطوّر', () => {
    const sample = [
      `private async ${['sync', 'Tenant', 'Customer'].join('')}(tx, name) {`,
      `  const existing = await tx.customer.findFirst({ where: { name } });`,
      `  return tx.customer.create({ data: { name } });`,
      `}`,
      `const tenant = dto.tenant.trim();`,
    ].join('\n');
    const rules = findNameLinking(sample).map((h) => h.rule);
    expect(rules).toEqual(expect.arrayContaining(['sync-by-name', 'finds-customer-by-name', 'creates-customer', 'reads-dto-tenant']));
  });

  it('لا يُدين شرحاً في تعليق (must-miss)', () => {
    const sample = `// كانت هنا ${['sync', 'Tenant', 'Customer'].join('')} تبحث بـ customer.findFirst({ where: { name } })\nconst c = await tx.customer.findUnique({ where: { id: dto.customerId } });`;
    expect(findNameLinking(sample)).toEqual([]);
  });

  it('⭐ وحدةُ العقود الحيّة خاليةٌ من الربط بالاسم', () => {
    const files = listSources(CONTRACTS_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((f) => findNameLinking(readFileSync(f, 'utf8')).map((h) => `${f}:${h.line} [${h.rule}] ${h.text}`));
    expect(offenders).toEqual([]);
  });
});
