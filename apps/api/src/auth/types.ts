import { ActorType } from '@prisma/client';

/** Claims carried inside the signed access token. */
export interface JwtPayload {
  /** LoginIdentity.id */
  sub: string;
  actorType: ActorType;
  /** Company.id — the tenant. Null for PLATFORM_ADMIN. */
  companyId: string | null;
  /** PlatformAdmin.id | Company.id | CompanyUser.id — the profile row id. */
  profileId: string;
  username: string;
}

/** Resolved, freshly-checked request-scoped tenant context (set by TenantGuard). */
export interface TenantContext {
  companyId: string;
  actorType: ActorType;
  profileId: string;
  allowedScreens: string[] | 'all';
}

declare module 'express' {
  interface Request {
    tenant?: TenantContext;
  }
}
