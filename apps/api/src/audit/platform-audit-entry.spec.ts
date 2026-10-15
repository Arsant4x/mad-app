import { Controller, Get, Logger, Patch } from '@nestjs/common';
import { PlatformRole } from '@mad-app/db';
import { CLIENT_CLOSED_STATUS, PlatformAuditRequest, platformAuditEntries, routePattern } from './platform-audit-entry';
import { PlatformAuditService } from './platform-audit.service';

const base: PlatformAuditRequest = {
  adminId: 'admin-1',
  adminName: 'ops-admin',
  adminRole: PlatformRole.OPERATIONS,
  method: 'PATCH',
  route: '/companies/:id',
  params: { id: 'company-1' },
  body: { orgName: 'New name', password: 'NewPass123!' },
  status: 200,
  ip: '10.0.0.1',
  targetParam: 'id',
};

describe('platform audit entries', () => {
  it('keeps the admin, role, route, params, target company, status and address', () => {
    const { row } = platformAuditEntries(base);
    expect(row).toMatchObject({
      adminId: 'admin-1',
      adminName: 'ops-admin',
      adminRole: PlatformRole.OPERATIONS,
      method: 'PATCH',
      route: '/companies/:id',
      params: { id: 'company-1' },
      targetCompanyId: 'company-1',
      status: 200,
      ip: '10.0.0.1',
    });
  });

  it('removes secrets from the body with the company audit redaction', () => {
    const { row, company } = platformAuditEntries(base);
    expect(row.details).toEqual({ orgName: 'New name', password: '[محذوف]' });
    expect(company?.details).toEqual({ orgName: 'New name', password: '[محذوف]' });
    expect(JSON.stringify({ row, company })).not.toContain('NewPass123!');
  });

  it('keeps no body for a refused request, and the company sees the refusal without it', () => {
    const { row, company } = platformAuditEntries({ ...base, status: 403 });
    expect(row.details).toBeNull();
    expect(company?.details).toEqual({ outcome: 'rejected', status: 403 });
  });

  it('names no company when the route declares no company parameter', () => {
    const { row, company } = platformAuditEntries({ ...base, route: '/admin/decisions/:id/approve', method: 'POST', targetParam: undefined });
    expect(row.targetCompanyId).toBeNull();
    expect(company).toBeNull();
  });

  it('writes to the company trail only for a change, with the platform admin as actor', () => {
    expect(platformAuditEntries({ ...base, method: 'GET', body: undefined }).company).toBeNull();
    expect(platformAuditEntries({ ...base, status: 404 }).company).toBeNull();
    expect(platformAuditEntries({ ...base, status: 400 }).company).toBeNull();
    expect(platformAuditEntries({ ...base, status: CLIENT_CLOSED_STATUS }).company).toBeNull();
    expect(platformAuditEntries(base).company).toMatchObject({
      companyId: 'company-1',
      actorType: 'PLATFORM_ADMIN',
      actorId: 'admin-1',
      actorName: 'ops-admin',
      action: 'edit',
      entity: 'companies',
      entityId: 'company-1',
    });
  });

  it('reads the route pattern from the controller and handler paths', () => {
    @Controller('companies')
    class Probe {
      @Get()
      list() {}
      @Patch(':id/subscription')
      sub() {}
    }
    expect(routePattern(Probe, Probe.prototype.list)).toBe('/companies');
    expect(routePattern(Probe, Probe.prototype.sub)).toBe('/companies/:id/subscription');
  });
});

describe('platform audit write failure', () => {
  it('is logged as an error and never thrown back at the request', async () => {
    const tenantPrisma = { runAsPlatformAdmin: jest.fn().mockRejectedValue(new Error('database down')) };
    const service = new PlatformAuditService({ getAllAndOverride: () => undefined } as never, tenantPrisma as never, {} as never, {} as never);
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    let onClose: (() => void) | undefined;
    const res = { once: (event: string, fn: () => void) => (event === 'close' ? (onClose = fn) : undefined), writableFinished: true, statusCode: 200 };
    const req = { user: { username: 'ops-admin' }, method: 'GET', params: {}, body: undefined, ip: '10.0.0.1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getClass: () => class {},
      getHandler: () => () => undefined,
    };

    expect(() => service.track(context as never, { id: 'admin-1', role: PlatformRole.OWNER })).not.toThrow();
    expect(onClose).toBeDefined();
    jest.useFakeTimers();
    try {
      onClose?.();
      await jest.runAllTimersAsync();
    } finally {
      jest.useRealTimers();
    }
    expect(tenantPrisma.runAsPlatformAdmin).toHaveBeenCalledTimes(3);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('Could not write platform audit entry for GET /: database down'));
    errors.mockRestore();
  });
});
