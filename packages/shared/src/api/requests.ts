// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — أجسامُ الطلب ووسائطُ الاستعلام (ق-١٤٠٤).
// يُعاد توليدُه بـ: npm run openapi:snapshot  (من apps/api)
// والحارسُ خطوةُ openapi:check نفسُها (scripts/openapi-snapshot.ts) — تعيد الرسمَ وتُسقط إن اختلف.

/** جسمُ طلب — `AcceptConsentDto` في الخادم. */
export interface AcceptConsentDto {
  version: number;
}

/** جسمُ طلب — `AllocateDto` في الخادم. */
export interface AllocateDto {
  allocations: AllocationDto[];
  date?: string;
}

/** جسمُ طلب — `AllocateSupplierPaymentDto` في الخادم. */
export interface AllocateSupplierPaymentDto {
  allocations: SupplierAllocationDto[];
}

/** جسمُ طلب — `AllocationDto` في الخادم. */
export interface AllocationDto {
  invoiceId: string;
  amount: number;
}

/** جسمُ طلب — `AssignMaintenanceDto` في الخادم. */
export interface AssignMaintenanceDto {
  assignedTo: string;
}

/** جسمُ طلب — `BulkCreateUnitsDto` في الخادم. */
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

/** جسمُ طلب — `CancelContractDto` في الخادم. */
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

/** جسمُ طلب — `CancelMaintenanceDto` في الخادم. */
export interface CancelMaintenanceDto {
  cancelReason: string;
}

/** جسمُ طلب — `ClaimWarrantyDto` في الخادم. */
export interface ClaimWarrantyDto {
  warrantyId?: string | null;
}

/** جسمُ طلب — `CloseMaintenanceDto` في الخادم. */
export interface CloseMaintenanceDto {
  closedAt: string;
}

/** جسمُ طلب — `CloseReconciliationDto` في الخادم. */
export interface CloseReconciliationDto {
  until: string;
}

/** جسمُ طلب — `CloseShiftDto` في الخادم. */
export interface CloseShiftDto {
  declaredClosing: number;
  notes?: string;
  closedOffsetMin?: number;
}

/** جسمُ طلب — `CommentTaskDto` في الخادم. */
export interface CommentTaskDto {
  note: string;
}

