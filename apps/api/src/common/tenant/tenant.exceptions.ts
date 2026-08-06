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
