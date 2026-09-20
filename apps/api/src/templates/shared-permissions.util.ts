import { join } from 'node:path';
import { ALLOWED_SCREENS, SCREEN_ACTIONS } from './screens';

/**
 * **مفرداتُ الصلاحيات مولَّدةٌ لا منسوخة** (`ق-١٢٣٤`).
 *
 * `ALLOWED_SCREENS` و`SCREEN_ACTIONS` مصدرُهما الواحد هنا (`screens.ts`)؛ وكانت الواجهةُ
 * تحمل **نسخةً يدوية** منهما في `apps/web/src/api/templates.ts` بتعليق «keep in sync» —
 * وهو ما لا يُتذكَّر. فالملفُّ `packages/shared/src/permissions.ts` **يُرسَم من هنا** بهذه
 * الدالّة، والواجهةُ تستورده، والحارسُ `shared-permissions-generated.spec.ts` يرسمه من جديد
 * كلَّ تشغيلٍ ويقارنه بما على القرص حرفاً — فشاشةٌ تُضاف هنا ولا يُعاد التوليد **تُسقط
 * الحزمةَ** باسم الأمر الذي يُصلحها.
 *
 * والمولَّدُ بياناتٌ لا سلوك: القوائمُ والأنواعُ ومفاتيحُ `شاشة:فعل` (`24 × 7 = 168`) — لا
 * منطقَ إنفاذ؛ الإنفاذُ في `TenantGuard` وحده.
 */
export const SHARED_PERMISSIONS_PATH = join(__dirname, '..', '..', '..', '..', 'packages', 'shared', 'src', 'permissions.ts');

export const REGENERATE_COMMAND = 'npx ts-node scripts/generate-shared-permissions.ts  (من apps/api)';

export function renderSharedPermissions(): string {
  const screens = ALLOWED_SCREENS.map((s) => `  '${s}',`).join('\n');
  const actions = SCREEN_ACTIONS.map((a) => `'${a}'`).join(', ');
  const keys = ALLOWED_SCREENS.flatMap((s) => SCREEN_ACTIONS.map((a) => `  '${s}:${a}',`)).join('\n');
  return [
    '// ⛔ مولَّدٌ — لا يُحرَّر بيد.',
    '// المصدرُ: apps/api/src/templates/screens.ts (ALLOWED_SCREENS × SCREEN_ACTIONS)',
    `// يُعاد توليدُه بـ: ${REGENERATE_COMMAND}`,
    '// والحارسُ apps/api/src/templates/shared-permissions-generated.spec.ts يُسقط الحزمةَ إن اختلف عن مصدره.',
    '',
    '/** الشاشاتُ التي يحرسها `@RequiresScreen` — بترتيب المصدر. */',
    'export const ALLOWED_SCREENS = [',
    screens,
    '] as const;',
    'export type ScreenKey = (typeof ALLOWED_SCREENS)[number];',
    '',
    '/** الأفعالُ التي تُمنح على شاشة — بترتيب المصدر. */',
    `export const SCREEN_ACTIONS = [${actions}] as const;`,
    'export type ScreenAction = (typeof SCREEN_ACTIONS)[number];',
    '',
    `/** كلُّ زوجٍ \`شاشة:فعل\` — ${ALLOWED_SCREENS.length} × ${SCREEN_ACTIONS.length} = ${ALLOWED_SCREENS.length * SCREEN_ACTIONS.length}. */`,
    'export const PERMISSION_KEYS = [',
    keys,
    '] as const;',
    'export type PermissionKey = (typeof PERMISSION_KEYS)[number];',
    '',
    'export function permissionKey(screen: ScreenKey, action: ScreenAction): PermissionKey {',
    '  return `${screen}:${action}` as PermissionKey;',
    '}',
    '',
  ].join('\n');
}
