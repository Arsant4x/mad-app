import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PermissionsModule } from '../delegations/permissions.module';

/**
 * ⚠️ يستورد `PermissionsModule` — **لا نسخةَ حسابٍ ثانية**.
 *
 * `canOpenTarget` و`allowedTransitions` يُشتقّان من `PermissionsService`
 * نفسها التي تقرأها الواجهة. وحسابٌ محلّيٌّ هنا يفترق عنها عند أول تعديل
 * بلا شكوى — فيرى المكلَّف زرّاً يرفضه الخادم، أو العكس.
 */
@Module({
  imports: [PermissionsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
