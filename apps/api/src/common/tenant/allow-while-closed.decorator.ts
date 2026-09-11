import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_CLOSED_KEY = 'allowWhileClosed';

/**
 * الثقبُ الوحيد في إغلاق الحساب (`ق-٥٤٧` · `ق-٥٤٨`): منشأةٌ مغلقةٌ لا تصل إلا إلى
 * حالِ طلبها وطلبِ إعادة الفتح — **فالإغلاقُ استجابةُ طلبٍ لا عقوبة، ومن طلب قد يعود**.
 *
 * ولا يُوضَع إلا على مسار الطلب — لا على الاشتراك (فالمغلقُ لا يعود بالدفع) ولا على
 * أيّ قراءةٍ للبيانات (فالوصولُ مقطوع).
 */
export const AllowWhileClosed = () => SetMetadata(ALLOW_WHILE_CLOSED_KEY, true);
