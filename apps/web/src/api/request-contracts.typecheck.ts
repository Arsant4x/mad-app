/**
 * A type-level check: request types must not carry fields the server rejects.
 *
 * The server runs with `whitelist + forbidNonWhitelisted`, so a field the DTO does not know is answered
 * with `400`. Every marked line below must fail to type check; if a rejected field returns to its type,
 * the line becomes valid and the build fails with `TS2578` (an unused `@ts-expect-error`). It is built
 * with the web app (`tsc -b`) in the light CI on every push. It covers only the six named types until
 * request types are generated.
 */
import type { ActivityInput } from './activities';
import type { BankUpdateInput } from './banks';
import type { CompanyInput, CompanyUpdateInput } from './companies';
import type { EmployeeUpdateInput } from './employees';
import type { UpdateInvoiceInput } from './invoices';

export const requestTypesRejectServerRejectedFields = [
  // @ts-expect-error `CreateActivityDto` has no `disabled` (disabling is an update, not a create)
  { name: 'نشاط', disabled: true } satisfies ActivityInput, // i18n-exempt: sample payload in a type check
  // @ts-expect-error `UpdateBankDto` does not accept `branchId`: the branch is set on create
  { name: 'حساب', branchId: 'br1' } satisfies BankUpdateInput, // i18n-exempt: sample payload in a type check
  // @ts-expect-error `UpdateEmployeeDto` does not accept `branchId`: the branch is set on create
  { fullName: 'موظّف', branchId: 'br1' } satisfies EmployeeUpdateInput, // i18n-exempt: sample payload in a type check
  // @ts-expect-error `UpdateCompanyDto` does not accept `subEnd` (the subscription has its own path)
  { orgName: 'منشأة', subEnd: '2027-01-01' } satisfies CompanyUpdateInput, // i18n-exempt: sample payload in a type check
  // @ts-expect-error `UpdateCompanyDto` does not accept `password` nor `username`: only the owner sets them
  { orgName: 'org', password: 'Chosen-by-platform-1' } satisfies CompanyUpdateInput,
  // @ts-expect-error `CreateCompanyDto` does not accept `subEnd` (nor `subStart`): a new company subscribes like any merchant
  { orgName: 'org', subEnd: '2099-01-01' } satisfies Partial<CompanyInput>,
  // @ts-expect-error `UpdateInvoiceDto` does not accept `creditOverride` (nor `issuedAt`, `issuedOffsetMin`, `prepaymentInvoiceIds`)
  { notes: 'ملاحظة', creditOverride: true } satisfies UpdateInvoiceInput, // i18n-exempt: sample payload in a type check
];
