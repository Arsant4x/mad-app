import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../common/source-scan.util';
import { ALLOWED_SCREENS, ALL_ACTIONS, SCREEN_ACTIONS, isActionAllowed } from '../templates/screens';
import { Grant, allGrants, grant } from './permission-tree';
import { DelegationLink } from './intersection';
import { rootGrantsFrom } from './root-grants';
import { splitLastLink, grantableBy } from './extinguished';
import { chainsFor, liveEdges, DelegationRow, MAX_PATHS } from './chain-source';

const link = (grantorId: string, granteeId: string, granted: Grant[], revoked = false): DelegationLink => ({
  grantorId,
  granteeId,
  granted: new Set(granted),
  revoked,
});

const row = (grantorId: string, granteeId: string, grants: string[], state = 'ACTIVE'): DelegationRow => ({
  grantorId,
  granteeId,
  grants,
  state,
});

describe('سقف السلسلة يُشتقّ من القالب — لا يُعرَّف من جديد', () => {
  it('«كل الشاشات» يعطي 168 زوجاً — المجموعة القصوى', () => {
    const g = rootGrantsFrom(true, [], null);
    expect(g.size).toBe(allGrants().size);
    expect(g.has(grant('employees', 'salaries'))).toBe(true);
    expect(g.has(grant('contracts', 'salaries'))).toBe(false);
  });

  it('a screen granted with no action list includes its screen-only action', () => {
    const g = rootGrantsFrom(false, ['employees'], null);
    expect(g.size).toBe(SCREEN_ACTIONS.length + 1);
    expect(g.has(grant('employees', 'salaries'))).toBe(true);
    // An explicit list without it does not.
    expect(rootGrantsFrom(false, ['employees'], { employees: ['view', 'edit'] }).has(grant('employees', 'salaries'))).toBe(false);
  });

  it('[SPEC 1.3] ⭐ شاشةٌ مسموحة بلا تفصيل أفعال ⇒ **كل** أفعالها لا صفر', () => {
    // الفخّ: قراءةٌ ساذجة لـ`screenActions` تُنتج مجموعةً فارغة لقالبٍ
    // يملك كل شيء على الشاشة — فيرى الموظف شاشته بلا زرّ واحد.
    const g = rootGrantsFrom(false, ['contracts'], null);
    expect(g.size).toBe(SCREEN_ACTIONS.length);
    for (const a of SCREEN_ACTIONS) expect(g.has(grant('contracts', a))).toBe(true);
  });

  it('[SPEC 1.3] التفصيل الصريح يضيّق إلى ما فيه وحده', () => {
    const g = rootGrantsFrom(false, ['contracts'], { contracts: ['view', 'add'] });
    expect([...g].sort()).toEqual(['contracts:add', 'contracts:view']);
  });

  it('[SPEC 1.3] ⭐ لا تخترع زوجاً ترفضه `isActionAllowed` — ولا تُسقط زوجاً تقبله', () => {
    // الحارس العكسي للاشتقاق نفسه: تُقارَن المجموعة كاملةً بالدالة التي
    // يستدعيها `tenant.guard.ts`. أي انحرافٍ بينهما يسقط هنا.
    const cases: [boolean, string[], Record<string, any> | null][] = [
      [true, [], null],
      [false, [], null],
      [false, ['contracts', 'pos'], null],
      [false, ['contracts', 'pos'], { contracts: ['view'] }],
      [false, ['contracts'], { pos: ['view'] }],
      [false, ['employees'], { employees: ['view', 'salaries'] }],
    ];
    for (const [all, screens, actions] of cases) {
      const derived = rootGrantsFrom(all, screens, actions as any);
      for (const s of ALLOWED_SCREENS) {
        for (const a of ALL_ACTIONS) {
          expect(derived.has(grant(s, a))).toBe(isActionAllowed(all, screens, actions as any, s, a));
        }
      }
    }
  });
});

