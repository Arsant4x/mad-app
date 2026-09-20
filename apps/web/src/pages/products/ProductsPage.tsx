import { useEffect, useMemo, useState } from 'react';
import { createProduct, deleteProduct, listProducts, setProductArchived, updateProduct, type Product, type ProductInput } from '../../api/products';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { unitLabel } from '../../lib/units';
import { taxBadgeOf } from '../../lib/vat';
import { ProductModal } from './ProductModal';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; product: Product } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  async function reload() {
    setProducts(await listProducts(showArchived));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (unitLabel(p.unitCode) ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').includes(q),
    );
  }, [products, search]);

  // ① القائمُ بلا وحدةٍ معلَنة يُعدّ ويُعرض — لا يُخمَّن له رمز.
  const undeclaredUnits = useMemo(() => products.filter((p) => !p.unitCode).length, [products]);
  // ٥+٦ القائمُ بلا إعلانِ تتبّعٍ يُعدّ ويُعرض — يُعلَن عند لمس الصنف لا بشاشةٍ جماعية (ق-١٠٨٣).
  const undeclaredTracking = useMemo(() => products.filter((p) => p.expiryTracked === null || p.expiryTracked === undefined).length, [products]);
  // ⑧ القائمُ بلا فئةٍ ضريبية معلَنة (`LEGACY_STANDARD`) يُعدّ ويُعرض شارةً في القائمة — لا في وجه المستند (`ق-١٢٢٢`/②)؛ ويُعلَن من البطاقة.
  const undeclaredTax = useMemo(() => products.filter((p) => taxBadgeOf(p).undeclared).length, [products]);

  async function handleSave(data: ProductInput) {
    if (modal?.mode === 'edit') {
      await updateProduct(modal.product.id, data);
    } else {
      await createProduct(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteProduct(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">المنتجات والخدمات</div>
          <div className="page-sub">قائمة الأصناف المستخدمة في بنود الفواتير</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + منتج جديد
          </button>
        </div>
      </div>

      {undeclaredUnits > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {undeclaredUnits} صنفاً بلا وحدةِ قياسٍ معلَنة — تُعلَن من بطاقة كلِّ صنف ولا تُخمَّن؛ وحتى تُعلَن يخرج سطرُ الصنف في مستند الهيئة بلا وحدة.
        </div>
      )}
      {undeclaredTracking > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {undeclaredTracking} صنفاً لم يُعلَن أيُتتبَّع بالدفعة والانتهاء أم لا — يُعلَن من بطاقة كلِّ صنف عند لمسه (لا شاشةَ جماعية)؛ وحتى يُعلَن يُصرَف بالأقدم كما كان ولا يُرفض منه منتهٍ.
        </div>
      )}
      {undeclaredTax > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          أصنافٌ بلا فئةٍ ضريبية معلَنة: {undeclaredTax} — تُعلَن من بطاقة كلٍّ منها ولا تُخمَّن؛ وحتى تُعلَن يُرَنّ الصنفُ بالنسبة الأساسية كما كان، وتُعدّ سطورُه في الإقرار «على صنفٍ لم تُعلَن فئتُه».
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل المنتج..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          عرض المؤرشفة
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الرمز</th>
              <th>الفئة</th>
              <th>الوحدة</th>
              <th>الضريبة</th>
              <th>سعر الوحدة</th>
              <th>التكلفة</th>
              <th>الباركود</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">لا توجد منتجات مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}</td>
                <td className="num">{p.sku || '—'}</td>
                <td>{p.category || '—'}</td>
                <td>
                  {p.unitCode ? unitLabel(p.unitCode) : <span className="badge draft" title="لم تُعلَن وحدةُ القياس بعد — تُعلَن من بطاقة الصنف ولا تُخمَّن">بلا وحدةٍ معلَنة</span>}
                  {p.expiryTracked === true && <span className="badge due" style={{ marginInlineStart: 6 }} title="يُصرَف بالأقرب انتهاءً ولا يُباع منه المنتهي">دفعة وانتهاء</span>}
                  {(p.expiryTracked === null || p.expiryTracked === undefined) && <span className="badge draft" style={{ marginInlineStart: 6 }} title="لم يُعلَن التتبّع بالدفعة والانتهاء بعد — يُعلَن من بطاقة الصنف ولا يُخمَّن">بلا إعلانِ تتبّع</span>}
                </td>
                <td>
                  {(() => {
                    const badge = taxBadgeOf(p);
                    return badge.undeclared ? (
                      <span className="badge draft" title="صنفٌ قائم قبل الحقل — يُرَنّ بالنسبة الأساسية حتى تُعلَن فئتُه من بطاقته">
                        {badge.text}
                      </span>
                    ) : (
                      <span className="num" title={p.taxExemptionReason ?? undefined}>{badge.text}</span>
                    );
                  })()}
                </td>
                <td className="num">{fmt(p.price)}</td>
                <td className="num">{fmt(p.cost)}</td>
                <td className="num">{p.barcode || '—'}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', product: p }) },
                      { label: p.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setProductArchived(p.id, !p.archived).then(reload) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(p), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <ProductModal editing={modal.mode === 'edit' ? modal.product : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف المنتج"
          body={`حذف "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
