import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (7.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * الحضور والانصراف (SPEC 9.4) — the second HR pillar.
 *
 * What must hold: one row per employee per day (a second check-in is refused,
 * not duplicated), checkout edits that same row, the day sheet filters by
 * date, and one company never sees another's attendance.
 */
describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let employeeId: string;
  let recordId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const DAY = '2089-03-10';

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;

    employeeId = (await authA(request(app.getHttpServer()).post('/employees')).send({ fullName: `موظف الحضور ${suffix}`, hireDate: '2024-01-01' }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    if (recordId) await authA(request(app.getHttpServer()).delete(`/attendance/${recordId}`));
    await authA(request(app.getHttpServer()).delete(`/employees/${employeeId}`));
    await authA(request(app.getHttpServer()).delete(`/trash/employees/${employeeId}`));
    await app.close();
  });

  it('[SPEC 9.4] records a check-in, and refuses a second one for the same day', async () => {
    const res = await authA(request(app.getHttpServer()).post('/attendance'))
      .send({ employeeId, date: DAY, checkIn: '08:05' })
      .expect(201);
    recordId = res.body.id;
    expect(res.body.status).toBe('PRESENT');
    expect(res.body.checkIn).toBe('08:05');
    expect(res.body.employee.fullName).toContain(suffix);

    // One row per employee per day — a duplicate is a 409, never a fork.
    await authA(request(app.getHttpServer()).post('/attendance')).send({ employeeId, date: DAY, checkIn: '09:00' }).expect(409);
  }, 40000);

  it('[SPEC 9.4] checkout lands on the same row', async () => {
    const res = await authA(request(app.getHttpServer()).patch(`/attendance/${recordId}`)).send({ checkOut: '17:12' }).expect(200);
    expect(res.body.checkIn).toBe('08:05');
    expect(res.body.checkOut).toBe('17:12');
  }, 40000);

  it('[SPEC 9.4] the day sheet filters by date', async () => {
    const sheet = await authA(request(app.getHttpServer()).get(`/attendance?date=${DAY}`)).expect(200);
    expect((sheet.body as { id: string }[]).some((r) => r.id === recordId)).toBe(true);

    const other = await authA(request(app.getHttpServer()).get('/attendance?date=2089-03-11')).expect(200);
    expect((other.body as { id: string }[]).some((r) => r.id === recordId)).toBe(false);
  }, 40000);

  it('rejects a malformed clock time outright', async () => {
    await authA(request(app.getHttpServer()).post('/attendance')).send({ employeeId, date: '2089-03-12', checkIn: '25:99' }).expect(400);
  }, 40000);

  it('never shows one company another\'s sheet', async () => {
    const sheetB = await authB(request(app.getHttpServer()).get(`/attendance?date=${DAY}`)).expect(200);
    expect((sheetB.body as { id: string }[]).some((r) => r.id === recordId)).toBe(false);
    await authB(request(app.getHttpServer()).patch(`/attendance/${recordId}`)).send({ checkOut: '10:00' }).expect(404);
  }, 40000);
});
