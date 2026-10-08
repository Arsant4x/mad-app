import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminFormTemplatesController, AdminFormTypesController } from './admin-forms.controller';
import { FormInstancesService } from './form-instances.service';
import { FormPublicController } from './form-public.controller';
import { FormPublicService } from './form-public.service';
import { FormSigningSettingsController } from './form-signing-settings.controller';
import { FormSigningSettingsService } from './form-signing-settings.service';
import { FormSigningService } from './form-signing.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

/**
 * ⚖️ **محرّكُ النماذج المهيكلة** (`docs/plans/handover-forms-master-plan.md` §٦ · توجيه ٢٧٨ · `ق-١٦٣٤` · `ق-١٦٣٦`).
 * الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة · الموجةُ ١ج: السجلُّ المعبّأ والختم (`FormInstancesService` يُصدَّر للأنشطة التي تطلب النموذج
 * لموضوعها، كالعقد) · وإعدادُ التوقيع ومسارُه (توجيه ٢٨٧: `FormSigningService` لجهة الموظّف، وصفحةُ الرابط العامّة `FormPublicController`).
 * محرّكٌ في طبقته (`docs/monorepo-layers.json`): لا يعرف نشاطاً، والنشاطُ يضبطه بإعداداته.
 */
@Module({
  imports: [FilesModule, VerificationModule],
  controllers: [AdminFormTypesController, AdminFormTemplatesController, FormTemplatesController, FormSigningSettingsController, FormPublicController],
  providers: [FormTemplatesService, FormInstancesService, FormSigningSettingsService, FormSigningService, FormPublicService],
  exports: [FormTemplatesService, FormInstancesService, FormSigningSettingsService, FormSigningService],
})
export class FormsModule {}
