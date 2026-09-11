import { Prisma } from '@prisma/client';
import { ARCHIVE_WINDOW_DAYS } from '../export/company-archive.service';
import { ERASED_FIELDS, KEPT_FIELDS, PERSONAL_FIELD_NAMES, REOPEN_WINDOW_DAYS, reopenUntil } from './personal-data-erasure.service';

/**
 * حارسُ قائمة المحو (`ق-٥٥٩`) — **الاكتمالُ يُقاس من المخطّط لا يُعدَّد بالعين** (`ق-٥٤٥`):
 * كلُّ حقلٍ في المخطّط اسمُه من أسماء الحقول الشخصية إمّا يُمحى وإمّا يبقى بحجّة — ولا ثالث.
 * وكلُّ اسمٍ في القائمتين حقلٌ حقيقيٌّ قابلٌ للفراغ.
 */
describe('محوُ غير الملزِم — قائمةٌ محروسةٌ بالمخطّط (ق-٥٥٩)', () => {
  const personalInSchema = Prisma.dmmf.datamodel.models.flatMap((m) =>
    m.fields.filter((f) => (PERSONAL_FIELD_NAMES as readonly string[]).includes(f.name) && f.kind === 'scalar').map((f) => `${m.name}.${f.name}`),
  );

  it('كلُّ حقلٍ شخصيّ في المخطّط مُقرَّرٌ: يُمحى أو يبقى بحجّة — ولا ثالث', () => {
    const decided = new Set([...ERASED_FIELDS, ...KEPT_FIELDS].map((f) => `${f.model}.${f.field}`));
    const undecided = personalInSchema.filter((k) => !decided.has(k));
    expect(personalInSchema.length).toBeGreaterThan(0);
    expect(undecided).toEqual([]);
  });

  it('كلُّ اسمٍ في القائمتين حقلٌ حقيقيٌّ — والممحوُّ قابلٌ للفراغ، وله حجّةٌ مكتوبة', () => {
    for (const f of [...ERASED_FIELDS, ...KEPT_FIELDS]) {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === f.model);
      expect(model).toBeDefined();
      const field = model!.fields.find((x) => x.name === f.field);
      expect(field).toBeDefined();
      expect(f.reason.length).toBeGreaterThan(10);
    }
    for (const f of ERASED_FIELDS) {
      const field = Prisma.dmmf.datamodel.models.find((m) => m.name === f.model)!.fields.find((x) => x.name === f.field)!;
      expect(field.isRequired).toBe(false);
    }
  });

  it('لا حقلَ في القائمتين معاً', () => {
    const erased = new Set(ERASED_FIELDS.map((f) => `${f.model}.${f.field}`));
    expect(KEPT_FIELDS.filter((f) => erased.has(`${f.model}.${f.field}`))).toEqual([]);
  });

  it('نافذةُ العودة تساوي نافذةَ النسخة — رقمٌ واحد، وأجلُها يُحسب من الإغلاق', () => {
    expect(ARCHIVE_WINDOW_DAYS).toBe(REOPEN_WINDOW_DAYS);
    const closedAt = new Date('2026-09-11T00:00:00Z');
    expect(reopenUntil(closedAt).getTime() - closedAt.getTime()).toBe(REOPEN_WINDOW_DAYS * 24 * 3600 * 1000);
  });
});
