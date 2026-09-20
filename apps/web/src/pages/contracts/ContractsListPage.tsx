import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions } from '../../auth/PermissionsContext';
import { DataTable, type Column } from '../../components/DataTable';
import { MoneyCell } from '../../components/MoneyCell';
import { PageHeader } from '../../components/PageHeader';
import { useContractsPage, type ContractRow } from '../../hooks/contracts';
import { dfmt } from '../../lib/format';
import { badgeOf } from '../../lib/statusBadge';
import { ContractCard } from './ContractCard';
import { CLASSIFICATION_META, CONTRACT_STATUS_META } from './contractsMeta';

/**
 * قائمةُ العقود — الشريطُ الرفيع (الجولة ٣). الفاعل: مالكُ المنشأة وموظفوها (شاشة `contracts`).
 *
 * كلُّ ما هنا يقرأ ولا يحسب: الصفحةُ من الخادم (④) عبر `useContractsPage`، والحالةُ من
 * `Resource` (②)، والمالُ `Money` (①/③)، والأفعالُ من `can` (⑤). حالةُ الصفحة (`page` ·
 * `q` · `id`) في الرابط فتعود بالرجوع كما تُركت.
 *
 * **الأعمدة التسعة بعرضها المقيس** (الخطّ الفعليّ · 13.5px · حشوة 12 — `docs/ui/probes/table-width-probe.html`):
 * تدخل منها ٨ عند 1280 و٥ عند 768، والصفُّ يُصفَّف عند 375 — والباقي في البطاقة.
 * «المتبقّي» لا يرسله الخادم للقائمة، فلا يُعرض ولا يُجمع من الأقساط.
 */
const COLUMNS: Column<ContractRow>[] = [
  { key: 'no', header: 'رقم العقد', kind: 'id', minWidth: 115, priority: 1, stack: 'line1', cell: (c) => <span className="num">{c.no}</span> },
  { key: 'tenant', header: 'المستأجر', kind: 'text', minWidth: 190, priority: 1, stack: 'line2', cell: (c) => c.tenant },
  { key: 'unit', header: 'الوحدة · العقار', kind: 'text', minWidth: 166, priority: 1, stack: 'line2', cell: (c) => `${c.unitNo} · ${c.propertyName}` },
  { key: 'end', header: 'النهاية', kind: 'date', minWidth: 100, priority: 1, stack: 'line2', cell: (c) => <span className="num">{dfmt(c.end)}</span> },
  { key: 'status', header: 'الحالة', kind: 'status', minWidth: 91, priority: 1, stack: 'line1', cell: (c) => <span className={`badge ${badgeOf(CONTRACT_STATUS_META, c.status).badgeClass}`}>{badgeOf(CONTRACT_STATUS_META, c.status).label}</span> },
  { key: 'value', header: 'قيمة العقد', kind: 'money', minWidth: 108, priority: 2, stack: 'line1', cell: (c) => <MoneyCell value={c.value} /> },
  { key: 'classification', header: 'التصنيف', kind: 'status', minWidth: 94, priority: 2, cell: (c) => <span className={`badge ${badgeOf(CLASSIFICATION_META, c.classification).badgeClass}`}>{badgeOf(CLASSIFICATION_META, c.classification).label}</span> },
  { key: 'start', header: 'البداية', kind: 'date', minWidth: 100, priority: 3, cell: (c) => <span className="num">{dfmt(c.start)}</span> },
  { key: 'deposit', header: 'التأمين', kind: 'money', minWidth: 97, priority: 3, cell: (c) => <MoneyCell value={c.deposit} /> },
];

export function ContractsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const search = params.get('q') ?? '';
  const selectedId = params.get('id');

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const r = useContractsPage({ page, search });
  const count = useMemo(() => (r.status === 'ready' || r.status === 'partial' ? { shown: r.data.items.length, total: r.data.total } : undefined), [r]);
  const reloadList = useCallback(() => {
    if (r.status === 'ready') r.reload();
    else if (r.status === 'partial') r.retry();
  }, [r]);

  return (
    <div className="rz-page" data-page="contracts">
      <PageHeader
        title="العقود"
        subtitle="عقودُ الإيجار وأقساطُها وتصنيفُها للضريبة"
        count={count}
        can={can}
        primary={{ grant: 'contracts:add', label: 'عقد جديد', onClick: () => navigate('/contracts/legacy') }}
      >
        <div className="toolbar rz-toolbar">
          <input
            className="search-box"
            type="search"
            placeholder="بحث باسم المستأجر أو رقم العقد أو الوحدة"
            aria-label="بحث"
            value={search}
            onChange={(e) => setParam({ q: e.target.value, page: null })}
          />
        </div>
      </PageHeader>

      <DataTable<ContractRow>
        r={r}
        columns={COLUMNS}
        rowKey={(c) => c.id}
        what="العقود"
        can={can}
        onRow={(c) => setParam({ id: c.id })}
        onPage={(p) => setParam({ page: String(p) })}
        empty={{
          headline: 'لا عقود بعد',
          hint: 'أوّلُ عقدٍ تُنشئه يظهر هنا، ومعه أقساطُه وتصنيفُه للضريبة.',
          action: can('contracts', 'add') ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/contracts/legacy')}>
              أنشئ أوّل عقد
            </button>
          ) : undefined,
          term: search,
          clear: () => setParam({ q: null, page: null }),
        }}
      />

      <ContractCard id={selectedId} onClose={() => setParam({ id: null })} onChanged={reloadList} />
    </div>
  );
}
