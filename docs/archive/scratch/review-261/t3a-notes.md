# الأنواع ③-أ — الرفضُ الكامن في أنواع الطلب الخمسة (ق-١٣٨٤)

الفرع: feat/request-types-rejected-fields من main (مستقلٌّ عن ① و② — لا يمسّ الوثيقة ولا السكربت).

## الملفّات
- apps/web/src/api/activities.ts — ActivityInput بلا disabled · ActivityUpdateInput = Partial<ActivityInput> & { disabled?: boolean }
- apps/web/src/api/banks.ts — BankUpdateInput = Partial<Omit<BankInput,'branchId'>> & { branchId?: never } · updateBank(id, dto: BankUpdateInput)
- apps/web/src/api/employees.ts — EmployeeUpdateInput مثله · updateEmployee(id, dto: EmployeeUpdateInput)
- apps/web/src/api/companies.ts — CompanyUpdateInput = Partial<Omit<CompanyInput,'subStart'|'subEnd'>> & { subStart?: never; subEnd?: never }
- apps/web/src/api/invoices.ts — UpdateInvoiceInput = Partial<Pick<CreateInvoiceInput,'customerId'|'issueDate'|'dueDate'|'notes'|'branchId'|'lines'>>
- apps/web/src/pages/banks/BankModal.tsx — التعديلُ لا يرسل الفرع ويعرضه قراءةً
- apps/web/src/pages/banks/BanksPage.tsx — نزعُ الفرع قبل updateBank (بالنوع)
- apps/web/src/pages/employees/EmployeeModal.tsx · EmployeesPage.tsx — مثلهما
- apps/web/src/api/request-contracts.typecheck.ts — حارسٌ على مستوى الأنواع: كلُّ سطرٍ يجب أن يُرفض (TS2578 إن لم يُرفض) — يبنيه tsc -b في السير الخفيف
- اختبارا vitest: BankModal.test.tsx · EmployeeModal.test.tsx — التعديلُ بلا branchId والإنشاءُ به

## الإثبات بالعكس
- اختبارا الواجهة يسقطان على الشيفرة القديمة (التعديلُ يرسل branchId)
- الحارسُ النوعيّ يسقط (TS2578) إن أُعيد disabled إلى ActivityInput أو branchId إلى نوع التحديث
