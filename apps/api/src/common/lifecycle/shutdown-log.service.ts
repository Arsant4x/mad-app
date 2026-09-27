import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

/**
 * **سطرا الإيقاف المنظَّم** (`ق-١٥٢٣`) — أوّلُهما حين تصل الإشارة، وثانيهما بعد إغلاق الخادم والاتصالات.
 *
 * قِيس قبلها (٢٦٨): إيقافُ الحاوية والقاعدةُ قائمة ⟸ `11165 ms` ثم قتلٌ `137` **وآخرُ سطرٍ في السجلّ «API listening»** —
 * فلا يُعرف من السجلّ أن الخادمَ أُوقف أصلاً، دَعْ أن يُعرف أنه أُوقف بانتظام. فالسطران هما ما يُقرأ في السجلّ:
 * الأوّلُ بلا الثاني إيقافٌ بدأ ولم يتمّ.
 */
@Injectable()
export class ShutdownLogService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger('Shutdown');

  beforeApplicationShutdown(signal?: string): void {
    this.logger.log(`بدأ الإيقافُ المنظَّم (${signal ?? 'بلا إشارة'})`);
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.log(`تمّ الإيقافُ المنظَّم (${signal ?? 'بلا إشارة'})`);
  }
}
