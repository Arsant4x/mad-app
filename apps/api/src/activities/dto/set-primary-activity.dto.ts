import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetPrimaryActivityDto {
  /** `null` يُطفئ الترشيح — والمنشأة ترى كل شاشاتها. وهو **التراجع الفوري**. */
  @IsOptional()
  @IsString()
  activityId?: string | null;

  /**
   * ⚠️ **تأكيدٌ صريح لا تجميل.**
   *
   * بدونه يصير تغيير النشاط نقرةً واحدة تُخفي شاشاتٍ عن **كل موظف** بلا أن
   * يرى أحدٌ ماذا اختفى. والعلَم يجعل الواجهة **مضطرّةً** لعرض `preview`
   * أولاً — لا مخيَّرة.
   */
  @IsBoolean()
  confirmed!: boolean;
}
