import { evaluateCompanyStatus } from './company-status.util';

describe('evaluateCompanyStatus', () => {
  it('stays ACTIVE while subscription has not ended', () => {
    const now = new Date('2026-06-01');
    const result = evaluateCompanyStatus({ status: 'ACTIVE', frozenAt: null, subEnd: new Date('2026-07-01') }, now);
    expect(result.status).toBe('ACTIVE');
  });

  it('transitions ACTIVE -> FROZEN once past subEnd', () => {
    const now = new Date('2026-07-05');
    const result = evaluateCompanyStatus({ status: 'ACTIVE', frozenAt: null, subEnd: new Date('2026-07-01') }, now);
    expect(result.status).toBe('FROZEN');
    expect(result.frozenAt).toEqual(now);
  });

  it('stays FROZEN within the 30-day grace period', () => {
    const frozenAt = new Date('2026-07-01');
    const now = new Date('2026-07-20');
    const result = evaluateCompanyStatus({ status: 'FROZEN', frozenAt, subEnd: new Date('2026-06-01') }, now);
    expect(result.status).toBe('FROZEN');
  });

  it('transitions FROZEN -> STOPPED after the 30-day grace period', () => {
    const frozenAt = new Date('2026-07-01');
    const now = new Date('2026-08-05');
    const result = evaluateCompanyStatus({ status: 'FROZEN', frozenAt, subEnd: new Date('2026-06-01') }, now);
    expect(result.status).toBe('STOPPED');
  });

  it('never auto-changes a company with no subscription end date (e.g. the developer template)', () => {
    const result = evaluateCompanyStatus({ status: 'ACTIVE', frozenAt: null, subEnd: null });
    expect(result.status).toBe('ACTIVE');
  });
});