describe('الحالة الثالثة — مُنحت وانطفأت، بسببها', () => {
  const root = rootGrantsFrom(false, ['contracts'], { contracts: ['view', 'add', 'edit'] });

  it('النافذ يُفصَل عن المنطفئ', () => {
    const chain = [
      link('owner', 'mgr', ['contracts:view', 'contracts:add'] as Grant[]),
      link('mgr', 'emp', ['contracts:view', 'contracts:edit'] as Grant[]),
    ];
    const { active, extinguished } = splitLastLink(root, chain);
    expect(active).toEqual(['contracts:view']);
    expect(extinguished.map((e) => e.grant)).toEqual(['contracts:edit']);
  });

  it('⭐ السبب `NARROWED` يشير إلى الحلقة الضيّقة — لا إلى المفوِّض المباشر', () => {
    // المدير منح `edit`؛ المالك لم يمنحها للمدير. العطب فوق المفوِّض
    // المباشر، واتّهامُه يرسل المُصلِح إلى المكان الخطأ.
    const chain = [
      link('owner', 'mgr', ['contracts:view'] as Grant[]),
      link('mgr', 'emp', ['contracts:view', 'contracts:edit'] as Grant[]),
    ];
    const [e] = splitLastLink(root, chain).extinguished;
    expect(e.reason).toBe('NARROWED');
    expect(e.atIndex).toBe(0);
    expect(e.grantorId).toBe('owner');
  });

  it('⭐ حلقتان تنقصهما الصلاحية ⇒ **أعلاهما** هي السبب', () => {
    // الحالة التي تفرّق بين الاتجاهين: بحثٌ من الورقة صعوداً يقف عند
    // «mgr» فيرسل المُصلِح إليه — بينما توسيعُ mgr لا يغيّر شيئاً، لأن
    // «owner» فوقه لا يملكها أصلاً. والتقاطع لا يُنمّي: ما انطفأ عند
    // حلقةٍ لا يعود بعدها.
    const chain = [
      link('owner', 'mgr', ['contracts:view'] as Grant[]),
      link('mgr', 'sup', ['contracts:view'] as Grant[]),
      link('sup', 'emp', ['contracts:view', 'contracts:edit'] as Grant[]),
    ];
    const [e] = splitLastLink(root, chain).extinguished;
    expect(e.atIndex).toBe(0);
    expect(e.grantorId).toBe('owner');
  });

  it('السبب `REVOKED` حين تُسحب حلقةٌ أعلى', () => {
    const chain = [
      link('owner', 'mgr', ['contracts:view', 'contracts:edit'] as Grant[], true),
      link('mgr', 'emp', ['contracts:view'] as Grant[]),
    ];
    const [e] = splitLastLink(root, chain).extinguished;
    expect(e.reason).toBe('REVOKED');
    expect(e.grantorId).toBe('owner');
  });

  it('السبب `NOT_IN_ROOT` حين يتقلّص القالب نفسه', () => {
    const narrow = rootGrantsFrom(false, ['contracts'], { contracts: ['view'] });
    const chain = [link('owner', 'emp', ['contracts:view', 'contracts:edit'] as Grant[])];
    const [e] = splitLastLink(narrow, chain).extinguished;
    expect(e.reason).toBe('NOT_IN_ROOT');
    expect(e.atIndex).toBe(-1);
    expect(e.grantorId).toBeNull();
  });

  it('⭐ ما لم يُمنح أصلاً ليس منطفئاً — ولا يظهر في القائمتين', () => {
    // خلطُهما يجعل كل ما لا يملكه أحدٌ يبدو مسحوباً منه: 167 زوجاً
    // «منطفئاً» على شاشةٍ واحدة ممنوحة.
    const chain = [link('owner', 'emp', ['contracts:view'] as Grant[])];
    const { active, extinguished } = splitLastLink(root, chain);
    expect(active.length + extinguished.length).toBe(1);
  });

  it('ما يجوز منحه = ما يملكه المفوِّض، والجذر بلا سلسلة يملك قالبه', () => {
    expect(grantableBy(root, []).size).toBe(3);
    const chain = [link('owner', 'mgr', ['contracts:view'] as Grant[])];
    expect([...grantableBy(root, chain)]).toEqual(['contracts:view']);
  });
});

