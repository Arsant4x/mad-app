/**
 * وضع الدعم الفني (§1.10) — جانب الطرفية.
 *
 * التخزين محلي فقط لاختيار «أي منشأة أعاين الآن»؛ الإذن الحقيقي يعيش في
 * الخادم (موافقة مالك + نافذة زمنية) ويُفحص على كل طلب — مسح هذا المفتاح
 * أو تزويره لا يمنح شيئاً.
 */
const KEY = 'support.companyId';
const NAME_KEY = 'support.companyName';

export function enterSupportMode(companyId: string, companyName: string): void {
  localStorage.setItem(KEY, companyId);
  localStorage.setItem(NAME_KEY, companyName);
}

export function exitSupportMode(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(NAME_KEY);
}

export function supportCompanyId(): string | null {
  return localStorage.getItem(KEY);
}

export function supportCompanyName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}
