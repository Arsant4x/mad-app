import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_SCREENS } from '../templates/screens';
import { DelegationLink, RootGrants } from '../delegations/intersection';
import { Grant } from '../delegations/permission-tree';
import { grantsFromAssignment, mayOpenTarget, TaskLike, viewFor } from './task-visibility';

/**
 * حارس «المهمة لا تلتفّ على الصلاحيات».
 *
 * المتطلب (قرار المالك 2026-08-12): المكلَّف **يرى وجود المهمة** ولا يرى
 * **محتوى المستند**. وبدونه تصير المهام باباً خلفياً: يكفي تكليفٌ بمهمة على
 * فاتورة ليُقرأ محتواها، فيُلتفّ على `@RequiresScreen` والتفويض معاً.
 */
const g = (...items: string[]): Set<Grant> => new Set(items as Grant[]);

const link = (granted: Set<Grant>, revoked = false): DelegationLink => ({
  grantorId: 'owner',
  granteeId: 'emp',
  granted,
  revoked,
});

const task = (over: Partial<TaskLike> = {}): TaskLike => ({
  id: 't1',
  title: 'راجع فاتورة العميل',
  assigneeId: 'emp',
  target: { screen: 'invoice', entityId: 'inv-1' },
  ...over,
});

describe('المهام — تُبنى فوق التفويض لا بجواره', () => {
  it('⭐ مكلَّفٌ لا يملك الشاشة: يرى المهمة ولا يفتح المستند', () => {
    const root: RootGrants = g('contracts:view'); // لا `invoice:view`
    const v = viewFor(task(), root, []);

    expect(v.title).toBe('راجع فاتورة العميل'); // وجود المهمة ظاهر
    expect(v.canOpenTarget).toBe(false); // والمحتوى ممنوع
    expect(mayOpenTarget(task().target!, root, [])).toBe(false);
  });

  it('ومن يملكها يفتحها', () => {
    const root: RootGrants = g('invoice:view');
    expect(viewFor(task(), root, []).canOpenTarget).toBe(true);
    expect(mayOpenTarget(task().target!, root, [])).toBe(true);
  });

  it('⚠️ والتفويض يضيّق الرؤية كذلك — لا تلتفّ المهمة على السلسلة', () => {
    const root: RootGrants = g('invoice:view', 'contracts:view');
    // المفوِّض يملك الفاتورة، والحلقة تمنح العقود وحدها.
    const chain = [link(g('contracts:view'))];
    expect(viewFor(task(), root, chain).canOpenTarget).toBe(false);
  });

  it('⭐ والسحب يسري على المهام فوراً — لا نسخة تحتفظ بها', () => {
    const root: RootGrants = g('invoice:view');
    const active = [link(g('invoice:view'))];
    expect(viewFor(task(), root, active).canOpenTarget).toBe(true);

    const revoked = [{ ...active[0], revoked: true }];
    expect(viewFor(task(), root, revoked).canOpenTarget).toBe(false);
  });

  it('مهمة بلا مستند: لا شيء يُفتح', () => {
    expect(viewFor(task({ target: null }), g('invoice:view'), []).canOpenTarget).toBe(false);
  });

  it('⚠️ التكليف لا يمنح صلاحيةً — نفيٌ موثَّق لا مصادفة', () => {
    expect(grantsFromAssignment().size).toBe(0);
  });

  it('شاشة المستند من `ALLOWED_SCREENS` — لا اسمٌ حر يلتفّ على الفحص', () => {
    // اسمٌ خارج السجل لا يطابق أي منحة، فيُرفض بنيوياً.
    const bogus = task({ target: { screen: 'invoices-typo', entityId: 'x' } });
    expect(viewFor(bogus, g('invoice:view'), []).canOpenTarget).toBe(false);
    expect((ALLOWED_SCREENS as readonly string[]).includes('invoices-typo')).toBe(false);
  });

  /**
   * ⚠️ **يُقرأ المصدر لا المخرَج** (القاعدة السابعة): لا يكفي أن تعيد
   * `grantsFromAssignment()` مجموعةً فارغة اليوم — المطلوب ألّا يوجد في
   * وحدات المهام **مسارٌ يمنح** أصلاً. فيُفحص نصّ الوحدات.
   */
  it('لا وحدة مهام تمنح صلاحية — لا `add`/`grant` على مجموعة منح', () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.spec.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      // إضافةٌ إلى مجموعة منح، أو بناء منحة من عدم.
      for (const m of src.matchAll(/(\w*[Gg]rants?)\s*\.\s*add\s*\(/g)) offenders.push(`${f}: ${m[1]}.add()`);
    }
    expect({ مسارات_تمنح_صلاحية: offenders }).toEqual({ مسارات_تمنح_صلاحية: [] });
  });
});
