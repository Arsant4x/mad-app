import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { ConsentService } from '../src/consent/consent.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// Suite budget: about three times the measured run, declared here instead of the five second default.
jest.setTimeout(120000);

/**
 * The address written on a processing agreement acceptance is the one Express resolves behind the
 * single trusted proxy (main.ts sets trust proxy to 1), never a value the client put in a header.
 */
describe('Processing agreement acceptance records the trusted client address (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let consent: ConsentService;
  let adminToken: string;
  let templateId: string;
  let version: number;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const companyIds: string[] = [];
  const DAY = 24 * 3600 * 1000;

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  let seq = 0;
  async function makeCompany(): Promise<{ id: string; token: string }> {
    const username = `consent-ip-${suffix}-${seq++}`;
    const res = await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username, password: 'ConsentPass123!', orgName: `Consent IP ${username}`, permissionTemplateId: templateId, subEnd: '2030-01-01' })
      .expect(201);
    companyIds.push(res.body.id);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ConsentPass123!' }).expect(200);
    return { id: res.body.id, token: login.body.accessToken };
  }

  async function storedIp(companyId: string): Promise<string | null> {
    const row = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.processingAgreementAcceptance.findFirst({ where: { version } }));
    expect(row).toBeTruthy();
    return row!.ip;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Same proxy trust as production, so req.ip is resolved the way it is behind the reverse proxy.
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    consent = app.get(ConsentService);

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;

    const templates = await admin(request(app.getHttpServer()).get('/templates')).expect(200);
    templateId = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean; companyId: string | null }[]).find((t) => t.isAllScreens && !t.isSystem && t.companyId === null)!.id;

    const published = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/versions'))
      .send({ summary: `Consent IP ${suffix}`, effectiveFrom: new Date(Date.now() + 31 * DAY).toISOString() })
      .expect(201);
    version = published.body.version;
    await prisma.subProcessorListVersion.update({ where: { version }, data: { effectiveFrom: new Date(Date.now() - DAY) } });
    consent.invalidate();
  });

  // An effective version gates every company, so it must go; acceptances reference it with Restrict
  // and leave with their company first.
  afterAll(async () => {
    for (const id of companyIds) await hardDeleteCompanyForTest(prisma, id);
    if (version !== undefined) await prisma.subProcessorListVersion.delete({ where: { version } });
    consent.invalidate();
    await app.close();
  });

  it('stores the address the trusted proxy appended, not the forged first entry of X-Forwarded-For', async () => {
    const co = await makeCompany();
    await request(app.getHttpServer())
      .post('/processing-agreement/accept')
      .set('Authorization', `Bearer ${co.token}`)
      .set('X-Forwarded-For', '203.0.113.66, 198.51.100.7')
      .send({ version })
      .expect(201);
    const ip = await storedIp(co.id);
    expect(ip).toBe('198.51.100.7');
    expect(ip).not.toBe('203.0.113.66');
  });

  it('stores the socket address when no forwarding header is sent', async () => {
    const co = await makeCompany();
    await request(app.getHttpServer()).post('/processing-agreement/accept').set('Authorization', `Bearer ${co.token}`).send({ version }).expect(201);
    expect(await storedIp(co.id)).toMatch(/127\.0\.0\.1|::1/);
  });
});
