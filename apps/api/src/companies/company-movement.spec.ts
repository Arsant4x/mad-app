import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@mad-app/db';
import { stripComments } from '../common/source-scan.util';
import { LEDGER_LINES, NUMBERED_DOCUMENTS, REAL_ESTATE_MODELS, RETENTION_YEARS, movementSources, refusedByDatabase, retentionDeadline } from './company-movement.service';

/**
 * حارسُ معيار الحركة (`ق-٥٤٦`) — **الأسماءُ تُقرأ من مصدرها لا من الذاكرة**:
 *
 * - ① يُشتقّ من `DMMF`: كلُّ نموذجٍ علاقتُه بالمنشأة `Restrict` يدخل المعيار — ولا يُعدَّد
 *   بالعين (`ق-٥٤٥`: أربعةٌ سُمّيت وأحدَ عشرَ وراءها).
 * - ② و③ قائمتان مكتوبتان — **فيُثبَت أن كلَّ اسمٍ فيهما نموذجٌ في المخطّط يحمل `companyId`**،
 *   وأن كلَّ سلسلةٍ يستعملها الكودُ (`kind: 'X'` في مواضع `document-sequence`) لها جدولٌ هنا.
 * - وأجلُ الحفظ يُحسب من المدد المقروءة: ١٠ للدفاتر و١١ للعقار.
 *
 * **حدُّه المعلَن**: لا يُثبت أن القراءةَ تحت سياق المنشأة تجد الصفوفَ فعلاً — ذاك في
 * `deletion-requests.e2e` على قاعدةٍ حيّة (صفرٌ بلا سياقٍ عمى — `ق-٢٦٢`).
 */
