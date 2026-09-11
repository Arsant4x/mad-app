import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminConsentController, ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

// ⚠️ `@Global` كما في وحدة إذن الدعم — **لأن حارسَ المستأجر يحقنها وهو في كلِّ متحكّم**،
// فبدونها يلزم استيرادُها في كلِّ وحدة، وأولُ وحدةٍ تُنسى تسقط عند الإقلاع لا عند الطلب.
@Global()
@Module({
  // NotificationsModule: التذكيرُ المتكرّر يمرّ بمسار الإشعارات نفسِه الذي يقرؤه التاجر.
  imports: [NotificationsModule],
  controllers: [ConsentController, AdminConsentController],
  providers: [ConsentService],
  // يُصدَّر ليقرأه حارسُ المستأجر: البوّابةُ تسأل «ما النسخةُ السارية؟» في كلِّ طلب.
  exports: [ConsentService],
})
export class ConsentModule {}
