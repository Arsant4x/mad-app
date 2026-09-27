import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { PlatformDecisionAction } from '@mad-app/db';
import { sourceFiles, stripComments } from '../common/source-scan.util';
import { PLATFORM_ACTION_LABEL } from './platform-decisions.service';

/**
 * **كلُّ فعلٍ حرجٍ مُعلَنٍ له مستهلكٌ أو إعلانُ غياب** (`ق-١٣١٨` · ⑪A1).
 *
 * التعدادُ يسمّي ثلاثةً من نصّ المسح، **وواحدٌ منها بلا مسارٍ في المنتج** (`REFUND`) —
 * فيُعلَن غيابُه هنا بالاسم. **والحارسُ يمسك الاتجاهين**: فعلٌ يُضاف بلا مستهلكٍ ولا
 * إعلان، **وفعلٌ أُعلن غيابُه ثم بُني مسارُه ولم يُشطب من قائمة الغياب** — فتبقى القائمةُ
 * تكذب.
 */
const SRC = join(__dirname, '..');

/**
 * **أفعالٌ لا مسارَ لها بعد — تنقص ولا تزيد.**
 *
 * `REFUND`: **لا مسارَ ردِّ مالٍ في المنتج** (ملفُّ الدفع لم يُبنَ — `§9-د`). فالقيمةُ
 * معلَنةٌ في التعداد كي **يُحرَس أوّلُ مسارٍ يُبنى لها**، ولا يُدَّعى أنها محروسةٌ اليوم.
 */
export const ACTIONS_WITHOUT_PATH: readonly PlatformDecisionAction[] = ['REFUND'];

/** من يستهلك فعلاً حرجاً في الشيفرة — بحثاً عن اسم القيمة في نداء الاستهلاك أو التحقّق. */
export function consumersOf(files: readonly { path: string; source: string }[], action: string): string[] {
  const pattern = new RegExp(`(consume|consumeWithinTx|assertApproved)\\s*\\([^)]*['"]${action}['"]`);
  return files.filter((f) => pattern.test(stripComments(f.source))).map((f) => f.path);
}

describe('الفعلُ الحرجُ بيدين — كتالوجُ الأفعال ومستهلكوها (ق-١٣١٨ · ⑪A1)', () => {
  const files = sourceFiles(SRC)
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
    .map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), source: readFileSync(p, 'utf8') }));

  it('⓪ السطحُ غيرُ فارغ — والخدمةُ نفسُها فيه', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.path === 'platform/platform-decisions.service.ts')).toBe(true);
  });

  it('⭐ ① كلُّ قيمةٍ في التعداد لها تسميةٌ عربية — فرسالةُ الرفض تقول ما ينقص', () => {
    for (const action of Object.values(PlatformDecisionAction)) {
      expect(PLATFORM_ACTION_LABEL[action]).toBeTruthy();
    }
  });

  it('🔴 ② كلُّ فعلٍ إمّا له مستهلكٌ في الشيفرة أو مُعلَنٌ أنه بلا مسار', () => {
    const undeclared = Object.values(PlatformDecisionAction).filter(
      (action) => consumersOf(files, action).length === 0 && !ACTIONS_WITHOUT_PATH.includes(action),
    );
    expect(undeclared).toEqual([]);
  });

  it('🔴 ③ ومُعلَنُ الغياب لا مستهلكَ له — وإلا فالقائمةُ تكذب', () => {
    const lying = ACTIONS_WITHOUT_PATH.filter((action) => consumersOf(files, action).length > 0);
    expect(lying).toEqual([]);
  });

  it('④ والمسارانِ الحرجان مربوطان فعلاً — لا اسمٌ في تعدادٍ بلا نداء', () => {
    expect(consumersOf(files, 'ACCOUNT_ERASURE')).toContain('deletion-requests/deletion-requests.service.ts');
    expect(consumersOf(files, 'SUBSCRIPTION_CHANGE')).toContain('companies/companies.service.ts');
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالتَين على نصٍّ مصنوعٍ هنا', () => {
    const consuming = { path: 'x/a.service.ts', source: "await this.decisions.consume('REFUND', id);" };
    expect(consumersOf([consuming], 'REFUND')).toEqual(['x/a.service.ts']);

    const other = { path: 'x/b.service.ts', source: "await this.decisions.consume('ACCOUNT_ERASURE', id);" };
    expect(consumersOf([other], 'REFUND')).toEqual([]);

    // ⚠️ وذِكرٌ في تعليقٍ ليس نداءً (`§8.24`) — وإلا أدان الحارسُ توثيقَه.
    const inComment = { path: 'x/c.service.ts', source: "// مثال: this.decisions.consume('REFUND', id)" };
    expect(consumersOf([inComment], 'REFUND')).toEqual([]);
  });
});
