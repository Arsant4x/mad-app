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
    // ②A1: النوعُ من صفة المشتري ورقمِه معاً — يُمرَّر المشتري لا رقمُه؛ ⑤A3: والسطورُ معه (الصادراتُ كاملةٌ ولو لفرد).
    expect(body).toContain("invoiceTypeFor(buyer.customer, buyer.lines) === 'standard'");
  });

  it('🔴 ٣ — المردودُ يُرفض باسمه قبل أي ادّعاء، والمختومُ يُعاد محفوظُه قبل الادّعاء — ولا توقيعَ ثانياً لمردود (ق-٩٦٤)', () => {
    const start = service.indexOf('private async stampIfNeeded(');
    const end = service.indexOf('private async claimAndBuild(', start);
    const body = service.slice(start, end);
    const claim = body.indexOf('retryOnUniqueConflict(');
    const refuse = body.indexOf("if (existing.zatcaStatus === 'REJECTED') throw new BadRequestException(MSG.zatca_rejected_not_resubmittable)");
    const reuse = body.indexOf("if (existing.zatcaStatus === 'STAMPED' && existing.zatcaSignedXml && existing.zatcaQrPayload && existing.zatcaHash)");
    expect(refuse).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(refuse);
    expect(claim).toBeGreaterThan(reuse);
    // ولا مسبارَ يعيد بناءَ المردود ليوقّعه على موقعه — ذهب مع التعديل الذي كان يُجيزه.
    expect(body).not.toContain("'probe'");
    // والادّعاءُ لا يجد المردودة: القائمةُ بلا `REJECTED`.
    const claimWhere = service.slice(end);
    expect(claimWhere).toContain("{ zatcaStatus: 'NOT_SUBMITTED' }");
    expect(claimWhere).not.toContain("in: ['NOT_SUBMITTED', 'REJECTED']");
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
