/**
 * `@mad-app/shared` — ما يُشترك بين الخادم والواجهة **مولَّداً من مصدره لا منسوخاً**.
 *
 * كان هنا `SCREEN_KEYS` من نموذج يوليو **بلا مستورِد** — فأُزيل (`ق-١٢٣٤`)، وحلّت محلَّه
 * مفرداتُ الصلاحيات المولَّدة من `apps/api/src/templates/screens.ts` (`./permissions.ts`).
 */
export * from './permissions';
