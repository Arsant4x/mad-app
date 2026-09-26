import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تُقاس في أوّل تشغيلٍ ثم تُعلَن ثلاثةَ أضعاف المقيس.
jest.setTimeout(60000);

/**
 * ⚖️ **نوعُ صفّ البنك عمودٌ صريح — لا يُستنبط** (التوجيه ٢٦٤ §٢ ① — `ق-١٤٣١`).
 *
 * بنصّ المالك: «**نوعُ الصفّ: عمودٌ صريح «صندوقٌ نقديّ» أو «حسابٌ بنكيّ»، لا يُستنبط. ⇒ والقائمُ يُوسَم «غيرَ معلَن»، ولا
 * يُنقل حتى يُعلَن، كتصنيف العقود. ⛔ ولا يُستنبط من وجود الآيبان، فالاستنباطُ تخمين.**»
 *
 * **والقائمُ يُصنَع هنا كما تصنعه الهجرة**: صفٌّ بتاريخ إنشاءٍ يسبق لحظتَها يُعلَّم «غيرَ معلَن» — فقيدُ القاعدة يقبله؛
 * وصفٌّ جديدٌ «غيرُ معلَن» يرفضه القيد.
 */
describe('نوعُ صفّ البنك معلَنٌ لا مستنبَط (ق-١٤٣١)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const banks = async () => (await asOwner(http().get('/banks')).expect(200)).body as { id: string; kind: string }[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'bank-kind');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 7.3] ① الإنشاءُ بلا نوعٍ يُرفض مسمّىً — ولو حمل آيباناً (لا يُستنبط منه)', async () => {
    const res = await asOwner(http().post('/banks')).send({ name: `بلا نوع ${suffix}`, iban: 'SA0380000000608010167519', openingDate: '2026-01-01' }).expect(400);
    expect(([] as string[]).concat(res.body.message).join(' | ')).toContain('نوعَ الصفّ');
  });

  it('[SPEC 7.3] ② والنوعُ المعلَن يُحفظ كما أُعلن — صندوقٌ وحسابٌ بنكيّ', async () => {
    const box = (await asOwner(http().post('/banks')).send({ name: `صندوق ${suffix}`, kind: 'CASH_BOX', openingDate: '2026-01-01' }).expect(201)).body;
    const account = (await asOwner(http().post('/banks')).send({ name: `حساب ${suffix}`, kind: 'BANK_ACCOUNT', openingDate: '2026-01-01' }).expect(201)).body;
    expect(box.kind).toBe('CASH_BOX');
    expect(account.kind).toBe('BANK_ACCOUNT');
    const listed = await banks();
    expect(listed.find((b) => b.id === box.id)?.kind).toBe('CASH_BOX');
    expect(listed.find((b) => b.id === account.id)?.kind).toBe('BANK_ACCOUNT');
  });

  it('[SPEC 7.3] ③ و«غيرُ معلَن» ليس مدخلاً — لا في الإنشاء ولا في التعديل', async () => {
    await asOwner(http().post('/banks')).send({ name: `قديم ${suffix}`, kind: 'LEGACY_UNDECLARED', openingDate: '2026-01-01' }).expect(400);
    const bank = (await asOwner(http().post('/banks')).send({ name: `معلَن ${suffix}`, kind: 'CASH_BOX', openingDate: '2026-01-01' }).expect(201)).body;
    await asOwner(http().patch(`/banks/${bank.id}`)).send({ kind: 'LEGACY_UNDECLARED' }).expect(400);
  });

  it('[SPEC 7.3] ④ ⭐ والقائمُ «غيرُ المعلَن» يُعلَن بيد صاحبه — وقيدُ القاعدة يحبس الوسمَ على ما سبق الهجرة', async () => {
    const bank = (await asOwner(http().post('/banks')).send({ name: `سابق ${suffix}`, kind: 'BANK_ACCOUNT', openingDate: '2026-01-01' }).expect(201)).body;
    // صفٌّ جديدٌ «غيرُ معلَن» — يرفضه القيد (لحظةُ الهجرة تسبق إنشاءه).
    await expect(
      tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw`UPDATE "banks" SET "kind" = 'LEGACY_UNDECLARED' WHERE "id" = ${bank.id}`),
    ).rejects.toThrow(/banks_legacy_kind_before_cutover/);
    // والقائمُ كما تصنعه الهجرة: تاريخُه يسبق اللحظة ⟸ يقبله القيد.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRaw`UPDATE "banks" SET "kind" = 'LEGACY_UNDECLARED', "createdAt" = '2026-01-01' WHERE "id" = ${bank.id}`,
    );
    expect((await banks()).find((b) => b.id === bank.id)?.kind).toBe('LEGACY_UNDECLARED');
    // والإعلانُ فعلٌ صريح.
    const declared = (await asOwner(http().patch(`/banks/${bank.id}`)).send({ kind: 'CASH_BOX' }).expect(200)).body;
    expect(declared.kind).toBe('CASH_BOX');
  });
});
