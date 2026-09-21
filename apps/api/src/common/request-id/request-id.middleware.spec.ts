import { Controller, Get, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { HttpExceptionFilter } from '../i18n/http-exception.filter';
import { stripCommentsAndStrings } from '../source-scan.util';
import { isRequestId, REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware';

/**
 * **الرأسُ على كلِّ استجابة — بما فيها ما لم يُلتقط** (`ق-١٢٣٧`). تطبيقٌ صغير بلا قاعدة:
 * مسارٌ يعيد `200`، ومسارٌ يرمي `NotFoundException`، **ومسارٌ يرمي `Error` خاماً** — وهو الشاهد:
 * استثناءٌ لم يُتوقَّع يخرج `500` **والرأسُ عليه** لأن الوسيطَ كتبه قبل المعالج.
 */
@Controller('probe')
class ProbeController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('missing')
  missing() {
    throw new NotFoundException('probe.missing');
  }

  @Get('boom')
  boom() {
    throw new Error('boom');
  }
}

describe('x-request-id على كلِّ استجابة', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('يقبل المعرِّفَ الصالح ويرفض غيرَه — والقبولُ بحروفٍ صغيرة', () => {
    expect(isRequestId('6f1d2c3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f')).toBe(true);
    expect(isRequestId('6F1D2C3E-4B5A-4C6D-8E7F-9A0B1C2D3E4F')).toBe(true);
    expect(isRequestId('not-a-uuid')).toBe(false);
    expect(isRequestId('6f1d2c3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f\n')).toBe(false);
    expect(isRequestId(['a', 'b'])).toBe(false);
    expect(isRequestId(undefined)).toBe(false);
  });

  it('200: رأسٌ مولَّد حين لا يصل شيء — ويُعاد الواردُ الصالح كما هو', async () => {
    const generated = await request(app.getHttpServer()).get('/probe/ok').expect(200);
    expect(isRequestId(generated.headers[REQUEST_ID_HEADER])).toBe(true);

    const echoed = await request(app.getHttpServer()).get('/probe/ok').set(REQUEST_ID_HEADER, '6F1D2C3E-4B5A-4C6D-8E7F-9A0B1C2D3E4F').expect(200);
    expect(echoed.headers[REQUEST_ID_HEADER]).toBe('6f1d2c3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f');
  });

  it('⛔ الواردُ غيرُ الصالح لا يُردّ — يُستبدل بمولَّد (لا حقنَ سجلّ)', async () => {
    const res = await request(app.getHttpServer()).get('/probe/ok').set(REQUEST_ID_HEADER, 'evil <script>').expect(200);
    expect(res.headers[REQUEST_ID_HEADER]).not.toContain('evil');
    expect(isRequestId(res.headers[REQUEST_ID_HEADER])).toBe(true);
  });

  it('404 من استثناء مسمّى: الرأسُ على الاستجابة وفي جسم الخطأ معاً', async () => {
    const res = await request(app.getHttpServer()).get('/probe/missing').expect(404);
    expect(isRequestId(res.headers[REQUEST_ID_HEADER])).toBe(true);
    expect(res.body.requestId).toBe(res.headers[REQUEST_ID_HEADER]);
  });

  it('404 لمسارٍ لا وجود له: الرأسُ موجودٌ قبل أن يقرّر أحدٌ شيئاً', async () => {
    const res = await request(app.getHttpServer()).get('/probe/nope').expect(404);
    expect(isRequestId(res.headers[REQUEST_ID_HEADER])).toBe(true);
  });

  it('⭐ 500 من استثناءٍ لم يُتوقَّع: الرأسُ عليه وجسمُه يحمل المعرِّف ولا يحمل نصَّ الخطأ', async () => {
    const res = await request(app.getHttpServer()).get('/probe/boom').expect(500);
    expect(isRequestId(res.headers[REQUEST_ID_HEADER])).toBe(true);
    expect(res.body.requestId).toBe(res.headers[REQUEST_ID_HEADER]);
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });
});

/**
 * التطبيقُ أعلاه يركّب الوسيطَ بنفسه — فلا يشهد على `main.ts`. هذا الحارسُ يقرأ `main.ts` **كوداً**
 * (بعد تجريد التعليقات والسلاسل — `ق-٣٧٥`) ويوجب: الوسيطُ مُركَّبٌ **قبل** `helmet` (أوّلَ السلسلة)،
 * والرأسُ مُعلَنٌ في `exposedHeaders` — فبدونه يبقى المعرِّفُ في الشبكة ولا يقرؤه المتصفّح.
 */
describe('main.ts يركّب الوسيطَ أوّلَ السلسلة ويُعلن الرأسَ في CORS', () => {
  const code = stripCommentsAndStrings(readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8'));

  it('يقرأ main.ts فعلاً', () => {
    expect(code).toContain('NestFactory.create');
  });

  it('app.use(requestIdMiddleware) يسبق app.use(helmet', () => {
    const middlewareAt = code.indexOf('app.use(requestIdMiddleware)');
    const helmetAt = code.indexOf('app.use(helmet(');
    expect(middlewareAt).toBeGreaterThan(-1);
    expect(helmetAt).toBeGreaterThan(-1);
    expect(middlewareAt).toBeLessThan(helmetAt);
  });

  it('exposedHeaders يحمل REQUEST_ID_HEADER داخل enableCors', () => {
    const corsAt = code.indexOf('app.enableCors(');
    expect(corsAt).toBeGreaterThan(-1);
    const corsBlock = code.slice(corsAt, code.indexOf('})', corsAt));
    expect(corsBlock).toContain('exposedHeaders');
    expect(corsBlock).toContain('REQUEST_ID_HEADER');
  });
});
