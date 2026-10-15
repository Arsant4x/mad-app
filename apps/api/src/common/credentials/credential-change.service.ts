import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export type CredentialChange = 'password' | 'username' | 'mfa_enabled' | 'mfa_disabled';

/** What was changed and on which identity, written in the transaction and announced after it commits. */
export interface CredentialChangeNotice {
  identityId: string;
  changes: CredentialChange[];
}

const CHANGE_TEXT: Record<CredentialChange, string> = {
  password: 'تغيّرت كلمة المرور',
  username: 'تغيّر اسم المستخدم',
  mfa_enabled: 'فُعّلت المصادقة المتعددة',
  mfa_disabled: 'أُوقفت المصادقة المتعددة',
};

/**
 * The one path every change of sign-in credentials goes through, whoever makes it: the owner, the
 * platform administrator, a reset link or the second factor screen.
 */
@Injectable()
export class CredentialChangeService {
  private readonly logger = new Logger(CredentialChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Inside the caller's transaction: raises the identity's credential version, so access tokens issued
   * before it are refused, and revokes its refresh tokens. `keepSessionId` spares the session that made
   * the change itself; every other session ends.
   */
  async record(tx: Prisma.TransactionClient, identityId: string, changes: CredentialChange[], keepSessionId?: string): Promise<CredentialChangeNotice> {
    await tx.loginIdentity.update({ where: { id: identityId }, data: { credentialVersion: { increment: 1 } } });
    // Deleted, not marked revoked: a revoked token presented again reads as theft and ends every session, the kept one too.
    await tx.refreshToken.deleteMany({ where: { loginIdentityId: identityId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
    return { identityId, changes };
  }

  /** After the change has committed: mails the account's address. A delivery failure is logged, never thrown. */
  notify(notice: CredentialChangeNotice): void {
    void this.deliver(notice).catch((e) => this.logger.warn(`credential change notice failed: ${(e as Error).message}`));
  }

  private async deliver({ identityId, changes }: CredentialChangeNotice): Promise<void> {
    const identity = await this.prisma.loginIdentity.findUnique({
      where: { id: identityId },
      select: { username: true, actorType: true, memberOf: { select: { email: true, orgName: true } } },
    });
    if (!identity) return;
    // An employee has no address of its own, so the company owner is told.
    const email = identity.memberOf?.email;
    if (!email) {
      this.logger.warn(`sign-in credentials of ${identity.actorType} account ${identity.username} changed; no e-mail address on file to tell`);
      return;
    }
    const account = identity.actorType === 'COMPANY_USER' ? `حساب الموظف «${identity.username}» في «${identity.memberOf?.orgName}»` : `حساب «${identity.memberOf?.orgName}» (اسم المستخدم: ${identity.username})`;
    await this.mail.send(
      email,
      'تنبيه: تغيّرت بيانات الدخول — mad-app',
      `${changes.map((c) => CHANGE_TEXT[c]).join('، ')} على ${account}.\n\n` +
        `أُنهيت جلسات الدخول الأخرى على هذا الحساب.\n\n` +
        `إن لم يكن هذا التغيير منك فاطلب استعادة كلمة المرور فوراً وتواصل مع الدعم.`,
    );
  }
}
