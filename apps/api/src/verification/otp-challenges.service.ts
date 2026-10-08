import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { blindIndex } from '../common/crypto/field-cipher.util';
import { MSG } from '../common/i18n/messages';
import { OTP_POLICY, type VerificationPurpose } from './otp-policy';

type Tx = Prisma.TransactionClient;

export type OtpVerifyResult = 'OK' | 'WRONG' | 'EXPIRED' | 'LOCKED' | 'USED' | 'NOT_FOUND';

/** بصمةُ الرمز: `HMAC` بمفتاحٍ خارج القاعدة ومجالُها المنشأةُ والتحدّي — فمن قرأ القاعدةَ لا يستعيد ستّةَ أرقامٍ بالتجريب (المسح ٣٢). */
export const otpCodeHash = (companyId: string, challengeId: string, code: string) => blindIndex(code, `otp\u001f${companyId}\u001f${challengeId}`);

/** بصمةُ الجوال لا الجوالُ نفسُه: تُثبت لاحقاً أيَّ رقمٍ وصله الرمزُ دون أن يُكتب الرقمُ كاملاً (توجيه ٢٨٧ ⑪). */
export const mobileIndex = (companyId: string, e164: string) => blindIndex(e164, `${companyId}\u001fmobile`);

/** رمزٌ من ستّة أرقام بمولّدٍ تشفيريّ، بأصفاره الأولى. */
export function generateOtpCode(digits: number = OTP_POLICY.digits): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * ⚖️ **تحدّي رمز التحقّق** (توجيه ٢٨٧ ② و⑪ · `ق-١٥٩١` · `ق-١٦٣٥` ④).
 *
 * - **الرمزُ بصمةٌ لا نصّ**: لا يُخزَّن ولا يُطبع، ويُعاد للمستدعي مرّةً ليُرسله ثم لا يُرى ثانية.
 * - **خمسُ دقائق وثلاثُ محاولات واستعمالٌ واحد**، والمحاولةُ الثالثة الخاطئة تقفله.
 * - **الإصدارُ الجديد يُبطل كلَّ ما سبقه للموضوع نفسِه**، والإصداراتُ للموضوع ستّةٌ في الأكثر ثم `429` مسمّى — والعدُّ على الصفوف لا في
 *   الذاكرة، فلا يُصفَّر بإقلاعٍ ولا بإعادة.
 * - **يعمل داخل معاملة المستدعي** (سياقُ المنشأة) **ولا يرمي في التحقّق**: المحاولةُ الخاطئة تُكتب ثم يُعاد حكمُها، فرميٌ داخل المعاملة كان
 *   سيُرجع زيادةَ العدّ فيصير التخمينُ بلا حدّ. والمستدعي يرمي بعد الالتزام.
 * - **والتحقّقُ هنا لا في محوّل الرسائل**، فلا مزوّدَ «يوافق» على رمز.
 */
@Injectable()
export class OtpChallengesService {
  /** يُصدر رمزاً لموضوعٍ (نموذجٍ أو بديل) ويُبطل ما قبله. والجوالُ مطبَّعٌ بإقليم المنشأة ومقنَّعٌ عند المستدعي. */
  async issueWithinTx(
    tx: Tx,
    input: { companyId: string; purpose: VerificationPurpose; subjectKey: string; mobileE164: string; mobileMasked: string; now?: Date },
  ): Promise<{ id: string; code: string; expiresAt: Date; issuesLeft: number }> {
    const now = input.now ?? new Date();
    const issued = await tx.verificationChallenge.count({ where: { purpose: input.purpose, subjectKey: input.subjectKey } });
    if (issued >= OTP_POLICY.maxIssuesPerSubject) throw new HttpException(MSG.otp_issue_limit, HttpStatus.TOO_MANY_REQUESTS);

    await tx.verificationChallenge.updateMany({
      where: { purpose: input.purpose, subjectKey: input.subjectKey, consumedAt: null, revokedAt: null, lockedAt: null },
      data: { revokedAt: now },
    });

    const id = randomUUID();
    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + OTP_POLICY.ttlMs);
    await tx.verificationChallenge.create({
      data: {
        id,
        companyId: input.companyId,
        purpose: input.purpose,
        subjectKey: input.subjectKey,
        mobileIndex: mobileIndex(input.companyId, input.mobileE164),
        mobileMasked: input.mobileMasked,
        codeHash: otpCodeHash(input.companyId, id, code),
        maxAttempts: OTP_POLICY.maxAttempts,
        expiresAt,
      },
    });
    return { id, code, expiresAt, issuesLeft: OTP_POLICY.maxIssuesPerSubject - issued - 1 };
  }

  /**
   * يحكم على رمزٍ لتحدٍّ بعينه وموضوعه — بقفل الصفّ، فمحاولتان معاً لا تقرآن العدَّ نفسَه. والنجاحُ يستهلك التحدّي، والخطأُ يزيد العدّ
   * ويقفل عند الحدّ. **لا يرمي**: يُعاد الحكمُ والمحاولاتُ الباقية.
   */
  async verifyWithinTx(
    tx: Tx,
    input: { companyId: string; id: string; purpose: VerificationPurpose; subjectKey: string; code: string; now?: Date },
  ): Promise<{ result: OtpVerifyResult; attemptsLeft: number }> {
    const now = input.now ?? new Date();
    await tx.$queryRaw`SELECT "id" FROM "verification_challenges" WHERE "id" = ${input.id} FOR UPDATE`;
    const row = await tx.verificationChallenge.findUnique({ where: { id: input.id } });
    if (!row || row.purpose !== input.purpose || row.subjectKey !== input.subjectKey) return { result: 'NOT_FOUND', attemptsLeft: 0 };
    if (row.consumedAt || row.revokedAt) return { result: 'USED', attemptsLeft: 0 };
    if (row.lockedAt || row.attempts >= row.maxAttempts) return { result: 'LOCKED', attemptsLeft: 0 };
    if (row.expiresAt.getTime() <= now.getTime()) return { result: 'EXPIRED', attemptsLeft: 0 };

    const code = (input.code ?? '').trim();
    if (/^\d+$/.test(code) && sameHash(otpCodeHash(input.companyId, row.id, code), row.codeHash)) {
      await tx.verificationChallenge.update({ where: { id: row.id }, data: { consumedAt: now } });
      return { result: 'OK', attemptsLeft: row.maxAttempts - row.attempts };
    }
    const attempts = row.attempts + 1;
    const locked = attempts >= row.maxAttempts;
    await tx.verificationChallenge.update({ where: { id: row.id }, data: { attempts, ...(locked ? { lockedAt: now } : {}) } });
    return { result: locked ? 'LOCKED' : 'WRONG', attemptsLeft: row.maxAttempts - attempts };
  }
}
