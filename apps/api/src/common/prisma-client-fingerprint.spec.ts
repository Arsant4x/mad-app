import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { clientDrift, clientModels, schemaModels } from '../../test/prisma-client-fingerprint';

/**
 * **بصمةُ عميل Prisma — مُثبَتةٌ في الاتجاهين** (`ق-٤١٧` · `ق-٤١٨`).
 *
 * ⚠️ **والصياغةُ منقولةٌ عن المخطّط الحقيقيّ لا مؤلَّفة** (`ق-٤١٨`): **العيّنةُ
 * المؤلَّفة أنظفُ من الواقع فتُخفي ما يكسره** — **وقد وقع ذلك في اليوم نفسه**:
 * عادُّ بلاغاتٍ مرّ بخمس حالاتٍ مصنوعة **وهو أعمى**، لأن أُطُرَه لم تحمل السطرَ
 * الذي يبدأ به الأثرُ الحقيقيّ. **فالمقاطعُ هنا مقتطعةٌ من `schema.prisma`.**
 */
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

describe('بصمةُ العميل — تُدين النقصَ وتترك الزيادة', () => {
  it('🔴 حقلٌ في المخطّط لا يعرفه العميل يُدان **باسمه**', () => {
    // ⚠️ **مقطعٌ منقولٌ عن المخطّط** — بترتيبه ومسافاته كما هي.
    const real = ['model Company {', '  id                   String  @id @default(uuid())', '  creditLimitHardBlock Boolean @default(false)', '}'].join('\n');
    const schema = schemaModels(real);
    const client = new Map([['Company', new Set(['id'])]]);
    // **الاسمُ يُقرأ من المخرَج** — فبلاغٌ يقول «تفاوت» لا يُنهي البحث.
    expect(clientDrift(schema, client)).toEqual(['Company.creditLimitHardBlock']);
  });

  it('🔴 ونموذجٌ كاملٌ لا يعرفه العميل يُدان باسمه', () => {
    const schema = schemaModels(['model Invoice {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map())).toEqual(['Invoice']);
  });

  it('🔴 والزيادةُ تُترك — فعميلٌ أحدثُ لا يُسقط فرعاً سليماً', () => {
    // **الاتجاهُ واحدٌ عمداً**: حقلٌ ناقصٌ يكسر، وزائدٌ لا يكسر — **وإدانةُ
    //  الاتجاهين تُسقط الحزمةَ على فرعٍ سليمٍ متأخّر**، وهو ضجيجٌ يُعطَّل.
    const schema = schemaModels(['model Company {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map([['Company', new Set(['id', 'fieldFromANewerBranch'])]]))).toEqual([]);
  });

  it('🔴 والتعليقاتُ لا تُقرأ حقولاً — وإلا أدان المخطّطَ بشرحه', () => {
    // ⚠️ **الصياغةُ الواقعية**: تعليقُ `///` فوق الحقل، وهو النمطُ الغالب هنا.
    const real = ['model Company {', '  /// حدُّ الائتمان — شرحٌ لا حقل', '  id String @id', '}'].join('\n');
    expect(schemaModels(real).get('Company')).toEqual(new Set(['id']));
  });

  it('⭐ والشجرةُ كما هي: العميلُ يعرف كلَّ ما يعلنه المخطّط', () => {
    // **وهذه هي الحالةُ السالبة على الواقع**: لو أدانت شيئاً هنا لكان الحارسُ
    // نفسُه معطوباً — **فخضرتُها شرطُ تصديقِ حمرتِها**.
    expect(clientDrift(schemaModels(SCHEMA), clientModels(Prisma.dmmf))).toEqual([]);
  });

  it('🔬 وكلفتُه مقيسةٌ لا مقدَّرة — مرّةً لكل عملية jest', () => {
    // ⚠️ **شرطُ المالك ③**: «مرّةً لكل عملية jest — وقد صارت أربعاً بالتشريح».
    const t0 = process.hrtime.bigint();
    clientDrift(schemaModels(readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8')), clientModels(Prisma.dmmf));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`\n▶ كلفةُ البصمة: ${ms.toFixed(1)} م.ث لكل عملية · ${(ms * 4).toFixed(1)} م.ث لأربع شرائح\n`);
    // **حدٌّ مُعلَن**: عُشرُ ثانيةٍ سقفٌ سخيٌّ لقراءةِ ملفٍّ ومرورٍ على نماذج.
    expect(ms).toBeLessThan(100);
  });
});
