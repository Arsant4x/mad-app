import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ معزولة وستُّ مراحل قصيرة.
jest.setTimeout(60000);

/**
 * ⭐ `ق-١٣٧٧` — **سببُ الحركة اليدوية إلزاميٌّ من اليوم**، بطبقتين (`§6.6`):
 *
 * ① الخدمةُ ترفض الغيابَ والمسافاتِ برسالةٍ مسمّاة، وتكتب السببَ مشذَّباً.
 * ② وقيدُ القاعدة يرفض حركةً يدويةً بلا سبب **بعد لحظة الهجرة** ولو كُتبت بغير الخدمة —
 *    **ويقبل القائمَ قبلها** (يُعدّ ولا يُملأ بسببٍ مخترَع).
 */
describe('سببُ الحركة اليدوية إلزاميّ (ق-١٣٧٧)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let productId: string;
  let warehouseId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const inContext = <T>(work: Parameters<TenantPrismaService['runInTenantContext']>[1]) =>
    app.get(TenantPrismaService).runInTenantContext(co.companyId, work) as Promise<T>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    co = await registerIsolatedCompany(app, 'mvreason');
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع السبب ${Date.now()}` }).expect(201)).body.id;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف السبب ${Date.now()}`, price: 10 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('① بلا سبب ⟸ `400` ولا تُكتب حركة', async () => {
    const before = await inContext<number>((tx) => tx.stockMovement.count({ where: { productId } }));
    await auth(http().post('/inventory/movements')).send({ productId, warehouseId, type: 'IN', qty: 3, unitCost: 2, date: today() }).expect(400);
    const after = await inContext<number>((tx) => tx.stockMovement.count({ where: { productId } }));
    expect(after).toBe(before);
  });

  it('② سببٌ من مسافاتٍ وحدَها ⟸ `400` برسالة الخدمة المسمّاة', async () => {
    const res = await auth(http().post('/inventory/movements')).send({ productId, warehouseId, type: 'IN', qty: 3, unitCost: 2, date: today(), reason: '   ' }).expect(400);
    expect(String(res.body.message)).toContain('سببُ الحركة اليدوية مطلوب');
  });

  it('③ سببٌ حقيقيّ ⟸ `201` ويُكتب مشذَّباً', async () => {
    const res = await auth(http().post('/inventory/movements')).send({ productId, warehouseId, type: 'IN', qty: 3, unitCost: 2, date: today(), reason: '  جردٌ دوريّ  ' }).expect(201);
    const row = await inContext<{ reason: string | null; origin: string }>((tx) =>
      tx.stockMovement.findUniqueOrThrow({ where: { id: res.body.id }, select: { reason: true, origin: true } }),
    );
    expect(row).toEqual({ reason: 'جردٌ دوريّ', origin: 'MANUAL' });
  });

  it('④ ⭐ القاعدةُ ترفض حركةً يدويةً بلا سبب **بغير الخدمة** — والرفضُ من القيد بعينه', async () => {
    await expect(
      inContext((tx) => tx.stockMovement.create({ data: { companyId: co.companyId, productId, warehouseId, type: 'OUT', qty: 1, date: new Date(), origin: 'MANUAL' } as never })),
    ).rejects.toThrow(/stock_movements_manual_reason_required/);
    await expect(
      inContext((tx) => tx.stockMovement.create({ data: { companyId: co.companyId, productId, warehouseId, type: 'OUT', qty: 1, date: new Date(), origin: 'MANUAL', reason: '  ' } as never })),
    ).rejects.toThrow(/stock_movements_manual_reason_required/);
  });

  it('⑤ والقائمُ قبل لحظة الهجرة يبقى مقبولاً بلا سبب — يُعدّ ولا يُملأ', async () => {
    const id = await inContext<string>(async (tx) =>
      (
        await tx.stockMovement.create({
          data: { companyId: co.companyId, productId, warehouseId, type: 'OUT', qty: 1, date: new Date('2026-01-01'), origin: 'MANUAL', createdAt: new Date('2026-01-01T00:00:00Z') } as never,
          select: { id: true },
        })
      ).id,
    );
    expect(typeof id).toBe('string');
  });

  it('⑥ والقيدُ قائمٌ في الكتالوج بشرطه — لا مجرّد رفضٍ لسببٍ آخر', async () => {
    const rows = await inContext<{ def: string }[]>((tx) =>
      tx.$queryRaw`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'stock_movements_manual_reason_required'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain('MANUAL');
    expect(rows[0].def).toContain('btrim(reason)');
    expect(rows[0].def).toContain('"createdAt" <');
  });
});
