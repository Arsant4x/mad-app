import { SetMetadata } from '@nestjs/common';
import { PlatformRole } from '@mad-app/db';

export const PLATFORM_ROLES_KEY = 'platformRoles';

/**
 * **من يدخل هذا المسار من مديري المنصّة** (`ق-١٣١٢` · ⑪A2).
 *
 * **و`OWNER` يمرّ دائماً** ولا يُكتب في القائمة — فهو الدورُ الذي يملك كلَّ شيءٍ بتعريفه،
 * وكتابتُه في كلِّ مسارٍ ضجيجٌ يُنسى مرّةً فيُمنع المالكُ من بابه.
 *
 * ⚠️ **ومسارٌ منصّيٌّ بلا هذا المُزخرِف يُدينه حارس** (`platform-role-declared.spec.ts`):
 * الصمتُ كان يعني «للجميع»، **وهو الحالُ الذي بُني هذا البند لإنهائه**.
 */
export const RequiresPlatformRole = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
