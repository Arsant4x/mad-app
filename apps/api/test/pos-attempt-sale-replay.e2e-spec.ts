import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: a first estimate, to be set to three times the first time measured in CI.
jest.setTimeout(120000);

/**
 * A card payment attempt sent again with a known sale id answers the first attempt only when it asks for the same sale; the
 * same id with another sale (other lines, another buyer, another split) is refused with the same named 409 the sale path uses,
 * and no second attempt is written.
 */
describe('Card payment attempt replay is compared with the first attempt (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let productId: string;
  let otherProductId: string;
  let customerId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`).set('Accept-Language', 'en');
  const reused = resolveMessage(MSG.pos_sale_id_reused, 'en');

  const sale = (clientSaleId: string, extra: Record<string, unknown> = {}) => ({
    clientSaleId,
    ringAt: new Date().toISOString(),
    ringOffsetMin: 180,
    lines: [{ productId, quantity: 1 }],
    paymentMethod: 'CARD',
    ...extra,
  });
  const attemptsFor = (clientSaleId: string) =>
    app.get(TenantPrismaService).runInTenantContext(co.companyId, (tx) => tx.posPaymentAttempt.count({ where: { clientSaleId } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    co = await registerIsolatedCompany(app, 'attempt-replay');
    const product = (name: string) =>
      auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${Date.now()}`, price: 100 }).expect(201);
    productId = (await product('replay one')).body.id;
    otherProductId = (await product('replay two')).body.id;
    customerId = await createTenantCustomer(app, co.token, `replay buyer ${Date.now()}`);
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    await auth(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: 'attempt-replay' } }).expect(201);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('answers the first attempt when the same sale is sent again', async () => {
    const id = randomUUID();
    const first = await auth(http().post('/pos/payment-attempts')).send(sale(id)).expect(201);
    const again = await auth(http().post('/pos/payment-attempts')).send(sale(id, { ringAt: new Date(Date.now() + 1000).toISOString() })).expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await attemptsFor(id)).toBe(1);
  });

  it('refuses the same sale id with other lines', async () => {
    const id = randomUUID();
    await auth(http().post('/pos/payment-attempts')).send(sale(id)).expect(201);
    const other = await auth(http().post('/pos/payment-attempts')).send(sale(id, { lines: [{ productId, quantity: 2 }] }));
    expect(other.status).toBe(409);
    expect(other.body.message).toBe(reused);
    const swapped = await auth(http().post('/pos/payment-attempts')).send(sale(id, { lines: [{ productId: otherProductId, quantity: 1 }] }));
    expect(swapped.status).toBe(409);
    expect(await attemptsFor(id)).toBe(1);
  });

  it('refuses the same sale id with another buyer', async () => {
    const id = randomUUID();
    await auth(http().post('/pos/payment-attempts')).send(sale(id)).expect(201);
    const named = await auth(http().post('/pos/payment-attempts')).send(sale(id, { customerId }));
    expect(named.status).toBe(409);
    expect(named.body.message).toBe(reused);

    const namedId = randomUUID();
    const firstNamed = await auth(http().post('/pos/payment-attempts')).send(sale(namedId, { customerId })).expect(201);
    expect((await auth(http().post('/pos/payment-attempts')).send(sale(namedId, { customerId })).expect(201)).body.id).toBe(firstNamed.body.id);
    expect((await auth(http().post('/pos/payment-attempts')).send(sale(namedId))).status).toBe(409);
  });

  it('refuses the same sale id with another split of the payment', async () => {
    const id = randomUUID();
    const split = (cash: number, card: number) => sale(id, { paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: cash }, { method: 'CARD', amount: card }] });
    const first = await auth(http().post('/pos/payment-attempts')).send(split(15, 100)).expect(201);
    expect((await auth(http().post('/pos/payment-attempts')).send(split(15, 100)).expect(201)).body.id).toBe(first.body.id);
    const other = await auth(http().post('/pos/payment-attempts')).send(split(50, 65));
    expect(other.status).toBe(409);
    expect(other.body.message).toBe(reused);
    expect((await auth(http().post('/pos/payment-attempts')).send(sale(id))).status).toBe(409);
    expect(await attemptsFor(id)).toBe(1);
  });
});
