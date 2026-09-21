import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FilesService } from '../src/files/files.service';

describe('File storage (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let uploadedKeyA: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    // لا مسارَ حذفٍ عامّ بعد `ق-١٢٣٤` — التنظيفُ بالخدمة نفسِها كما تفعل الميزاتُ التي تملك المرفق؛
    // ومعرِّفُ المنشأة يُقرأ من بادئة المفتاح الذي أعاده الرفع (`companies/<id>/…`).
    if (uploadedKeyA) {
      const companyIdA = uploadedKeyA.split('/')[1];
      await app.get(FilesService).remove(companyIdA, uploadedKeyA);
    }
    await app.close();
  });

  it('[SPEC 11.1] uploads a file and namespaces its key under the uploading company', async () => {
    const res = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('%PDF-1.4 test contract'), { filename: 'عقد اختبار.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(res.body.key).toMatch(/^companies\/[0-9a-f-]+\//);
    expect(res.body.mimeType).toBe('application/pdf');
    // Arabic filenames must survive the multipart round trip — multer decodes
    // them as latin-1, so without the fix in sanitizeFilename this is mojibake.
    expect(res.body.filename).toBe('عقد_اختبار.pdf');
    uploadedKeyA = res.body.key;
  });

  it('[SPEC 11.1] rejects a disallowed file type', async () => {
    await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), { filename: 'script.sh', contentType: 'application/x-sh' })
      .expect(400);
  });

  it('[SPEC 11.1] issues a short-lived download URL to the owning company', async () => {
    const res = await request(app.getHttpServer())
      .get('/files/download-url')
      .query({ key: uploadedKeyA })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // The signed URL percent-encodes the key, so compare against the encoded
    // form rather than the raw one.
    expect(res.body.url).toContain(encodeURIComponent(uploadedKeyA.split('/').pop()!));
    expect(res.body.url).toContain('X-Amz-Signature=');
    expect(res.body.expiresInSeconds).toBeLessThanOrEqual(600);
  });

  it("keeps company B from downloading company A's file", async () => {
    await request(app.getHttpServer())
      .get('/files/download-url')
      .query({ key: uploadedKeyA })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
  });

  it('⛔ لا مسارَ حذفٍ عامّ (ق-١٢٣٤): `DELETE /files` غيرُ موجودٍ حتى لصاحب المفتاح — والحذفُ يمرّ بمسار الميزة التي تملك المرفق', async () => {
    // التوكيدُ على `404` لصاحب الملفّ نفسِه لا على `403` لغيره: لو أُعيد المسارُ يوماً ردّ `204`
    // لصاحبه فسقط هذا الاختبار باسمه — وهو ما يُراد. ويبقى الكائنُ للتنظيف في `afterAll`.
    await request(app.getHttpServer()).delete('/files').query({ key: uploadedKeyA }).set('Authorization', `Bearer ${tokenA}`).expect(404);
    await request(app.getHttpServer()).delete('/files').query({ key: uploadedKeyA }).set('Authorization', `Bearer ${tokenB}`).expect(404);
    // والملفُّ باقٍ: رابطُ التنزيل ما زال يُصدَر لصاحبه.
    await request(app.getHttpServer()).get('/files/download-url').query({ key: uploadedKeyA }).set('Authorization', `Bearer ${tokenA}`).expect(200);
  });

  it('rejects a path-traversal key that tries to escape the company prefix', async () => {
    await request(app.getHttpServer())
      .get('/files/download-url')
      .query({ key: '../../etc/passwd' })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/files/download-url').query({ key: uploadedKeyA }).expect(401);
  });
});
