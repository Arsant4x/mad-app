import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ConsentService } from '../consent/consent.service';
import { readsDeclaredStrings } from './source-scan.util';
import { stripComments } from './source-scan.util';

// 🔴 **يقرأ المصدرَ لا نظيرَه** (`ق-٣٧٥`): شيفرةُ المتحكّمات والحارس نصّاً، **وبعد نزع
// التعليقات** — فعلامةٌ مذكورةٌ في تعليقٍ ليست علامةً موضوعة.
readsDeclaredStrings();

/**
 * **الشروطُ الأربعةُ لموافقة المعالجين الفرعيين — محروسةٌ لا موصوفة** (`ق-٥٨٩`).
 *
 * الحكمُ «اختيارٌ لا حجب» **يقوم على أربعةٍ، وسقوطُ واحدٍ منها يقلبه حجزاً**:
 *   ① **مهلةٌ ثلاثون يوماً على الأقلّ** — رقمٌ في الخدمة لا في الوثيقة.
 *   ② **تذكيرٌ متكرّرٌ بمراحل** — لا إشعارٌ واحدٌ عند النشر.
 *   ③ **الشاشةُ ثلاثةُ أزرار** — قبولٌ وتنزيلٌ وإغلاق.
 *   ④ **ومنفذُ الخروج لا يُغلق** — التصديرُ والإغلاقُ والإشعاراتُ معلَّمةٌ بالثقب.
 *
 * ⚠️ **ولماذا حارسٌ على هذا بعينه**: الشروطُ الأربعةُ **ليست سلوكاً يظهر في حزمة** — حزمةُ
 * التكامل تقيس المنعَ والقبول، **وهذه تمنع أن يُنزع أحدُ الأربعة لاحقاً بسطرٍ واحد**
 * فيبقى البناءُ عاملاً والحكمُ منقوضاً.
 */
const SRC = join(__dirname, '..');
const read = (...p: string[]) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

const SERVICE = read('consent', 'consent.service.ts');
const GUARD = read('common', 'tenant', 'tenant.guard.ts');
const WEB = join(SRC, '..', '..', 'web', 'src');

