/**
 * Grants for component tests that mock the permissions and auth contexts.
 *
 * A test mocks both modules with these factories and sets what the actor holds:
 *   vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());
 *   vi.mock('../../auth/AuthContext', async () => (await import('../../test/grants')).authModule());
 * A test that measures something other than the grant mocks the permissions with allGrantedModule.
 */
export const grants = new Set<string>();

/** The actor type the mocked auth context reports; an employee unless a test says otherwise. */
export const actor: { type: 'COMPANY' | 'COMPANY_USER' } = { type: 'COMPANY_USER' };

export function resetGrants(...held: string[]): void {
  grants.clear();
  for (const g of held) grants.add(g);
  actor.type = 'COMPANY_USER';
}

const can = (screen: string, action: string) => grants.has('*') || grants.has(`${screen}:${action}`);

export function permissionsModule() {
  return {
    usePermissions: () => ({
      loading: false,
      can,
      canSee: (screen: string) => grants.has('*') || [...grants].some((g) => g.startsWith(`${screen}:`)),
      extinguished: [],
      grantable: [],
      chains: [],
      tree: [],
      refresh: () => {},
    }),
  };
}

/** Every action held, for a test that measures something other than the grant. */
export function allGrantedModule() {
  const all = permissionsModule().usePermissions();
  return { usePermissions: () => ({ ...all, can: () => true, canSee: () => true }) };
}

export function authModule() {
  return {
    useAuth: () => ({
      user: { id: 'u1', actorType: actor.type, companyId: 'c1', displayName: 'Tester', status: 'ACTIVE' },
      logout: () => {},
    }),
  };
}
