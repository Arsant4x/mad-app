import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripComments } from '../source-scan.util';

/**
 * **كلُّ مسارٍ منصّيّ يُعلن دورَه** (`ق-١٣١٢` · ⑪A2).
 *
 * ## العلّة، بنصّ المسح
 *
 * «دورٌ واحدٌ يرى كلَّ شيءٍ ويفعل كلَّ شيء: **أوّلُ موظفِ دعمٍ يُعيَّن يرث صلاحيةَ المالك —
 * وما رآه أو فعله لا يُستردّ**» (`docs/domain-scan/11-تشغيل-المنصة.md` · A2).
 *
 * فالحارسُ الحيّ يمنع **الدورَ الخطأ**، وهذا يمنع **الصمت**: متحكّمٌ منصّيٌّ جديد بلا
 * إعلانٍ كان سيُقرأ «للجميع» — **وهو الحالُ الذي بُني هذا البند لإنهائه**.
 *
 * ⚠️ **و`OWNER` لا يُكتب**: يمرّ بتعريفه، وكتابتُه في كلِّ مسارٍ ضجيجٌ يُنسى مرّةً فيُمنع
 * المالكُ من بابه.
 */
const SRC = join(__dirname, '..', '..');

/** متحكّماتٌ تستعمل حارسَ المنصّة **ولم تُعلن دورَها** — بأسمائها. */
export function platformRoutesWithoutRole(files: readonly { path: string; source: string }[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const code = stripComments(f.source);
    if (!/@UseGuards\([^)]*PlatformAdminGuard/.test(code)) continue;
    if (!/@RequiresPlatformRole\s*\(/.test(code)) out.push(f.path);
  }
  return out;
}

describe('كلُّ مسارٍ منصّيّ يُعلن دورَه (ق-١٣١٢ · ⑪A2)', () => {
  const files = sourceFiles(SRC)
    .filter((p) => p.endsWith('.controller.ts'))
    .map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), source: readFileSync(p, 'utf8') }));

  it('⓪ السطحُ غيرُ فارغ — والمتحكّماتُ المنصّيةُ الأربعةُ موجودةٌ فيه', () => {
    expect(files.length).toBeGreaterThan(40);
    const platform = files.filter((f) => /@UseGuards\([^)]*PlatformAdminGuard/.test(stripComments(f.source)));
    expect(platform.length).toBeGreaterThanOrEqual(4);
  });

  it('🔴 لا متحكّمَ منصّيٌّ بلا إعلانِ دور', () => {
    expect(platformRoutesWithoutRole(files)).toEqual([]);
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالتَين على نصٍّ مصنوعٍ هنا', () => {
    const silent = { path: 'x/silent.controller.ts', source: '@Controller("x")\n@UseGuards(JwtAuthGuard, PlatformAdminGuard)\nexport class X {}' };
    expect(platformRoutesWithoutRole([silent])).toEqual(['x/silent.controller.ts']);

    const declared = {
      path: 'x/declared.controller.ts',
      source: '@Controller("x")\n@UseGuards(JwtAuthGuard, PlatformAdminGuard)\n@RequiresPlatformRole(PlatformRole.SUPPORT)\nexport class X {}',
    };
    expect(platformRoutesWithoutRole([declared])).toEqual([]);

    // ومتحكّمُ مستأجرٍ ليس منصّياً — فلا يُطالَب بدور.
    const tenant = { path: 'x/tenant.controller.ts', source: '@Controller("x")\n@UseGuards(JwtAuthGuard, TenantGuard)\nexport class X {}' };
    expect(platformRoutesWithoutRole([tenant])).toEqual([]);

    // ⚠️ ونصٌّ في تعليقٍ ليس إعلاناً ولا خرقاً (`§8.24`) — وإلا أدان الحارسُ توثيقَه.
    const inComment = { path: 'x/doc.controller.ts', source: '// مثال: @UseGuards(JwtAuthGuard, PlatformAdminGuard) بلا دور\nexport class X {}' };
    expect(platformRoutesWithoutRole([inComment])).toEqual([]);
  });
});
