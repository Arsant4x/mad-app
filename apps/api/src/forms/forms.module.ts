import { Module } from '@nestjs/common';
import { AdminFormTemplatesController, AdminFormTypesController } from './admin-forms.controller';
import { FormInstancesService } from './form-instances.service';
import { FormSigningSettingsController } from './form-signing-settings.controller';
import { FormSigningSettingsService } from './form-signing-settings.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

/**
 * ⚖️ **محرّكُ النماذج المهيكلة** (`docs/plans/handover-forms-master-plan.md` §٦ · توجيه ٢٧٨ · `ق-١٦٣٤` · `ق-١٦٣٦`).
 * الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة · الموجةُ ١ج: السجلُّ المعبّأ والختم (`FormInstancesService` يُصدَّر للأنشطة التي تطلب النموذج
 * لموضوعها، كالعقد) · وإعدادُ التوقيع (توجيه ٢٨٧). محرّكٌ في طبقته (`docs/monorepo-layers.json`): لا يعرف نشاطاً، والنشاطُ يضبطه بإعداداته.
 */
@Module({
  controllers: [AdminFormTypesController, AdminFormTemplatesController, FormTemplatesController, FormSigningSettingsController],
  providers: [FormTemplatesService, FormInstancesService, FormSigningSettingsService],
  exports: [FormTemplatesService, FormInstancesService, FormSigningSettingsService],
})
export class FormsModule {}
