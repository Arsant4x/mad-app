import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

describe('Bank transactions tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  // منشأتان معزولتان (ق-٧٢٢): «أ» تُنشئ البنكَ وحركاتِه و«ب» الغريبةُ — كلتاهما يصنعها الاختبارُ ويزيلها.
  let companyA: IsolatedCompany;
  let companyB: IsolatedCompany;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    companyA = await registerIsolatedCompany(app, 'tx-iso-a');
    companyB = await registerIsolatedCompany(app, 'tx-iso-b');
    tokenA = companyA.token;
    tokenB = companyB.token;
  }, 30000);

  afterAll(async () => {
    await removeIsolatedCompany(app, companyA);
    await removeIsolatedCompany(app, companyB);
    await app.close();
  }, 60000);

  /**
   * ⚠️ (ق-٢٨١ · ق-٢٨٢ · ق-٢٨٥) **كان عنوانُ هذا الاختبار «تُعدِّل رصيدَ البنك
   * عند الإنشاء والتعديل والحذف» — وكان يوثّق العطل**: رقمٌ يتحرك بلا قيدٍ
   * يسنده. والسطرُ البنكيُّ اليدويّ **سطرُ مطابقةٍ لا مصدرُ قيد** (لا يحمل طرفاً
   * مقابلاً)، والرصيدُ **مرآةٌ تتبع الأستاذ**.
   *
   * فصار يؤكّد الحكمَ الجديد: **الرصيدُ لا يتحرّك**، والعزلُ كما كان.
   */
  it('[SPEC 7.1 7.2] leaves the bank balance to the ledger and stays invisible to company B', async () => {
    const bank = await request(app.getHttpServer())
      .post('/banks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `بنك اختبار ${Date.now()}`, openingBalance: 1000, openingDate: '2026-01-01' })
      .expect(201);

    // Unique per run: the transactions list is paginated, so company B's
    // isolation is proven by a server-side search for this exact description
    // returning nothing tenant-wide — not by scanning one page of the
    // accumulated demo data.
    const description = `اختبار عزل ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tx = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ bankId: bank.body.id, date: '2026-01-02', description, amount: -200 })
      .expect(201);
    // الرصيدُ كما كان: السطرُ سجَّل حركةً ولم يمسّ الأستاذ.
    expect(Number(tx.body.bank.balance)).toBe(1000);

    const resB = await request(app.getHttpServer())
      .get('/transactions')
      .query({ search: description })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(resB.body.total).toBe(0);
    expect(resB.body.items.some((t: { id: string }) => t.id === tx.body.id)).toBe(false);

    await request(app.getHttpServer()).patch(`/transactions/${tx.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ amount: 1 }).expect(404);
    await request(app.getHttpServer()).delete(`/transactions/${tx.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    // والتعديلُ كذلك: المبلغُ يتغيّر في السطر، والرصيدُ لا يتحرّك.
    const updatedTx = await request(app.getHttpServer())
      .patch(`/transactions/${tx.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: -50 })
      .expect(200);
    expect(Number(updatedTx.body.amount)).toBe(-50);
    expect(Number(updatedTx.body.bank.balance)).toBe(1000);

    await request(app.getHttpServer()).delete(`/transactions/${tx.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);

    const bankAfterDelete = await request(app.getHttpServer()).get('/banks').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const found = bankAfterDelete.body.find((b: { id: string }) => b.id === bank.body.id);
    expect(Number(found.balance)).toBe(1000);

    await request(app.getHttpServer()).delete(`/banks/${bank.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);
});
