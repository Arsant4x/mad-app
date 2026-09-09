import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): المقروءُ **قيمٌ نصّية معلَنة**
// لا أنماطُ شيفرة — **فتجريدُ النصوص يُعميه**.
readsDeclaredStrings();
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ALLOWED_SCREENS } from '../templates/screens';
import { TASK_STATUSES } from './task-model';
import { CreateTaskDto } from './dto/create-task.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';

const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/**
 * نصّ ترحيل جدول المهام — **عباراتُه وحدها، بلا تعليقات**.
 *
 * ⚠️ والتجريد شرطُ صحّة لا تنظيف: أول تشغيلٍ سقط لأن الترحيل **يشرح** أن
 * `canOpenTarget` ممنوع، فقرأ الحارس شرحَ المنع منعاً. أي أنه كان سيمنع
 * ملفّاً يوثّق القاعدة ويمرّر ملفّاً يخالفها بصمت لو لم يُكتب فيه الاسم.
 *
 * وهو الوجه الثالث من النمط الرباعي (CLAUDE.md §4): **مدًى أوسع من
 * المقصود** — والحارس يجب أن تقع عينُه على ما يُنفَّذ لا على ما يُقرأ.
 */
function tasksMigration(): string {
  const dirs = readdirSync(MIGRATIONS).filter((d) => /_tasks$/.test(d));
  // ⚠️ حارسٌ للحارس: اسمٌ يتغيّر أو ترحيلٌ يُعاد تسميته يجعل هذا الفحص
  // يقرأ نصّاً فارغاً ويمرّ على كل شيء.
  expect(dirs).toHaveLength(1);
  return read(join(MIGRATIONS, dirs[0], 'migration.sql'))
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

const service = () => read(join(__dirname, 'tasks.service.ts')).replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('القاعدة ②: `canOpenTarget` محسوبٌ لا مخزَّن', () => {
  it('⭐ لا عمود بهذا المعنى في جدول المهام', () => {
    // تخزينه يعني نسخةً تتقادم عند أول سحب — وهو بعينه العطل الذي تجنّبه
    // التقاطع الحيّ. والعمود يصمت: يبقى `true` بعد أن صار الجواب `false`.
    const sql = tasksMigration();
    expect(sql).toContain('CREATE TABLE "tasks"');
    for (const forbidden of ['canOpenTarget', 'can_open_target', 'canOpen']) {
      expect({ forbidden, present: sql.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it('⭐ يُشتقّ من الصلاحيات عند القراءة', () => {
    const code = service();
    expect(code).toContain('viewFor(');
    // ومن **نفس** مصدر الواجهة لا من حسابٍ محلّي.
    expect(code).toContain('this.permissions.forActor');
  });

  it('⭐ ولا حساب صلاحيات محلّي في الخدمة', () => {
    // نسخةٌ ثانية تفترق عن الأولى عند أول تعديل: يرى المكلَّف زرّاً يرفضه
    // الخادم، أو العكس.
    const code = service();
    for (const token of ['isActionAllowed', 'rootGrantsFrom', 'effectiveGrants', 'chainsFor']) {
      expect({ token, present: code.includes(token) }).toEqual({ token, present: false });
    }
  });
});

describe('القاعدة ①: المكلَّف يرى وجود المهمة ولا يرى محتوى المستند', () => {
  it('⭐ الخدمة لا تقرأ أي جدول مستندات', () => {
    // لو قرأت الخدمة العقد أو الفاتورة لتزيّن العنوان، لسرّبت محتواه إلى
    // من لا يملك شاشته — والعنوان يكتبه المُسنِد، فلا حاجة.
    const code = service();
    for (const table of ['contracts', 'invoices', 'maintenance_requests', 'properties']) {
      expect({ table, read: new RegExp(`FROM\\s+"${table}"`, 'i').test(code) }).toEqual({ table, read: false });
    }
  });

  it('⭐ الاستعلام مقيَّدٌ بالمكلَّف — لا يقرأ مهام غيره', () => {
    const code = service();
    expect(code).toMatch(/FROM "tasks" WHERE "assigneeId" = /);
  });

  it('⭐ والمُسنِد لا يربط مستنداً لا يراه — الطرف الآخر من القاعدة', () => {
    // بدونه يصير الإسناد قناةَ تسريب معكوسة: من لا يملك `contracts:view`
    // يربط مهمةً بعقدٍ لم يره فيكشف وجوده ومعرّفه لمن يفتحه.
    const code = service();
    expect(code).toContain('task_target_not_visible');
    expect(code).toMatch(/grants\.has\(`\$\{dto\.targetScreen\}:view`/);
  });
});

describe('القاعدة ③: الموعد والتأخّر بالاشتقاق', () => {
  it('⭐ لا عمود «الموعد القادم» ولا «متأخّرة» في الجدول', () => {
    // التأخّر دالةُ الزمن، وعمودٌ يحمله يصير كذباً بمرور يوم.
    const sql = tasksMigration();
    for (const forbidden of ['nextDueAt', 'isOverdue', 'overdue', 'next_due']) {
      expect({ forbidden, present: sql.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
    // وما يُخزَّن هو المُدخَلان اللذان يُشتقّ منهما.
    expect(sql).toContain('"recurEveryDays"');
    expect(sql).toContain('"dueAnchor"');
  });

  it('⭐ العدّاد يُحسب ولا يُستعلَم بـ`COUNT` على عمود', () => {
    const code = service();
    expect(code).toContain('currentDueDate');
    expect(/COUNT\(/i.test(code)).toBe(false);
  });

  it('⭐ ولا `new Date()` داخل المنطق — الزمن يُحقن', () => {
    // فالاختبار يحقن الزمن ولا ينتظر مروره. وهو قرار المرحلة الثانية بنصّه.
    const code = service();
    expect(/new Date\(\)/.test(code)).toBe(false);
    expect(code).toContain('now: Date');
  });
});

describe('القاعدة الرابعة: الحالة والرابطة من قائمة مغلقة — في القاعدة لا الشيفرة وحدها', () => {
  it('⭐ القيود الثلاثة مكتوبة في الترحيل', () => {
    // الشيفرة تحرس ما يمرّ بالخدمة؛ والقاعدة تحرس ما يصل بأي طريق —
    // كتابةٌ خام، ترحيلٌ لاحق، سكربت إصلاح.
    const sql = tasksMigration();
    expect(sql).toContain('tasks_target_both_or_neither');
    expect(sql).toContain('tasks_status_closed_list');
    expect(sql).toContain('tasks_recurrence_needs_anchor');
  });

  it('⭐ قائمة الحالات في القيد تطابق `TASK_STATUSES` — الاتجاهان', () => {
    // قائمةٌ في SQL تتخلّف عن مصدرها تجعل حالةً مشروعة تُرفض من القاعدة،
    // أو حالةً محذوفة تبقى مقبولة. والفحص على الاثنين معاً.
    const inCheck = tasksMigration().match(/tasks_status_closed_list"?\s*\n?\s*CHECK \("status" IN \(([^)]+)\)\)/)?.[1];
    expect(inCheck).toBeDefined();
    const listed = [...inCheck!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual([...TASK_STATUSES].sort());
  });

  it('⭐ عزل المستأجر: ENABLE وFORCE معاً', () => {
    // FORCE شرطٌ لا تفصيل: مالك الجدول يتجاوز السياسة بدونه.
    const sql = tasksMigration();
    expect(sql).toContain('ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('tenant_isolation_tasks');
  });

  it('⭐ كل قراءة تمرّ بسياق المستأجر', () => {
    const code = service();
    expect(/this\.prisma\.\$queryRaw/.test(code)).toBe(false);
    expect(code).toContain('runInTenantContext');
  });
});

describe('مفردات الـDTO مشتقّة من مصدرها', () => {
  const dto = (over: Partial<CreateTaskDto> = {}) =>
    plainToInstance(CreateTaskDto, { title: 'مراجعة عقد', assigneeId: 'u1', ...over });
  const errs = (d: CreateTaskDto) => validateSync(d).map((e) => e.property);

  it('⭐ كل شاشة في `ALLOWED_SCREENS` مقبولة، والمخترَع مرفوض', () => {
    const rejected = ALLOWED_SCREENS.filter((s) => errs(dto({ targetScreen: s, targetId: 'x' })).includes('targetScreen'));
    expect(rejected).toEqual([]);
    expect(errs(dto({ targetScreen: 'invoices', targetId: 'x' }))).toContain('targetScreen');
  });

  it('⭐ شاشةٌ بلا معرّف مرفوضة — الرابطة كلٌّ أو لا شيء', () => {
    expect(errs(dto({ targetScreen: 'contracts' }))).toContain('targetId');
    // ولا شيء على الإطلاق مقبول: مهمةٌ بلا مستند مشروعة.
    expect(errs(dto())).toEqual([]);
  });

  it('⭐ كل حالة في `TASK_STATUSES` مقبولة، والمخترَعة مرفوضة', () => {
    for (const s of TASK_STATUSES) {
      expect({ s, bad: validateSync(plainToInstance(TransitionTaskDto, { to: s })).length }).toEqual({ s, bad: 0 });
    }
    expect(validateSync(plainToInstance(TransitionTaskDto, { to: 'ARCHIVED' })).length).toBeGreaterThan(0);
  });

  it('⭐ لا قائمة أسماءٍ منسوخة في الـDTO', () => {
    const src = read(join(__dirname, 'dto', 'create-task.dto.ts'));
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    for (const s of ALLOWED_SCREENS) {
      expect({ screen: s, hardcoded: new RegExp(`['"\`]${s}['"\`]`).test(code) }).toEqual({ screen: s, hardcoded: false });
    }
  });
});
