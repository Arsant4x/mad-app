import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { purgeInvoicesForTest } from './purge-invoices';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * الأرشفة (gap-analysis §1): hidden from day-to-day lists, still in the books.
 *
 * Proven on two entities with different list shapes (customer: plain list;
 * bank: branch-scoped list), plus the property that actually matters: an
 * archived customer's existing invoices keep appearing — archiving is
 * presentation, never data loss.
 */
describe('Archive (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): البنكُ يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let bankId: string;
  let invoiceId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const listIds = async (path: string): Promise<string[]> =>
    ((await auth(request(app.getHttpServer()).get(path)).expect(200)).body as { id: string }[]).map((x) => x.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'archive');
    token = company.token;

    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل الأرشيف ${suffix}` }).expect(201)).body.id;
    bankId = (await auth(request(app.getHttpServer()).post('/banks')).send({ name: `بنك الأرشيف ${suffix}`, openingBalance: 0, openingDate: '2025-01-01' }).expect(201)).body.id;

    const inv = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: '2025-06-01', dueDate: '2025-07-01', lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    invoiceId = inv.body.id;
  }, 60000);

  afterAll(async () => {
    // Unarchive so cleanup deletes work through the normal paths.
    await auth(request(app.getHttpServer()).patch(`/customers/${customerId}/archive`)).send({ archived: false });
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), company.companyId, [invoiceId]);
    await auth(request(app.getHttpServer()).delete(`/customers/${customerId}`));
    await auth(request(app.getHttpServer()).delete(`/banks/${bankId}`));
    // Purge from trash too, keeping the dev DB tidy.
    await auth(request(app.getHttpServer()).delete(`/trash/customers/${customerId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/banks/${bankId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 12.6] archives a customer out of the list, and back', async () => {
    expect(await listIds('/customers')).toContain(customerId);

    const res = await auth(request(app.getHttpServer()).patch(`/customers/${customerId}/archive`)).send({ archived: true }).expect(200);
    expect(res.body.archived).toBe(true);

    // Gone from the everyday list…
    expect(await listIds('/customers')).not.toContain(customerId);
    // …but one flag away when someone asks for the archive.
    expect(await listIds('/customers?includeArchived=true')).toContain(customerId);

    await auth(request(app.getHttpServer()).patch(`/customers/${customerId}/archive`)).send({ archived: false }).expect(200);
    expect(await listIds('/customers')).toContain(customerId);
  }, 60000);

  it('an archived customer stays in the books — its invoices keep showing', async () => {
    await auth(request(app.getHttpServer()).patch(`/customers/${customerId}/archive`)).send({ archived: true }).expect(200);

    const invoices = await listIds('/invoices');
    expect(invoices).toContain(invoiceId);
  }, 60000);

  it('works the same on a branch-scoped list (banks)', async () => {
    await auth(request(app.getHttpServer()).patch(`/banks/${bankId}/archive`)).send({ archived: true }).expect(200);
    expect(await listIds('/banks')).not.toContain(bankId);
    expect(await listIds('/banks?includeArchived=true')).toContain(bankId);
    await auth(request(app.getHttpServer()).patch(`/banks/${bankId}/archive`)).send({ archived: false }).expect(200);
  }, 60000);
});
