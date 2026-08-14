import { ForbiddenException } from '@nestjs/common';
import { formatMessage, MSG } from '../i18n/messages';

/** These carry a machine-readable `code` alongside the message because the web
 * client branches on it (the frozen/stopped screens in AppShell), so the code
 * must stay stable and language-independent while `message` is localized by
 * HttpExceptionFilter. */
export class AccountFrozenException extends ForbiddenException {
  constructor() {
    super({ code: 'ACCOUNT_FROZEN', message: MSG.account_frozen });
  }
}

export class AccountStoppedException extends ForbiddenException {
  constructor() {
    super({ code: 'ACCOUNT_STOPPED', message: MSG.account_stopped });
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

/** Raised when the company has frozen its master records and this actor is
 * not the owner nor exempted. */
export class MasterDataLockedException extends ForbiddenException {
  constructor() {
    super({ code: 'MASTER_DATA_LOCKED', message: MSG.master_data_locked });
  }
}
