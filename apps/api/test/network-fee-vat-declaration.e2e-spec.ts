import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: two isolated companies, a few documents each, and several declaration reads.
jest.setTimeout(120000);

/**
 * The acquirer's commission VAT on a network settlement is posted to input VAT 1250, so the VAT return
 * must carry it too: in box 7 by the settlement date (base = fee, VAT = fee VAT), deducted as a general
 * overhead (mixed) input, and reversed at the void date when the settlement is voided.
 * Hand-computed answer: fee 30, fee VAT 4.50.
 */
describe('Network settlement fee VAT in the VAT declaration (e2e)', () => {
  let app: INestApplication;
  let taxable: IsolatedCompany;
  let mixed: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  const declaration = async (c: IsolatedCompany, year: number, quarter: number) =>
    (await as(c)(http().get('/obligations/vat-declaration')).query({ year, quarter }).expect(200)).body;

  /** Bank, customer, one card receipt of 1500 in June and its settlement on 30 June with fee 30 and VAT 4.50. */
  const settleJune = async (c: IsolatedCompany): Promise<string> => {
    const auth = as(c);
    const bankId = (await auth(http().post('/banks')).send({ name: 'Network bank', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'Card customer' }).expect(201)).body.id;
    await auth(http().post('/payments'))
      .send({ customerId, date: '2026-06-03', amount: 1500, method: 'CARD', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
      .expect(201);
    const settlement = await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: '2026-06-30', periodFrom: '2026-06-01', periodTo: '2026-06-30', feeAmount: 30, feeVatAmount: 4.5 })
      .expect(201);
    return settlement.body.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    taxable = await registerIsolatedCompany(app, 'netfee-taxable');
    mixed = await registerIsolatedCompany(app, 'netfee-mixed');
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, taxable);
    await removeIsolatedCompany(app, mixed);
    await app.close();
  }, 60000);

  it('an all-taxable company declares the fee and its VAT in box 7 of the settlement quarter, and the void reverses them in its own quarter', async () => {
    const auth = as(taxable);
    const settlementId = await settleJune(taxable);

    const q2 = await declaration(taxable, 2026, 2);
    expect(q2.purchasesStandard).toBe('30.00');
    expect(q2.purchasesStandardVat).toBe('4.50');
    expect(q2.proportional.deductibleInputVat).toBe('4.50');

    await auth(http().post(`/banks/network-settlements/${settlementId}/void`)).send({}).expect(201);
    // The void is posted on the company's today; its quarter is read from the ledger row it wrote on 1250.
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const inputVat = accounts.find((a) => a.code === '1250');
    expect(inputVat).toBeDefined();
    const ledger = (await auth(http().get(`/reports/ledger?accountId=${inputVat!.id}`)).expect(200)).body as { closing: string; rows: { date: string; credit: string | number }[] };
    expect(ledger.closing).toBe('0.00');
    const voidRow = ledger.rows.find((r) => Number(r.credit) > 0);
    expect(voidRow).toBeDefined();
    const voidYear = Number(voidRow!.date.slice(0, 4));
    const voidQuarter = Math.floor((Number(voidRow!.date.slice(5, 7)) - 1) / 3) + 1;

    const voidPeriod = await declaration(taxable, voidYear, voidQuarter);
    expect(voidPeriod.purchasesStandard).toBe('-30.00');
    expect(voidPeriod.purchasesStandardVat).toBe('-4.50');
    expect(voidPeriod.proportional.deductibleInputVat).toBe('-4.50');

    // The settlement quarter keeps what it declared: a void does not rewrite a past period.
    expect((await declaration(taxable, 2026, 2)).purchasesStandardVat).toBe('4.50');
  });

  it('a company with exempt supplies deducts the fee VAT through the mixed bucket, and the annual settlement counts it', async () => {
    const auth = as(mixed);
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'Invoice customer' }).expect(201)).body.id;
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-05-10', dueDate: '2026-06-10', lines: [{ description: 'taxable', quantity: 1, unitPrice: 1000, taxRate: 15 }] })
      .expect(201);
    await auth(http().post('/invoices'))
      .send({
        customerId,
        issueDate: '2026-05-10',
        dueDate: '2026-06-10',
        lines: [{ description: 'exempt', quantity: 1, unitPrice: 1000, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2026, ratio: 0.8, basis: 'ESTIMATED' }).expect(201);
    await settleJune(mixed);

    const q2 = await declaration(mixed, 2026, 2);
    expect(q2.proportional.applies).toBe(true);
    expect(q2.proportional.buckets.mixed).toBe('4.50');
    expect(q2.proportional.apportionedBase).toBe('4.50');
    expect(q2.proportional.apportionedDeductible).toBe('3.60'); // 4.50 x 0.8
    expect(q2.proportional.deductibleInputVat).toBe('3.60');

    const preview = (await auth(http().get('/obligations/vat-ratio/settlement')).query({ year: 2026 }).expect(200)).body;
    expect(Number(preview.yearApportionedBase)).toBeCloseTo(4.5, 2);
  });
});
