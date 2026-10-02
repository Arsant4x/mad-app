import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(120000);

/**
 * **القيدُ اليدويّ لا يُخزَّن غيرَ متوازن بعد التدوير** (توجيه ٢٧٤ الكتلة ٥ · مراجعة 3.3 البند 2).
 *
 * ثبت بالتشغيل في الكتلة ٢هـ: قيدٌ يدويّ مدين `0.005` دائن `0.0045` كان يُقبل `201` فيُخزَّن مدين `0.01` دائن `0.00`،
 * فيقول المركزُ المالي `balanced: false`. وسطرُ القيد اليدويّ بخانتين الآن، والتوازنُ في `createJournalEntry` بالهللة
 * (حارسُه للمسار الآليّ `journal-balance.spec.ts`).
 *
 * ولكلِّ رفضٍ ضابط: الشكلُ نفسُه بخانتين يُقبل ويُخزَّن متوازناً، فالرفضُ للكسور لا لسببٍ آخر. والمسبارُ يقرأ ما خُزّن
 * فعلاً (القيدُ بمذكّرته) لا ردَّ الطلب وحدَه، والمركزُ المالي يبقى متوازناً بعد المحاولات كلِّها.
 */
interface Sheet {
  totalAssets: string;
  totalLiabilitiesAndEquity: string;
  balanced: boolean;
}

describe('القيدُ اليدويّ لا يُخزَّن غيرَ متوازن بعد التدوير (مراجعة 3.3 البند 2) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  let cash: string;
  let revenue: string;

  /** ما خُزّن فعلاً للقيد بمذكّرته: عددُ القيود ومجموعا أسطره نصّاً بخانتين. */
  const stored = (memo: string) =>
    inTenant(async (tx) => {
      const entries = await tx.journalEntry.findMany({ where: { memo }, include: { lines: true } });
      const sum = (pick: (l: { debit: Prisma.Decimal; credit: Prisma.Decimal }) => Prisma.Decimal) =>
        entries.flatMap((e) => e.lines).reduce((s, l) => s.plus(pick(l)), new Prisma.Decimal(0)).toFixed(2);
      return { entries: entries.length, debit: sum((l) => l.debit), credit: sum((l) => l.credit) };
    });
  const post = (memo: string, debits: number[], credits: number[]) =>
    auth(http().post('/journal')).send({
      date: today,
      memo,
      lines: [...debits.map((d) => ({ accountId: cash, debit: d, credit: 0 })), ...credits.map((c) => ({ accountId: revenue, debit: 0, credit: c }))],
    });
  const sheet = async (): Promise<Sheet> => (await auth(http().get('/reports/balance-sheet')).expect(200)).body as Sheet;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'je-round');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    cash = accounts.find((a) => a.code === '1000')!.id;
    revenue = accounts.find((a) => a.code === '4100')!.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① الضابط: الشكلُ نفسُه بخانتين يُقبل ويُخزَّن متوازناً، والمركزُ المالي متوازن', async () => {
    const memo = `بخانتين ${suffix}`;
    const res = await post(memo, [3.33, 3.34], [6.67]);
    const s = await sheet();
    expect({ status: res.status, stored: await stored(memo), balanced: s.balanced }).toEqual({
      status: 201,
      stored: { entries: 1, debit: '6.67', credit: '6.67' },
      balanced: true,
    });
  });

  it('🔴 ② مدين 0.005 مقابل دائن 0.0045 (حالةُ الكتلة ٢هـ) يُرفض ولا يُخزَّن، والمركزُ يبقى متوازناً', async () => {
    const memo = `كسور الهللة ${suffix}`;
    const res = await post(memo, [0.005], [0.0045]);
    const s = await sheet();
    expect({ status: res.status, stored: await stored(memo), balanced: s.balanced }).toEqual({
      status: 400,
      stored: { entries: 0, debit: '0.00', credit: '0.00' },
      balanced: true,
    });
  });

  it('🔴 ③ متوازنٌ قبل التدوير ويُخزَّن غيرَ متوازن: 3.335 + 3.335 مقابل 6.67 يُرفض ولا يُخزَّن', async () => {
    const memo = `نصف الهللة ${suffix}`;
    const res = await post(memo, [3.335, 3.335], [6.67]);
    expect({ status: res.status, stored: await stored(memo) }).toEqual({ status: 400, stored: { entries: 0, debit: '0.00', credit: '0.00' } });
  });
});
