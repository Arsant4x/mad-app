import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

interface Account {
  id: string;
  code: string;
  name: string;
  balance: string;
  openingBalance: string;
}
interface Bank {
  id: string;
  name: string;
  accountId: string;
  openingBalance: string;
}

/**
 * **حسابٌ لكل بنك — الدفعة (ب١)** (`ق-٢٥٣` · `ق-٢٧٦` · `ق-٢٧٧`).
 *
 * العطلُ الذي تُغلقه: البنوكُ خارج الأستاذ — نقدُ البنك يُرحَّل إلى `1000`،
 * ورصيدُه يعيش في عمودٍ خارج الدفتر (`SPEC 7.6`، عائقُ إطلاق).
 *
 * ما يُقاس: الإنشاءُ يُنشئ الحساب في نطاق `1100`–`1199` · والترقيمُ `MAX+1` لا
 * عدّاً · **والرصيدُ الافتتاحيُّ يصير قيداً مقابل `3900`** لا رقماً مبذوراً.
 */
describe('Bank ↔ ledger account (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const banks: string[] = [];

  const createBank = (name: string, openingBalance = 0) =>
    auth(http().post('/banks')).send({ name, openingBalance, openingDate: '2026-01-01' });
  const accounts = async (): Promise<Account[]> => (await auth(http().get('/accounts')).expect(200)).body;
  const accountOf = async (bank: Bank) => (await accounts()).find((a) => a.id === bank.accountId);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    token = (await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    for (const id of banks) await auth(http().delete(`/banks/${id}`));
    await app.close();
  });

  it('① إنشاءُ بنكٍ يُنشئ حسابَه في الدليل — في نطاق 1100–1199، وباسمه', async () => {
    const bank = (await createBank(`بنك الاختبار ${suffix}`).expect(201)).body as Bank;
    banks.push(bank.id);

    expect(bank.accountId).toBeTruthy();
    const account = await accountOf(bank);
    expect(account).toBeTruthy();
    const code = Number(account!.code);
    expect(code).toBeGreaterThanOrEqual(1100);
    expect(code).toBeLessThanOrEqual(1199);
    expect(account!.name).toContain(bank.name);
  });

  it('② والترقيمُ `MAX+1` لا عدّاً: حسابٌ مزروع فوق الأعلى يدفع التاليَ فوقه، والفجوةُ تبقى', async () => {
    // يُقرأ الأعلى **من القاعدة** لا يُفترض رقمٌ ثابت: الحزمةُ تعمل على قاعدةٍ
    // تحمل بنوكاً سابقة، ورقمٌ مكتوب هنا يصدق مرةً ويكذب في التشغيل التالي.
    const inRange = (list: Account[]) => list.map((a) => Number(a.code)).filter((n) => n >= 1100 && n <= 1199);
    const before = Math.max(...inRange(await accounts()), 1099);
    const plantedCode = String(before + 7); // فجوةٌ مقصودة بين الأعلى والمزروع

    const planted = (await auth(http().post('/accounts')).send({ code: plantedCode, name: `حسابٌ مزروع ${suffix}`, type: 'asset' }).expect(201)).body as Account;

    const bank = (await createBank(`بنك ما بعد الفجوة ${suffix}`).expect(201)).body as Bank;
    banks.push(bank.id);
    const account = await accountOf(bank);
    // `MAX+1` = المزروع + 1 — **وعدٌّ للصفوف كان سيعطي رقماً داخل الفجوة**.
    expect(Number(account!.code)).toBe(before + 8);

    await auth(http().delete(`/accounts/${planted.id}`));
  });

  it('🔴 ③ والرصيدُ الافتتاحيُّ يصير **قيداً** مقابل 3900 — لا رقماً مبذوراً في العمود', async () => {
    const opening = 2500;
    const bank = (await createBank(`بنك برصيدٍ افتتاحي ${suffix}`, opening).expect(201)).body as Bank;
    banks.push(bank.id);

    const account = await accountOf(bank);
    expect(Number(account!.openingBalance)).toBe(opening);
    // الرصيدُ جاء من القيد لا من البذر: يساوي الافتتاحيّ بعد الترحيل.
    expect(Number(account!.balance)).toBe(opening);

    // والطرفُ المقابل موجودٌ وتحرّك: 3900 يحمل الرصيد بالسالب (حقوق ملكية).
    const equity = (await accounts()).find((a) => a.code === '3900');
    expect(equity).toBeTruthy();

    // وقيدٌ افتتاحيٌّ للحساب موجودٌ فعلاً في دفتر اليومية — والقائمةُ مُصفّحة
    // (`{ items, total }`) لا مصفوفةً عارية، فتُقرأ كما تُعيدها الخدمة.
    const page = (await auth(http().get('/journal?pageSize=100')).expect(200)).body as {
      items: { lines?: { accountId: string }[] }[];
      total: number;
    };
    expect(Array.isArray(page.items)).toBe(true);
    const hasEntry = page.items.some((e) => (e.lines ?? []).some((l) => l.accountId === bank.accountId));
    expect(hasEntry).toBe(true);
  });
});
