import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { MockTerminalAdapter, TERMINAL_ADAPTERS } from '../src/integrations/payment-terminal.adapter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(120000);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A split card attempt whose answer arrives after its shift was closed completes the sale without
 * touching the closed drawer: the drawer account keeps the balance it was counted at.
 */
describe('POS card attempt completed after its shift closed (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let productId: string;
  let drawer = { id: '', accountId: '' };
  const mock = TERMINAL_ADAPTERS.MOCK as MockTerminalAdapter;
  const stamp = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const balanceOf = async (where: { id?: string; code?: string }): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.account.findFirst({ where, select: { balance: true } }));
    return Number(account?.balance ?? 0);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'pos-late-attempt');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `late attempt item ${stamp}`, price: 100 }).expect(201)).body.id;
    const created = (await auth(http().post('/cash-drawers')).send({ name: `late attempt drawer ${stamp}` }).expect(201)).body as { id: string; account: { id: string } };
    drawer = { id: created.id, accountId: created.account.id };
    await auth(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `late-${stamp}` } }).expect(201);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mock.chargeDeadlineMs = 90_000;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    mock.chargeDeadlineMs = 90_000;
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('posts the cash part of a sale completed after its shift closed outside the closed drawer', async () => {
    const shift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, drawerId: drawer.id }).expect(201)).body as { id: string };

    // The provider approves but answers after the adapter deadline, so the attempt is left unknown.
    mock.chargeDeadlineMs = 300;
    jest.spyOn(mock, 'charge').mockImplementation(async (_c, r) => {
      mock.remember(r.reference, { state: 'APPROVED', providerRef: `MOCK-${r.reference}`, approvalCode: 'A12345' });
      await sleep(1500);
      return { approved: true, providerRef: `MOCK-${r.reference}`, approvalCode: 'A12345' };
    });
    const attempt = (
      await auth(http().post('/pos/payment-attempts'))
        .send({
          clientSaleId: randomUUID(),
          ringAt: new Date().toISOString(),
          ringOffsetMin: 180,
          lines: [{ productId, quantity: 1 }],
          paymentMethod: 'SPLIT',
          payments: [
            { method: 'CASH', amount: 15 },
            { method: 'CARD', amount: 100 },
          ],
        })
        .expect(201)
    ).body as { id: string };
    expect((await auth(http().post(`/pos/payment-attempts/${attempt.id}/charge`)).expect(201)).body.status).toBe('UNKNOWN');

    await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    const drawerAtClose = await balanceOf({ id: drawer.accountId });
    const cashBefore = await balanceOf({ code: '1000' });

    const resolved = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)).expect(201);
    expect(resolved.body.status).toBe('COMPLETED');

    expect(await balanceOf({ id: drawer.accountId })).toBe(drawerAtClose);
    expect(await balanceOf({ code: '1000' })).toBe(cashBefore + 15);
  });

  it('refuses a split attempt with a cash part before any charge when account 1000 is missing', async () => {
    const co2 = await registerIsolatedCompany(app, 'pos-late-attempt-no-cash');
    const auth2 = (r: request.Test) => r.set('Authorization', `Bearer ${co2.token}`);
    try {
      const item = (await auth2(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `no cash account item ${stamp}`, price: 100 }).expect(201)).body.id as string;
      const box = (await auth2(http().post('/cash-drawers')).send({ name: `no cash account drawer ${stamp}` }).expect(201)).body.id as string;
      await auth2(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `late2-${stamp}` } }).expect(201);
      await auth2(http().post('/pos/shifts')).send({ openingFloat: 0, drawerId: box }).expect(201);
      const cash = await tenantPrisma.runInTenantContext(co2.companyId, (tx) => tx.account.findFirst({ where: { code: '1000' }, select: { id: true } }));
      expect(cash).not.toBeNull();
      await auth2(http().delete(`/accounts/${cash!.id}`)).expect(204);

      const sale = (extra: Record<string, unknown>) => ({ clientSaleId: randomUUID(), ringAt: new Date().toISOString(), ringOffsetMin: 180, lines: [{ productId: item, quantity: 1 }], ...extra });
      const refused = await auth2(http().post('/pos/payment-attempts'))
        .send(sale({ paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 15 }, { method: 'CARD', amount: 100 }] }))
        .expect(409);
      expect(String(refused.body.message)).toContain('1000');
      await auth2(http().post('/pos/payment-attempts')).send(sale({ paymentMethod: 'CARD' })).expect(201);
    } finally {
      await removeIsolatedCompany(app, co2);
    }
  });
});
