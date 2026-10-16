import { ALLOWED_SCREENS, ALL_ACTIONS, type ScreenAction, isActionAllowed } from '../templates/screens';
import type { TemplateGrants } from '../templates/template-clip.util';
import { DelegationRow, chainsFor } from './chain-source';
import { actorGrants } from './intersection';
import { grant } from './permission-tree';
import { delegatedTemplate, rootGrantsFrom } from './root-grants';

const row = (grantorId: string, granteeId: string, grants: string[], state = 'ACTIVE'): DelegationRow => ({ grantorId, granteeId, grants, state });

const allowedBy = (t: TemplateGrants, screen: string, action: ScreenAction) => isActionAllowed(t.isAllScreens, t.allowedScreens, t.screenActions, screen, action);

/** The guard decides with isActionAllowed on the delegated template; /me/permissions lists actorGrants. */
function expectGuardMatchesMePermissions(template: TemplateGrants, rows: DelegationRow[], actor: string) {
  const chains = chainsFor(rows, actor);
  const listed = actorGrants(rootGrantsFrom(template.isAllScreens, template.allowedScreens, template.screenActions), chains);
  const guardTemplate = delegatedTemplate(template, chains);
  let pairs = 0;
  for (const screen of ALLOWED_SCREENS) {
    // Every action name on every screen, so a screen-only action is checked where it does not exist too.
    for (const action of ALL_ACTIONS) {
      pairs++;
      expect({ pair: grant(screen, action), guard: allowedBy(guardTemplate, screen, action) }).toEqual({ pair: grant(screen, action), guard: listed.has(grant(screen, action)) });
    }
  }
  expect(pairs).toBe(ALLOWED_SCREENS.length * ALL_ACTIONS.length);
}

describe('delegatedTemplate: the tenant guard reads the same grants as /me/permissions', () => {
  const editor: TemplateGrants = { isAllScreens: false, allowedScreens: ['contracts', 'employees'], screenActions: { contracts: ['view', 'edit'], employees: ['view'] } };
  const everything: TemplateGrants = { isAllScreens: true, allowedScreens: [], screenActions: null };
  const noDetail: TemplateGrants = { isAllScreens: false, allowedScreens: ['contracts'], screenActions: null };

  it('returns the template itself when nobody delegated to the actor', () => {
    expect(delegatedTemplate(editor, [])).toBe(editor);
    expectGuardMatchesMePermissions(editor, [row('owner', 'other', ['contracts:view'])], 'emp');
  });

  it('a revoked delegation leaves no screen at all', () => {
    const rows = [row('owner', 'emp', ['contracts:view', 'contracts:edit'], 'REVOKED')];
    const t = delegatedTemplate(editor, chainsFor(rows, 'emp'));
    expect(t.isAllScreens).toBe(false);
    expect(t.allowedScreens).toEqual([]);
    expect(allowedBy(t, 'contracts', 'edit')).toBe(false);
    expect(allowedBy(t, 'contracts', 'view')).toBe(false);
    expectGuardMatchesMePermissions(editor, rows, 'emp');
  });

  it('a narrower delegation keeps only the delegated actions, even under a screen with no action detail', () => {
    const rows = [row('owner', 'emp', ['contracts:view'])];
    const t = delegatedTemplate(noDetail, chainsFor(rows, 'emp'));
    expect(t.allowedScreens).toEqual(['contracts']);
    expect(t.screenActions).toEqual({ contracts: ['view'] });
    expect(allowedBy(t, 'contracts', 'edit')).toBe(false);
    expectGuardMatchesMePermissions(noDetail, rows, 'emp');
  });

  it('the template stays the ceiling: a delegation cannot add what the template lacks', () => {
    const rows = [row('owner', 'emp', ['employees:edit', 'contracts:edit'])];
    const t = delegatedTemplate(editor, chainsFor(rows, 'emp'));
    expect(allowedBy(t, 'employees', 'edit')).toBe(false);
    expect(allowedBy(t, 'contracts', 'edit')).toBe(true);
    expectGuardMatchesMePermissions(editor, rows, 'emp');
  });

  it('revoking the link above a manager removes what the manager passed on', () => {
    const live = [row('owner', 'mgr', ['contracts:view', 'contracts:edit']), row('mgr', 'emp', ['contracts:view', 'contracts:edit'])];
    expect(allowedBy(delegatedTemplate(editor, chainsFor(live, 'emp')), 'contracts', 'edit')).toBe(true);
    const revoked = [row('owner', 'mgr', ['contracts:view', 'contracts:edit'], 'REVOKED'), row('mgr', 'emp', ['contracts:view', 'contracts:edit'])];
    expect(allowedBy(delegatedTemplate(editor, chainsFor(revoked, 'emp')), 'contracts', 'edit')).toBe(false);
    expectGuardMatchesMePermissions(editor, live, 'emp');
    expectGuardMatchesMePermissions(editor, revoked, 'emp');
  });

  it('two delegators give the union of their chains', () => {
    const rows = [row('owner', 'emp', ['contracts:view']), row('owner', 'mgr', ['employees:view']), row('mgr', 'emp', ['employees:view'])];
    const t = delegatedTemplate(everything, chainsFor(rows, 'emp'));
    expect([...t.allowedScreens].sort()).toEqual(['contracts', 'employees']);
    expect(t.screenActions).toEqual({ contracts: ['view'], employees: ['view'] });
    expectGuardMatchesMePermissions(everything, rows, 'emp');
  });
});
