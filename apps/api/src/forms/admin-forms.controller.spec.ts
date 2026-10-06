import { PLATFORM_ROLES_KEY } from '../common/platform-admin/platform-role.decorator';
import { AdminFormTemplatesController, AdminFormTypesController } from './admin-forms.controller';

/**
 * ⚖️ **القوالبُ العامّة لمالك المنصّة ومعه دورُ «الامتثال»** (`ق-١٦٤١`/١): لأن القالبَ يحمل نصوصاً نظامية. والمالكُ يمرّ كلَّ
 * مسارٍ بتعريف `PlatformAdminGuard` فلا يُكتب، والأدوارُ الأخرى تُردّ؛ والسلوكُ الحيّ في `test/form-templates.e2e-spec.ts` ⑦.
 */
describe('القوالبُ العامّة لمالك المنصّة ودور «الامتثال» (ق-١٦٤١/١)', () => {
  it.each([
    ['admin/form-types', AdminFormTypesController],
    ['admin/form-templates', AdminFormTemplatesController],
  ])('⭐ %s: «الامتثال» وحدَه مع المالك', (_path, controller) => {
    expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, controller)).toEqual(['COMPLIANCE']);
  });
});
