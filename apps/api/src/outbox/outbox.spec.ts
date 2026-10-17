import { isUnansweredDelivery, MAX_ATTEMPTS, nextDelayMs, OutboxService } from './outbox.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantPrismaService } from '../common/tenant/tenant-prisma.service';

type Row = { id: string; companyId: string; type: string; payload: unknown; attempts: number; status: string; availableAt: Date; sentAt: Date | null; lastError: string | null };

/**
 * السياق يُحاكى بتمرير العميل نفسه — فالمُختبَر هنا منطق المطالبة والتراجع، لا
 * RLS. **وRLS يحرسها مجسٌّ حيّ منفصل**، ومحاكاتها هنا كانت ستُثبت المحاكاة.
 */
function fakeTenant(client: unknown) {
  return { runInTenantContext: <T>(_c: string, fn: (tx: never) => Promise<T>) => fn(client as never) } as unknown as TenantPrismaService;
}

/**
 * قاعدةٌ مصغَّرة تحاكي ما يهمّ: **المطالبة المشروطة** (`updateMany` على
 * `status: PENDING`) هي ما يمنع إرسالاً مزدوجاً — فلا بدّ أن تُحاكى **بشرطها**
 * لا بتجاهله، وإلا أثبت الاختبار شيئاً غير الذي يحرسه.
 */
function fakeClient(rows: Row[]) {
  return {
    outboxEvent: {
      findMany: async ({ where, take }: { where: { status: string; availableAt: { lte: Date } }; take: number }) =>
        rows.filter((r) => r.status === where.status && r.availableAt <= where.availableAt.lte).slice(0, take),
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { attempts: { increment: number }; availableAt: Date } }) => {
        const row = rows.find((r) => r.id === where.id && r.status === where.status);
        if (!row) return { count: 0 };
        row.attempts += data.attempts.increment;
        row.availableAt = data.availableAt;
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(rows.find((r) => r.id === where.id)!, data);
        return {};
      },
    },
  };
}

/** يبني الخدمة على عميلٍ مزيَّف واحد، ويعيد دورةَ منشأةٍ واحدة. */
function serviceOn(rows: Row[]): OutboxService {
  const client = fakeClient(rows);
  return new OutboxService({} as unknown as PrismaService, fakeTenant(client));
}

const row = (over: Partial<Row> = {}): Row => ({
  id: 'r1',
  companyId: 'c1',
  type: 'invoice.issued',
  payload: { invoiceId: 'i1' },
  attempts: 0,
  status: 'PENDING',
  availableAt: new Date('2026-09-04T00:00:00Z'),
  sentAt: null,
  lastError: null,
  ...over,
});

const NOW = new Date('2026-09-04T01:00:00Z');

