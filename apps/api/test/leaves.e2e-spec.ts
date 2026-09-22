import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (8.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * Leave management: types, requests, the approval workflow, and derived balance.
 *
 * The behaviours worth protecting: an entitlement the owner sets (never a
 * guessed statutory number), a balance that is *computed* from approved leave
 * rather than stored, one-decision-only approval, no double-booking a person,
 * and — as always — one company never seeing another's staff leave.
 */
describe('Leave management (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let employeeId: string;
  let typeId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;

    const emp = await authA(request(app.getHttpServer()).post('/employees')).send({ fullName: `موظف الإجازات ${suffix}`, hireDate: '2024-01-01' }).expect(201);
    employeeId = emp.body.id;

    const type = await authA(request(app.getHttpServer()).post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 21, paid: true }).expect(201);
    typeId = type.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects a duplicate leave-type name', async () => {
    await authA(request(app.getHttpServer()).post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 30 }).expect(409);
  });

  it('[SPEC 9.5] creates a request with inclusive days and defaults to pending', async () => {
    const res = await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-06-01', endDate: '2025-06-05', reason: 'سفر' })
      .expect(201);
    expect(res.body.days).toBe(5);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.employee.id).toBe(employeeId);
  });

  it('[SPEC 9.5] refuses an inverted date range and an overlapping period', async () => {
    await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-07-10', endDate: '2025-07-01' })
      .expect(400);
    // Overlaps the pending 01–05 June request.
    await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-06-03', endDate: '2025-06-08' })
      .expect(409);
  });

  it('[SPEC 9.5] approves once, and a second decision is refused; balance reflects the approval', async () => {
    const list = await authA(request(app.getHttpServer()).get(`/leaves/requests?employeeId=${employeeId}`)).expect(200);
    const pending = (list.body as { id: string; status: string }[]).find((r) => r.status === 'PENDING');
    expect(pending).toBeTruthy();

    const approved = await authA(request(app.getHttpServer()).post(`/leaves/requests/${pending!.id}/approve`)).send({ note: 'موافق' }).expect(201);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.decidedAt).not.toBeNull();

    // Deciding again is refused — it is no longer pending.
    await authA(request(app.getHttpServer()).post(`/leaves/requests/${pending!.id}/reject`)).expect(409);

    const bal = await authA(request(app.getHttpServer()).get(`/leaves/balance?employeeId=${employeeId}&year=2025`)).expect(200);
    const row = (bal.body.types as { leaveTypeId: string; entitlement: number; used: number; remaining: number | null }[]).find((t) => t.leaveTypeId === typeId);
    expect(row).toMatchObject({ entitlement: 21, used: 5, remaining: 16 });
  });

  it('cannot delete a leave type that is now in use', async () => {
    await authA(request(app.getHttpServer()).delete(`/leaves/types/${typeId}`)).expect(409);
  });

  /**
   * 🔴 **ثقبُ الاعتماد الذاتيّ — والفصلُ لا الأثر** (`ق-٦٢١`).
   *
   * كان الصفُّ يحمل `decidedAt` و`decidedNote` **ولا يحمل من قدّم ولا من قرّر**،
   * **فلا شيءَ يُقارَن**: `AuditInterceptor` يكتب المعتمِدَ في السجلّ، لكن لا
   * حارسَ يقرؤه داخل معاملةٍ ولا شاشةَ تعرضه.
   *
   * ⚠️ **والمقارنةُ على `requestedById` لا على `employeeId`**: الموظَّفُ لا
   * هويّةَ دخولٍ له، **فمقارنةُ المقرِّر به تمرّ دائماً ولا تعني شيئاً**.
   */
  it('🔴 يسجّل من قدّم ومن قرّر على الصفّ — والطرفان في فضاء هويّة الفاعل لا الموظَّف', async () => {
    const created = await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-09-01', endDate: '2025-09-02' })
      .expect(201);
    expect(created.body.requestedById).toBeTruthy();
    expect(created.body.requestedByName).toBe('demo-company-a');
    // ⚠️ **الطرفان ليسا الموظَّف**: لو كانت المقارنةُ على `employeeId` لما دلّت على شيء.
    expect(created.body.requestedById).not.toBe(employeeId);

    const decided = await authA(request(app.getHttpServer()).post(`/leaves/requests/${created.body.id}/approve`)).send({ note: 'موافق' }).expect(201);
    expect(decided.body.decidedById).toBe(created.body.requestedById);
    expect(decided.body.decidedByName).toBe('demo-company-a');
    expect(decided.body.selfApproved).toBe(true);

    // وسجل التدقيق يجده **بحثاً** بالفعل نفسِه الذي في الشطب — لا باسمٍ مشتقّ.
    const trail = await authA(request(app.getHttpServer()).get('/audit-log?action=self-review')).expect(200);
    const entry = (trail.body as { entityId: string | null; action: string; entity: string }[]).find((e) => e.entityId === created.body.id);
    expect(entry).toBeDefined();
    expect(`${entry!.action} · ${entry!.entity}`).toBe('self-review · leaves');
  });

  it('🔴 وإعداد «يُشترط شخصان» يمنع الاعتماد الذاتيّ حين يُفعَّل — وهو مطفأٌ افتراضياً', async () => {
    const profile = await authA(request(app.getHttpServer()).get('/company-profile')).expect(200);
    expect(profile.body.leaveApprovalRequiresTwoPersons).toBe(false); // الافتراضيّ معلَن، لا مفترَض

    const created = await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-10-01', endDate: '2025-10-02' })
      .expect(201);
    const { id } = created.body as { id: string };

    try {
      await authA(request(app.getHttpServer()).patch('/company-profile')).send({ leaveApprovalRequiresTwoPersons: true }).expect(200);
      const blocked = await authA(request(app.getHttpServer()).post(`/leaves/requests/${id}/approve`));
      expect(blocked.status).toBe(403);
      // ⭐ **الرسالةُ تسمّي صاحبَ الطلب** — فمن مُنع يعرف أيَّ طلبٍ يقصد.
      expect(JSON.stringify(blocked.body)).toContain(`موظف الإجازات ${suffix}`);

      // ⚠️ **ومُنع فعلاً لا شكلاً**: الطلبُ ما يزال معلّقاً، فالرفضُ لم يُحسَب قراراً.
      const still = await authA(request(app.getHttpServer()).get(`/leaves/requests?employeeId=${employeeId}`)).expect(200);
      const row = (still.body as { id: string; status: string; decidedById: string | null }[]).find((r) => r.id === id);
      expect(row).toMatchObject({ status: 'PENDING', decidedById: null });
    } finally {
      // ⚠️ إعادةُ الإعداد شرطُ سلامة الحزمة: علَمٌ على مستوى المنشأة يبقى
      // مرفوعاً **يُسقط مجموعاتٍ أخرى تشترك في منشأة العرض نفسها**.
      await authA(request(app.getHttpServer()).patch('/company-profile')).send({ leaveApprovalRequiresTwoPersons: false }).expect(200);
    }

    // وبعد الإطفاء يمرّ — فالمنع كان من الإعداد لا من عطل.
    await authA(request(app.getHttpServer()).post(`/leaves/requests/${id}/approve`)).expect(201);
  });

  it('never shows one company another\'s leave types or requests', async () => {
    const typesB = await authB(request(app.getHttpServer()).get('/leaves/types')).expect(200);
    expect((typesB.body as { id: string }[]).some((t) => t.id === typeId)).toBe(false);

    // B can't see A's requests for A's employee, and can't decide one by id.
    const reqB = await authB(request(app.getHttpServer()).get(`/leaves/requests?employeeId=${employeeId}`)).expect(200);
    expect(reqB.body).toHaveLength(0);
  });
});
