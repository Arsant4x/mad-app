import { callSiteOf, nestedTransactionReports, resetNestedTransactionReports, withTransactionProbe } from './nested-transaction-probe';

/**
 * **كاشفُ المعاملة المتداخلة — مُثبَتٌ بحالاته** (`ق-٣٦٢` · `ق-٣٩٢`).
 *
 * ⚠️ **والشرطُ السادس هو مناطُ أخطر توكيدٍ هنا**: **المفتاحُ من إطارِ النداء لا
 * من إطار الكاشف** — **وإلا صار واحداً للجميع، فبُلِّغ عن موضعٍ وأُخفي الباقي**،
 * **وهو عمىً يبدو نجاحاً** (بلاغٌ واحدٌ يُقرأ «موضعٌ واحد»).
 */
describe('كاشفُ المعاملة المتداخلة — يُبلّغ ولا يُسقط', () => {
  beforeEach(() => resetNestedTransactionReports());

  it('🔴 معاملةٌ وحدها لا تُبلّغ — فلا ضجيجَ على المسار السليم', async () => {
    await withTransactionProbe(async () => 'ok');
    expect(nestedTransactionReports()).toEqual([]);
  });

  it('🔴 ومعاملةٌ داخل معاملة تُبلّغ ولا تُسقط', async () => {
    const value = await withTransactionProbe(async () => withTransactionProbe(async () => 'ok'));
    // **لا تُسقط**: القيمةُ تعود كما هي — فالقياسُ يسبق المنع (`ق-٣٩٢`②).
    expect(value).toBe('ok');
    expect(nestedTransactionReports()).toHaveLength(1);
  });

  it('🔴 ونداءان من موضعين يُبلَّغ عنهما مرّتين لا مرّة — الشرط السادس', async () => {
    // ⚠️ **الإثباتُ العكسيّ الذي طلبه المالك**: لو أُخذ المفتاحُ من إطار
    //    الكاشف لكان **واحداً للجميع** — فيُبلَّغ عن موضعٍ ويُخفى الثاني.
    const siteA = async () => withTransactionProbe(async () => 'a');
    const siteB = async () => withTransactionProbe(async () => 'b');

    await withTransactionProbe(async () => {
      await siteA();
      await siteB();
    });

    expect(nestedTransactionReports()).toHaveLength(2);
  });

  it('🔴 والموضعُ نفسُه مرّتين يُبلَّغ عنه مرّةً — فلا يُغرق السجلّ', async () => {
    const sameSite = async () => withTransactionProbe(async () => 'x');
    await withTransactionProbe(async () => {
      await sameSite();
      await sameSite();
      await sameSite();
    });
    expect(nestedTransactionReports()).toHaveLength(1);
  });

  it('🔴 والمفتاحُ يتخطّى إطاراتِ الكاشف وخدمته — لا يقف عند أوّلها', () => {
    // **الصياغةُ الواقعية** لأثرٍ فيه إطارُ الكاشف أولاً ثم موضعُ النداء.
    const stack = [
      'Error',
      '    at withTransactionProbe (D:\\mad-app\\apps\\api\\src\\common\\tenant\\nested-transaction-probe.ts:80:20)',
      '    at TenantPrismaService.runInTenantContext (D:\\mad-app\\apps\\api\\src\\common\\tenant\\tenant-prisma.service.ts:51:12)',
      '    at InvoicesService.zatcaQrFor (D:\\mad-app\\apps\\api\\src\\invoices\\invoices.service.ts:682:21)',
    ].join('\n');
    expect(callSiteOf(stack)).toContain('zatcaQrFor');

    // 🔴 **والحالةُ التي تُثبت أنه لا يقف عند إطارٍ ليس منها**: أثرٌ بلا
    //    إطارات الكاشف يعيد أوّلَه.
    const plain = ['Error', '    at PosService.ring (D:\\mad-app\\apps\\api\\src\\pos\\pos.service.ts:472:18)'].join('\n');
    expect(callSiteOf(plain)).toContain('PosService.ring');
  });
});
