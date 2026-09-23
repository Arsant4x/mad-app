import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, ActorType, PlatformRole } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { createCompanyAccount } from '../companies/create-company-account';
import { evaluateCompanyStatus } from '../common/tenant/company-status.util';
import { AccountStoppedException } from '../common/tenant/tenant.exceptions';
import { JwtPayload } from './types';
import { formatMessage, MSG } from '../common/i18n/messages';
import { MailService } from '../common/mail/mail.service';
import { MfaService } from '../common/mfa/mfa.service';

export interface AuthUserView {
  id: string;
  actorType: 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
  username: string;
  displayName: string;
  companyId: string | null;
  status: AccountStatus;
  allowedScreens: string[] | 'all';
  /**
   * دورُ مدير المنصّة (`ق-١٣١٢` · ⑪A2) — **لمديري المنصّة وحدَهم**، و`null` لغيرهم.
   *
   * ⚠️ **وهو للعرض لا للحكم**: الشاشةُ تُخفي ما لا يملكه الدورُ **كي لا يُقاد إلى بابٍ يُردّ
   * منه**، **والحكمُ في الخادم** (`PlatformAdminGuard`) — فمن عدّل الرد لم يفتح باباً.
   */
  platformRole: PlatformRole | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserView;
}

const REFRESH_TOKEN_BYTES = 32;

/**
 * 🔴 **المصادقةُ على خطوتين — الهويّةُ ثم ملفُّها تحت سياق منشأتها** (`ق-٦٦٦` · المرحلة ②).
 *
 * كانت خطوةً واحدة: `login_identities` **مع تضمين** `companies` و`company_users`
 * و`permission_templates` **قبل أن يُعرف أيُّ سياق** — فإغلاقُ تلك الجداول بـ`FORCE`
 * كان يُعيد الملفَّ فارغاً **ويُبطل جلسةَ كلِّ موظّف** (مقيس: `11/20` حمراء تحت الطُّعم).
 *
 * الآن تحمل الهويّةُ منشأتَها (`companyId` — تملؤه القاعدةُ بمشغِّل، لا الشيفرة)،
 * **فتُقرأ بلا سياق** ثم يُقرأ ملفُّها تحت `runInTenantContext(identity.companyId)`.
 * الثمنُ مقيس ومقبول (`ق-٦٦٧`): `+1.2–2.1 ms` لكلّ نداء.
 */
/**
 * صفُّ هويّةِ دخول — **بثلاثة فاعلين لا أربعة**.
 *
 * ⚠️ `ActorType` فيه `INTEGRATION` (`ق-١٢٩١` · ي/⑫A3)، **ولا هويّةَ دخولٍ له**: المفتاحُ
 * لا كلمةَ مرورَ له ولا يمرّ بهذا المسار أصلاً. **والتضييقُ هنا مقصود** — فحين وُسّع
 * التعدادُ أسقط المترجمُ كلَّ موضعٍ يمرّر صفَّ هويّةٍ هنا، وهو ما نريد: **بابُ المفتاح
 * غيرُ باب الجلسة**، ولو وُسّع النوعُ لمرّ الخلطُ صامتاً.
 */
interface IdentityRow {
  id: string;
  username: string;
  actorType: 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
  passwordHash: string;
  companyId: string | null;
}

/**
 * يضيّق صفَّ القاعدة إلى فاعلٍ بشريّ — **ويرمي على `INTEGRATION`**.
 *
 * وهو صفٌّ **لا يمكن أن يوجد** (لا يُنشأ مفتاحٌ في `login_identities` من أيّ مسار)،
 * فالرميُ إعلانٌ عن استحالةٍ لا معالجةُ حالة: لو وُجد يوماً فالسببُ عطلٌ يجب أن يصرخ،
 * لا دخولٌ يمرّ.
 */
function asHumanIdentity(row: { actorType: ActorType } & Omit<IdentityRow, 'actorType'>): IdentityRow {
  if (row.actorType === 'INTEGRATION') throw new UnauthorizedException(MSG.invalid_credentials);
  return { ...row, actorType: row.actorType };
}

