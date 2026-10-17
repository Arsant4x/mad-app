import { Prisma, PrismaClient } from '@mad-app/db';
import request from 'supertest';

/**
 * **سباقٌ مفروضٌ لا متروكٌ للتوقيت** (§8.8 الوجه الثالث): قافلٌ من اتصالٍ مستقلّ في سياق المنشأة يمسك `FOR UPDATE` صفّاً
 * يكتب فيه الطلبان **بعد** فحصهما، ويُطلَق الطلبُ الأوّل ثم الثاني بعده بقليل، **ولا يُطلَق القفلُ حتى يُرى الطلبان كلاهما
 * واقفَين خلفه** (`pg_blocking_pids` مباشرةً أو خلف واقف) لا بعد نومٍ مقدَّر.
 *
 * مستخرَجٌ من `once-only-cash-out.e2e-spec.ts` (توجيه ٢٧٤ الكتلة ٥أ) ومعمَّمٌ على الجدول: هناك صفُّ حسابٍ وحده، وهنا صفُّ
 * المستند نفسِه أو ما يكتبه الطلبُ بعد فحصه. والجداولُ مسمّاةٌ في نوعٍ مغلق، فلا يدخل الاستعلامَ اسمٌ لم يُكتب هنا.
 */
export type RaceTable = 'accounts' | 'payments' | 'inventory_write_offs' | 'pos_shifts' | 'network_settlements' | 'cash_deposits' | 'contracts' | 'units' | 'leave_requests' | 'customers';

/** One row, or several rows of the same table held by one transaction (each request then stops behind its own row). */
export type RaceRows = string | readonly string[];

const rowIds = (rows: RaceRows): string[] => (typeof rows === 'string' ? [rows] : [...rows]);

export type LockState = 'held' | 'free';

export interface Holder {
  ready: Promise<{ pid: number; locked: number }>;
  release: () => void;
  finished: Promise<void>;
}

