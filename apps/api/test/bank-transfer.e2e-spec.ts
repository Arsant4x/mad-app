import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر (أطولُ اختبارٍ 11.0 ث تحت حِملٍ · والحزمةُ 233 ث أوّلَ تشغيلٍ بترجمتها) — معلَنةٌ هنا لا مفترَضة.
jest.setTimeout(60000);

/**
 * ⚖️ **نقلُ صفّ البنك بين الفروع — بنوعه المعلَن** (التوجيه ٢٦٤ §٢ · `ق-١٤٣١` · مبادئ `ق-١٤١٣` · `ق-١٤١٤` · `ق-١٤٣٢` · `ق-١٤٣٣` · `ق-١٤٣٦`).
 *
 * **الصندوقُ النقديّ إغلاقٌ وفتح** — جوابٌ محسوبٌ يداً: صندوقٌ بـ`500` في الشمال يُعدّ `480` ⟸ عجزٌ `20` على `5900` بالشمال ·
 * خروجُ `480` إلى `1190` بالشمال · دخولُ `480` في صندوقٍ جديدٍ بالجنوب ⟸ القديمُ مؤرشفٌ برصيدٍ صفر ورابطُه إلى خلفه، والجديدُ بـ`480`،
 * و`1190` صفرٌ على المنشأة، **والمرآتان** (`Bank.balance`) تتبعان القيود: صفر و`480`.
 * **والحسابُ البنكيّ للقادم وحدَه** — فرعُه يتغيّر ولا قيدَ ولا خلف. **و«غيرُ المعلَن» لا يُنقل حتى يُعلَن.**
 */
