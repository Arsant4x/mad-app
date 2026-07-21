import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Message scripts / templates (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

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
    await app.close();
  });

  it('creates, edits, and deletes a message template', async () => {
    const created = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ audience: 'TENANT', title: 'ترحيب اختبار', text: 'أهلاً بك [الاسم]' })
      .expect(201);
    expect(created.body.audience).toBe('TENANT');

    const updated = await request(app.getHttpServer())
      .patch(`/scripts/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ audience: 'CUSTOMER', title: 'عنوان معدَّل' })
      .expect(200);
    expect(updated.body.audience).toBe('CUSTOMER');
    expect(updated.body.title).toBe('عنوان معدَّل');
    expect(updated.body.text).toBe('أهلاً بك [الاسم]');

    await request(app.getHttpServer()).delete(`/scripts/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
    const list = await request(app.getHttpServer()).get('/scripts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(list.body.some((s: { id: string }) => s.id === created.body.id)).toBe(false);
  });

  it('rejects an invalid audience value', async () => {
    await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ audience: 'INVALID', title: 'x', text: 'y' })
      .expect(400);
  });

  it("keeps company B from seeing, editing, or deleting company A's message templates", async () => {
    const created = await request(app.getHttpServer())
      .post('/scripts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ audience: 'EMPLOYEE', title: 'عزل بين الشركات', text: 'نص اختبار العزل' })
      .expect(201);

    const listB = await request(app.getHttpServer()).get('/scripts').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(listB.body.some((s: { id: string }) => s.id === created.body.id)).toBe(false);

    await request(app.getHttpServer())
      .patch(`/scripts/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'محاولة تعديل' })
      .expect(404);

    await request(app.getHttpServer()).delete(`/scripts/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });
});
