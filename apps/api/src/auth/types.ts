import { ActorType } from '@mad-app/db';

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
  /** LoginIdentity.credentialVersion when the token was issued; a later credential change makes the token stale. */
  cv?: number;
  /** The refresh token issued with this access token, so a change made from this session can keep it. */
  sid?: string;
  /** Set only on the short session a platform administrator gets to turn the second factor on. */
  scope?: typeof MFA_ENROLMENT_SCOPE;
}

/** Scope of the enrolment-only session: it reaches the second factor enrolment routes and nothing else. */
export const MFA_ENROLMENT_SCOPE = 'mfa-enrolment' as const;

/** Resolved, freshly-checked request-scoped tenant context (set by TenantGuard). */
export interface TenantContext {
  companyId: string;
  actorType: ActorType;
  profileId: string;
  allowedScreens: string[] | 'all';
  /**
   * Which branches this actor may see. `'all'` for the company owner, and for
   * an employee whose `allBranches` flag is set (`ق-١٤٦٨`) — an employee with no
   * assignment and no flag gets `[]`: company-wide rows only.
   *
   * Unlike `companyId` — an absolute boundary enforced by RLS — this is a
   * *permission* filter applied in queries. Keep the two distinct: a bug here
   * shows one branch's data to a colleague in the same company; a bug in
   * companyId scoping leaks another company's data entirely.
   */
  allowedBranchIds: string[] | 'all';
}

declare module 'express' {
  interface Request {
    tenant?: TenantContext;
  }
}
