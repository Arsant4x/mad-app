import { ALL_ACTIONS, ALLOWED_SCREENS, SCREEN_ACTIONS, actionsFor, isActionAllowed } from './screens';
import { clipToCompany, companyGrantsOf } from './template-clip.util';

/**
 * The salaries action exists on the employees screen only. A template granting the screen with no action list grants
 * it (that is what "all actions" means); an explicit list grants it only when it names it. The company owner always
 * holds it, so a company template written before it existed does not take it from the owner or from those the owner
 * grants it to.
 */
describe('The salaries action', () => {
  it('exists on the employees screen only', () => {
    expect(actionsFor('employees')).toEqual([...SCREEN_ACTIONS, 'salaries']);
    for (const screen of ALLOWED_SCREENS.filter((s) => s !== 'employees')) expect(actionsFor(screen)).toEqual([...SCREEN_ACTIONS]);
    expect(ALL_ACTIONS).toEqual([...SCREEN_ACTIONS, 'salaries']);
    // Not even an all-screens template holds it elsewhere.
    expect(isActionAllowed(true, [], null, 'contracts', 'salaries')).toBe(false);
    expect(isActionAllowed(true, [], null, 'employees', 'salaries')).toBe(true);
  });

  it('is part of "all actions" on the screen, and absent from an explicit list that does not name it', () => {
    expect(isActionAllowed(false, ['employees'], null, 'employees', 'salaries')).toBe(true);
    expect(isActionAllowed(false, ['employees'], { employees: ['view', 'add', 'edit', 'delete'] }, 'employees', 'salaries')).toBe(false);
    expect(isActionAllowed(false, ['employees'], { employees: ['view', 'salaries'] }, 'employees', 'salaries')).toBe(true);
    expect(isActionAllowed(false, ['contracts'], { contracts: ['view'] }, 'employees', 'salaries')).toBe(false);
  });

  it('the company template as the owner holds it adds the salaries action to an explicit employees list', () => {
    const narrow = companyGrantsOf({ isAllScreens: false, allowedScreens: ['employees', 'contracts'], screenActions: { employees: ['view', 'edit'], contracts: ['view'] } });
    expect(narrow.screenActions).toEqual({ employees: ['view', 'edit', 'salaries'], contracts: ['view'] });
    // Nothing to add where every action is granted already, and a screen the template does not grant stays closed.
    expect(companyGrantsOf({ isAllScreens: true, allowedScreens: [], screenActions: null }).screenActions).toBeNull();
    expect(companyGrantsOf({ isAllScreens: false, allowedScreens: ['employees'], screenActions: null }).screenActions).toBeNull();
    const closed = companyGrantsOf({ isAllScreens: false, allowedScreens: ['contracts'], screenActions: { contracts: ['view'], employees: ['view'] } });
    expect(closed.screenActions?.employees).toEqual(['view']);
    expect(isActionAllowed(false, closed.allowedScreens, closed.screenActions, 'employees', 'salaries')).toBe(false);
  });

  it('an employee granted every action on the screen holds it within a company template that lists the screen without it', () => {
    const company = companyGrantsOf({ isAllScreens: false, allowedScreens: ['employees'], screenActions: { employees: ['view', 'add', 'edit', 'delete'] } });
    const everything = clipToCompany({ isAllScreens: false, allowedScreens: ['employees'], screenActions: null }, company);
    expect(isActionAllowed(false, everything.allowedScreens, everything.screenActions, 'employees', 'salaries')).toBe(true);
    const clerk = clipToCompany({ isAllScreens: false, allowedScreens: ['employees'], screenActions: { employees: ['view'] } }, company);
    expect(isActionAllowed(false, clerk.allowedScreens, clerk.screenActions, 'employees', 'salaries')).toBe(false);
  });
});
