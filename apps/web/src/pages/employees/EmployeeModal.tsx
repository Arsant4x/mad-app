import { useState } from 'react';
import type { Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import type { Employee, EmployeeInput, EmployeeStatus } from '../../api/employees';
import { today } from '../../lib/format';
import i18n from '../../i18n';

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'SUSPENDED', label: 'موقوف' },
  { value: 'TERMINATED', label: 'منتهي' },
];

export function EmployeeModal({
  editing,
  branches,
  onCancel,
  onSave,
}: {
  editing: Employee | null;
  branches: Branch[];
  onCancel: () => void;
  onSave: (data: EmployeeInput) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [jobTitle, setJobTitle] = useState(editing?.jobTitle ?? '');
  const [department, setDepartment] = useState(editing?.department ?? '');
  const [hireDate, setHireDate] = useState(editing ? editing.hireDate.slice(0, 10) : today());
  const [baseSalary, setBaseSalary] = useState(editing?.baseSalary ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [status, setStatus] = useState<EmployeeStatus>(editing?.status ?? 'ACTIVE');
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!fullName.trim()) {
      setError(i18n.t('err_employee_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        fullName: fullName.trim(),
        jobTitle: jobTitle.trim() || undefined,
        department: department.trim() || undefined,
        hireDate,
        baseSalary: parseFloat(String(baseSalary)) || 0,
        phone: phone.trim() || undefined,
        status,
        branchId: branchId || undefined,
      });
    } catch {
      setError(i18n.t('err_employee_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل بيانات الموظف' : 'موظف جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>الاسم الكامل</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مثال: سارة العتيبي" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>المسمى الوظيفي</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="محاسبة" />
          </div>
          <div className="field">
            <label>القسم</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="المالية" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>تاريخ التعيين</label>
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div className="field">
            <label>الراتب الأساسي</label>
            <input className="num" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>رقم الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
          </div>
          <div className="field">
            <label>الحالة</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  );
}
