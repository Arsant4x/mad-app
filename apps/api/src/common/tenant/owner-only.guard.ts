import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/types';
import { MSG } from '../i18n/messages';

/**
 * Runs after TenantGuard on routes only the COMPANY OWNER may reach —
 * decisions that stay the merchant's even when an employee holds the same
 * screen (support-access consent, integration keys…). Employees get a clear
 * Arabic refusal, not a mysterious 404.
 */
@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;
    if (payload?.actorType !== 'COMPANY') throw new ForbiddenException(MSG.owner_only);
    return true;
  }
}
