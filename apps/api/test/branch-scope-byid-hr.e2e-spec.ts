import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ كلُّها 9.0 ث على `mad_app_clean` (فأطولُ اختبارٍ دونها)، مقيسةٌ لا مفترَضة.
jest.setTimeout(240000);

/** صفُّ الحضور كما تعيده `GET /attendance` — والحقولُ هي ما يغيّره التعديلُ من فرعٍ آخر. */
interface AttendanceRow {
  id: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
}

/** طلبُ الإجازة كما تعيده `GET /leaves/requests` ومسارا القرار — والحقولُ هي ما يختمه القرار. */
interface LeaveRequestRow {
  id: string;
  status: string;
  decidedAt: string | null;
  decidedNote: string | null;
  decidedById: string | null;
  decidedByName: string | null;
}

/**
 * 🔴 **مكسورُ اليوم — قياسٌ لا إصلاح** (مسحُ مسارات المعرّف، المسارات ٣١–٣٥): موظّفٌ مقيَّدٌ بفرع الشمال
 * **يعدّل حضورَ** موظّفِ الجنوب **ويحذفه**، **ويعتمد** إجازتَه أو **يرفضها** أو **يسحبها** — بالمعرّف وحدَه.
 * فالمتحكّمان (`attendance.controller` · `leaves.controller`) لا يمرّران فروعَ الفاعل، والخدمتان تقرآن الصفَّ
 * بـ`findUnique({ where: { id } })` بلا شرطِ فرع.
 *
 * **والفرعُ هنا موروثٌ لا عمود**: `AttendanceRecord` و`LeaveRequest` بلا `branchId` — فرعُ الصفّ فرعُ موظّفه
 * (`employeeId` ⟵ `Employee.branchId`)، وهو ما يحجبه `employees.findVisible` عن الفاعل نفسِه حين يقرأ الموظّف.
 *
 * **الحكم**: الصفُّ خارج فروع الفاعل غيرُ موجودٍ له — 404 لا 403، فلا يُسرَّب وجودُ صفِّ فرعٍ آخر. وما يكتبه
 * المسار يُعاد قراءتُه **بالمالك** (يرى الفروعَ كلَّها) ويُوكَّد أنه لم يتغيّر: الحالةُ والانصرافُ والملاحظة،
 * ومَن قرّر ومتى، وبقاءُ الصفّ — فحذفُ الحضور وسحبُ الإجازة **حذفٌ صلبٌ لا سلّةَ له**.
 *
 * ⚠️ **على شيفرة اليوم يُتوقَّع سقوطُ الخمسة** (`expected 404, got 200/201/204`) — وهذا هو المقيس، لا عطلٌ في
 * الحزمة. وحالةٌ موجبةٌ لكلِّ خدمة تُثبت أن الفعلَ نفسَه بالصلاحية نفسِها يعمل على صفِّ الشمال — فالرفضُ حين
 * يُبنى رفضٌ للفرع لا للفعل.
 *
 * **ولكلِّ مسارٍ صفُّه**: القرارُ على الإجازة لا يُعاد (`409` بعد أوّل قرار)، والحذفُ صلب — فصفٌّ مشتركٌ بين
 * مسارين يجعل نجاحَ الاستغلال في أحدهما يُفسد مقيسَ الآخر. وتواريخُ الطلبات متباعدةٌ لأن الموظّفَ لا يحمل
 * طلبين متداخلين معلَّقين (`leave_overlap`)، وأيامُ الحضور مختلفةٌ لأن للموظّف صفّاً واحداً في اليوم.
 */
