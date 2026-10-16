import { ForbiddenException } from '@nestjs/common';
import { formatMessage, MSG } from '../i18n/messages';

/** These carry a machine-readable `code` alongside the message because the web
 * client branches on it (the frozen/stopped screens in AppShell), so the code
 * must stay stable and language-independent while `message` is localized by
 * HttpExceptionFilter. */
/** The message names only a cause the caller knows: a lapsed subscription, no subscription ever, or
 * the employee's own account being turned off. */
export type AccountFrozenMessage = typeof MSG.account_frozen | typeof MSG.account_frozen_no_subscription | typeof MSG.account_user_inactive;

export class AccountFrozenException extends ForbiddenException {
  constructor(message: AccountFrozenMessage) {
    super({ code: 'ACCOUNT_FROZEN', message });
  }
}

export class AccountStoppedException extends ForbiddenException {
  constructor() {
    super({ code: 'ACCOUNT_STOPPED', message: MSG.account_stopped });
  }
}

/**
 * الحالةُ الرابعة (`ق-٥٤٧`): مغلقٌ بطلب التاجر — **والرسالةُ تجيب «وأين بياناتي؟» وبأجل**،
 * فرسالةٌ تقول «محفوظة» بلا أجلٍ تُقرأ «إلى الأبد». **وتقول حتى متى يعود** (`ق-٥٥٩`): فبعد
 * النافذة يُمحى غيرُ الملزِم — ويُعلَن ذلك ولا يُخفى.
 */
export class AccountClosedException extends ForbiddenException {
  constructor(retainUntil: string, reopenUntil: string) {
    super({ code: 'ACCOUNT_CLOSED', message: formatMessage(MSG.account_closed, { retainUntil, reopenUntil }) });
  }
}

/**
 * بوّابةُ الموافقة على المعالجين الفرعيين (`ق-٥٨٩`) — **اختيارٌ لا حجب**.
 *
 * ⚠️ **والرسالةُ تحمل البابَين**: من يقرأ «ممنوع» بلا مخرجٍ يقرأ حجزاً؛ ومن يقرأ
 * «اقبل أو خذ بياناتك واخرج» **يعلم أن أمامه قراراً**. والرمزُ ثابتٌ لأن الواجهة
 * تفرّع عليه كما تفرّع على المغلق والمجمَّد.
 */
export class ConsentRequiredException extends ForbiddenException {
  constructor(effectiveFrom: string) {
    super({ code: 'CONSENT_REQUIRED', message: formatMessage(MSG.consent_required, { effectiveFrom }) });
  }
}

export class ScreenForbiddenException extends ForbiddenException {
  constructor(screen: string) {
    super({ code: 'SCREEN_FORBIDDEN', message: formatMessage(MSG.screen_forbidden, { screen }) });
  }
}

/**
 * الشاشة موجودة، ونشاط المنشأة لا يشملها.
 *
 * ## ⚠️ ولماذا 403 لا 404 — والفرق مقصود
 *
 * في الفواتير وأمثالها يُردّ 404 عمداً: وجودُ الصفّ نفسه معلومةٌ لا تُسرَّب
 * لمن لا يملكها. **وهنا العكس**: الشاشات معروفةٌ للجميع (`ALLOWED_SCREENS`
 * قائمة ثابتة في المنتج)، فإخفاء وجودها لا يحمي شيئاً — ويترك التاجر
 * أمام «غير موجود» عن شاشةٍ يراها في التسويق.
 *
 * فالرفض هنا **معلوم السبب**: موجودة · وغير مفعّلة لنشاطك · ويمكن تفعيلها.
 * (قرار المالك 2026-08-13.)
 */
export class ScreenNotInSectorException extends ForbiddenException {
  constructor(screen: string) {
    super({ code: 'SCREEN_NOT_IN_SECTOR', message: formatMessage(MSG.screen_not_in_sector, { screen }) });
  }
}

export class ActionForbiddenException extends ForbiddenException {
  constructor(action: string, screen: string) {
    super({ code: 'ACTION_FORBIDDEN', message: formatMessage(MSG.action_forbidden, { action, screen }) });
  }
}

/** A write route under a screen that names no action: nothing in a template can
 * grant it, so it is refused for every actor until the route declares one. */
export class ActionUndeclaredException extends ForbiddenException {
  constructor() {
    super({ code: 'ACTION_UNDECLARED', message: MSG.action_undeclared });
  }
}

/** Raised when the company has frozen its master records and this actor is
 * not the owner nor exempted. */
export class MasterDataLockedException extends ForbiddenException {
  constructor() {
    super({ code: 'MASTER_DATA_LOCKED', message: MSG.master_data_locked });
  }
}