describe('نقلُ صفّ البنك بين الفروع — الصندوقُ إغلاقٌ وفتح، والحسابُ للقادم، وغيرُ المعلَن لا يُنقل (ق-١٤٣١)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  let northId: string;
  let southId: string;
  const accounts = async () => (await asOwner(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
  const closing = async (accountId: string, branchId?: string) =>
    (await asOwner(http().get(`/reports/ledger?accountId=${accountId}${branchId ? `&branchId=${branchId}` : ''}`)).expect(200)).body.closing as string;
  const banks = async () =>
    (await asOwner(http().get('/banks?includeArchived=true')).expect(200)).body as {
      id: string;
      name: string;
      kind: string;
      branchId: string | null;
      archived: boolean;
      transferredToId: string | null;
      accountId: string;
      balance: string;
    }[];
  const newBank = async (name: string, kind: 'CASH_BOX' | 'BANK_ACCOUNT', openingBalance = 0) =>
    (await asOwner(http().post('/banks')).send({ name, kind, openingBalance, openingDate: '2026-01-01', branchId: northId }).expect(201)).body as { id: string; accountId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'bank-transfer');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.6] ⭐ الصندوقُ يُعدّ ويُغلق في الشمال، ويُنقل رصيدُه بقيدين، ويُفتح في الجنوب — والمرآتان تتبعان القيود', async () => {
    const box = await newBank(`صندوق النقل ${suffix}`, 'CASH_BOX', 500);
    const res = await asOwner(http().post(`/banks/${box.id}/transfer`)).send({ toBranchId: southId, countedAmount: 480, date: '2026-09-24' }).expect(201);
    expect(res.body.kind).toBe('CASH_BOX');
    expect(res.body.bookBalance).toBe('500.00');
    expect(res.body.countedAmount).toBe('480.00');
    expect(res.body.variance).toBe('-20.00');
    expect(res.body.entries.variance).toBeTruthy();
    expect(res.body.entries.out).toBeTruthy();
    expect(res.body.entries.in).toBeTruthy();

    const all = await banks();
    const old = all.find((b) => b.id === box.id)!;
    const successor = all.find((b) => b.id === res.body.to.id)!;
    expect(old.archived).toBe(true);
    expect(old.transferredToId).toBe(successor.id);
    expect(old.branchId).toBe(northId);
    expect(successor.kind).toBe('CASH_BOX');
    expect(successor.branchId).toBe(southId);
    expect(successor.accountId).not.toBe(old.accountId);
    // الدفتر: القديمُ صفر، والجديدُ بالمعدود — وبفرعه.
    expect(await closing(old.accountId)).toBe('0.00');
    expect(await closing(successor.accountId)).toBe('480.00');
    expect(await closing(successor.accountId, southId)).toBe('480.00');
    // والمرآتان تتبعان القيود (ق-٢٨٢) — لا رقمٌ يتحرّك بلا قيد.
    expect(Number(old.balance)).toBe(0);
    expect(Number(successor.balance)).toBe(480);
    // العجزُ على 5900 بالشمال، والطريقُ صفرٌ على المنشأة وأثرُ طرفه في كلِّ فرع.
    const byCode = new Map((await accounts()).map((a) => [a.code, a.id]));
    expect(await closing(byCode.get('5900')!, northId)).toBe('20.00');
    expect(await closing(byCode.get('1190')!)).toBe('0.00');
    expect(await closing(byCode.get('1190')!, northId)).toBe('480.00');
    expect(await closing(byCode.get('1190')!, southId)).toBe('-480.00');
  });

  it('[SPEC 2.6] ⭐ والحسابُ البنكيّ ينتقل للقادم وحدَه — فرعُه يتغيّر، ولا قيدَ ولا خلف، ولا عدَّ يُقبل', async () => {
    const account = await newBank(`حساب النقل ${suffix}`, 'BANK_ACCOUNT', 1000);
    const before = await closing(account.accountId);
    await asOwner(http().post(`/banks/${account.id}/transfer`)).send({ toBranchId: southId, countedAmount: 1000, date: '2026-09-24' }).expect(400);
    const res = await asOwner(http().post(`/banks/${account.id}/transfer`)).send({ toBranchId: southId }).expect(201);
    expect(res.body.kind).toBe('BANK_ACCOUNT');
    expect(res.body.fromBranchId).toBe(northId);
    expect(res.body.bank.branchId).toBe(southId);
    const all = await banks();
    expect(all.filter((b) => b.name === `حساب النقل ${suffix}`)).toHaveLength(1);
    expect(all.find((b) => b.id === account.id)!.archived).toBe(false);
    // لا قيدَ جديد: الدفترُ كما كان.
    expect(await closing(account.accountId)).toBe(before);
  });

  it('[SPEC 2.6] و«غيرُ المعلَن» لا يُنقل حتى يُعلَن — ثم يُنقل بنوعه', async () => {
    const bank = await newBank(`سابقٌ للنقل ${suffix}`, 'BANK_ACCOUNT');
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRaw`UPDATE "banks" SET "kind" = 'LEGACY_UNDECLARED', "createdAt" = '2026-01-01' WHERE "id" = ${bank.id}`,
    );
    const refused = await asOwner(http().post(`/banks/${bank.id}/transfer`)).send({ toBranchId: southId }).expect(409);
    expect(String(refused.body.message)).toContain('غيرُ معلَنِ النوع');
    await asOwner(http().patch(`/banks/${bank.id}`)).send({ kind: 'BANK_ACCOUNT' }).expect(200);
    await asOwner(http().post(`/banks/${bank.id}/transfer`)).send({ toBranchId: southId }).expect(201);
  });

  it('[SPEC 2.6] والصندوقُ يُعدّ لكلِّ ما في الدفتر — قيدٌ بعد تاريخ العدّ يوقفه، والمعدودُ إلزاميّ، وفرعُه ليس هدفاً', async () => {
    const box = await newBank(`صندوقٌ متأخّر ${suffix}`, 'CASH_BOX', 100);
    const revenueId = (await accounts()).find((a) => a.code === '4100')!.id;
    await asOwner(http().post('/journal'))
      .send({ date: '2026-09-28', memo: `بعد العدّ ${suffix}`, lines: [{ accountId: box.accountId, debit: 10, credit: 0 }, { accountId: revenueId, debit: 0, credit: 10 }] })
      .expect(201);
    const later = await asOwner(http().post(`/banks/${box.id}/transfer`)).send({ toBranchId: southId, countedAmount: 100, date: '2026-09-24' }).expect(409);
    expect(String(later.body.message)).toContain('2026-09-24');
    await asOwner(http().post(`/banks/${box.id}/transfer`)).send({ toBranchId: southId }).expect(400);
    await asOwner(http().post(`/banks/${box.id}/transfer`)).send({ toBranchId: northId, countedAmount: 110, date: '2026-09-29' }).expect(400);
  });

  it('[SPEC 2.6] والنقلُ فعلُ مالك — موظّفٌ بشاشة البنوك لا ينقل صندوقاً ولا حساباً (ق-١٤٣٢)', async () => {
    const template = await asOwner(http().post('/templates')).send({ name: `نقل البنوك ${suffix}`, allowedScreens: ['dashboard', 'banks'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف البنوك', username: `bank-transfer-${suffix}`, password: 'BankMove123!', permissionTemplateId: template.body.id })
      .expect(201);
    const token = (await http().post('/auth/login').send({ username: `bank-transfer-${suffix}`, password: 'BankMove123!' }).expect(200)).body.accessToken;
    const box = await newBank(`صندوقُ المالك ${suffix}`, 'CASH_BOX');
    await http().post(`/banks/${box.id}/transfer`).set('Authorization', `Bearer ${token}`).send({ toBranchId: southId, countedAmount: 0, date: '2026-09-24' }).expect(403);
  });
});
