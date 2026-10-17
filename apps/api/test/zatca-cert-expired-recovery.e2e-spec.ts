import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

jest.setTimeout(305000);

// Probe: once a production certificate has expired, is there any way left for the
// merchant to get a working certificate? Renewal is not built, and the onboarding
// code names manual re-onboarding as the recovery path.
describe('recovery after the production certificate expires (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenant: TenantPrismaService;
  let dir: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const certificate = (days: number): string => {
    const out = join(dir, `c${days}.pem`);
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', String(days), '-subj', '/CN=mad-app', '-keyout', join(dir, `k${days}.pem`), '-out', out], { stdio: 'pipe' });
    return readFileSync(out, 'utf8').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  };

  const installCertificate = (pem: string, notAfter: Date) =>
    tenant.runInTenantContext(company.companyId, (tx) =>
      tx.zatcaCredential.upsert({
        where: { companyId: company.companyId },
        create: { companyId: company.companyId, productionCsidEnc: encryptSecret(pem), status: 'PRODUCTION_ISSUED', certificateNotAfter: notAfter } as never,
        update: { productionCsidEnc: encryptSecret(pem), status: 'PRODUCTION_ISSUED', certificateNotAfter: notAfter },
      }),
    );

  const clearCredential = () =>
    tenant.runInTenantContext(company.companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId: company.companyId } }));

  const start = () => auth(http().post('/zatca/onboarding/start')).send({ environment: 'SANDBOX' });

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'zatca-recover-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenant = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'cert-recover');
    await auth(http().patch('/company-profile')).send({ legalName: 'Cert Recovery Probe', vatNumber: '300000000000003' }).expect(200);
  });

  afterAll(async () => {
    await clearCredential();
    await removeIsolatedCompany(app, company);
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('a company without a certificate can start onboarding', async () => {
    await clearCredential();
    const res = await start();
    expect(res.status).toBe(201);
  });

  it('a valid production certificate is protected from key regeneration', async () => {
    await installCertificate(certificate(40), new Date(Date.now() + 40 * 86400000));
    const res = await start();
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain('الربط مكتمل بالفعل');
  });

  it('an expired production certificate still leaves the merchant a way to re-onboard', async () => {
    await installCertificate(certificate(1), new Date(Date.now() - 2 * 86400000));
    const res = await start();
    expect(String(res.body.message)).not.toContain('الربط مكتمل بالفعل');
    expect(res.status).toBe(201);
  });
});