/** جسمُ طلب — `CompleteMaintenanceDto` في الخادم. */
export interface CompleteMaintenanceDto {
  completedAt: string;
  cost?: number;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** جسمُ طلب — `ConvertQuoteDto` في الخادم. */
export interface ConvertQuoteDto {
  creditOverride?: boolean;
}

/** جسمُ طلب — `CreateAccountDto` في الخادم. */
export interface CreateAccountDto {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openingBalance?: number;
  openingDate?: string;
}

/** جسمُ طلب — `CreateActivityDto` في الخادم. */
export interface CreateActivityDto {
  name: string;
  activityType?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER';
}

/** جسمُ طلب — `CreateApiKeyDto` في الخادم. */
export interface CreateApiKeyDto {
  name: string;
  permissionTemplateId: string;
}

/** جسمُ طلب — `CreateBankDto` في الخادم. */
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

/** جسمُ طلب — `CreateBranchDto` في الخادم. */
export interface CreateBranchDto {
  name: string;
  type?: string;
  activityId?: string;
  propertyId?: string;
  warehouseId?: string;
  hours?: string;
}

/** جسمُ طلب — `CreateCashDepositDto` في الخادم. */
export interface CreateCashDepositDto {
  drawerId: string;
  bankId: string;
  amount: number;
  date: string;
  memo?: string;
}

/** جسمُ طلب — `CreateCashDrawerDto` في الخادم. */
export interface CreateCashDrawerDto {
  name: string;
  branchId?: string;
}

/** جسمُ طلب — `CreateClaimDto` في الخادم. */
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

/** جسمُ طلب — `CreateCompanyDto` في الخادم. */
export interface CreateCompanyDto {
  orgName: string;
  username: string;
  password: string;
  permissionTemplateId: string;
  subStart?: string;
  subEnd?: string;
  country?: string;
}

/** جسمُ طلب — `CreateCompanyUserDto` في الخادم. */
export interface CreateCompanyUserDto {
  name: string;
  username: string;
  password: string;
  permissionTemplateId: string;
  branchIds?: string[];
  allBranches?: boolean;
  canEditMasterData?: boolean;
}

/** جسمُ طلب — `CreateContractDto` في الخادم. */
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
  draft?: boolean;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** جسمُ طلب — `CreateCreditNoteDto` في الخادم. */
export interface CreateCreditNoteDto {
  reason: string;
  issueDate?: string;
  eventDate?: string;
  lines?: InvoiceLineDto[];
}

/** جسمُ طلب — `CreateCurrencyDto` في الخادم. */
export interface CreateCurrencyDto {
  code: string;
  name: string;
  symbol?: string;
  rate?: number;
}

/** جسمُ طلب — `CreateCustomerDto` في الخادم. */
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

/** جسمُ طلب — `CreateDebitNoteDto` في الخادم. */
export interface CreateDebitNoteDto {
  reason: string;
  issueDate?: string;
  eventDate?: string;
  lines: InvoiceLineDto[];
}

/** جسمُ طلب — `CreateDelegationDto` في الخادم. */
export interface CreateDelegationDto {
  granteeId: string;
  nodeKey: 'root' | 'other' | 'realestate' | 'accounting' | 'sales' | 'purchasing' | 'hr' | 'banking' | 'compliance' | 'company' | 'overview' | 'dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes';
  grants: string[];
}

/** جسمُ طلب — `CreateEmployeeDto` في الخادم. */
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

/** جسمُ طلب — `CreateFiscalYearDto` في الخادم. */
export interface CreateFiscalYearDto {
  name: string;
  start: string;
  end: string;
}

/** جسمُ طلب — `CreateGoodsReceiptDto` في الخادم. */
export interface CreateGoodsReceiptDto {
  receivedAt: string;
  warehouseId?: string;
  notes?: string;
  lines: GoodsReceiptLineDto[];
}

/** جسمُ طلب — `CreateHandoverDto` في الخادم. */
export interface CreateHandoverDto {
  type: 'DELIVERY' | 'RECEIPT';
  date: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  items: HandoverItemDto[];
}

/** جسمُ طلب — `CreateIntegrationDto` في الخادم. */
export interface CreateIntegrationDto {
  kind: 'PAYMENT_GATEWAY' | 'BNPL' | 'ECOMMERCE';
  provider: string;
  label?: string;
  credentials: Record<string, unknown>;
}

/** جسمُ طلب — `CreateInvoiceDto` في الخادم. */
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

/** جسمُ طلب — `CreateJournalEntryDto` في الخادم. */
export interface CreateJournalEntryDto {
  date: string;
  memo: string;
  lines: JournalLineDto[];
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** جسمُ طلب — `CreateLandedCostDto` في الخادم. */
export interface CreateLandedCostDto {
  purchaseLineId: string;
  method?: 'VALUE' | 'QUANTITY' | 'MANUAL';
  date?: string;
  layerIds?: string[];
  goodsReceiptIds?: string[];
  lines?: LandedCostManualLineDto[];
  notes?: string;
}

/** جسمُ طلب — `CreateLeaveRequestDto` في الخادم. */
export interface CreateLeaveRequestDto {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

/** جسمُ طلب — `CreateLeaveTypeDto` في الخادم. */
export interface CreateLeaveTypeDto {
  name: string;
  annualDays?: number;
  paid?: boolean;
}

/** جسمُ طلب — `CreateMaintenanceDto` في الخادم. */
export interface CreateMaintenanceDto {
  propertyId: string;
  unitId?: string;
  title: string;
  description?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  reportedBy?: string;
  reportedAt: string;
}

/** جسمُ طلب — `CreateNetworkSettlementDto` في الخادم. */
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

/** جسمُ طلب — `CreatePaymentDto` في الخادم. */
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

/** جسمُ طلب — `CreatePosPaymentAttemptDto` في الخادم. */
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

/** جسمُ طلب — `CreatePosSaleDto` في الخادم. */
export interface CreatePosSaleDto {
  lines: PosSaleLineDto[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  payments?: PosPaymentPartDto[];
  customerId?: string;
  ringAt?: string;
  ringOffsetMin?: number;
  cardDeviceReference?: string;
}

/** جسمُ طلب — `CreateProductDto` في الخادم. */
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

/** جسمُ طلب — `CreatePropertyDto` في الخادم. */
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

/** جسمُ طلب — `CreatePurchaseDto` في الخادم. */
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

/** جسمُ طلب — `CreateQuoteDto` في الخادم. */
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

/** جسمُ طلب — `CreateReservationDto` في الخادم. */
export interface CreateReservationDto {
  unitId: string;
  name: string;
  phone?: string;
  deposit?: number;
  expiryDate: string;
}

/** جسمُ طلب — `CreateScriptDto` في الخادم. */
export interface CreateScriptDto {
  audience: 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';
  title: string;
  text: string;
}

/** جسمُ طلب — `CreateStockMovementDto` في الخادم. */
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

/** جسمُ طلب — `CreateSupplierDto` في الخادم. */
export interface CreateSupplierDto {
  name: string;
  vatNumber?: string;
  phone?: string;
  category?: string;
}

/** جسمُ طلب — `CreateSupplierNoteDto` في الخادم. */
export interface CreateSupplierNoteDto {
  reason: string;
  date?: string;
  supplierRef?: string;
  lines?: SupplierNoteLineDto[];
}

/** جسمُ طلب — `CreateSupplierPaymentDto` في الخادم. */
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

/** جسمُ طلب — `CreateTaskDto` في الخادم. */
export interface CreateTaskDto {
  title: string;
  assigneeId: string;
  assigneeKind: 'OWNER' | 'USER';
  targetScreen?: 'dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes';
  targetId?: string;
  note?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  department?: string;
  recurEveryDays?: number;
  dueAnchor?: string;
}

/** جسمُ طلب — `CreateTemplateDto` في الخادم. */
export interface CreateTemplateDto {
  allowedScreens?: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes')[];
  name: string;
  isAllScreens?: boolean;
  screenActions?: Record<string, unknown>;
}

/** جسمُ طلب — `CreateTransactionDto` في الخادم. */
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

/** جسمُ طلب — `CreateUnitDto` في الخادم. */
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

/** جسمُ طلب — `CreateWarehouseDto` في الخادم. */
export interface CreateWarehouseDto {
  name: string;
  location?: string;
  manager?: string;
}

/** جسمُ طلب — `CreateWarrantyDto` في الخادم. */
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

/** جسمُ طلب — `CreateWriteOffDto` في الخادم. */
export interface CreateWriteOffDto {
  productId: string;
  warehouseId: string;
  qty: number;
  reasonCode: string;
  occurredAt: string;
  note?: string;
  branchId?: string;
}

/** جسمُ طلب — `DecideDto` في الخادم. */
export interface DecideDto {
  note?: string;
}

/** جسمُ طلب — `DecideLeaveRequestDto` في الخادم. */
export interface DecideLeaveRequestDto {
  note?: string;
}

/** جسمُ طلب — `DeclareStockOpeningDto` في الخادم. */
export interface DeclareStockOpeningDto {
  openingDate?: string;
  notes?: string;
  lines: StockOpeningLineDto[];
  branchId?: string;
}

/** جسمُ طلب — `DeclareVatCorrectionDto` في الخادم. */
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

/** جسمُ طلب — `DeclareVatRatioDto` في الخادم. */
export interface DeclareVatRatioDto {
  year: number;
  ratio: number;
  basis: 'COMPUTED' | 'ESTIMATED';
  note?: string;
}

/** جسمُ طلب — `DeductionDto` في الخادم. */
export interface DeductionDto {
  kind: 'UNPAID_RENT' | 'DAMAGE' | 'UTILITIES' | 'CLEANING' | 'OTHER';
  amount: number;
  reason: string;
  taxTreatment?: 'TAXABLE_SERVICE' | 'ON_BEHALF' | 'COMPENSATION';
  onBehalfEvidence?: string;
}

/** جسمُ طلب — `DeletionRequestDecisionDto` في الخادم. */
export interface DeletionRequestDecisionDto {
  note?: string;
}

/** جسمُ طلب — `FindByNationalIdDto` في الخادم. */
export interface FindByNationalIdDto {
  nationalId: string;
}

/** جسمُ طلب — `ForgotPasswordDto` في الخادم. */
export interface ForgotPasswordDto {
  username: string;
}

/** جسمُ طلب — `GoodsReceiptLineDto` في الخادم. */
export interface GoodsReceiptLineDto {
  purchaseLineId: string;
  quantity: number;
  batchNo?: string;
  expiryDate?: string;
}

/** جسمُ طلب — `HandoverItemDto` في الخادم. */
export interface HandoverItemDto {
  label: string;
  condition: 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
  note?: string;
}

/** جسمُ طلب — `InvoiceLineDto` في الخادم. */
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

/** جسمُ طلب — `IssueReplacementDto` في الخادم. */
export interface IssueReplacementDto {
  issuedAt?: string;
  issuedOffsetMin?: number;
}

/** جسمُ طلب — `JournalLineDto` في الخادم. */
export interface JournalLineDto {
  accountId: string;
  debit: number;
  credit: number;
}

/** جسمُ طلب — `LandedCostManualLineDto` في الخادم. */
export interface LandedCostManualLineDto {
  layerId: string;
  baseAmount: number;
}

/** جسمُ طلب — `LinkLoginAccountDto` في الخادم. */
export interface LinkLoginAccountDto {
  companyUserId: string | null;
}

/** جسمُ طلب — `LoginDto` في الخادم. */
export interface LoginDto {
  username: string;
  password: string;
  code?: string;
}

/** جسمُ طلب — `MatchStatementLineDto` في الخادم. */
export interface MatchStatementLineDto {
  transactionId: string;
  lineId: string;
}

/** جسمُ طلب — `MfaCodeDto` في الخادم. */
export interface MfaCodeDto {
  code: string;
}

/** جسمُ طلب — `OpenShiftDto` في الخادم. */
export interface OpenShiftDto {
  openingFloat: number;
  branchId?: string;
  drawerId?: string;
}

/** جسمُ طلب — `PayClaimDto` في الخادم. */
export interface PayClaimDto {
  paidAt: string;
  exchangeRate?: number;
}

/** جسمُ طلب — `PosPaymentPartDto` في الخادم. */
export interface PosPaymentPartDto {
  method: 'CASH' | 'CARD';
  amount: number;
}

/** جسمُ طلب — `PosSaleLineDto` في الخادم. */
export interface PosSaleLineDto {
  productId: string;
  quantity: number;
  discount?: number;
}

/** جسمُ طلب — `PostStatementLineDto` في الخادم. */
export interface PostStatementLineDto {
  transactionId: string;
  counterpartyAccountId?: string;
  depositId?: string;
  memo?: string;
}

/** جسمُ طلب — `PrepaymentTaxDto` في الخادم. */
export interface PrepaymentTaxDto {
  taxCategory: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

/** جسمُ طلب — `PublishVersionDto` في الخادم. */
export interface PublishVersionDto {
  summary: string;
  effectiveFrom: string;
}

/** جسمُ طلب — `PurchaseLineDto` في الخادم. */
export interface PurchaseLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  batchNo?: string;
  expiryDate?: string;
}

/** جسمُ طلب — `QuoteLineDto` في الخادم. */
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

/** جسمُ طلب — `RecordAttendanceDto` في الخادم. */
export interface RecordAttendanceDto {
  employeeId: string;
  date: string;
  status?: 'PRESENT' | 'ABSENT';
  checkIn?: string;
  notes?: string;
}

/** جسمُ طلب — `RecordDepositDto` في الخادم. */
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

/** جسمُ طلب — `RecordKeyMoneyDto` في الخادم. */
export interface RecordKeyMoneyDto {
  direction: 'RECEIVED' | 'PAID';
  amount: number;
  paidAt: string;
  note?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

/** جسمُ طلب — `RecordMarketingConsentDto` في الخادم. */
export interface RecordMarketingConsentDto {
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
  granted: boolean;
  source: 'IN_PERSON' | 'PHONE' | 'WEB_FORM' | 'WRITTEN' | 'IMPORTED';
  at?: string;
  note?: string;
}

/** جسمُ طلب — `RecordPaymentDto` في الخادم. */
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

/** جسمُ طلب — `RefundDto` في الخادم. */
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

/** جسمُ طلب — `RegisterDto` في الخادم. */
export interface RegisterDto {
  orgName: string;
  username: string;
  password: string;
  email?: string;
  country?: string;
}

/** جسمُ طلب — `RejectWriteOffDto` في الخادم. */
export interface RejectWriteOffDto {
  reason: string;
}

/** جسمُ طلب — `RenewContractDto` في الخادم. */
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

/** جسمُ طلب — `RenewSubscriptionDto` في الخادم. */
export interface RenewSubscriptionDto {
  months: number;
}

/** جسمُ طلب — `ReopenPeriodDto` في الخادم. */
export interface ReopenPeriodDto {
  reason: string;
}

/** جسمُ طلب — `RequestDecisionDto` في الخادم. */
export interface RequestDecisionDto {
  action: 'ACCOUNT_ERASURE' | 'SUBSCRIPTION_CHANGE' | 'REFUND';
  targetId: string;
  summary: string;
}

/** جسمُ طلب — `RequestSupportAccessDto` في الخادم. */
export interface RequestSupportAccessDto {
  screens: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes')[];
  companyId: string;
  reason: string;
  durationMinutes: number;
}

/** جسمُ طلب — `ResetPasswordDto` في الخادم. */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

/** جسمُ طلب — `ResolvePaymentAttemptWithEvidenceDto` في الخادم. */
export interface ResolvePaymentAttemptWithEvidenceDto {
  deviceReference: string;
  approvalCode: string;
  note?: string;
}

/** جسمُ طلب — `ReverseJournalEntryDto` في الخادم. */
export interface ReverseJournalEntryDto {
  date?: string;
  memo?: string;
}

/** جسمُ طلب — `ReversePaymentDto` في الخادم. */
export interface ReversePaymentDto {
  reason?: string;
  date?: string;
}

/** جسمُ طلب — `ReverseSupplierPaymentDto` في الخادم. */
export interface ReverseSupplierPaymentDto {
  reason?: string;
  date?: string;
}

/** جسمُ طلب — `SendReminderDto` في الخادم. */
export interface SendReminderDto {
  channel: 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL' | 'OTHER';
  message: string;
}

/** جسمُ طلب — `SetArchivedDto` في الخادم. */
export interface SetArchivedDto {
  archived: boolean;
}

/** جسمُ طلب — `SetEnabledDto` في الخادم. */
export interface SetEnabledDto {
  enabled: boolean;
}

/** جسمُ طلب — `SetFiscalStartMonthDto` في الخادم. */
export interface SetFiscalStartMonthDto {
  month: number;
}

/** جسمُ طلب — `SetPrimaryActivityDto` في الخادم. */
export interface SetPrimaryActivityDto {
  activityId?: string | null;
  confirmed: boolean;
}

/** جسمُ طلب — `SettleDepositDto` في الخادم. */
export interface SettleDepositDto {
  settledAt: string;
  deductions: DeductionDto[];
  exchangeRate?: number;
}

/** جسمُ طلب — `SettlementLineDto` في الخادم. */
export interface SettlementLineDto {
  label: string;
  amount: number;
}

/** جسمُ طلب — `SignHandoverDto` في الخادم. */
export interface SignHandoverDto {
  signedBy: string;
}

/** جسمُ طلب — `StartMaintenanceDto` في الخادم. */
export interface StartMaintenanceDto {
  startedAt: string;
}

/** جسمُ طلب — `StartOnboardingDto` في الخادم. */
export interface StartOnboardingDto {
  environment?: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
  branchName?: string;
  registeredAddress?: string;
  businessCategory?: string;
  invoiceType?: string;
}

/** جسمُ طلب — `StockOpeningLineDto` في الخادم. */
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

/** جسمُ طلب — `SubmitDeletionRequestDto` في الخادم. */
export interface SubmitDeletionRequestDto {
  reason?: string;
}

/** جسمُ طلب — `SubmitOtpDto` في الخادم. */
export interface SubmitOtpDto {
  otp: string;
}

/** جسمُ طلب — `SupplierAllocationDto` في الخادم. */
export interface SupplierAllocationDto {
  purchaseId: string;
  amount: number;
}

/** جسمُ طلب — `SupplierNoteLineDto` في الخادم. */
export interface SupplierNoteLineDto {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  returnsPurchaseLineId?: string;
  goodsReturned?: boolean;
}

/** جسمُ طلب — `SyncPosSaleDto` في الخادم. */
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

/** جسمُ طلب — `TransferBankDto` في الخادم. */
export interface TransferBankDto {
  toBranchId: string;
  countedAmount?: number;
  date?: string;
  name?: string;
}

/** جسمُ طلب — `TransferCashDrawerDto` في الخادم. */
export interface TransferCashDrawerDto {
  toBranchId: string;
  countedAmount: number;
  date: string;
  name?: string;
}

/** جسمُ طلب — `TransferEmployeeDto` في الخادم. */
export interface TransferEmployeeDto {
  fromBranchId: string | null;
  toBranchId: string;
  loginAccountBranchIds?: string[];
}

/** جسمُ طلب — `TransitionTaskDto` في الخادم. */
export interface TransitionTaskDto {
  to: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  note?: string;
}

/** جسمُ طلب — `UnmatchStatementLineDto` في الخادم. */
export interface UnmatchStatementLineDto {
  transactionId: string;
}

/** جسمُ طلب — `UpdateAccountDto` في الخادم. */
export interface UpdateAccountDto {
  name?: string;
  type?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openingBalance?: number;
  openingDate?: string;
}

/** جسمُ طلب — `UpdateActivityDto` في الخادم. */
export interface UpdateActivityDto {
  name?: string;
  activityType?: string;
  sector?: 'REALESTATE' | 'RESTAURANT' | 'RETAIL' | 'PHARMACY' | 'CONTRACTING' | 'FREELANCE' | 'OTHER';
  disabled?: boolean;
}

/** جسمُ طلب — `UpdateAttendanceDto` في الخادم. */
export interface UpdateAttendanceDto {
  status?: 'PRESENT' | 'ABSENT';
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

/** جسمُ طلب — `UpdateBankDto` في الخادم. */
export interface UpdateBankDto {
  name?: string;
  kind?: 'CASH_BOX' | 'BANK_ACCOUNT';
  iban?: string;
  openingBalance?: number;
  openingDate?: string;
}

/** جسمُ طلب — `UpdateBranchDto` في الخادم. */
export interface UpdateBranchDto {
  name?: string;
  type?: string;
  activityId?: string;
  propertyId?: string;
  warehouseId?: string;
  hours?: string;
}

/** جسمُ طلب — `UpdateCashDrawerDto` في الخادم. */
export interface UpdateCashDrawerDto {
  name?: string;
  isActive?: boolean;
}

/** جسمُ طلب — `UpdateCompanyDto` في الخادم. */
export interface UpdateCompanyDto {
  orgName?: string;
  username?: string;
  password?: string;
  permissionTemplateId?: string;
}

/** جسمُ طلب — `UpdateCompanyProfileDto` في الخادم. */
export interface UpdateCompanyProfileDto {
  legalName?: string;
  slug?: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
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

/** جسمُ طلب — `UpdateCompanySubscriptionDto` في الخادم. */
export interface UpdateCompanySubscriptionDto {
  subStart?: string;
  subEnd?: string;
}

/** جسمُ طلب — `UpdateCompanyUserDto` في الخادم. */
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

/** جسمُ طلب — `UpdateContractDto` في الخادم. */
export interface UpdateContractDto {
  customerId?: string;
  services?: string;
  furnished?: 'unfurnished' | 'furnished' | 'partial';
  ejarNo?: string;
  classification?: 'RESIDENTIAL' | 'COMMERCIAL' | 'SERVICED_LODGING' | 'MIXED';
  vatInclusion?: 'INCLUSIVE' | 'EXCLUSIVE';
  exemptSharePercent?: number;
  exemptShareBasis?: string;
  lessor?: 'COMPANY' | 'OWNER';
  ownerName?: string;
  ownerVatNumber?: string;
}

/** جسمُ طلب — `UpdateCurrencyDto` في الخادم. */
export interface UpdateCurrencyDto {
  name?: string;
  symbol?: string;
  rate?: number;
}

/** جسمُ طلب — `UpdateCustomerDto` في الخادم. */
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

/** جسمُ طلب — `UpdateEmployeeDto` في الخادم. */
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

/** جسمُ طلب — `UpdateHandoverDto` في الخادم. */
export interface UpdateHandoverDto {
  date?: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  items?: HandoverItemDto[];
}

/** جسمُ طلب — `UpdateInvoiceDto` في الخادم. */
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

/** جسمُ طلب — `UpdateLeaveTypeDto` في الخادم. */
export interface UpdateLeaveTypeDto {
  name?: string;
  annualDays?: number;
  paid?: boolean;
}

/** جسمُ طلب — `UpdateMaintenanceDto` في الخادم. */
export interface UpdateMaintenanceDto {
  title?: string;
  description?: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL';
  reportedBy?: string;
  notes?: string;
}

/** جسمُ طلب — `UpdateProductDto` في الخادم. */
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

/** جسمُ طلب — `UpdatePropertyDto` في الخادم. */
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

/** جسمُ طلب — `UpdatePurchaseDto` في الخادم. */
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

/** جسمُ طلب — `UpdateQuoteDto` في الخادم. */
export interface UpdateQuoteDto {
  customerId?: string;
  issueDate?: string;
  validUntil?: string;
  notes?: string;
  status?: 'DRAFT' | 'SENT';
  lines?: QuoteLineDto[];
}

/** جسمُ طلب — `UpdateReminderPolicyDto` في الخادم. */
export interface UpdateReminderPolicyDto {
  enabled?: boolean;
  daysBefore?: number;
  repeatEveryDays?: number;
  escalateAfterDays?: number | null;
  escalateToUserId?: string | null;
}

/** جسمُ طلب — `UpdateScriptDto` في الخادم. */
export interface UpdateScriptDto {
  audience?: 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';
  title?: string;
  text?: string;
}

/** جسمُ طلب — `UpdateSupplierDto` في الخادم. */
export interface UpdateSupplierDto {
  name?: string;
  vatNumber?: string;
  phone?: string;
  category?: string;
}

/** جسمُ طلب — `UpdateTemplateDto` في الخادم. */
export interface UpdateTemplateDto {
  allowedScreens?: ('dashboard' | 'accounts' | 'journal' | 'fiscal' | 'branches' | 'settings' | 'invoice' | 'payments' | 'customers' | 'suppliers' | 'products' | 'inventory' | 'properties' | 'contracts' | 'maintenance' | 'employees' | 'banks' | 'transactions' | 'obligations' | 'reports' | 'scripts' | 'audit' | 'pos' | 'quotes')[];
  name?: string;
  isAllScreens?: boolean;
  screenActions?: Record<string, unknown>;
}

/** جسمُ طلب — `UpdateTransactionDto` في الخادم. */
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

/** جسمُ طلب — `UpdateUnitDto` في الخادم. */
export interface UpdateUnitDto {
  floor?: string;
  type?: string;
  subtype?: string;
  rentMonthly?: number;
  underMaintenance?: boolean;
  roomDetails?: string;
}

/** جسمُ طلب — `UpdateWarehouseDto` في الخادم. */
export interface UpdateWarehouseDto {
  name?: string;
  location?: string;
  manager?: string;
}

/** جسمُ طلب — `UpdateWarrantyDto` في الخادم. */
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

/** جسمُ طلب — `UpsertExchangeRateDto` في الخادم. */
export interface UpsertExchangeRateDto {
  fromCode: string;
  toCode: string;
  rate: number;
  date: string;
}

/** جسمُ طلب — `UpsertSubProcessorDto` في الخادم. */
export interface UpsertSubProcessorDto {
  id?: string;
  name: string;
  purpose: string;
  location: string;
  dataCategories: string[];
}

/** جسمُ طلب — `VatDeclarationQueryDto` في الخادم. */
export interface VatDeclarationQueryDto {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
}

/** جسمُ طلب — `VatFiledDto` في الخادم. */
export interface VatFiledDto {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
  refundRequested?: boolean;
}

/** جسمُ طلب — `VatRatioQueryDto` في الخادم. */
export interface VatRatioQueryDto {
  year: number;
}

/** جسمُ طلب — `VoidCashDepositDto` في الخادم. */
export interface VoidCashDepositDto {
  reason?: string;
}

/** جسمُ طلب — `VoidNetworkSettlementDto` في الخادم. */
export interface VoidNetworkSettlementDto {
  reason?: string;
}

/** جسمُ طلب — `WaiveClaimDto` في الخادم. */
export interface WaiveClaimDto {
  waivedAt: string;
  reason: string;
  note?: string;
}

/** وسائطُ استعلام `AccountsController_list`. */
export interface AccountsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ActivitiesController_list`. */
export interface ActivitiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ActivitiesController_previewPrimary`. */
export interface ActivitiesPreviewPrimaryQuery {
  activityId: string;
}

/** وسائطُ استعلام `AdminDeletionRequestsController_list`. */
export interface AdminDeletionRequestsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `AttendanceController_list`. */
export interface AttendanceListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  date?: string;
  employeeId?: string;
}

/** وسائطُ استعلام `AuditController_list`. */
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

/** وسائطُ استعلام `BanksController_listCashDeposits`. */
export interface BanksListCashDepositsQuery {
  bankId: string;
}

/** وسائطُ استعلام `BanksController_listNetworkSettlements`. */
export interface BanksListNetworkSettlementsQuery {
  bankId: string;
}

/** وسائطُ استعلام `BanksController_list`. */
export interface BanksListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `BanksController_openNetworkReceipts`. */
export interface BanksOpenNetworkReceiptsQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** وسائطُ استعلام `BanksController_reconciliationOverview`. */
export interface BanksReconciliationOverviewQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `BranchesController_list`. */
export interface BranchesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `CashDrawersController_list`. */
export interface CashDrawersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `CompaniesController_list`. */
export interface CompaniesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `CompanyUsersController_list`. */
export interface CompanyUsersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ContractsController_list`. */
export interface ContractsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `CurrenciesController_list`. */
export interface CurrenciesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `CurrenciesController_listRates`. */
export interface CurrenciesListRatesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  fromCode?: string;
  toCode?: string;
}

/** وسائطُ استعلام `CustomersController_list`. */
export interface CustomersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `EmployeesController_list`. */
export interface EmployeesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `FilesController_downloadUrl`. */
export interface FilesDownloadUrlQuery {
  key: string;
}

/** وسائطُ استعلام `FiscalController_list`. */
export interface FiscalListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `IntegrationsController_list`. */
export interface IntegrationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `InventoryController_batchBalances`. */
export interface InventoryBatchBalancesQuery {
  productId: string;
}

/** وسائطُ استعلام `InventoryController_expiring`. */
export interface InventoryExpiringQuery {
  withinDays: string;
}

/** وسائطُ استعلام `InventoryController_listMovements`. */
export interface InventoryListMovementsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `InventoryController_listWriteOffs`. */
export interface InventoryListWriteOffsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

/** وسائطُ استعلام `InventoryController_provisional`. */
export interface InventoryProvisionalQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `InventoryController_stockLevels`. */
export interface InventoryStockLevelsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `InvoicesController_list`. */
export interface InvoicesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `JournalController_list`. */
export interface JournalListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `LeavesController_balance`. */
export interface LeavesBalanceQuery {
  employeeId: string;
  year: string;
}

/** وسائطُ استعلام `LeavesController_listRequests`. */
export interface LeavesListRequestsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  status?: string;
}

/** وسائطُ استعلام `LeavesController_listTypes`. */
export interface LeavesListTypesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `MaintenanceController_list`. */
export interface MaintenanceListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `NotificationsController_list`. */
export interface NotificationsListQuery {
  unread: string;
}

/** وسائطُ استعلام `NotificationsController_runEscalation`. */
export interface NotificationsRunEscalationQuery {
  contractId: string;
}

/** وسائطُ استعلام `ObligationsController_list`. */
export interface ObligationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ObligationsController_listVatClosings`. */
export interface ObligationsListVatClosingsQuery {
  year: number;
}

/** وسائطُ استعلام `ObligationsController_unmarkFiled`. */
export interface ObligationsUnmarkFiledQuery {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
  refundRequested?: boolean;
}

/** وسائطُ استعلام `ObligationsController_vatDeclaration`. */
export interface ObligationsVatDeclarationQuery {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  periodChoice?: number;
}

/** وسائطُ استعلام `ObligationsController_vatRatio`. */
export interface ObligationsVatRatioQuery {
  year: number;
}

/** وسائطُ استعلام `ObligationsController_vatSettlementPreview`. */
export interface ObligationsVatSettlementPreviewQuery {
  year: number;
}

/** وسائطُ استعلام `PaymentsController_list`. */
export interface PaymentsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  customerId?: string;
}

/** وسائطُ استعلام `PlatformDecisionsController_list`. */
export interface PlatformDecisionsListQuery {
  status: string;
}

/** وسائطُ استعلام `PosController_cardVerifications`. */
export interface PosCardVerificationsQuery {
  state?: 'open' | 'overdue' | 'matched' | 'all';
}

/** وسائطُ استعلام `PosController_listShifts`. */
export interface PosListShiftsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ProductsController_list`. */
export interface ProductsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `PropertiesController_list`. */
export interface PropertiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `QuotesController_list`. */
export interface QuotesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `RemindersController_dueToday`. */
export interface RemindersDueTodayQuery {
  contractId: string;
}

/** وسائطُ استعلام `ReportsController_balanceSheet`. */
export interface ReportsBalanceSheetQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `ReportsController_branchSummary`. */
export interface ReportsBranchSummaryQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `ReportsController_cashFlow`. */
export interface ReportsCashFlowQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `ReportsController_dashboard`. */
export interface ReportsDashboardQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `ReportsController_incomeStatement`. */
export interface ReportsIncomeStatementQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `ReportsController_ledgerCsv`. */
export interface ReportsLedgerCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
  accountId?: string;
  propertyId?: string;
  unitId?: string;
}

/** وسائطُ استعلام `ReportsController_ledger`. */
export interface ReportsLedgerQuery {
  from?: string;
  to?: string;
  branchId?: string;
  accountId?: string;
  propertyId?: string;
  unitId?: string;
}

/** وسائطُ استعلام `ReportsController_noteDeadlines`. */
export interface ReportsNoteDeadlinesQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** وسائطُ استعلام `ReportsController_receivablesAgingCsv`. */
export interface ReportsReceivablesAgingCsvQuery {
  asOf?: string;
  branchId?: string;
  customerId?: string;
  reconcile?: string;
}

/** وسائطُ استعلام `ReportsController_receivablesAging`. */
export interface ReportsReceivablesAgingQuery {
  asOf?: string;
  branchId?: string;
  customerId?: string;
  reconcile?: string;
}

/** وسائطُ استعلام `ReportsController_returns`. */
export interface ReportsReturnsQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** وسائطُ استعلام `ReportsController_statementCsv`. */
export interface ReportsStatementCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
  customerId?: string;
  supplierId?: string;
}

/** وسائطُ استعلام `ReportsController_statement`. */
export interface ReportsStatementQuery {
  from?: string;
  to?: string;
  branchId?: string;
  customerId?: string;
  supplierId?: string;
}

/** وسائطُ استعلام `ReportsController_trialBalanceCsv`. */
export interface ReportsTrialBalanceCsvQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** وسائطُ استعلام `ReportsController_trialBalance`. */
export interface ReportsTrialBalanceQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** وسائطُ استعلام `ReservationsController_list`. */
export interface ReservationsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `ScriptsController_list`. */
export interface ScriptsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `SupplierPaymentsController_list`. */
export interface SupplierPaymentsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  supplierId?: string;
}

/** وسائطُ استعلام `SuppliersController_list`. */
export interface SuppliersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `SuppliersController_summary`. */
export interface SuppliersSummaryQuery {
  from?: string;
  to?: string;
}

/** وسائطُ استعلام `SupportAccessAdminController_list`. */
export interface SupportAccessAdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `SupportAccessOwnerController_log`. */
export interface SupportAccessOwnerLogQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `SupportAccessOwnerController_overview`. */
export interface SupportAccessOwnerOverviewQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `TasksController_mine`. */
export interface TasksMineQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `TemplatesController_list`. */
export interface TemplatesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `TransactionsController_list`. */
export interface TransactionsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** وسائطُ استعلام `UnitsController_list`. */
export interface UnitsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `WarehousesController_list`. */
export interface WarehousesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: 'true' | 'false';
}

/** وسائطُ استعلام `WarrantiesController_cover`. */
export interface WarrantiesCoverQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  propertyId: string;
  unitId?: string;
  date?: string;
}

/** وسائطُ استعلام `WarrantiesController_list`. */
export interface WarrantiesListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  propertyId?: string;
}
