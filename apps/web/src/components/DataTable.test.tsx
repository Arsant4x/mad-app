import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Page } from '../api/page';
import type { Money } from '../api/wire';
import type { Resource } from '../hooks/useResource';
import { DataTable, fitColumns, type Column } from './DataTable';
import { MoneyCell } from './MoneyCell';

/**
 * الجدولُ بحالاته الستّ — كلُّ حالةٍ تُرسم مختلفةً عن الأخرى، **والخطأُ لا يشبه الفارغ**.
 * التخطيطُ (الأعمدة بالمقاسات) يُختبر هنا بدالّته النقيّة `fitColumns` بالأرقام المقيسة،
 * وفي المتصفح بـPlaywright (`e2e/contracts-slice.spec.ts`) — فـjsdom لا ينفّذ تخطيطاً.
 */
interface Row {
  id: string;
  no: string;
  total: Money | null;
}

const COLS: Column<Row>[] = [
  { key: 'no', header: 'الرقم', minWidth: 100, priority: 1, stack: 'line1', cell: (r) => r.no },
  { key: 'total', header: 'المبلغ', kind: 'money', minWidth: 100, priority: 2, stack: 'line1', cell: (r) => <MoneyCell value={r.total} /> },
];

const page = (items: Row[], total = items.length): Page<Row> => ({ items, total, page: 1, pageSize: 25 });
const can = () => true;
const noop = () => {};
const empty = { headline: 'لا صفوف بعد', hint: 'أوّلُ صفٍّ يظهر هنا', term: 'نخيل', clear: noop };

function draw(r: Resource<Page<Row>>) {
  return render(<DataTable<Row> r={r} columns={COLS} rowKey={(x) => x.id} what="الصفوف" can={can} onPage={noop} empty={empty} />);
}

describe('DataTable — الحالات الستّ', () => {
  it('تحميل: هيكلٌ بـ٢٥ صفاً بلا رقمٍ واحد', () => {
    const { container } = draw({ status: 'loading' });
    expect(container.querySelectorAll('.rz-skeleton__row')).toHaveLength(25);
    expect(container.textContent ?? '').not.toMatch(/\d/);
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('loading');
  });

  it('خطأ: السببُ ورقمُ الطلب و«أعد المحاولة» — ولا «لا صفوف بعد»', () => {
    draw({ status: 'error', error: { status: 500, message: 'انقطاعٌ مؤقّت', requestId: 'req-42' }, retry: noop });
    expect(screen.getByRole('alert')).toHaveTextContent('انقطاعٌ مؤقّت');
    expect(screen.getByText(/req-42/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'أعد المحاولة' })).toBeInTheDocument();
    expect(screen.queryByText('لا صفوف بعد')).toBeNull();
  });

  it('ممنوع: يسمّي من يمنح، ولا جدول', () => {
    const { container } = draw({ status: 'forbidden', error: { status: 403, message: 'لا صلاحية' }, grantedBy: 'مدير الحساب' });
    expect(screen.getByText(/ومن يمنحها: مدير الحساب/)).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
  });

  it('فارغٌ أوّلَ مرّة ≠ فارغٌ بعد بحث', () => {
    const a = draw({ status: 'empty', filtered: false, reload: noop });
    expect(screen.getByText('لا صفوف بعد')).toBeInTheDocument();
    a.unmount();
    draw({ status: 'empty', filtered: true, reload: noop });
    expect(screen.getByText(/لا نتيجة لـ«نخيل»/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'امسح البحث' })).toBeInTheDocument();
    expect(screen.queryByText('لا صفوف بعد')).toBeNull();
  });

  it('ناقصٌ جزئياً: الصفوفُ تُعرض وفوقها شريطٌ يعدّ ما نقص', () => {
    draw({ status: 'partial', data: page([{ id: '1', no: 'EJ-1', total: '100.00' as Money }]), failed: [{ status: 500, message: 'x' }, { status: 504, message: 'y' }], retry: noop });
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(screen.getByText('EJ-1')).toBeInTheDocument();
  });

  it('جاهز: الصفوفُ والمالُ من الخادم كما وصل، والغائبُ «—» لا 0.00', () => {
    draw({ status: 'ready', data: page([{ id: '1', no: 'EJ-1', total: '1234567.89' as Money }, { id: '2', no: 'EJ-2', total: null }]), reload: noop });
    expect(screen.getByText('1,234,567.89')).toBeInTheDocument();
    expect(screen.getByLabelText('غير متاح')).toHaveTextContent('—');
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('الترقيمُ من الخادم: total لا items.length', () => {
    draw({ status: 'ready', data: { items: [{ id: '1', no: 'EJ-1', total: null }], total: 430, page: 2, pageSize: 25 }, reload: noop });
    expect(screen.getByText(/الإجمالي/)).toHaveTextContent('430');
    expect(screen.getByRole('button', { name: /السابق/ })).toBeEnabled();
  });
});

describe('fitColumns — الأعمدةُ بالأعداد المقيسة (الجولة ٢)', () => {
  // عشرةُ أعمدة العقود بعرضها المقيس بالخطّ الفعليّ (docs/ui/probes/table-width-probe.html)
  const TEN: Column<unknown>[] = [
    { key: 'no', header: '', minWidth: 115, priority: 1, cell: () => null },
    { key: 'tenant', header: '', minWidth: 190, priority: 1, cell: () => null },
    { key: 'unit', header: '', minWidth: 166, priority: 1, cell: () => null },
    { key: 'end', header: '', minWidth: 100, priority: 1, cell: () => null },
    { key: 'status', header: '', minWidth: 91, priority: 1, cell: () => null },
    { key: 'outstanding', header: '', minWidth: 97, priority: 1, cell: () => null },
    { key: 'rent', header: '', minWidth: 108, priority: 2, cell: () => null },
    { key: 'class', header: '', minWidth: 94, priority: 2, cell: () => null },
    { key: 'start', header: '', minWidth: 100, priority: 3, cell: () => null },
    { key: 'deposit', header: '', minWidth: 97, priority: 3, cell: () => null },
  ];
  it('1280 ⇒ 970px ⇒ ٨ أعمدة · 768 ⇒ 740px ⇒ ٥ · والعشرةُ لا تدخل تحت 1,158', () => {
    expect(fitColumns(TEN, 970).visible).toHaveLength(8);
    expect(fitColumns(TEN, 740).visible).toHaveLength(5);
    expect(fitColumns(TEN, 1157).visible).toHaveLength(9);
    expect(fitColumns(TEN, 1158).visible).toHaveLength(10);
  });
  it('الأولويةُ تسبق الترتيب: عمودٌ من الأولوية ٣ لا يدخل قبل واحدٍ من ٢', () => {
    const { visible } = fitColumns(TEN, 870);
    expect(visible.map((c) => c.key)).toEqual(['no', 'tenant', 'unit', 'end', 'status', 'outstanding', 'rent']);
  });
});