describe('السلاسل تُطوى من الصفوف الخام', () => {
  it('سلسلةٌ بسيطة تُبنى من الجذر إلى الورقة', () => {
    const rows = [row('owner', 'mgr', ['contracts:view']), row('mgr', 'emp', ['contracts:view'])];
    const [path] = chainsFor(rows, 'emp');
    expect(path.map((l) => `${l.grantorId}→${l.granteeId}`)).toEqual(['owner→mgr', 'mgr→emp']);
  });

  it('فاعلٌ بلا تفويض ⇒ لا مسارات (صلاحياته من قالبه وحده)', () => {
    expect(chainsFor([row('owner', 'mgr', ['contracts:view'])], 'emp')).toEqual([]);
  });

  it('⭐ مفوِّضان لموظفٍ واحد ⇒ مساران، والنافذ اتحادهما', () => {
    // لا قيد فرادةٍ على `granteeId` في المخطط. وأخذ «الأول» يُسقط صلاحيةً
    // فُوّضت فعلاً — بلا رسالة.
    const rows = [row('a', 'emp', ['contracts:view']), row('b', 'emp', ['contracts:add'])];
    const paths = chainsFor(rows, 'emp');
    expect(paths).toHaveLength(2);
    const union = new Set(paths.flatMap((p) => [...p[p.length - 1].granted]));
    expect([...union].sort()).toEqual(['contracts:add', 'contracts:view']);
  });

  it('⭐ صفّان على نفس الحافة ⇒ حلقةٌ واحدة بمنحتين مجموعتين', () => {
    const rows = [row('owner', 'emp', ['contracts:view']), row('owner', 'emp', ['pos:view'])];
    const [path] = chainsFor(rows, 'emp');
    expect(path).toHaveLength(1);
    expect([...path[0].granted].sort()).toEqual(['contracts:view', 'pos:view']);
  });

  it('⭐ سحبُ أحد صفّي الحافة يضيّق ولا يقطع', () => {
    const rows = [row('owner', 'emp', ['contracts:view']), row('owner', 'emp', ['pos:view'], 'REVOKED')];
    const [path] = chainsFor(rows, 'emp');
    expect(path[0].revoked).toBe(false);
    expect([...path[0].granted]).toEqual(['contracts:view']);
  });

  it('سحبُ كلّ صفوف الحافة يجعلها مسحوبة', () => {
    const rows = [row('owner', 'emp', ['contracts:view'], 'REVOKED')];
    expect(chainsFor(rows, 'emp')[0][0].revoked).toBe(true);
  });

  it('⭐ `SEALED` ليست نافذة — منتصف السحب لا يمنح', () => {
    const rows = [row('owner', 'emp', ['contracts:view'], 'SEALED')];
    const [path] = chainsFor(rows, 'emp');
    expect(path[0].revoked).toBe(true);
    expect(path[0].granted.size).toBe(0);
  });

  it('⭐ دورةٌ في البيانات لا تُعلّق الطلب', () => {
    // `cycles.ts` يمنع خلقها، لكن حارساً يتّكئ على حارسٍ آخر ليس حارساً.
    const rows = [row('a', 'b', ['contracts:view']), row('b', 'a', ['contracts:view'])];
    expect(() => chainsFor(rows, 'b')).not.toThrow();
  });

  it('⭐ تجاوز الحدّ يرمي ولا يقتطع صامتاً', () => {
    // شجرةٌ ثنائية التفرّع صعوداً: 2^n مساراً. الاقتطاع ينتج مجموعةً
    // ناقصة تبدو كاملة — والرفض يُقرأ بينما النقص يُطاع.
    const rows: DelegationRow[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 2; j++) rows.push(row(`n${i + 1}_${j}`, i === 0 ? 'emp' : `n${i}_0`, ['contracts:view']));
      for (let j = 0; j < 2; j++) rows.push(row(`n${i + 1}_${j}`, `n${i}_1`, ['contracts:view']));
    }
    expect(() => chainsFor(rows, 'emp')).toThrow(new RegExp(String(MAX_PATHS)));
  });

  it('الحواف النافذة وحدها تُقيّد الدورات', () => {
    const rows = [row('a', 'b', ['contracts:view']), row('b', 'c', ['contracts:view'], 'REVOKED')];
    expect(liveEdges(rows)).toEqual([{ grantorId: 'a', granteeId: 'b' }]);
  });
});

