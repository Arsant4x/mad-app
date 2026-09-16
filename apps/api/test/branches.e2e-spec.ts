import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * Branch visibility is a *permission* filter, not the absolute company
 * boundary — so the cases that matter are the asymmetric ones: owner sees all,
 * a restricted employee sees only theirs, an unassigned employee stays
 * unrestricted, and company-wide (branchId: null) rows never disappear.
 */
describe('Branches and branch-scoped visibility (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let ownerToken: string;
  let companyAId: string;
  let tokenB: string;
  // منشأتان معزولتان (ق-٧٢٢): الأدراجُ والفواتيرُ تُزرع في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأتَي العرض.
  let companyA: IsolatedCompany;
  let companyB: IsolatedCompany;
  let fixtureCustomerId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let branchNorthId: string;
  let branchSouthId: string;
  let employeeId: string;
  let employeeToken: string;
  const createdInvoiceIds: string[] = [];
  const createdQuoteIds: string[] = [];
  const createdDrawerIds: string[] = [];
  const seededShiftIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    companyA = await registerIsolatedCompany(app, 'branches-a');
    companyB = await registerIsolatedCompany(app, 'branches-b');
    ownerToken = companyA.token;
    companyAId = companyA.companyId;
    tokenB = companyB.token;

    const north = await request(app.getHttpServer())
      .post('/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `الفرع الشمالي ${suffix}`, type: 'فرع' })
      .expect(201);
    branchNorthId = north.body.id;

    const south = await request(app.getHttpServer())
      .post('/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `الفرع الجنوبي ${suffix}`, type: 'فرع' })
      .expect(201);
    branchSouthId = south.body.id;

    // One invoice in each branch, plus one company-wide (no branch).
    // العميلُ يُصنع هنا لا يُلتقط من القاعدة — كان `customers.body[0]` يعتمد على عميلٍ تركته بذرةُ العرض (ق-٧٢٢).
    fixtureCustomerId = (
      await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${ownerToken}`).send({ name: `عميل الفروع ${suffix}` }).expect(201)
    ).body.id;
    const customerId = fixtureCustomerId;
    const line = { description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 };

    for (const branchId of [branchNorthId, branchSouthId, null]) {
      const res = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ customerId, issueDate: '2026-04-01', dueDate: '2026-04-30', lines: [line] })
        .expect(201);
      createdInvoiceIds.push(res.body.id);
      if (branchId) {
        // No branch field on the invoice DTO yet (documents are assigned a
        // branch in a later stage), so set it directly to build the fixture.
        await tenantPrisma.runInTenantContext(companyAId, (tx) => tx.invoice.update({ where: { id: res.body.id }, data: { branchId } }));
      }
    }

    // An employee restricted to the north branch only.
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    // A GLOBAL preset only: the owner's list now also carries company-owned
    // templates (actor rule §3.5), and picking whichever comes first would tie
    // this suite to whatever another suite happens to have created.
    const template = templates.body.find((t: { isSystem: boolean; companyId: string | null }) => !t.isSystem && t.companyId === null);
    const emp = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'موظف الفرع الشمالي', username: `north-${suffix}`, password: 'BranchPass123!', permissionTemplateId: template.id })
      .expect(201);
    employeeId = emp.body.id;

    const empLogin = await request(app.getHttpServer()).post('/auth/login').send({ username: `north-${suffix}`, password: 'BranchPass123!' });
    employeeToken = empLogin.body.accessToken;
  }, 60000);

  afterAll(async () => {
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyAId, createdInvoiceIds);
    // ⚠️ **والمشتقُّ يُحذف مع أصله** (`ق-٤٩٥`): حذفُ الدرج يحذف حسابَه في
    //    الدليل — وتركُه يُراكم حساباتٍ في نطاق الأدراج حتى ينفد النطاق.
    for (const id of createdQuoteIds) {
      await request(app.getHttpServer()).delete(`/quotes/${id}`).set('Authorization', `Bearer ${ownerToken}`);
    }
    for (const id of createdDrawerIds) {
      await request(app.getHttpServer()).delete(`/cash-drawers/${id}`).set('Authorization', `Bearer ${ownerToken}`);
    }
    // لا مسارَ حذفٍ للمناوبات — فالمزروعُ يُحذف من حيث زُرع.
    if (seededShiftIds.length) {
      await tenantPrisma.runInTenantContext(companyAId, (tx) => tx.posShift.deleteMany({ where: { id: { in: seededShiftIds } } }));
    }
    if (employeeId) await request(app.getHttpServer()).delete(`/company-users/${employeeId}`).set('Authorization', `Bearer ${ownerToken}`);
    for (const id of [branchNorthId, branchSouthId]) {
      if (id) await request(app.getHttpServer()).delete(`/branches/${id}`).set('Authorization', `Bearer ${ownerToken}`);
    }
    await removeIsolatedCompany(app, companyA);
    await removeIsolatedCompany(app, companyB);
    await app.close();
  }, 90000);

  /** يُعاد التقييدُ في كل حالةٍ تحتاجه — فحالةٌ تعتمد على ترتيب أختها تسقط وحدها. */
  async function restrictEmployeeToNorth(): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [branchNorthId] })
      .expect(200);
  }

  /** عرضٌ في الشمال وآخرُ في الجنوب وثالثٌ بلا فرع — ثلاثةٌ تفصل الأحوال الثلاثة. */
  async function seedQuotesInEveryBranch(): Promise<string[]> {
    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const customerId = (customers.body as { id: string }[])[0]?.id;
    if (!customerId) throw new Error('لا عميلَ في المنشأة — والحالةُ تحتاج واحداً');

    const ids: string[] = [];
    for (const branchId of [branchNorthId, branchSouthId, null]) {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          customerId,
          ...(branchId ? { branchId } : {}),
          issueDate: '2026-05-01',
          validUntil: '2026-06-01',
          lines: [{ description: 'بندُ العزل', quantity: 1, unitPrice: 50, taxRate: 15 }],
        })
        .expect(201);
      ids.push(res.body.id);
      createdQuoteIds.push(res.body.id);
    }
    return ids;
  }

  /**
   * ⚠️ **الأدراجُ تُزرع في القاعدة لا عبر `POST /cash-drawers`** — ونمطُ
   * الفواتير أعلاه نفسُه.
   *
   * **والسببُ مقيس**: رمزُ الدرج يُخصَّص `MAX+1` من نطاقٍ محدود (`ق-٢٩٥`/
   * `ق-٤٨٢`)، **والفجوةُ لا يُعاد ملؤها**. فحالةٌ تُنشئ ثلاثةَ أدراجٍ في كل
   * تشغيل **تدفع السقفَ ثلاثاً وإن حُذفت** — والنطاقُ الأوّل (`1010–1099`)
   * **نفد فعلاً في منشأة العرض**، والثاني عند `1538` من `1599` (مقيسٌ
   * 2026-09-11).
   *
   * ⇒ **ولا يظهر في السير**: قاعدتُه تُنشأ جديدةً كلَّ مرّة، **فيسقط على
   * الجهاز وحده بعد عشرين تشغيلاً** — وهو `ق-٤٩٥` بعينه: **الحالةُ تتراكم في
   * الأثر لا في المصدر**.
   */
  async function seedDrawersInEveryBranch(): Promise<string[]> {
    const ids: string[] = [];
    for (const [i, branchId] of [branchNorthId, branchSouthId, null].entries()) {
      const id = await tenantPrisma.runInTenantContext(companyAId, async (tx) => {
        const account = await tx.account.create({
          data: { code: `9${String(Date.now()).slice(-3)}${i}`, name: `حساب درج العزل ${i} ${suffix}`, type: 'asset' } as never,
        });
        const drawer = await tx.cashDrawer.create({
          data: { name: `درج العزل ${i} ${suffix}`, branchId, accountId: account.id } as never,
        });
        return drawer.id;
      });
      ids.push(id);
      createdDrawerIds.push(id);
    }
    return ids;
  }

  it('[SPEC 2.4] lets the owner see every branch', async () => {
    const res = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const ids = res.body.map((b: { id: string }) => b.id);
    expect(ids).toEqual(expect.arrayContaining([branchNorthId, branchSouthId]));
  });

  it('assigns the default activity when none is given', async () => {
    const res = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const north = res.body.find((b: { id: string }) => b.id === branchNorthId);
    expect(north.activity).not.toBeNull();
    expect(north.activity.name).toBe('النشاط الرئيسي');
  });

  it('[SPEC 2.4] rejects a duplicate branch name within the company', async () => {
    await request(app.getHttpServer())
      .post('/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `الفرع الشمالي ${suffix}` })
      .expect(409);
  });

  it('leaves an employee with no branch assignment unrestricted', async () => {
    const branches = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const ids = branches.body.map((b: { id: string }) => b.id);
    expect(ids).toEqual(expect.arrayContaining([branchNorthId, branchSouthId]));

    const invoices = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const invoiceIds = invoices.body.map((i: { id: string }) => i.id);
    expect(invoiceIds).toEqual(expect.arrayContaining(createdInvoiceIds));
  });

  it('narrows an employee to their assigned branch — including its invoices — while keeping company-wide rows visible', async () => {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [branchNorthId] })
      .expect(200);

    // The token carries only identity; TenantGuard re-reads the assignment on
    // every request, so the existing token reflects the change immediately.
    const branches = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(branches.body.map((b: { id: string }) => b.id)).toEqual([branchNorthId]);

    const invoices = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const seen = invoices.body.filter((i: { id: string }) => createdInvoiceIds.includes(i.id));
    const branchIds = seen.map((i: { branchId: string | null }) => i.branchId);

    expect(branchIds).toContain(branchNorthId);
    // Company-wide rows must stay visible, otherwise every pre-branch record
    // would vanish for a restricted employee.
    expect(branchIds).toContain(null);
    expect(branchIds).not.toContain(branchSouthId);
  });

  /**
   * 🔴 **العزلُ يمنع الكتابةَ كما يمنع القراءة** (`ق-٥١٢`).
   *
   * **وكان يمنع القراءةَ وحدها**: الموظّفُ المقصور يرى فرعَه فقط — **ويكتب على
   * أيّ فرع**. **فيفتح مناوبةً على فرعٍ ليس له، ونقدُه يقع في درجٍ ليس له**؛
   * **ويُنشئ عرضاً على فرعٍ آخر يتحوّل فاتورةً تحمله**.
   *
   * ⚠️ **ولا يُكشَف بالاستعمال**: الصفُّ يبدو سليماً لمن يراه — **ويظهر أثرُه
   * في تقريرٍ بالفرع بعد شهور**.
   */
  it('🔴 ويمنع الكتابةَ على فرعٍ ليس له — مناوبةً وعرضَ سعر', async () => {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [branchNorthId] })
      .expect(200);

    // ① مناوبةٌ على الفرع الجنوبيّ — وهو ليس من فروعه.
    await request(app.getHttpServer())
      .post('/pos/shifts')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ openingFloat: 100, branchId: branchSouthId })
      .expect(403);

    // ② وعرضُ سعرٍ عليه كذلك — فالمنعُ في المصدر الواحد لا في مسارٍ بعينه.
    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const customerId = (customers.body as { id: string }[])[0]?.id;
    if (!customerId) throw new Error('لا عميلَ في المنشأة — والحالةُ تحتاج واحداً');

    await request(app.getHttpServer())
      .post('/quotes')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        customerId,
        branchId: branchSouthId,
        issueDate: '2026-01-01',
        validUntil: '2026-02-01',
        lines: [{ description: 'بندٌ للقياس', quantity: 1, unitPrice: 10, taxRate: 15 }],
      })
      .expect(403);

    // ⭐ وفرعُه هو يمرّ — فالمنعُ بالعزل لا بتعطيل المسار.
    const mine = await request(app.getHttpServer())
      .post('/pos/shifts')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ openingFloat: 100, branchId: branchNorthId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/pos/shifts/${mine.body.id}/close`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ declaredClosing: 100 });
  });

  /**
   * 🔴 **والقراءةُ تُغلق حيث أُغلقت الكتابة — وإلّا فالمنعُ إعلانٌ لا عزل.**
   *
   * `quotes.create` و`cash-drawers.create` صارا يمرّان بـ`resolveBranchId`
   * (`ق-٥١٢`/`ق-٥١٣`)، **و`list` في الاثنين بقي يقرأ كلّ فروع المنشأة**. فمن
   * يُمنع من الكتابة على فرعٍ **يقرأ بياناته كاملةً** — وهو ما يبيع المنتجُ
   * حجبَه.
   *
   * ⚠️ **وقائمةُ الأدراج أثقل**: صفُّها يحمل **رصيدَ حساب الدرج** — فكاشيرُ فرعٍ
   * كان يقرأ **نقديّةَ كلّ فرعٍ آخر** لحظةً بلحظة.
   *
   * وتُقاس الثلاثةُ معاً في كل قائمة: **فرعُه يُرى** · **وما بلا فرعٍ يُرى**
   * (`ق-٢٩٠`: الصفوفُ السابقةُ للفروع تبقى مرئيّة) · **وفرعُ غيره لا يُرى**.
   *
   * ⚠️ **وحالتان لا واحدة**: أوّلُ صياغةٍ جمعت القائمتين في حالةٍ واحدة —
   * **فسقوطُ العروض يُنهيها قبل أن تُقاس الأدراج**، فيبقى نصفُ الدعوى بلا
   * إثباتٍ عكسيّ (`ق-٤١٨`).
   */
  it('🔴 ويُخفي عن قائمة العروض ما لا يملك فرعَه', async () => {
    await restrictEmployeeToNorth();
    const branchIds = await seedQuotesInEveryBranch();

    const res = await request(app.getHttpServer()).get('/quotes').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const seen = (res.body as { id: string; branchId: string | null }[]).filter((q) => branchIds.includes(q.id)).map((q) => q.branchId);

    expect(seen).toContain(branchNorthId);
    expect(seen).toContain(null);
    expect(seen).not.toContain(branchSouthId);
  }, 60000);

  /**
   * 🔴 **وهذه أثقل**: صفُّ الدرج يحمل **رصيدَ حسابه** — فكاشيرُ فرعٍ كان يقرأ
   * **نقديّةَ كلّ فرعٍ آخر** لحظةً بلحظة، لا أسماءَ الأدراج فحسب.
   */
  it('🔴 ويُخفي عن قائمة الأدراج ما لا يملك فرعَه — ومعها أرصدةُ نقده', async () => {
    await restrictEmployeeToNorth();
    const drawerIds = await seedDrawersInEveryBranch();

    const res = await request(app.getHttpServer()).get('/cash-drawers').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const seen = (res.body as { id: string; branchId: string | null }[]).filter((d) => drawerIds.includes(d.id)).map((d) => d.branchId);

    expect(seen).toContain(branchNorthId);
    expect(seen).toContain(null);
    expect(seen).not.toContain(branchSouthId);

    // ⭐ والمالكُ يرى الثلاثة — فالحجبُ بالعزل لا بكسر القائمة.
    const ownerRes = await request(app.getHttpServer()).get('/cash-drawers').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect((ownerRes.body as { id: string }[]).map((d) => d.id)).toEqual(expect.arrayContaining(drawerIds));
  }, 60000);

  /**
   * 🔴 **ولا بابَ جانبياً** (`ق-٥١٧`): ما تحجبه القائمةُ بالفرع **لا يعرضه
   * تقريرٌ باسم الفرع ولا قائمةُ مناوبات**.
   *
   * كانت قائمةُ المناوبات تعرض مناوباتِ المنشأة كلِّها بمجاميع نقدها لكلّ من
   * يملك الشاشة، **وكانت التقاريرُ تأخذ `?branchId=` كما وصل** — فموظّفُ الشمال
   * يطلب مرتجعاتِ الجنوب باسمه فيراها.
   *
   * والمناوبةُ تُزرع في القاعدة مُقفلةً — فمناوبةٌ تُفتح بالمسار تبقى مفتوحةً إن
   * سقطت الحالةُ قبل إقفالها، **وتمنع فتحَ التالية** (`ق-٤٩٥`).
   */
  it('🔴 ولا يفتح له تقريرٌ باسم الفرع ولا قائمةُ المناوبات ما أُغلق في القائمة', async () => {
    await restrictEmployeeToNorth();

    const southShiftId = await tenantPrisma.runInTenantContext(companyAId, async (tx) => {
      const shift = await tx.posShift.create({
        data: { branchId: branchSouthId, openedById: companyAId, openedByName: 'مالك المنشأة', status: 'CLOSED', closedAt: new Date(), openingFloat: 50, declaredClosing: 50 } as never,
      });
      return shift.id;
    });
    seededShiftIds.push(southShiftId);

    const shifts = await request(app.getHttpServer()).get('/pos/shifts').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect((shifts.body as { id: string }[]).map((s) => s.id)).not.toContain(southShiftId);
    const ownerShifts = await request(app.getHttpServer()).get('/pos/shifts').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect((ownerShifts.body as { id: string }[]).map((s) => s.id)).toContain(southShiftId);

    // فرعٌ يُطلب باسمه يُقاس على فروع القارئ: الجنوبُ يُرفض، والشمالُ يمرّ، والمالكُ يمرّ بالاثنين.
    for (const path of ['/reports/returns', '/reports/note-deadlines', '/reports/trial-balance', '/reports/receivables-aging']) {
      await request(app.getHttpServer()).get(path).query({ branchId: branchSouthId }).set('Authorization', `Bearer ${employeeToken}`).expect(403);
      await request(app.getHttpServer()).get(path).query({ branchId: branchNorthId }).set('Authorization', `Bearer ${employeeToken}`).expect(200);
      await request(app.getHttpServer()).get(path).query({ branchId: branchSouthId }).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    }
  }, 60000);

  it('restores unrestricted visibility when the assignment is cleared', async () => {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [] })
      .expect(200);

    const branches = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(branches.body.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining([branchNorthId, branchSouthId]));
  });

  it('refuses to assign a branch belonging to another company', async () => {
    const otherBranch = await request(app.getHttpServer())
      .post('/branches')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `فرع شركة ب ${suffix}` })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [otherBranch.body.id] })
      .expect(404);

    await request(app.getHttpServer()).delete(`/branches/${otherBranch.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(204);
  });

  it('creates an employee already scoped to a branch — one call, restriction live immediately', async () => {
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const template = templates.body.find((t: { isSystem: boolean; companyId: string | null }) => !t.isSystem && t.companyId === null);

    const created = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'موظف جنوبي منذ الإنشاء', username: `south-${suffix}`, password: 'BranchPass123!', permissionTemplateId: template.id, branchIds: [branchSouthId] })
      .expect(201);
    expect(created.body.branches.map((b: { branchId: string }) => b.branchId)).toEqual([branchSouthId]);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: `south-${suffix}`, password: 'BranchPass123!' });
    const branches = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(branches.body.map((b: { id: string }) => b.id)).toEqual([branchSouthId]);

    await request(app.getHttpServer()).delete(`/company-users/${created.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(204);
  });

  it("refuses creating an employee with another company's branch — without leaving a half-created account", async () => {
    const otherBranch = await request(app.getHttpServer())
      .post('/branches')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `فرع شركة ب للإنشاء ${suffix}` })
      .expect(201);

    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const template = templates.body.find((t: { isSystem: boolean; companyId: string | null }) => !t.isSystem && t.companyId === null);
    const username = `foreign-${suffix}`;

    await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'محاولة فرع أجنبي', username, password: 'BranchPass123!', permissionTemplateId: template.id, branchIds: [otherBranch.body.id] })
      .expect(404);

    // الرفض يسبق إنشاء أي شيء: نفس اسم الدخول يجب أن يمرّ في المحاولة
    // الصحيحة التالية — لا حساب نصف مُنشأ يحجزه.
    const retry = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'محاولة صحيحة', username, password: 'BranchPass123!', permissionTemplateId: template.id, branchIds: [branchNorthId] })
      .expect(201);
    expect(retry.body.branches.map((b: { branchId: string }) => b.branchId)).toEqual([branchNorthId]);

    await request(app.getHttpServer()).delete(`/company-users/${retry.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(204);
    await request(app.getHttpServer()).delete(`/branches/${otherBranch.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(204);
  });

  it('stops an employee from creating or deleting branches', async () => {
    await request(app.getHttpServer()).post('/branches').set('Authorization', `Bearer ${employeeToken}`).send({ name: 'فرع من موظف' }).expect(403);
    await request(app.getHttpServer()).delete(`/branches/${branchNorthId}`).set('Authorization', `Bearer ${employeeToken}`).expect(403);
  });

  it("keeps company B from seeing company A's branches", async () => {
    const res = await request(app.getHttpServer()).get('/branches').set('Authorization', `Bearer ${tokenB}`).expect(200);
    const ids = res.body.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(branchNorthId);
    expect(ids).not.toContain(branchSouthId);
  });

  it('refuses to delete a branch that still has activity', async () => {
    await request(app.getHttpServer()).delete(`/branches/${branchNorthId}`).set('Authorization', `Bearer ${ownerToken}`).expect(409);
  });

  it('stamps the branch on a document created with one, and on its auto-posted entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId: fixtureCustomerId,
        issueDate: '2026-04-05',
        dueDate: '2026-05-05',
        branchId: branchSouthId,
        lines: [{ description: 'بند بفرع', quantity: 1, unitPrice: 200, taxRate: 15 }],
      })
      .expect(201);
    createdInvoiceIds.push(res.body.id);

    expect(res.body.branchId).toBe(branchSouthId);

    // The ledger entry must land in the same branch, otherwise a per-branch
    // P&L built from the ledger would never match its documents.
    const entry = await tenantPrisma.runInTenantContext(companyAId, (tx) =>
      tx.journalEntry.findUniqueOrThrow({ where: { id: res.body.journalEntryId } }),
    );
    expect(entry.branchId).toBe(branchSouthId);
  });

  it('rejects a document aimed at a branch the caller may not write to', async () => {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [branchNorthId] })
      .expect(200);

    await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        customerId: fixtureCustomerId,
        issueDate: '2026-04-06',
        dueDate: '2026-05-06',
        branchId: branchSouthId,
        lines: [{ description: 'محاولة', quantity: 1, unitPrice: 10, taxRate: 15 }],
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [] })
      .expect(200);
  });

  it('[SPEC 2.8] reports revenue per branch and a consolidated total that includes unassigned rows', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/branch-summary')
      .query({ from: '2026-04-01', to: '2026-04-30' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const south = res.body.branches.find((b: { branchId: string }) => b.branchId === branchSouthId);
    expect(south).toBeDefined();
    expect(south.revenue).toBeGreaterThan(0);

    // Rows must add up to the consolidated total, otherwise the report is
    // quietly losing money somewhere.
    const summed = [...res.body.branches, res.body.unassigned].reduce((acc: number, b: { revenue: number }) => acc + b.revenue, 0);
    expect(summed).toBeCloseTo(res.body.consolidated.revenue, 2);
  });

  it('[SPEC 2.8] shows a restricted employee only their own branch in the report', async () => {
    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [branchNorthId] })
      .expect(200);

    const range = { from: '2026-04-01', to: '2026-04-30' };
    const asOwner = await request(app.getHttpServer()).get('/reports/branch-summary').query(range).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const asEmployee = await request(app.getHttpServer()).get('/reports/branch-summary').query(range).set('Authorization', `Bearer ${employeeToken}`).expect(200);

    expect(asEmployee.body.branches.map((b: { branchId: string }) => b.branchId)).toEqual([branchNorthId]);

    // Asserted as an invariant rather than a fixed number: this dev database
    // accumulates rows across runs, so any absolute figure would be flaky.
    // What must hold is that the south branch's revenue is exactly what the
    // employee's consolidated total is missing — i.e. it didn't leak in.
    const southRevenue = asOwner.body.branches.find((b: { branchId: string }) => b.branchId === branchSouthId).revenue;
    expect(southRevenue).toBeGreaterThan(0);
    expect(asOwner.body.consolidated.revenue - asEmployee.body.consolidated.revenue).toBeCloseTo(southRevenue, 2);

    await request(app.getHttpServer())
      .patch(`/company-users/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchIds: [] })
      .expect(200);
  });
});
