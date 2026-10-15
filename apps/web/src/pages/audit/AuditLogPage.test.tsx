import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogPage } from './AuditLogPage';

vi.mock('../../api/audit', () => ({ listAuditLog: vi.fn() }));

import { listAuditLog } from '../../api/audit';

// Three times the slowest measured run of this file under the full suite.
vi.setConfig({ testTimeout: 10_000 });

const entry = (over: Record<string, unknown>) => ({
  id: 'e1',
  actorType: 'COMPANY_USER',
  actorId: 'u1',
  actorName: 'employee',
  screen: 'general',
  action: 'edit',
  entity: 'companies',
  entityId: 'c1',
  summary: 'summary',
  details: null,
  ip: null,
  createdAt: '2026-10-16T08:00:00Z',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('audit log actor', () => {
  it('marks a row written by a platform administrator, and only that row', async () => {
    vi.mocked(listAuditLog).mockResolvedValue([
      entry({ id: 'p1', actorType: 'PLATFORM_ADMIN', actorName: 'platform-admin' }),
      entry({ id: 'u1', actorType: 'COMPANY_USER', actorName: 'employee' }),
    ] as never);
    render(<AuditLogPage />);

    await waitFor(() => expect(screen.getByText('platform-admin')).toBeInTheDocument());
    expect(screen.getByText('platform-admin').closest('td')).toHaveTextContent('platform-admin (إدارة المنصّة)');
    expect(screen.getByText('employee').closest('td')).toHaveTextContent(/^employee$/);
  });
});
