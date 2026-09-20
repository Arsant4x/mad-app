import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractView } from '../../hooks/contracts';
import { ClassificationDeclaration } from './ClassificationDeclaration';

/**
 * لوحةُ إعلان التصنيف — النموذجُ على القواعد:
 * لا افتراضَ صامتاً · الخطأُ يُعرض بنصّ الخادم والقيمُ تبقى · والفعلُ لمن يملك المنحة.
 * الخطّافُ محاكى: إثباتُ الرفض الخادميّ نفسِه في `contract-classification.e2e-spec.ts` على الخادم.
 */
const mutate = vi.fn();
let handlers: { onSuccess?: (c: ContractView) => void; onError: (f: { status: number | null; message: string }) => void } | null = null;
let failure: { status: number | null; message: string } | null = null;

vi.mock('../../hooks/contracts', () => ({
  useDeclareClassification: (_id: string, h: typeof handlers) => {
    handlers = h;
    return { mutate, pending: false, failure };
  },
}));

const contract = { id: 'c1', classification: 'LEGACY_UNCLASSIFIED', vatInclusion: 'LEGACY_UNDECLARED', needsDeclaration: true } as unknown as ContractView;

describe('ClassificationDeclaration', () => {
  it('الخياران فارغان ابتداءً — لا افتراض', () => {
    render(<ClassificationDeclaration contract={contract} canEdit onDeclared={() => {}} />);
    expect((screen.getByLabelText('تصنيف العقد') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('القيمة والضريبة') as HTMLSelectElement).value).toBe('');
  });

  it('لا يُرسل ناقصاً: يعترض في الشاشة قبل الخادم', () => {
    render(<ClassificationDeclaration contract={contract} canEdit onDeclared={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'أعلن التصنيف' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('اختر التصنيفَ وشمولَ القيمة معاً');
  });

  it('الكاملُ يُرسل الحقلين معاً إلى `PATCH /contracts/:id`', () => {
    render(<ClassificationDeclaration contract={contract} canEdit onDeclared={() => {}} />);
    fireEvent.change(screen.getByLabelText('تصنيف العقد'), { target: { value: 'COMMERCIAL' } });
    fireEvent.change(screen.getByLabelText('القيمة والضريبة'), { target: { value: 'EXCLUSIVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'أعلن التصنيف' }));
    expect(mutate).toHaveBeenCalledWith({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
  });

  it('رفضُ الخادم يُعرض بنصّه — والقيمُ المختارة تبقى', () => {
    failure = { status: 400, message: 'الرجاء اختيار تصنيف العقد للضريبة' };
    render(<ClassificationDeclaration contract={contract} canEdit onDeclared={() => {}} />);
    fireEvent.change(screen.getByLabelText('تصنيف العقد'), { target: { value: 'RESIDENTIAL' } });
    expect(screen.getByRole('alert')).toHaveTextContent('الرجاء اختيار تصنيف العقد للضريبة');
    expect((screen.getByLabelText('تصنيف العقد') as HTMLSelectElement).value).toBe('RESIDENTIAL');
    failure = null;
  });

  it('بلا `contracts:edit`: الحقولُ مرئيةٌ مقفلة ويُسمّى من يمنح، ولا زرّ', () => {
    render(<ClassificationDeclaration contract={contract} canEdit={false} onDeclared={() => {}} />);
    expect(screen.getByLabelText('تصنيف العقد')).toBeDisabled();
    expect(screen.getByText(/ومن يمنحها: مالك المنشأة/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'أعلن التصنيف' })).toBeNull();
  });

  it('النجاحُ يُبلَّغ للأعلى ليُعاد تحميلُ البطاقة والقائمة', () => {
    const onDeclared = vi.fn();
    render(<ClassificationDeclaration contract={contract} canEdit onDeclared={onDeclared} />);
    handlers?.onSuccess?.({ ...contract, needsDeclaration: false });
    expect(onDeclared).toHaveBeenCalledTimes(1);
  });
});
