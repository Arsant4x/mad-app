// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — أجسامُ الطلب ووسائطُ الاستعلام (ق-١٤٠٤).
// يُعاد توليدُه بـ: npm run openapi:snapshot  (من apps/api)
// والحارسُ خطوةُ openapi:check نفسُها (scripts/openapi-snapshot.ts) — تعيد الرسمَ وتُسقط إن اختلف.

/** Request body: `AcceptConsentDto` on the server. */
export interface AcceptConsentDto {
  version: number;
}

/** Request body: `AllocateDto` on the server. */
export interface AllocateDto {
  allocations: AllocationDto[];
  date?: string;
}

/** Request body: `AllocateSupplierPaymentDto` on the server. */
export interface AllocateSupplierPaymentDto {
  allocations: SupplierAllocationDto[];
}

/** Request body: `AllocationDto` on the server. */
export interface AllocationDto {
  invoiceId: string;
  amount: number;
}

/** Request body: `AssignMaintenanceDto` on the server. */
export interface AssignMaintenanceDto {
  assignedTo: string;
}

/** Request body: `BulkCreateUnitsDto` on the server. */
export interface BulkCreateUnitsDto {
  propertyId: string;
  prefix: string;
  count: number;
  startAt?: number;
  floor?: string;
  type: string;
  subtype?: string;
  rentMonthly: number;
}

/** Request body: `CancelContractDto` on the server. */
export interface CancelContractDto {
  cancelDate: string;
  cancelReason: string;
  installmentDisposition: 'keep' | 'cancel';
  settlementBasis?: 'none' | 'amount' | 'installments' | 'all';
  settlementAmount?: number;
  settlementLines?: SettlementLineDto[];
  settlementInstallments?: number;
  unearnedDisposition?: 'refund' | 'income';
  exchangeRate?: number;
}

/** Request body: `CancelMaintenanceDto` on the server. */
export interface CancelMaintenanceDto {
  cancelReason: string;
}

/** Request body: `ClaimWarrantyDto` on the server. */
export interface ClaimWarrantyDto {
  warrantyId?: string | null;
}

/** Request body: `CloseMaintenanceDto` on the server. */
export interface CloseMaintenanceDto {
  closedAt: string;
}

/** Request body: `CloseReconciliationDto` on the server. */
export interface CloseReconciliationDto {
  until: string;
}

/** Request body: `CloseShiftDto` on the server. */
export interface CloseShiftDto {
  declaredClosing: number;
  notes?: string;
  closedOffsetMin?: number;
}

/** Request body: `CommentTaskDto` on the server. */
export interface CommentTaskDto {
  note: string;
}

