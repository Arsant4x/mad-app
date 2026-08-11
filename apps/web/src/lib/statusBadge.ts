/**
 * قراءة آمنة لخرائط شارات الحالة.
 *
 * **ما لا يعالجه هذا الملف:** نقصُ مفتاحٍ في الخريطة بينما النوع يعرفه —
 * فذلك يمسكه `Record<Status, Meta>` وقتَ الترجمة أصلاً (مُثبَت: إضافة قيمة
 * إلى الاتحاد بلا إضافتها إلى الخريطة تُسقط tsc بـTS2741).
 *
 * **ما يعالجه:** الحالة التي لا تستطيع الأنواع بلوغها — **انحراف الإصدارات**.
 * الواجهة حزمةٌ مُنزَّلة تعيش في متصفح المستخدم، والخادم يُحدَّث تحتها. فبين
 * نشرٍ ونشر يستقبل متصفحٌ يحمل حزمة الأمس قيمةَ حالةٍ أضافها خادم اليوم،
 * فيعود `MAP[value]` بـundefined ويسقط `.badgeClass` — وتُفرَّغ الشجرة كاملةً.
 *
 * وهذا ليس افتراضاً نظرياً: هو **بعينه** ما جرى مع `PARTIAL` (أُضيفت للمخطط
 * في 4.5 ونُسيت في الواجهة)، إلا أن سببه هناك كان النوع لا الانحراف. والنمط
 * `MAP[x].prop` مكرَّر في 18 موضعاً عبر التطبيق، فكلٌّ منها كان لغماً بنفس
 * الشكل.
 *
 * البديل المعروض عند قيمة مجهولة: **القيمة الخام نفسها** بشارة محايدة —
 * لا «—» ولا فراغ. فالمستخدم يرى شيئاً يستطيع إبلاغنا به، ونحن نرى في لقطته
 * الاسم الذي لم تعرفه الحزمة.
 */

export interface BadgeMeta {
  label: string;
  badgeClass: string;
}

/** نظير BadgeMeta للخرائط التي سمّت الحقل `badge` بدل `badgeClass`. */
export interface BadgeMetaAlt {
  label: string;
  badge: string;
}

export function badgeOf<K extends string>(map: Record<K, BadgeMeta>, key: K | string): BadgeMeta {
  return (map as Record<string, BadgeMeta | undefined>)[key] ?? { label: String(key), badgeClass: '' };
}

export function badgeAltOf<K extends string>(map: Record<K, BadgeMetaAlt>, key: K | string): BadgeMetaAlt {
  return (map as Record<string, BadgeMetaAlt | undefined>)[key] ?? { label: String(key), badge: '' };
}

/** ونظيرٌ ثالث للخرائط التي سمّته `tagClass` (خريطة جمهور القوالب). ثلاث
 *  تسميات لنفس الفكرة إرثٌ لا يستحق هجرةً الآن، لكنه لا يبرّر ترك أيٍّ منها
 *  بلا حارس. */
export interface TagMeta {
  label: string;
  tagClass: string;
}

export function tagOf<K extends string>(map: Record<K, TagMeta>, key: K | string): TagMeta {
  return (map as Record<string, TagMeta | undefined>)[key] ?? { label: String(key), tagClass: '' };
}
