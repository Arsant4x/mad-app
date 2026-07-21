export function AccessDenied() {
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">لا تملك صلاحية الوصول</div>
          <div className="page-sub">هذه الشاشة غير متاحة لحسابك حالياً</div>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">لا تملك صلاحية الوصول لهذه الشاشة ضمن نموذج الصلاحيات الحالي. تواصل مع مسؤول حسابك لمنحك الصلاحية اللازمة.</div>
      </div>
    </div>
  );
}
