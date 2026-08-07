import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService, type TemplateScope } from './templates.service';
import { MSG } from '../common/i18n/messages';

/**
 * Permission templates, scoped by actor (CLAUDE.md §3.5):
 *
 * - **Platform admin** manages the GLOBAL presets (companyId null) every
 *   company can start from.
 * - **Company owner** manages their OWN company's templates — deciding what
 *   their employees may do is the owner's call, made in the owner's UI.
 * - **Employees** may read (their account form needs the list) but never write.
 */
@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  /** The caller's writable scope — or a 403 for actors with no write scope. */
  private writeScope(req: Request): TemplateScope {
    const payload = req.user as JwtPayload;
    if (payload.actorType === 'PLATFORM_ADMIN') return { companyId: null };
    if (payload.actorType === 'COMPANY') return { companyId: payload.companyId };
    throw new ForbiddenException(MSG.templates_owner_only);
  }

  @Get()
  list(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    // Admin sees everything; a tenant (owner or employee) sees global + own.
    return this.templatesService.list(payload.actorType === 'PLATFORM_ADMIN' ? { companyId: null } : { companyId: payload.companyId! });
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto, this.writeScope(req));
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto, this.writeScope(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.templatesService.remove(id, this.writeScope(req));
  }
}
