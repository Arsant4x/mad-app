import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * The audit trail — SPEC 12.1/12.2.
 *
 * What must hold: every successful change is recorded **without the service
 * doing anything**, the entry reads as an Arabic sentence rather than a JSON
 * dump, secrets never land in it, one company can never read another's trail,
 * and there is no way to alter it.
 */
describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const customerName = `عميل التدقيق ${suffix}`;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  interface Entry {
    id: string;
    actorName: string;
    screen: string;
    action: string;
    entity: string;
    entityId: string | null;
    summary: string;
    details: Record<string, unknown> | null;
  }

  async function trail(): Promise<Entry[]> {
    const res = await authA(request(app.getHttpServer()).get('/audit-log?limit=200')).expect(200);
    return res.body as Entry[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tokenA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;
  }, 30000);

  afterAll(async () => {
    if (customerId) await authA(request(app.getHttpServer()).delete(`/customers/${customerId}`));
    await app.close();
  });

  it('records a change automatically, as a readable Arabic sentence', async () => {
    const created = await authA(request(app.getHttpServer()).post('/customers')).send({ name: customerName }).expect(201);
    customerId = created.body.id;

    const entry = (await trail()).find((e) => e.entityId === customerId && e.action === 'add');
    expect(entry).toBeTruthy();
    // Reads as a sentence naming what happened and to whom — not raw JSON.
    expect(entry!.summary).toBe(`أضاف عميل «${customerName}»`);
    expect(entry!.screen).toBe('customers');
    expect(entry!.entity).toBe('customers');
    expect(entry!.actorName).toBe('demo-company-a');
  }, 40000);

  it('records an edit distinctly from the creation', async () => {
    await authA(request(app.getHttpServer()).patch(`/customers/${customerId}`)).send({ phone: '0500000000' }).expect(200);

    const mine = (await trail()).filter((e) => e.entityId === customerId);
    const actions = mine.map((e) => e.action);
    expect(actions).toContain('add');
    expect(actions).toContain('edit');
  }, 40000);

  it('never stores a secret, even when the request carried one', async () => {
    // Creating an employee sub-account sends a password; it must be redacted.
    const username = `audit-emp-${suffix}`;
    const templates = await authA(request(app.getHttpServer()).get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isSystem: boolean }[]).find((t) => !t.isSystem);
    if (!tpl) return; // no assignable template in this DB — nothing to prove here

    const created = await authA(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'SecretPass123!', permissionTemplateId: tpl.id })
      .expect(201);

    const entry = (await trail()).find((e) => e.entity === 'company-users' && e.entityId === created.body.id);
    expect(entry).toBeTruthy();
    const serialized = JSON.stringify(entry!.details ?? {});
    expect(serialized).not.toContain('SecretPass123!');
    expect(serialized).toContain('[محذوف]');

    await authA(request(app.getHttpServer()).delete(`/company-users/${created.body.id}`));
  }, 40000);

  it('never shows one company another\'s trail', async () => {
    const res = await authB(request(app.getHttpServer()).get('/audit-log?limit=200')).expect(200);
    expect((res.body as Entry[]).some((e) => e.entityId === customerId)).toBe(false);
  }, 40000);

  it('is append-only — no endpoint can alter or remove an entry', async () => {
    const entry = (await trail())[0];
    expect(entry).toBeTruthy();
    // Neither verb is routed at all, so the app answers 404 rather than
    // exposing any path to rewrite history.
    await authA(request(app.getHttpServer()).patch(`/audit-log/${entry.id}`)).send({ summary: 'تلاعب' }).expect(404);
    await authA(request(app.getHttpServer()).delete(`/audit-log/${entry.id}`)).expect(404);
  }, 40000);
});
