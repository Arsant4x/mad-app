import { blindIndex, decryptBytes, decryptField, encryptBytes, encryptField, FieldCipherConfigError, fieldKeyIdOf, isEncryptedBytes } from './field-cipher.util';

/**
 * ⚖️ `ق-١٣٤٥` — **التشفيرُ في التطبيق**: المفتاحُ خارج القاعدة ومعرّفُه في كلِّ قيمة، والبصمةُ بمفتاحٍ منفصل.
 * وحدةٌ نقيّة — المفاتيحُ تُضبط هنا لا تُقرأ من بيئة التشغيل (فالحزمةُ تعمل في `api-unit` بلا أسرار).
 */
describe('تشفيرُ الحقول الحسّاسة في التطبيق (ق-١٣٤٥)', () => {
  const k = (byte: number) => Buffer.alloc(32, byte).toString('base64');
  const NAMES = ['PII_ENCRYPTION_KEYS', 'PII_ENCRYPTION_KEY_ID', 'PII_BLIND_INDEX_KEY'] as const;
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEYS = `u1:${k(1)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'u1';
    process.env.PII_BLIND_INDEX_KEY = `ub1:${k(2)}`;
  });
  afterAll(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  it('① ذهابٌ وإياب — والقيمةُ تحمل معرّفَ مفتاحها ولا تحمل النصَّ الصريح', () => {
    const stored = encryptField('1234567890', 'c1|employees.nationalId|e1');
    expect(stored).toMatch(/^f1:u1:/);
    expect(stored).not.toContain('1234567890');
    expect(fieldKeyIdOf(stored)).toBe('u1');
    expect(decryptField(stored, 'c1|employees.nationalId|e1')).toBe('1234567890');
  });

  it('② المربوطُ بموضعه لا يُفكّ في موضعٍ آخر — ولا بعد العبث', () => {
    const stored = encryptField('1234567890', 'c1|employees.nationalId|e1');
    expect(() => decryptField(stored, 'c1|employees.nationalId|e2')).toThrow();
    expect(() => decryptField(stored, 'c2|employees.nationalId|e1')).toThrow();
    const [f, id, iv, tag, data] = stored.split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptField([f, id, iv, tag, flipped.toString('base64url')].join(':'), 'c1|employees.nationalId|e1')).toThrow();
  });

  it('③ تدويرُ المفتاح: الجديدُ بمعرّفه والقديمُ يُقرأ بمعرّفه — وحذفُ مفتاحٍ ما زالت به قيمةٌ يُسمّى', () => {
    const old = encryptField('A', 'x');
    process.env.PII_ENCRYPTION_KEYS = `u1:${k(1)},u2:${k(3)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'u2';
    const fresh = encryptField('B', 'x');
    expect(fieldKeyIdOf(fresh)).toBe('u2');
    expect([decryptField(old, 'x'), decryptField(fresh, 'x')]).toEqual(['A', 'B']);
    process.env.PII_ENCRYPTION_KEYS = `u2:${k(3)}`;
    expect(() => decryptField(old, 'x')).toThrow(/«u1»/);
  });

  it('④ البصمةُ ثابتةٌ للقيمة نفسِها في المنشأة، ومختلفةٌ عبر المنشآت، ولا تحمل القيمة', () => {
    const a1 = blindIndex('1234567890', 'companyA');
    expect(a1).toBe(blindIndex('1234567890', 'companyA'));
    expect(a1).not.toBe(blindIndex('1234567890', 'companyB'));
    expect(a1).not.toBe(blindIndex('1234567891', 'companyA'));
    expect(a1).toMatch(/^b1:ub1:/);
    expect(a1).not.toContain('1234567890');
    // ومفتاحُها غيرُ مفتاح التشفير: تغييرُ حلقة التشفير لا يغيّرها.
    process.env.PII_ENCRYPTION_KEYS = `u9:${k(9)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'u9';
    expect(blindIndex('1234567890', 'companyA')).toBe(a1);
  });

  it('⑤ الإعدادُ الناقص يُرفض باسمه لا بقيمته — ولا مفتاحَ بطولٍ خاطئ', () => {
    delete process.env.PII_ENCRYPTION_KEYS;
    expect(() => encryptField('A', 'x')).toThrow(FieldCipherConfigError);
    process.env.PII_ENCRYPTION_KEYS = `u1:${Buffer.alloc(16, 1).toString('base64')}`;
    expect(() => encryptField('A', 'x')).toThrow(/٣٢ بايتاً/);
    process.env.PII_ENCRYPTION_KEYS = `u1:${k(1)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'nope';
    expect(() => encryptField('A', 'x')).toThrow(/ليس في الحلقة/);
    delete process.env.PII_BLIND_INDEX_KEY;
    expect(() => blindIndex('A', 'c')).toThrow(FieldCipherConfigError);
  });

  it('⑥ ق-١٣٦٥ غلافُ الملفّ: ذهابٌ وإيابٌ ثنائيّ، والبايتاتُ لا تحمل الأصل، والموضعُ مفتاحُ الكائن', () => {
    const plain = Buffer.from('%PDF-1.4 signed lease — عقد');
    const key = 'companies/c1/sensitive/abc-lease.pdf';
    const stored = encryptBytes(plain, key);
    expect(isEncryptedBytes(stored)).toBe(true);
    expect(isEncryptedBytes(plain)).toBe(false);
    expect(stored.includes(Buffer.from('signed lease'))).toBe(false);
    expect(decryptBytes(stored, key).equals(plain)).toBe(true);
    // نسخُ الكائن إلى مفتاحٍ آخر يفشل فكُّه — ولا يُقرأ مرفقاً لعقدٍ آخر.
    expect(() => decryptBytes(stored, 'companies/c2/sensitive/abc-lease.pdf')).toThrow();
    // والعبثُ ببايتٍ واحد يفشل.
    const tampered = Buffer.from(stored);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBytes(tampered, key)).toThrow();
  });

  it('⑦ ق-١٣٦٥ الغلافُ يحمل معرّفَ مفتاحه — فالتدويرُ إضافةٌ لا إعادةُ تشفير، وحذفُ مفتاحٍ به ملفٌّ يُسمّى', () => {
    const old = encryptBytes(Buffer.from('A'), 'k');
    process.env.PII_ENCRYPTION_KEYS = `u1:${k(1)},u2:${k(3)}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'u2';
    const fresh = encryptBytes(Buffer.from('B'), 'k');
    expect([decryptBytes(old, 'k').toString(), decryptBytes(fresh, 'k').toString()]).toEqual(['A', 'B']);
    process.env.PII_ENCRYPTION_KEYS = `u2:${k(3)}`;
    expect(() => decryptBytes(old, 'k')).toThrow(/«u1»/);
    expect(() => decryptBytes(Buffer.from('plain'), 'k')).toThrow(/mfb1/);
  });
});
