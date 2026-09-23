import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * **شقُّ الصحّة** (`ق-١٣١٨` · ⑪A3 — باب `⑪ تشغيلُ المنصّة`، مُسح).
 *
 * «عطلٌ يقع اليوم بلا أثرٍ مجمَّع **لا يُعاد تركيبُه بعد يوم**» (`docs/domain-scan/11` · A3).
 *
 * ## ما يقرؤه — ولماذا هذه الثلاثة
 *
 * **أن يُجيب أصلاً** يُثبت أن العمليةَ حيّةٌ وأن المنفذَ يُصغي · **والقاعدة** بذهابٍ حقيقيّ
 * (`SELECT 1`) لا بوجود إعداد · **والمخزن** برأسِ الدلو. فخادمٌ يُجيب وقاعدتُه ساقطة **يبدو
 * حيّاً وهو لا يعمل** — وهو بعينه ما يجعل الفحصَ الساذج («أيُجيب المنفذ؟») يكذب.
 *
 * ## ⚠️ ولا يُفصح عمّا لا يلزم
 *
 * **قيمٌ منطقية فقط** — لا إصدارات ولا أسماءُ مضيفاتٍ ولا رسائلُ أخطاءٍ خام: هذا مسارٌ
 * **مكشوفٌ بلا مصادقة** (وإلا لم ينفع فحصَ الحاوية)، **وما يُفصح عنه يُقرأ من الخارج**.
 *
 * ## ورمزُ الحالة هو الحكم
 *
 * `200` سليم · `503` غيرُ سليم — **فالفحصُ الآليّ يقرأ الرمزَ لا النصّ**، وجسمٌ يقول
 * `"status":"down"` برمز `200` يُقرأ نجاحاً من كلِّ أداة.
 *
 * ## ⛔ وما لم يُبنَ معلَناً
 *
 * **تتبّعُ الأخطاء والمقاييسُ والإنذار ينتظر مزوّداً** (`ق-١٣١٨`): يُبنى ما لا يتوقّف عليه —
 * وهو هذا — **ويُعلَن الباقي** ولا يُدَّعى أنه مبنيّ.
 */
@Controller('health')
export class HealthController {
  /** عميلٌ خاصٌّ بالفحص: مهلةٌ قصيرة كي لا يعلّق الفحصُ نفسُه حين يسقط المخزن. */
  private readonly storage = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
    requestHandler: { requestTimeout: 3000, connectionTimeout: 2000 },
  });

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res() res: Response) {
    const [database, storage] = await Promise.all([this.pingDatabase(), this.pingStorage()]);
    const ok = database && storage;
    // الرمزُ هو الحكم — والجسمُ يقول **أيُّها** سقط.
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'down', checks: { database, storage } });
  }

  private pingDatabase(): Promise<boolean> {
    return this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
  }

  private pingStorage(): Promise<boolean> {
    return this.storage.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET ?? 'mad-app-files' })).then(
      () => true,
      () => false,
    );
  }
}
