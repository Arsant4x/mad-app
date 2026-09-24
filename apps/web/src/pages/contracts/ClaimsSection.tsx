import { badgeOf } from '../../lib/statusBadge';
import { useRef, useState } from 'react';
import { createClaim, payClaim, waiveClaim, type ClaimKind, type ClaimStatus, type Contract, listClaimAttachments, uploadClaimAttachment, claimAttachmentDownloadUrl, deleteClaimAttachment, type ClaimAttachment } from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';
import { num0 } from '../../lib/money';

const KIND_LABEL: Record<ClaimKind, string> = {
  MAINTENANCE: 'صيانة',
  UTILITIES: 'فواتير خدمات',
  LATE_FEE: 'غرامة تأخير',
  DAMAGE: 'أضرار',
  OTHER: 'أخرى',
};

const STATUS_META: Record<ClaimStatus, { label: string; badgeClass: string }> = {
  OPEN: { label: 'مستحقة', badgeClass: 'due' },
  PAID: { label: 'محصَّلة', badgeClass: 'paid' },
  WAIVED: { label: 'مُسقَطة', badgeClass: 'draft' },
};

const KINDS = Object.keys(KIND_LABEL) as ClaimKind[];

/**
 * Claims on the tenant: repairs they caused, utilities they left, late fees.
 *
 * A claim is owed from the moment it is raised, so the list leads with the
 * outstanding total — that figure is what the landlord chases, and it is also
 * what a held deposit can be applied against.
 */
export function ClaimsSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const [adding, setAdding] = useState(false);
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ClaimAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openAttachments(claimId: string) {
    if (attachFor === claimId) {
      setAttachFor(null);
      return;
    }
    setAttachFor(claimId);
    setAttachments(await listClaimAttachments(claimId));
  }

  async function handleUpload(file: File) {
    if (!attachFor) return;
    setUploading(true);
    try {
      await uploadClaimAttachment(attachFor, file);
      setAttachments(await listClaimAttachments(attachFor));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر رفع المرفق — الحد 10MB وبصيغ PDF/صور');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<ClaimKind>('MAINTENANCE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [issuedAt, setIssuedAt] = useState(today());

  // مجموعُ المطالبات المفتوحة يصل من الخادم مع العقد (`ق-١٢٤٣`) — يُقرأ رقماً لقرار الإظهار وحدَه.
  const outstanding = num0(contract.claimsOutstanding);

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إتمام العملية'));
  }

  async function run(action: () => Promise<Contract>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
      after?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          المطالبات ({contract.claims.length}){outstanding > 0 && <span className="hint"> — مستحق على المستأجر: {fmt(contract.claimsOutstanding ?? 0)}</span>}
        </span>
        {contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? 'إلغاء' : '+ مطالبة'}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>النوع</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as ClaimKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>المبلغ</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>الوصف</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="يظهر للمستأجر — اذكر السبب بوضوح" />
          </div>
          <div className="field">
            <label>تاريخ المطالبة</label>
            <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          {/* Says where it lands, because "claim" doesn't tell the user it is
              recognized as income the moment it's raised. */}
          <p className="hint">تُسجَّل فور إنشائها كمستحق على المستأجر ضمن إيرادات أخرى — ويمكن خصمها لاحقاً من التأمين المحتجز.</p>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !(Number(amount) > 0) || !description.trim()}
              onClick={() =>
                run(
                  () => createClaim(contract.id, { kind, amount: Number(amount), description: description.trim(), issuedAt }),
                  () => {
                    setAdding(false);
                    setAmount('');
                    setDescription('');
                  },
                )
              }
            >
              حفظ
            </button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>النوع</th>
            <th>الوصف</th>
            <th>المبلغ</th>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contract.claims.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">لا توجد مطالبات</div>
              </td>
            </tr>
          )}
          {contract.claims.map((c) => (
            <tr key={c.id}>
              <td>{KIND_LABEL[c.kind]}</td>
              <td>{c.description}</td>
              <td className="num">{fmt(c.amount)}</td>
              <td className="num">{dfmt(c.issuedAt)}</td>
              <td>
                <span className={`badge ${badgeOf(STATUS_META, c.status).badgeClass}`}>{badgeOf(STATUS_META, c.status).label}</span>
                {c.status === 'WAIVED' && c.waiveReason && <div className="hint">{c.waiveReason}</div>}
                {c.settledAt && <div className="hint">{dfmt(c.settledAt)}</div>}
              </td>
              <td>
                {c.status === 'OPEN' && (
                  <>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => payClaim(contract.id, c.id, today()))}>
                      تحصيل
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setWaivingId(waivingId === c.id ? null : c.id);
                        setWaiveReason('');
                        setError(null);
                      }}
                    >
                      إسقاط
                    </button>
                  </>
                )}
                <button className="btn btn-ghost" onClick={() => openAttachments(c.id)}>
                  📎 مرفقات
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {waivingId && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
          <div className="field">
            <label>سبب الإسقاط</label>
            <input value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="مثال: تنازل ودّي" />
            {/* Written off, not deleted — the ledger shows both that it was
                raised and that it was dropped. */}
            <p className="hint">سيُعكس الإيراد المسجَّل وتُصفَّى الذمّة، وتبقى المطالبة ظاهرة في السجل.</p>
          </div>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button className="btn btn-ghost" onClick={() => setWaivingId(null)}>
              تراجع
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !waiveReason.trim()}
              onClick={() =>
                run(
                  () => waiveClaim(contract.id, waivingId, { waivedAt: today(), reason: waiveReason.trim() }),
                  () => setWaivingId(null),
                )
              }
            >
              تأكيد الإسقاط
            </button>
          </div>
        </div>
      )}
      {attachFor && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b>مرفقات المطالبة</b>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginRight: 'auto' }}>
              {uploading ? 'جارٍ الرفع…' : '📤 إرفاق ملف'}
              <input ref={fileRef} type="file" style={{ display: 'none' }} disabled={uploading} onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </label>
          </div>
          {/* ⚖️ ق-١٣٦٥ — حدُّ المطالبة يُعلَن في شاشة رفعها: مرفقاتُها في المخزن العاديّ، ولا مخزنَ لهويّات المستأجرين (لائحة 2289 م٢٨/١٤). */}
          <p className="warn-text" style={{ margin: '8px 0' }}>⚠️ لا تُرفع صورُ الهويّات هنا.</p>
          {attachments.length === 0 && <div className="empty-state">لا مرفقات — فاتورة الإصلاح وصور الضرر توثَّق هنا</div>}
          {attachments.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{a.filename}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{Math.ceil(a.size / 1024)} KB</span>
              <button className="btn btn-ghost btn-sm" onClick={async () => window.open((await claimAttachmentDownloadUrl(a.id)).url, '_blank')}>
                تنزيل
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await deleteClaimAttachment(a.id);
                    setAttachments(await listClaimAttachments(attachFor));
                  } catch (e) {
                    const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
                    setError(d?.message ?? 'تعذّر حذف المرفق');
                  }
                }}
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