const SRC = join(__dirname, '..');

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : tsFilesUnder(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

/**
 * سلاسلُ المستندات التي يستعملها الكودُ فعلاً — تُقرأ من مواضع `kind: 'X'` في نصٍّ يذكر
 * أداةَ التسلسل؛ فسلسلةٌ في ملفٍّ لا يستعمل الأداة ليست مستنداً مرقَّماً.
 * **وتُجرَّد التعليقاتُ أولاً** (`ق-٣٧٥`) — فسلسلةٌ في شرحٍ ليست استعمالاً؛ والسلاسلُ الحرفية
 * تبقى لأن المطلوبَ عينُها.
 */
export function sequenceKindsInTexts(texts: string[]): string[] {
  const kinds = new Set<string>();
  for (const text of texts) {
    const code = stripComments(text);
    if (!code.includes('document-sequence')) continue;
    for (const m of code.matchAll(/kind:\s*'([A-Z]+)'/g)) kinds.add(m[1]);
  }
  return [...kinds].sort();
}

const dmmfModel = (name: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === name);

describe('معيارُ الحركة — الأسماءُ من المصدر، والصنفُ الأوّل مشتقّ (ق-٥٤٦)', () => {
  it('① يُشتقّ من المخطّط ويجد ما ترفض القاعدةُ حذفَه — ولا يُعدَّد بالعين', () => {
    const refused = refusedByDatabase();
    expect(refused.length).toBeGreaterThan(0);
    for (const name of refused) {
      const rel = dmmfModel(name)!.fields.find((f) => f.kind === 'object' && f.type === 'Company');
      expect(rel?.relationOnDelete).toBe('Restrict');
    }
    // الثلاثةُ المعلومة اليوم — شاهدٌ لا قائمة: لو زادت غداً دخلت وحدها.
    for (const known of ['Task', 'TaskLog', 'DelegationLog']) expect(refused).toContain(known);
  });

  it('② و③ كلُّ اسمٍ نموذجٌ في المخطّط يحمل companyId — لا اسمَ مخترَع، ولا تكرار', () => {
    for (const { model } of [...NUMBERED_DOCUMENTS, ...LEDGER_LINES]) {
      const m = dmmfModel(model);
      expect(m).toBeDefined();
      expect(m!.fields.some((f) => f.name === 'companyId')).toBe(true);
    }
    const all = movementSources().map((s) => s.model);
    expect(new Set(all).size).toBe(all.length);
  });

  it('② كلُّ سلسلةٍ يستعملها الكودُ لها جدولٌ في المعيار — تُقرأ من المصدر لا من الذاكرة', () => {
    const used = sequenceKindsInTexts(tsFilesUnder(SRC).map((f) => readFileSync(f, 'utf8')));
    expect(used.length).toBeGreaterThan(0);
    const covered = new Set(NUMBERED_DOCUMENTS.flatMap((d) => d.kinds));
    expect(used.filter((k) => !covered.has(k))).toEqual([]);
  });

  it('② حارسٌ على المجسّ: نصٌّ يستعمل الأداة يُقرأ، ونصٌّ لا يستعملها لا يُقرأ', () => {
    const withTool = "import { nextDocumentNumber } from '../common/document-sequence.util';\nconst spec = { kind: 'XYZ', pad: 5 };";
    const withoutTool = "const spec = { kind: 'ABC', pad: 5 };";
    expect(sequenceKindsInTexts([withTool])).toEqual(['XYZ']);
    expect(sequenceKindsInTexts([withoutTool])).toEqual([]);
  });

  it('أجلُ الحفظ: عشرٌ للدفاتر وخمسَ عشرةَ للعقار — من المدد المقروءة', () => {
    // ⛔ حدٌّ أدنى بنصّه (`ق-١٥٢٢`): الاتفاقيةُ الموحّدة م٥٩ ودليلُ الفواتير §8.3.3 — «لا يُنزل عن ١٥ بلا نصّ».
    // فتوكيدٌ على الرقم نفسِه لا على الثابت وحدَه: التوكيداتُ أدناه تتبع الثابتَ فتمرّ لأيّ قيمة.
    expect(RETENTION_YEARS.realEstate).toBeGreaterThanOrEqual(15);
    expect(RETENTION_YEARS.books).toBeGreaterThanOrEqual(10);
    const closedAt = new Date('2026-09-11T00:00:00Z');
    expect(retentionDeadline(closedAt, ['Invoice']).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.books);
    expect(retentionDeadline(closedAt, ['Invoice', 'Contract']).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate);
    expect(retentionDeadline(closedAt, []).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.books);
  });

  it('⚖️ ومدّةُ الحفظ المختومة على نموذج التسليم تُقرأ: الأجلُ أطولُها وأطولُ مدّة الصنف (توجيه ٢٨٦ · القاعدة ٣٧)', () => {
    // الجوابُ محسوبٌ يداً: ختمٌ أطولُ من مدّة العقار يمدّ الأجل، وأقصرُ منها أو غائبٌ لا يُنقصه.
    const closedAt = new Date('2026-09-11T00:00:00Z');
    expect(retentionDeadline(closedAt, ['Contract'], RETENTION_YEARS.realEstate + 5).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate + 5);
    expect(retentionDeadline(closedAt, ['Contract'], 3).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate);
    expect(retentionDeadline(closedAt, ['Contract'], 0).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate);
    expect(retentionDeadline(closedAt, ['Invoice'], RETENTION_YEARS.realEstate).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate);
  });

  it('سجلّاتُ العقار: كلُّ اسمٍ في المجموعة إمّا العقارُ أو الوحدةُ أو نموذجٌ يشير إلى أحدهما — لا اسمَ مخترَع (ق-١٢٧١/أ)', () => {
    const byName = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
    const pointsAtRealEstate = (name: string, depth = 3): boolean =>
      // يشير إلى العقار أو الوحدة مباشرةً أو عبر مستندٍ يشير إليهما (دفعةُ الإيجار ⟵ القسط ⟵ العقد ⟵ الوحدة) — من جهة المفتاح الأجنبي حتى ثلاث خطوات
      depth > 0 &&
      byName.get(name)!.fields.some(
        (f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 0 && (f.type === 'Property' || f.type === 'Unit' || pointsAtRealEstate(f.type, depth - 1)),
      );
    expect(REAL_ESTATE_MODELS.size).toBeGreaterThanOrEqual(7);
    for (const name of REAL_ESTATE_MODELS) {
      expect(byName.has(name)).toBe(true);
      expect(name === 'Property' || name === 'Unit' || pointsAtRealEstate(name)).toBe(true);
    }
    // وبلاغاتُ الصيانة والضمانات — ما يجرّه محوُ العقار (Cascade) — داخلَ المجموعة بعينها.
    expect(REAL_ESTATE_MODELS.has('MaintenanceRequest')).toBe(true);
    expect(REAL_ESTATE_MODELS.has('Warranty')).toBe(true);
    expect(retentionDeadline(new Date('2026-09-11T00:00:00Z'), ['MaintenanceRequest']).getUTCFullYear()).toBe(2026 + RETENTION_YEARS.realEstate);
  });
});
