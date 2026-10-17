import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { CREDIT_CODE } from '../src/invoices/credit-context';
import { RaceResult, raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// One forced race that waits for both requests to stand behind a lock before release.
jest.setTimeout(120000);

/**
 * Two credit invoices for a customer near its hard credit limit, sent at the same moment.
 *
 * The interleaving is forced: a side transaction holds the customer row FOR UPDATE, which the invoice
 * insert's foreign key check needs, so both requests stop behind it. Without a lock on the customer taken
 * before the exposure read, both have already read the same exposure when they stop and both are created
 * once released. With it, the second request waits before its read, sees the first invoice and is refused.
 */
describe('Credit limit with hard block under two concurrent invoices', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let company: IsolatedCompany;
  let race: ReturnType<typeof raceHarness>;
  let branchId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const raceShape = (r: RaceResult) => ({ locked: r.locked, held: r.heldWhenFired, blocked: r.blocked });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'credit-limit-race');
    race = raceHarness(() => company.companyId, holdClient, probe);
    branchId = (await auth(http().post('/branches')).send({ name: `Credit race branch ${suffix}` }).expect(201)).body.id;
    await auth(http().patch('/company-profile')).send({ creditLimitHardBlock: true }).expect(200);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('two invoices that together pass the limit: one is created, the other is refused by the hard block', async () => {
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `Limited buyer ${suffix}`, creditLimit: 1000 }).expect(201)).body
      .id as string;
    // 500 net + 15% tax = 575 each: one fits under 1000, two do not.
    const invoice = () =>
      auth(http().post('/invoices')).send({
        customerId,
        branchId,
        issueDate: today(),
        dueDate: today(),
        lines: [{ description: `Credit sale ${suffix}`, quantity: 1, unitPrice: 500, taxRate: 15 }],
      });

    const result = await race.raceBehindLock('customers', customerId, invoice);
    const invoices = await tenantPrisma.runInTenantContext(company.companyId, (tx: Prisma.TransactionClient) => tx.invoice.count({ where: { customerId } }));

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: result.responses.find((r) => r.status !== 201)?.body?.code,
      invoices,
    }).toEqual({
      race: { locked: 1, held: 'held', blocked: 2 },
      statuses: [201, 403],
      refusal: CREDIT_CODE.hardBlock,
      invoices: 1,
    });
  });
});
