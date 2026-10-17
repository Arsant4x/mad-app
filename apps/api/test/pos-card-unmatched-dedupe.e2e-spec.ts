import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PosCardVerificationsService } from '../src/pos/pos-card-verifications.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { backdateShiftOpening } from './backdate-shift';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(120000);

const DAY_MS = 86_400_000;

/**
 * Card payments not yet matched by a network settlement are raised for review once each. A run that
 * meets one already raised payment and one newly overdue payment must still raise the new one.
 */
describe('unmatched card payments: a newly overdue payment is raised next to an already raised one (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let productId: string;
  let shiftId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const tenant = () => app.get(TenantPrismaService);

  async function syncOverdueSale(): Promise<{ id: string; no: string }> {
    const res = await auth(http().post('/pos/sales/sync'))
      .send({
        clientSaleId: randomUUID(),
        ringAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
        ringOffsetMin: 180,
        lines: [{ productId, quantity: 1 }],
        paymentMethod: 'CARD',
        cardDeviceReference: `RRN-DEDUPE-${randomUUID()}`,
      })
      .expect(201);
    return { id: res.body.id as string, no: res.body.no as string };
  }

  function notesFor(invoiceId: string) {
    return tenant().runInTenantContext(co.companyId, (tx) => tx.notification.findMany({ where: { kind: 'POS_CARD_UNMATCHED', linkId: invoiceId } }));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    co = await registerIsolatedCompany(app, 'carddedupe');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `dedupe ${Date.now()}`, price: 100 }).expect(201)).body.id;
    shiftId = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id;
    // The sales are rung five days ago, so the shift they are synced to opened before them.
    await backdateShiftOpening(app, co.companyId, [shiftId], new Date(Date.now() - 6 * DAY_MS));
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('raises the newly overdue payment even though an older one was raised before', async () => {
    const verifications = app.get(PosCardVerificationsService);
    const first = await syncOverdueSale();
    expect(await verifications.raiseOverdue(co.companyId)).toBe(1);
    expect(await notesFor(first.id)).toHaveLength(1);

    const second = await syncOverdueSale();
    expect(await verifications.raiseOverdue(co.companyId)).toBe(1);
    expect(await notesFor(second.id)).toHaveLength(1);
    expect(await notesFor(first.id)).toHaveLength(1);

    // And nothing more on the next run.
    expect(await verifications.raiseOverdue(co.companyId)).toBe(0);
  });
});
