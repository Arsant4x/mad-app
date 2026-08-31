import { PrismaClient } from '@prisma/client';

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

const prisma = new PrismaClient();

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
    const rows = await prisma.$queryRaw<{ table_name: string; entry_col: string }[]>`
      SELECT DISTINCT fk_entry.table_name, fk_entry.column_name AS entry_col
      FROM information_schema.key_column_usage fk_entry
      JOIN information_schema.referential_constraints rc_e
        ON rc_e.constraint_name = fk_entry.constraint_name
      JOIN information_schema.constraint_column_usage ccu_e
        ON ccu_e.constraint_name = rc_e.unique_constraint_name
      WHERE ccu_e.table_name = 'journal_entries'
        AND fk_entry.table_name IN (
          SELECT fk_c.table_name
          FROM information_schema.key_column_usage fk_c
          JOIN information_schema.referential_constraints rc_c
            ON rc_c.constraint_name = fk_c.constraint_name
          JOIN information_schema.constraint_column_usage ccu_c
            ON ccu_c.constraint_name = rc_c.unique_constraint_name
          WHERE ccu_c.table_name = 'contracts'
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

    for (const { id: companyId } of companies) {
      const found = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
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

    // ⭐ **الشرط الذي يمنع النجاح الأجوف**: حارسٌ لم يرَ سطراً واحداً لم يفحص
    // شيئاً — فيسقط بدل أن يشهد. (وهو ما كان يخفيه غيابُ السياق أعلاه.)
    expect(seenAnyLine).toBeGreaterThan(0);

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
});
