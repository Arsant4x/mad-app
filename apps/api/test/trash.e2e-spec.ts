import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (30.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(95000);

/**
 * سلة المحذوفات (gap-analysis §1).
 *
 * The properties that matter: deleting a master record hides it everywhere
 * without losing it, it can be put back intact, a permanent purge really does
 * remove it, and — as always — one company can never see or restore another's
 * deleted data.
 */
describe('Trash / soft delete (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = `عميل السلة ${suffix}`;
  let customerId: string;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  interface TrashGroup {
    entity: string;
    label: string;
    items: { id: string; name: string; deletedAt: string; daysLeft: number }[];
  }

  const trash = async (): Promise<{ retentionDays: number; groups: TrashGroup[] }> =>
    (await authA(request(app.getHttpServer()).get('/trash')).expect(200)).body;

  const customerIds = async (): Promise<string[]> =>
    ((await authA(request(app.getHttpServer()).get('/customers')).expect(200)).body as { id: string }[]).map((c) => c.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tokenA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;

    customerId = (await authA(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await authA(request(app.getHttpServer()).delete(`/trash/customers/${customerId}`));
    await app.close();
  });

  it('[SPEC 12.6] a deleted record leaves the list but lands in the trash, still named', async () => {
    expect(await customerIds()).toContain(customerId);

    await authA(request(app.getHttpServer()).delete(`/customers/${customerId}`)).expect(204);

    // Gone from every ordinary read — the tenant extension filters it centrally.
    expect(await customerIds()).not.toContain(customerId);


    const body = await trash();
    expect(body.retentionDays).toBe(30);
    const group = body.groups.find((g) => g.entity === 'customers');
    const item = group?.items.find((i) => i.id === customerId);
    expect(item).toBeTruthy();
    // Recognisable by name, not a bare uuid — you have to know what you're restoring.
    expect(item!.name).toBe(name);
    expect(item!.daysLeft).toBeGreaterThan(0);
    expect(item!.daysLeft).toBeLessThanOrEqual(30);
  }, 60000);

  it('[SPEC 12.6] restores it intact', async () => {
    await authA(request(app.getHttpServer()).post(`/trash/customers/${customerId}/restore`)).expect(201);

    expect(await customerIds()).toContain(customerId);
    const restored = ((await authA(request(app.getHttpServer()).get('/customers')).expect(200)).body as { id: string; name: string }[]).find((c) => c.id === customerId);
    // Came back intact, not as a blank shell.
    expect(restored?.name).toBe(name);

    // `?? false`: on a pristine DB this was the only trashed customer, so the
    // whole group vanishes — absence of the group is absence from the trash.
    const group = (await trash()).groups.find((g) => g.entity === 'customers');
    expect(group?.items.some((i) => i.id === customerId) ?? false).toBe(false);
  }, 60000);

  it('never shows one company another\'s trash, nor lets it restore from it', async () => {
    await authA(request(app.getHttpServer()).delete(`/customers/${customerId}`)).expect(204);

    const otherTrash = (await authB(request(app.getHttpServer()).get('/trash')).expect(200)).body as { groups: TrashGroup[] };
    expect(otherTrash.groups.some((g) => g.items.some((i) => i.id === customerId))).toBe(false);

    await authB(request(app.getHttpServer()).post(`/trash/customers/${customerId}/restore`)).expect(404);
    // And it is still recoverable by its real owner afterwards.
    const group = (await trash()).groups.find((g) => g.entity === 'customers');
    expect(group?.items.some((i) => i.id === customerId)).toBe(true);
  }, 60000);

  it('purges permanently, with no way back', async () => {
    await authA(request(app.getHttpServer()).delete(`/trash/customers/${customerId}`)).expect(204);

    // Same `?? false` as "restores it intact" — an emptied group disappears.
    const group = (await trash()).groups.find((g) => g.entity === 'customers');
    expect(group?.items.some((i) => i.id === customerId) ?? false).toBe(false);
    await authA(request(app.getHttpServer()).post(`/trash/customers/${customerId}/restore`)).expect(404);
  }, 60000);
});
