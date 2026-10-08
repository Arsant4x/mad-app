import { Prisma } from '@mad-app/db';
import { decryptField } from '../common/crypto/field-cipher.util';
import { CUSTOMER_PUBLIC_SELECT, CUSTOMER_SECRET_FIELDS, customerOtherIdAad, customerOtherIdData, normalizeOtherId, publicCustomer } from './customer-identity.util';

/**
 * ⚖️ توجيه ٢٨٦ — المعرّفُ البديل مشفَّرٌ، وأعمدةُ العميل في الردود قائمةُ سماحٍ **مشتقّةٌ من المخطَّط**.
 *
 * ① كلُّ عمودٍ عدديٍّ أو نصّيٍّ في `Customer` إمّا في `CUSTOMER_PUBLIC_SELECT` وإمّا سرٌّ مسمّى — فعمودٌ يُضاف غداً يُسقط
 *    الحزمةَ حتى يُقرَّر: يخرج مع الفاتورة والعرض والإيصال أم لا. والسرُّ ليس في الاختيار قطّ.
 * ② الكتابةُ تشفّر بموضع الصفّ وتطبّع الشخصيَّ، والصفُّ العامّ بلا نصٍّ مشفَّرٍ ولا بصمة.
 */
describe('معرّفُ العميل البديل — قائمةُ السماح مشتقّةٌ من المخطَّط، والكتابةُ مشفَّرة (توجيه ٢٨٦)', () => {
  const ENV = { ...process.env };
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEYS = `test1:${Buffer.alloc(32, 1).toString('base64')}`;
    process.env.PII_ENCRYPTION_KEY_ID = 'test1';
    process.env.PII_BLIND_INDEX_KEY = `tb1:${Buffer.alloc(32, 2).toString('base64')}`;
  });
  afterAll(() => {
    process.env = ENV;
  });

  it('⭐ ① كلُّ عمودٍ في العميل: يخرج أو سرٌّ مسمّى — لا ثالث، والسرُّ لا يخرج', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Customer');
    // مصادقةُ المسبار: النموذجُ قُرئ وفيه عمودٌ معروف.
    expect(model?.fields.map((f) => f.name)).toContain('vatNumber');
    const scalars = model!.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name);
    const secrets = new Set<string>(CUSTOMER_SECRET_FIELDS);
    const undecided = scalars.filter((n) => !(n in CUSTOMER_PUBLIC_SELECT) && !secrets.has(n));
    expect(undecided).toEqual([]);
    expect(Object.keys(CUSTOMER_PUBLIC_SELECT).filter((k) => secrets.has(k))).toEqual([]);
    // ولا عمودَ صريحاً للرقم عاد إلى المخطَّط.
    expect(scalars).not.toContain('otherId');
    for (const s of CUSTOMER_SECRET_FIELDS) expect(scalars).toContain(s);
  });

  it('② الكتابةُ تشفّر بموضع الصفّ وتطبّع الشخصيَّ — والتجاريُّ كما أُرسل', () => {
    const data = customerOtherIdData('c1', 'cust1', { scheme: 'PAS', id: 'ab12345' });
    expect(data.otherIdScheme).toBe('PAS');
    expect(data.otherIdCipher).toMatch(/^f1:test1:/);
    expect(data.otherIdIndex).toMatch(/^b1:tb1:/);
    expect(decryptField(data.otherIdCipher!, customerOtherIdAad('c1', 'cust1'))).toBe('AB12345');
    expect(() => decryptField(data.otherIdCipher!, customerOtherIdAad('c1', 'cust2'))).toThrow();
    expect(normalizeOtherId('CRN', ' 1010101010 ')).toBe('1010101010');
    expect(normalizeOtherId('TIN', 'ae123')).toBe('ae123');
    expect(() => normalizeOtherId('OTH', '12-34')).toThrow();
    // البصمةُ بلا فرقٍ بين حالتَي الحرف.
    expect(customerOtherIdData('c1', 'x', { scheme: 'TIN', id: 'ae123' }).otherIdIndex).toBe(customerOtherIdData('c1', 'y', { scheme: 'TIN', id: 'AE123' }).otherIdIndex);
    expect(customerOtherIdData('c1', 'cust1', null)).toEqual({ otherIdScheme: null, otherIdCipher: null, otherIdIndex: null });
  });

  it('③ الصفُّ العامّ بلا نصٍّ مشفَّرٍ ولا بصمة، وعلامةُ الوجود وحدَها', () => {
    const row = { id: 'x', name: 'ع', otherIdScheme: 'NAT', otherIdCipher: 'f1:test1:a:b:c', otherIdIndex: 'b1:tb1:z' };
    const out = publicCustomer(row);
    expect(out).toEqual({ id: 'x', name: 'ع', otherIdScheme: 'NAT', otherIdOnFile: true });
    expect(publicCustomer({ ...row, otherIdCipher: null, otherIdIndex: null }).otherIdOnFile).toBe(false);
  });
});
