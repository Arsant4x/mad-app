import { translateField } from './labelTable';

/**
 * The declared limits of the batch and expiry feature, shown where the merchant uses it.
 * The Arabic below is a word for word copy of `apps/api/src/common/batches/declared-limits.ts`,
 * checked by the server's `declared-limits.spec.ts`; the text shown comes from `common.batch_limits`.
 */
export const BATCH_FEFO_DECLARED_LIMITS: readonly string[] = [
  'حدٌّ معلَن ①: ما توجبه هيئةُ الغذاء والدواء على الصيدلية (نظامُ «رصد»: الترميزُ على العبوة وتوحيدُ الدفعات) قُرئت عناوينُه لا نصوصُه — فالدفعةُ هنا نواةُ مخزونٍ لا ملفَّ صيدلية.', // i18n-exempt: Arabic mirror compared with the server text
  'حدٌّ معلَن ②: لم تُعقد جلسةٌ ميدانية مع صيدليٍّ أو تاجرِ أغذية — فالصرفُ بالأقرب انتهاءً ورفضُ بيع المنتهي بُنيا على القاعدة لا على رفٍّ مشاهَد.', // i18n-exempt: Arabic mirror compared with the server text
  'حدٌّ معلَن ③: لا نموذجَ مرئيّاً أُقرّ قبل الشيفرة — فشكلُ هذه الشاشة يُراجَع لا يُقرأ نهائياً.', // i18n-exempt: Arabic mirror compared with the server text
  'حدٌّ معلَن ④: ما لا انتهاءَ له يُصرَف بعد ما له انتهاء — فالطبقةُ بلا دفعةٍ مجهولةُ الانتهاء لا قديمةٌ فحسب، ولا تُخمَّن دفعتُها.', // i18n-exempt: Arabic mirror compared with the server text
];
BATCH_FEFO_DECLARED_LIMITS.forEach((_, i) => translateField(BATCH_FEFO_DECLARED_LIMITS as string[], i, `common.batch_limits.limit_${i + 1}`));
