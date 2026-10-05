import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

/**
 * ⚖️ **محرّكُ النماذج — الموجةُ ١ج: السجلُّ المعبّأ والختم** (توجيه ٢٧٨ · `ق-١٦٣٥` · `ق-١٦٣٦`).
 *
 * الجوابُ معروفٌ يداً: منشأةٌ معزولة تنسخ قالباً عامّاً ببنودٍ ثلاثة (عدّادٌ إلزاميّ · حرارةٌ بنطاقٍ مانع 2–8 · حالة)، وتعبّئه على عقدها،
 * وتختمه، ثم تختم ثانياً: الرقمان `FRM-<السنة>-0001` ثم `0002`، والسلسلةُ تصل الثاني بالأوّل، والمختومُ لا يُعدَّل في البرنامج **ولا في
 * القاعدة** (③ب)، والتحقّقُ يعيد البصمةَ نفسَها.
 *
 * ⚠️ **والمنشأةُ لا تُحذف بعدها**: سجلٌّ مختوم يمنع حذفها الصلب (المُشغِّل) كسجلّ المهام (ق-١١٠)، فتبقى كما تبقى منشآتُ `tasks.e2e`.
 */
describe('Form instances and sealing — wave 1c (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let ownerToken: string;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  let templateId: string;
  let items: { meter: string; temp: string; cond: string };
  let contractA: string;
  let contractA2: string;
  let contractB: string;
  let first: { id: string; contentHash: string; no: string };
  let draftId: string;
  const year = new Date().getUTCFullYear();
  const formDate = `${year}-06-15`;
  const stamp = `${Date.now()}`.slice(-8);

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => `Bearer ${t}`;

  async function makeContract(company: IsolatedCompany): Promise<string> {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(company.token)).send({ name: `عقار النماذج ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', bearer(company.token))
      .send({ propertyId: property.body.id, unitNo: `FRM-${tag}`, type: 'شقة', rentMonthly: 1000 })
      .expect(201);
    const customerId = await createTenantCustomer(app, company.token, `مستأجر النماذج ${tag}`);
    const contract = await http()
      .post('/contracts')
      .set('Authorization', bearer(company.token))
      .send({ unitId: unit.body.id, customerId, value: 12000, cycle: 'monthly', start: `${year}-01-01`, end: `${year}-12-31`, classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    return contract.body.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    a = await registerIsolatedCompany(app, 'forms-seal-a');
    b = await registerIsolatedCompany(app, 'forms-seal-b');

    // قالبٌ عامٌّ منشور، تنسخه «أ» وتنشر نسختَها.
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `SEAL_T${stamp}`, name: 'تسليمُ وحدة' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({
        formTypeId: type.body.id,
        name: 'تسليمُ وحدةٍ سكنية',
        items: [
          { label: 'قراءةُ عدّاد الكهرباء', itemType: 'METER_READING', required: true },
          { label: 'حرارةُ الثلاجة', itemType: 'TEMPERATURE', minValue: 2, maxValue: 8, isBlocking: true },
          { label: 'حالةُ الخزائن', itemType: 'CONDITION' },
        ],
      })
      .expect(201);
    await http().post(`/admin/form-templates/${platform.body.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);
    const copy = await http().post('/form-templates/copy').set('Authorization', bearer(a.token)).send({ sourceTemplateId: platform.body.id }).expect(201);
    templateId = copy.body.id;
    const [meter, temp, cond] = copy.body.items as { id: string }[];
    items = { meter: meter.id, temp: temp.id, cond: cond.id };

    // مسوّدةُ المنشأة لا تُعبّأ — قبل النشر.
    contractA = await makeContract(a);
    await http().post(`/contracts/${contractA}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(400);
    await http().post(`/form-templates/${templateId}/publish`).set('Authorization', bearer(a.token)).expect(201);
    contractA2 = await makeContract(a);
    contractB = await makeContract(b);
    // والقالبُ العامُّ نفسُه لا يُعبّأ: قالبُ المنشأة وحدَه.
    await http().post(`/contracts/${contractA}/forms`).set('Authorization', bearer(a.token)).send({ templateId: platform.body.id, formDate }).expect(404);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('① سجلٌّ على العقد مسوّدةً ببنود قالبه، وقيمٌ بنوعها وما يخالفه يُردّ', async () => {
    const created = await http().post(`/contracts/${contractA}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(201);
    first = { id: created.body.id, contentHash: '', no: '' };
    expect(created.body).toMatchObject({
      status: 'DRAFT',
      no: null,
      sealSeq: null,
      contentHash: null,
      formDate,
      templateVersionId: templateId,
      linkedEntityType: 'contract',
      linkedEntityId: contractA,
    });
    expect(created.body.items.map((i: { lineNo: number }) => i.lineNo)).toEqual([1, 2, 3]);

    const values = (v: unknown[]) => http().put(`/contracts/${contractA}/forms/${first.id}/values`).set('Authorization', bearer(a.token)).send({ values: v });
    await values([{ itemId: items.meter, text: 'كثير' }]).expect(400);
    await values([{ itemId: items.cond, number: 3 }]).expect(400);
    // ⚖️ ق-١٦٤١/٥: «الحالة» من السلّم الثابت وحدَه (جيّد · مقبول · تالف)، والنصُّ الحرّ يُردّ مسمّىً.
    const offScale = await values([{ itemId: items.cond, text: 'مقبول' }]).expect(400);
    expect(offScale.body.message).toContain('حالةُ الخزائن');
    const filled = await values([
      { itemId: items.temp, number: 9 },
      { itemId: items.cond, text: '  FAIR ', note: 'خدشٌ في الباب' },
    ]).expect(200);
    const temp = filled.body.items.find((i: { itemId: string }) => i.itemId === items.temp);
    expect(temp).toMatchObject({ number: '9', outOfRange: true });
    expect(filled.body.items.find((i: { itemId: string }) => i.itemId === items.cond)).toMatchObject({ text: 'FAIR', note: 'خدشٌ في الباب' });
  });

  it('② لا يُختم وإلزاميٌّ فارغ، ولا وقيمةٌ خارج نطاقها المانع — ثم يُختم برقمه وموضعه وبصمته', async () => {
    const seal = () => http().post(`/contracts/${contractA}/forms/${first.id}/seal`).set('Authorization', bearer(a.token));
    const missing = await seal().expect(400);
    expect(missing.body.message).toContain('قراءةُ عدّاد الكهرباء');
    await http()
      .put(`/contracts/${contractA}/forms/${first.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: items.meter, number: 48213 }] })
      .expect(200);
    const blocked = await seal().expect(400);
    expect(blocked.body.message).toContain('حرارةُ الثلاجة');
    await http()
      .put(`/contracts/${contractA}/forms/${first.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: items.temp, number: 5 }] })
      .expect(200);

    const sealed = await seal().expect(201);
    expect(sealed.body).toMatchObject({ status: 'SEALED', no: `FRM-${year}-0001`, sealSeq: 1, prevHash: null });
    expect(sealed.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.body.sealedByName).toBe(a.username);
    first = { id: first.id, contentHash: sealed.body.contentHash, no: sealed.body.no };
  });

  it('③ الختمُ الثاني في المنشأة يحمل بصمةَ الأوّل ورقمَه التالي، والتحقّقُ يعيد البصمةَ نفسَها', async () => {
    const second = await http().post(`/contracts/${contractA2}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(201);
    await http()
      .put(`/contracts/${contractA2}/forms/${second.body.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: items.meter, number: 100 }] })
      .expect(200);
    const sealed = await http().post(`/contracts/${contractA2}/forms/${second.body.id}/seal`).set('Authorization', bearer(a.token)).expect(201);
    expect(sealed.body).toMatchObject({ no: `FRM-${year}-0002`, sealSeq: 2, prevHash: first.contentHash });

    for (const [contract, id] of [
      [contractA, first.id],
      [contractA2, second.body.id as string],
    ]) {
      const v = await http().get(`/contracts/${contract}/forms/${id}/verify`).set('Authorization', bearer(a.token)).expect(200);
      expect(v.body).toMatchObject({ contentIntact: true, chainLinked: true, valid: true });
      expect(v.body.recomputedHash).toBe(v.body.contentHash);
    }

    // والتحقّقُ يعيد الحسابَ فعلاً: عنوانُ بندٍ يُغيَّر في القاعدة مباشرةً (البندُ المنشور مجمَّدٌ في البرنامج وحدَه) فيفترق المختوم.
    const relabel = (label: string) => tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.formTemplateItem.update({ where: { id: items.cond }, data: { label } }));
    const original = (await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.formTemplateItem.findUniqueOrThrow({ where: { id: items.cond } }))).label;
    await relabel('عنوانٌ مُبدَّل');
    const tampered = await http().get(`/contracts/${contractA}/forms/${first.id}/verify`).set('Authorization', bearer(a.token)).expect(200);
    expect(tampered.body).toMatchObject({ contentIntact: false, chainLinked: true, valid: false });
    await relabel(original);

    // ومسوّدةٌ ثالثة تبقى للحالة الموجبة في ⑤.
    draftId = (await http().post(`/contracts/${contractA2}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(201)).body.id;
  });

  it('④ المختومُ في البرنامج: لا تعبئةَ ولا حذفَ ولا ختمَ ثانٍ', async () => {
    await http()
      .put(`/contracts/${contractA}/forms/${first.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: items.meter, number: 1 }] })
      .expect(409);
    await http().delete(`/contracts/${contractA}/forms/${first.id}`).set('Authorization', bearer(a.token)).expect(409);
    await http().post(`/contracts/${contractA}/forms/${first.id}/seal`).set('Authorization', bearer(a.token)).expect(409);
  });

  it('⑤ والمختومُ في القاعدة (③ب): تعديلُه وحذفُه وكتابةُ قيمته تُرفض بالمُشغِّل، والمسوّدةُ تُعدَّل', async () => {
    // Prisma يطبع رسالةَ القاعدة بتنسيق Rust فيُهرِّب الحركاتِ العربية (`\u{64f}`)، فتُفكّ قبل المطابقة؛ ويُشترط رمزُ `23001`
    // (restrict_violation) كي لا يمرّ رفضٌ من سببٍ آخر.
    const attempt = (fn: () => Promise<unknown>) =>
      fn().then(
        () => null,
        (e: unknown) => {
          const message = String((e as Error).message).replace(/\\u\{([0-9a-f]+)\}/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
          expect(message).toContain('23001');
          return message;
        },
      );
    const inA = <T,>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(a.companyId, fn);

    expect(await attempt(() => inA((tx) => tx.formInstance.update({ where: { id: first.id }, data: { filledByName: 'عبث' } })))).toContain('المختوم لا يُعدَّل');
    expect(await attempt(() => inA((tx) => tx.formInstance.delete({ where: { id: first.id } })))).toContain('المختوم لا يُحذف');
    expect(await attempt(() => inA((tx) => tx.formValue.updateMany({ where: { instanceId: first.id }, data: { note: 'عبث' } })))).toContain('قيمُ السجلّ المختوم');
    expect(await attempt(() => inA((tx) => tx.formValue.deleteMany({ where: { instanceId: first.id } })))).toContain('قيمُ السجلّ المختوم');
    expect(
      await attempt(() => inA((tx) => tx.formValue.create({ data: { companyId: a.companyId, instanceId: first.id, itemId: items.cond, textValue: 'عبث' } }))),
    ).toContain('قيمُ السجلّ المختوم');

    // وصفُّ الختم (FormSeal) يُكتب مرّةً: لا يُعدَّل ولا يُحذف.
    expect(await attempt(() => inA((tx) => tx.formSeal.update({ where: { instanceId: first.id }, data: { sealedByName: 'عبث' } })))).toContain(
      'الختمُ لا يُعدَّل ولا يُحذف',
    );
    expect(await attempt(() => inA((tx) => tx.formSeal.delete({ where: { instanceId: first.id } })))).toContain('الختمُ لا يُعدَّل ولا يُحذف');
    // ولا تصير مسوّدةٌ مختومةً بلا صفِّ ختم، ولا يُنشأ سجلٌّ مختوماً.
    expect(await attempt(() => inA((tx) => tx.formInstance.update({ where: { id: draftId }, data: { status: 'SEALED' } })))).toContain('بلا ختمٍ مكتوب');
    expect(
      await attempt(() =>
        inA((tx) =>
          tx.formInstance.create({
            data: {
              companyId: a.companyId,
              templateVersionId: templateId,
              linkedEntityType: 'contract',
              linkedEntityId: contractA,
              formDate: new Date(`${formDate}T00:00:00.000Z`),
              status: 'SEALED',
              filledById: 'x',
              filledByName: 'عبث',
            },
          }),
        ),
      ),
    ).toContain('يُنشأ مسوّدةً');

    // والحالةُ الموجبة: المسوّدةُ تُعدَّل في القاعدة نفسِها (مصادقةُ المسبار — ق-١٣٦).
    expect(await attempt(() => inA((tx) => tx.formInstance.update({ where: { id: draftId }, data: { filledByName: 'تصحيحٌ قبل الختم' } })))).toBeNull();
  });

  it('⑥ العزل: سجلُّ عقدٍ لا يُقرأ من مسار عقدٍ آخر، ومنشأةٌ أخرى لا تبلغ العقدَ أصلاً', async () => {
    await http().get(`/contracts/${contractA2}/forms/${first.id}`).set('Authorization', bearer(a.token)).expect(404);
    await http().get(`/contracts/${contractA}/forms/${first.id}`).set('Authorization', bearer(b.token)).expect(404);
    await http().get(`/contracts/${contractB}/forms/${first.id}`).set('Authorization', bearer(b.token)).expect(404);
    const bForms = await http().get(`/contracts/${contractB}/forms`).set('Authorization', bearer(b.token)).expect(200);
    expect(bForms.body).toEqual([]);
    const inB = await tenantPrisma.runInTenantContext(b.companyId, (tx) => tx.formInstance.count({ where: { id: first.id } }));
    expect(inB).toBe(0);
    // ومسبارُ العدّ يرى في منشأته (ق-١٣٦).
    expect(await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.formInstance.count({ where: { id: first.id } }))).toBe(1);
  });

  it('⑦ الختمُ «مراجعة» والتعبئةُ «تسجيل»: موظّفٌ بالاطّلاع والتسجيل يعبّئ ولا يختم', async () => {
    const template = await http()
      .post('/templates')
      .set('Authorization', bearer(a.token))
      .send({ name: `معبّئ النماذج ${stamp}`, isAllScreens: false, allowedScreens: ['contracts'], screenActions: { contracts: ['view', 'record'] } })
      .expect(201);
    const username = `forms-filler-${stamp}`;
    await http()
      .post('/company-users')
      .set('Authorization', bearer(a.token))
      .send({ name: 'معبّئ', username, password: 'FormsFill123!', permissionTemplateId: template.body.id })
      .expect(201);
    const token = (await http().post('/auth/login').send({ username, password: 'FormsFill123!' }).expect(200)).body.accessToken as string;

    await http()
      .put(`/contracts/${contractA2}/forms/${draftId}/values`)
      .set('Authorization', bearer(token))
      .send({ values: [{ itemId: items.meter, number: 7 }] })
      .expect(200);
    await http().post(`/contracts/${contractA2}/forms/${draftId}/seal`).set('Authorization', bearer(token)).expect(403);
  });

  it('⑧ مسوّدةٌ عُبّئت «حالتُها» نصّاً حرّاً قبل السلّم لا تُختم به، وتُختم حين تُختار قيمتُها من السلّم (ق-١٦٤١/٥)', async () => {
    // القيمةُ القديمة تُكتب في القاعدة مباشرةً كما كتبها البرنامجُ قبل السلّم (والمسوّدةُ تُعدَّل في القاعدة، ⑤).
    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.formValue.upsert({
        where: { instanceId_itemId: { instanceId: draftId, itemId: items.cond } },
        create: { companyId: a.companyId, instanceId: draftId, itemId: items.cond, textValue: 'مقبول' },
        update: { textValue: 'مقبول' },
      }),
    );
    const seal = () => http().post(`/contracts/${contractA2}/forms/${draftId}/seal`).set('Authorization', bearer(a.token));
    const legacy = await seal().expect(400);
    expect(legacy.body.message).toContain('قيمةٌ قديمة');
    expect(legacy.body.message).toContain('حالةُ الخزائن');

    await http()
      .put(`/contracts/${contractA2}/forms/${draftId}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: items.cond, text: 'DAMAGED', note: 'كسرٌ في الرفّ' }] })
      .expect(200);
    const sealed = await seal().expect(201);
    expect(sealed.body.status).toBe('SEALED');
    expect(sealed.body.items.find((i: { itemId: string }) => i.itemId === items.cond)).toMatchObject({ text: 'DAMAGED', note: 'كسرٌ في الرفّ' });
  });
});
