import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/types';
import { evaluateCompanyStatus } from './company-status.util';
import { AccountFrozenException, AccountStoppedException, ScreenForbiddenException } from './tenant.exceptions';
import { REQUIRES_SCREEN_KEY } from './requires-screen.decorator';
import { MSG } from '../i18n/messages';

/**
 * Runs after JwtAuthGuard on every tenant (COMPANY / COMPANY_USER) route.
 * Re-checks status straight from the DB on every request — the JWT is not
 * trusted for authorization decisions, only identity, because a company can
 * be frozen/stopped mid-session and that must take effect immediately without
 * waiting for the token to expire.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;
    if (!payload || !payload.companyId) {
      throw new UnauthorizedException(MSG.company_login_required);
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: payload.companyId },
      include: { permissionTemplate: true },
    });

    const evaluated = evaluateCompanyStatus(company);
    if (evaluated.status !== company.status || evaluated.frozenAt?.getTime() !== company.frozenAt?.getTime()) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { status: evaluated.status, frozenAt: evaluated.frozenAt },
      });
    }

    if (evaluated.status === 'STOPPED') throw new AccountStoppedException();
    if (evaluated.status === 'FROZEN') throw new AccountFrozenException();

    let allowedScreens: string[] | 'all' = company.permissionTemplate.isAllScreens ? 'all' : company.permissionTemplate.allowedScreens;
    // The company owner always sees every branch, including the consolidated
    // view (CLAUDE.md 6.8) — only employees can be narrowed.
    let allowedBranchIds: string[] | 'all' = 'all';

    if (payload.actorType === 'COMPANY_USER') {
      const companyUser = await this.prisma.companyUser.findUniqueOrThrow({
        where: { id: payload.profileId },
        include: { permissionTemplate: true, branches: { select: { branchId: true } } },
      });
      if (companyUser.status !== 'ACTIVE') {
        throw new AccountFrozenException();
      }
      allowedScreens = companyUser.permissionTemplate.isAllScreens ? 'all' : companyUser.permissionTemplate.allowedScreens;
      // No assignment means unrestricted, not "no access" — otherwise every
      // employee account that existed before branches shipped would have been
      // locked out of everything the moment this rolled out.
      allowedBranchIds = companyUser.branches.length > 0 ? companyUser.branches.map((b) => b.branchId) : 'all';
    }

    // getAllAndOverride, not get(..., context.getHandler()) alone — every
    // @RequiresScreen() in this app decorates the controller *class*, not
    // individual method handlers, so a handler-only lookup always returned
    // undefined and silently skipped this check entirely. Real bug, caught
    // manually while testing the new permission-template feature: a
    // limited-template CompanyUser could reach any screen's endpoints.
    const requiredScreen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]);
    if (requiredScreen && allowedScreens !== 'all' && !allowedScreens.includes(requiredScreen)) {
      throw new ScreenForbiddenException(requiredScreen);
    }

    req.tenant = {
      companyId: payload.companyId,
      actorType: payload.actorType,
      profileId: payload.profileId,
      allowedScreens,
      allowedBranchIds,
    };
    return true;
  }
}
