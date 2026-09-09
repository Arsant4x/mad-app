import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): يمنع **قائمةً مكتوبةً بيدٍ** —
// `= ['a', 'b']` — **فالاقتباسُ هو مناطُ الفحص نفسُه**، وتجريدُ النصوص يمحو
// ما بُني ليمسكه. ويقرأ كذلك قيوداً من ملفّ الهجرة (`SQL`).
readsDeclaredStrings();
import { ALLOWED_SCREENS } from '../templates/screens';
import { DelegationLink, RootGrants } from '../delegations/intersection';
import { Grant } from '../delegations/permission-tree';
import {
  allowedTransitions,
  currentDueDate,
  isOverdue,
  isTaskEntityType,
  mayTransition,
  occurrencesDue,
  TASK_STATUSES,
  TaskStatus,
} from './task-model';

const g = (...items: string[]): Set<Grant> => new Set(items as Grant[]);
const link = (granted: Set<Grant>, revoked = false): DelegationLink => ({
  grantorId: 'owner',
  granteeId: 'emp',
  granted,
  revoked,
});
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'migrations', '20260813090000_task_log', 'migration.sql'),
  'utf8',
);

describe('نموذج المهمة — الشروط الأربعة', () => {
  /* ─────────── ④ الرابطة متعددة الأشكال ─────────── */
  describe('④ `entityType` مقيَّد بقائمة مغلقة مشتقّة من مصدرها', () => {
    it('يقبل ما في `ALLOWED_SCREENS` ويرفض ما عداه', () => {
      expect(isTaskEntityType('invoice')).toBe(true);
      expect(isTaskEntityType('contracts')).toBe(true);
      // ⚠️ الأسماء التي اختُرعت في شجرة الصلاحيات — تُرفض هنا بنيوياً.
      expect(isTaskEntityType('invoices')).toBe(false);
      expect(isTaskEntityType('audit-log')).toBe(false);
      expect(isTaskEntityType('كيان-مخترَع')).toBe(false);
    });

    /**
     * ⚠️ يُقرأ **المصدر** لا المخرَج (القاعدة السابعة): لا يكفي أن يرفض
     * `isTaskEntityType` أسماءً اليوم — المطلوب أن يكون النوع **مشتقّاً**،
     * فلو كُتبت قائمة يدوية موازية لتفارقت مع `ALLOWED_SCREENS` بصمت.
     */
    it('النوع مشتقٌّ من `ALLOWED_SCREENS` لا مكتوبٌ يدوياً', () => {
      const src = readFileSync(join(__dirname, 'task-model.ts'), 'utf8');
      expect(src).toMatch(/TaskEntityType\s*=\s*\(typeof ALLOWED_SCREENS\)\[number\]/);
      // ولا قائمة نصّية موازية لأسماء الشاشات.
      const literalLists = src.match(/=\s*\[\s*'(?:[a-z-]+)'\s*,\s*'(?:[a-z-]+)'/g) ?? [];
      const suspicious = literalLists.filter((l) => /invoice|contract|propert|customer/.test(l));
      expect({ قوائم_شاشات_موازية: suspicious }).toEqual({ قوائم_شاشات_موازية: [] });
    });

    it('وكل شاشة حقيقية صالحةٌ نوعاً — لا نقص', () => {
      const rejected = (ALLOWED_SCREENS as readonly string[]).filter((s) => !isTaskEntityType(s));
      expect({ شاشات_مرفوضة: rejected }).toEqual({ شاشات_مرفوضة: [] });
    });
  });

  /* ─────────── ② الحالة والانتقالات ─────────── */
  describe('② انتقالات مضبوطة — لا حقل نصّي حرّ', () => {
    it('الحالات قائمة مغلقة', () => {
      expect(TASK_STATUSES).toEqual(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']);
    });

    it('⚠️ لا انتقال من حالة نهائية — إعادة الفتح مهمة جديدة', () => {
      expect(allowedTransitions('DONE')).toEqual([]);
      expect(allowedTransitions('CANCELLED')).toEqual([]);
      const owner = g(...(ALLOWED_SCREENS as readonly string[]).flatMap((s) => [`${s}:edit`, `${s}:review`, `${s}:delete`]));
      expect(mayTransition('DONE', 'OPEN', 'invoice', owner, [])).toBe(false);
    });

    it('⭐ الانتقال يُحكم بالتفويض — مكلَّفٌ بلا `review` لا يُقفل المهمة', () => {
      const canEdit = g('invoice:edit');
      expect(mayTransition('OPEN', 'IN_PROGRESS', 'invoice', canEdit, [])).toBe(true);
      // الإقفال يحتاج `review` — ولا يملكها.
      expect(mayTransition('IN_PROGRESS', 'DONE', 'invoice', canEdit, [])).toBe(false);
      expect(mayTransition('IN_PROGRESS', 'DONE', 'invoice', g('invoice:review'), [])).toBe(true);
    });

    it('والسحب يمنع الانتقال فوراً — لا نسخة تحتفظ بها المهمة', () => {
      const root = g('invoice:review');
      expect(mayTransition('IN_PROGRESS', 'DONE', 'invoice', root, [link(g('invoice:review'))])).toBe(true);
      expect(mayTransition('IN_PROGRESS', 'DONE', 'invoice', root, [link(g('invoice:review'), true)])).toBe(false);
    });

    it('انتقالٌ غير موجود في الآلة يُرفض ولو ملك الفاعل كل شيء', () => {
      const all = g(...(ALLOWED_SCREENS as readonly string[]).flatMap((s) => [`${s}:edit`, `${s}:review`, `${s}:delete`]));
      expect(mayTransition('OPEN', 'DONE', 'invoice', all, [])).toBe(false); // لا قفزة
      expect(mayTransition('BLOCKED', 'DONE', 'invoice', all, [])).toBe(false);
    });

    it('مهمة بلا مستند تُحكم بـ`dashboard`', () => {
      expect(mayTransition('OPEN', 'IN_PROGRESS', null, g('dashboard:edit'), [])).toBe(true);
      expect(mayTransition('OPEN', 'IN_PROGRESS', null, g('invoice:edit'), [])).toBe(false);
    });
  });

  /* ─────────── ① الجدولة عند القراءة ─────────── */
  describe('① الروتينية تُحسب عند القراءة — بلا cron', () => {
    const anchor = new Date('2026-01-01T00:00:00Z');
    const at = (iso: string) => new Date(iso);

    it('الاستحقاق يُشتقّ من الزمن الممرَّر', () => {
      const rec = { everyDays: 7, anchor };
      expect(currentDueDate(rec, at('2026-01-01T00:00:00Z'))).toEqual(anchor);
      expect(currentDueDate(rec, at('2026-01-08T00:00:00Z'))).toEqual(at('2026-01-08T00:00:00Z'));
      expect(currentDueDate(rec, at('2026-01-10T00:00:00Z'))).toEqual(at('2026-01-08T00:00:00Z'));
    });

    it('غياب طويل لا يُنتج فجوة — الدورات تُحسب لا تُولَّد', () => {
      // ⚠️ هنا يظهر الفرق: cron متوقّف شهراً يترك فجوة؛ والاشتقاق لا يعرفها.
      const rec = { everyDays: 7, anchor };
      expect(occurrencesDue(rec, at('2026-03-01T00:00:00Z'))).toBe(9);
    });

    it('قبل المرساة: لا استحقاق', () => {
      const rec = { everyDays: 7, anchor };
      expect(occurrencesDue(rec, at('2025-12-31T00:00:00Z'))).toBe(0);
      expect(currentDueDate(rec, at('2025-12-31T00:00:00Z'))).toEqual(anchor);
    });

    it('غير المتكرّرة: مرة واحدة', () => {
      const rec = { everyDays: 0, anchor };
      expect(occurrencesDue(rec, at('2026-06-01T00:00:00Z'))).toBe(1);
      expect(currentDueDate(rec, at('2026-06-01T00:00:00Z'))).toEqual(anchor);
    });

    it('التأخّر مشتقٌّ كذلك — ولا يُحسب على منتهية', () => {
      const rec = { everyDays: 7, anchor };
      const late = at('2026-01-05T00:00:00Z');
      expect(isOverdue(rec, late, 'OPEN')).toBe(true);
      expect(isOverdue(rec, late, 'DONE')).toBe(false);
      expect(isOverdue(rec, late, 'CANCELLED')).toBe(false);
    });

    /** ⚠️ يُقرأ المصدر: لا `new Date()` داخل الدوال، وإلا تعذّر حقن الزمن. */
    it('لا زمنَ داخلي في دوال الجدولة — الزمن يُمرَّر', () => {
      const src = readFileSync(join(__dirname, 'task-model.ts'), 'utf8');
      const body = src.slice(src.indexOf('export function currentDueDate'));
      expect(body).not.toMatch(/new Date\(\s*\)/);
      expect(body).not.toMatch(/Date\.now\(\)/);
    });

    it('ولا مهمة خلفية للمهام الروتينية', () => {
      const src = readFileSync(join(__dirname, 'task-model.ts'), 'utf8');
      expect(src).not.toMatch(/@Cron|CronExpression|setInterval/);
    });
  });

  /* ─────────── ③ السجل يتبع قواعد سجل التفويض ─────────── */
  describe('③ سجل المهام — لا حذف · متسلسل · زمن من الخادم', () => {
    it('مُشغِّل يرفض DELETE **و**UPDATE على مستوى القاعدة', () => {
      expect(MIGRATION).toMatch(/BEFORE UPDATE OR DELETE ON "task_logs"/);
      expect(MIGRATION).toMatch(/TG_OP = 'DELETE'[\s\S]{0,200}RAISE EXCEPTION/);
      // أشدّ من سجل التفويض: لا تعديل بحال، ولو ختماً.
      expect(MIGRATION).toMatch(/RAISE EXCEPTION 'سجل المهام لا يُعدَّل/);
    });

    it('⚠️ ولا `ON DELETE CASCADE` من الشركة', () => {
      const fk = MIGRATION.match(/task_logs_companyId_fkey[\s\S]*?;/)?.[0] ?? '';
      expect(fk).toContain('ON DELETE RESTRICT');
      expect(fk).not.toContain('ON DELETE CASCADE');
    });

    it('تسلسل فريد لكل منشأة', () => {
      expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX "task_logs_companyId_seq_key"[\s\S]*?"companyId", "seq"/);
    });

    it('مُشغِّل إدراج يدهس `createdAt` بـ`now()` — لا يكتفي بـDEFAULT', () => {
      const trg = /BEFORE INSERT ON "task_logs"[\s\S]*?EXECUTE FUNCTION (\w+)/.exec(MIGRATION);
      expect(trg).toBeTruthy();
      const fn = new RegExp(`FUNCTION ${trg![1]}\\(\\)[\\s\\S]*?\\$\\$ LANGUAGE`).exec(MIGRATION)?.[0] ?? '';
      expect(fn).toMatch(/NEW\."createdAt"\s*:=\s*now\(\)/);
    });

    it('عزل المستأجر مفعَّل ومفروض', () => {
      expect(MIGRATION).toContain('ENABLE ROW LEVEL SECURITY');
      expect(MIGRATION).toContain('FORCE ROW LEVEL SECURITY');
      expect(MIGRATION).toContain('tenant_isolation_task_logs');
    });

    it('وحالات السجل من القائمة المغلقة نفسها — لا سلسلتان', () => {
      const src = readFileSync(join(__dirname, 'task-model.ts'), 'utf8');
      expect(src).toMatch(/TaskStatus\s*=\s*\(typeof TASK_STATUSES\)\[number\]/);
      const statuses: TaskStatus[] = [...TASK_STATUSES];
      expect(new Set(statuses).size).toBe(statuses.length);
    });
  });
});
