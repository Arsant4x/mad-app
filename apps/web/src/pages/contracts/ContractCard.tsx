import { useState, type ReactNode } from 'react';
import { usePermissions } from '../../auth/PermissionsContext';
import { MoneyCell } from '../../components/MoneyCell';
import { ErrorBlock, ForbiddenBlock, ResourceView, SkeletonRows } from '../../components/ResourceView';
import { SidePanel } from '../../components/SidePanel';
import { WarningBar } from '../../components/WarningBar';
import { useContract, type ContractView, type InstallmentView } from '../../hooks/contracts';
import { dfmt } from '../../lib/format';
import { badgeOf, type BadgeMeta } from '../../lib/statusBadge';
import type { InstallmentStatus } from '../../api/contracts';
import { ClassificationDeclaration } from './ClassificationDeclaration';
import { CLASSIFICATION_META, CONTRACT_STATUS_META, VAT_INCLUSION_META } from './contractsMeta';

const INSTALLMENT_META: Record<InstallmentStatus, BadgeMeta> = {
  DUE: { label: 'مستحقّ', badgeClass: 'due' },
  LATE: { label: 'متأخّر', badgeClass: 'overdue' },
  PARTIAL: { label: 'مسدَّد جزئياً', badgeClass: 'due' },
  PAID: { label: 'مسدَّد', badgeClass: 'paid' },
  CANCELLED: { label: 'ملغى', badgeClass: 'draft' },
};

const CYCLE_LABEL: Record<ContractView['cycle'], string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semiannual: 'نصف سنوي', annual: 'سنوي' };

/**
 * بطاقةُ العقد — النمط السادس (اللوحة) على القواعد.
 *
 * تفتح على صفٍّ من القائمة، وتعرض **أولاً ما لم يدخل الجدولَ من أعمدة**، ثم التبويبات.
 * كلُّ رقمٍ فيها من الخادم كما وصل (①): الأقساطُ تُسرد **بلا مجموعٍ** — «المتبقّي» على
 * العقد لا يرسله الخادم فلا يُحسب هنا (بندٌ معلَن في الجولة ٣).
 * ولوحةُ إعلان التصنيف تظهر **فوق كلّ شيء** حين يحتاجها العقد (`needsDeclaration`).
 *
 * ما ليس في الشريط عمداً: الودائعُ · المطالباتُ · التسليمُ · المرفقاتُ · القبضُ — لكلٍّ
 * مسارُه ومكوّنُه القديم، ويدخل الحرّاسَ حين يُنقل (قائمة `legacy-allowlist.json`).
 */
export function ContractCard({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can } = usePermissions();
  const [tab, setTab] = useState<'facts' | 'installments'>('facts');
  const r = useContract(id);
  const busy = false;

  const title = r.status === 'ready' || r.status === 'partial' ? <span className="num">{r.data.no}</span> : 'العقد';
  const subtitle = r.status === 'ready' || r.status === 'partial' ? `${r.data.tenant} · ${r.data.unitNo} · ${r.data.propertyName}` : undefined;

  return (
    <SidePanel
      open={id !== null}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      busy={busy}
      tabs={[
        { key: 'facts', label: 'البيانات' },
        { key: 'installments', label: 'الأقساط' },
      ]}
      activeTab={tab}
      onTab={(k) => setTab(k as 'facts' | 'installments')}
    >
      <ResourceView
        r={r}
        loading={() => <SkeletonRows rows={8} height={28} />}
        error={(e, retry) => <ErrorBlock error={e} retry={retry} what="العقد" />}
        forbidden={(e, grantedBy) => <ForbiddenBlock error={e} grantedBy={grantedBy} what="العقد" />}
        empty={() => <ErrorBlock error={{ status: null, message: 'لا عقد بهذا المعرّف' }} retry={onClose} what="العقد" />}
        partial={(c, failed, retry) => (
          <>
            <WarningBar tone="warn" action={<button type="button" className="btn btn-sm" onClick={retry}>أعد المحاولة</button>}>
              تعذّر جلب جزءٍ من بطاقة العقد (<span className="num">{failed.length}</span>) — المعروضُ صحيح وما نقص مسمّى.
            </WarningBar>
            <CardBody c={c} tab={tab} canEdit={can('contracts', 'edit')} onDeclared={() => { retry(); onChanged(); }} />
          </>
        )}
        ready={(c, reload) => <CardBody c={c} tab={tab} canEdit={can('contracts', 'edit')} onDeclared={() => { reload(); onChanged(); }} />}
      />
    </SidePanel>
  );
}

