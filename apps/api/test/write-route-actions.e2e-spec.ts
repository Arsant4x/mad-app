import { Controller, Get, INestApplication, Module, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { OwnerOnly } from '../src/common/tenant/owner-only.decorator';
import { RequiresAction } from '../src/common/tenant/requires-action.decorator';
import { RequiresScreen } from '../src/common/tenant/requires-screen.decorator';
import { TenantWide } from '../src/common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../src/common/tenant/tenant.guard';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: about three times the measured run.
jest.setTimeout(120000);

/**
 * Write routes under a screen check the template's action, not the screen alone.
 *
 * Five write routes (maintenance assign, start and cancel, reservation cancel and
 * logging a rent reminder) declared no action, so an employee holding only "view"
 * on their screen could run them. The probe controllers below pin the guard rule
 * that replaces the omission: a write under a screen without a declared action is
 * refused for every actor, unless it is marked owner only or tenant wide.
 */
@Controller('probe-screen-writes')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('maintenance')
class ProbeScreenWritesController {
  @Get()
  read() {
    return { ok: true, kind: 'read' };
  }

  @Post()
  undeclared() {
    return { ok: true, kind: 'undeclared' };
  }

  @Post('declared')
  @RequiresAction('edit')
  declared() {
    return { ok: true, kind: 'declared' };
  }

  @Post('owner')
  @OwnerOnly()
  owner() {
    return { ok: true, kind: 'owner' };
  }

  @Post('wide')
  @TenantWide('probe write open to every actor of the company by a written reason')
  wide() {
    return { ok: true, kind: 'wide' };
  }
}

@Module({ controllers: [ProbeScreenWritesController] })
class ProbeModule {}

describe('Write routes under a screen require a declared action (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let ownerToken: string;
  let viewerToken: string;
  let grantedToken: string;
  let propertyId: string;
  const units: string[] = [];
  const installments: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${ownerToken}`);
  const asViewer = (r: request.Test) => r.set('Authorization', `Bearer ${viewerToken}`);
  const asGranted = (r: request.Test) => r.set('Authorization', `Bearer ${grantedToken}`);

  async function employee(tag: string, screenActions: Record<string, string[]>): Promise<string> {
    const template = await asOwner(http().post('/templates'))
      .send({ name: `${tag} ${suffix}`, isAllScreens: false, allowedScreens: Object.keys(screenActions), screenActions })
      .expect(201);
    const username = `${tag}-${suffix}`;
    await asOwner(http().post('/company-users'))
      .send({ name: `employee ${tag}`, username, password: 'WritePass123!', permissionTemplateId: template.body.id, allBranches: true })
      .expect(201);
    return (await http().post('/auth/login').send({ username, password: 'WritePass123!' }).expect(200)).body.accessToken;
  }

  async function newMaintenance(): Promise<string> {
    const res = await asOwner(http().post('/maintenance')).send({ propertyId, title: 'water heater leak', reportedAt: '2026-03-01' }).expect(201);
    return res.body.id;
  }

  async function newReservation(unitId: string): Promise<string> {
    const res = await asOwner(http().post('/reservations')).send({ unitId, name: `reservation ${suffix}`, expiryDate: '2030-01-01' }).expect(201);
    return res.body.id;
  }

  async function maintenanceStatus(id: string): Promise<string> {
    return (await asOwner(http().get(`/maintenance/${id}`)).expect(200)).body.status;
  }

  async function reservationStatus(id: string): Promise<string> {
    const list = await asOwner(http().get('/reservations')).expect(200);
    const rows = (Array.isArray(list.body) ? list.body : list.body.items) as { id: string; status: string }[];
    return rows.find((r) => r.id === id)?.status ?? 'missing';
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'write-actions');
    ownerToken = company.token;

    viewerToken = await employee('viewer', { maintenance: ['view'], properties: ['view'], contracts: ['view'] });
    grantedToken = await employee('granted', { maintenance: ['view', 'edit', 'delete'], properties: ['view', 'delete'], contracts: ['view', 'record'] });

    propertyId = (await asOwner(http().post('/properties')).send({ name: `write actions ${suffix}`, ownership: 'owned' }).expect(201)).body.id;
    for (let i = 0; i < 4; i++) {
      const unit = await asOwner(http().post('/units')).send({ propertyId, unitNo: `WA-${i}-${suffix}`, type: 'سكني', rentMonthly: 1000 }).expect(201);
      units.push(unit.body.id);
    }
    const contract = await asOwner(http().post('/contracts'))
      .send({
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
        unitId: units[3],
        customerId: await createTenantCustomer(app, ownerToken, `tenant ${suffix}`, '0500000000'),
        value: 12000,
        cycle: 'monthly',
        start: '2027-01-01',
        end: '2027-12-31',
      })
      .expect(201);
    for (const inst of contract.body.installments as { id: string }[]) installments.push(inst.id);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('an employee with view only', () => {
    it('reads maintenance requests', async () => {
      await asViewer(http().get('/maintenance')).expect(200);
    });

    it('cannot assign a maintenance request', async () => {
      const id = await newMaintenance();
      const res = await asViewer(http().post(`/maintenance/${id}/assign`)).send({ assignedTo: 'plumbing contractor' }).expect(403);
      expect(res.body.code).toBe('ACTION_FORBIDDEN');
      expect(await maintenanceStatus(id)).toBe('REPORTED');
    });

    it('cannot start a maintenance request', async () => {
      const id = await newMaintenance();
      const res = await asViewer(http().post(`/maintenance/${id}/start`)).send({ startedAt: '2026-03-02' }).expect(403);
      expect(res.body.code).toBe('ACTION_FORBIDDEN');
      expect(await maintenanceStatus(id)).toBe('REPORTED');
    });

    it('cannot cancel a maintenance request', async () => {
      const id = await newMaintenance();
      const res = await asViewer(http().post(`/maintenance/${id}/cancel`)).send({ cancelReason: 'fixed by the tenant' }).expect(403);
      expect(res.body.code).toBe('ACTION_FORBIDDEN');
      expect(await maintenanceStatus(id)).toBe('REPORTED');
    });

    it('cannot cancel a reservation', async () => {
      const id = await newReservation(units[0]);
      const res = await asViewer(http().patch(`/reservations/${id}/cancel`)).expect(403);
      expect(res.body.code).toBe('ACTION_FORBIDDEN');
      expect(await reservationStatus(id)).toBe('ACTIVE');
    });

    it('cannot log a rent reminder', async () => {
      const res = await asViewer(http().post(`/reminders/installments/${installments[0]}/send`)).send({ channel: 'WHATSAPP', message: 'your rent is due' }).expect(403);
      expect(res.body.code).toBe('ACTION_FORBIDDEN');
      const history = await asOwner(http().get(`/reminders/installments/${installments[0]}/history`)).expect(200);
      expect(history.body).toEqual([]);
    });
  });

  it('an employee holding the declared actions runs all five', async () => {
    const assigned = await newMaintenance();
    expect((await asGranted(http().post(`/maintenance/${assigned}/assign`)).send({ assignedTo: 'plumbing contractor' }).expect(201)).body.status).toBe('ASSIGNED');
    expect((await asGranted(http().post(`/maintenance/${assigned}/start`)).send({ startedAt: '2026-03-02' }).expect(201)).body.status).toBe('IN_PROGRESS');
    const cancelled = await newMaintenance();
    expect((await asGranted(http().post(`/maintenance/${cancelled}/cancel`)).send({ cancelReason: 'duplicate report' }).expect(201)).body.status).toBe('CANCELLED');
    const reservation = await newReservation(units[1]);
    expect((await asGranted(http().patch(`/reservations/${reservation}/cancel`)).expect(200)).body.status).toBe('EXPIRED');
    await asGranted(http().post(`/reminders/installments/${installments[1]}/send`)).send({ channel: 'WHATSAPP', message: 'your rent is due' }).expect(201);
  });

  it('the owner runs all five', async () => {
    const assigned = await newMaintenance();
    expect((await asOwner(http().post(`/maintenance/${assigned}/assign`)).send({ assignedTo: 'plumbing contractor' }).expect(201)).body.status).toBe('ASSIGNED');
    expect((await asOwner(http().post(`/maintenance/${assigned}/start`)).send({ startedAt: '2026-03-02' }).expect(201)).body.status).toBe('IN_PROGRESS');
    const cancelled = await newMaintenance();
    expect((await asOwner(http().post(`/maintenance/${cancelled}/cancel`)).send({ cancelReason: 'duplicate report' }).expect(201)).body.status).toBe('CANCELLED');
    const reservation = await newReservation(units[2]);
    expect((await asOwner(http().patch(`/reservations/${reservation}/cancel`)).expect(200)).body.status).toBe('EXPIRED');
    await asOwner(http().post(`/reminders/installments/${installments[2]}/send`)).send({ channel: 'WHATSAPP', message: 'your rent is due' }).expect(201);
  });

  it('a write under a screen that declares no action is refused for every actor', async () => {
    const owner = await asOwner(http().post('/probe-screen-writes')).expect(403);
    expect(owner.body.code).toBe('ACTION_UNDECLARED');
    const granted = await asGranted(http().post('/probe-screen-writes')).expect(403);
    expect(granted.body.code).toBe('ACTION_UNDECLARED');
  });

  it('reads, declared writes and owner only or tenant wide writes under a screen still pass', async () => {
    await asViewer(http().get('/probe-screen-writes')).expect(200);
    await asOwner(http().post('/probe-screen-writes/declared')).expect(201);
    await asGranted(http().post('/probe-screen-writes/declared')).expect(201);
    expect((await asViewer(http().post('/probe-screen-writes/declared')).expect(403)).body.code).toBe('ACTION_FORBIDDEN');
    await asOwner(http().post('/probe-screen-writes/owner')).expect(201);
    await asGranted(http().post('/probe-screen-writes/owner')).expect(403);
    await asViewer(http().post('/probe-screen-writes/wide')).expect(201);
  });
});
