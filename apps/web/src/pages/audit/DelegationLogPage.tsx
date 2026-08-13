import { useEffect, useState } from 'react';
import { listCompanyUsers, type CompanyUser } from '../../api/companyUsers';
import { getDelegationLog, type DelegationLog, type LogNode } from '../../api/delegations';
import { SCREEN_LABELS, ACTION_LABELS, type ScreenAction } from '../../api/templates';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * سجل التفويض الشجري — **شاشة مستقلة، موضعها الامتثال**.
 *
 * ولماذا مستقلةٌ بينما شجرة التفويض تُفتح من الموظف: هذا يُقرأ **عرضاً عبر
 * المنشأة كلها** — «من فوّض من، بماذا، ومتى» — لا عن موظفٍ بعينه. وربطُه
 * بموظف يجعل الإجابة عن سؤالٍ عن المنشأة تحتاج فتح عشرين نافذة.
 *
 * ## ثلاثة لا تُخفى هنا
 *
 * ١. **المسحوب ظاهرٌ مختوماً لا محذوفاً.** السجل ملحقٌ فقط، وإخفاء
 *    المسحوب في العرض يُنتج نفس أثر حذفه: قصةٌ غير التي وقعت.
 * ٢. **فجوة التسلسل تُعرض بصراحة.** فجوةٌ في `seq` تعني صفّاً غاب — وهي
 *    الإشارة الوحيدة على عبثٍ نجا من مُشغِّلات القاعدة. وابتلاعُها يجعل
 *    السجل يبدو سليماً وهو ليس كذلك.
 * ٣. **غابةٌ لا شجرة.** الخادم يعيد `roots` جمعاً: تفويضٌ بين موظفَين لم
 *    يمرّ بالمالك **له جذرٌ مستقل**، ولولا ذلك لاختفى من السجل صامتاً.
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
              <time>{new Date(e.at).toLocaleString('ar-SA')}</time>
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
  const [log, setLog] = useState<DelegationLog | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDelegationLog(), listCompanyUsers()])
      .then(([l, u]) => {
        setLog(l);
        setUsers(u);
      })
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل سجل التفويض')));
  }, []);

  // معرّفٌ لا يقابله موظف يُعرض كما هو — ولا يُحذف من الصفّ. الصفّ اليتيم
  // معلومةٌ في سجلٍّ لا يُحذف منه، وإخفاؤه يخالف سبب وجود السجل.
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="page">
      <div className="topbar">
        <h2>سجل التفويض</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!log && !error && <p>جارٍ التحميل…</p>}

      {log?.sequenceBreak && (
        <p className="error" role="alert" data-testid="sequence-break">
          ⚠️ فجوة في تسلسل السجل عند رقم {log.sequenceBreak.at} — المتوقَّع {log.sequenceBreak.expected}. راجع القاعدة فوراً.
        </p>
      )}

      {log && log.rows.length === 0 && <p className="muted" data-testid="log-empty">لا تفويض في هذه المنشأة بعد.</p>}

      {log && log.rows.length > 0 && (
        <>
          <ul className="deleg-log" data-testid="deleg-log">
            {log.roots.map((r) => (
              <Node key={r.granteeId} node={r} nameOf={nameOf} depth={0} />
            ))}
          </ul>

          <h3>الصفوف — والمسحوب مختومٌ لا محذوف</h3>
          <table className="table" data-testid="deleg-log-rows">
            <thead>
              <tr>
                <th>#</th>
                <th>من</th>
                <th>إلى</th>
                <th>الصلاحيات</th>
                <th>الحالة</th>
                <th>التاريخ</th>
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
                      {r.state === 'ACTIVE' ? 'فعّال' : 'مسحوب'}
                    </span>
                  </td>
                  <td>{new Date(r.state === 'ACTIVE' ? r.createdAt : (r.revokedAt ?? r.createdAt)).toLocaleString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
