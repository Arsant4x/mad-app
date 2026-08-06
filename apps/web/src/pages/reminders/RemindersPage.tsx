import { useEffect, useState } from 'react';
import {
  getDueReminders,
  sendReminder,
  updateReminderPolicy,
  type DueReminder,
  type DueReminders,
  type ReminderChannel,
} from '../../api/reminders';
import { listCompanyUsers, type CompanyUser } from '../../api/companyUsers';
import { dfmt, fmt } from '../../lib/format';

const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  WHATSAPP: 'واتساب',
  SMS: 'رسالة نصية',
  CALL: 'اتصال',
  EMAIL: 'بريد إلكتروني',
  OTHER: 'أخرى',
};

const CHANNELS = Object.keys(CHANNEL_LABEL) as ReminderChannel[];

export function RemindersPage() {
  const [data, setData] = useState<DueReminders | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [channel, setChannel] = useState<ReminderChannel>('WHATSAPP');
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState<CompanyUser[]>([]);

  async function reload() {
    setData(await getDueReminders());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // Only the owner may list employees; for everyone else the recipient
    // picker simply offers "the account owner", which is always valid.
    listCompanyUsers()
      .then(setUsers)
      .catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      after?.();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? 'تعذّر إتمام العملية'));
    } finally {
      setBusy(false);
    }
  }

  function openFor(r: DueReminder) {
    setOpenId(openId === r.installmentId ? null : r.installmentId);
    setMessage(r.message);
    setChannel('WHATSAPP');
    setError(null);
  }

  /** Copying is the actual "send" today — see the notice below. */
  async function copy(r: DueReminder) {
    await navigator.clipboard.writeText(r.message);
    setCopiedId(r.installmentId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading || !data) return null;

  const upcoming = data.reminders.filter((r) => r.overdueDays <= 0);
  const overdue = data.reminders.filter((r) => r.overdueDays > 0);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">تذكيرات التحصيل</div>
          <div className="page-sub">من يحتاج تذكيراً اليوم، ونص الرسالة جاهزاً</div>
        </div>
      </div>

      {/* The single most important thing on this screen: the platform does not
          send anything. Saying otherwise would be discovered the first time
          rent goes uncollected. */}
      <p className="hint" style={{ marginBottom: 12 }}>
        ⚠️ المنصة لا ترسل الرسائل بنفسها — لا يوجد مزوّد رسائل مربوط بعد. ما تفعله هنا: تحدّد من يستحق تذكيراً اليوم، وتجهّز النص من قالب
        الرسائل الخاص بك، وتسجّل ما أرسلتَه فعلاً.
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="two-col">
          <div className="field">
            <label>التذكير قبل الاستحقاق بـ</label>
            <input
              type="number"
              min="0"
              max="30"
              value={data.policy.daysBefore}
              onChange={(e) => run(() => updateReminderPolicy({ daysBefore: Number(e.target.value) }))}
            />
            <p className="hint">يوم. الصفر يعني التذكير يوم الاستحقاق نفسه.</p>
          </div>
          <div className="field">
            <label>إعادة التذكير كل</label>
            <input
              type="number"
              min="1"
              max="90"
              value={data.policy.repeatEveryDays}
              onChange={(e) => run(() => updateReminderPolicy({ repeatEveryDays: Number(e.target.value) }))}
            />
            {/* Explains the floor of 1 rather than letting it look arbitrary. */}
            <p className="hint">يوم بعد التأخر. تذكير يومي هو أسرع طريق لأن يتجاهله المستأجر.</p>
          </div>
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={data.policy.enabled} onChange={(e) => run(() => updateReminderPolicy({ enabled: e.target.checked }))} />{' '}
            تفعيل التذكيرات
          </label>
        </div>

        {/* Escalation: when an arrear stops being the collector's problem. */}
        <div className="two-col" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
          <div className="field">
            <label>تصعيد المتأخر بعد</label>
            <input
              type="number"
              min="1"
              max="365"
              placeholder="بدون تصعيد"
              value={data.policy.escalateAfterDays ?? ''}
              onChange={(e) => run(() => updateReminderPolicy({ escalateAfterDays: e.target.value === '' ? null : Number(e.target.value) }))}
            />
            <p className="hint">يوم من تاريخ الاستحقاق. اتركه فارغاً لإيقاف التصعيد.</p>
          </div>
          <div className="field">
            <label>يصل التصعيد إلى</label>
            <select
              value={data.policy.escalateToUserId ?? ''}
              onChange={(e) => run(() => updateReminderPolicy({ escalateToUserId: e.target.value === '' ? null : e.target.value }))}
            >
              <option value="">صاحب الحساب</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {/* Says plainly where it arrives, so nobody waits for an SMS. */}
            <p className="hint">إشعار داخل المنصة على شاشة الإشعارات — لا رسالة ولا بريد.</p>
          </div>
        </div>
      </div>

      {!data.enabled && <div className="empty-state">التذكيرات موقوفة — فعّلها أعلاه لعرض القائمة.</div>}

      {data.enabled && (
        <>
          <div className="chip-group" style={{ marginBottom: 10 }}>
            <span className="chip">متأخرة: {overdue.length}</span>
            <span className="chip">قادمة: {upcoming.length}</span>
          </div>

          {data.truncated && (
            // Says the list is a queue, not the whole picture — otherwise the
            // count and the rows disagree and the user trusts neither.
            <p className="hint" style={{ marginBottom: 8 }}>
              معروض {data.reminders.length} من {data.total} مستحقة تذكيراً — الأقدم أولاً. عالِج هذه ثم حدّث الصفحة.
            </p>
          )}

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>المستأجر</th>
                  <th>الموقع</th>
                  <th>الاستحقاق</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>آخر تذكير</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.reminders.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">لا أحد يحتاج تذكيراً اليوم</div>
                    </td>
                  </tr>
                )}
                {data.reminders.map((r) => (
                  <tr key={r.installmentId}>
                    <td>
                      {r.tenant}
                      <div className="hint">
                        {r.contractNo}
                        {r.phone ? ` — ${r.phone}` : ' — لا يوجد جوال'}
                      </div>
                    </td>
                    <td>
                      {r.propertyName}
                      <div className="hint">وحدة {r.unitNo}</div>
                    </td>
                    <td className="num">{dfmt(r.dueDate)}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td>
                      {r.overdueDays > 0 ? (
                        <span className="badge overdue">متأخر {r.overdueDays} يوم</span>
                      ) : (
                        <span className="badge due">بعد {Math.abs(r.overdueDays)} يوم</span>
                      )}
                    </td>
                    <td className="num">{r.lastSentAt ? `${dfmt(r.lastSentAt)} (${r.daysSinceLast} يوم)` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" onClick={() => copy(r)}>
                          {copiedId === r.installmentId ? '✓ نُسخ' : 'نسخ النص'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => openFor(r)}>
                          تسجيل الإرسال
                        </button>
                      </div>

                      {openId === r.installmentId && (
                        <div className="card" style={{ background: '#faf9f5', marginTop: 6 }}>
                          <div className="field">
                            <label>القناة</label>
                            <select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel)}>
                              {CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                  {CHANNEL_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label>نص الرسالة</label>
                            <textarea
                              value={message}
                              onChange={(e) => setMessage(e.target.value)}
                              rows={3}
                              style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, padding: 9, border: '1px solid var(--line)', borderRadius: 8 }}
                            />
                            {/* Stored as sent, not regenerated later. */}
                            <p className="hint">يُحفظ النص كما أرسلتَه — القوالب تتغيّر، والمهم لاحقاً ما قيل فعلاً.</p>
                          </div>
                          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                            <button className="btn btn-ghost" onClick={() => setOpenId(null)}>
                              تراجع
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={busy || !message.trim()}
                              onClick={() => run(() => sendReminder(r.installmentId, { channel, message: message.trim() }), () => setOpenId(null))}
                            >
                              تسجيل
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
