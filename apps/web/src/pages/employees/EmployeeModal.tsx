import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { BranchPicker, BranchReadOnly } from '../../components/BranchPicker';
import type { Employee, EmployeeInput, EmployeeStatus } from '../../api/employees';
import { today } from '../../lib/format';
import i18n from '../../i18n';

const STATUS_OPTIONS: { value: EmployeeStatus; labelKey: string }[] = [
  { value: 'ACTIVE', labelKey: 'employees.status.active' },
  { value: 'SUSPENDED', labelKey: 'employees.status.suspended' },
  { value: 'TERMINATED', labelKey: 'employees.status.terminated' },
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
  const { t } = useTranslation();
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
      const fields = {
        fullName: fullName.trim(),
        jobTitle: jobTitle.trim() || undefined,
        department: department.trim() || undefined,
        hireDate,
        baseSalary: parseFloat(String(baseSalary)) || 0,
        phone: phone.trim() || undefined,
        status,
      };
      // The branch is set on create only: the update endpoint rejects it with 400.
      await onSave(editing ? fields : { ...fields, branchId: branchId || undefined });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_employee_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('employees.modal.title_edit') : t('employees.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('employees.modal.full_name')}</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('employees.modal.full_name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('employees.modal.job_title')}</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={t('employees.modal.job_title_placeholder')} />
          </div>
          <div className="field">
            <label>{t('employees.modal.department')}</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t('employees.modal.department_placeholder')} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('employees.modal.hire_date')}</label>
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('employees.modal.base_salary')}</label>
            <input className="num" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('employees.modal.phone')}</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('employees.modal.phone_placeholder')} />
          </div>
          <div className="field">
            <label>{t('employees.modal.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {editing ? <BranchReadOnly branches={branches} branchId={editing.branchId} /> : <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('employees.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('employees.modal.save_edit') : t('employees.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
