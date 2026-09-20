import { useCallback } from 'react';
import { getContract, listContracts, updateContract, type Contract, type ContractClassification, type ContractListItem, type ContractStatus, type ContractVatInclusion, type DeclaredClassification, type DeclaredVatInclusion, type Installment, type InstallmentStatus } from '../api/contracts';
import { DEFAULT_PAGE_SIZE, type Page, type PageQuery } from '../api/page';
import { toMoney, type Money } from '../api/wire';
import { useMutation, useResource, type Mutation, type MutationHandlers, type Resource } from './useResource';

/**
 * حدُّ العقود — الملفُّ الوحيد في الشريط الذي يستورد من `api/contracts`.
 *
 * ما تراه الشاشاتُ أنماطُ عرضٍ (`ContractRow` · `ContractView`) مالُها `Money` موسومٌ من
 * `toMoney` — موضعِ التطبيع الواحد — وقوائمُها `Page<T>` من الخادم (④). لا حسابَ هنا
 * ولا في الشاشات (①): «المتبقّي» على العقد **لا يرسله الخادم** فلا يُعرض — بندٌ يُعلَن
 * لا رقمٌ يُجمع من الأقساط.
 */

export interface ContractRow {
  id: string;
  no: string;
  ejarNo: string | null;
  tenant: string;
  customerId: string | null;
  unitNo: string;
  propertyName: string;
  start: string;
  end: string;
  status: ContractStatus;
  classification: ContractClassification;
  vatInclusion: ContractVatInclusion;
  value: Money | null;
  deposit: Money | null;
}

export interface InstallmentView {
  id: string;
  dueDate: string;
  amount: Money | null;
  status: InstallmentStatus;
  notes: string | null;
}

export interface ContractView extends ContractRow {
  cycle: Contract['cycle'];
  phone: string | null;
  services: string | null;
  furnished: Contract['furnished'];
  cancelDate: string | null;
  cancelReason: string | null;
  settlementAmount: Money | null;
  renewedFromId: string | null;
  installments: InstallmentView[];
  /** يحتاج إعلانَ التصنيف قبل أيّ تعديل — القيمةُ القديمة من الهجرة (`ق-٨٩٨`). */
  needsDeclaration: boolean;
}

function toRow(c: ContractListItem): ContractRow {
  return {
    id: c.id,
    no: c.no,
    ejarNo: c.ejarNo,
    tenant: c.customer?.name ?? c.tenant,
    customerId: c.customerId,
    unitNo: c.unit.unitNo,
    propertyName: c.unit.property.name,
    start: c.start,
    end: c.end,
    status: c.status,
    classification: c.classification,
    vatInclusion: c.vatInclusion,
    value: toMoney(c.value),
    deposit: toMoney(c.deposit),
  };
}

function toInstallment(i: Installment): InstallmentView {
  return { id: i.id, dueDate: i.dueDate, amount: toMoney(i.amount), status: i.status, notes: i.notes };
}

function toView(c: Contract): ContractView {
  return {
    ...toRow(c),
    cycle: c.cycle,
    phone: c.customer?.phone ?? c.phone,
    services: c.services,
    furnished: c.furnished,
    cancelDate: c.cancelDate,
    cancelReason: c.cancelReason,
    settlementAmount: toMoney(c.settlementAmount),
    renewedFromId: c.renewedFromId,
    installments: c.installments.map(toInstallment),
    needsDeclaration: c.classification === 'LEGACY_UNCLASSIFIED' || c.vatInclusion === 'LEGACY_UNDECLARED',
  };
}

export function useContractsPage(query: PageQuery): Resource<Page<ContractRow>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = query.search?.trim() || undefined;
  return useResource<Page<ContractRow>>(
    async () => {
      const res = await listContracts({ page, pageSize, search });
      return { items: res.items.map(toRow), total: res.total, page: res.page, pageSize: res.pageSize };
    },
    { deps: [page, pageSize, search], filtered: !!search, fallbackMessage: 'تعذّر جلب العقود' },
  );
}

export function useContract(id: string | null): Resource<ContractView> {
  return useResource<ContractView>(
    async () => {
      if (!id) throw new Error('لا عقد محدَّد');
      return toView(await getContract(id));
    },
    { deps: [id], isEmpty: () => false, fallbackMessage: 'تعذّر جلب العقد' },
  );
}

export interface DeclarationInput {
  classification: DeclaredClassification;
  vatInclusion: DeclaredVatInclusion;
}

/** إعلانُ تصنيف عقدٍ قديم — `PATCH /contracts/:id` بالحقلين معاً؛ الخادمُ يرفض الناقص بـ`400` مسمّى. */
export function useDeclareClassification(id: string, handlers: MutationHandlers<ContractView>): Mutation<DeclarationInput, ContractView> {
  const run = useCallback(async (input: DeclarationInput) => toView(await updateContract(id, input)), [id]);
  return useMutation(run, handlers);
}
