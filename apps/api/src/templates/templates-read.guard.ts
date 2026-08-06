import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/types';
import { MSG } from '../common/i18n/messages';

/** Reading the template list is broader than managing templates: a company
 * owner needs it to populate the "assign a template" dropdown when creating
 * an employee sub-account, even though only a platform admin can actually
 * create/edit/delete templates (see PlatformAdminGuard on those routes). */
@Injectable()
export class TemplatesReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;
    if (!payload) throw new UnauthorizedException();
    if (payload.actorType !== 'PLATFORM_ADMIN' && payload.actorType !== 'COMPANY') {
      throw new ForbiddenException(MSG.templates_read_forbidden);
    }
    return true;
  }
}
