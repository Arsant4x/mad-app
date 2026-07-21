import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateCompanyStatus } from '../common/tenant/company-status.util';
import { AccountStoppedException } from '../common/tenant/tenant.exceptions';
import { JwtPayload } from './types';

export interface AuthUserView {
  id: string;
  actorType: 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
  username: string;
  displayName: string;
  companyId: string | null;
  status: AccountStatus;
  allowedScreens: string[] | 'all';
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserView;
}

const REFRESH_TOKEN_BYTES = 32;

const IDENTITY_INCLUDE = {
  platformAdmin: true,
  company: { include: { permissionTemplate: true } },
  companyUser: { include: { company: true, permissionTemplate: true } },
} as const;

interface IdentityWithProfiles {
  id: string;
  username: string;
  actorType: 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
  platformAdmin: { id: string; displayName: string } | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const identity = await this.prisma.loginIdentity.findUnique({
      where: { username },
      include: IDENTITY_INCLUDE,
    });

    // Same generic message whether the username doesn't exist or the
    // password is wrong — never reveal which one failed.
    if (!identity) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    const passwordOk = await argon2.verify(identity.passwordHash, password);
    if (!passwordOk) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    return this.buildSessionFromIdentity(identity as unknown as IdentityWithProfiles);
  }

  /** Rotates a refresh token: the old one is revoked and a new pair is issued. */
  async refresh(presentedToken: string): Promise<LoginResult> {
    const tokenHash = this.hashToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { loginIdentity: { include: IDENTITY_INCLUDE } },
    });

    if (!stored) throw new UnauthorizedException('جلسة غير صالحة');

    if (stored.revokedAt) {
      // Reuse of an already-rotated refresh token likely means it leaked —
      // kill every session for this identity as a precaution.
      await this.prisma.refreshToken.updateMany({
        where: { loginIdentityId: stored.loginIdentityId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('جلسة غير صالحة');
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException('انتهت صلاحية الجلسة');

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    return this.buildSessionFromIdentity(stored.loginIdentity as unknown as IdentityWithProfiles);
  }

  /** Re-derives the current user's view from a valid access token payload,
   * without rotating any tokens — used by GET /auth/me on app load. */
  async whoAmI(payload: JwtPayload): Promise<AuthUserView> {
    const identity = await this.prisma.loginIdentity.findUnique({
      where: { id: payload.sub },
      include: IDENTITY_INCLUDE,
    });
    if (!identity) throw new UnauthorizedException('جلسة غير صالحة');

    if (identity.actorType === 'PLATFORM_ADMIN' && identity.platformAdmin) {
      return { id: identity.platformAdmin.id, actorType: 'PLATFORM_ADMIN', username: identity.username, displayName: identity.platformAdmin.displayName, companyId: null, status: 'ACTIVE', allowedScreens: 'all' };
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
      };
    }
    throw new UnauthorizedException('جلسة غير صالحة');
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
      user = { id: identity.platformAdmin.id, actorType: 'PLATFORM_ADMIN', username: identity.username, displayName: identity.platformAdmin.displayName, companyId: null, status: 'ACTIVE', allowedScreens: 'all' };
    } else if (identity.actorType === 'COMPANY' && identity.company) {
      const company = identity.company;
      const evaluated = evaluateCompanyStatus(company);
      if (evaluated.status !== company.status || evaluated.frozenAt?.getTime() !== company.frozenAt?.getTime()) {
        await this.prisma.company.update({ where: { id: company.id }, data: { status: evaluated.status, frozenAt: evaluated.frozenAt } });
      }
      if (evaluated.status === 'STOPPED') throw new AccountStoppedException();

      payload = { sub: identity.id, actorType: 'COMPANY', companyId: company.id, profileId: company.id, username: identity.username };
      user = {
        id: company.id,
        actorType: 'COMPANY',
        username: identity.username,
        displayName: company.orgName,
        companyId: company.id,
        status: evaluated.status,
        allowedScreens: company.permissionTemplate.isAllScreens ? 'all' : company.permissionTemplate.allowedScreens,
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
      };
    } else {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
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
