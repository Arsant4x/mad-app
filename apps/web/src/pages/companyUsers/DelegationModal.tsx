import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALLOWED_SCREENS, SCREEN_ACTIONS, SCREEN_LABELS, ACTION_LABELS } from '../../api/templates';
import { createDelegation, getDelegationView, revokeDelegation, type DelegationView } from '../../api/delegations';
import { usePermissions, type ExtinctionReason } from '../../auth/PermissionsContext';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * The delegation tree, opened from the employee rather than a separate screen: delegation is a
 * relation between two people, and a separate screen would first ask "to whom?", rebuilding the
 * employee list the user is already standing in.
 *
 * Three states, because two are not enough:
 * - held by the delegator and not granted: empty box, available to grant;
 * - granted and in force: checked;
 * - granted and extinguished: checked, struck through, with the reason.
 * The third matters most: the intersection extinguishes a grant without touching its row. Shown as
 * "not granted", the delegator would grant again with no effect, since the cause sits above them.
 *
 * What the delegator does not hold is not shown at all, not even greyed out: showing it invites an
 * attempt the server rejects. The list comes from `grantable`, computed on the server; the screen
 * shows it and does not derive it. This is display only: the server checks the ceiling on every grant.
 */

const REASON_KEY: Record<ExtinctionReason, string> = {
  NOT_IN_ROOT: 'company_users.delegation.reason.not_in_root',
  REVOKED: 'company_users.delegation.reason.revoked_above',
  NARROWED: 'company_users.delegation.reason.narrowed',
};

interface Props {
  granteeId: string;
  granteeName: string;
  onClose: () => void;
}

export function DelegationModal({ granteeId, granteeName, onClose }: Props) {
  const { t } = useTranslation();
  const { refresh } = usePermissions();
  const [view, setView] = useState<DelegationView | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getDelegationView(granteeId)
      .then((v) => {
        setView(v);
        setPicked(new Set());
      })
      .catch((e) => setError(apiErrorMessage(e, t('company_users.delegation.err_load'))));
  };

  useEffect(load, [granteeId]);

  const grantable = useMemo(() => new Set(view?.grantable ?? []), [view]);
  const active = useMemo(() => new Set(view?.active ?? []), [view]);
  const extinguished = useMemo(() => new Map((view?.extinguished ?? []).map((e) => [e.grant, e])), [view]);

  /**
   * Screens shown = those where the delegator has at least one action.
   *
   * Derived from the server's `grantable`, not from all of `ALLOWED_SCREENS`: showing the whole
   * tree would show what the delegator does not hold.
   */
  const screens = useMemo(
    () => ALLOWED_SCREENS.filter((s) => SCREEN_ACTIONS.some((a) => grantable.has(`${s}:${a}`))),
    [grantable],
  );

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!picked.size) return;
    setBusy(true);
    setError(null);
    try {
      await createDelegation(granteeId, 'root', [...picked]);
      load();
      // Permissions are read live, and a grant changes them now, not on the next navigation.
      refresh();
    } catch (e) {
      setError(apiErrorMessage(e, t('company_users.delegation.err_save')));
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeDelegation(id);
      load();
      refresh();
    } catch (e) {
      setError(apiErrorMessage(e, t('company_users.delegation.err_revoke')));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Same `overlay` + `modal-head` shell as `CompanyUserModal`.
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('company_users.delegation.aria', { name: granteeName })}>
        <div className="modal-head">
          <div className="modal-title">{t('company_users.delegation.title', { name: granteeName })}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!view && !error && <p>{t('company_users.delegation.loading')}</p>}

        {view && screens.length === 0 && (
          <p className="muted" data-testid="deleg-nothing-to-grant">
            {t('company_users.delegation.nothing')}
          </p>
        )}

        {view && screens.length > 0 && (
          <>
            <p className="muted">{t('company_users.delegation.shown_hint')}</p>
            <div className="deleg-tree" data-testid="deleg-tree">
              {screens.map((screen) => (
                <fieldset key={screen} className="deleg-screen">
                  <legend>{SCREEN_LABELS[screen]}</legend>
                  {SCREEN_ACTIONS.filter((a) => grantable.has(`${screen}:${a}`)).map((action) => {
                    const key = `${screen}:${action}`;
                    const dead = extinguished.get(key);
                    const isActive = active.has(key);
                    return (
                      <label
                        key={key}
                        className={dead ? 'deleg-grant extinguished' : isActive ? 'deleg-grant active' : 'deleg-grant'}
                        data-testid={`grant-${key}`}
                        data-state={dead ? 'extinguished' : isActive ? 'active' : 'available'}
                      >
                        <input
                          type="checkbox"
                          checked={isActive || dead != null || picked.has(key)}
                          disabled={isActive || dead != null || busy}
                          onChange={() => toggle(key)}
                        />
                        <span>{ACTION_LABELS[action]}</span>
                        {dead && (
                          <em className="deleg-reason" data-testid={`reason-${key}`}>
                            {t(REASON_KEY[dead.reason])}
                          </em>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>

            <div className="deleg-links">
              <h4>{t('company_users.delegation.links_title')}</h4>
              {view.links.length === 0 && <p className="muted">{t('company_users.delegation.no_links')}</p>}
              {view.links.map((l) => (
                <div key={l.id} className="deleg-link" data-testid={`link-${l.id}`} data-state={l.state}>
                  <span>{l.grants.map((g) => g.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i).map((s) => SCREEN_LABELS[s as keyof typeof SCREEN_LABELS] ?? s).join(' · ')}</span>
                  <span className="num">{t('company_users.delegation.grants_n', { n: l.grants.length })}</span>
                  {/* A revoked link stays visible and sealed, as it stays in the log. */}
                  {l.state === 'ACTIVE' ? (
                    <button type="button" onClick={() => doRevoke(l.id)} disabled={busy}>{t('company_users.delegation.revoke')}</button>
                  ) : (
                    <span className="badge sealed">{t('company_users.delegation.state_revoked')}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={submit} disabled={busy || picked.size === 0} data-testid="deleg-submit">
                {picked.size > 0 ? t('company_users.delegation.submit_n', { n: picked.size }) : t('company_users.delegation.submit')}
              </button>
              <button type="button" onClick={onClose} disabled={busy}>{t('company_users.delegation.close')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
