import { IsISO8601, IsOptional } from 'class-validator';

/**
 * **تغييرُ اشتراكِ منشأةٍ قائمة — للمالية وحدَها** (`ق-١٣١٧` · ⑪A2).
 *
 * **الاشتراكُ مالٌ يُحصَّل ويُردّ، والتشغيلُ يخصّ الخادمَ والنسخ لا المال** — **وفصلُ من
 * يلمس المالَ عمّن يلمس الخادم هو غرضُ الأدوار أصلاً**. ولذلك خرج الحقلان من
 * `UpdateCompanyDto` إلى مسارٍ بدوره: من أرسلهما إلى المسار العامّ يُردّ `400` **باسمهما**
 * لا يُتجاهلان صامتَين (`forbidNonWhitelisted`).
 *
 * This route, behind a two person decision, is the only one that moves a subscription end: a new
 * company is born with none. The end must be the one the decision approved. The start date is not
 * part of it: it stays the activation day, so sending one is refused by name.
 */
export class UpdateCompanySubscriptionDto {
  @IsOptional()
  @IsISO8601()
  subEnd?: string;
}
