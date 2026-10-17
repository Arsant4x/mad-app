import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProduct, deleteProduct, listProducts, setProductArchived, updateProduct, type Product, type ProductInput } from '../../api/products';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { unitLabel } from '../../lib/units';
import { taxBadgeOf } from '../../lib/vat';
import { ProductModal } from './ProductModal';

export function ProductsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('products', 'add');
  const canEdit = can('products', 'edit');
  const canDelete = can('products', 'delete');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by default.
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; product: Product } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Existing items without a declared unit are counted and shown; no code is guessed for them.
  const undeclaredUnits = useMemo(() => products.filter((p) => !p.unitCode).length, [products]);
  // Existing items without a tracking declaration are counted and shown; each is declared from its card, not in bulk.
  const undeclaredTracking = useMemo(() => products.filter((p) => p.expiryTracked === null || p.expiryTracked === undefined).length, [products]);
  // Existing items without a declared tax category (LEGACY_STANDARD) are counted and badged in the list, not on the document; declared from the card.
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

  // The server refuses a product that still holds stock; its message is shown in the dialog.
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteProduct(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? t('products.list.delete_error'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('products.list.title')}</div>
          <div className="page-sub">{t('products.list.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('products.list.new')}
            </button>
          )}
        </div>
      </div>

      {undeclaredUnits > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {t('products.list.undeclared_units', { n: undeclaredUnits })}
        </div>
      )}
      {undeclaredTracking > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {t('products.list.undeclared_tracking', { n: undeclaredTracking })}
        </div>
      )}
      {undeclaredTax > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {t('products.list.undeclared_tax', { n: undeclaredTax })}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('products.list.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('products.list.show_archived')}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('products.list.col_name')}</th>
              <th>{t('products.list.col_sku')}</th>
              <th>{t('products.list.col_category')}</th>
              <th>{t('products.list.col_unit')}</th>
              <th>{t('products.list.col_tax')}</th>
              <th>{t('products.list.col_price')}</th>
              <th>{t('products.list.col_cost')}</th>
              <th>{t('products.list.col_barcode')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">{t('products.list.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  {p.archived && (
                    <span className="badge draft" style={{ marginInlineStart: 6 }}>
                      {t('products.list.archived')}
                    </span>
                  )}
                </td>
                <td className="num">{p.sku || '—'}</td>
                <td>{p.category || '—'}</td>
                <td>
                  {p.unitCode ? (
                    unitLabel(p.unitCode)
                  ) : (
                    <span className="badge draft" title={t('products.list.no_unit_title')}>
                      {t('products.list.no_unit')}
                    </span>
                  )}
                  {p.expiryTracked === true && (
                    <span className="badge due" style={{ marginInlineStart: 6 }} title={t('products.list.tracked_title')}>
                      {t('products.list.tracked')}
                    </span>
                  )}
                  {(p.expiryTracked === null || p.expiryTracked === undefined) && (
                    <span className="badge draft" style={{ marginInlineStart: 6 }} title={t('products.list.untracked_title')}>
                      {t('products.list.untracked')}
                    </span>
                  )}
                </td>
                <td>
                  {(() => {
                    const badge = taxBadgeOf(p);
                    return badge.undeclared ? (
                      <span className="badge draft" title={t('products.list.legacy_tax_title')}>
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
                      canEdit && { label: t('products.list.edit'), onClick: () => setModal({ mode: 'edit', product: p }) },
                      canEdit && { label: p.archived ? t('products.list.unarchive') : t('products.list.archive'), onClick: () => setProductArchived(p.id, !p.archived).then(reload) },
                      '-',
                      canDelete && { label: t('products.list.delete'), onClick: () => setPendingDelete(p), danger: true },
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
          title={t('products.list.delete_title')}
          body={deleteError ?? t('products.list.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('products.list.delete_confirm')}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
