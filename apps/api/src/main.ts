import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ErrorReporter } from './common/error-tracking/error-reporter';
import { HttpExceptionFilter } from './common/i18n/http-exception.filter';
import { validationExceptionFactory } from './common/i18n/validation.util';
import { assertProductionSecrets } from './common/config/production-secrets';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/request-id/request-id.middleware';
import { buildOpenApiDocument } from './common/openapi-document';
import { applyApiVersioning } from './common/versioning';

async function bootstrap() {
  // قبل أي شيء آخر — قبل الاتصال بقاعدة البيانات وقبل فتح المنفذ: منصةٌ تُقلع
  // بمفتاح توقيع منشور في المستودع أسوأ من منصةٍ لا تُقلع.
  assertProductionSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // ⭐ الإيقافُ المنظَّم (`ق-١٥٢٣`): بلا هذا لا يسمع الخادمُ إشارةَ الإيقاف — قِيس: `docker stop` والقاعدةُ قائمة
  // ⟸ `11165 ms` ثم قتلٌ `137` بلا سطرٍ واحد. ومعه يُغلق المنفذَ ويُفرغ الاتصالاتِ ثم يخرج (سطرا `ShutdownLogService`).
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // خلف وسيط عاكس (Caddy/nginx) يصل كل طلب من عنوان الوسيط نفسه. بدون هذا
  // ينهار تحديد معدّل الدخول (10/دقيقة لكل IP) إلى **دلو واحد للعالم كله**:
  // يستنفده أي زائر فيُقفل الدخول على كل المستأجرين. ومعه يقرأ Express
  // X-Forwarded-For فيعود التحديد لكل عميل على حدة، وتصحّ الكوكيز الآمنة.
  // ثقةٌ بقفزة واحدة فقط — الوسيط على نفس الخادم، وتوسيعها يجعل الترويسة
  // قابلة للتزوير من الخارج.
  app.set('trust proxy', 1);

  // ⭐ الإصدارُ في المسار (ق-١٢٨٦ · ي/⑫A1): يُجيب كلُّ متحكّمٍ على `/v1/x` و`/x` معاً —
  // **قبل بناء وثيقة Swagger** كي تحملها، وقبل `listen` كي تُسجَّل المسارات بإصدارها.
  applyApiVersioning(app);

  // معرِّفُ الطلب **أوّلَ السلسلة** (ق-١٢٣٧): يُكتب على الاستجابة قبل أيّ معالجٍ أو حارس، فيحمله
  // `404` لمسارٍ لا وجود له و`401` قبل المصادقة و`500` لاستثناءٍ لم يُلتقط — لا الناجحُ وحدَه.
  app.use(requestIdMiddleware);

  // Standard hardening headers (HSTS, no-sniff, frame denial…). CSP is left
  // off: this process serves only a JSON API plus Swagger, and Swagger's inline
  // scripts break under a strict default CSP for no security gain here.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:5173'),
    credentials: true,
    // المتصفّحُ لا يقرأ رأساً مخصَّصاً حتى يُعلَن — بدونه يبقى المعرِّفُ في الشبكة ولا يصل شاشةَ الخطأ.
    // و`Content-Disposition` (`ق-١٥٠٦`): اسمُ ملفّ الفاتورة المجازة النظاميّ يُشتقّ في الخادم من المستند — والواجهةُ
    // على أصلٍ آخر لا تقرؤه حتى يُعلَن، فتُسمّي الملفَّ برقمه بدل اسمه النظاميّ.
    exposedHeaders: [REQUEST_ID_HEADER, 'Content-Disposition'],
  });
  // `exceptionFactory` يحوّل أخطاء class-validator إلى حمولاتٍ مقروءة آلياً
  // يترجمها المرشّح بلغة الطلب. بدونه تصل المستخدمَ العربي رسائل إنجليزية
  // خامّة مثل `baseSalary must be a number conforming to the specified
  // constraints` — وهي الرسائل التي كانت تظهر «خطأً غير واضح».
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  // Translates every error message into the caller's Accept-Language — see
  // common/i18n/http-exception.filter.ts. Registered after the pipe so it also
  // catches (and localizes) validation failures.
  // ③ (ق-١٣٣١): ومعه متتبّعُ الأخطاء — `null` بلا ERROR_TRACKING_DSN، فلا يُرسَل شيءٌ قبل أن يوجد خادمُه.
  app.useGlobalFilters(new HttpExceptionFilter(ErrorReporter.fromEnv(process.env)));

  // Swagger خارج الإنتاج فقط. المستند يعدّد كل نقطة نهاية وكل حقل في كل DTO،
  // أي أنه خريطة سطح الهجوم كاملةً مقدَّمةً بلا مصادقة على نطاق عام. وقيمته
  // في الإنتاج صفر: لا مستهلك خارجي لهذه الواجهة سوى واجهتنا نفسها.
  // ENABLE_API_DOCS=true يعيده عمداً عند الحاجة لتشخيص عابر.
  const docsEnabled = !isProduction || config.get<string>('ENABLE_API_DOCS') === 'true';
  if (docsEnabled) {
    // ⭐ الوثيقةُ من مصدرٍ واحد (`ق-١٢٩١` · ي/⑫A2): يستدعيه الإقلاعُ وحارسُ العقد
    //    وسكربتُ اللقطة — فما يُحرَس هو ما يُنشَر لا نسخةٌ منه (`§8.5`).
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}${docsEnabled ? ' (docs at /docs)' : ' (docs disabled)'}`);
}

bootstrap();
