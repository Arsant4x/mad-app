import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripCommentsAndStrings } from './source-scan.util';

/**
 * **`company_users` و`company_user_branches` لا يُنادَيان إلا تحت سياق المنشأة**
 * (`ق-٦٥٧` · المرحلة ① من إغلاق العائق).
 *
 * ── لماذا ─────────────────────────────────────────────────────────────────
 *
 * الجدولان بلا `RLS` اليوم، **وكانا يُقرآن بلا سياقٍ من ثلاثة عشر موضعاً**
 * (الحارس · خدمة الحسابات الفرعية · القوالب · المهامّ · التفويض · الصلاحيات).
 * وإغلاقُهما (المرحلة ④) **يكسر كلَّ موضعٍ بلا سياق**: القراءةُ تعود فارغةً
 * بنجاح — **وأسوأُها قراءةُ الحارس لفروع الموظّف**: فارغةٌ ⇒ «بلا تضييق» ⇒
 * الموظّفُ المضيَّقُ يرى كلَّ الفروع.
 *
 * القياسُ الحيّ (2026-09-12): تحت طُعم `FORCE` + سياسةٍ على جدول الفروع كانت
 * **٩ من ٢٠** في `branches.e2e` حمراء («new row violates row-level security
 * policy») **وبعد النقل خضراءُ كلُّها** — بلا سياسةٍ باقية.
 *
 * ── ما يحرسه ──────────────────────────────────────────────────────────────
 *
 * نداءُ مندوبِ `companyUser` أو `companyUserBranch` **على غير `tx`** — أي على
 * عميلٍ خامٍ (`this.prisma` · `prisma` · `client` …) — **مخالفةٌ**، إلا ما أُعلن
 * هنا بحجّته. **والمُعلَنُ مُسنَّن**: إن زال من الشيفرة سقط الحارسُ حتى يُحذف.
 *
 * ── حدُّه المعلَن ─────────────────────────────────────────────────────────
 *
 * يرى **نداءَ المندوب** (`x.companyUser.findMany(`) لا **التضمينَ** داخل
 * استعلامٍ آخر (`include: { companyUser: … }` في `auth.service.ts` — وهي مواضعُ
 * «تسجيلٌ قبل مستأجر» الأربعة، **والمرحلةُ ② تحسمها بقرار المالك لا هنا**).
 * ويرى `tx` بالاسم: مُعاملةٌ سُمّيت غيرَه تُقرأ خاماً وتُعلَن — **لا يُوسَّع
 * الاسمُ ليمرّ**.
 */
const SRC = join(__dirname, '..');
const API = join(SRC, '..');

const MODELS = ['companyUser', 'companyUserBranch'] as const;
const OPS = ['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert', 'aggregate', 'groupBy'] as const;

export interface RawCall {
  line: number;
  receiver: string;
  model: string;
  op: string;
}

/** نداءاتُ المندوبَين على غير `tx` — من الكود لا من النصوص والتعليقات. */
export function rawCompanyUserCalls(source: string): RawCall[] {
  const code = stripCommentsAndStrings(source);
  const re = new RegExp(`([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\.(${MODELS.join('|')})\\.(${OPS.join('|')})\\s*\\(`, 'g');
  const out: RawCall[] = [];
  for (const m of code.matchAll(re)) {
    const receiver = m[1];
    if (receiver.split('.').pop() === 'tx') continue;
    out.push({ line: code.slice(0, m.index).split('\n').length, receiver, model: m[2], op: m[3] });
  }
  return out;
}

/** المُعلَن بحجّته — كلُّ سطرٍ هنا موضعٌ قائمٌ يُقرأ خاماً عمداً. */
const DECLARED: { file: string; receiver: string; model: string; op: string; why: string }[] = [
  // كان هنا موضعٌ واحد: عدُّ الحسابات الراكبة على قالبٍ عامٍّ عند حذفه (`templates.service.ts`)
  // بالعميل الخام — وخرج في المرحلة ③ (`ق-٦٧٥`): صار يُعدّ **بمسنَد الإدارة** (`runAsPlatformAdmin`)
  // فيرى كلَّ المنشآت اليومَ، ويبقى صادقاً يوم يُغلق `company_users` في ④ بسياسةٍ تقرأ المسنَد.
];

describe('حارس المرحلة ① — company_users وcompany_user_branches تحت سياق المنشأة', () => {
  it('الكاشف يرى النداءَ على العميل الخام ولا يرى نداءَ tx ولا نصّاً يذكره', () => {
    const raw = ['async f() {', '  const u = await this.prisma.companyUser.findMany({ where: { companyId } });', '  await prisma.companyUserBranch.deleteMany({ where: { companyUserId } });', '}'].join('\n');
    expect(rawCompanyUserCalls(raw)).toEqual([
      { line: 2, receiver: 'this.prisma', model: 'companyUser', op: 'findMany' },
      { line: 3, receiver: 'prisma', model: 'companyUserBranch', op: 'deleteMany' },
    ]);

    const scoped = ['this.tenantPrisma.runInTenantContext(companyId, (tx) =>', '  tx.companyUser.findMany({ where: { companyId } }),', ');', "const note = 'this.prisma.companyUser.findMany(';", '// this.prisma.companyUserBranch.createMany('].join('\n');
    expect(rawCompanyUserCalls(scoped)).toEqual([]);
  });

  it('🔴 لا نداءَ خاماً في src إلا المُعلَن — والمُعلَنُ قائمٌ فعلاً', () => {
    const found: { file: string; call: RawCall }[] = [];
    for (const f of sourceFiles(SRC)) {
      const file = relative(API, f).split('\\').join('/');
      for (const call of rawCompanyUserCalls(readFileSync(f, 'utf8'))) found.push({ file, call });
    }
    const isDeclared = (x: { file: string; call: RawCall }) => DECLARED.some((d) => d.file === x.file && d.receiver === x.call.receiver && d.model === x.call.model && d.op === x.call.op);

    const offences = found.filter((x) => !isDeclared(x)).map((x) => `${x.file}:${x.call.line} ${x.call.receiver}.${x.call.model}.${x.call.op}(`);
    expect(offences).toEqual([]);

    // ⚠️ المُعلَنُ مُسنَّن: إعلانٌ لموضعٍ زال يبقى كذباً في الملفّ حتى يُحذف.
    const stale = DECLARED.filter((d) => !found.some((x) => x.file === d.file && x.call.receiver === d.receiver && x.call.model === d.model && x.call.op === d.op)).map((d) => `${d.file} ${d.receiver}.${d.model}.${d.op}`);
    expect(stale).toEqual([]);
  });
});