describe('طابور الإرسال (Outbox)', () => {
  it('يُرسل المستحقّ ويختمه — فلا يُعاد', async () => {
    const rows = [row()];
    const svc = serviceOn(rows);
    const seen: string[] = [];
    svc.register('invoice.issued', async (e) => void seen.push(e.id));

    expect(await svc.dispatchForCompany("c1", 20, NOW)).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(seen).toEqual(['r1']);
    expect(rows[0].status).toBe('SENT');
    expect(rows[0].sentAt).not.toBeNull();
  });

  it('🔴 وفشلُ الإرسال لا يُضيع الصفّ — يبقى مستحقّاً بسببه مكتوباً', async () => {
    const rows = [row()];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {
      throw new Error('الهيئة لا تستجيب');
    });

    expect(await svc.dispatchForCompany("c1", 20, NOW)).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].lastError).toBe('الهيئة لا تستجيب');
    expect(rows[0].attempts).toBe(1);
    // وتأجّل: لا يُعاد التقاطه في الدورة التالية مباشرةً.
    expect(rows[0].availableAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('واستنفاد المحاولات يُعلَن فشلاً — يبقى ليُرى ولا يُحذف', async () => {
    const rows = [row({ attempts: MAX_ATTEMPTS - 1 })];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {
      throw new Error('رُفض نهائياً');
    });

    expect((await svc.dispatchForCompany("c1", 20, NOW)).failed).toBe(1);
    expect(rows[0].status).toBe('FAILED');
    expect(rows[0].lastError).toBe('رُفض نهائياً');
  });

  it('ونوعٌ بلا مرسِل يُعلَن فاشلاً صراحةً — لا يدور إلى الأبد', async () => {
    const rows = [row({ type: 'نوعٌ لا أحد يرسله' })];
    const svc = serviceOn(rows);

    expect((await svc.dispatchForCompany("c1", 20, NOW)).failed).toBe(1);
    expect(rows[0].status).toBe('FAILED');
    expect(rows[0].lastError).toContain('لا مرسِل مسجَّل');
  });

  it('🔴 والمطالبة المشروطة تمنع إرسالاً مزدوجاً — صفٌّ ليس PENDING لا يُلتقط', async () => {
    const rows = [row({ status: 'SENT' })];
    const svc = serviceOn(rows);
    const seen: string[] = [];
    svc.register('invoice.issued', async (e) => void seen.push(e.id));

    expect(await svc.dispatchForCompany("c1", 20, NOW)).toEqual({ claimed: 0, sent: 0, retried: 0, failed: 0 });
    expect(seen).toEqual([]);
  });

  it('وما لم يحلّ وقته لا يُلتقط', async () => {
    const rows = [row({ availableAt: new Date('2026-09-04T02:00:00Z') })];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {});
    expect((await svc.dispatchForCompany("c1", 20, NOW)).claimed).toBe(0);
  });

  it('والتراجع أُسّيّ بحدٍّ أعلى ساعة — فلا ينفجر ولا يتوقف', () => {
    expect(nextDelayMs(1)).toBe(60_000);
    expect(nextDelayMs(2)).toBe(120_000);
    expect(nextDelayMs(3)).toBe(240_000);
    expect(nextDelayMs(20)).toBe(3_600_000);
    expect(nextDelayMs(0)).toBe(60_000);
  });

  it('the backoff stays a finite hour however many attempts a row has made', () => {
    for (const attempts of [7, 100, 1025, 100_000]) expect(nextDelayMs(attempts)).toBe(3_600_000);
  });

  it('an unanswered delivery past the attempt limit stays pending and is due again within the hour', async () => {
    const rows = [row({ attempts: MAX_ATTEMPTS + 10 })];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {
      throw Object.assign(new Error('fetch failed'), { unanswered: true });
    });

    expect(await svc.dispatchForCompany('c1', 20, NOW)).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS + 11);
    expect(rows[0].lastError).toBe('fetch failed');
    expect(rows[0].availableAt.getTime()).toBe(NOW.getTime() + 3_600_000);
  });

  it('an unanswered delivery is retried through the whole 24 hour reporting window, never more than an hour apart', async () => {
    const rows = [row({ availableAt: NOW })];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {
      throw Object.assign(new Error('fetch failed'), { unanswered: true });
    });

    const tried: number[] = [];
    let now = NOW;
    while (now.getTime() - NOW.getTime() <= 24 * 3_600_000) {
      expect((await svc.dispatchForCompany('c1', 20, now)).retried).toBe(1);
      tried.push(now.getTime());
      expect(rows[0].status).toBe('PENDING');
      now = rows[0].availableAt;
    }
    const gaps = tried.slice(1).map((t, i) => (t - tried[i]) / 60_000);
    // 1, 2, 4, 8, 16 and 32 minutes, then the hourly cap until the window is over.
    expect(gaps.slice(0, 7)).toEqual([1, 2, 4, 8, 16, 32, 60]);
    expect(Math.max(...gaps)).toBe(60);
    expect(tried.length).toBeGreaterThan(MAX_ATTEMPTS * 4);
  });

  it('a failure that is not marked unanswered still ends FAILED at the attempt limit', async () => {
    const rows = [row({ attempts: MAX_ATTEMPTS - 1 })];
    const svc = serviceOn(rows);
    svc.register('invoice.issued', async () => {
      throw Object.assign(new Error('signing failed'), { unanswered: false });
    });

    expect((await svc.dispatchForCompany('c1', 20, NOW)).failed).toBe(1);
    expect(rows[0].status).toBe('FAILED');
  });

  it('only an object that says it is unanswered is treated as one', () => {
    expect(isUnansweredDelivery(Object.assign(new Error('x'), { unanswered: true }))).toBe(true);
    expect(isUnansweredDelivery(new Error('x'))).toBe(false);
    expect(isUnansweredDelivery({ unanswered: 'yes' })).toBe(false);
    expect(isUnansweredDelivery(null)).toBe(false);
    expect(isUnansweredDelivery('fetch failed')).toBe(false);
  });
});
