import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `ق-١٩٦` — حارسٌ يقرأ المصدر على القرارات الأربعة للختم المتزامن:
 *
 * ١. سقوطُ الختم لا يُسقط البيع — `stampForReceipt` يلتقط ولا يرمي.
 * ٢. القياسية خارج النطاق — تُصفّى قبل الختم.
 * ٣. مستندٌ محفوظ **لا يُوقَّع ثانيةً** — يُعاد المحفوظ قبل أي ادّعاء.
 * ٤. قبل الإرسال تُعاد التجزئةُ من المخزون ويُتحقَّق التوقيع — **قبل** `fetch`.
 *
 * كلُّها سهلةُ الزوال في تحريرٍ بريء: `try` يُحذف تنظيفاً، أو فحصٌ يُنقل بعد الإرسال
 * «لأنه أبطأ». فالحارس يسقط بالاسم حين يقع ذلك.
 */
describe('الختم المتزامن — قرارات ق-١٩٦ في المصدر', () => {
  const service = readFileSync(join(__dirname, 'zatca.service.ts'), 'utf8');
  const pos = readFileSync(join(__dirname, '..', 'pos', 'pos.service.ts'), 'utf8');

  it('🔴 ١ — stampForReceipt يلتقط الخطأ ويعيد سبباً، ولا يرمي', () => {
    expect(service.length).toBeGreaterThan(5000);
    const start = service.indexOf('async stampForReceipt(');
    const end = service.indexOf('private async requireOnboarded(', start);
    const body = service.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/catch \(e\)/);
    expect(body).toContain('return { qrPayload: null, error: message }');
  });

  it('🔴 ٢ — القياسية تُصفّى قبل الختم في مسار الإيصال', () => {
    const start = service.indexOf('async stampForReceipt(');
    const body = service.slice(start, service.indexOf('private async requireOnboarded(', start));
    expect(body).toContain("invoiceTypeFor(buyer.customer.vatNumber) === 'standard'");
  });

  it('🔴 ٣ — المختومُ يُعاد محفوظُه قبل أي ادّعاء، والمردودُ لا يُوقَّع ثانيةً إلا إن تغيّر محتواه', () => {
    const start = service.indexOf('private async stampIfNeeded(');
    const claim = service.indexOf('retryOnUniqueConflict(', start);
    const reuse = service.indexOf("if (existing.zatcaStatus === 'STAMPED') return { qrPayload: existing.zatcaQrPayload }", start);
    const probe = service.indexOf('if (invoiceHashOfUnsigned(probe.xml) === existing.zatcaHash) return', start);
    expect(reuse).toBeGreaterThan(start);
    expect(probe).toBeGreaterThan(reuse);
    expect(claim).toBeGreaterThan(probe);
  });

  it('🔴 ٤ — التجزئةُ من المخزون والتوقيعُ يُفحصان قبل fetch في الإبلاغ', () => {
    const start = service.indexOf('private async report(');
    const hash = service.indexOf('invoiceHashOfSigned(stored.zatcaSignedXml)', start);
    const verify = service.indexOf('verifySignedInvoice(stored.zatcaSignedXml)', start);
    const send = service.indexOf('await fetch(', start);
    expect(hash).toBeGreaterThan(start);
    expect(verify).toBeGreaterThan(start);
    expect(send).toBeGreaterThan(hash);
    expect(send).toBeGreaterThan(verify);
  });

  it('🔴 والكاشير يستدعي الختم بعد معاملة البيع ويُبلّغ سببَ السقوط لا يبتلعه', () => {
    expect(pos).toContain('this.zatca.stampForReceipt(tenant.companyId, sold.id)');
    expect(pos).toContain('stampError: stamp.error');
  });
});
