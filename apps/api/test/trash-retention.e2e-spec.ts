import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { RETENTION_YEARS } from '../src/companies/company-movement.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TrashService } from '../src/trash/trash.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (19.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(60000);

/**
 * السلّةُ والحفظُ النظاميّ (`ق-١٢٧١`/أ) — **ما تحت الحفظ لا يُمحى بالسلّة، ويُعلَن للتاجر أنه محفوظٌ نظاماً.**
 *
 * ## ما قِيس قبل البناء (2026-09-22، على قاعدةٍ نظيفة)
 *
 * الكنسُ الليليّ كان يقرأ بالعميل غير المقيَّد **بلا سياق منشأة**، والجداولُ تحت `FORCE ROW LEVEL
 * SECURITY` — فعاد فارغاً بنجاح: عميلٌ في السلّة منذ أربعين يوماً `rawSees: 0 · purged: 0`. أي أن
 * «تُمحى بعد ثلاثين يوماً» **لم تقع قطّ** من الكنس، والمحوُ النهائيّ بيد التاجر كان يمرّ على عقارٍ
 * بلا وحدات **فيجرّ بلاغاتِ صيانته وضماناتِه** (`Cascade`) — وهي سجلّاتٌ تُحفظ خمسَ عشرةَ سنة (`ق-١٥٢٢`).
 *
 * ## ما يُثبَت هنا
 * ① الكنسُ يرى الصفوفَ (منشأةً منشأةً داخل سياقها) ويمحو ما لا يشير إليه سجلّ.
 * ② ما يشير إليه سجلٌّ يُجرّ (`Cascade`) يبقى: الكنسُ يعدّه محفوظاً، والمحوُ اليدويّ `409` مسمّىً بالأجل، والقائمةُ تعلنه.
 * ③ ما يشير إليه سجلٌّ ترفض القاعدةُ حذفَه (`Restrict`) يُعلَن كذلك بدل خطأٍ خام — والأجلُ عشرٌ للدفاتر وخمسَ عشرةَ للعقار.
 * ④ الاسترجاعُ لا يتأثّر بالحفظ.
 */
describe('[SPEC 12.6] سلّةُ المحذوفات والحفظُ النظاميّ — ما تحت الحفظ لا يُمحى ويُعلَن (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let tenant: TenantPrismaService;
  let trash: TrashService;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const http = () => request(app.getHttpServer());

  let cleanCustomerId: string;
  let propertyId: string;
  let maintenanceId: string;
  let productId: string;

  const backdate = async (table: 'customers' | 'products' | 'properties', id: string, days: number) =>
    tenant.runInTenantContext(co.companyId, async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "${table}" SET "deletedAt" = now() - ($1::int * interval '1 day') WHERE id = $2`, days, id);
    });

  interface TrashItem { id: string; daysLeft: number; retainedUntil: string | null; retainedBy: string[] }
  const trashItem = async (entity: string, id: string): Promise<TrashItem | undefined> => {
    const body = (await auth(http().get('/trash')).expect(200)).body as { groups: { entity: string; items: TrashItem[] }[] };
    return body.groups.find((g) => g.entity === entity)?.items.find((i) => i.id === id);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenant = app.get(TenantPrismaService);
    trash = app.get(TrashService);
    co = await registerIsolatedCompany(app, 'trash-retention');

    // عميلٌ لا يشير إليه سجلّ · عقارٌ بلا وحدات عليه بلاغُ صيانة (Cascade) · صنفٌ على سطر فاتورة (Restrict)
    cleanCustomerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل بلا سجلّ' }).expect(201)).body.id as string;
    const invoiced = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الفاتورة' }).expect(201)).body.id as string;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: 'صنف على فاتورة', price: 100 }).expect(201)).body.id as string;
    await auth(http().post('/invoices'))
      .send({ customerId: invoiced, issueDate: '2026-07-01', dueDate: '2026-07-31', lines: [{ productId, description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    propertyId = (await auth(http().post('/properties')).send({ name: 'عقار بلا وحدات', ownership: 'owned' }).expect(201)).body.id as string;
    maintenanceId = (await auth(http().post('/maintenance')).send({ propertyId, title: 'بلاغ يُحفظ', reportedAt: '2026-03-01' }).expect(201)).body.id as string;

    await auth(http().delete(`/customers/${cleanCustomerId}`)).expect(204);
    await auth(http().delete(`/products/${productId}`)).expect(204);
    await auth(http().delete(`/properties/${propertyId}`)).expect(204);
    await backdate('customers', cleanCustomerId, 40);
    await backdate('products', productId, 40);
    await backdate('properties', propertyId, 40);
  }, 90000);

  afterAll(async () => {
    // ما بقي في السلّة يُسترجَع حتى تُزال المنشأةُ بمسارها المعتاد
    await tenant.runInTenantContext(co.companyId, async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE products SET "deletedAt" = NULL WHERE id = $1`, productId);
      await tx.$executeRawUnsafe(`UPDATE properties SET "deletedAt" = NULL WHERE id = $1`, propertyId);
    });
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('⓪ حارسٌ على المجسّ: الثلاثةُ في السلّة بتاريخ حذفٍ أقدمَ من النافذة — وإلا لم يُفحص كنس', async () => {
    for (const [entity, id] of [['customers', cleanCustomerId], ['products', productId], ['properties', propertyId]] as const) {
      const item = await trashItem(entity, id);
      expect(item).toBeTruthy();
      expect(new Date(await tenant.runInTenantContext(co.companyId, async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ deletedAt: Date }[]>(`SELECT "deletedAt" FROM "${entity}" WHERE id = $1`, id);
        return rows[0].deletedAt;
      })).getTime()).toBeLessThan(Date.now() - 39 * 86400000);
    }
  }, 60000);

  it('② القائمةُ تعلن ما تحت الحفظ: أجلُ العقار خمسَ عشرةَ سنةً بأسماء ما يحفظه، والصنفُ عشرٌ للدفاتر، والعميلُ النظيف بلا أجل', async () => {
    const property = (await trashItem('properties', propertyId))!;
    expect(property.retainedBy).toContain('بلاغات صيانة');
    expect(property.retainedUntil).toBeTruthy();
    const deletedYear = new Date().getUTCFullYear();
    // الأجلُ من تاريخ الحذف (قبل أربعين يوماً) + ١١ — يقع في السنة نفسِها أو التي قبلها حسب موضع اليوم في السنة
    const propertyYear = Number(property.retainedUntil!.slice(0, 4));
    expect([deletedYear + RETENTION_YEARS.realEstate, deletedYear + RETENTION_YEARS.realEstate - 1]).toContain(propertyYear);
    expect(property.daysLeft).toBeGreaterThan(365 * 9);

    const product = (await trashItem('products', productId))!;
    expect(product.retainedBy).toContain('بنود فواتير');
    const productYear = Number(product.retainedUntil!.slice(0, 4));
    expect([deletedYear + RETENTION_YEARS.books, deletedYear + RETENTION_YEARS.books - 1]).toContain(productYear);

    const clean = (await trashItem('customers', cleanCustomerId))!;
    expect(clean.retainedUntil).toBeNull();
    expect(clean.retainedBy).toEqual([]);
    expect(clean.daysLeft).toBe(0);
  }, 60000);

  it('② المحوُ اليدويّ لما تحت الحفظ يُردّ 409 مسمّىً بالأجل وبما يحفظه — لا خطأً خاماً ولا محواً يجرّ البلاغ', async () => {
    const res = await auth(http().delete(`/trash/properties/${propertyId}`)).expect(409);
    expect(String(res.body.message)).toContain('محفوظٌ نظاماً حتى');
    expect(String(res.body.message)).toContain('بلاغات صيانة');
    // الصنفُ المرجوعُ إليه بـRestrict: كان يسقط خطأَ قاعدةٍ خاماً — صار الرفضَ المسمّى نفسَه
    const res2 = await auth(http().delete(`/trash/products/${productId}`)).expect(409);
    expect(String(res2.body.message)).toContain('بنود فواتير');
    const stillThere = await tenant.runInTenantContext(co.companyId, async (tx) => ({
      maintenance: await tx.maintenanceRequest.count({ where: { id: maintenanceId } }),
      property: await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM properties WHERE id = $1`, propertyId),
    }));
    expect(stillThere.maintenance).toBe(1);
    expect(Number(stillThere.property[0].n)).toBe(1);
  }, 60000);

  it('① الكنسُ يرى الصفوفَ ويمحو النظيفَ وحدَه — والمحفوظُ يبقى بعدٍّ، وبلاغُ الصيانة لا يُجرّ', async () => {
    const result = await trash.purgeExpiredForCompany(co.companyId, new Date(Date.now() - 30 * 86400000));
    expect(result.purged).toBeGreaterThanOrEqual(1);
    expect(result.retained).toBe(2);

    const after = await tenant.runInTenantContext(co.companyId, async (tx) => ({
      clean: Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM customers WHERE id = $1`, cleanCustomerId))[0].n),
      property: Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM properties WHERE id = $1`, propertyId))[0].n),
      product: Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM products WHERE id = $1`, productId))[0].n),
      maintenance: await tx.maintenanceRequest.count({ where: { id: maintenanceId } }),
    }));
    expect(after).toEqual({ clean: 0, property: 1, product: 1, maintenance: 1 });

    // والكنسُ الشامل (كلُّ المنشآت) يمرّ بهذه المنشأة ويعيد عدَّ المحفوظ — لا يسقط ولا يعمى
    const all = await trash.purgeExpired();
    expect(all.companies).toBeGreaterThanOrEqual(1);
    expect(all.retained).toBeGreaterThanOrEqual(2);
  }, 120000);

  it('④ الاسترجاعُ لا يتأثّر بالحفظ — ما بقي في السلّة يعود كما كان', async () => {
    await auth(http().post(`/trash/properties/${propertyId}/restore`)).expect(201);
    const listed = ((await auth(http().get('/properties')).expect(200)).body as { id: string }[] | { items: { id: string }[] });
    const ids = Array.isArray(listed) ? listed.map((p) => p.id) : listed.items.map((p) => p.id);
    expect(ids).toContain(propertyId);
    // ويُعاد إلى السلّة بتاريخه القديم كي يُزال مع المنشأة في afterAll
    await auth(http().delete(`/properties/${propertyId}`)).expect(204);
  }, 60000);

  it('⑤ حارسٌ على العمى: عدُّ الصفوف بلا سياقٍ صفرٌ وبه موجب — فالكنسُ القديم كان يقرأ الفراغ', async () => {
    const prisma = app.get(PrismaService);
    const raw = await prisma.product.count({ where: { id: productId, deletedAt: { not: null } } });
    const scoped = await tenant.runInTenantContext(co.companyId, (tx) => tx.product.count({ where: { id: productId, deletedAt: { not: null } } }));
    expect(raw).toBe(0);
    expect(scoped).toBe(1);
  }, 60000);
});
