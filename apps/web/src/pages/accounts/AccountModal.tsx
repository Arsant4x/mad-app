import { useState } from 'react';
import type { Account, AccountInput, AccountType } from '../../api/accounts';
import i18n from '../../i18n';

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'أصل' },
  { value: 'liability', label: 'خصم' },
  { value: 'equity', label: 'حقوق ملكية' },
  { value: 'revenue', label: 'إيراد' },
  { value: 'expense', label: 'مصروف' },
];

export function AccountModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Account | null;
  onCancel: () => void;
  onSave: (data: AccountInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [type, setType] = useState<AccountType>(editing?.type ?? 'asset');
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? '');
  // المشتقُّ يُعرض في الحقل كما يُعرض المُعلَن — فالتاجر يرى التاريخ نفسه،
  // والفرقُ في التلميح تحته لا في الرقم.
  const [openingDate, setOpeningDate] = useState(editing?.openingDate?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !code.trim()) {
      setError(i18n.t('err_account_name_code_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        code: code.trim(),
        name: name.trim(),
        type,
        openingBalance: parseFloat(String(openingBalance)) || 0,
        // ⚠️ **لا يُرسَل إلا ما غيّره التاجر**: إرسالُ المشتقِّ كما هو يحوّله
        // إلى إعلانٍ لم يُعلنه (ق-٢٩٦/⑤).
        ...(openingDate && openingDate !== editing?.openingDate?.slice(0, 10) ? { openingDate } : {}),
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_account_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الحساب' : 'حساب جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم الحساب</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عهدة نثرية" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>رمز الحساب</label>
            <input className="num" value={code} onChange={(e) => setCode(e.target.value)} placeholder="1013" disabled={!!editing} />
          </div>
          <div className="field">
            <label>النوع</label>
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* الرصيدُ الافتتاحيّ رقمُ المنشأة كلِّها (`ق-١٥٨١`): لا يصل المقيَّدَ بفرع، فلا يُعرض له في التعديل ولا يُرسل. */}
        {(!editing || editing.openingBalance !== undefined) && (
          <div className="field">
            <label>الرصيد الافتتاحي</label>
            <input className="num" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
            <p className="hint" style={{ marginTop: 4 }}>
              {editing
                ? 'تغيير الرصيد الافتتاحي يُرحَّل بقيد تسوية جديد مقابل حساب الأرصدة الافتتاحية (3900) — القيد الأصلي يبقى كما هو.'
                : 'يُرحَّل تلقائياً بقيد افتتاحي متوازن مقابل حساب الأرصدة الافتتاحية (3900).'}
            </p>
          </div>
        )}
        {/* ⭐ تاريخُ الافتتاح (ق-٢٩٦): الحقلُ المجاور للرصيد — كزوجِه في شاشة
            البنوك. وفراغُه يعني «لم يُعلَن» فيُشتقّ، ولا يُكتب مشتقٌّ في خانةِ
            إعلان. */}
        <div className="field">
          <label>تاريخ الافتتاح</label>
          <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          <p className="hint" style={{ marginTop: 4 }}>
            {editing && !editing.openingDateDeclared
              ? 'هذا التاريخ مأخوذ من القيد الافتتاحي نفسه ولم تُدخله أنت — أدخِله ليصبح إعلانك.'
              : 'تاريخ القيد الافتتاحي. اتركه فارغاً ليُحسب من السنة المالية أو تاريخ اليوم. ولا يُعدَّل بعد أول حركة على الحساب.'}
          </p>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الحساب'}
          </button>
        </div>
      </div>
    </div>
  );
}
