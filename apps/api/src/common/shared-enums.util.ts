import { join } from 'node:path';
import { COUNTRY_MARKERS, SAUDI_UNIT_PATH_MARK } from './country-literals.util';
import { MirrorEntry, PrismaShape, readPrisma, readRegistry, REPO_ROOT, serverValues } from './web-enum-mirrors.util';

/**
 * ⚖️ `ق-١٣٨٤` — **تعداداتُ الواجهة مولَّدةٌ بأسمائها من سجلّ `#579` لا منسوخة** (خطّةُ الأنواع ③ — الخيار (ب) بحكم المالك:
 * «التعداداتُ الخمسةُ والسبعون بأسمائها من سجلّ `#579`»).
 *
 * **السجلُّ نفسُه خريطةُ المولِّد**: `docs/web-enum-mirrors.json` يربط كلَّ تعدادٍ في الواجهة بمصدره المقروء في الخادم (`Prisma` ·
 * مصفوفةٌ ثابتة · اتّحاد · `@IsIn`)، و`serverValues()` — الدالّةُ التي يقارن بها حارسُ `ق-١٣٦٧` — تقرأ القيمَ منه. فيُرسَم لكلِّ
 * مدخلٍ ثابتُ قيمٍ ونوعٌ مشتقٌّ منه، **بترتيب المصدر**، في `packages/shared/src/api/`؛ والواجهةُ تستورده وتُعيد تصديرَه بالاسم نفسِه.
 *
 * **والملفّان مشتقّان لا مسرودان**: مدخلٌ يحمل تصريحُه المرسومُ علامةً سعودية (`COUNTRY_MARKERS` — الحارسُ نفسُه) يُكتب في ملفّ
 * الوحدة (اسمُه من `SAUDI_UNIT_PATH_MARK` — حدُّ الوحدة بمصدره الواحد، `ق-١٣٥٠`)، والباقي في `enums.ts`. فلا قائمةَ بيدٍ تتخلّف.
 *
 * ⚠️ **وحدُّه معلَن**: يرسم **القيمَ** لا ما يضيّقه الاستعمال — والواجهةُ تُبقي بيدها ما هو اشتقاقٌ منها (`Exclude<…>` ·
 * اتّحادُ أنواع)؛ وكلُّ ذلك يبقى تحت حارس `ق-١٣٦٧` (② التطابق).
 */
export const SHARED_API_DIR = join(REPO_ROOT, 'packages', 'shared', 'src', 'api');
export const SHARED_ENUMS_PATH = join(SHARED_API_DIR, 'enums.ts');
export const SHARED_UNIT_ENUMS_PATH = join(SHARED_API_DIR, `${SAUDI_UNIT_PATH_MARK}-enums.ts`);
export const REGENERATE_ENUMS_COMMAND = 'npx ts-node scripts/generate-shared-enums.ts  (من apps/api)';

/** `AccountType` ⟵ `ACCOUNT_TYPE_VALUES` — والأحرفُ الكبيرةُ المتتالية تبقى كلمةً واحدة. */
export function valuesConstName(typeName: string): string {
  return `${typeName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toUpperCase()}_VALUES`;
}

export interface RenderedEnum {
  name: string;
  constName: string;
  values: string[];
  entry: MirrorEntry;
  /** يحمل تصريحُه علامةً سعودية ⟸ ملفُّ الوحدة. */
  saudi: boolean;
}

/** التصريحُ الذي يُكتب لمدخلٍ واحد — ومنه تُحسب العلامة، فلا يفترق ما يُفحص عمّا يُكتب. */
export function renderDeclaration(e: Pick<RenderedEnum, 'name' | 'constName' | 'values' | 'entry'>): string {
  const vals = e.values.map((v) => `'${v}'`).join(', ');
  return [
    `/** \`${e.entry.server}\` — ويقابلُه \`${e.entry.web}\`. */`,
    `export const ${e.constName} = [${vals}] as const;`,
    `export type ${e.name} = (typeof ${e.constName})[number];`,
  ].join('\n');
}

export function collectEnums(prisma: PrismaShape = readPrisma(), root = REPO_ROOT): RenderedEnum[] {
  const registry = readRegistry(root);
  const out: RenderedEnum[] = [];
  const stale: string[] = [];
  for (const entry of registry.mirrors) {
    const name = entry.web.split('#')[1];
    const values = serverValues(entry.server, prisma, root);
    if (!values || values.length === 0) {
      stale.push(`${entry.web} ⟵ ${entry.server}`);
      continue;
    }
    const constName = valuesConstName(name);
    // كما يعدّ الحارسُ: أسطرُ الشيفرة وحدَها (التعليقُ يُجرَّد قبل المطابقة) — فمسارُ المصدر في التعليق لا يجرّ مدخلاً إلى ملفّ الوحدة.
    const codeLines = renderDeclaration({ name, constName, values, entry })
      .split('\n')
      .filter((line) => line.startsWith('export '));
    const saudi = COUNTRY_MARKERS.some((m) => codeLines.some((line) => m.re.test(line)));
    out.push({ name, constName, values, entry, saudi });
  }
  if (stale.length) throw new Error(`سجلُّ التعدادات متقادم — مراجعُ لا تُحلّ في الخادم:\n${stale.join('\n')}`);
  const names = out.map((e) => e.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) throw new Error(`أسماءٌ مكرَّرة في السجلّ — لا يُولَّد اسمٌ مرّتين: ${[...new Set(dup)].join(' · ')}`);
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function header(what: string): string[] {
  return [
    '// ⛔ مولَّدٌ — لا يُحرَّر بيد.',
    `// المصدرُ: docs/web-enum-mirrors.json (سجلُّ #579) — قيمُ كلِّ تعدادٍ من مقابله في الخادم، بترتيبه. ${what}`,
    `// يُعاد توليدُه بـ: ${REGENERATE_ENUMS_COMMAND}`,
    '// والحارسُ apps/api/src/common/shared-enums-generated.spec.ts يُسقط الحزمةَ إن اختلف عن مصدره.',
    '',
  ];
}

/** الملفّان كما يُكتبان — والحارسُ يرسمهما بهذه الدالّة نفسِها ويقارن. */
export function renderSharedEnums(prisma?: PrismaShape, root = REPO_ROOT): { general: string; unit: string; enums: RenderedEnum[] } {
  const enums = collectEnums(prisma, root);
  const body = (list: RenderedEnum[]) => list.map((e) => renderDeclaration(e)).join('\n\n');
  return {
    enums,
    general: [...header('(ما لا يحمل علامةً سعودية)'), body(enums.filter((e) => !e.saudi)), ''].join('\n'),
    unit: [...header('(ما يحمل علامةً سعودية — حدُّ الوحدة: ق-١٣٥٠)'), body(enums.filter((e) => e.saudi)), ''].join('\n'),
  };
}
