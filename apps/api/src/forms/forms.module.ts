import { Module } from '@nestjs/common';
import { AdminFormTemplatesController, AdminFormTypesController } from './admin-forms.controller';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

/**
 * ⚖️ **محرّكُ النماذج المهيكلة** (`docs/plans/handover-forms-master-plan.md` §٦ · توجيه ٢٧٨ · `ق-١٦٣٤`).
 * الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة. والتعبئةُ والختمُ والطباعةُ موجاتٌ تليها.
 * محرّكٌ في طبقته (`docs/monorepo-layers.json`): لا يعرف نشاطاً، والنشاطُ يضبطه بإعداداته.
 */
@Module({
  controllers: [AdminFormTypesController, AdminFormTemplatesController, FormTemplatesController],
  providers: [FormTemplatesService],
  exports: [FormTemplatesService],
})
export class FormsModule {}
