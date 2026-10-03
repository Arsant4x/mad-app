# مقاطع ③-أ

## banks.ts — بعد BankInput
/**
 * 🔴 `ق-١٣٨٤` — **الفرعُ يُحدَّد عند الإنشاء**: `UpdateBankDto` لا يقبل `branchId` (و`forbidNonWhitelisted` يردّ `400`)،
 * فنوعُ التعديل يمنعه بالبناء — `never` لا الإغفال، كي لا يُسلَّم إليه كائنُ إنشاءٍ يحمله.
 */
export type BankUpdateInput = Partial<Omit<BankInput, 'branchId'>> & { branchId?: never };
updateBank = (id: string, dto: BankUpdateInput)

## employees.ts — مثله: EmployeeUpdateInput

## activities.ts
ActivityInput بلا disabled + ActivityUpdateInput = Partial<ActivityInput> & { disabled?: boolean }

## companies.ts
export type CompanyUpdateInput = Partial<Omit<CompanyInput, 'subStart' | 'subEnd'>> & { subStart?: never; subEnd?: never };

## invoices.ts
export type UpdateInvoiceInput = Partial<Pick<CreateInvoiceInput, 'customerId' | 'issueDate' | 'dueDate' | 'notes' | 'branchId' | 'lines'>>;