interface IdentityWithProfiles {
  id: string;
  username: string;
  actorType: 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
  platformAdmin: { id: string; displayName: string; role: PlatformRole } | null;
  company:
    | { id: string; orgName: string; status: AccountStatus; frozenAt: Date | null; subEnd: Date | null; permissionTemplate: { isAllScreens: boolean; allowedScreens: string[] } }
    | null;
  companyUser:
    | {
        id: string;
        name: string;
        status: AccountStatus;
        companyId: string;
        company: { status: AccountStatus };
        permissionTemplate: { isAllScreens: boolean; allowedScreens: string[] };
      }
    | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly mfa: MfaService,
  ) {}

  /**
   * الخطوةُ الثانية: ملفُّ الهويّة **تحت سياق منشأتها**. مديرُ المنصّة يُقرأ من
   * جدوله المنصّيّ بلا سياق (لا `RLS` عليه). وهويّةٌ بلا منشأة وليست مديراً
   * (يتيمةٌ — `ق-٦٦٨`) تعود بلا ملفٍّ فيرفضها `buildSessionFromIdentity` كما كان.
   */
  private async loadProfiles(identity: IdentityRow): Promise<IdentityWithProfiles> {
    const base: IdentityWithProfiles = { id: identity.id, username: identity.username, actorType: identity.actorType, platformAdmin: null, company: null, companyUser: null };
    if (identity.actorType === 'PLATFORM_ADMIN') {
      base.platformAdmin = await this.prisma.platformAdmin.findUnique({ where: { loginIdentityId: identity.id }, select: { id: true, displayName: true, role: true } });
      return base;
    }
    if (!identity.companyId) return base;
    return this.tenantPrisma.runInTenantContext(identity.companyId, async (tx) => {
      if (identity.actorType === 'COMPANY') {
        base.company = await tx.company.findUnique({ where: { loginIdentityId: identity.id }, include: { permissionTemplate: true } });
      } else {
        base.companyUser = await tx.companyUser.findUnique({ where: { loginIdentityId: identity.id }, include: { company: true, permissionTemplate: true } });
      }
      return base;
    });
  }

  async login(username: string, password: string, code?: string): Promise<LoginResult> {
    const identity = await this.prisma.loginIdentity.findUnique({ where: { username } });

    // Same generic message whether the username doesn't exist or the
    // password is wrong — never reveal which one failed.
    //
    // والرسالة وحدها لا تكفي: **الزمن كان يكشف ما تُخفيه الرسالة**. الخروج
    // المبكّر عند غياب المستخدم يتخطّى `argon2.verify` كاملاً، فيردّ الخادم
    // في جزءٍ من الزمن. القياس (٦٠ طلباً لكل حالة عبر HTTP حقيقي، 2026-08-15):
    //
    //   موجود + كلمة خاطئة : p50 = 93.3ms · p95 = 111.4ms · min = 81.1ms
    //   غير موجود          : p50 = 14.2ms · p95 =  18.9ms · max = 21.7ms
    //
    // **فصلٌ تام**: أبطأ «غير موجود» أسرع من أسرع «موجود» — أي أن **قياساً
    // واحداً** يصنّف بلا خطأ، ولا يحتاج المهاجم تكراراً ولا إحصاءً. وحدّ
    // المعدّل (١٠/دقيقة/IP) **يبطّئ التعداد ولا يمنعه**.
    //
    // فالمسار غير الموجود يستهلك الزمن نفسه على هاشٍ حقيقي. ومعاملاته يجب أن
    // تطابق ما يُنتجه `argon2.hash` هنا، وإلا عاد الفرق من باب آخر — ولذلك
    // يُولَّد الشبح **من نفس الدالة** لا من ثابتٍ منسوخ.
    if (!identity) {
      await argon2.verify(await this.decoyHash(), password).catch(() => false);
      throw new UnauthorizedException(MSG.invalid_credentials);
    }
    // الملفُّ قبل التحقّق من كلمة المرور — كما كان يُضمَّن في الاستعلام نفسِه: فالزيادةُ
    // (`≈ +2 ms`) تقع قبل `argon2` في المسارين ولا تُضاف إلى فرق الزمن بينهما.
    const profiles = await this.loadProfiles(asHumanIdentity(identity));
    const passwordOk = await argon2.verify(identity.passwordHash, password);
    if (!passwordOk) throw new UnauthorizedException(MSG.invalid_credentials);

    /**
     * 🔴 **العاملُ الثاني — بعد كلمة المرور لا قبلها** (`ق-١٣١٨` · ⑨A1).
     *
     * **بعدها** كي لا يصير المسارُ مِعداداً: من يُطالَب برمزٍ قبل التحقّق من كلمته **يعرف
     * أن الاسمَ موجودٌ ومسجَّل** بلا أن يملك شيئاً. **وبعد التحقّق لا يُفصح عمّا لم يكن يعرفه.**
     */
    if (identity.mfaEnrolledAt) {
      // **المفتاحُ يُرمى لا نصُّه** — المرشِّحُ يترجمه ويُبقي ما جاوره (`mfaRequired`) كما هو.
      if (!code) throw new UnauthorizedException({ statusCode: 401, message: MSG.mfa_required, mfaRequired: true });
      await this.mfa.assertCode(identity.id, code);
    } else if (identity.actorType === 'PLATFORM_ADMIN' && MfaService.requiredForPlatformAdmin()) {
      // ⛔ **الإلزامُ علَمٌ مطفأٌ افتراضياً**: مُشعَلاً لا يدخل مديرُ منصّةٍ بلا تسجيل —
      //    **والرسالةُ تقول ما يفعل**، فلا يُترك أمام رفضٍ لا مخرجَ منه.
      throw new UnauthorizedException({ statusCode: 401, message: MSG.mfa_enrolment_required, mfaEnrolmentRequired: true });
    }

    return this.buildSessionFromIdentity(profiles);
  }

  /** Rotates a refresh token: the old one is revoked and a new pair is issued. */
  async refresh(presentedToken: string): Promise<LoginResult> {
    const tokenHash = this.hashToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { loginIdentity: true },
    });

    if (!stored) throw new UnauthorizedException(MSG.session_invalid);

    if (stored.revokedAt) {
      // Reuse of an already-rotated refresh token likely means it leaked —
      // kill every session for this identity as a precaution.
      await this.prisma.refreshToken.updateMany({
        where: { loginIdentityId: stored.loginIdentityId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(MSG.session_invalid);
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException(MSG.session_expired);

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    return this.buildSessionFromIdentity(await this.loadProfiles(asHumanIdentity(stored.loginIdentity)));
  }

  /** Re-derives the current user's view from a valid access token payload,
   * without rotating any tokens — used by GET /auth/me on app load. */
  async whoAmI(payload: JwtPayload): Promise<AuthUserView> {
    const row = await this.prisma.loginIdentity.findUnique({ where: { id: payload.sub } });
    if (!row) throw new UnauthorizedException(MSG.session_invalid);
    const identity = await this.loadProfiles(asHumanIdentity(row));

    if (identity.actorType === 'PLATFORM_ADMIN' && identity.platformAdmin) {
      return { id: identity.platformAdmin.id, actorType: 'PLATFORM_ADMIN', username: identity.username, displayName: identity.platformAdmin.displayName, companyId: null, status: 'ACTIVE', allowedScreens: 'all', platformRole: identity.platformAdmin.role };
    }
    if (identity.actorType === 'COMPANY' && identity.company) {
      const evaluated = evaluateCompanyStatus(identity.company);
      return {
        id: identity.company.id,
        actorType: 'COMPANY',
        username: identity.username,
        displayName: identity.company.orgName,
        companyId: identity.company.id,
        status: evaluated.status,
        allowedScreens: identity.company.permissionTemplate.isAllScreens ? 'all' : identity.company.permissionTemplate.allowedScreens,
        platformRole: null,
      };
    }
    if (identity.actorType === 'COMPANY_USER' && identity.companyUser) {
      return {
        id: identity.companyUser.id,
        actorType: 'COMPANY_USER',
        username: identity.username,
        displayName: identity.companyUser.name,
        companyId: identity.companyUser.companyId,
        status: identity.companyUser.status,
        allowedScreens: identity.companyUser.permissionTemplate.isAllScreens ? 'all' : identity.companyUser.permissionTemplate.allowedScreens,
        platformRole: null,
      };
    }
    throw new UnauthorizedException(MSG.session_invalid);
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.hashToken(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Turns a fully-loaded LoginIdentity into a signed session, applying the
   * lazy subscription-status re-evaluation on every login AND every refresh
   * (not just login) so a lapsed subscription takes effect promptly. */
  private async buildSessionFromIdentity(identity: IdentityWithProfiles): Promise<LoginResult> {
    let payload: JwtPayload;
    let user: AuthUserView;

    if (identity.actorType === 'PLATFORM_ADMIN' && identity.platformAdmin) {
      payload = { sub: identity.id, actorType: 'PLATFORM_ADMIN', companyId: null, profileId: identity.platformAdmin.id, username: identity.username };
      user = { id: identity.platformAdmin.id, actorType: 'PLATFORM_ADMIN', username: identity.username, displayName: identity.platformAdmin.displayName, companyId: null, status: 'ACTIVE', allowedScreens: 'all', platformRole: identity.platformAdmin.role };
    } else if (identity.actorType === 'COMPANY' && identity.company) {
      const company = identity.company;
      const evaluated = evaluateCompanyStatus(company);
      if (evaluated.status !== company.status || evaluated.frozenAt?.getTime() !== company.frozenAt?.getTime()) {
        await this.prisma.company.update({ where: { id: company.id }, data: { status: evaluated.status, frozenAt: evaluated.frozenAt } });
      }
      // Deliberately NO STOPPED block here anymore: a stopped company must be
      // able to log in **to renew from inside the platform** (owner's rule — no
      // contacting the provider). The TenantGuard keeps a stopped tenant locked
      // to subscription self-service only; every other endpoint still 403s.

      payload = { sub: identity.id, actorType: 'COMPANY', companyId: company.id, profileId: company.id, username: identity.username };
      user = {
        id: company.id,
        actorType: 'COMPANY',
        username: identity.username,
        displayName: company.orgName,
        companyId: company.id,
        status: evaluated.status,
        allowedScreens: company.permissionTemplate.isAllScreens ? 'all' : company.permissionTemplate.allowedScreens,
        platformRole: null,
      };
    } else if (identity.actorType === 'COMPANY_USER' && identity.companyUser) {
      const companyUser = identity.companyUser;
      if (companyUser.status !== 'ACTIVE' || companyUser.company.status !== 'ACTIVE') {
        throw new AccountStoppedException();
      }
      payload = { sub: identity.id, actorType: 'COMPANY_USER', companyId: companyUser.companyId, profileId: companyUser.id, username: identity.username };
      user = {
        id: companyUser.id,
        actorType: 'COMPANY_USER',
        username: identity.username,
        displayName: companyUser.name,
        companyId: companyUser.companyId,
        status: companyUser.status,
        allowedScreens: companyUser.permissionTemplate.isAllScreens ? 'all' : companyUser.permissionTemplate.allowedScreens,
        platformRole: null,
      };
    } else {
      throw new UnauthorizedException(MSG.invalid_credentials);
    }

    const accessToken = await this.signAccessToken(payload);
    const { refreshToken, refreshTokenExpiresAt } = await this.issueRefreshToken(identity.id);
    return { accessToken, refreshToken, refreshTokenExpiresAt, user };
  }

  private signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    });
  }

  private async issueRefreshToken(loginIdentityId: string): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const ttlMs = this.parseTtlToMs(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        loginIdentityId,
        expiresAt,
      },
    });

    return { refreshToken, refreshTokenExpiresAt: expiresAt };
  }

  // ---------- Password reset ----------

  /** Reset links die after this long. Long enough to open an inbox, short
   * enough that a forwarded or leaked email goes stale the same hour. */
  private static readonly RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

  /**
   * Starts a reset. Deliberately returns nothing either way — answering
   * "that username doesn't exist" hands an attacker a directory of accounts.
   *
   * Only company owners are eligible: the email on file belongs to the
   * company profile, and an employee's password is reset by the owner from
   * the employee-accounts screen (that path already exists).
   */
  /**
   * الردّ موحَّد دائماً (`{ok:true}`) — **والزمن لم يكن كذلك**.
   *
   * حسابٌ موجود بعنوان بريد يكلّف: حذف الرموز القديمة · توليد رمز · كتابته ·
   * **ثم نداء SMTP**. وحسابٌ مجهول يخرج فوراً. فالفرق أضخم من فرق الدخول
   * (٧٩ms) لأن فيه نداءً شبكياً — **والرسالة الموحَّدة تُخفي ما يفضحه الزمن**.
   *
   * ولا يُعالَج بمقارنة وهمية كالدخول: لا سبيل لمحاكاة زمن SMTP بثبات. فالعلاج
   * **فصل العمل عن الردّ**: يُردّ فوراً، ويجري الباقي بعده. فيصير الزمن ثابتاً
   * لكل مدخل — لا مساوياً فحسب بل **غير حاملٍ لأي إشارة**.
   *
   * ⚠️ وثمنه معلَن: عطلٌ في الإرسال لا يصل الطالب — **وهو المقصود أصلاً**، إذ
   * إعلامه بالفشل يكشف أن الحساب موجود. فيُسجَّل في سجلّ الخادم وحده.
   */
  async forgotPassword(username: string): Promise<void> {
    void this.deliverPasswordReset(username).catch((e) => {
      this.logger.warn(`password reset delivery failed: ${(e as Error).message}`);
    });
  }

  private async deliverPasswordReset(username: string): Promise<void> {
    const identity = await this.prisma.loginIdentity.findUnique({
      where: { username },
      include: { company: { select: { email: true, orgName: true } } },
    });
    const email = identity?.actorType === 'COMPANY' ? identity.company?.email : null;
    if (!identity || !email) return;

    // One live token per identity: a fresh request invalidates older links,
    // so the newest email is always the one that works.
    await this.prisma.passwordResetToken.deleteMany({ where: { loginIdentityId: identity.id, usedAt: null } });

    const token = crypto.randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        loginIdentityId: identity.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + AuthService.RESET_TOKEN_TTL_MS),
      },
    });

    const link = `${this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173')}/reset-password?token=${token}`;
    await this.mail.send(
      email,
      'استعادة كلمة المرور — mad-app',
      `وصلنا طلب لاستعادة كلمة مرور حساب «${identity.company?.orgName}».\n\n` +
        `لتعيين كلمة مرور جديدة افتح الرابط التالي خلال 30 دقيقة:\n${link}\n\n` +
        `إن لم تطلب ذلك فتجاهل هذه الرسالة — كلمة مرورك لم تتغير.`,
    );
  }

  /** Completes a reset: one token, one use, and every open session dies with
   * the old password — a stolen refresh token must not outlive it. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException(MSG.reset_token_invalid);
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.loginIdentity.update({ where: { id: record.loginIdentityId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { loginIdentityId: record.loginIdentityId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ---------- Self-registration ----------

  /**
   * A merchant signs itself up (CLAUDE.md §10: «العميل يسجّل بنفسه») and gets a
   * trial subscription. TRIAL_DAYS is env-config, not code — trial length is a
   * commercial decision the owner adjusts without a deploy.
   *
   * الإنشاء نفسه في `createCompanyAccount` — **نواة واحدة** يتقاسمها هذا المسار
   * ومسار لوحة المدير (قرار المالك 2026-08-14: القنوات الأخرى أدوارٌ على نموذجٍ
   * واحد لا مسارات موازية). وما يخصّ التسجيل الذاتي وحده يبقى هنا: مفتاح
   * الإطفاء · اختيار القالب الأوسع · مدة التجربة.
   *
   * واختيار النشاط عند التسجيل (بند ٢ في ترتيب التنفيذ المعتمد) لم يُبنَ بعد —
   * وقد صار قراراً محسوماً لا معلَّقاً، فيُضاف **داخل** النواة لا هنا.
   */
  async register(orgName: string, username: string, password: string, email?: string): Promise<LoginResult> {
    if (this.config.get<string>('REGISTRATION_ENABLED', 'true') === 'false') {
      throw new ForbiddenException(MSG.register_disabled);
    }

    // The broadest template: a new merchant sees the whole product during its
    // trial; narrowing is what employee sub-accounts are for.
    //
    // 🔴 **وليس النظاميَّ** (`ق-٦٤٤`): كان الاختيارُ «أوّلَ قالبٍ عامٍّ شامل» بترتيب
    // الإنشاء — وقالبُ المطوّر (`isSystem`) يُنشأ في التأسيس **قبل** القالب العامّ
    // بأجزاء ثانية، فكان كلُّ تاجرٍ يُسجّل نفسَه يركب قالبَ المطوّر. مقيسٌ 2026-09-12:
    // **٢٤٠ من ٥١٤** في التطوير **و٦ من ٦** في المنشور. **فوسمٌ «نظاميّ» يُمنح لمن يُنشئ
    // نفسَه لا يعني شيئاً** — وكلُّ فحصٍ يعتمده (لا يُسنَد لحسابٍ فرعيّ · لا يُعدَّل ·
    // لا يُحذف) يصير أعمى. والشرطُ صريحٌ هنا لا معلَّقٌ على ترتيب صفوفٍ لا نملكه.
    const template = await this.prisma.permissionTemplate.findFirst({ where: { isAllScreens: true, companyId: null, isSystem: false }, orderBy: { createdAt: 'asc' } });
    if (!template) throw new ConflictException(MSG.register_unavailable);

    await createCompanyAccount(this.prisma, {
      username,
      password,
      orgName,
      email,
      permissionTemplateId: template.id,
      trialDays: parseInt(this.config.get<string>('TRIAL_DAYS', '14'), 10),
      // بوّابة مفتوحة بلا مصادقة — فرسالة تكرار الاسم لا تسمّي ولا تؤكّد.
      publicChannel: true,
    });

    // Reusing the full login path gives the new merchant a working session in
    // the same response — no second request, no divergent session logic.
    return this.login(username, password);
  }

  /**
   * هاشٌ شبح للمقارنة الوهمية في `login`. يُولَّد **مرة واحدة عند أول حاجة**
   * ويُحفظ: توليده في كل طلب يضيف زمن `hash` فوق زمن `verify` فيقلب الفرق
   * بدل أن يمحوه — والهدف مساواة الزمنين لا تكبير أحدهما.
   *
   * ⚠️ ويُولَّد بـ`argon2.hash` نفسها بمعاملاتها الافتراضية — هي المستعملة في
   * التسجيل وإعادة التعيين، فالتطابق مضمون بالبناء لا بالنسخ. وثابتٌ منسوخ من
   * بيئةٍ أخرى قد يحمل معاملاتٍ أخفّ فيُعيد الفرق من حيث لا يُرى.
   */
  private decoyHashPromise: Promise<string> | null = null;
  private decoyHash(): Promise<string> {
    this.decoyHashPromise ??= argon2.hash(crypto.randomBytes(32).toString('hex'));
    return this.decoyHashPromise;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(ttl.trim());
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
    return value * unitMs;
  }
}
