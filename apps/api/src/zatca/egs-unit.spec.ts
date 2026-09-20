import { readFileSync } from 'fs';
import { join } from 'path';
import { defaultUnitSerial, SOLUTION_NAME } from './egs-unit.util';

/**
 * `ق-١٦٩` — **تسلسليُّ الوحدة الافتراضية هو تسلسليُّ طلب الشهادة، من مصدرٍ واحد.**
 *
 * الخطر الذي يحرسه: صيغةٌ تُكتب في موضعين **تفترق بصمت** — فتحمل الشهادة `SN`
 * لا يطابق ما في الجدول، **والهيئة تقارن بينهما**. فالحارس يقرأ **مصدر** خدمة
 * الربط ويسقط إن عادت تكتب الصيغة بيدها.
 */
describe('وحدة الإصدار الافتراضية — مصدرٌ واحد للتسلسلي', () => {
  it('الصيغة `1-{الحل}|2-web|3-{المنشأة}` كما يقرؤها طلب الشهادة', () => {
    expect(defaultUnitSerial('c-123')).toBe(`1-${SOLUTION_NAME}|2-web|3-c-123`);
    expect(SOLUTION_NAME).toBe('mad-app');
  });

  it('🔴 وخدمة الربط لا تكتب الصيغة بيدها — تقرأها من المصدر', () => {
    const source = readFileSync(join(__dirname, 'zatca-onboarding.service.ts'), 'utf8');
    expect(source.length).toBeGreaterThan(1000); // قراءةٌ فاشلة تُسقط ولا تمرّ
    expect(source).toContain('defaultUnitSerial(companyId)');
    // الصيغة القديمة المكتوبة بيد — لو عادت افترق التسلسليّان.
    expect(source).not.toContain('|2-web|3-${companyId}');
    expect(source).not.toMatch(/const SOLUTION_NAME\s*=/);
  });

  it('🔴 وهجرة التعبئة تحمل الصيغة نفسها حرفياً — وإلا انفصل القائم عن الجديد', () => {
    const migration = readFileSync(join(__dirname, '..', '..', 'prisma', 'migrations', '20260905030000_egs_units', 'migration.sql'), 'utf8');
    expect(migration.length).toBeGreaterThan(500);
    // الهجرة SQL لا تستورد ثابتاً — فتُقارَن بنصّها: البادئة التي تركّب التسلسلي.
    expect(migration).toContain(`'1-${SOLUTION_NAME}|2-web|3-' || c."companyId"`);
  });
});

/**
 * `ق-١٧٧` — **العدّاد والسلسلة داخل الوحدة، والحارس يقرأ المخطَّط** (الدفعة ب).
 *
 * نصّ الهيئة: «تسلسلٌ واحد لكل `EGS` ربطها». والخطر: مفتاحٌ يعود إلى المنشأة
 * بعد سنة — فهرسٌ «ينظّف» أو عدٌّ يحذف شرط الوحدة — **فيمرّ كل اختبارٍ قائم**
 * لأن المنشأة ذات الوحدة الواحدة لا تُظهر الفرق. فالحارس يقرأ **المصدر لا
 * المخرَج** (`ق-١٤٨`): المخطَّط، وأداة السلسلة، والخدمة، والهجرة.
 */
describe('الدفعة (ب) — العدّاد والسلسلة داخل الوحدة', () => {
  const api = join(__dirname, '..', '..');
  /** سطور المخطَّط الفعّالة — بلا تعليقات `///`، كي لا يُقرأ تاريخٌ حكماً. */
  const schemaDirectives = () =>
    readFileSync(join(api, 'prisma', 'schema.prisma'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  it('🔴 المخطَّط: المفتاح على الوحدة لا المنشأة — ويسقط إن عاد `[companyId, zatcaIcv]`', () => {
    const schema = schemaDirectives();
    expect(schema.length).toBeGreaterThan(10_000);
    expect(schema).toContain('@@unique([egsUnitId, zatcaIcv])');
    expect(schema).not.toContain('@@unique([companyId, zatcaIcv])');
  });

  it('🔴 أداة السلسلة: `nextIcv` و`previousChainHash` تشترطان الوحدة في التوقيع وفي الشرط', () => {
    const util = readFileSync(join(__dirname, 'hash-chain.util.ts'), 'utf8');
    expect(util.length).toBeGreaterThan(1000);
    expect(util).toMatch(/export async function nextIcv\(tx: Prisma\.TransactionClient, egsUnitId: string\)/);
    expect(util).toMatch(/export async function previousChainHash\(tx: Prisma\.TransactionClient, egsUnitId: string, icv: number\)/);
    // الشرط نفسه يحمل الوحدة — توقيعٌ يقبلها ولا يستعملها عدٌّ على المنشأة بقناع.
    // و`MAX+1` لا `count()+1`: عدٌّ يعود إلى العدّ يصطدم حتمياً بعد أول فجوة.
    expect(util).toMatch(/aggregate\(\{ where: \{ egsUnitId, zatcaIcv: \{ not: null \} \}, _max: \{ zatcaIcv: true \} \}\)/);
    expect(util).not.toMatch(/tx\.invoice\.count\(/);
    // السلفُ موقعٌ بعينه (`icv - 1`) على الوحدة — لا «آخرُ مقبول» (ق-١١٩٨/⑦).
    expect(util).toMatch(/findFirst\(\{ where: \{ egsUnitId, zatcaIcv: icv - 1 \}/);
    expect(util).not.toMatch(/zatcaStatus: 'CLEARED'/);
  });

  it('🔴 الخدمة: تعدّ داخل الوحدة التي تختمها — لا استدعاءَ بلا وحدة', () => {
    const service = readFileSync(join(__dirname, 'zatca.service.ts'), 'utf8');
    expect(service.length).toBeGreaterThan(5000);
    expect(service).toContain('previousChainHash(tx, unit.id, icv)');
    expect(service).toContain('nextIcv(tx, unit.id)');
    expect(service).not.toMatch(/nextIcv\(tx\)/);
    expect(service).not.toMatch(/previousChainHash\(tx\)/);
  });

  it('🔴 الهجرة: تُبدّل المفتاح، وتمنع موقعاً بلا وحدة بالشكل، وتفحص القائم بعينٍ مفتوحة', () => {
    const migration = readFileSync(join(api, 'prisma', 'migrations', '20260905120000_icv_per_unit', 'migration.sql'), 'utf8');
    expect(migration.length).toBeGreaterThan(500);
    expect(migration).toContain('DROP INDEX "invoices_companyId_zatcaIcv_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "invoices_egsUnitId_zatcaIcv_key"');
    expect(migration).toMatch(/CHECK \("zatcaIcv" IS NULL OR "egsUnitId" IS NOT NULL\)/);
    // الفحص المسبق تحت FORCE RLS يرى صفراً بصمت — فيُرفع قبله ويُعاد بعده (`ق-١٤٩`).
    const noForce = migration.indexOf('ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY');
    const preflight = migration.indexOf('RAISE EXCEPTION');
    const reForce = migration.lastIndexOf('ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY');
    expect(noForce).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(noForce);
    expect(reForce).toBeGreaterThan(preflight);
  });
});
