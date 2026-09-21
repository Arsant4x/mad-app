/**
 * يولّد `packages/shared/src/permissions.ts` من `apps/api/src/templates/screens.ts` (`ق-١٢٣٤`).
 *
 *   npx ts-node scripts/generate-shared-permissions.ts        (من apps/api)
 *
 * لا يقرأ الذاكرة ولا يكتب بيد: يرسم النصَّ بالدالّة نفسِها التي يستعملها الحارس
 * (`shared-permissions-generated.spec.ts`)، فما يكتبه هنا هو ما يوجبه الحارسُ هناك.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderSharedPermissions, SHARED_PERMISSIONS_PATH } from '../src/templates/shared-permissions.util';

const next = renderSharedPermissions();
let current: string | null = null;
try {
  current = readFileSync(SHARED_PERMISSIONS_PATH, 'utf8').replace(/\r\n/g, '\n');
} catch {
  current = null;
}
if (current === next) {
  console.log(`لا تغيير — ${SHARED_PERMISSIONS_PATH} مطابقٌ لمصدره.`);
} else {
  writeFileSync(SHARED_PERMISSIONS_PATH, next);
  console.log(`كُتب ${SHARED_PERMISSIONS_PATH} (${next.split('\n').length} سطراً).`);
}
