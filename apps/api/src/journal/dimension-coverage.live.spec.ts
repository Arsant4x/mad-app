import { PrismaClient } from '@mad-app/db';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { writePastDbGuard } from '../../test/write-past-db-guard';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * حارس الأبعاد التحليلية — **يقرأ القاعدة لا الشيفرة**.
 *
 * ## لماذا القاعدة لا الشيفرة
 *
 * حارسٌ يفحص أن `auto-posting.util.ts` يمرّر `unitId` يفحص **نيّة** الشيفرة.
 * وهذا يمرّ حتى لو ضاع البُعد بعد التمرير — في `resolveDimensions` أو في ختم
 * الأسطر أو في ترحيلٍ ناقص. فالحارس هنا يسأل السؤال الوحيد الذي يهمّ:
 * **هل وصل البُعد إلى الصفّ؟**
 *
 * ## وما يفحصه مشتقٌّ لا مكتوب
 *
 * لا قائمة أسماء دوالٍ هنا. يُسأل الدفتر: **كل قيدٍ يصله مستندٌ يحمل عقداً**
 * (والعقد وحدتُه إلزامية في المخطَّط) **يجب أن تحمل أسطرُه وحدةً**. والمسارات
 * تُقرأ من مفاتيح القاعدة نفسها، فمسارٌ سادسٌ يُضاف غداً يدخل الفحص بلا تعديل
 * هنا — ومسارٌ يُنسى يظهر.
 *
 * ⚠️ **وميله معلَن: يميل إلى الإنذار الكاذب لا الصمت الكاذب.** إن كانت القاعدة
 * تحمل قيوداً قديمة سابقة لهذه الموجة فستظهر بلا بُعد — وهو إنذارٌ يُكتشف في
 * أول تشغيل. والعكس (بُعدٌ ضاع فيمرّ صامتاً) هو ما لا يقع: الفحص يعدّ الأسطر
 * الفارغة صراحةً ولا يُرشِّحها.
 *
 * ولذلك يستثني ما هو **سابقٌ للموجة** بحدٍّ زمنيّ صريح لا بحذفٍ صامت — ويُعلن
 * كم استثنى.
 */

/**
 * ⚠️ **بلا ذاكرة عباراتٍ محضَّرة في العميل** — مقيسٌ 2026-09-12 على قاعدة التطوير (`537` منشأة):
 *
 * الاستعلامُ الموحَّد نفسُه، على الاتصال نفسِه، **بعد ستّ تنفيذاتٍ لمنشآتٍ فارغة** يأخذ
 * للمنشأة الكبيرة **`13–21 s`** (فتسقط المعاملةُ بمهلتها `5 s`) — بينما يأخذ **`35 ms`**
 * منفرداً، و**`16 ms`** في `psql` بعبارةٍ محضَّرة بالتسلسل نفسِه. و`SET LOCAL
 * plan_cache_mode = force_custom_plan` **لا يغيّر شيئاً** (`13 s`)؛ وتعطيلُ ذاكرة العبارات
 * في عميل Prisma (`statement_cache_size=0`) **يعيده إلى `35 ms`**. فالعلّةُ في ذاكرة
 * العميل لا في مخطّط القاعدة — وحدُّها معلَن: لا يُرى في `CI` (منشآتٌ قليلة).
 */
const withoutStatementCache = (url: string | undefined): string | undefined =>
  url ? `${url}${url.includes('?') ? '&' : '?'}statement_cache_size=0` : url;
const prisma = new PrismaClient({ datasources: { db: { url: withoutStatementCache(process.env.DATABASE_URL) } } });

/** بداية سريان الموجة: الترحيل الذي أضاف الأعمدة. ما قبله لا بُعد له بحكم
 * الزمن لا بحكم عطل — ويُعلَن عدده بدل أن يُطرح صمتاً. */
const WAVE_MIGRATION = '20260830230000_l0_journal_line_dimensions';

