import { join } from 'path';
import * as ts from 'typescript';
import {
  columnMismatches,
  columnMismatchesIn,
  exportedLiteralUnions,
  namedTypeValues,
  parsePrisma,
  readPrisma,
  readRegistry,
  REPO_ROOT,
  sameSet,
  serverValues,
  sourceOf,
  typeValues,
  webApiFiles,
  webValues,
} from './web-enum-mirrors.util';

/**
 * 🔴 `ق-١٣٦٧` — **تعداداتُ الواجهة تُقارَن بمقابلاتها كلِّها، وبأعمدتها** (الشرحُ الكامل في `web-enum-mirrors.util.ts`).
 *
 * بنصّ المالك: «**والحارسُ يقارن التعداداتِ الخمسةَ والسبعين كلَّها لا واحداً.**» — والخمسةُ والسبعون صارت ثمانيةً وسبعين:
 * كلٌّ من الثلاثة الأضيق قُسم نوعين — **عمودٌ** تعرف الشاشةُ قيمَه كلَّها، و**حدُّ إدخالٍ** يطابق ما يقبله الخادم.
 */

const registry = readRegistry();
const prisma = readPrisma();
const files = webApiFiles();

/** عيّناتُ المسبار تُبنى بدالّةٍ لا تُكتب حرفياً (`§4` — حارسُ الوسوم أمسك عيّناتِه مرّتين). */
const quoted = (...xs: string[]) => xs.map((x) => `'${x}'`).join(' | ');
const fixture = (text: string, name = join(REPO_ROOT, 'fixture.ts')) => sourceOf(name, text);
const aliasType = (sf: ts.SourceFile, name: string) =>
  sf.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name)!.type;

describe('⓪ المسبار يرى — مُصادَقٌ بحالتين قبل الوثوق بأيّ صفر', () => {
  it('قارئُ Prisma: التعدادُ بقيمه والتعليقاتُ لا تُقرأ قيماً · والحقلُ بنوعه', () => {
    const shape = parsePrisma(['/// تعليقُ رأس', 'enum Kind {', '  A', '  /// شرحُ الثانية', '  B @map("b")', '}', 'model Thing {', '  id String @id', '  kind Kind @default(A)', '  kinds Kind[]', '  maybe Kind?', '  @@map("things")', '}'].join('\n'));
    expect(shape.enums.get('Kind')).toEqual(['A', 'B']);
    expect(shape.models.get('Thing')?.get('kind')).toBe('Kind');
    expect(shape.models.get('Thing')?.get('maybe')).toBe('Kind');
  });

  it('قارئُ الأنواع: اتّحادٌ بلا null · Exclude · (typeof X)[number] — و`string` ليس تعداداً', () => {
    const sf = fixture(
      [
        `export type A = ${quoted('x', 'y')} | null;`,
        `export type B = Exclude<A, ${quoted('y')}>;`,
        `const ARR = [${['p', 'q'].map((v) => `'${v}'`).join(', ')}] as const;`,
        'export type C = (typeof ARR)[number];',
        'export type D = string;',
      ].join('\n'),
    );
    expect(typeValues(sf, aliasType(sf, 'A'))).toEqual(['x', 'y']);
    expect(typeValues(sf, aliasType(sf, 'B'))).toEqual(['x']);
    expect(typeValues(sf, aliasType(sf, 'C'))).toEqual(['p', 'q']);
    expect(typeValues(sf, aliasType(sf, 'D'))).toBeNull();
  });

  it('⭐ وإعادةُ التصدير من الحزمة المشتركة تُحلّ من مصدرها في هذه الشجرة (`ق-١٣٨٤`) — موجبٌ وسالب', () => {
    const sf = fixture(
      [
        "import type { AccountType } from '@mad-app/shared/api/enums';",
        'export type { AccountType };',
        "export type { StockStatus } from '@mad-app/shared/api/enums';",
        "export type { Nope } from '@mad-app/shared/api/nope';",
      ].join('\n'),
    );
    // موجبان: استيرادٌ ثم تصديرٌ محلّيّ · وإعادةُ تصديرٍ مباشرة — كلاهما يبلغ الثابتَ المولَّد بقيمه، وهي قيمُ مقابله في الخادم.
    const account = registry.mirrors.find((m) => m.web.endsWith('#AccountType'))!;
    expect(namedTypeValues(sf, 'AccountType')).toEqual(serverValues(account.server, prisma));
    expect(namedTypeValues(sf, 'StockStatus')?.length).toBeGreaterThan(0);
    // وسالب: مسارٌ لا تعلنه `exports` في `packages/shared/package.json` لا يُحلّ — فلا يُقرأ صفرٌ قيمةً.
    expect(namedTypeValues(sf, 'Nope')).toBeNull();
    // والسطحُ يعدّ التصديرَ المحلّيَّ للمستورَد (شكلُ الشجرة بعد التوليد) — فلا يخرج تعدادٌ من التغطية (①) لأنه صار مولَّداً.
    expect([...exportedLiteralUnions(join(REPO_ROOT, 'apps/web/src/api/accounts.ts'), REPO_ROOT, prisma).keys()]).toContain('apps/web/src/api/accounts.ts#AccountType');
  });

  it('فحصُ العمود يمسك القاصرَ ويترك التامّ — بحالتين معلومتين، وبالدالّة نفسِها التي تفحص الشجرة', () => {
    const shape = parsePrisma(['enum Way {', ...['CASH', 'BANK', 'CARD'].map((v) => `  ${v}`), '}', 'model Pay {', '  way Way', '}'].join('\n'));
    const short = fixture(`export interface Pay { way: ${quoted('CASH', 'BANK')}; }`, join(REPO_ROOT, 'short.ts'));
    const full = fixture(`export interface Pay { way: ${quoted('CASH', 'BANK', 'CARD')} | null; }`, join(REPO_ROOT, 'full.ts'));
    const caught = columnMismatchesIn(shape, [short]);
    expect(caught.checked).toEqual(['short.ts#Pay.way']);
    expect(caught.mismatches.map((x) => x.missing)).toEqual([['CARD']]);
    const passed = columnMismatchesIn(shape, [full]);
    expect(passed.checked).toEqual(['full.ts#Pay.way']);
    expect(passed.mismatches).toEqual([]);
  });

  it('وعلى الشجرة: حادثةُ `PARTIAL` مرئيةٌ من الطرفين، والسطحُ غيرُ فارغ', () => {
    expect(prisma.enums.get('InvoiceStatus')).toContain('PARTIAL');
    expect(webValues('apps/web/src/api/invoices.ts#InvoiceStatus', REPO_ROOT, prisma)).toContain('PARTIAL');
    expect(registry.mirrors.length).toBeGreaterThanOrEqual(78);
    expect(files.length).toBeGreaterThanOrEqual(50);
    const col = columnMismatches(prisma, files);
    expect(col.checked.length).toBeGreaterThanOrEqual(40);
  });
});

