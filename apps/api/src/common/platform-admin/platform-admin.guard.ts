import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/types';

/**
 * Runs after JwtAuthGuard on platform-admin-only routes (company/template
 * management). Unlike TenantGuard, a platform admin has no companyId and no
 * permission template to check — the only gate is actorType itself.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;
    if (!payload) throw new UnauthorizedException();
    if (payload.actorType !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException('هذا الإجراء متاح لحساب المطوّر فقط');
    }
    return true;
  }
}