describe('موافقةُ المعالجين الفرعيين — أربعةُ شروطٍ محروسة (ق-٥٨٩)', () => {
  it('⓪ حارسٌ على المجسّ: الملفّاتُ قُرئت فعلاً وبعد نزع التعليقات', () => {
    expect(SERVICE.length).toBeGreaterThan(1000);
    expect(GUARD.length).toBeGreaterThan(1000);
    // لو بقيت التعليقات لَمرّت العلاماتُ المذكورةُ فيها — والمجسُّ يُصادَق بحالةٍ تعرف نتيجتَها.
    expect(SERVICE).not.toContain('ق-٥٨٩');
  });

  /** ① المهلةُ **رقمٌ في الخدمة**، وما دونها يُرفض — ولا تُخفَّض تحت الشهر. */
  it('① مهلةُ الإشعار ثلاثون يوماً على الأقلّ، وتُرفض ما دونها', () => {
    expect(ConsentService.NOTICE_DAYS).toBeGreaterThanOrEqual(30);
    expect(SERVICE).toContain('NOTICE_DAYS');
    expect(SERVICE).toContain('consent_notice_too_short');
    // والرفضُ قبل أيّ إنشاء — فنسخةٌ تُخلق ثم تُرفض تترك أثراً لا يُقرأ.
    const publishAt = SERVICE.indexOf('async publishVersion');
    expect(SERVICE.indexOf('consent_notice_too_short', publishAt)).toBeLessThan(SERVICE.indexOf('subProcessorListVersion.create', publishAt));
  });

  /** ② التذكيرُ متكرّرٌ بمراحلَ معلومة، ومجدوَلٌ لا يدويّ. */
  it('② التذكيرُ متكرّرٌ بمراحله ومجدوَل', () => {
    expect(SERVICE).toContain('@Cron');
    expect(SERVICE).toContain('async remind');
    // ثلاثُ مراحلَ قبل السريان، وتكرارٌ بعده — مقروءةٌ من الشيفرة لا من الوصف.
    expect(SERVICE).toContain('daysLeft === 14');
    expect(SERVICE).toContain('daysLeft === 7');
    expect(SERVICE).toContain('daysLeft === 1');
    expect(SERVICE).toContain('w+');
    // ولا تكرارَ مزدوج: المفتاحُ يحمل المرحلة، والقيدُ الفريد في القاعدة هو الضمانة.
    expect(SERVICE).toContain('dedupeKey: `subprocessor-v${version}-${stage}`');
  });

  /** ③ **ولا زرَّ واحدٌ في الشاشة**: ثلاثةٌ معاً — وإلا صارت حجباً. */
  it('③ شاشةُ الموافقة تعرض ثلاثةَ أفعالٍ لا واحداً', () => {
    const view = readFileSync(join(WEB, 'pages', 'subscription', 'ConsentRequiredView.tsx'), 'utf8');
    for (const action of ['أوافق على القائمة', 'نزّل بياناتي', 'أغلق حسابي']) expect(view).toContain(action);
    // والتنزيلُ مسارٌ يعمل لا وعدٌ: يستدعي التصديرَ نفسَه.
    expect(view).toContain('exportAllData');
    // والإغلاقُ ببطاقة الطلب نفسِها لا بنسخةٍ منها.
    expect(view).toContain('DeletionRequestCard');
  });

  /**
   * ④ **منفذُ الخروج لا يُغلق**: التصديرُ والإغلاقُ والإشعاراتُ ومسارُ الموافقة **معلَّمةٌ
   * بالثقب** — وبلا أحدها يصير المنعُ حجزاً. **والعلامةُ تُقرأ من المتحكّم لا من قائمة.**
   */
  it('④ منفذُ الخروج معلَّمٌ في مساراته الأربعة، والحارسُ يقرأ العلامة', () => {
    const marked = ['export/export.controller.ts', 'deletion-requests/deletion-requests.controller.ts', 'notifications/notifications.controller.ts', 'consent/consent.controller.ts'];
    for (const rel of marked) {
      const body = read(...rel.split('/'));
      expect(`${rel}:${body.includes('@AllowWhileConsentPending()')}`).toBe(`${rel}:true`);
    }
    expect(GUARD).toContain('ALLOW_WHILE_CONSENT_PENDING_KEY');
    expect(GUARD).toContain('ConsentRequiredException');
  });

  /**
   * ⚠️ **والبوّابةُ بعد المغلق عمداً**: المغلقُ لا يُسأل موافقةً على معالجةٍ لم تعد تقع له،
   * ورسالةُ الإغلاق أولى بالقراءة. **والترتيبُ يُقرأ من الشيفرة لا من النيّة.**
   */
  it('⑤ بوّابةُ الموافقة تقع بعد فحص الإغلاق وقبل فحص الإيقاف', () => {
    // ⚠️ **مواضعُ الاستعمال لا الاستيراد**: اسمُ الرمز يظهر أوّلاً في سطر الاستيراد أعلى
    //    الملفّ — فقياسُ الترتيب به يقيس ترتيبَ الاستيرادات لا ترتيبَ الفحوص. (وقع فعلاً.)
    const closed = GUARD.indexOf("company.status === 'CLOSED'");
    const consent = GUARD.indexOf('throw new ConsentRequiredException');
    const stopped = GUARD.indexOf("evaluated.status === 'STOPPED'");
    expect(closed).toBeGreaterThan(0);
    expect(consent).toBeGreaterThan(closed);
    expect(stopped).toBeGreaterThan(consent);
  });

  /**
   * ⚠️ **والقبولُ يُكتب تحت سياق المنشأة**: جدولُه تحت `FORCE` — وكتابةٌ بلا سياقٍ تُردّ،
   * **وقراءةٌ بلا سياقٍ تعود صفراً بلا خطأ** (`ق-٢٦٢`). وقد وقع الأوّلُ فعلاً في أوّل تشغيل.
   */
  it('⑥ القبولُ يُكتب تحت سياق المنشأة، والعدُّ العابرُ يُقرأ ممّا لا عزلَ عليه', () => {
    const acceptAt = SERVICE.indexOf('async accept');
    const ctxAt = SERVICE.indexOf('runInTenantContext', acceptAt);
    const createAt = SERVICE.indexOf('processingAgreementAcceptance.create', acceptAt);
    expect(ctxAt).toBeGreaterThan(0);
    expect(createAt).toBeGreaterThan(ctxAt);
    // والعدُّ لكلِّ نسخة يُقرأ من `companies` (بلا عزل) لا من جدول القبول.
    const countsAt = SERVICE.indexOf('async acceptanceCounts');
    expect(SERVICE.slice(countsAt, countsAt + 400)).toContain('company.groupBy');
  });

  /** ⑦ ولا نموذجَ مستأجرٍ يُضاف بلا عزل: جدولُ القبول في قائمة النماذج المعزولة وله سياسةٌ في هجرته. */
  it('⑦ جدولُ القبول معزولٌ بالطبقتين', () => {
    expect(read('common', 'tenant', 'tenant-scope.extension.ts')).toContain("'ProcessingAgreementAcceptance'");
    const dir = join(SRC, '..', 'prisma', 'migrations');
    const sql = readdirSync(dir)
      .filter((d) => d.includes('subprocessor_consent'))
      .map((d) => readFileSync(join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('tenant_isolation_processing_agreement_acceptances');
  });
});
