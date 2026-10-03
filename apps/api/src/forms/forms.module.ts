import { Module } from '@nestjs/common';
import { AdminFormTemplatesController, AdminFormTypesController } from './admin-forms.controller';
import { FormInstancesService } from './form-instances.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

/**
 * ⚖️ **محرّكُ النماذج المهيكلة** (`docs/plans/handover-forms-master-plan.md` §٦ · توجيه ٢٧٨ · `ق-١٦٣٤` · `ق-١٦٣٦`).
 * الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة · الموجةُ ١ج: السجلُّ المعبّأ والختم (`FormInstancesService` يُصدَّر للأنشطة التي تطلب النموذج
 * لموضوعها، كالعقد). محرّكٌ في طبقته (`docs/monorepo-layers.json`): لا يعرف نشاطاً، والنشاطُ يضبطه بإعداداته.
 */
@Module({
  controllers: [AdminFormTypesController, AdminFormTemplatesController, FormTemplatesController],
  providers: [FormTemplatesService, FormInstancesService],
  exports: [FormTemplatesService, FormInstancesService],
})
export class FormsModule {}
