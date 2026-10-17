import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { dayEndOf } from '../src/common/wall-clock.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: a first estimate before it is measured, set to three times the first measured run in CI.
jest.setTimeout(180000);

/**
 * A contract's tax treatment (classification, VAT inclusion, mixed share) is fixed once rent was accrued or collected
 * under it: the posted rows, the later reductions on them and the VAT return all read it. The figures are worked by hand:
 * a monthly installment of 1,000, commercial and exclusive, bills 1,150 with 150 VAT; mixed at 40% exempt bills 1,090.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
const quarterOf = (d: Date) => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });

interface E2eInstallment {
  id: string;
  dueDate: string;
  remaining: string;
  status: string;
}

interface E2eContract {
  id: string;
  classification: string;
  vatInclusion: string;
  exemptSharePercent: string | null;
  installments: E2eInstallment[];
}

describe('Contract tax treatment after posting (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = dayEndOf(new Date());
  const todayIso = iso(today);
  const thisQuarter = quarterOf(today);
  const start = monthStart(today);
  const end = dayBefore(addMonths(start, 12));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'taxlock');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  async function returnRentVat(): Promise<number> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body;
    return Number((body.rent as Record<string, unknown>).standardVat);
  }

  async function makeUnit(): Promise<string> {
    const tag = `${Date.now()}-${++seq}`;
    const property = await auth(http().post('/properties')).send({ name: `Tax lock property ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `T-${tag}`, type: 'shop', rentMonthly: 1000 }).expect(201);
    return unit.body.id as string;
  }

  async function createContract(terms: Record<string, unknown>, from = start, to = end): Promise<E2eContract> {
    const body = {
      unitId: await makeUnit(),
      customerId: await createTenantCustomer(app, token, `Tax lock tenant ${++seq}`),
      value: 12000,
      cycle: 'monthly',
      start: iso(from),
      end: iso(to),
      ...terms,
    };
    return (await auth(http().post('/contracts')).send(body).expect(201)).body as E2eContract;
  }

  const fetchContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const accrualsOf = (contractId: string) => tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.rentAccrual.count({ where: { contractId } }));

  /** Pays the first installment what the contract says is left on it. */
  async function payFirstInstallment(contractId: string, discountShare = 0) {
    const first = (await fetchContract(contractId)).installments[0];
    const amount = Number(first.remaining);
    const discount = Math.round(amount * discountShare * 100) / 100;
    await auth(http().post(`/contracts/${contractId}/payments`))
      .send({ installmentId: first.id, amount, ...(discount > 0 ? { discount } : {}), method: 'CASH', date: todayIso })
      .expect(201);
    return (await fetchContract(contractId)).installments[0];
  }

  it('keeps the classification once rent was accrued, so the ledger VAT and the VAT return move together', async () => {
    const contract = await createContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    expect(await accrualsOf(contract.id)).toBeGreaterThan(0);
    const before = { vat: await balance('2200'), declared: await returnRentVat(), receivable: await balance('1200') };

    const change = await auth(http().patch(`/contracts/${contract.id}`)).send({ classification: 'RESIDENTIAL' });
    const paid = await payFirstInstallment(contract.id, 0.1);
    expect(paid.status).toBe('PAID');

    const after = { vat: await balance('2200'), declared: await returnRentVat(), receivable: await balance('1200') };
    // A 10% discount on 1,150 takes 15 of VAT back: from the ledger and from the return alike.
    expect(after.vat - before.vat).toBeCloseTo(after.declared - before.declared, 2);
    expect(after.receivable - before.receivable).toBeCloseTo(-1150, 2);
    expect(change.status).toBe(409);
    expect(String(change.body.message)).toContain('الضريبية للعقد');
    expect((await fetchContract(contract.id)).classification).toBe('COMMERCIAL');
  });

  it('keeps the VAT inclusion once rent was accrued, so a paid installment leaves nothing owed in the ledger', async () => {
    const receivableBefore = await balance('1200');
    const contract = await createContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    expect(await accrualsOf(contract.id)).toBeGreaterThan(0);

    const change = await auth(http().patch(`/contracts/${contract.id}`)).send({ vatInclusion: 'INCLUSIVE' });
    const paid = await payFirstInstallment(contract.id);
    expect(paid.status).toBe('PAID');

    expect((await balance('1200')) - receivableBefore).toBeCloseTo(0, 2);
    expect(change.status).toBe(409);
    expect((await fetchContract(contract.id)).vatInclusion).toBe('EXCLUSIVE');
  });

  it('keeps the mixed exempt share once rent was accrued, so a paid installment leaves nothing owed in the ledger', async () => {
    const receivableBefore = await balance('1200');
    const contract = await createContract({ classification: 'MIXED', vatInclusion: 'EXCLUSIVE', exemptSharePercent: 40, exemptShareBasis: 'Floor area' });
    expect(await accrualsOf(contract.id)).toBeGreaterThan(0);

    const change = await auth(http().patch(`/contracts/${contract.id}`)).send({ exemptSharePercent: 60 });
    const paid = await payFirstInstallment(contract.id);
    expect(paid.status).toBe('PAID');

    expect((await balance('1200')) - receivableBefore).toBeCloseTo(0, 2);
    expect(change.status).toBe(409);
    expect(Number((await fetchContract(contract.id)).exemptSharePercent)).toBe(40);
  });

  it('still accepts the same tax treatment sent again with other edits after posting', async () => {
    const contract = await createContract({ classification: 'MIXED', vatInclusion: 'EXCLUSIVE', exemptSharePercent: 40, exemptShareBasis: 'Floor area' });
    expect(await accrualsOf(contract.id)).toBeGreaterThan(0);
    const res = await auth(http().patch(`/contracts/${contract.id}`))
      .send({ classification: 'MIXED', vatInclusion: 'EXCLUSIVE', exemptSharePercent: 40, exemptShareBasis: 'Floor area, ground floor', services: 'Cleaning' })
      .expect(200);
    expect(res.body.services).toBe('Cleaning');
    expect(res.body.exemptShareBasis).toBe('Floor area, ground floor');
  });

  it('lets the tax treatment change while nothing was accrued or collected', async () => {
    const nextMonth = addMonths(start, 1);
    const contract = await createContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' }, nextMonth, dayBefore(addMonths(nextMonth, 12)));
    expect(await accrualsOf(contract.id)).toBe(0);
    const res = await auth(http().patch(`/contracts/${contract.id}`)).send({ classification: 'RESIDENTIAL', vatInclusion: 'INCLUSIVE' }).expect(200);
    expect(res.body.classification).toBe('RESIDENTIAL');
    expect(res.body.vatInclusion).toBe('INCLUSIVE');
  });

  it('lets a legacy contract declare its classification after rent was posted on it', async () => {
    const contract = await createContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    expect(await accrualsOf(contract.id)).toBeGreaterThan(0);
    // Stands in for a row from before the classification field: the legacy value with a createdAt before the cutover.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRaw(
        Prisma.sql`UPDATE "contracts" SET "classification" = 'LEGACY_UNCLASSIFIED'::"ContractClassification", "createdAt" = TIMESTAMP '2020-01-01 00:00:00' WHERE "id" = ${contract.id}`,
      ),
    );
    const res = await auth(http().patch(`/contracts/${contract.id}`)).send({ classification: 'COMMERCIAL' }).expect(200);
    expect(res.body.classification).toBe('COMMERCIAL');
  });
});
