import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — تُعلَن بعد أوّل تشغيل.
jest.setTimeout(240000);

/**
 * 🔴 **الإرسالُ للهيئة لا يقع داخل معاملة القاعدة** (`ق-١٤٦٤`).
 *
 * بنصّ المالك: «**فقِسه على `main`. فإن كان قائماً فابنِه أوّلاً: حجزٌ في معاملة · ثم الإرسالُ خارجها · ثم معاملةٌ ثانيةٌ تكتب
 * النتيجة. وأثبته بكسر.**»
 *
 * **ما يُقاس**: الطابورُ (`OutboxService.dispatchForCompany`) هو من ينادي مرسِلَ الهيئة (`deliverIssued` ⟸ `fetch`). والمرسِلُ هنا
 * مرسِلُ اختبارٍ بنوعٍ فريد — **فالمقيسُ حدودُ المعاملة حول النداء لا الهيئة**: ① أيُرى الحجزُ ملتزَماً من معاملةٍ أخرى لحظةَ
 * الإرسال؟ ② وإرسالٌ أبطأُ من مهلة المعاملة (`5 s` افتراضاً، ومهلةُ الهيئة `30 s`) — أيُكتب له «أُرسل»؟ ③ والفشلُ يُكتب سببُه.
 * ④ وقارئٌ بنسخةٍ أقدم لا يحجز صفّاً حجزه غيرُه — **فالحجزُ الملتزَم قبل الإرسال لا يفتح إرسالاً مزدوجاً**.
 */
describe('الإرسالُ من الطابور خارج معاملة القاعدة — حجزٌ ثم إرسالٌ ثم نتيجة (ق-١٤٦٤)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let outbox: OutboxService;
  let tenant: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const enqueue = (type: string) =>
    tenant.runInTenantContext(company.companyId, (tx) => tx.outboxEvent.create({ data: { companyId: company.companyId, type, payload: {} }, select: { id: true } }));
  const rowOf = (id: string) =>
    tenant.runInTenantContext(company.companyId, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id }, select: { status: true, attempts: true, lastError: true } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'outbox-tx');
    outbox = app.get(OutboxService);
    tenant = app.get(TenantPrismaService);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 ① الحجزُ ملتزَمٌ قبل الإرسال — معاملةٌ أخرى تراه لحظةَ النداء', async () => {
    const type = `TEST_CLAIM_VISIBLE_${suffix}`;
    let seenAttempts: number | null = null;
    outbox.register(type, async (row) => {
      seenAttempts = (await rowOf(row.id)).attempts;
    });
    const { id } = await enqueue(type);
    await outbox.dispatchForCompany(company.companyId);
    expect({ seenAttempts, final: (await rowOf(id)).status }).toEqual({ seenAttempts: 1, final: 'SENT' });
  });

  it('🔴 ② إرسالٌ أبطأُ من مهلة المعاملة يُكتب له «أُرسل» — لا تسقط الدورةُ ولا يعود الصفُّ بلا أثر', async () => {
    const type = `TEST_SLOW_${suffix}`;
    outbox.register(type, async () => {
      await sleep(6000);
    });
    const { id } = await enqueue(type);
    let threw: string | null = null;
    await outbox.dispatchForCompany(company.companyId).catch((e: Error) => {
      threw = e.message.slice(0, 120);
    });
    const row = await rowOf(id);
    expect({ threw, status: row.status, attempts: row.attempts }).toEqual({ threw: null, status: 'SENT', attempts: 1 });
  });

  it('③ والإرسالُ الساقطُ يُكتب سببُه في المعاملة الثانية — ويبقى مستحقّاً بتراجعه', async () => {
    const type = `TEST_FAILING_${suffix}`;
    outbox.register(type, async () => {
      throw new Error(`سقوطٌ مقصود ${suffix}`);
    });
    const { id } = await enqueue(type);
    await outbox.dispatchForCompany(company.companyId);
    const row = await rowOf(id);
    expect({ status: row.status, attempts: row.attempts, reason: (row.lastError ?? '').includes(`سقوطٌ مقصود ${suffix}`) }).toEqual({ status: 'PENDING', attempts: 1, reason: true });
  });

  it('🔴 ④ وقارئٌ بنسخةٍ أقدم لا يحجز صفّاً حُجز بعد قراءته — فلا إرسالَ مزدوج', async () => {
    const type = `TEST_STALE_${suffix}`;
    let calls = 0;
    outbox.register(type, async () => {
      calls += 1;
      throw new Error('يبقى مستحقّاً');
    });
    const { id } = await enqueue(type);
    // نسخةٌ قُرئت قبل أن يحجزه غيرُه — المحاولاتُ فيها صفر.
    const stale = await tenant.runInTenantContext(company.companyId, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id }, select: { id: true, companyId: true, type: true, payload: true, attempts: true } }));
    await outbox.dispatchForCompany(company.companyId);
    expect(calls).toBe(1);
    // والصفُّ الآن مستحقٌّ بمحاولةٍ واحدة — فالحجزُ بالنسخة القديمة لا يلتقطه.
    const later = new Date(Date.now() + 2 * 3_600_000);
    // يُقرأ بالاسم وقتَ التشغيل لا بالنوع — فعلى شيفرةٍ بلا حجزٍ منفصل يسقط هذا بسببه المسمّى لا بخطأ ترجمةٍ يُسقط الحزمة كلَّها (`§8.8`).
    const claim = (outbox as unknown as { claimWithinTx?: (tx: unknown, rows: unknown[], now: Date) => Promise<unknown[]> }).claimWithinTx;
    expect(typeof claim).toBe('function');
    const reclaimed = await tenant.runInTenantContext(company.companyId, (tx) => claim!.call(outbox, tx, [stale], later));
    expect({ reclaimed: reclaimed.length, attempts: (await rowOf(id)).attempts }).toEqual({ reclaimed: 0, attempts: 1 });
  });
});