describe('حارس الأبعاد التحليلية (حيّ)', () => {
  let waveAppliedAt: Date | null = null;

  beforeAll(async () => {
    const row = await prisma.$queryRaw<{ finished_at: Date | null }[]>`
      SELECT finished_at FROM _prisma_migrations WHERE migration_name = ${WAVE_MIGRATION} LIMIT 1
    `;
    waveAppliedAt = row[0]?.finished_at ?? null;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('الترحيل مطبَّق — وإلا فالحارس يقيس قاعدةً لا تحمل الأعمدة', () => {
    expect(waveAppliedAt).not.toBeNull();
  });

  it('⭐ كل سطر قيدٍ من مستندٍ يحمل عقداً يحمل وحدةً — ولا واحد فارغ', async () => {
    // المسارات مشتقّة من مفاتيح القاعدة: أي جدولٍ يشير إلى قيدٍ **وإلى عقد**
    // يدخل هنا تلقائياً. ولا اسم دالةِ ترحيلٍ مكتوبٌ في هذا الاستعلام.
    //
    // ⚠️ **من `pg_catalog` لا من `information_schema`** (2026-09-19 · مع `٣٠`): الصيغةُ القديمة على
    // `information_schema.constraint_column_usage` أخذت على السير `158 s` ثم `115 s` (سقفُ الاختبار `120 s`)
    // بعد إضافة جدولين بسبعة مفاتيح — مقابل `10 s` قبلها — ومحلّياً `700 ms`؛ والمكافئُ على `pg_constraint`
    // يعيد الصفوفَ نفسَها (`8` هنا · `37` في مصادر الطرف، مقارنةً صفّاً صفّاً) في `4 ms`. فالكتالوجُ يُقرأ من
    // مصدره لا من واجهةٍ تُعيد بناءه لكلِّ صفّ.
    // ⚠️ **المفردُ وحدَه** (`ق-١٢٥٢`): المركّبُ `(companyId, col)` بجانب المفرد يعيد الطريقَ نفسَه مرّتين
    // ويقدّم `companyId` عموداً «يشير إلى القيد» — فيُقرأ عمودُ الاستدلال من مفتاحٍ بعمودٍ واحد.
    const rows = await prisma.$queryRaw<{ table_name: string; entry_col: string }[]>`
      SELECT DISTINCT c.conrelid::regclass::text AS table_name, a.attname AS entry_col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND array_length(c.conkey, 1) = 1
        AND c.confrelid = 'journal_entries'::regclass
        AND EXISTS (
          SELECT 1 FROM pg_constraint c2
          WHERE c2.contype = 'f' AND c2.conrelid = c.conrelid AND c2.confrelid = 'contracts'::regclass
        )
    `;

    // مسبارٌ يُفحص: لو عاد فارغاً لصار الحارس أخضر بلا أن يفحص شيئاً.
    expect(rows.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    let checked = 0;
    let skippedPreWave = 0;
    let seenAnyLine = 0;

    /**
     * ⚠️ **السياق المستأجَر شرط رؤية، لا تحسين.**
     *
     * أول كتابةٍ لهذا الحارس أعطت «فُحص 0 سطراً» **وهي خضراء** — لأن الاتصال
     * بـ`app_user` تحت عزل الصفوف بلا `app.company_id` **لا يرى صفاً واحداً**.
     * فالحارس شهد بالسلامة وهو لم يقرأ شيئاً: صمتٌ كاذب في أنقى صوره.
     *
     * و`companies` بلا عزل (جدول هوية المستأجر)، فتُقرأ مباشرةً ثم يُفتح لكل
     * شركةٍ سياقُها.
     */
    const companies = await prisma.company.findMany({ select: { id: true } });
    expect(companies.length).toBeGreaterThan(0);

    // معاملةٌ واحدة لكل شركة تحمل المسارات كلها في استعلامٍ موحَّد — لا معاملة
    // لكل (شركة × مسار). الأولى كانت تتجاوز المهلة على قاعدةٍ بحجم التطوير.
    const union = rows
      .map(
        ({ table_name, entry_col }) =>
          `SELECT l.id, e.no, l."unitId" AS unit_id, e."createdAt" AS created_at,
                  '${table_name}.${entry_col}' AS path
             FROM "${table_name}" d
             JOIN journal_entries e ON e.id = d."${entry_col}"
             JOIN journal_lines   l ON l."journalEntryId" = e.id`,
      )
      .join(' UNION ALL ');

    let contextProven = 0;

    for (const { id: companyId } of companies) {
      const found = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        /**
         * ⭐ **إثبات أن السياق وقع — لا الاكتفاء بأننا طلبناه.**
         *
         * العطل الذي سبق لم يكن في الاستعلام بل في أن السياق لم يُضبط، فرأى
         * الحارس صفراً وشهد بالسلامة. وفحصُ عدد الصفوف **لا يميّز** ذلك عن
         * قاعدةٍ فارغة حقاً — كلاهما صفر. فيُفحص **المِيكانيزم** لا أثرُه:
         * يُقرأ الإعداد بعد ضبطه.
         */
        const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`
          SELECT current_setting('app.company_id', true) AS ctx
        `;
        if (ctx === companyId) contextProven += 1;
        return tx.$queryRawUnsafe<
          { id: string; no: string; unit_id: string | null; created_at: Date; path: string }[]
        >(union);
      });

      for (const line of found) {
        seenAnyLine += 1;
        if (waveAppliedAt && line.created_at < waveAppliedAt) {
          skippedPreWave += 1;
          continue;
        }
        checked += 1;
        if (line.unit_id === null) offenders.push(`${line.path} → قيد ${line.no} سطر ${line.id}`);
      }
    }

    /**
     * ⭐ **الشرط الذي يمنع النجاح الأجوف — وقد أُصلح بعد أن أسقط CI.**
     *
     * كان مكتوباً `expect(seenAnyLine).toBeGreaterThan(0)` مطلقاً، فأسقط
     * السير على قاعدةٍ **لا تحمل بيانات عقارية أصلاً**. والعلّة أنه خلط
     * حالتين تتشابه ظاهرتُهما ويفترق حكمُهما:
     *
     *   ① **لم أرَ شيئاً لأنه لا شيء** — قاعدةٌ نظيفة بلا مستند عقد. صدقٌ لا
     *      عطل، والسقوط عليه إنذارٌ كاذب يُدرَّب الناس على تجاهله.
     *   ② **لم أرَ شيئاً رغم وجوده** — وهو العطل الحقيقي: عمى عزل الصفوف
     *      الذي أنتج «فُحص 0 سطراً» خضراءَ في أول كتابةٍ لهذا الملف.
     *
     * فالتمييز بينهما يُقاس لا يُفترض: **يُعدّ المصدر أولاً**. فإن كان
     * موجباً ولم يُرَ سطر، فالعمى قائمٌ ويجب السقوط. وإن كان صفراً، فالصفر
     * هو الجواب الصحيح — **ويُعلَن**.
     */
    // ⭐ والسياق يُثبَت لكل شركة — فصفرُ الأسطر بعده صفرٌ حقيقيّ لا عمى.
    expect(contextProven).toBe(companies.length);

    if (seenAnyLine === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[أبعاد] لا قيدَ من مستند عقد في هذه القاعدة — لا شيء يُفحص. ` +
          `والسياق مُثبَتٌ على ${contextProven}/${companies.length} شركة، فالصفر صدقٌ لا عمى. مُعلَنٌ لا مُخفى.`,
      );
    }

    // يُعلَن ما استُثني — لا يُطرح صمتاً. (القاعدة: حدٌّ يُعلَن لا يُخفى.)
    // eslint-disable-next-line no-console
    console.log(`[أبعاد] فُحص ${checked} سطراً · استُثني ${skippedPreWave} سابقاً للموجة · ${rows.length} مسار`);

    expect(offenders).toEqual([]);
    // مسحٌ حيّ على كل شركة — مهلةٌ تليق به، لا مهلة اختبار وحدة.
  }, 120_000);

  it('⭐ سطرٌ لا مصدر له يبقى فارغاً — لا يُلفَّق له انتماء', async () => {
    // القيود اليدوية (`auto = false` وبلا مستند) يجب أن تبقى بلا بُعد.
    // فالفراغ يقول «لا انتماء»، وأي قيمةٍ هنا كذبةٌ تلوّث كل تقرير بعدها.
    const invented = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l."journalEntryId"
       WHERE e.auto = false
         AND l."unitId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM contracts       c  WHERE c."settlementEntryId" = e.id)
         AND NOT EXISTS (SELECT 1 FROM rent_payments   rp WHERE rp."journalEntryId"   = e.id)
         AND NOT EXISTS (SELECT 1 FROM contract_deposits cd WHERE cd."journalEntryId" = e.id OR cd."settlementEntryId" = e.id)
         AND NOT EXISTS (SELECT 1 FROM contract_claims   cc WHERE cc."journalEntryId" = e.id OR cc."settlementEntryId" = e.id)
         AND NOT EXISTS (SELECT 1 FROM contract_key_money km WHERE km."journalEntryId" = e.id)
         AND NOT EXISTS (SELECT 1 FROM maintenance_requests mr WHERE mr."journalEntryId" = e.id)
    `;
    expect(Number(invented[0].n)).toBe(0);
  });

  /**
   * ── بُعدُ الطرف (`ق-٨٧٣`) — حارسٌ مشتقٌّ لا بقائمة ─────────────────────────
   *
   * المسارات من مفاتيح القاعدة: كلُّ جدولٍ يشير إلى قيدٍ **ويحمل عمودَ طرفٍ** (`customerId`
   * أو `supplierId`) يدخل مباشرةً؛ وكلُّ جدولٍ يشير إلى قيدٍ **وإلى عقد** يدخل عبر عميل العقد
   * إن سُجِّل. والقاعدة: **كلُّ سطرٍ من قيدٍ يشير إليه مستندٌ له طرفٌ يحمل ذلك الطرف** — لا
   * فارغاً ولا طرفاً آخر. وما لا مستندَ له بطرف (يدويّ · افتتاحيّ · عقدٌ بلا عميل) يبقى بلا طرف
   * **ويُعلَن عددُه** على `1200`/`2100` — لا يُطرح صمتاً.
   */
  describe('بُعدُ الطرف (ق-٨٧٣)', () => {
    const PARTY_MIGRATION = '20260916090000_journal_line_party';
    let partyAppliedAt: Date | null = null;

    interface PartySource {
      table: string;
      entryCol: string;
      /** عمودُ الطرف على المستند نفسه — أو `null` لمسارٍ يمرّ بالعقد. */
      partyCol: 'customerId' | 'supplierId' | null;
      /** عمودُ العقد على المستند — للمسار الذي يمرّ بالعقد. */
      contractCol: string | null;
    }

    /** المصادرُ مشتقّةٌ من الكتالوج: مفاتيحُ `journal_entries` مع أعمدة الطرف/العقد على الجدول نفسِه. */
    async function partySources(): Promise<PartySource[]> {
      // من `pg_catalog` لا `information_schema` — السببُ والقياسُ في مسارات الوحدة أعلاه (الصفوفُ نفسُها: `37`).
      // المفردُ وحدَه (`ق-١٢٥٢`) — كالقارئ أعلاه: المركّبُ يكرّر الطريقَ ويُدخل `companyId` عموداً.
      const fks = await prisma.$queryRaw<{ table_name: string; column_name: string; referenced: string }[]>`
        SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name, c.confrelid::regclass::text AS referenced
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND array_length(c.conkey, 1) = 1
          AND c.confrelid IN ('journal_entries'::regclass, 'contracts'::regclass, 'customers'::regclass, 'suppliers'::regclass)
          AND c.conrelid <> 'journal_lines'::regclass
      `;
      const byTable = new Map<string, { entryCols: string[]; contractCol: string | null; partyCol: PartySource['partyCol'] }>();
      for (const fk of fks) {
        const t = byTable.get(fk.table_name) ?? { entryCols: [], contractCol: null, partyCol: null };
        if (fk.referenced === 'journal_entries') t.entryCols.push(fk.column_name);
        if (fk.referenced === 'contracts' && fk.table_name !== 'contracts') t.contractCol = fk.column_name;
        if (fk.referenced === 'customers' && fk.column_name === 'customerId') t.partyCol = 'customerId';
        if (fk.referenced === 'suppliers' && fk.column_name === 'supplierId') t.partyCol = 'supplierId';
        byTable.set(fk.table_name, t);
      }
      const out: PartySource[] = [];
      for (const [table, t] of byTable) {
        if (!t.entryCols.length) continue;
        if (!t.partyCol && !t.contractCol) continue;
        for (const entryCol of t.entryCols) out.push({ table, entryCol, partyCol: t.partyCol, contractCol: t.partyCol ? null : t.contractCol });
      }
      return out;
    }

    /** الاستعلامُ الموحَّد: لكل سطرٍ الطرفُ المتوقَّع من مستنده والفعليُّ على السطر. */
    function unionSql(sources: PartySource[]): string {
      return sources
        .map((s) =>
          s.partyCol
            ? `SELECT l.id, e.no, e."createdAt" AS created_at, '${s.table}.${s.entryCol}' AS path,
                      d."${s.partyCol}"::text AS expected, l."${s.partyCol}"::text AS actual
                 FROM "${s.table}" d
                 JOIN journal_entries e ON e.id = d."${s.entryCol}"
                 JOIN journal_lines   l ON l."journalEntryId" = e.id`
            : `SELECT l.id, e.no, e."createdAt" AS created_at, '${s.table}.${s.entryCol}' AS path,
                      c."customerId"::text AS expected, l."customerId"::text AS actual
                 FROM "${s.table}" d
                 JOIN contracts c ON c.id = d."${s.contractCol}"
                 JOIN journal_entries e ON e.id = d."${s.entryCol}"
                 JOIN journal_lines   l ON l."journalEntryId" = e.id
                WHERE c."customerId" IS NOT NULL`,
        )
        .join(' UNION ALL ');
    }

    beforeAll(async () => {
      const row = await prisma.$queryRaw<{ finished_at: Date | null }[]>`
        SELECT finished_at FROM _prisma_migrations WHERE migration_name = ${PARTY_MIGRATION} LIMIT 1
      `;
      partyAppliedAt = row[0]?.finished_at ?? null;
    });

    it('هجرةُ الطرف مطبَّقة — وإلا فالحارس يقيس قاعدةً لا تحمل العمودين', () => {
      expect(partyAppliedAt).not.toBeNull();
    });

    it('المصادرُ مشتقّةٌ من الكتالوج وتشمل المستنداتِ الأربعة والعقود', async () => {
      const sources = await partySources();
      const paths = sources.map((s) => `${s.table}.${s.entryCol}`);
      // مسبارٌ يُفحص بحالاتٍ معلومة (§8.7 الوجه الحادي عشر): يجب أن يجد هذه، وألّا يجد ما لا طرفَ له.
      for (const must of ['invoices.journalEntryId', 'payments.journalEntryId', 'purchases.journalEntryId', 'supplier_payments.journalEntryId', 'contracts.settlementEntryId', 'rent_payments.journalEntryId']) {
        expect({ must, found: paths.includes(must) }).toEqual({ must, found: true });
      }
      expect(paths).not.toContain('inventory_write_offs.journalEntryId');
      expect(paths).not.toContain('maintenance_requests.journalEntryId');
    });

    it('⭐ كلُّ سطرٍ من قيدٍ يشير إليه مستندٌ له طرفٌ يحمل ذلك الطرف — وما لا طرفَ له يُعلَن عددُه', async () => {
      const sources = await partySources();
      const union = unionSql(sources);
      const companies = await prisma.company.findMany({ select: { id: true } });
      expect(companies.length).toBeGreaterThan(0);

      const offenders: string[] = [];
      let checked = 0;
      let skippedPreWave = 0;
      let contextProven = 0;
      let unattributed1200 = 0;
      let unattributed2100 = 0;

      for (const { id: companyId } of companies) {
        const { found, left } = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
          const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
          if (ctx === companyId) contextProven += 1;
          const found = await tx.$queryRawUnsafe<{ id: string; no: string; created_at: Date; path: string; expected: string | null; actual: string | null }[]>(union);
          const left = await tx.$queryRaw<{ code: string; n: bigint }[]>`
            SELECT a.code, count(*) AS n
              FROM journal_lines l JOIN accounts a ON a.id = l."accountId"
             WHERE (a.code = '1200' AND l."customerId" IS NULL) OR (a.code = '2100' AND l."supplierId" IS NULL)
             GROUP BY a.code`;
          return { found, left };
        });
        for (const row of left) {
          if (row.code === '1200') unattributed1200 += Number(row.n);
          if (row.code === '2100') unattributed2100 += Number(row.n);
        }
        for (const line of found) {
          if (partyAppliedAt && line.created_at < partyAppliedAt) {
            skippedPreWave += 1;
            continue;
          }
          checked += 1;
          if (line.expected !== null && line.actual !== line.expected) {
            offenders.push(`${line.path} → قيد ${line.no} سطر ${line.id}: متوقَّع ${line.expected} · فعليّ ${line.actual ?? 'فراغ'}`);
          }
        }
      }

      expect(contextProven).toBe(companies.length);
      // يُعلَن ما استُثني وما بقي بلا طرف — لا يُطرح صمتاً (ق-٨٧٣: «وما لا يُنسب يبقى بلا طرفٍ ويُعلَن عدده»).
      // eslint-disable-next-line no-console
      console.log(
        `[طرف] فُحص ${checked} سطراً · استُثني ${skippedPreWave} سابقاً لهجرة الطرف · ${sources.length} مسار · ` +
          `بلا طرفٍ (كلُّ الزمن): على 1200 ${unattributed1200} · على 2100 ${unattributed2100}`,
      );
      expect(offenders).toEqual([]);
      // مسحٌ حيّ على كل منشأة (معاملةٌ لكلٍّ): مقيسٌ ٩٣ ثانية على قاعدة التطوير (٦٧٣ منشأة) وحدَه،
      // ويتجاوز ١٢٠ تحت حِمل عاملَين — فالمهلةُ من القياس لا من الافتراض (§8.2.1: انتظارُ حالةٍ لا زمن).
    }, 240_000);

    it('⭐ الحارسُ يرى — مسبارٌ في معاملةٍ مُرجَعة: سطرٌ بلا طرفه يُمسَك، وبعد ختمه لا', async () => {
      // إثباتُ الآليّة لا الأثر (§8.5): صفوفٌ من صنعه لا من البذرة — مورّدٌ وقيدٌ وسطرٌ وسندُ صرفٍ يشير
      // إليه — والسطرُ بلا `supplierId` فيُمسَك؛ ثم يُختم فلا يُمسَك. وتُرجَع المعاملةُ كلُّها.
      // منشأةٌ لها حسابٌ واحد على الأقلّ — تُقرأ في سياقها (منشآتُ الاختبار قد تُولد بلا دليل).
      let company: { id: string } | null = null;
      let accountId: string | null = null;
      for (const c of await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })) {
        accountId = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${c.id}, true)`;
          return (await tx.account.findFirst({ where: { companyId: c.id }, select: { id: true } }))?.id ?? null;
        });
        if (accountId) {
          company = c;
          break;
        }
      }
      if (!company || !accountId) throw new Error('لا منشأةَ لها حساب — المسبارُ يحتاج حساباً واحداً');
      const account = { id: accountId };
      const sources = await partySources();
      const union = unionSql(sources);
      const stamp = `probe-${Date.now()}`;

      const seen = await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${company!.id}, true)`;
          const supplierId = `${stamp}-sup`;
          const entryId = `${stamp}-je`;
          const lineId = `${stamp}-jl`;
          await tx.$executeRaw`INSERT INTO suppliers (id, "companyId", name, "updatedAt") VALUES (${supplierId}, ${company!.id}, ${stamp}, now())`;
          await tx.$executeRaw`INSERT INTO journal_entries (id, "companyId", no, date, memo, "totalDebit", "totalCredit", "baseTotalDebit", "baseTotalCredit")
            VALUES (${entryId}, ${company!.id}, ${stamp}, now(), ${stamp}, 1, 1, 1, 1)`;
          await tx.$executeRaw`INSERT INTO journal_lines (id, "companyId", "journalEntryId", "accountId", debit, credit)
            VALUES (${lineId}, ${company!.id}, ${entryId}, ${account.id}, 1, 0)`;
          await tx.$executeRaw`INSERT INTO supplier_payments (id, "companyId", no, "supplierId", date, amount, method, "baseAmount", "journalEntryId")
            VALUES (${`${stamp}-pay`}, ${company!.id}, ${stamp}, ${supplierId}, now(), 1, 'CASH', 1, ${entryId})`;

          const rows = await tx.$queryRawUnsafe<{ id: string; expected: string | null; actual: string | null }[]>(union);
          const before = rows.filter((r) => r.id === lineId && r.expected !== null && r.actual !== r.expected).length;

          // A posted line is refused change in the database; the probe lifts that guard inside its rolled back transaction.
          await writePastDbGuard(tx, 'journal_lines', () => tx.$executeRaw`UPDATE journal_lines SET "supplierId" = ${supplierId} WHERE id = ${lineId}`);
          const after = (await tx.$queryRawUnsafe<{ id: string; expected: string | null; actual: string | null }[]>(union)).filter(
            (r) => r.id === lineId && r.expected !== null && r.actual !== r.expected,
          ).length;

          throw { rollback: true, before, after };
        })
        .catch((e: { rollback?: boolean; before?: number; after?: number }) => {
          if (!e?.rollback) throw e;
          return { before: e.before, after: e.after };
        });

      expect(seen).toEqual({ before: 1, after: 0 });
      // ولا أثرَ بعد الإرجاع — يُعدّ **في سياق المنشأة** (عدٌّ بلا سياقٍ صفرٌ أعمى، §8.5).
      const leftover = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company!.id}, true)`;
        return tx.supplier.count({ where: { name: stamp } });
      });
      expect(leftover).toBe(0);
    }, 60_000);
  });
});
