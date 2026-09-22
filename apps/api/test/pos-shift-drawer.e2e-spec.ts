import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (19.6 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(60000);

interface Drawer {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  branchId: string | null;
}
interface Shift {
  id: string;
  branchId: string | null;
  drawerId: string | null;
}

/**
 * **المناوبةُ تُفتح على درج** (`ق-٢١٨` · `ق-٢٦١`).
 *
 * ما يُقاس: الافتراضيُّ يُختار بلا اختيار · والمسمّى يُقبل · والمعطَّل يُرفض
 * **باسمه** · ودرجُ فرعٍ آخر يُرفض **باسمه** — فنقدُ فرعٍ لا يقع في حساب فرعٍ ثانٍ.
 */
describe('POS shift ↔ cash drawer (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الأدراجُ الأربعة تُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const drawers: string[] = [];
  const shifts: string[] = [];
  let branchId = '';

  const openShift = (body: Record<string, unknown>) => auth(http().post('/pos/shifts')).send({ openingFloat: 0, ...body });
  const closeAllOpen = async () => {
    const list = (await auth(http().get('/pos/shifts')).expect(200)).body as { id: string; status: string }[];
    for (const s of list.filter((x) => x.status === 'OPEN')) await auth(http().post(`/pos/shifts/${s.id}/close`)).send({ declaredClosing: 0 });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'pos-shift');
    token = company.token;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع الأدراج ${suffix}` }).expect(201)).body.id;
    await closeAllOpen();
  }, 60000);

  afterAll(async () => {
    await closeAllOpen();
    for (const id of drawers) await auth(http().delete(`/cash-drawers/${id}`));
    await auth(http().delete(`/branches/${branchId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('① الدرجُ المسمّى يُقبل، ويُقرأ على المناوبة', async () => {
    const drawer = (await auth(http().post('/cash-drawers')).send({ name: `درج ١ ${suffix}`, branchId }).expect(201)).body as Drawer;
    drawers.push(drawer.id);

    const shift = (await openShift({ branchId, drawerId: drawer.id }).expect(201)).body as Shift;
    shifts.push(shift.id);
    expect(shift.drawerId).toBe(drawer.id);
    await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
  });

  it('🔴 ② وبلا اختيارٍ يُؤخذ الدرجُ الافتراضيُّ للفرع — لا فراغ', async () => {
    // الافتراضيُّ للمنشأة بلا فرع: أنشأه الترحيل للمناوبات القائمة.
    const list = (await auth(http().get('/cash-drawers')).expect(200)).body as Drawer[];
    const companyDefault = list.find((d) => d.isDefault && d.branchId === null && d.isActive);

    const shift = (await openShift({}).expect(201)).body as Shift;
    shifts.push(shift.id);
    // ⚠️ **لا تخطّي صامت**: الحالتان تُؤكَّدان — إن وُجد افتراضيٌّ للمنشأة أُخذ،
    //    وإن لم يوجد فالفراغُ هو السلوك المعلَن (`ق-٢٦١`) لا عطلٌ يمرّ.
    expect(shift.drawerId).toBe(companyDefault ? companyDefault.id : null);
    await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
  });

  it('🔴 ②ب وفرعٌ له درجٌ نشِطٌ واحد — يُؤخذ بلا اختيار؛ واثنان يُتركان للاختيار', async () => {
    // الفرعُ أُنشئ في هذه الحزمة، ودرجُه الوحيد من الحالة ①.
    const one = (await openShift({ branchId }).expect(201)).body as Shift;
    shifts.push(one.id);
    expect(one.drawerId).toBe(drawers[0]);
    await auth(http().post(`/pos/shifts/${one.id}/close`)).send({ declaredClosing: 0 }).expect(201);

    const second = (await auth(http().post('/cash-drawers')).send({ name: `درج ٢ ${suffix}`, branchId }).expect(201)).body as Drawer;
    drawers.push(second.id);
    const ambiguous = (await openShift({ branchId }).expect(201)).body as Shift;
    shifts.push(ambiguous.id);
    // درجان نشِطان ⇒ لا يُخمَّن أحدهما.
    expect(ambiguous.drawerId).toBeNull();
    await auth(http().post(`/pos/shifts/${ambiguous.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    await auth(http().patch(`/cash-drawers/${second.id}`)).send({ isActive: false }).expect(200);
  });

  it('🔴 ③ ودرجٌ معطَّل يُرفض باسمه', async () => {
    const drawer = (await auth(http().post('/cash-drawers')).send({ name: `درج معطَّل ${suffix}`, branchId }).expect(201)).body as Drawer;
    drawers.push(drawer.id);
    await auth(http().patch(`/cash-drawers/${drawer.id}`)).send({ isActive: false }).expect(200);

    const res = await openShift({ branchId, drawerId: drawer.id }).expect(409);
    expect(String(res.body.message)).toContain(drawer.name);
  });

  it('🔴 ④ ودرجُ فرعٍ آخر يُرفض — فنقدُ فرعٍ لا يقع في حساب فرعٍ ثانٍ', async () => {
    const drawer = (await auth(http().post('/cash-drawers')).send({ name: `درج بلا فرع ${suffix}` }).expect(201)).body as Drawer;
    drawers.push(drawer.id);

    const res = await openShift({ branchId, drawerId: drawer.id }).expect(409);
    expect(String(res.body.message)).toContain(drawer.name);
  });
});
