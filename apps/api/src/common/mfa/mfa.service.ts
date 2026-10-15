import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialChangeService } from '../credentials/credential-change.service';
import { decryptSecret, encryptSecret } from '../crypto/secret.util';
import { MSG } from '../i18n/messages';
import { mfaLockDurationMs, mfaLockedException } from './mfa-lock.util';
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from './totp.util';

/**
 * **المصادقةُ المتعدّدة — تسجيلٌ وتحقّق** (`ق-١٣١٨` · ⑨A1 — باب `⑨ الصلاحيات`، مُسح).
 *
 * ## ثلاثةُ أحكامٍ تسكن هنا
 *
 * ① **السرُّ لا يُفعَّل بمجرّد توليده**: يُولَّد ويُشفَّر ويُحفظ، **ولا يُطالَب صاحبُه برمزٍ
 *   حتى يُثبت أنه قرأه** (`mfaEnrolledAt`). فمن ولّد سرّاً ولم يُكمل **لا يُحبس خارج حسابه**.
 * ② **والرمزُ لا يُستعمل مرّتين**: آخرُ خطوةٍ قُبلت تُحفظ — والخوارزميةُ لا تعرف ذلك، فهو
 *   حكمُ المُخزِّن. **ومن التقط رمزاً من فوق الكتف لا يُعيده في نافذته.**
 * ③ **ورمزُ الاسترداد يُستهلك**: يُحذف من القائمة عند قبوله — فورقةٌ مسروقة تعمل مرّةً لكلِّ سطر.
 *
 * ## The requirement for platform accounts
 *
 * `MFA_REQUIRED_FOR_PLATFORM_ADMIN`: production refuses to boot unless it is true. A platform
 * administrator who has not enrolled gets, at sign-in, an enrolment-only session instead of a
 * session, so the requirement never locks the platform away from its operator.
 *
 * Turning the factor on or off needs the current password and goes through the credential change
 * path: the account's other sessions end and its e-mail address is told.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialChangeService,
  ) {}

  private async assertCurrentPassword(identityId: string, currentPassword: string): Promise<void> {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { passwordHash: true } });
    if (!row) throw new NotFoundException(MSG.session_invalid);
    if (!(await argon2.verify(row.passwordHash, currentPassword))) throw new UnauthorizedException(MSG.current_password_invalid);
  }

  /** التهشيمُ لرمز الاسترداد — عاليُ العشوائية، فالسريعُ يكفي (نمطُ رمز الاستعادة). */
  private hashRecovery(code: string): string {
    return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
  }

  static requiredForPlatformAdmin(): boolean {
    return process.env.MFA_REQUIRED_FOR_PLATFORM_ADMIN === 'true';
  }

  async status(identityId: string) {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { mfaEnrolledAt: true, mfaRecoveryHashes: true, actorType: true } });
    if (!row) throw new NotFoundException(MSG.session_invalid);
    return {
      enrolled: row.mfaEnrolledAt !== null,
      enrolledAt: row.mfaEnrolledAt,
      recoveryCodesLeft: row.mfaRecoveryHashes.length,
      /** **الإلزامُ يُعرض كما هو** — فمن يُطالَب به يعرف قبل أن يُردّ. */
      required: row.actorType === 'PLATFORM_ADMIN' && MfaService.requiredForPlatformAdmin(),
    };
  }

  /** **يبدأ التسجيل**: سرٌّ جديد مشفَّرٌ عند السكون، ورابطٌ يقرؤه التطبيق — **ولا تفعيلَ بعد**. */
  async begin(identityId: string, username: string) {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { mfaEnrolledAt: true } });
    if (!row) throw new NotFoundException(MSG.session_invalid);
    if (row.mfaEnrolledAt) throw new ConflictException(MSG.mfa_already_enrolled);

    const secret = generateTotpSecret();
    await this.prisma.loginIdentity.update({ where: { id: identityId }, data: { mfaSecret: encryptSecret(secret), mfaLastStep: null } });
    // **يُعرض مرّةً هنا ولا يُقرأ بعدها من أيّ مسار** — القراءةُ الوحيدة للسرّ هي التحقّق.
    return { secret, otpauth: otpauthUrl(secret, username) };
  }

  /**
   * Completes enrolment with a code from the app, which proves the owner read the secret, then hands the
   * recovery codes once. `keepSessionId` is the session making the change; the account's other sessions end.
   */
  async confirm(identityId: string, code: string, currentPassword: string, keepSessionId?: string) {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { mfaSecret: true, mfaEnrolledAt: true } });
    if (!row) throw new NotFoundException(MSG.session_invalid);
    if (row.mfaEnrolledAt) throw new ConflictException(MSG.mfa_already_enrolled);
    if (!row.mfaSecret) throw new BadRequestException(MSG.mfa_not_started);
    await this.assertCurrentPassword(identityId, currentPassword);

    const verdict = verifyTotp(decryptSecret(row.mfaSecret), code);
    if (!verdict.ok) throw new UnauthorizedException(MSG.mfa_code_invalid);

    const codes = generateRecoveryCodes();
    const notice = await this.prisma.$transaction(async (tx) => {
      await tx.loginIdentity.update({
        where: { id: identityId },
        data: { mfaEnrolledAt: new Date(), mfaLastStep: verdict.step, mfaRecoveryHashes: codes.map((c) => this.hashRecovery(c)) },
      });
      return this.credentials.record(tx, identityId, ['mfa_enabled'], keepSessionId);
    });
    this.credentials.notify(notice);
    // Shown once and stored only hashed, so no route can show them again.
    return { recoveryCodes: codes };
  }

  /** Turns the factor off, with the current password and a live code, so an open session alone cannot remove it. */
  async disable(identityId: string, code: string, currentPassword: string, keepSessionId?: string) {
    // The password first: a wrong one does not count against the code lock.
    await this.assertCurrentPassword(identityId, currentPassword);
    await this.assertCode(identityId, code);
    const notice = await this.prisma.$transaction(async (tx) => {
      await tx.loginIdentity.update({ where: { id: identityId }, data: { mfaSecret: null, mfaEnrolledAt: null, mfaLastStep: null, mfaRecoveryHashes: [] } });
      return this.credentials.record(tx, identityId, ['mfa_disabled'], keepSessionId);
    });
    this.credentials.notify(notice);
    return { enrolled: false };
  }

  /** هل هذه الهويّةُ مسجَّلة؟ — يقرؤه مسارُ الدخول قبل أن يُصدر رمزاً. */
  async isEnrolled(identityId: string): Promise<boolean> {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { mfaEnrolledAt: true } });
    return row?.mfaEnrolledAt !== null && row?.mfaEnrolledAt !== undefined;
  }

  /**
   * Checks a code at sign-in: an authenticator code or a recovery code, and spends the one it accepts.
   * A wrong code is 401 without saying which kind was wrong; a lock is 429 with the time left.
   */
  async assertCode(identityId: string, code: string): Promise<void> {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: identityId }, select: { mfaSecret: true, mfaRecoveryHashes: true, mfaLockedUntil: true } });
    if (!row?.mfaSecret) throw new UnauthorizedException(MSG.mfa_code_invalid);
    const now = new Date();
    // While locked even a right code is refused, or the lock would only slow wrong guesses.
    if (row.mfaLockedUntil && row.mfaLockedUntil > now) throw mfaLockedException(row.mfaLockedUntil, now);

    const verdict = verifyTotp(decryptSecret(row.mfaSecret), code);
    if (verdict.ok) {
      // The step condition sits in the write itself, so two requests with one code cannot both pass.
      const { count } = await this.prisma.loginIdentity.updateMany({
        where: { id: identityId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: verdict.step } }] },
        data: { mfaLastStep: verdict.step, mfaFailedCount: 0, mfaLockedUntil: null },
      });
      if (count === 1) return;
    } else {
      const hash = this.hashRecovery(code);
      if (row.mfaRecoveryHashes.includes(hash)) {
        // array_remove in one statement: a code is spent once, and two codes spent together are both removed.
        const spent = await this.prisma.$executeRaw`
          UPDATE "login_identities"
          SET "mfaRecoveryHashes" = array_remove("mfaRecoveryHashes", ${hash}), "mfaFailedCount" = 0, "mfaLockedUntil" = NULL, "updatedAt" = ${now}
          WHERE "id" = ${identityId} AND ${hash} = ANY("mfaRecoveryHashes")`;
        if (spent === 1) return;
      }
    }
    await this.recordFailure(identityId, now);
  }

  /** Counts a wrong or reused code; every fifth in a row sets a lock (15 minutes, doubling, at most a day). */
  private async recordFailure(identityId: string, now: Date): Promise<never> {
    const { mfaFailedCount } = await this.prisma.loginIdentity.update({ where: { id: identityId }, data: { mfaFailedCount: { increment: 1 } }, select: { mfaFailedCount: true } });
    const lockMs = mfaLockDurationMs(mfaFailedCount);
    if (lockMs === 0) throw new UnauthorizedException(MSG.mfa_code_invalid);
    const until = new Date(now.getTime() + lockMs);
    await this.prisma.loginIdentity.update({ where: { id: identityId }, data: { mfaLockedUntil: until } });
    throw mfaLockedException(until, now);
  }
}
