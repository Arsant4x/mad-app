import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Company profile (e2e)', () => {
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

  it('updates and reads back company A profile', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        legalName: 'شركة اختبار العزل المحدودة',
        vatNumber: '300000000000003',
        crNumber: '1010123456',
        email: 'test-a@example.com',
      })
      .expect(200);
    expect(updated.body.legalName).toBe('شركة اختبار العزل المحدودة');
    expect(updated.body.vatNumber).toBe('300000000000003');

    const fetched = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetched.body.legalName).toBe('شركة اختبار العزل المحدودة');
    expect(fetched.body.crNumber).toBe('1010123456');
    expect(fetched.body.email).toBe('test-a@example.com');
  });

  it('rejects an invalid VAT number (not 15 digits / wrong prefix-suffix)', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', vatNumber: '30012345600001' })
      .expect(400);
  });

  it('rejects an invalid CR number (not 10 digits)', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', crNumber: '12345' })
      .expect(400);
  });

  it('rejects an invalid email format', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', email: 'not-an-email' })
      .expect(400);
  });

  it('rejects an update missing legalName', async () => {
    await request(app.getHttpServer()).patch('/company-profile').set('Authorization', `Bearer ${tokenA}`).send({ phone: '0500000000' }).expect(400);
  });

  it("keeps company B from seeing company A's profile data", async () => {
    const fetchedB = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(fetchedB.body.legalName).not.toBe('شركة اختبار العزل المحدودة');
    expect(fetchedB.body.vatNumber).not.toBe('300000000000003');
  });

  it("keeps company B's edits from affecting company A's profile", async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ legalName: 'شركة ب المعدَّلة' })
      .expect(200);

    const fetchedA = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetchedA.body.legalName).toBe('شركة اختبار العزل المحدودة');
  });

  it('lets a limited-permission employee sub-account read the profile but not edit it', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const username = `profile-viewer-${suffix}`;

    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const anyTemplateId = templates.body.find((t: { isSystem: boolean }) => !t.isSystem).id;

    await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'موظف اختبار', username, password: 'ViewerPass123!', permissionTemplateId: anyTemplateId })
      .expect(201);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ViewerPass123!' }).expect(200);
    const employeeToken = login.body.accessToken;

    await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${employeeToken}`).expect(200);

    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ legalName: 'محاولة تعديل موظف' })
      .expect(403);
  });
});
