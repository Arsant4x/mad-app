import { PATH_METADATA } from '@nestjs/common/constants';
import { PlatformRole } from '@mad-app/db';
import { safeDetails } from './audit.interceptor';
import type { AuditEntryInput } from './audit.service';

/** Status written when the client closed the connection before the response finished. */
export const CLIENT_CLOSED_STATUS = 499;

export interface PlatformAuditRequest {
  adminId: string;
  adminName: string;
  adminRole: PlatformRole;
  method: string;
  route: string;
  params: Record<string, unknown> | undefined;
  body: unknown;
  /** The status sent, or CLIENT_CLOSED_STATUS. */
  status: number;
  ip: string | null;
  /** The route parameter that names the company the route acts on, when the route declares one. */
  targetParam: string | undefined;
}

export interface PlatformAuditRow {
  adminId: string;
  adminName: string;
  adminRole: PlatformRole;
  method: string;
  route: string;
  params: Record<string, string> | null;
  targetCompanyId: string | null;
  status: number;
  details: Record<string, unknown> | null;
  ip: string | null;
}

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * The declared route pattern from the controller and handler paths, for example /companies/:id.
 * Read from the route metadata, so it is the same whichever version prefix the request used.
 */
export function routePattern(controller: object, handler: object): string {
  const segments = [Reflect.getMetadata(PATH_METADATA, controller), Reflect.getMetadata(PATH_METADATA, handler)]
    .map((p: unknown) => (Array.isArray(p) ? p[0] : p))
    .flatMap((p: unknown) => (typeof p === 'string' ? p.split('/') : []))
    .filter(Boolean);
  return `/${segments.join('/')}`;
}

function stringParams(params: Record<string, unknown> | undefined): Record<string, string> | null {
  if (!params) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) if (typeof value === 'string') out[key] = value;
  return Object.keys(out).length ? out : null;
}

/**
 * The platform audit row for one request, and the row for the company's own trail when the
 * request changed one declared company.
 *
 * The body is kept, with the company audit redaction, only when the request succeeded; a refused
 * request records that it happened and its status, not what it tried, as the company trail does.
 * The company row follows the company trail rules: a success, or a refusal by permission (403) or
 * by state (409).
 */
export function platformAuditEntries(input: PlatformAuditRequest): { row: PlatformAuditRow; company: AuditEntryInput | null } {
  const params = stringParams(input.params);
  const targetCompanyId = input.targetParam ? params?.[input.targetParam] ?? null : null;
  const succeeded = input.status >= 200 && input.status < 300;
  const details = succeeded ? safeDetails(input.body) : null;

  const row: PlatformAuditRow = {
    adminId: input.adminId,
    adminName: input.adminName,
    adminRole: input.adminRole,
    method: input.method,
    route: input.route,
    params,
    targetCompanyId,
    status: input.status,
    details,
    ip: input.ip,
  };

  const changesCompany = targetCompanyId !== null && MUTATIONS.has(input.method);
  const recordedOutcome = succeeded || input.status === 403 || input.status === 409;
  if (!changesCompany || !recordedOutcome) return { row, company: null };

  const company: AuditEntryInput = {
    companyId: targetCompanyId,
    actorType: 'PLATFORM_ADMIN',
    actorId: input.adminId,
    actorName: input.adminName,
    screen: 'general',
    action: input.method === 'POST' ? 'add' : input.method === 'DELETE' ? 'delete' : 'edit',
    entity: input.route.split('/').filter(Boolean)[0] ?? 'unknown',
    entityId: targetCompanyId,
    method: input.method,
    path: input.route,
    details: succeeded ? details : { outcome: 'rejected', status: input.status },
    ip: input.ip,
  };
  return { row, company };
}