describe('الشرط ①: تُحسب حيّاً — ولا تُذكَّر مؤقتاً', () => {
  const service = readFileSync(join(__dirname, 'permissions.service.ts'), 'utf8');
  // ⚠️ **كان مُجرِّداً يدويّاً ثامناً وفيه عطلُ `ق-٣٣١`**: نمطُ التعليق السطريّ
  //    بدأ بـ`^` ثم `\s` مكرّرة، **وهي تبتلع السطر الجديد** — **فتُلتهم الأسطرُ
  //    الفارغة قبل كل تعليق ويُزاح كلُّ ما بعدها**. والنمطُ أدناه **مربوطٌ ببداية
  //    السطر** (`^\s{2}`)، فإزاحةُ الأسطر تغيّر ما يُطابَق. **فصار من المصدر الواحد.**
  //
  // ⚠️ **والصنفُ ثالثٌ لا أوّل**: توكيدٌ هنا يبحث عن `delegation_logs` — **اسمُ
  //    جدولٍ داخل قالبِ `SQL` نصّيّ**. **فتجريدُ النصوص محاه وأسقط الحارس** حين
  //    جُرِّب أوّلاً. **فالتعليقاتُ تُجرَّد والنصوصُ تبقى** — وهو ما تُثبته
  //    الحالتان أدناه.
  const code = stripComments(service);

  it('⭐ لا حالةَ تعيش بين طلبين في الخدمة', () => {
    // `@Injectable()` في NestJS مفردةٌ افتراضياً: الكائن **واحد لكل التطبيق**.
    // فحقلٌ واحد يحمل نتيجة كافٍ ليصير ذاكرةً مؤقتة بعمر العملية — بلا انتهاء
    // صلاحية ولا إبطال. وأثرها: تفويضٌ يُسحب ويبقى نافذاً إلى إعادة التشغيل،
    // وهو `Absence of user session management` (الملحق 1، قرار ZATCA).
    const fields = [...code.matchAll(/^\s{2}(?:private|public|protected|readonly|static)[^(\n]*?(\w+)\s*[:=]/gm)].map((m) => m[1]);
    // المسموح: التبعيات المحقونة وحدها (وهي داخل `constructor(...)`).
    expect(fields).toEqual([]);
  });

  it('⭐ لا بدائيّات تخزينٍ مستوردة ولا مفردات تخبئة', () => {
    // ⚠️ `new Map` بلا قوس: الصياغة الأولى منعت `new Map(` فمرّ عليها
    // `new Map<string, MePermissions>()` — الوسيط النوعي يفصل الاسم عن قوسه.
    // ولم يسقط الكسر إلا بفحص الحقول أعلاه. مفردةٌ مقيَّدة بشكلها الحرفي
    // تحرس شكلاً واحداً لا فكرةً.
    for (const token of ['CacheModule', 'cacheManager', 'CACHE_MANAGER', '@Cacheable', 'memoize', 'setTimeout', 'new Map', 'new WeakMap']) {
      expect({ token, present: code.includes(token) }).toEqual({ token, present: false });
    }
  });

  it('⭐ القراءة تمرّ بسياق المستأجر — لا بـ`prisma` مباشرةً', () => {
    // `delegation_logs` عليه RLS. وقراءةٌ خارج السياق تعود **فارغةً بنجاح**:
    // «لا تفويض» و«لم أرَ شيئاً» يبدوان سواء. وقد أوقعنا هذا فعلاً.
    expect(code).toContain('runInTenantContext');
    expect(/this\.prisma\.\$queryRaw/.test(code)).toBe(false);
    // The query lives in one reader shared with the tenant guard; it runs on the transaction it is given.
    expect(/runInTenantContext\([^)]*\(tx\)\s*=>\s*readDelegationRows\(tx\)\)/.test(code)).toBe(true);
    const reader = stripComments(readFileSync(join(__dirname, 'chain-source.ts'), 'utf8'));
    const body = reader.slice(reader.indexOf('export function readDelegationRows('));
    expect(body.startsWith('export function readDelegationRows(tx: Prisma.TransactionClient)')).toBe(true);
    expect(/^\s*return tx\.\$queryRaw[^`]*`[^`]*FROM "delegation_logs"/.test(body.slice(body.indexOf('{') + 1))).toBe(true);
    expect(/PrismaService|this\./.test(reader)).toBe(false);
  });

  it('the tenant guard reads the delegation rows inside the tenant context on every request and keeps no state', () => {
    const guard = stripComments(readFileSync(join(__dirname, '..', 'common', 'tenant', 'tenant.guard.ts'), 'utf8'));
    const context = guard.indexOf('runInTenantContext(payload.companyId, async (tx) => [');
    expect(context).toBeGreaterThan(-1);
    const call = guard.slice(context, guard.indexOf('] as const)', context));
    expect(call).toContain('await readDelegationRows(tx)');
    expect(guard).toContain('delegatedTemplate(clipped, delegationChains)');
    const fields = [...guard.matchAll(/^\s{2}(?:private|public|protected|readonly|static)[^(\n]*?(\w+)\s*[:=]/gm)].map((m) => m[1]);
    expect(fields).toEqual([]);
    for (const token of ['CacheModule', 'cacheManager', 'CACHE_MANAGER', '@Cacheable', 'memoize', 'setTimeout', 'new Map', 'new WeakMap']) {
      expect({ token, present: guard.includes(token) }).toEqual({ token, present: false });
    }
  });
});
