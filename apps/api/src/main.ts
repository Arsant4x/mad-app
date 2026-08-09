import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/i18n/http-exception.filter';
import { assertProductionSecrets } from './common/config/production-secrets';

async function bootstrap() {
  // قبل أي شيء آخر — قبل الاتصال بقاعدة البيانات وقبل فتح المنفذ: منصةٌ تُقلع
  // بمفتاح توقيع منشور في المستودع أسوأ من منصةٍ لا تُقلع.
  assertProductionSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // خلف وسيط عاكس (Caddy/nginx) يصل كل طلب من عنوان الوسيط نفسه. بدون هذا
  // ينهار تحديد معدّل الدخول (10/دقيقة لكل IP) إلى **دلو واحد للعالم كله**:
  // يستنفده أي زائر فيُقفل الدخول على كل المستأجرين. ومعه يقرأ Express
  // X-Forwarded-For فيعود التحديد لكل عميل على حدة، وتصحّ الكوكيز الآمنة.
  // ثقةٌ بقفزة واحدة فقط — الوسيط على نفس الخادم، وتوسيعها يجعل الترويسة
  // قابلة للتزوير من الخارج.
  app.set('trust proxy', 1);

  // Standard hardening headers (HSTS, no-sniff, frame denial…). CSP is left
  // off: this process serves only a JSON API plus Swagger, and Swagger's inline
  // scripts break under a strict default CSP for no security gain here.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:5173'),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  // Translates every error message into the caller's Accept-Language — see
  // common/i18n/http-exception.filter.ts. Registered after the pipe so it also
  // catches (and localizes) validation failures.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger خارج الإنتاج فقط. المستند يعدّد كل نقطة نهاية وكل حقل في كل DTO،
  // أي أنه خريطة سطح الهجوم كاملةً مقدَّمةً بلا مصادقة على نطاق عام. وقيمته
  // في الإنتاج صفر: لا مستهلك خارجي لهذه الواجهة سوى واجهتنا نفسها.
  // ENABLE_API_DOCS=true يعيده عمداً عند الحاجة لتشخيص عابر.
  const docsEnabled = !isProduction || config.get<string>('ENABLE_API_DOCS') === 'true';
  if (docsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mad App API')
      .setDescription('Multi-tenant accounting / real-estate / HR / inventory platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}${docsEnabled ? ' (docs at /docs)' : ' (docs disabled)'}`);
}

bootstrap();
