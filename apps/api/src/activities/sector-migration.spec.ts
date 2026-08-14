import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SECTORS } from './sectors';

const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

/**
 * ⚠️ العبارات وحدها بلا تعليقات.
 *
 * وقد وقعنا في هذا قبل ساعات: حارسُ المهام قرأ **تعليقاً يشرح المنع**
 * فعدّه منعاً، وسقط على ملفٍّ سليم. وهو الوجه الثالث من النمط الرباعي —
 * مدًى أوسع من المقصود (CLAUDE.md §4).
 */
function sql(): string {
  const dirs = readdirSync(MIGRATIONS).filter((d) => /_activity_sector$/.test(d));
  expect(dirs).toHaveLength(1);
  return readFileSync(join(MIGRATIONS, dirs[0], 'migration.sql'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

describe('الترحيل — الترشيح مطفأٌ حتى يختار المالك', () => {
  it('⭐ `primaryActivityId` بلا `DEFAULT` وبلا `NOT NULL`', () => {
    // أيٌّ منهما يُشغّل الترشيح على منشأةٍ لم تختر — فيستيقظ تاجرٌ بلا
    // شاشاته، وهو بالضبط ما يمنعه هذا التصميم.
    const s = sql();
    const line = s.split('\n').find((l) => l.includes('ADD COLUMN "primaryActivityId"'));
    expect(line).toBeDefined();
    expect(line!.toUpperCase()).not.toContain('DEFAULT');
    expect(line!.toUpperCase()).not.toContain('NOT NULL');
  });

  it('⭐ حذف النشاط الرئيسي يُعيد المنشأة إلى «لا ترشيح» لا يحذفها', () => {
    expect(sql()).toContain('ON DELETE SET NULL');
    expect(/primaryActivityId_fkey[\s\S]*?ON DELETE CASCADE/.test(sql())).toBe(false);
  });

  it('⭐ `sectorSuggested` عمودٌ منفصل عن `sector`', () => {
    // دمجُهما يمحو الفرق بين «رشّحه الحاسوب» و«أكّده الإنسان».
    const s = sql();
    expect(s).toContain('ADD COLUMN "sector" TEXT');
    expect(s).toContain('ADD COLUMN "sectorSuggested" TEXT');
  });

  it('⭐ `disabledAt` موجود — التعطيل لا الحذف', () => {
    const s = sql();
    expect(s).toContain('ADD COLUMN "disabledAt"');
    // ولا حذفَ صفوفٍ في الترحيل بحال.
    expect(/DELETE\s+FROM/i.test(s)).toBe(false);
    expect(/DROP\s+COLUMN/i.test(s)).toBe(false);
  });

  it('⭐ `activityType` القديم لا يُمسّ إطلاقاً', () => {
    // قرار المالك: حقلٌ قائم يقارَن به في مواضع، وتعديلُه يمسّ ما لم يُطلب.
    expect(sql()).not.toContain('activityType');
  });

  it('⭐ قائمة القطاعات في القيد تطابق `SECTORS` — الاتجاهان', () => {
    // قائمةٌ في SQL تتخلّف عن مصدرها تجعل قطاعاً مشروعاً يُرفض من القاعدة،
    // أو قطاعاً محذوفاً يبقى مقبولاً. والفحص على الاثنين معاً.
    const s = sql();
    for (const name of ['business_activities_sector_closed_list', 'business_activities_sector_suggested_closed_list']) {
      const body = s.match(new RegExp(`${name}"?\\s*\\n?\\s*CHECK \\([^)]*IN \\(([^)]+)\\)`))?.[1];
      expect({ name, found: body !== undefined }).toEqual({ name, found: true });
      const listed = [...body!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect({ name, listed }).toEqual({ name, listed: [...SECTORS].sort() });
    }
  });
});
