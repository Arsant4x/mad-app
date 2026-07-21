import { ForbiddenException } from '@nestjs/common';

export class AccountFrozenException extends ForbiddenException {
  constructor() {
    super({ code: 'ACCOUNT_FROZEN', message: 'الحساب مجمّد بسبب انتهاء الاشتراك' });
  }
}

export class AccountStoppedException extends ForbiddenException {
  constructor() {
    super({ code: 'ACCOUNT_STOPPED', message: 'الحساب متوقف' });
  }
}

export class ScreenForbiddenException extends ForbiddenException {
  constructor(screen: string) {
    super({ code: 'SCREEN_FORBIDDEN', message: `لا تملك صلاحية الوصول لشاشة "${screen}"` });
  }
}
