import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { buildZatcaQr, decodeZatcaQr } from '../src/zatca/qr.util';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';

describe('ZATCA phase 1 — invoice QR (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let customerId: string;
  const createdInvoiceIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${token}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);
    customerId = customers.body.id;
  }, 30000);

  afterAll(async () => {
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), createdInvoiceIds);
    await app.close();
  });

  describe('TLV encoding', () => {
    it('encodes the five mandatory fields in ZATCA order', () => {
      const qr = buildZatcaQr({
        sellerName: 'Acme Trading',
        vatNumber: '300000000000003',
        // UTC بلاحقة Z — إحدى صيغتَي الهيئة؛ والطابع يساوي IssueDate T IssueTime حرفاً (ق-١٨٥).
        issued: { date: '2026-03-01', time: '10:00:00Z' },
        total: 115,
        vatAmount: 15,
      })!;

      const fields = decodeZatcaQr(qr);
      expect(fields[1]).toBe('Acme Trading');
      expect(fields[2]).toBe('300000000000003');
      expect(fields[3]).toBe('2026-03-01T10:00:00Z');
      expect(fields[4]).toBe('115.00');
      expect(fields[5]).toBe('15.00');
    });

    it('uses the UTF-8 byte length for an Arabic seller name, not the character count', () => {
      const sellerName = 'شركة الأفق';
      const qr = buildZatcaQr({
        sellerName,
        vatNumber: '300000000000003',
        issued: { date: '2026-03-01', time: '10:00:00Z' },
        total: 100,
        vatAmount: 0,
      })!;

      // Arabic is 2 bytes per character in UTF-8: a length byte holding the
      // character count would make every downstream field misaligned, so the
      // decode below is what actually proves the encoding is right.
      const raw = Buffer.from(qr, 'base64');
      expect(raw[1]).toBe(Buffer.byteLength(sellerName, 'utf8'));
      expect(raw[1]).not.toBe(sellerName.length);
      expect(decodeZatcaQr(qr)[1]).toBe(sellerName);
    });

    it('formats amounts to two decimals', () => {
      const qr = buildZatcaQr({
        sellerName: 'X',
        vatNumber: '3',
        issued: { date: '2026-03-01', time: '10:00:00Z' },
        total: 1234.5,
        vatAmount: 161.02174,
      })!;
      const fields = decodeZatcaQr(qr);
      expect(fields[4]).toBe('1234.50');
      expect(fields[5]).toBe('161.02');
    });

    it('returns null when the seller name or VAT number is missing', () => {
      const base = { issued: { date: '2026-03-01', time: '10:00:00Z' }, total: 100, vatAmount: 15 };
      expect(buildZatcaQr({ ...base, sellerName: '', vatNumber: '300000000000003' })).toBeNull();
      expect(buildZatcaQr({ ...base, sellerName: 'Acme', vatNumber: '   ' })).toBeNull();
    });
  });

  describe('on the invoice endpoint', () => {
    it('returns a QR whose totals match the invoice', async () => {
      // The QR is derived from the *current* company profile, so make sure the
      // two fields ZATCA needs are set before asserting on it.
      await request(app.getHttpServer())
        .patch('/company-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ legalName: 'شركة الأفق التجارية المحدودة', vatNumber: '300000000000003' })
        .expect(200);

      const created = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          issueDate: '2026-05-01',
          dueDate: '2026-05-31',
          lines: [{ description: 'بند ضريبي', quantity: 1, unitPrice: 100, taxRate: 15 }],
        })
        .expect(201);
      createdInvoiceIds.push(created.body.id);

      const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
      const row = list.body.find((i: { id: string }) => i.id === created.body.id);

      expect(row.zatcaQr).toBeTruthy();
      const fields = decodeZatcaQr(row.zatcaQr);
      expect(fields[1]).toBe('شركة الأفق التجارية المحدودة');
      expect(fields[2]).toBe('300000000000003');
      expect(fields[4]).toBe('115.00');
      expect(fields[5]).toBe('15.00');
    });

    it('reports the clearance state on every invoice, so the screen can show it without a second call', async () => {
      const created = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          issueDate: '2026-05-01',
          dueDate: '2026-05-31',
          lines: [{ description: 'بند', quantity: 1, unitPrice: 50, taxRate: 15 }],
        })
        .expect(201);
      createdInvoiceIds.push(created.body.id);

      const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
      const row = list.body.find((i: { id: string }) => i.id === created.body.id);

      // A brand-new invoice has been through nothing: no status other than
      // NOT_SUBMITTED is meaningful, and no chain values exist yet.
      expect(row.zatcaStatus).toBe('NOT_SUBMITTED');
      expect(row.zatcaIcv).toBeNull();
      expect(row.zatcaMessage).toBeNull();
      expect(row.zatcaSubmittedAt).toBeNull();
    });

    it('omits the QR entirely while the company has no VAT number, rather than emitting an invalid one', async () => {
      await request(app.getHttpServer())
        .patch('/company-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ legalName: 'شركة الأفق التجارية المحدودة', vatNumber: '' })
        .expect(200);

      type Row = { zatcaQr: string | null; zatcaQrPayload: string | null };
      // مستندٌ مختوم (ق-١٨٧) يحمل رمزَه التساعي المحفوظ لحظةَ الختم — واقعةٌ نظاميةٌ لا
      // يمحوها تعديلُ الملف بعدها؛ فالاشتقاقُ من الملف الحالي يخصّ غيرَ المختوم وحده.
      const unstamped = (rows: Row[]) => rows.filter((i) => !i.zatcaQrPayload);
      const stamped = (rows: Row[]) => rows.filter((i) => i.zatcaQrPayload);

      const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
      expect(unstamped(list.body).every((i) => i.zatcaQr === null)).toBe(true);
      expect(stamped(list.body).every((i) => i.zatcaQr === i.zatcaQrPayload)).toBe(true);

      // Restore, and confirm the QR comes back for invoices that already
      // existed — proof the QR follows the profile rather than being frozen
      // at issue time (for the unstamped; the stamped were never frozen by
      // the profile in the first place).
      await request(app.getHttpServer())
        .patch('/company-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ legalName: 'شركة الأفق التجارية المحدودة', vatNumber: '300000000000003' })
        .expect(200);

      const after = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
      expect(after.body.every((i: Row) => i.zatcaQr !== null)).toBe(true);
    });
  });
});
