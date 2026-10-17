import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RentAccrualService } from '../src/contracts/rent-accrual.service';
import { RentRecognitionService } from '../src/contracts/rent-recognition.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// One contract on an isolated company, accrued and recognised to its end, then read through the return and the income statement.
jest.setTimeout(120000);

/**
 * Installments over unequal periods are each sized by the period they cover. An 18 month commercial contract at
 * 12,000 a year paid annually is 12,000 on 2026-01-01 and 6,000 on 2027-01-01, so the ledger recognises 12,000 of
 * rent in 2026 and 6,000 in 2027, and each tax point carries VAT on its own installment (1,800, then 900).
 */

interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string;
  serviceStart: string;
  serviceEnd: string;
}

describe('Installments are sized by the period they cover (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    company = await registerIsolatedCompany(app, 'by-period');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  async function rentReturn(year: number, month: number): Promise<{ standard: number; standardVat: number }> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query({ year, month }).expect(200)).body as { rent: Record<string, string> };
    return { standard: Number(body.rent.standard), standardVat: Number(body.rent.standardVat) };
  }

  async function rentRevenue(from: string, to: string): Promise<number> {
    const body = (await auth(http().get('/reports/income-statement')).query({ from, to }).expect(200)).body as { revenue: { code: string; amount: string }[] };
    return Number(body.revenue.find((a) => a.code === '4200')?.amount ?? 0);
  }

  it('an 18 month annual contract recognises 12,000 in 2026 and 6,000 in 2027, with VAT on each installment at its tax point', async () => {
    const property = await auth(http().post('/properties')).send({ name: `by period property ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `BP-${tag}`, type: 'shop', rentMonthly: 1000 }).expect(201);
    const customerId = await createTenantCustomer(app, company.token, `by period tenant ${tag}`);
    const created = await auth(http().post('/contracts'))
      .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, customerId, value: 18000, cycle: 'annual', start: '2026-01-01', end: '2027-06-30' })
      .expect(201);
    const contractId = created.body.id as string;
    const installments = [...(created.body.installments as E2eInstallment[])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // The second installment falls due on 2027-01-01; the sweep is run as of that day, then the deferred rent is
    // recognised through the contract's last month.
    await app.get(RentAccrualService).runForCompany(company.companyId, new Date('2027-01-01T00:00:00Z'));
    await app.get(RentRecognitionService).runForContract(company.companyId, contractId, new Date('2027-08-01T00:00:00Z'));

    expect({
      installments: installments.map((i) => ({ due: i.dueDate.slice(0, 10), amount: Number(i.amount), serviceEnd: i.serviceEnd.slice(0, 10) })),
      returnJanuary2026: await rentReturn(2026, 1),
      returnJanuary2027: await rentReturn(2027, 1),
      revenue2026: await rentRevenue('2026-01-01', '2026-12-31'),
      revenue2027: await rentRevenue('2027-01-01', '2027-12-31'),
    }).toEqual({
      installments: [
        { due: '2026-01-01', amount: 12000, serviceEnd: '2026-12-31' },
        { due: '2027-01-01', amount: 6000, serviceEnd: '2027-06-30' },
      ],
      returnJanuary2026: { standard: 12000, standardVat: 1800 },
      returnJanuary2027: { standard: 6000, standardVat: 900 },
      revenue2026: 12000,
      revenue2027: 6000,
    });
  });
});