function CardBody({ c, tab, canEdit, onDeclared }: { c: ContractView; tab: 'facts' | 'installments'; canEdit: boolean; onDeclared: () => void }) {
  return (
    <>
      {c.needsDeclaration ? <ClassificationDeclaration contract={c} canEdit={canEdit} onDeclared={onDeclared} /> : null}
      {tab === 'facts' ? <Facts c={c} /> : <Installments rows={c.installments} />}
    </>
  );
}

function Facts({ c }: { c: ContractView }) {
  const status = badgeOf(CONTRACT_STATUS_META, c.status);
  const cls = badgeOf(CLASSIFICATION_META, c.classification);
  const vat = badgeOf(VAT_INCLUSION_META, c.vatInclusion);
  return (
    <dl className="rz-facts" data-section="facts">
      <Fact label="الحالة"><span className={`badge ${status.badgeClass}`}>{status.label}</span></Fact>
      <Fact label="التصنيف"><span className={`badge ${cls.badgeClass}`}>{cls.label}</span></Fact>
      <Fact label="القيمة والضريبة"><span className={`badge ${vat.badgeClass}`}>{vat.label}</span></Fact>
      <Fact label="قيمة العقد"><MoneyCell value={c.value} /></Fact>
      <Fact label="التأمين"><MoneyCell value={c.deposit} /></Fact>
      <Fact label="دورة السداد">{CYCLE_LABEL[c.cycle] ?? c.cycle}</Fact>
      <Fact label="البداية"><span className="num">{dfmt(c.start)}</span></Fact>
      <Fact label="النهاية"><span className="num">{dfmt(c.end)}</span></Fact>
      <Fact label="رقم إيجار">{c.ejarNo ? <span className="num">{c.ejarNo}</span> : <span className="rz-money--absent">—</span>}</Fact>
      <Fact label="المستأجر">{c.tenant}</Fact>
      <Fact label="الهاتف">{c.phone ? <span className="num" dir="ltr">{c.phone}</span> : <span className="rz-money--absent">—</span>}</Fact>
      <Fact label="الوحدة">{c.unitNo} · {c.propertyName}</Fact>
      {c.services ? <Fact label="الخدمات">{c.services}</Fact> : null}
      {c.cancelDate ? <Fact label="الإلغاء"><span className="num">{dfmt(c.cancelDate)}</span>{c.cancelReason ? ` — ${c.cancelReason}` : ''}</Fact> : null}
      {c.settlementAmount !== null ? <Fact label="التسوية"><MoneyCell value={c.settlementAmount} /></Fact> : null}
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rz-facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Installments({ rows }: { rows: InstallmentView[] }) {
  if (rows.length === 0) {
    return (
      <div className="rz-state rz-state--empty" data-state="empty-first">
        <strong>لا أقساط على هذا العقد</strong>
        <span>الأقساطُ تُولَّد مع العقد بحسب دورة سداده.</span>
      </div>
    );
  }
  return (
    <table className="rz-table rz-table--embedded" data-section="installments">
      <thead>
        <tr>
          <th>الاستحقاق</th>
          <th className="num">المبلغ</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => {
          const s = badgeOf(INSTALLMENT_META, i.status);
          return (
            <tr key={i.id}>
              <td><span className="num">{dfmt(i.dueDate)}</span></td>
              <td className="num"><MoneyCell value={i.amount} /></td>
              <td><span className={`badge ${s.badgeClass}`}>{s.label}</span>{i.notes ? <span className="hint"> · {i.notes}</span> : null}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
