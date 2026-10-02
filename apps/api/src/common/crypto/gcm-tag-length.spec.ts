import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { decryptCredentials, encryptCredentials } from '../../integrations/credentials.crypto';
import { sourceFiles, stripCommentsAndStrings } from '../source-scan.util';
import { decryptBytes, decryptField, encryptBytes, encryptField } from './field-cipher.util';
import { decryptSecret, encryptSecret } from './secret.util';

/**
 * ⚖️ **وسمُ التحقّق في `AES-256-GCM` يُفكّ بطوله الكامل وحدَه** (توجيه ٢٧٥ · `ق-١٥٨٦`، بحكم صاحب المشروع: «وطولُ وسم التحقق في
 * فكّ التشفير»).
 *
 * `createDecipheriv` بلا `authTagLength` يقبل وسماً من أربعة بايتاتٍ فأكثر، ويتحقّق بما وصله وحدَه: فقيمةٌ مخزّنةٌ يُقصّ وسمُها إلى
 * أوّل أربعة بايتاتٍ تُفكّ كما هي، ومن يزوّر نصّاً يكفيه أن يصيب اثنين وثلاثين بتّاً لا مئةً وثمانيةً وعشرين. والقيمُ التي نكتبها
 * وسمُها ستّةَ عشرَ بايتاً دائماً، فما سواه لا يكون إلا عبثاً. وحدةٌ نقيّة: المفاتيحُ تُضبط هنا ولا تُقرأ من بيئة التشغيل.
 */
describe('وسمُ التحقّق يُفكّ بطوله الكامل وحدَه (ق-١٥٨٦)', () => {
  const k = (byte: number) => Buffer.alloc(32, byte).toString('base64');
  const NAMES = ['PII_ENCRYPTION_KEYS', 'PII_ENCRYPTION_KEY_ID', 'PII_BLIND_INDEX_KEY', 'SECRETS_ENCRYPTION_KEY', 'INTEGRATIONS_ENC_KEY'] as const;
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEYS = `t1:${k(7)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 't1';
    process.env.PII_BLIND_INDEX_KEY = `tb1:${k(8)}`;
    process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(40);
    process.env.INTEGRATIONS_ENC_KEY = 'b'.repeat(40);
  });
  afterAll(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  /** يقصّ الوسمَ (الجزءَ رقم `at` بعد الفصل) إلى أوّل أربعة بايتات ويعيد القيمة. */
  const truncateTag = (stored: string, separator: string, at: number, encoding: BufferEncoding) => {
    const parts = stored.split(separator);
    const tag = Buffer.from(parts[at], encoding);
    // مجسٌّ للمجسّ: الوسمُ الذي نكتبه ستّةَ عشرَ بايتاً، والمقصوصُ أربعة — وإلا فالحالةُ لا تختبر شيئاً.
    expect(tag.length).toBe(16);
    parts[at] = tag.subarray(0, 4).toString(encoding);
    return parts.join(separator);
  };

  it('🔴 ① سرُّ المنشأة (`v1:iv:tag:data`): القيمةُ كما هي تُفكّ، والمقصوصُ وسمُها يُرفض', () => {
    const stored = encryptSecret('مفتاحُ واجهةٍ سرّيّ');
    expect(decryptSecret(stored)).toBe('مفتاحُ واجهةٍ سرّيّ');
    expect(() => decryptSecret(truncateTag(stored, ':', 2, 'base64'))).toThrow();
  });

  it('🔴 ② الحقلُ الحسّاس (`f1:id:iv:tag:data`): القيمةُ كما هي تُفكّ، والمقصوصُ وسمُها يُرفض', () => {
    const stored = encryptField('1234567890', 'c1|employees.nationalId|e1');
    expect(decryptField(stored, 'c1|employees.nationalId|e1')).toBe('1234567890');
    expect(() => decryptField(truncateTag(stored, ':', 3, 'base64url'), 'c1|employees.nationalId|e1')).toThrow();
  });

  it('🔴 ③ اعتمادُ المزوّد (`iv.tag.data`): القيمةُ كما هي تُفكّ، والمقصوصُ وسمُها يُرفض', () => {
    const stored = encryptCredentials({ apiKey: 'sk-test-123456' });
    expect(decryptCredentials(stored)).toEqual({ apiKey: 'sk-test-123456' });
    expect(() => decryptCredentials(truncateTag(stored, '.', 1, 'base64'))).toThrow();
  });

  it('④ والغلافُ الثنائيّ (`mfb1`) يقرأ وسمَه بطولٍ ثابت أصلاً: المقصوصُ يُرفض — ضابطٌ قائمٌ لا إصلاح', () => {
    const plain = Buffer.from('مرفقُ عقد');
    const stored = encryptBytes(plain, 'contracts/a.pdf');
    expect(decryptBytes(stored, 'contracts/a.pdf').equals(plain)).toBe(true);
    // الوسمُ بعد البصمة (٤) وطول المعرّف (١) والمعرّف و`iv` (١٢): يُحذف منه اثنا عشر بايتاً فيبقى أربعة.
    const tagAt = 4 + 1 + stored[4] + 12;
    const cut = Buffer.concat([stored.subarray(0, tagAt + 4), stored.subarray(tagAt + 16)]);
    expect(() => decryptBytes(cut, 'contracts/a.pdf')).toThrow();
  });

  /**
   * **والقاعدةُ بوّابةٌ لا تذكير** (القاعدة ٢٧): كلُّ فكٍّ في الخادم يمرّ بالمدخل الواحد `gcmDecipher` — فموضعٌ خامسٌ يُكتب
   * بـ`createDecipheriv` مباشرةً يُسقط الحزمة. ويقرأ الشيفرةَ بلا تعليقاتها ونصوصها، ويُثبت أنه يرى: الملفاتُ المقروءةُ كثيرة،
   * والمدخلُ الواحد نفسُه يحمل النداء.
   */
  it('⑤ لا `createDecipheriv` في الخادم إلا داخل المدخل الواحد', () => {
    const SRC = join(__dirname, '..', '..');
    const files = sourceFiles(SRC);
    const calls = files
      .filter((f) => /(?<![.\w])createDecipheriv\s*\(/.test(stripCommentsAndStrings(readFileSync(f, 'utf8'))))
      .map((f) => relative(SRC, f).split(sep).join('/'));
    expect(files.length).toBeGreaterThan(100);
    expect(calls).toEqual(['common/crypto/gcm.util.ts']);
  });
});
