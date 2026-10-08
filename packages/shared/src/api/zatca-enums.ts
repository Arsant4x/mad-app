// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: docs/web-enum-mirrors.json (سجلُّ #579) — قيمُ كلِّ تعدادٍ من مقابله في الخادم، بترتيبه. (ما يحمل علامةً سعودية — حدُّ الوحدة: ق-١٣٥٠)
// يُعاد توليدُه بـ: npx ts-node scripts/generate-shared-enums.ts  (من apps/api)
// والحارسُ apps/api/src/common/shared-enums-generated.spec.ts يُسقط الحزمةَ إن اختلف عن مصدره.

/** `prisma:NotificationKind` — ويقابلُه `apps/web/src/api/notifications.ts#NotificationKind`. */
export const NOTIFICATION_KIND_VALUES = ['RENT_ESCALATION', 'WARRANTY_EXPIRING', 'NOTE_ISSUED_LATE', 'SUPPORT_REQUESTED', 'SUPPORT_ENTERED', 'SUBPROCESSOR_CONSENT', 'ZATCA_CERT_EXPIRING', 'POS_CARD_UNMATCHED', 'FORM_SIGNING_EXPIRED', 'FORM_OBJECTED'] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND_VALUES)[number];

/** `prisma:ZatcaStatus` — ويقابلُه `apps/web/src/api/invoices.ts#ZatcaInvoiceStatus`. */
export const ZATCA_INVOICE_STATUS_VALUES = ['NOT_SUBMITTED', 'SUBMITTING', 'STAMPED', 'CLEARED', 'REJECTED'] as const;
export type ZatcaInvoiceStatus = (typeof ZATCA_INVOICE_STATUS_VALUES)[number];

/** `prisma:ZatcaOnboardingStatus` — ويقابلُه `apps/web/src/api/zatca.ts#ZatcaOnboardingStatus`. */
export const ZATCA_ONBOARDING_STATUS_VALUES = ['NOT_STARTED', 'AWAITING_OTP', 'COMPLIANCE_ISSUED', 'PRODUCTION_ISSUED', 'FAILED'] as const;
export type ZatcaOnboardingStatus = (typeof ZATCA_ONBOARDING_STATUS_VALUES)[number];
