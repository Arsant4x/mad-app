import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CERT_EXPIRY_WARN_DAYS, certificateNotAfter, daysUntil } from './certificate-expiry.util';
import { zatcaWarningsOf } from './authority-warnings.util';

/**
 * حزمةُ ز — وحداتُها (`ق-١٢٧٩`).
 *
 * ⑤A1: نهايةُ الصلاحية **تُقرأ من شهادةٍ حقيقية** تُولَّد هنا بـ`openssl` — لا من نصٍّ مكتوبٍ
 * يدوياً يشبه الشهادة. فالدالّةُ تُختبر بما ستقرؤه فعلاً، بالشكلين اللذين قد تصل بهما
 * (`PEM` · و`base64` لجسم `DER` كما ترسله الهيئة في `binarySecurityToken`).
 *
 * ⑤A2: التحذيراتُ تُقرأ من شكل الجواب كما توثّقه الهيئة، **وما لا يُعرف شكلُه يُسلسَل ولا يُهمَل**.
 */
describe('حزمةُ ز — انتهاءُ الشهادة وتحذيراتُ الهيئة (وحدات)', () => {
  describe('⑤A1 نهايةُ صلاحية الشهادة', () => {
    let dir: string;
    let pem: string;
    let hasOpenssl = true;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'cert-'));
      try {
        execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '40', '-subj', '/CN=mad-app-test', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'pipe' });
        pem = require('node:fs').readFileSync(join(dir, 'c.pem'), 'utf8') as string;
      } catch {
        hasOpenssl = false;
      }
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('⓪ حارسٌ على المجسّ: الشهادةُ وُلدت فعلاً — وإلا لم يُفحص شيء', () => {
      // ⚠️ لا `return` صامت (`ق-٢٦٨`): غيابُ `openssl` **يُعلَن سقوطاً** لا يُبتلَع.
      expect(hasOpenssl).toBe(true);
      expect(pem).toContain('BEGIN CERTIFICATE');
    });

    it('⭐ يقرأ `notAfter` من نصّ `PEM`', () => {
      const at = certificateNotAfter(pem);
      expect(at).toBeInstanceOf(Date);
      const left = daysUntil(at!, new Date());
      // وُلدت بأربعين يوماً — فالباقي بينها وبين تسعةٍ وثلاثين.
      expect(left).toBeGreaterThanOrEqual(39);
      expect(left).toBeLessThanOrEqual(40);
    });

    it('⭐ ويقرؤه من `base64` لجسم `DER` — وهو ما ترسله الهيئة (`binarySecurityToken`)', () => {
      const der = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
      const at = certificateNotAfter(der);
      expect(at).toBeInstanceOf(Date);
      expect(at!.toISOString()).toBe(certificateNotAfter(pem)!.toISOString());
    });

    it('ويقرؤه من `base64` لنصّ `PEM` كامل — الشكلُ الثالث الذي قد يصل', () => {
      const wrapped = Buffer.from(pem, 'utf8').toString('base64');
      expect(certificateNotAfter(wrapped)?.toISOString()).toBe(certificateNotAfter(pem)!.toISOString());
    });

    it('ونصٌّ ليس شهادةً يعود `null` — مراقبةٌ لا تُسقط إصداراً', () => {
      expect(certificateNotAfter('')).toBeNull();
      expect(certificateNotAfter('ليس شهادة')).toBeNull();
      expect(certificateNotAfter(Buffer.from('hello world').toString('base64'))).toBeNull();
    });

    it('والنافذةُ ثلاثون يوماً، والانتهاءُ يُعطي عدداً سالباً', () => {
      expect(CERT_EXPIRY_WARN_DAYS).toBe(30);
      const now = new Date('2026-09-22T00:00:00Z');
      expect(daysUntil(new Date('2026-10-22T00:00:00Z'), now)).toBe(30);
      expect(daysUntil(new Date('2026-09-12T00:00:00Z'), now)).toBe(-10);
    });
  });

  describe('⑤A2 تحذيراتُ الهيئة', () => {
    it('⭐ تُقرأ من `validationResults` بشكلها الموثَّق — رمزاً ونصّاً ودرجة', () => {
      const out = zatcaWarningsOf({
        validationResults: {
          warningMessages: [{ type: 'WARNING', code: 'BR-KSA-11', category: 'KSA', message: 'PIH mismatch' }],
          errorMessages: [],
        },
      });
      expect(out).toEqual([{ code: 'BR-KSA-11', message: 'PIH mismatch', severity: 'WARNING' }]);
    });

    it('⭐ وما لا يُعرف شكلُه يُسلسَل ولا يُهمَل — فلا يضيع جوابٌ لم نتوقّعه', () => {
      const out = zatcaWarningsOf({ validationResults: { warningMessages: [{ unexpected: 'شكلٌ آخر' }] } });
      expect(out).toHaveLength(1);
      expect(out![0].message).toContain('شكلٌ آخر');
      expect(out![0].severity).toBe('WARNING');
    });

    it('والنصُّ المجرَّد يُقبل، والرسائلُ الخطأُ تُصنَّف `ERROR`', () => {
      const out = zatcaWarningsOf({ validationResults: { warningMessages: ['تحذيرٌ نصّيّ'], errorMessages: ['خطأٌ نصّيّ'] } });
      expect(out).toEqual([
        { code: '', message: 'تحذيرٌ نصّيّ', severity: 'WARNING' },
        { code: '', message: 'خطأٌ نصّيّ', severity: 'ERROR' },
      ]);
    });

    it('وجوابٌ بلا `validationResults` يعود `null` — فلا يُمحى ما حُفظ بجوابٍ لا يحمل غيرَه', () => {
      expect(zatcaWarningsOf({})).toBeNull();
      expect(zatcaWarningsOf({ validationResults: {} })).toBeNull();
      expect(zatcaWarningsOf({ validationResults: { warningMessages: [] } })).toBeNull();
      expect(zatcaWarningsOf({ validationResults: 'نصّ' })).toBeNull();
    });
  });
});
