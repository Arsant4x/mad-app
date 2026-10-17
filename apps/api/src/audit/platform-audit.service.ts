import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole, Prisma } from '@mad-app/db';
import { Request, Response } from 'express';
import { JwtPayload } from '../auth/types';
import { PLATFORM_AUDIT_TARGET_KEY } from '../common/platform-admin/platform-audit-target.decorator';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dateFilterEnd } from '../common/dto/date-filter.decorator';
import { DEFAULT_PAGE_SIZE } from '../common/dto/paged-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { ListPlatformAuditQueryDto } from './dto/list-platform-audit-query.dto';
import { CLIENT_CLOSED_STATUS, PlatformAuditRow, platformAuditEntries, routePattern } from './platform-audit-entry';

/**
 * The platform audit log: who among the platform administrators did what, on which route,
 * with which result.
 *
 * The guard calls track() once it has identified the administrator, so every route under it is
 * covered without its author doing anything, and a refusal by the guard itself is covered too.
 * The row is written when the response closes, so it carries the status the client got. Writing
 * happens after the response, so a failed write can never break the request; it is logged as an
 * error for operators instead.
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  track(context: ExecutionContext, admin: { id: string; role: PlatformRole }): void {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const payload = req.user as JwtPayload;
    const route = routePattern(context.getClass(), context.getHandler());
    const targetParam = this.reflector.getAllAndOverride<string | undefined>(PLATFORM_AUDIT_TARGET_KEY, [context.getHandler(), context.getClass()]);

    res.once('close', () => {
      const { row, company } = platformAuditEntries({
        adminId: admin.id,
        adminName: payload.username,
        adminRole: admin.role,
        method: req.method.toUpperCase(),
        route,
        params: req.params,
        body: req.body,
        status: res.writableFinished ? res.statusCode : CLIENT_CLOSED_STATUS,
        ip: req.ip ?? null,
        targetParam,
      });
      void this.record(row).catch((e: Error) => this.logger.error(`Could not write platform audit entry for ${row.method} ${row.route}: ${e.message}`));
      if (company) {
        void this.recordForCompany(company).catch((e: Error) => this.logger.error(`Could not write company audit entry for ${row.method} ${row.route} on ${company.companyId}: ${e.message}`));
      }
    });
  }

  /** Writes one row, retrying a transient failure the way the company trail does. */
  async record(row: PlatformAuditRow): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.tenantPrisma.runAsPlatformAdmin((tx) =>
          tx.platformAuditLog.create({
            data: {
              adminId: row.adminId,
              adminName: row.adminName,
              adminRole: row.adminRole,
              method: row.method,
              route: row.route,
              params: (row.params ?? Prisma.DbNull) as Prisma.InputJsonValue,
              targetCompanyId: row.targetCompanyId,
              status: row.status,
              details: (row.details ?? Prisma.DbNull) as Prisma.InputJsonValue,
              ip: row.ip,
            },
          }),
        );
        return;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
    throw lastError;
  }

  /** The company's own trail, only for a company that exists: a refused request may name any id. */
  private async recordForCompany(entry: Parameters<AuditService['record']>[0]): Promise<void> {
    const exists = await this.prisma.company.findUnique({ where: { id: entry.companyId }, select: { id: true } });
    if (!exists) return;
    await this.audit.record(entry);
  }

  /** Newest first, a page at a time, filtered by administrator, company and date. */
  async list(query: ListPlatformAuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(query.adminId ? { adminId: query.adminId } : {}),
      ...(query.companyId ? { targetCompanyId: query.companyId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: dateFilterEnd(query.to) } : {}),
            },
          }
        : {}),
    };
    return this.tenantPrisma.runAsPlatformAdmin(async (tx) => {
      const [total, items] = await Promise.all([
        tx.platformAuditLog.count({ where }),
        tx.platformAuditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { items, total, page, pageSize };
    });
  }
}
