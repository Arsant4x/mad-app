import { useEffect, useState } from 'react';
import { listCompanyUsers, type CompanyUser } from '../../api/companyUsers';
import { getDelegationLog, type DelegationLog, type LogNode } from '../../api/delegations';
import { SCREEN_LABELS, ACTION_LABELS, type ScreenAction } from '../../api/templates';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import { formatDateTime } from '../../i18n/format';

/**
 * Delegation log: a standalone compliance screen, read across the whole
 * company ("who delegated what to whom, and when") rather than per employee.
 *
 * Three things are never hidden here:
 * 1. Revoked rows stay visible and sealed. The log is append only, and hiding a
 *    revoked row in the view tells a different story, just like deleting it.
 * 2. A gap in `seq` is shown plainly. It means a row went missing, the only sign
 *    of tampering that got past the database triggers.
 * 3. A forest, not a tree. The server returns several `roots`: a delegation
 *    between two employees that never passed through the owner has its own root
 *    and would otherwise vanish from the log.
 */

const grantLabel = (g: string): string => {
  const at = g.lastIndexOf(':');
  const screen = g.slice(0, at);
  const action = g.slice(at + 1) as ScreenAction;
  const s = SCREEN_LABELS[screen as keyof typeof SCREEN_LABELS] ?? screen;
  return `${s}: ${ACTION_LABELS[action] ?? action}`;
};

function Node({ node, nameOf, depth }: { node: LogNode; nameOf: (id: string) => string; depth: number }) {
  return (
    <li className="deleg-log-node" data-testid={`log-node-${node.granteeId}`} style={{ marginInlineStart: depth * 16 }}>
      <strong>{nameOf(node.granteeId)}</strong>
      {node.entries.length > 0 && (
        <ul className="deleg-log-entries">
          {node.entries.map((e) => (
            <li key={e.seq} data-testid={`log-entry-${e.seq}`}>
              <span className="num">#{e.seq}</span>{' '}
              <span>{nameOf(e.grantorId)} ⇐ {nameOf(e.granteeId)}</span>{' '}
              <span className="muted">{e.grants.map(grantLabel).join(' · ')}</span>{' '}
              <time>{formatDateTime(e.at)}</time>
            </li>
          ))}
        </ul>
      )}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <Node key={c.granteeId} node={c} nameOf={nameOf} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DelegationLogPage() {
  const { t } = useTranslation();
  const [log, setLog] = useState<DelegationLog | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDelegationLog(), listCompanyUsers()])
      .then(([l, u]) => {
        setLog(l);
        setUsers(u);
      })
      .catch((e) => setError(apiErrorMessage(e, t('audit.delegation.load_failed'))));
  }, []);

  // An id with no matching employee is shown as is, never dropped: an orphan row
  // is information in a log nothing may be removed from.
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="page">
      <div className="topbar">
        <h2>{t('audit.delegation.title')}</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!log && !error && <p>{t('audit.loading')}</p>}

      {log?.sequenceBreak && (
        <p className="error" role="alert" data-testid="sequence-break">
          {t('audit.delegation.sequence_break', { at: log.sequenceBreak.at, expected: log.sequenceBreak.expected })}
        </p>
      )}

      {log && log.rows.length === 0 && <p className="muted" data-testid="log-empty">{t('audit.delegation.empty')}</p>}

      {log && log.rows.length > 0 && (
        <>
          <ul className="deleg-log" data-testid="deleg-log">
            {log.roots.map((r) => (
              <Node key={r.granteeId} node={r} nameOf={nameOf} depth={0} />
            ))}
          </ul>

          <h3>{t('audit.delegation.rows_title')}</h3>
          <table className="table" data-testid="deleg-log-rows">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('audit.delegation.col.from')}</th>
                <th>{t('audit.delegation.col.to')}</th>
                <th>{t('audit.delegation.col.grants')}</th>
                <th>{t('audit.delegation.col.state')}</th>
                <th>{t('audit.delegation.col.date')}</th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((r) => (
                <tr key={r.id} data-testid={`log-row-${r.seq}`} data-state={r.state}>
                  <td className="num">{r.seq}</td>
                  <td>{nameOf(r.grantorId)}</td>
                  <td>{nameOf(r.granteeId)}</td>
                  <td>{r.grants.map(grantLabel).join(' · ')}</td>
                  <td>
                    <span className={r.state === 'ACTIVE' ? 'badge' : 'badge sealed'}>
                      {r.state === 'ACTIVE' ? t('audit.delegation.active') : t('audit.delegation.revoked')}
                    </span>
                  </td>
                  <td>{formatDateTime(r.state === 'ACTIVE' ? r.createdAt : (r.revokedAt ?? r.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
