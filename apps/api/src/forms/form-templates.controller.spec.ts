import { REQUIRES_ACTION_KEY } from '../common/tenant/requires-action.decorator';
import { REQUIRES_SCREEN_KEY } from '../common/tenant/requires-screen.decorator';
import { OWNER_ONLY_KEY } from '../common/tenant/owner-only.decorator';
import { TENANT_WIDE_KEY } from '../common/tenant/tenant-wide.decorator';
import { FormTemplatesController } from './form-templates.controller';

/**
 * ⚖️ **قوالبُ المنشأة يعدّلها المالكُ ومن يمنحه شاشةَ «النماذج»** (`ق-١٦٤١`/٢): كلُّ مسار كتابةٍ يحمل شاشةَ `forms` وفعلَه، ولا
 * يحمل «للمالك وحدَه»؛ والقراءةُ بلا شاشةٍ فيغلبها وسمُ الصنف (`@TenantWide`) لكلِّ فاعل. ويقرأ الحارسُ الوسومَ كما يقرؤها
 * `TenantGuard` (الدالّةُ قبل الصنف)، والسلوكُ الحيّ في `test/form-templates.e2e-spec.ts` ⑧.
 */
const meta = (key: string, handler: keyof FormTemplatesController) =>
  Reflect.getMetadata(key, FormTemplatesController.prototype[handler]) ?? Reflect.getMetadata(key, FormTemplatesController);

describe('مساراتُ قوالب المنشأة بشاشة «النماذج» وأفعالها (ق-١٦٤١/٢)', () => {
  const WRITES: [keyof FormTemplatesController, string][] = [
    ['copy', 'add'],
    ['newVersion', 'add'],
    ['update', 'edit'],
    ['publish', 'review'],
    ['remove', 'delete'],
  ];

  it.each(WRITES)('⭐ %s على شاشة «النماذج» بفعل %s، ولا «للمالك وحدَه»', (handler, action) => {
    expect(meta(REQUIRES_SCREEN_KEY, handler)).toBe('forms');
    expect(meta(REQUIRES_ACTION_KEY, handler)).toBe(action);
    expect(meta(OWNER_ONLY_KEY, handler)).toBeUndefined();
  });

  it('والقراءةُ لكلِّ فاعل: بلا شاشة، ووسمُ الصنف يعلنها', () => {
    for (const handler of ['list', 'catalog', 'get'] as const) {
      expect(Reflect.getMetadata(REQUIRES_SCREEN_KEY, FormTemplatesController.prototype[handler])).toBeUndefined();
    }
    expect(Reflect.getMetadata(TENANT_WIDE_KEY, FormTemplatesController)).toEqual(expect.any(String));
  });
});
