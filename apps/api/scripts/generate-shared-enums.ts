/**
 * يولّد `packages/shared/src/api/enums.ts` وملفَّ الوحدة السعودية بجانبه من سجلّ التعدادات `docs/web-enum-mirrors.json` (`ق-١٣٨٤`).
 *
 *   npx ts-node scripts/generate-shared-enums.ts        (من apps/api)
 *
 * لا يقرأ الذاكرة ولا يكتب بيد: يرسم النصَّين بالدالّة نفسِها التي يستعملها الحارس
 * (`shared-enums-generated.spec.ts`)، فما يكتبه هنا هو ما يوجبه الحارسُ هناك.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderSharedEnums, SHARED_ENUMS_PATH, SHARED_UNIT_ENUMS_PATH } from '../src/common/shared-enums.util';

const { general, unit, enums } = renderSharedEnums();
for (const [path, next] of [
  [SHARED_ENUMS_PATH, general],
  [SHARED_UNIT_ENUMS_PATH, unit],
] as const) {
  let current: string | null = null;
  try {
    current = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    current = null;
  }
  if (current === next) {
    console.log(`لا تغيير — ${path} مطابقٌ لمصدره.`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
    console.log(`كُتب ${path} (${next.split('\n').length} سطراً).`);
  }
}
console.log(`التعدادات: ${enums.length} · منها بعلامةٍ سعودية: ${enums.filter((e) => e.saudi).map((e) => e.name).join(' · ')}`);