describe('فروعُ الفاعل على الحضور والإجازات بالمعرّف — الفرعُ موروثٌ من الموظّف', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const restrictedUsername = `north-hr-byid-${suffix}`;
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);

  const southNotes = `حضور الجنوب ${suffix}`;

  let northId: string;
  let southId: string;
  let employeeNorth: string;
  let employeeSouth: string;
  let leaveTypeId: string;

  let attendanceSouthEdit: string;
  let attendanceSouthDelete: string;
  let attendanceNorthEdit: string;
  let attendanceNorthDelete: string;

  let leaveSouthApprove: string;
  let leaveSouthReject: string;
  let leaveSouthDelete: string;
  let leaveNorthApprove: string;
  let leaveNorthReject: string;
  let leaveNorthDelete: string;

  /** المالكُ يقرأ سجلَّ حضور الموظّف — مصفوفةٌ بلا `page` (`PagedQueryDto`). */
  const ownerReadsAttendance = async (employeeId: string): Promise<AttendanceRow[]> =>
    (await asOwner(http().get(`/attendance?employeeId=${employeeId}`)).expect(200)).body as AttendanceRow[];

  /** المالكُ يقرأ طلباتِ إجازة الموظّف — مصفوفةٌ بلا `page`. */
  const ownerReadsLeaves = async (employeeId: string): Promise<LeaveRequestRow[]> =>
    (await asOwner(http().get(`/leaves/requests?employeeId=${employeeId}`)).expect(200)).body as LeaveRequestRow[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid-hr');
    northId = ((await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;
    southId = ((await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;

    // قالبٌ تملكه المنشأة بشاشة الموارد البشرية وأفعالها كلِّها (بلا تفصيل = كلُّ الأفعال، ومنها `edit` و`delete`
    // و`review`) — فالرفضُ المقيس لا يأتي من القالب. والحضورُ والإجازاتُ كلاهما تحت شاشة `employees`.
    const template = await asOwner(http().post('/templates')).send({ name: `الموارد البشرية ${suffix}`, allowedScreens: ['dashboard', 'employees'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف موارد الشمال', username: restrictedUsername, password: 'ScopePass123!', permissionTemplateId: (template.body as { id: string }).id, branchIds: [northId] })
      .expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار).
    restrictedToken = ((await http().post('/auth/login').send({ username: restrictedUsername, password: 'ScopePass123!' }).expect(200)).body as { accessToken: string }).accessToken;

    const employee = async (fullName: string, branchId: string): Promise<string> =>
      ((await asOwner(http().post('/employees')).send({ fullName, hireDate: '2026-01-01', branchId }).expect(201)).body as { id: string }).id;
    employeeNorth = await employee(`موظّف الشمال ${suffix}`, northId);
    employeeSouth = await employee(`موظّف الجنوب ${suffix}`, southId);

    // صفٌّ واحدٌ للموظّف في اليوم (`@@unique([employeeId, date])`) — فيومان: للتعديل وللحذف.
    const attendance = async (employeeId: string, date: string, notes: string): Promise<string> =>
      ((await asOwner(http().post('/attendance')).send({ employeeId, date, status: 'PRESENT', checkIn: '08:00', notes }).expect(201)).body as { id: string }).id;
    attendanceSouthEdit = await attendance(employeeSouth, '2026-01-05', southNotes);
    attendanceSouthDelete = await attendance(employeeSouth, '2026-01-06', southNotes);
    attendanceNorthEdit = await attendance(employeeNorth, '2026-01-05', `حضور الشمال ${suffix}`);
    attendanceNorthDelete = await attendance(employeeNorth, '2026-01-06', `حضور الشمال ${suffix}`);

    leaveTypeId = ((await asOwner(http().post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 21, paid: true }).expect(201)).body as { id: string }).id;

    // المالكُ يقدّم الطلبات — فمَن يقرّر من الشمال غيرُ مَن قدّم، ولا يدخل حارسُ الاعتماد الذاتيّ في المقيس.
    const leave = async (employeeId: string, startDate: string, endDate: string): Promise<string> => {
      const res = await asOwner(http().post('/leaves/requests')).send({ employeeId, leaveTypeId, startDate, endDate, reason: 'إجازة سنوية' }).expect(201);
      expect((res.body as LeaveRequestRow).status).toBe('PENDING');
      return (res.body as LeaveRequestRow).id;
    };
    leaveSouthApprove = await leave(employeeSouth, '2026-02-01', '2026-02-03');
    leaveSouthReject = await leave(employeeSouth, '2026-03-01', '2026-03-03');
    leaveSouthDelete = await leave(employeeSouth, '2026-04-01', '2026-04-03');
    leaveNorthApprove = await leave(employeeNorth, '2026-02-01', '2026-02-03');
    leaveNorthReject = await leave(employeeNorth, '2026-03-01', '2026-03-03');
    leaveNorthDelete = await leave(employeeNorth, '2026-04-01', '2026-04-03');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ---- الحضور (المساران ٣١ · ٣٢) ----

  // المسار ٣١
  it('[SPEC 2.7] 🔴 تعديلُ حضورِ موظّفٍ في فرعٍ آخر بالمعرّف — 404، ولا تتغيّر الحالةُ ولا الانصرافُ ولا الملاحظة — `PATCH /attendance/:id`', async () => {
    await asRestricted(http().patch(`/attendance/${attendanceSouthEdit}`)).send({ status: 'ABSENT', checkOut: '23:59', notes: 'عُدّل من فرعٍ آخر' }).expect(404);
    const row = (await ownerReadsAttendance(employeeSouth)).find((r) => r.id === attendanceSouthEdit);
    expect(row).toBeDefined();
    expect(row?.status).toBe('PRESENT');
    expect(row?.checkIn).toBe('08:00');
    expect(row?.checkOut).toBeNull();
    expect(row?.notes).toBe(southNotes);
  });

  // المسار ٣٢ — والحذفُ صلبٌ (`attendanceRecord.delete`) فلا سلّةَ يُستعاد منها.
  it('[SPEC 2.7] 🔴 حذفُ حضورِ موظّفٍ في فرعٍ آخر بالمعرّف — 404، والصفُّ باقٍ — `DELETE /attendance/:id`', async () => {
    await asRestricted(http().delete(`/attendance/${attendanceSouthDelete}`)).expect(404);
    const rows = await ownerReadsAttendance(employeeSouth);
    expect(rows.map((r) => r.id)).toContain(attendanceSouthDelete);
    expect(rows.find((r) => r.id === attendanceSouthDelete)?.status).toBe('PRESENT');
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يعدّل حضورَ موظّفِ فرعه ويحذفه — فالرفضُ للفرع لا للفعل', async () => {
    const edited = await asRestricted(http().patch(`/attendance/${attendanceNorthEdit}`)).send({ checkOut: '17:00', notes: 'انصرافُ فرعه' }).expect(200);
    expect((edited.body as AttendanceRow).checkOut).toBe('17:00');
    expect((edited.body as AttendanceRow).notes).toBe('انصرافُ فرعه');

    await asRestricted(http().delete(`/attendance/${attendanceNorthDelete}`)).expect(204);
    expect((await ownerReadsAttendance(employeeNorth)).map((r) => r.id)).not.toContain(attendanceNorthDelete);
  });

  // ---- الإجازات (المسارات ٣٣ · ٣٤ · ٣٥) ----

  // المسار ٣٣ — والقرارُ لا يُعاد بعد وقوعه (`leave_request_not_pending`)، فاعتمادٌ من فرعٍ آخر لا يُصحَّح.
  it('[SPEC 2.7] 🔴 اعتمادُ إجازةِ موظّفٍ في فرعٍ آخر بالمعرّف — 404، ويبقى الطلبُ معلَّقاً بلا مقرِّر — `POST /leaves/requests/:id/approve`', async () => {
    await asRestricted(http().post(`/leaves/requests/${leaveSouthApprove}/approve`)).send({ note: 'اعتُمد من فرعٍ آخر' }).expect(404);
    const row = (await ownerReadsLeaves(employeeSouth)).find((r) => r.id === leaveSouthApprove);
    expect(row).toBeDefined();
    expect(row?.status).toBe('PENDING');
    expect(row?.decidedAt).toBeNull();
    expect(row?.decidedById).toBeNull();
    expect(row?.decidedByName).toBeNull();
  });

  // المسار ٣٤
  it('[SPEC 2.7] 🔴 رفضُ إجازةِ موظّفٍ في فرعٍ آخر بالمعرّف — 404، ويبقى الطلبُ معلَّقاً بلا مقرِّر ولا ملاحظة — `POST /leaves/requests/:id/reject`', async () => {
    await asRestricted(http().post(`/leaves/requests/${leaveSouthReject}/reject`)).send({ note: 'رُفض من فرعٍ آخر' }).expect(404);
    const row = (await ownerReadsLeaves(employeeSouth)).find((r) => r.id === leaveSouthReject);
    expect(row).toBeDefined();
    expect(row?.status).toBe('PENDING');
    expect(row?.decidedAt).toBeNull();
    expect(row?.decidedNote).toBeNull();
    expect(row?.decidedById).toBeNull();
  });

  // المسار ٣٥ — والسحبُ حذفٌ صلب (`leaveRequest.delete`): يختفي الطلبُ عن معتمِد الجنوب بلا أثرٍ يُستعاد.
  it('[SPEC 2.7] 🔴 سحبُ إجازةِ موظّفٍ في فرعٍ آخر بالمعرّف — 404، والطلبُ باقٍ معلَّقاً — `DELETE /leaves/requests/:id`', async () => {
    await asRestricted(http().delete(`/leaves/requests/${leaveSouthDelete}`)).expect(404);
    const rows = await ownerReadsLeaves(employeeSouth);
    expect(rows.map((r) => r.id)).toContain(leaveSouthDelete);
    expect(rows.find((r) => r.id === leaveSouthDelete)?.status).toBe('PENDING');
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يعتمد إجازةَ موظّفِ فرعه ويرفض أخرى ويسحب ثالثة — فالرفضُ للفرع لا للفعل', async () => {
    const approved = await asRestricted(http().post(`/leaves/requests/${leaveNorthApprove}/approve`)).send({ note: 'موافق' }).expect(201);
    expect((approved.body as LeaveRequestRow).status).toBe('APPROVED');
    expect((approved.body as LeaveRequestRow).decidedByName).toBe(restrictedUsername);

    const rejected = await asRestricted(http().post(`/leaves/requests/${leaveNorthReject}/reject`)).send({ note: 'غير مناسب' }).expect(201);
    expect((rejected.body as LeaveRequestRow).status).toBe('REJECTED');

    await asRestricted(http().delete(`/leaves/requests/${leaveNorthDelete}`)).expect(204);
    expect((await ownerReadsLeaves(employeeNorth)).map((r) => r.id)).not.toContain(leaveNorthDelete);
  });
});