/** Request body: `CompleteMaintenanceDto` on the server. */
export interface CompleteMaintenanceDto {
  completedAt: string;
  cost?: number;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `ContractFeeDto` on the server. */
export interface ContractFeeDto {
  label: string;
  amount: number;
  effectiveFrom?: string;
}

/** Request body: `ConvertQuoteDto` on the server. */
export interface ConvertQuoteDto {
  creditOverride?: boolean;
}

/** Request body: `CopyFormTemplateDto` on the server. */
export interface CopyFormTemplateDto {
  sourceTemplateId: string;
  name?: string;
}

/** Request body: `CreateAccountDto` on the server. */
export interface CreateAccountDto {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openingBalance?: number;
  openingDate?: string;
}

/** Request body: `CreateActivityDto` on the server. */
export interface CreateActivityDto {
  name: string;
  activityType?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER';
}

/** Request body: `CreateApiKeyDto` on the server. */
export interface CreateApiKeyDto {
  name: string;
  permissionTemplateId: string;
}

/** Request body: `CreateBankDto` on the server. */
export interface CreateBankDto {
  name: string;
  kind: 'CASH_BOX' | 'BANK_ACCOUNT';
  iban?: string;
  openingBalance?: number;
  openingDate: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateBranchDto` on the server. */
export interface CreateBranchDto {
  name: string;
  type?: string;
  activityId?: string;
  propertyId?: string;
  warehouseId?: string;
  hours?: string;
}

/** Request body: `CreateCashDepositDto` on the server. */
export interface CreateCashDepositDto {
  drawerId: string;
  bankId: string;
  amount: number;
  date: string;
  memo?: string;
}

/** Request body: `CreateCashDrawerDto` on the server. */
export interface CreateCashDrawerDto {
  name: string;
  branchId?: string;
}

/** Request body: `CreateClaimDto` on the server. */
export interface CreateClaimDto {
  kind: 'MAINTENANCE' | 'UTILITIES' | 'LATE_FEE' | 'DAMAGE' | 'OTHER';
  amount: number;
  taxTreatment?: 'TAXABLE_SERVICE' | 'ON_BEHALF' | 'COMPENSATION';
  onBehalfEvidence?: string;
  description: string;
  issuedAt: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateCompanyDto` on the server. */
export interface CreateCompanyDto {
  orgName: string;
  username: string;
  password: string;
  email: string;
  permissionTemplateId: string;
  country?: string;
}

/** Request body: `CreateCompanyUserDto` on the server. */
export interface CreateCompanyUserDto {
  name: string;
  username: string;
  password: string;
  permissionTemplateId: string;
  branchIds?: string[];
  allBranches?: boolean;
  canEditMasterData?: boolean;
}

/** Request body: `CreateContractDto` on the server. */
export interface CreateContractDto {
  unitId: string;
  classification: 'RESIDENTIAL' | 'COMMERCIAL' | 'SERVICED_LODGING' | 'MIXED';
  exemptSharePercent?: number;
  exemptShareBasis?: string;
  vatInclusion: 'INCLUSIVE' | 'EXCLUSIVE';
  lessor?: 'COMPANY' | 'OWNER';
  ownerName?: string;
  ownerVatNumber?: string;
  customerId: string;
  value: number;
  cycle: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  start: string;
  end: string;
  deposit?: number;
  services?: string;
  furnished?: 'unfurnished' | 'furnished' | 'partial';
  ejarNo?: string;
  tenantIdNumber?: string;
  fees?: ContractFeeDto[];
  draft?: boolean;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateCreditNoteDto` on the server. */
export interface CreateCreditNoteDto {
  reason: string;
  issueDate?: string;
  eventDate?: string;
  lines?: InvoiceLineDto[];
}

/** Request body: `CreateCurrencyDto` on the server. */
export interface CreateCurrencyDto {
  code: string;
  name: string;
  symbol?: string;
  rate?: number;
}

/** Request body: `CreateCustomerDto` on the server. */
export interface CreateCustomerDto {
  name: string;
  kind: 'NATURAL' | 'ESTABLISHMENT' | 'LEGAL_PERSON';
  otherIdScheme?: 'TIN' | 'CRN' | 'MOM' | 'MLS' | '700' | 'SAG' | 'NAT' | 'GCC' | 'IQA' | 'PAS' | 'OTH';
  otherId?: string;
  country?: string;
  vatNumber?: string;
  phone?: string;
  street?: string;
  buildingNumber?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  creditLimit?: number;
  allowSameName?: boolean;
}

/** Request body: `CreateDebitNoteDto` on the server. */
export interface CreateDebitNoteDto {
  reason: string;
  issueDate?: string;
  eventDate?: string;
  lines: InvoiceLineDto[];
}

/** Request body: `CreateDelegationDto` on the server. */
export interface CreateDelegationDto {
  granteeId: string;
  nodeKey: 'root' | 'other' | 'realestate' | 'accounting' | 'sales' | 'purchasing' | 'hr' | 'banking' | 'compliance' | 'company' | 'overview' | 'dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes' | 'forms';
  grants: string[];
}

/** Request body: `CreateEmployeeDto` on the server. */
export interface CreateEmployeeDto {
  status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  fullName: string;
  jobTitle?: string;
  department?: string;
  hireDate: string;
  baseSalary?: number;
  phone?: string;
  nationalId?: string;
  salaryIban?: string;
  socialInsuranceNo?: string;
  branchId?: string;
}

/** Request body: `CreateFiscalYearDto` on the server. */
export interface CreateFiscalYearDto {
  name: string;
  start: string;
  end: string;
}

/** Request body: `CreateFormInstanceDto` on the server. */
export interface CreateFormInstanceDto {
  templateId: string;
  formDate?: string;
}

/** Request body: `CreateFormTemplateDto` on the server. */
export interface CreateFormTemplateDto {
  formTypeId: string;
  name: string;
  description?: string;
  items: FormTemplateItemDto[];
}

/** Request body: `CreateFormTypeDto` on the server. */
export interface CreateFormTypeDto {
  code: string;
  name: string;
  description?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER';
}

/** Request body: `CreateGoodsReceiptDto` on the server. */
export interface CreateGoodsReceiptDto {
  receivedAt: string;
  warehouseId?: string;
  notes?: string;
  lines: GoodsReceiptLineDto[];
}

/** Request body: `CreateHandoverDto` on the server. */
export interface CreateHandoverDto {
  type: 'DELIVERY' | 'RECEIPT';
  date: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  items: HandoverItemDto[];
}

/** Request body: `CreateIntegrationDto` on the server. */
export interface CreateIntegrationDto {
  kind: 'PAYMENT_GATEWAY' | 'BNPL' | 'ECOMMERCE';
  provider: string;
  label?: string;
  credentials: Record<string, unknown>;
}

/** Request body: `CreateInvoiceDto` on the server. */
export interface CreateInvoiceDto {
  customerId: string;
  issueDate: string;
  issuedAt?: string;
  issuedOffsetMin?: number;
  dueDate: string;
  notes?: string;
  creditOverride?: boolean;
  lines: InvoiceLineDto[];
  prepaymentInvoiceIds?: string[];
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateJournalEntryDto` on the server. */
export interface CreateJournalEntryDto {
  date: string;
  memo: string;
  lines: JournalLineDto[];
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateLandedCostDto` on the server. */
export interface CreateLandedCostDto {
  purchaseLineId: string;
  method?: 'VALUE' | 'QUANTITY' | 'MANUAL';
  date?: string;
  layerIds?: string[];
  goodsReceiptIds?: string[];
  lines?: LandedCostManualLineDto[];
  notes?: string;
}

/** Request body: `CreateLeaveRequestDto` on the server. */
export interface CreateLeaveRequestDto {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

/** Request body: `CreateLeaveTypeDto` on the server. */
export interface CreateLeaveTypeDto {
  name: string;
  annualDays?: number;
  paid?: boolean;
}

/** Request body: `CreateMaintenanceDto` on the server. */
export interface CreateMaintenanceDto {
  propertyId: string;
  unitId?: string;
  title: string;
  description?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  reportedBy?: string;
  reportedAt: string;
}

/** Request body: `CreateNetworkSettlementDto` on the server. */
export interface CreateNetworkSettlementDto {
  bankId: string;
  date: string;
  periodFrom: string;
  periodTo: string;
  feeAmount: number;
  feeVatAmount: number;
  branchId?: string;
  memo?: string;
  receiptIds?: string[];
}

/** Request body: `CreatePaymentDto` on the server. */
export interface CreatePaymentDto {
  customerId: string;
  branchId?: string;
  date: string;
  amount: number;
  method: 'CASH' | 'BANK' | 'CARD';
  bankId?: string;
  reference?: string;
  notes?: string;
  allocations?: AllocationDto[];
  unallocated?: 'PREPAYMENT' | 'ON_ACCOUNT';
  prepaymentTax?: PrepaymentTaxDto;
  currency?: string;
  exchangeRate?: number;
}

/** Request body: `CreatePosPaymentAttemptDto` on the server. */
export interface CreatePosPaymentAttemptDto {
  lines: PosSaleLineDto[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  payments?: PosPaymentPartDto[];
  customerId?: string;
  ringAt?: string;
  ringOffsetMin?: number;
  cardDeviceReference?: string;
  clientSaleId: string;
  offlineRef?: string;
}

/** Request body: `CreatePosSaleDto` on the server. */
export interface CreatePosSaleDto {
  lines: PosSaleLineDto[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  payments?: PosPaymentPartDto[];
  customerId?: string;
  ringAt?: string;
  ringOffsetMin?: number;
  cardDeviceReference?: string;
}

/** Request body: `CreateProductDto` on the server. */
export interface CreateProductDto {
  name: string;
  sku?: string;
  category?: string;
  unitCode?: string;
  expiryTracked?: boolean;
  taxCategory?: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
  price?: number;
  cost?: number;
  minStock?: number;
  barcode?: string;
}

/** Request body: `CreatePropertyDto` on the server. */
export interface CreatePropertyDto {
  name: string;
  address?: string;
  floors?: number;
  activityType?: 'residential' | 'shop' | 'showroom' | 'office' | 'warehouse' | 'mixed';
  activitySubtype?: string;
  ownership: 'owned' | 'leased' | 'managed';
  leaseValue?: number;
  leaseCycle?: string;
  leaseStart?: string;
  leaseEnd?: string;
  opRate?: number;
  deedNo?: string;
  lat?: number;
  lng?: number;
}

/** Request body: `CreatePurchaseDto` on the server. */
export interface CreatePurchaseDto {
  supplierId: string;
  date: string;
  dueDate?: string;
  supplierRef?: string;
  category?: string;
  categoryCode?: 'POWER' | 'WATER' | 'TELECOM' | 'RENT' | 'SALARIES' | 'COGS' | 'FORMATION' | 'OTHER';
  subtotal: number;
  exempt?: boolean;
  excludeFromVat?: boolean;
  inputVatUse?: 'TAXABLE_ONLY' | 'EXEMPT_ONLY' | 'MIXED';
  amortize?: boolean;
  amortizeMonths?: number;
  incorpItem?: string;
  lines?: PurchaseLineDto[];
  warehouseId?: string;
  receiveNow?: boolean;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateQuoteDto` on the server. */
export interface CreateQuoteDto {
  customerId: string;
  branchId?: string;
  issueDate: string;
  validUntil: string;
  notes?: string;
  lines: QuoteLineDto[];
  currency?: string;
  exchangeRate?: number;
}

/** Request body: `CreateReservationDto` on the server. */
export interface CreateReservationDto {
  unitId: string;
  name: string;
  phone?: string;
  deposit?: number;
  expiryDate: string;
}

/** Request body: `CreateScriptDto` on the server. */
export interface CreateScriptDto {
  audience: 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';
  title: string;
  text: string;
}

/** Request body: `CreateStockMovementDto` on the server. */
export interface CreateStockMovementDto {
  productId: string;
  warehouseId: string;
  toWarehouseId?: string;
  type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
  qty: number;
  date: string;
  reason: string;
  unitCost?: number;
  batchNo?: string;
  expiryDate?: string;
  branchId?: string;
}

/** Request body: `CreateSupplierDto` on the server. */
export interface CreateSupplierDto {
  name: string;
  vatNumber?: string;
  phone?: string;
  category?: string;
}

/** Request body: `CreateSupplierNoteDto` on the server. */
export interface CreateSupplierNoteDto {
  reason: string;
  date?: string;
  supplierRef?: string;
  lines?: SupplierNoteLineDto[];
}

/** Request body: `CreateSupplierPaymentDto` on the server. */
export interface CreateSupplierPaymentDto {
  supplierId: string;
  branchId?: string;
  date: string;
  amount: number;
  method: 'CASH' | 'BANK';
  bankId?: string;
  reference?: string;
  notes?: string;
  allocations?: SupplierAllocationDto[];
  currency?: string;
  exchangeRate?: number;
}

/** Request body: `CreateTaskDto` on the server. */
export interface CreateTaskDto {
  title: string;
  assigneeId: string;
  assigneeKind: 'OWNER' | 'USER';
  targetScreen?: 'dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes' | 'forms';
  targetId?: string;
  note?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  department?: string;
  recurEveryDays?: number;
  dueAnchor?: string;
}

/** Request body: `CreateTemplateDto` on the server. */
export interface CreateTemplateDto {
  allowedScreens?: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes' | 'forms')[];
  name: string;
  isAllScreens?: boolean;
  screenActions?: Record<string, unknown>;
}

/** Request body: `CreateTransactionDto` on the server. */
export interface CreateTransactionDto {
  bankId: string;
  date: string;
  description: string;
  amount: number;
  source?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `CreateUnitDto` on the server. */
export interface CreateUnitDto {
  propertyId: string;
  unitNo: string;
  floor?: string;
  type: string;
  subtype?: string;
  rentMonthly: number;
  underMaintenance?: boolean;
  roomDetails?: string;
}

/** Request body: `CreateWarehouseDto` on the server. */
export interface CreateWarehouseDto {
  name: string;
  location?: string;
  manager?: string;
}

/** Request body: `CreateWarrantyDto` on the server. */
export interface CreateWarrantyDto {
  subject: string;
  propertyId: string;
  unitId?: string;
  provider: string;
  supplierId?: string;
  startDate: string;
  endDate: string;
  reference?: string;
  terms?: string;
  notes?: string;
}

/** Request body: `CreateWriteOffDto` on the server. */
export interface CreateWriteOffDto {
  productId: string;
  warehouseId: string;
  qty: number;
  reasonCode: string;
  occurredAt: string;
  note?: string;
  branchId?: string;
}

/** Request body: `DecideDto` on the server. */
export interface DecideDto {
  note?: string;
}

/** Request body: `DecideLeaveRequestDto` on the server. */
export interface DecideLeaveRequestDto {
  note?: string;
}

/** Request body: `DeclareStockOpeningDto` on the server. */
export interface DeclareStockOpeningDto {
  openingDate?: string;
  notes?: string;
  lines: StockOpeningLineDto[];
  branchId?: string;
}

/** Request body: `DeclareVatCorrectionDto` on the server. */
export interface DeclareVatCorrectionDto {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
  correctedYear: number;
  correctedPeriodType: 'QUARTERLY' | 'MONTHLY';
  correctedPeriodNo: number;
  amount: number;
  reason: string;
}

/** Request body: `DeclareVatRatioDto` on the server. */
export interface DeclareVatRatioDto {
  year: number;
  ratio: number;
  basis: 'COMPUTED' | 'ESTIMATED';
  note?: string;
}

/** Request body: `DeductionDto` on the server. */
export interface DeductionDto {
  kind: 'UNPAID_RENT' | 'DAMAGE' | 'UTILITIES' | 'CLEANING' | 'OTHER';
  amount: number;
  reason: string;
  taxTreatment?: 'TAXABLE_SERVICE' | 'ON_BEHALF' | 'COMPENSATION';
  onBehalfEvidence?: string;
}

/** Request body: `DeletionRequestDecisionDto` on the server. */
export interface DeletionRequestDecisionDto {
  note?: string;
}

/** Request body: `EndContractFeeDto` on the server. */
export interface EndContractFeeDto {
  endedAt: string;
}

/** Request body: `FindByNationalIdDto` on the server. */
export interface FindByNationalIdDto {
  nationalId: string;
}

/** Request body: `ForgotPasswordDto` on the server. */
export interface ForgotPasswordDto {
  username: string;
}

/** Request body: `FormSubstituteDecisionDto` on the server. */
export interface FormSubstituteDecisionDto {
  approve: boolean;
}

/** Request body: `FormTemplateItemDto` on the server. */
export interface FormTemplateItemDto {
  itemType: 'CONDITION' | 'QTY' | 'NUMBER' | 'METER_READING' | 'TEMPERATURE' | 'BOOLEAN' | 'TEXT';
  label: string;
  required?: boolean;
  minValue?: number;
  maxValue?: number;
  isBlocking?: boolean;
  unit?: string;
  helpText?: string;
}

/** Request body: `FormTypeSignPeriodDto` on the server. */
export interface FormTypeSignPeriodDto {
  formTypeId: string;
  signPeriodDays: number;
}

/** Request body: `FormValueDto` on the server. */
export interface FormValueDto {
  itemId: string;
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
  note?: string | null;
}

/** Request body: `GoodsReceiptLineDto` on the server. */
export interface GoodsReceiptLineDto {
  purchaseLineId: string;
  quantity: number;
  batchNo?: string;
  expiryDate?: string;
}

/** Request body: `HandoverItemDto` on the server. */
export interface HandoverItemDto {
  label: string;
  condition: 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
  note?: string;
}

/** Request body: `InvoiceLineDto` on the server. */
export interface InvoiceLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  taxCategory?: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
  returnsLineId?: string;
  returnCondition?: 'GOOD' | 'DAMAGED' | 'REPAIRABLE';
}

/** Request body: `IssueReplacementDto` on the server. */
export interface IssueReplacementDto {
  issuedAt?: string;
  issuedOffsetMin?: number;
}

/** Request body: `JournalLineDto` on the server. */
export interface JournalLineDto {
  accountId: string;
  debit: number;
  credit: number;
}

/** Request body: `LandedCostManualLineDto` on the server. */
export interface LandedCostManualLineDto {
  layerId: string;
  baseAmount: number;
}

/** Request body: `LinkLoginAccountDto` on the server. */
export interface LinkLoginAccountDto {
  companyUserId: string | null;
}

/** Request body: `LoginDto` on the server. */
export interface LoginDto {
  username: string;
  password: string;
  code?: string;
}

/** Request body: `MatchStatementLineDto` on the server. */
export interface MatchStatementLineDto {
  transactionId: string;
  lineId: string;
}

/** Request body: `MfaCodeDto` on the server. */
export interface MfaCodeDto {
  code: string;
  currentPassword: string;
}

/** Request body: `OpenShiftDto` on the server. */
export interface OpenShiftDto {
  openingFloat: number;
  branchId?: string;
  drawerId?: string;
}

/** Request body: `PayClaimDto` on the server. */
export interface PayClaimDto {
  paidAt: string;
  exchangeRate?: number;
}

/** Request body: `PosPaymentPartDto` on the server. */
export interface PosPaymentPartDto {
  method: 'CASH' | 'CARD';
  amount: number;
}

/** Request body: `PosSaleLineDto` on the server. */
export interface PosSaleLineDto {
  productId: string;
  quantity: number;
  discount?: number;
}

/** Request body: `PostStatementLineDto` on the server. */
export interface PostStatementLineDto {
  transactionId: string;
  counterpartyAccountId?: string;
  depositId?: string;
  memo?: string;
}

/** Request body: `PrepaymentTaxDto` on the server. */
export interface PrepaymentTaxDto {
  taxCategory: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

/** Request body: `PublishVersionDto` on the server. */
export interface PublishVersionDto {
  summary: string;
  effectiveFrom: string;
}

/** Request body: `PurchaseLineDto` on the server. */
export interface PurchaseLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  batchNo?: string;
  expiryDate?: string;
}

/** Request body: `QuoteLineDto` on the server. */
export interface QuoteLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  taxCategory?: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

/** Request body: `RecordAttendanceDto` on the server. */
export interface RecordAttendanceDto {
  employeeId: string;
  date: string;
  status?: 'PRESENT' | 'ABSENT';
  checkIn?: string;
  notes?: string;
}

/** Request body: `RecordDepositDto` on the server. */
export interface RecordDepositDto {
  type: 'RENT' | 'FACILITY';
  holder?: 'COMPANY' | 'EJAR';
  amount: number;
  receivedAt: string;
  note?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `RecordKeyMoneyDto` on the server. */
export interface RecordKeyMoneyDto {
  direction: 'RECEIVED' | 'PAID';
  amount: number;
  paidAt: string;
  note?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `RecordMarketingConsentDto` on the server. */
export interface RecordMarketingConsentDto {
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
  granted: boolean;
  source: 'IN_PERSON' | 'PHONE' | 'WEB_FORM' | 'WRITTEN' | 'IMPORTED';
  at?: string;
  note?: string;
}

/** Request body: `RecordPaymentDto` on the server. */
export interface RecordPaymentDto {
  installmentId?: string;
  date: string;
  amount: number;
  discount?: number;
  method: 'CASH' | 'BANK';
  bankId?: string;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `RefundDto` on the server. */
export interface RefundDto {
  creditNoteId: string;
  date: string;
  amount?: number;
  method: 'CASH' | 'BANK';
  bankId?: string;
  reference?: string;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `RegisterDto` on the server. */
export interface RegisterDto {
  orgName: string;
  username: string;
  password: string;
  email: string;
  country?: string;
}

/** Request body: `RejectWriteOffDto` on the server. */
export interface RejectWriteOffDto {
  reason: string;
}

/** Request body: `RenewContractDto` on the server. */
export interface RenewContractDto {
  start: string;
  end: string;
  classification: 'RESIDENTIAL' | 'COMMERCIAL' | 'SERVICED_LODGING' | 'MIXED';
  vatInclusion: 'INCLUSIVE' | 'EXCLUSIVE';
  exemptSharePercent?: number;
  exemptShareBasis?: string;
  lessor?: 'COMPANY' | 'OWNER';
  ownerName?: string;
  ownerVatNumber?: string;
  value?: number;
  cycle?: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  no?: string;
  ejarNo?: string;
  carryDeposits?: boolean;
}

/** Request body: `ReopenPeriodDto` on the server. */
export interface ReopenPeriodDto {
  reason: string;
}

/** Request body: `RequestDecisionDto` on the server. */
export interface RequestDecisionDto {
  action: 'ACCOUNT_ERASURE' | 'SUBSCRIPTION_CHANGE' | 'REFUND';
  targetId: string;
  summary: string;
}

/** Request body: `RequestSubstituteDto` on the server. */
export interface RequestSubstituteDto {
  name: string;
  mobile: string;
  nationalId?: string;
}

/** Request body: `RequestSupportAccessDto` on the server. */
export interface RequestSupportAccessDto {
  screens: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes' | 'forms')[];
  companyId: string;
  reason: string;
  durationMinutes: number;
}

/** Request body: `ResetPasswordDto` on the server. */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

/** Request body: `ResolvePaymentAttemptWithEvidenceDto` on the server. */
export interface ResolvePaymentAttemptWithEvidenceDto {
  deviceReference: string;
  approvalCode: string;
  note?: string;
}

/** Request body: `ReverseJournalEntryDto` on the server. */
export interface ReverseJournalEntryDto {
  date?: string;
  memo?: string;
}

/** Request body: `ReversePaymentDto` on the server. */
export interface ReversePaymentDto {
  reason?: string;
  date?: string;
}

/** Request body: `ReverseSupplierPaymentDto` on the server. */
export interface ReverseSupplierPaymentDto {
  reason?: string;
  date?: string;
}

/** Request body: `SendReminderDto` on the server. */
export interface SendReminderDto {
  channel: 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL' | 'OTHER';
  message: string;
}

/** Request body: `SetArchivedDto` on the server. */
export interface SetArchivedDto {
  archived: boolean;
}

/** Request body: `SetEnabledDto` on the server. */
export interface SetEnabledDto {
  enabled: boolean;
}

/** Request body: `SetFiscalStartMonthDto` on the server. */
export interface SetFiscalStartMonthDto {
  month: number;
}

/** Request body: `SetFormValuesDto` on the server. */
export interface SetFormValuesDto {
  values: FormValueDto[];
}

/** Request body: `SetPrimaryActivityDto` on the server. */
export interface SetPrimaryActivityDto {
  activityId?: string | null;
  confirmed: boolean;
}

/** Request body: `SettleDepositDto` on the server. */
export interface SettleDepositDto {
  settledAt: string;
  deductions: DeductionDto[];
  exchangeRate?: number;
}

/** Request body: `SettlementLineDto` on the server. */
export interface SettlementLineDto {
  label: string;
  amount: number;
}

/** Request body: `SignHandoverDto` on the server. */
export interface SignHandoverDto {
  signedBy: string;
}

/** Request body: `StartMaintenanceDto` on the server. */
export interface StartMaintenanceDto {
  startedAt: string;
}

/** Request body: `StartOnboardingDto` on the server. */
export interface StartOnboardingDto {
  environment?: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
  branchName?: string;
  registeredAddress?: string;
  businessCategory?: string;
  invoiceType?: string;
}

/** Request body: `StockOpeningLineDto` on the server. */
export interface StockOpeningLineDto {
  productId: string;
  warehouseId: string;
  qty: number;
  unitCost: number;
  acquiredAt: string;
  batchNo?: string;
  expiryDate?: string;
  evidenceRef?: string;
}

/** Request body: `SubmitDeletionRequestDto` on the server. */
export interface SubmitDeletionRequestDto {
  reason?: string;
}

/** Request body: `SubmitOtpDto` on the server. */
export interface SubmitOtpDto {
  otp: string;
}

/** Request body: `SupplierAllocationDto` on the server. */
export interface SupplierAllocationDto {
  purchaseId: string;
  amount: number;
}

/** Request body: `SupplierNoteLineDto` on the server. */
export interface SupplierNoteLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  returnsPurchaseLineId?: string;
  goodsReturned?: boolean;
}

/** Request body: `SyncPosSaleDto` on the server. */
export interface SyncPosSaleDto {
  clientSaleId: string;
  offlineRef?: string;
  lines: PosSaleLineDto[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  payments?: PosPaymentPartDto[];
  customerId?: string;
  ringAt?: string;
  ringOffsetMin?: number;
  cardDeviceReference?: string;
}

/** Request body: `TransferBankDto` on the server. */
export interface TransferBankDto {
  toBranchId: string;
  countedAmount?: number;
  date?: string;
  name?: string;
}

/** Request body: `TransferCashDrawerDto` on the server. */
export interface TransferCashDrawerDto {
  toBranchId: string;
  countedAmount: number;
  date: string;
  name?: string;
}

/** Request body: `TransferEmployeeDto` on the server. */
export interface TransferEmployeeDto {
  fromBranchId: string | null;
  toBranchId: string;
  loginAccountBranchIds?: string[];
}

/** Request body: `TransitionTaskDto` on the server. */
export interface TransitionTaskDto {
  to: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  note?: string;
}

/** Request body: `UnmatchStatementLineDto` on the server. */
export interface UnmatchStatementLineDto {
  transactionId: string;
}

/** Request body: `UpdateAccountDto` on the server. */
export interface UpdateAccountDto {
  name?: string;
  type?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openingBalance?: number;
  openingDate?: string;
}

/** Request body: `UpdateActivityDto` on the server. */
export interface UpdateActivityDto {
  name?: string;
  activityType?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER';
  disabled?: boolean;
}

/** Request body: `UpdateAttendanceDto` on the server. */
export interface UpdateAttendanceDto {
  status?: 'PRESENT' | 'ABSENT';
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

/** Request body: `UpdateBankDto` on the server. */
export interface UpdateBankDto {
  name?: string;
  kind?: 'CASH_BOX' | 'BANK_ACCOUNT';
  iban?: string;
  openingBalance?: number;
  openingDate?: string;
}

/** Request body: `UpdateBranchDto` on the server. */
export interface UpdateBranchDto {
  name?: string;
  type?: string;
  activityId?: string;
  propertyId?: string;
  warehouseId?: string;
  hours?: string;
}

/** Request body: `UpdateCashDrawerDto` on the server. */
export interface UpdateCashDrawerDto {
  name?: string;
  isActive?: boolean;
}

/** Request body: `UpdateCompanyDto` on the server. */
export interface UpdateCompanyDto {
  orgName?: string;
  permissionTemplateId?: string;
}

/** Request body: `UpdateCompanyProfileDto` on the server. */
export interface UpdateCompanyProfileDto {
  legalName?: string;
  slug?: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
  currentPassword?: string;
  website?: string;
  address?: string;
  street?: string;
  buildingNumber?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  additionalNumber?: string;
  unitNumber?: string;
  logoFileKey?: string;
  masterDataLocked?: boolean;
  writeOffRequiresTwoPersons?: boolean;
  leaveApprovalRequiresTwoPersons?: boolean;
  creditLimitHardBlock?: boolean;
  vatPeriod?: 'QUARTERLY' | 'MONTHLY';
  posOfflineGapMinutes?: number;
}

/** Request body: `UpdateCompanySubscriptionDto` on the server. */
export interface UpdateCompanySubscriptionDto {
  subStart?: string;
  subEnd?: string;
}

/** Request body: `UpdateCompanyUserDto` on the server. */
export interface UpdateCompanyUserDto {
  name?: string;
  username?: string;
  password?: string;
  permissionTemplateId?: string;
  status?: 'ACTIVE' | 'FROZEN' | 'STOPPED';
  branchIds?: string[];
  allBranches?: boolean;
  canEditMasterData?: boolean;
}

/** Request body: `UpdateContractDto` on the server. */
export interface UpdateContractDto {
  customerId?: string;
  services?: string;
  furnished?: 'unfurnished' | 'furnished' | 'partial';
  ejarNo?: string;
  tenantIdNumber?: string | null;
  classification?: 'RESIDENTIAL' | 'COMMERCIAL' | 'SERVICED_LODGING' | 'MIXED';
  vatInclusion?: 'INCLUSIVE' | 'EXCLUSIVE';
  exemptSharePercent?: number;
  exemptShareBasis?: string;
  lessor?: 'COMPANY' | 'OWNER';
  ownerName?: string;
  ownerVatNumber?: string;
}

/** Request body: `UpdateCurrencyDto` on the server. */
export interface UpdateCurrencyDto {
  name?: string;
  symbol?: string;
  rate?: number;
}

/** Request body: `UpdateCustomerDto` on the server. */
export interface UpdateCustomerDto {
  name?: string;
  kind?: 'NATURAL' | 'ESTABLISHMENT' | 'LEGAL_PERSON';
  otherIdScheme?: 'TIN' | 'CRN' | 'MOM' | 'MLS' | '700' | 'SAG' | 'NAT' | 'GCC' | 'IQA' | 'PAS' | 'OTH' | null;
  otherId?: string | null;
  country?: string;
  vatNumber?: string;
  phone?: string;
  street?: string;
  buildingNumber?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  creditLimit?: number;
  allowSameName?: boolean;
}

/** Request body: `UpdateEmployeeDto` on the server. */
export interface UpdateEmployeeDto {
  status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  fullName?: string;
  jobTitle?: string;
  department?: string;
  hireDate?: string;
  baseSalary?: number;
  phone?: string;
  nationalId?: string;
  salaryIban?: string;
  socialInsuranceNo?: string;
}

/** Request body: `UpdateFormSigningSettingsDto` on the server. */
export interface UpdateFormSigningSettingsDto {
  nafathThreshold?: number | null;
  periods?: FormTypeSignPeriodDto[];
}

/** Request body: `UpdateFormTemplateDto` on the server. */
export interface UpdateFormTemplateDto {
  name?: string;
  description?: string;
  items?: FormTemplateItemDto[];
}

/** Request body: `UpdateFormTypeDto` on the server. */
export interface UpdateFormTypeDto {
  name?: string;
  description?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER' | null;
}

/** Request body: `UpdateHandoverDto` on the server. */
export interface UpdateHandoverDto {
  date?: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  items?: HandoverItemDto[];
}

/** Request body: `UpdateInvoiceDto` on the server. */
export interface UpdateInvoiceDto {
  customerId?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  lines?: InvoiceLineDto[];
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `UpdateLeaveTypeDto` on the server. */
export interface UpdateLeaveTypeDto {
  name?: string;
  annualDays?: number;
  paid?: boolean;
}

/** Request body: `UpdateMaintenanceDto` on the server. */
export interface UpdateMaintenanceDto {
  title?: string;
  description?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  reportedBy?: string;
  notes?: string;
}

/** Request body: `UpdateProductDto` on the server. */
export interface UpdateProductDto {
  name?: string;
  sku?: string;
  category?: string;
  unitCode?: string;
  expiryTracked?: boolean;
  taxCategory?: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
  price?: number;
  cost?: number;
  minStock?: number;
  barcode?: string;
}

/** Request body: `UpdatePropertyDto` on the server. */
export interface UpdatePropertyDto {
  name?: string;
  address?: string;
  floors?: number;
  activityType?: 'residential' | 'shop' | 'showroom' | 'office' | 'warehouse' | 'mixed';
  activitySubtype?: string;
  ownership?: 'owned' | 'leased' | 'managed';
  leaseValue?: number;
  leaseCycle?: string;
  leaseStart?: string;
  leaseEnd?: string;
  opRate?: number;
  deedNo?: string;
  lat?: number;
  lng?: number;
}

/** Request body: `UpdatePurchaseDto` on the server. */
export interface UpdatePurchaseDto {
  lines?: PurchaseLineDto[];
  warehouseId?: string;
  supplierId?: string;
  date?: string;
  dueDate?: string;
  supplierRef?: string;
  category?: string;
  categoryCode?: 'POWER' | 'WATER' | 'TELECOM' | 'RENT' | 'SALARIES' | 'COGS' | 'FORMATION' | 'OTHER';
  subtotal?: number;
  exempt?: boolean;
  excludeFromVat?: boolean;
  inputVatUse?: 'TAXABLE_ONLY' | 'EXEMPT_ONLY' | 'MIXED';
  amortize?: boolean;
  amortizeMonths?: number;
  incorpItem?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `UpdateQuoteDto` on the server. */
export interface UpdateQuoteDto {
  customerId?: string;
  issueDate?: string;
  validUntil?: string;
  notes?: string;
  status?: 'DRAFT' | 'SENT';
  lines?: QuoteLineDto[];
}

/** Request body: `UpdateReminderPolicyDto` on the server. */
export interface UpdateReminderPolicyDto {
  enabled?: boolean;
  daysBefore?: number;
  repeatEveryDays?: number;
  escalateAfterDays?: number | null;
  escalateToUserId?: string | null;
}

/** Request body: `UpdateScriptDto` on the server. */
export interface UpdateScriptDto {
  audience?: 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';
  title?: string;
  text?: string;
}

/** Request body: `UpdateSupplierDto` on the server. */
export interface UpdateSupplierDto {
  name?: string;
  vatNumber?: string;
  phone?: string;
  category?: string;
}

/** Request body: `UpdateTemplateDto` on the server. */
export interface UpdateTemplateDto {
  allowedScreens?: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes' | 'forms')[];
  name?: string;
  isAllScreens?: boolean;
  screenActions?: Record<string, unknown>;
}

/** Request body: `UpdateTransactionDto` on the server. */
export interface UpdateTransactionDto {
  bankId?: string;
  date?: string;
  description?: string;
  amount?: number;
  source?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** Request body: `UpdateUnitDto` on the server. */
export interface UpdateUnitDto {
  floor?: string;
  type?: string;
  subtype?: string;
  rentMonthly?: number;
  underMaintenance?: boolean;
  roomDetails?: string;
}

/** Request body: `UpdateWarehouseDto` on the server. */
export interface UpdateWarehouseDto {
  name?: string;
  location?: string;
  manager?: string;
}

/** Request body: `UpdateWarrantyDto` on the server. */
export interface UpdateWarrantyDto {
  subject?: string;
  unitId?: string | null;
  provider?: string;
  supplierId?: string | null;
  startDate?: string;
  endDate?: string;
  reference?: string;
  terms?: string;
  notes?: string;
}

/** Request body: `UpsertExchangeRateDto` on the server. */
export interface UpsertExchangeRateDto {
  fromCode: string;
  toCode: string;
  rate: number;
  date: string;
}

/** Request body: `UpsertSubProcessorDto` on the server. */
export interface UpsertSubProcessorDto {
  id?: string;
  name: string;
  purpose: string;
  location: string;
  dataCategories: string[];
}

/** Request body: `VatDeclarationQueryDto` on the server. */
export interface VatDeclarationQueryDto {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
}

/** Request body: `VatFiledDto` on the server. */
export interface VatFiledDto {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
  refundRequested?: boolean;
}

/** Request body: `VatRatioQueryDto` on the server. */
export interface VatRatioQueryDto {
  year: number;
}

/** Request body: `VerifyFormOtpDto` on the server. */
export interface VerifyFormOtpDto {
  challengeId: string;
  code: string;
}

/** Request body: `VoidCashDepositDto` on the server. */
export interface VoidCashDepositDto {
  reason?: string;
}

/** Request body: `VoidNetworkSettlementDto` on the server. */
export interface VoidNetworkSettlementDto {
  reason?: string;
}

/** Request body: `WaiveClaimDto` on the server. */
export interface WaiveClaimDto {
  waivedAt: string;
  reason: string;
  note?: string;
}

/** Query parameters of `AccountsController_list`. */
export interface AccountsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ActivitiesController_list`. */
export interface ActivitiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ActivitiesController_previewPrimary`. */
export interface ActivitiesPreviewPrimaryQuery {
  activityId: string;
}

/** Query parameters of `AdminDeletionRequestsController_list`. */
export interface AdminDeletionRequestsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `AttendanceController_list`. */
export interface AttendanceListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  date?: string;
  employeeId?: string;
}

/** Query parameters of `AuditController_list`. */
export interface AuditListQuery {
  actorId?: string;
  screen?: string;
  action?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `BanksController_listCashDeposits`. */
export interface BanksListCashDepositsQuery {
  bankId: string;
}

/** Query parameters of `BanksController_listNetworkSettlements`. */
export interface BanksListNetworkSettlementsQuery {
  bankId: string;
}

/** Query parameters of `BanksController_list`. */
export interface BanksListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `BanksController_openNetworkReceipts`. */
export interface BanksOpenNetworkReceiptsQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Query parameters of `BanksController_reconciliationOverview`. */
export interface BanksReconciliationOverviewQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `BranchesController_list`. */
export interface BranchesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `CashDrawersController_list`. */
export interface CashDrawersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `CompaniesController_list`. */
export interface CompaniesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `CompanyUsersController_list`. */
export interface CompanyUsersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ContractsController_list`. */
export interface ContractsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `CurrenciesController_list`. */
export interface CurrenciesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `CurrenciesController_listRates`. */
export interface CurrenciesListRatesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  fromCode?: string;
  toCode?: string;
}

/** Query parameters of `CustomersController_list`. */
export interface CustomersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `EmployeesController_list`. */
export interface EmployeesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `FilesController_downloadUrl`. */
export interface FilesDownloadUrlQuery {
  key: string;
}

/** Query parameters of `FiscalController_list`. */
export interface FiscalListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `IntegrationsController_list`. */
export interface IntegrationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `InventoryController_batchBalances`. */
export interface InventoryBatchBalancesQuery {
  productId: string;
}

/** Query parameters of `InventoryController_expiring`. */
export interface InventoryExpiringQuery {
  withinDays: string;
}

/** Query parameters of `InventoryController_listMovements`. */
export interface InventoryListMovementsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `InventoryController_listWriteOffs`. */
export interface InventoryListWriteOffsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

/** Query parameters of `InventoryController_provisional`. */
export interface InventoryProvisionalQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `InventoryController_stockLevels`. */
export interface InventoryStockLevelsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `InvoicesController_list`. */
export interface InvoicesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `JournalController_list`. */
export interface JournalListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `LeavesController_balance`. */
export interface LeavesBalanceQuery {
  employeeId: string;
  year: string;
}

/** Query parameters of `LeavesController_listRequests`. */
export interface LeavesListRequestsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  status?: string;
}

/** Query parameters of `LeavesController_listTypes`. */
export interface LeavesListTypesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `MaintenanceController_list`. */
export interface MaintenanceListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `NotificationsController_list`. */
export interface NotificationsListQuery {
  unread: string;
}

/** Query parameters of `NotificationsController_runEscalation`. */
export interface NotificationsRunEscalationQuery {
  contractId: string;
}

/** Query parameters of `ObligationsController_list`. */
export interface ObligationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ObligationsController_listVatClosings`. */
export interface ObligationsListVatClosingsQuery {
  year: number;
}

/** Query parameters of `ObligationsController_unmarkFiled`. */
export interface ObligationsUnmarkFiledQuery {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
  refundRequested?: boolean;
}

/** Query parameters of `ObligationsController_vatDeclaration`. */
export interface ObligationsVatDeclarationQuery {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
}

/** Query parameters of `ObligationsController_vatRatio`. */
export interface ObligationsVatRatioQuery {
  year: number;
}

/** Query parameters of `ObligationsController_vatSettlementPreview`. */
export interface ObligationsVatSettlementPreviewQuery {
  year: number;
}

/** Query parameters of `PaymentsController_list`. */
export interface PaymentsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  customerId?: string;
}

/** Query parameters of `PlatformAuditController_list`. */
export interface PlatformAuditListQuery {
  page?: number;
  pageSize?: number;
  adminId?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

/** Query parameters of `PlatformDecisionsController_list`. */
export interface PlatformDecisionsListQuery {
  status: string;
}

/** Query parameters of `PosController_cardVerifications`. */
export interface PosCardVerificationsQuery {
  state?: 'open' | 'overdue' | 'matched' | 'all';
}

/** Query parameters of `PosController_listShifts`. */
export interface PosListShiftsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ProductsController_list`. */
export interface ProductsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `PropertiesController_list`. */
export interface PropertiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `QuotesController_list`. */
export interface QuotesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `RemindersController_dueToday`. */
export interface RemindersDueTodayQuery {
  contractId: string;
}

/** Query parameters of `ReportsController_balanceSheet`. */
export interface ReportsBalanceSheetQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `ReportsController_branchSummary`. */
export interface ReportsBranchSummaryQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `ReportsController_cashFlow`. */
export interface ReportsCashFlowQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `ReportsController_dashboard`. */
export interface ReportsDashboardQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `ReportsController_incomeStatement`. */
export interface ReportsIncomeStatementQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `ReportsController_ledgerCsv`. */
export interface ReportsLedgerCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
  accountId?: string;
  propertyId?: string;
  unitId?: string;
}

/** Query parameters of `ReportsController_ledger`. */
export interface ReportsLedgerQuery {
  from?: string;
  to?: string;
  branchId?: string;
  accountId?: string;
  propertyId?: string;
  unitId?: string;
}

/** Query parameters of `ReportsController_noteDeadlines`. */
export interface ReportsNoteDeadlinesQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Query parameters of `ReportsController_receivablesAgingCsv`. */
export interface ReportsReceivablesAgingCsvQuery {
  asOf?: string;
  branchId?: string;
  customerId?: string;
  reconcile?: string;
}

/** Query parameters of `ReportsController_receivablesAging`. */
export interface ReportsReceivablesAgingQuery {
  asOf?: string;
  branchId?: string;
  customerId?: string;
  reconcile?: string;
}

/** Query parameters of `ReportsController_returns`. */
export interface ReportsReturnsQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Query parameters of `ReportsController_statementCsv`. */
export interface ReportsStatementCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
  customerId?: string;
  supplierId?: string;
}

/** Query parameters of `ReportsController_statement`. */
export interface ReportsStatementQuery {
  from?: string;
  to?: string;
  branchId?: string;
  customerId?: string;
  supplierId?: string;
}

/** Query parameters of `ReportsController_trialBalanceCsv`. */
export interface ReportsTrialBalanceCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Query parameters of `ReportsController_trialBalance`. */
export interface ReportsTrialBalanceQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Query parameters of `ReservationsController_list`. */
export interface ReservationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `ScriptsController_list`. */
export interface ScriptsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `SupplierPaymentsController_list`. */
export interface SupplierPaymentsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  supplierId?: string;
}

/** Query parameters of `SuppliersController_list`. */
export interface SuppliersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `SuppliersController_summary`. */
export interface SuppliersSummaryQuery {
  from?: string;
  to?: string;
}

/** Query parameters of `SupportAccessAdminController_list`. */
export interface SupportAccessAdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `SupportAccessOwnerController_log`. */
export interface SupportAccessOwnerLogQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `SupportAccessOwnerController_overview`. */
export interface SupportAccessOwnerOverviewQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `TasksController_mine`. */
export interface TasksMineQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `TemplatesController_list`. */
export interface TemplatesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `TransactionsController_list`. */
export interface TransactionsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Query parameters of `UnitsController_list`. */
export interface UnitsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `WarehousesController_list`. */
export interface WarehousesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** Query parameters of `WarrantiesController_cover`. */
export interface WarrantiesCoverQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  propertyId: string;
  unitId?: string;
  date?: string;
}

/** Query parameters of `WarrantiesController_list`. */
export interface WarrantiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  propertyId?: string;
}