export interface RaceResult {
  /** صفوفٌ قفلها القافل: صفرٌ يعني أن العزل أعماه لا أن القفل وقع. */
  locked: number;
  /** حالُ القفل لحظةَ إطلاق الطلب الأوّل، من اتصالٍ ثالث. */
  heldWhenFired: LockState | null;
  /** كم وقف خلف القافل: اثنان شرطُ صحّة القياس لا حكمُه. */
  blocked: number;
  responses: request.Response[];
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
/** مهلةُ معاملة القافل: أطولُ من كلّ انتظارٍ بعدها، فلا تنقضي وهي تمسك القفل. */
const HOLD_TX_MS = 60000;
/** أقصى انتظارٍ لأن يقف الطلبان خلف القفل، ثم يُطلَق على أيّ حال ويحكم التوكيدُ على ما رُئي فعلاً. */
const BLOCK_DEADLINE_MS = 20000;
const POLL_MS = 25;
/** الطلبُ الثاني يبدأ بعد الأوّل بهذا القدر: يرتّب مَن يصل الصفَّ أوّلاً، ولا يتوقّف عليه الحكم. */
const SECOND_STARTS_AFTER_MS = 150;

/** رفضُ NOWAIT بعينه: رمزُ Postgres `55P03` (`lock_not_available`) يحمله خطأُ Prisma في `meta.code` أو في نصّه. */
export function lockNotAvailable(e: unknown): boolean {
  const code = (e as { meta?: { code?: unknown } } | null)?.meta?.code;
  const message = e instanceof Error ? e.message : String(e);
  return String(code ?? '') === '55P03' || message.includes('55P03');
}

/**
 * أدواتُ السباق على منشأةٍ بعينها. `holdClient` و`probe` عميلان مستقلّان عن مجمّع التطبيق: الأوّلُ للقافل وحدَه فلا يأخذ
 * اتصالاً يحتاجه الطلبان، والثاني للمسابير فلا ينتظر العدُّ اتصالاً يحبسه القفل.
 */
export function raceHarness(companyId: () => string, holdClient: PrismaClient, probe: PrismaClient) {
  const table = (t: RaceTable) => Prisma.raw(`"${t}"`);

  /** قافلٌ في سياق المنشأة: يقفل الصفّ ويمسكه حتى يُطلَق، ويُعيد معرّفَ عمليته وعددَ ما قفل. */
  function holdRow(t: RaceTable, id: RaceRows): Holder {
    const ids = rowIds(id);
    let release: () => void = () => undefined;
    const released = new Promise<void>((done) => {
      release = () => done();
    });
    let taken: (v: { pid: number; locked: number }) => void = () => undefined;
    let failed: (e: unknown) => void = () => undefined;
    const ready = new Promise<{ pid: number; locked: number }>((ok, ko) => {
      taken = ok;
      failed = ko;
    });
    const finished = holdClient.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId()}, true)`;
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM ${table(t)} WHERE "id" IN (${Prisma.join(ids)}) FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        taken({ pid, locked: rows.length });
        await released;
      },
      { timeout: HOLD_TX_MS, maxWait: HOLD_TX_MS },
    );
    void finished.catch(failed);
    return { ready, release: () => release(), finished };
  }

  /** يُطلق القافلَ وينتظر انتهاءَ معاملته في كلّ حال: فلا يبقى قفلٌ معلّقٌ بعد الاختبار ولو سقط ما قبله. */
  async function releaseHolder(holder: Holder): Promise<void> {
    holder.release();
    await Promise.allSettled([holder.finished]);
  }

  /** كم عمليةً تقف خلف القافل، مباشرةً أو خلف واقفٍ خلفه (الثاني في الطابور يقف خلف الأوّل). */
  async function waitersBehind(holderPid: number): Promise<number> {
    const [{ n }] = await probe.$queryRaw<{ n: number }[]>`
      WITH RECURSIVE waiting(pid) AS (
        SELECT a.pid FROM pg_stat_activity a WHERE ${holderPid}::int = ANY(pg_blocking_pids(a.pid))
        UNION
        SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
      )
      SELECT count(*)::int AS n FROM waiting`;
    return n;
  }

  async function waitUntilBlocked(holderPid: number, expected: number): Promise<number> {
    const deadline = Date.now() + BLOCK_DEADLINE_MS;
    let blocked = await waitersBehind(holderPid);
    while (blocked < expected && Date.now() < deadline) {
      await sleep(POLL_MS);
      blocked = await waitersBehind(holderPid);
    }
    return blocked;
  }

  /**
   * حالُ قفل الصفّ من اتصالٍ ثالث: `FOR UPDATE NOWAIT` يُرفض بـ`55P03` ما دام مقفولاً. **والحرُّ لا يُعلَن إلا وقد رُئي الصفّ**:
   * صفٌّ يحجبه العزلُ يعود فارغاً بلا رفض، فلو قُرئ ذلك حرّيةً لشهد المسبارُ بالحرّية على أيّ قفل.
   */
  async function rowLockState(t: RaceTable, id: RaceRows): Promise<LockState> {
    const ids = rowIds(id);
    try {
      const rows = await probe.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId()}, true)`;
        return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM ${table(t)} WHERE "id" IN (${Prisma.join(ids)}) FOR UPDATE NOWAIT`;
      });
      if (rows.length !== ids.length) throw new Error(`NOWAIT probe saw ${rows.length} of ${ids.length} rows (${ids.join(', ')}) in ${t}`);
      return 'free';
    } catch (e) {
      if (lockNotAvailable(e)) return 'held';
      throw e;
    }
  }

  /**
   * يقفل الصفّ، ويتحقّق أن القفل قائمٌ لحظةَ الإطلاق، ويُطلق الطلبَ الأوّل ثم الثاني، وينتظر أن يقف الاثنان خلف القفل، ثم
   * يُطلقه ويُعيد ما رُئي. (`.then` يرسل الطلبَ فوراً: `supertest` لا يرسل حتى يُنتظَر.)
   */
  async function raceBehindLock(t: RaceTable, id: RaceRows, fire: () => request.Test): Promise<RaceResult> {
    const holder = holdRow(t, id);
    const inflight: Promise<request.Response>[] = [];
    let locked = 0;
    let heldWhenFired: LockState | null = null;
    let blocked = 0;
    try {
      const ready = await holder.ready;
      locked = ready.locked;
      heldWhenFired = await rowLockState(t, id);
      inflight.push(fire().then((r) => r));
      await sleep(SECOND_STARTS_AFTER_MS);
      inflight.push(fire().then((r) => r));
      blocked = await waitUntilBlocked(ready.pid, 2);
    } finally {
      await releaseHolder(holder);
    }
    await holder.finished;
    const responses = await Promise.all(inflight);
    return { locked, heldWhenFired, blocked, responses };
  }

  return { holdRow, releaseHolder, waitersBehind, rowLockState, raceBehindLock };
}