describe('① التغطية — كلُّ تعدادٍ في الواجهة مسجَّلٌ بمقابله، ولا مرجعَ متقادم', () => {
  it('كلُّ اتّحادٍ حرفيٍّ مصدَّرٍ في apps/web/src/api مسجَّلٌ أو معلَنٌ «للواجهة وحدَها» بسببه', () => {
    const registered = new Set([...registry.mirrors.map((m) => m.web), ...registry.webOnly.map((w) => w.web)]);
    const unions = new Map<string, string[]>();
    for (const f of files) for (const [k, v] of exportedLiteralUnions(f, REPO_ROOT, prisma)) unions.set(k, v);
    // الحدُّ الأدنى للسطح — مقيسٌ لا مقدَّر: `75` مدخلاً من السجلّ داخل `apps/web/src/api` ناقصاً `ZatcaInvoiceStatus` الذي صار يُستورد
    // من وحدته المولَّدة ولا يُعاد تصديرُه من ملفّ الفواتير العامّ (`ق-١٣٨٤` — حدُّ الوحدة `ق-١٣٥٠`)؛ ومدخلُه في السجلّ يُحلّ بالاستيراد.
    expect(unions.size).toBeGreaterThanOrEqual(74);
    const unregistered = [...unions.keys()].filter((k) => !registered.has(k));
    expect(unregistered).toEqual([]);
  });

  it('ولكلِّ ما في «للواجهة وحدَها» سببٌ مكتوب', () => {
    expect(registry.webOnly.filter((w) => !w.reason || w.reason.trim().length < 10)).toEqual([]);
  });

  it('وكلُّ مرجعٍ في السجلّ يُحلّ في الطرفين — فالسجلُّ لا يتقادم صامتاً', () => {
    const stale = registry.mirrors.filter((m) => !webValues(m.web, REPO_ROOT, prisma) || !serverValues(m.server, prisma)).map((m) => `${m.web} ⟵ ${m.server}`);
    expect(stale).toEqual([]);
  });
});

describe('② التطابق — قيمُ كلِّ تعدادٍ = قيمُ مقابله', () => {
  it('الثمانيةُ والسبعون كلُّها', () => {
    const differ = registry.mirrors
      .map((m) => ({ m, w: webValues(m.web, REPO_ROOT, prisma) ?? [], s: serverValues(m.server, prisma) ?? [] }))
      .filter(({ w, s }) => !sameSet(w, s))
      .map(({ m, w, s }) => `${m.web} [${w.join('|')}] ≠ ${m.server} [${s.join('|')}]`);
    expect(differ).toEqual([]);
  });
});

describe('③ العمود — الشاشةُ تعرف كلَّ قيمةٍ يحملها عمودُها', () => {
  it('كلُّ واجهةٍ باسم نموذجٍ في Prisma: حقلُها التعداديُّ يعرف قيمَه كلَّها', () => {
    const { mismatches } = columnMismatches(prisma, files);
    expect(mismatches.map((x) => `${x.where} ⟵ ${x.prismaEnum} ينقصه ${x.missing.join(',')}`)).toEqual([]);
  });
});
