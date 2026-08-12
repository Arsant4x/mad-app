import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * حرّاس السجل الشجري — **الثلاثة المُلزِمة نصّاً**.
 *
 * الملحق (1) من قرار ZATCA يحظر تحت
 * «Tampering of e-invoices or their associated notes or **logs**»:
 *   • `Allows for log modification/deletion`
 *   • `Non-sequential log generation`
 *   • `Generated with inaccurate timestamps`
 *
 * ## ⚠️ ولماذا يُقرأ ملف الترحيل لا الخدمة (القاعدة السابعة)
 *
 * حارسٌ يفحص `DelegationLogService.remove()` **لا يحرس شيئاً**: يمرّ عليه
 * `prisma.delegationLog.deleteMany()` و`DELETE` خاماً و**الحذف المتسلسل**
 * عبر `onDelete: Cascade`. فالمنع يجب أن يقع حيث تمرّ كل هذه المسارات —
 * أي في القاعدة — والحارس يقرأ **ذلك المصدر**: نصّ الترحيل.
 *
 * وهذا فحصٌ بنيوي لا سلوكي: يُثبت أن المنع **مكتوب**، ويبقى إثبات أنه
 * **يعمل** لاختبارٍ على قاعدة حيّة (بند متابعة مسجَّل أدناه).
 */
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'migrations', '20260812150000_delegation_log', 'migration.sql'),
  'utf8',
);

describe('سجل التفويض — ملحقٌ فقط', () => {
  describe('١) لا حذف — على كل المسارات لا على دالة واحدة', () => {
    it('مُشغِّل يرفض DELETE على مستوى القاعدة', () => {
      expect(MIGRATION).toMatch(/BEFORE UPDATE OR DELETE ON "delegation_logs"/);
      expect(MIGRATION).toMatch(/TG_OP = 'DELETE'[\s\S]{0,200}RAISE EXCEPTION/);
    });

    it('⚠️ ولا `ON DELETE CASCADE` من الشركة — وإلا محا حذفُ المنشأة السجل متسلسلاً', () => {
      const fk = MIGRATION.match(/delegation_logs_companyId_fkey[\s\S]*?;/)?.[0] ?? '';
      expect(fk).toContain('ON DELETE RESTRICT');
      expect(fk).not.toContain('ON DELETE CASCADE');
    });

    it('التعديل محصورٌ في الختم — لا يُعدَّل فاعلٌ ولا نطاقٌ ولا زمنٌ ولا تسلسل', () => {
      expect(MIGRATION).toMatch(/OLD\."state" <> 'SEALED' OR NEW\."state" <> 'REVOKED'/);
      for (const col of ['id', 'companyId', 'seq', 'grantorId', 'granteeId', 'nodeKey', 'createdAt']) {
        expect(MIGRATION).toContain(`NEW."${col}" <> OLD."${col}"`);
      }
    });
  });

  describe('٢) متسلسل — الفجوة تُكتشف', () => {
    it('تسلسل فريد لكل منشأة', () => {
      expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX "delegation_logs_companyId_seq_key"[\s\S]*?"companyId", "seq"/);
    });

    /**
     * ⚠️ **الفحص على الاكتشاف لا على الترقيم.**
     *
     * فهرسٌ فريد يمنع التكرار ولا يمنع **القفز** (1,2,5). والقفز هو دليل
     * العبث — صفٌّ حُذف بمسارٍ التفّ على المُشغِّل، أو أُدرج بترقيم مصطنع.
     * فالكشف يقارن **العدّ بالمدى**: n صفاً يجب أن يمتد من 1 إلى n.
     */
    it('كاشف الفجوة يسقط على ترقيم يقفز — لا على الترقيم السليم', () => {
      const gaps = (seqs: number[]) => detectGaps(seqs);
      expect(gaps([1, 2, 3, 4])).toEqual([]);
      expect(gaps([])).toEqual([]);
      // قفزة: 1,2,5 ⇒ 3 و4 مفقودان
      expect(gaps([1, 2, 5])).toEqual([3, 4]);
      // صفٌّ حُذف من الوسط
      expect(gaps([1, 3])).toEqual([2]);
      // بداية خاطئة
      expect(gaps([2, 3])).toEqual([1]);
    });
  });

  describe('٣) زمنٌ من الخادم — يُتجاهل ما يرسله العميل', () => {
    /**
     * ⚠️ يُفحص **السلوك لا التسمية**.
     *
     * أول صياغة بحثت عن اسم الدالة الذي كتبتُه أنا
     * (`delegation_logs_server_time`). فحين أُعيدت كتابة الترحيل بتسمية
     * أنظف (`delegation_logs_stamp_server_time`) **سقط الحارس على ملفٍ
     * سليم** — إنذارٌ كاذب يُفقد الثقة بالحارس نفسه.
     *
     * فالمطلوب: أن يوجد مُشغِّل قبل الإدراج **يدهس** `createdAt` بـ`now()`
     * — أياً كان اسم دالته.
     */
    it('مُشغِّل إدراج يدهس `createdAt` بـ`now()` — لا يكتفي بـDEFAULT', () => {
      // DEFAULT وحده لا يكفي: قيمةٌ صريحة من العميل تتجاوزه.
      const insertTrigger = /BEFORE INSERT ON "delegation_logs"[\s\S]*?EXECUTE FUNCTION (\w+)/.exec(MIGRATION);
      expect(insertTrigger).toBeTruthy();
      const fnBody = new RegExp(`FUNCTION ${insertTrigger![1]}\\(\\)[\\s\\S]*?\\$\\$ LANGUAGE`).exec(MIGRATION)?.[0] ?? '';
      expect(fnBody).toMatch(/NEW\."createdAt"\s*:=\s*now\(\)/);
    });

    it('وزمن السحب من الخادم كذلك', () => {
      expect(MIGRATION).toMatch(/NEW\."revokedAt" := now\(\)/);
    });
  });

  it('عزل المستأجر مفعَّل ومفروض على الجدول', () => {
    expect(MIGRATION).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('FORCE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('tenant_isolation_delegation_logs');
  });
});

/**
 * كاشف الفجوات في التسلسل — يُصدَّر ليستعمله فحصُ السلامة الدوري.
 *
 * يعيد الأرقام **المفقودة** بين 1 وأكبر رقم موجود. فراغُ النتيجة يعني
 * تسلسلاً سليماً؛ وأي رقم فيها دليلُ صفٍّ اختفى أو ترقيمٍ مصطنع.
 */
export function detectGaps(seqs: readonly number[]): number[] {
  if (seqs.length === 0) return [];
  const present = new Set(seqs);
  const max = Math.max(...seqs);
  const missing: number[] = [];
  for (let i = 1; i <= max; i++) if (!present.has(i)) missing.push(i);
  return missing;
}
