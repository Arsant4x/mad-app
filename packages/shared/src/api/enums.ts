// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: docs/web-enum-mirrors.json (سجلُّ #579) — قيمُ كلِّ تعدادٍ من مقابله في الخادم، بترتيبه. (ما لا يحمل علامةً سعودية)
// يُعاد توليدُه بـ: npx ts-node scripts/generate-shared-enums.ts  (من apps/api)
// والحارسُ apps/api/src/common/shared-enums-generated.spec.ts يُسقط الحزمةَ إن اختلف عن مصدره.

/** `prisma:AccountRequestKind` — ويقابلُه `apps/web/src/api/deletionRequests.ts#AccountRequestKind`. */
export const ACCOUNT_REQUEST_KIND_VALUES = ['DELETION', 'REOPENING', 'ERASURE'] as const;
export type AccountRequestKind = (typeof ACCOUNT_REQUEST_KIND_VALUES)[number];

/** `prisma:AccountRequestOutcome` — ويقابلُه `apps/web/src/api/deletionRequests.ts#AccountRequestOutcome`. */
export const ACCOUNT_REQUEST_OUTCOME_VALUES = ['DELETED', 'CLOSED', 'REOPENED', 'ERASED'] as const;
export type AccountRequestOutcome = (typeof ACCOUNT_REQUEST_OUTCOME_VALUES)[number];

/** `prisma:AccountStatus` — ويقابلُه `apps/web/src/api/client.ts#AccountStatus`. */
export const ACCOUNT_STATUS_VALUES = ['ACTIVE', 'FROZEN', 'STOPPED', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUS_VALUES)[number];

/** `const:apps/api/src/accounts/dto/create-account.dto.ts#ACCOUNT_TYPES` — ويقابلُه `apps/web/src/api/accounts.ts#AccountType`. */
export const ACCOUNT_TYPE_VALUES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];

/** `const:apps/api/src/properties/dto/create-property.dto.ts#ACTIVITY_TYPES` — ويقابلُه `apps/web/src/api/properties.ts#ActivityType`. */
export const ACTIVITY_TYPE_VALUES = ['residential', 'shop', 'showroom', 'office', 'warehouse', 'mixed'] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];

/** `prop:apps/api/src/auth/auth.service.ts#AuthUserView.actorType` — ويقابلُه `apps/web/src/api/client.ts#ActorType`. */
export const ACTOR_TYPE_VALUES = ['PLATFORM_ADMIN', 'COMPANY', 'COMPANY_USER'] as const;
export type ActorType = (typeof ACTOR_TYPE_VALUES)[number];

/** `prisma:AttendanceStatus` — ويقابلُه `apps/web/src/api/attendance.ts#AttendanceStatus`. */
export const ATTENDANCE_STATUS_VALUES = ['PRESENT', 'ABSENT'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS_VALUES)[number];

/** `prisma:BankKind` — ويقابلُه `apps/web/src/api/banks.ts#BankKind`. */
export const BANK_KIND_VALUES = ['CASH_BOX', 'BANK_ACCOUNT', 'LEGACY_UNDECLARED'] as const;
export type BankKind = (typeof BANK_KIND_VALUES)[number];

/** `const:apps/api/src/customers/dto/create-customer.dto.ts#BUYER_ID_SCHEMES` — ويقابلُه `apps/web/src/api/customers.ts#BuyerIdScheme`. */
export const BUYER_ID_SCHEME_VALUES = ['TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH'] as const;
export type BuyerIdScheme = (typeof BUYER_ID_SCHEME_VALUES)[number];

/** `prisma:CashDepositStatus` — ويقابلُه `apps/web/src/api/banks.ts#CashDepositStatus`. */
export const CASH_DEPOSIT_STATUS_VALUES = ['IN_TRANSIT', 'CONFIRMED', 'VOID'] as const;
export type CashDepositStatus = (typeof CASH_DEPOSIT_STATUS_VALUES)[number];

/** `prisma:ClaimKind` — ويقابلُه `apps/web/src/api/contracts.ts#ClaimKind`. */
export const CLAIM_KIND_VALUES = ['MAINTENANCE', 'UTILITIES', 'LATE_FEE', 'DAMAGE', 'OTHER'] as const;
export type ClaimKind = (typeof CLAIM_KIND_VALUES)[number];

/** `prisma:ClaimStatus` — ويقابلُه `apps/web/src/api/contracts.ts#ClaimStatus`. */
export const CLAIM_STATUS_VALUES = ['OPEN', 'PAID', 'WAIVED'] as const;
export type ClaimStatus = (typeof CLAIM_STATUS_VALUES)[number];

/** `prisma:AccountStatus` — ويقابلُه `apps/web/src/api/companies.ts#CompanyStatus`. */
export const COMPANY_STATUS_VALUES = ['ACTIVE', 'FROZEN', 'STOPPED', 'CLOSED'] as const;
export type CompanyStatus = (typeof COMPANY_STATUS_VALUES)[number];

/** `const:apps/api/src/company-users/dto/update-company-user.dto.ts#STATUSES` — ويقابلُه `apps/web/src/api/companyUsers.ts#CompanyUserSettableStatus`. */
export const COMPANY_USER_SETTABLE_STATUS_VALUES = ['ACTIVE', 'FROZEN', 'STOPPED'] as const;
export type CompanyUserSettableStatus = (typeof COMPANY_USER_SETTABLE_STATUS_VALUES)[number];

/** `prisma:AccountStatus` — ويقابلُه `apps/web/src/api/companyUsers.ts#CompanyUserStatus`. */
export const COMPANY_USER_STATUS_VALUES = ['ACTIVE', 'FROZEN', 'STOPPED', 'CLOSED'] as const;
export type CompanyUserStatus = (typeof COMPANY_USER_STATUS_VALUES)[number];

/** `const:apps/api/src/customers/marketing-consent.util.ts#CONSENT_SOURCES` — ويقابلُه `apps/web/src/api/customers.ts#ConsentSource`. */
export const CONSENT_SOURCE_VALUES = ['IN_PERSON', 'PHONE', 'WEB_FORM', 'WRITTEN', 'IMPORTED'] as const;
export type ConsentSource = (typeof CONSENT_SOURCE_VALUES)[number];

/** `prisma:ContractClassification` — ويقابلُه `apps/web/src/api/contracts.ts#ContractClassification`. */
export const CONTRACT_CLASSIFICATION_VALUES = ['RESIDENTIAL', 'COMMERCIAL', 'LEGACY_UNCLASSIFIED', 'SERVICED_LODGING', 'MIXED'] as const;
export type ContractClassification = (typeof CONTRACT_CLASSIFICATION_VALUES)[number];

/** `const:apps/api/src/contracts/dto/create-contract.dto.ts#CONTRACT_CYCLES` — ويقابلُه `apps/web/src/api/contracts.ts#ContractCycle`. */
export const CONTRACT_CYCLE_VALUES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export type ContractCycle = (typeof CONTRACT_CYCLE_VALUES)[number];

/** `prisma:ContractLessor` — ويقابلُه `apps/web/src/api/contracts.ts#ContractLessor`. */
export const CONTRACT_LESSOR_VALUES = ['COMPANY', 'OWNER', 'LEGACY_UNDECLARED'] as const;
export type ContractLessor = (typeof CONTRACT_LESSOR_VALUES)[number];

/** `prisma:ContractStatus` — ويقابلُه `apps/web/src/api/contracts.ts#ContractStatus`. */
export const CONTRACT_STATUS_VALUES = ['DRAFT', 'UPCOMING', 'DUE', 'LATE', 'CANCELLED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUS_VALUES)[number];

/** `prisma:ContractVatInclusion` — ويقابلُه `apps/web/src/api/contracts.ts#ContractVatInclusion`. */
export const CONTRACT_VAT_INCLUSION_VALUES = ['INCLUSIVE', 'EXCLUSIVE', 'LEGACY_UNDECLARED'] as const;
export type ContractVatInclusion = (typeof CONTRACT_VAT_INCLUSION_VALUES)[number];

/** `prisma:CustomerKind` — ويقابلُه `apps/web/src/api/customers.ts#CustomerKind`. */
export const CUSTOMER_KIND_VALUES = ['NATURAL', 'ESTABLISHMENT', 'LEGAL_PERSON', 'LEGACY_UNDECLARED'] as const;
export type CustomerKind = (typeof CUSTOMER_KIND_VALUES)[number];

/** `const:apps/api/src/common/vat/line-tax.util.ts#DECLARABLE_TAX_CATEGORIES` — ويقابلُه `apps/web/src/lib/vat.ts#DeclarableTaxCategory`. */
export const DECLARABLE_TAX_CATEGORY_VALUES = ['S', 'Z', 'E', 'O'] as const;
export type DeclarableTaxCategory = (typeof DECLARABLE_TAX_CATEGORY_VALUES)[number];

/** `const:apps/api/src/contracts/dto/create-contract.dto.ts#CONTRACT_CLASSIFICATIONS` — ويقابلُه `apps/web/src/api/contracts.ts#DeclaredClassification`. */
export const DECLARED_CLASSIFICATION_VALUES = ['RESIDENTIAL', 'COMMERCIAL', 'SERVICED_LODGING', 'MIXED'] as const;
export type DeclaredClassification = (typeof DECLARED_CLASSIFICATION_VALUES)[number];

/** `const:apps/api/src/contracts/dto/create-contract.dto.ts#CONTRACT_VAT_INCLUSIONS` — ويقابلُه `apps/web/src/api/contracts.ts#DeclaredVatInclusion`. */
export const DECLARED_VAT_INCLUSION_VALUES = ['INCLUSIVE', 'EXCLUSIVE'] as const;
export type DeclaredVatInclusion = (typeof DECLARED_VAT_INCLUSION_VALUES)[number];

/** `prisma:DeductionKind` — ويقابلُه `apps/web/src/api/contracts.ts#DeductionKind`. */
export const DEDUCTION_KIND_VALUES = ['UNPAID_RENT', 'DAMAGE', 'UTILITIES', 'CLEANING', 'OTHER'] as const;
export type DeductionKind = (typeof DEDUCTION_KIND_VALUES)[number];

/** `prisma:DeletionRequestStatus` — ويقابلُه `apps/web/src/api/deletionRequests.ts#DeletionRequestStatus`. */
export const DELETION_REQUEST_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUS_VALUES)[number];

/** `prisma:DepositHolder` — ويقابلُه `apps/web/src/api/contracts.ts#DepositHolder`. */
export const DEPOSIT_HOLDER_VALUES = ['COMPANY', 'EJAR'] as const;
export type DepositHolder = (typeof DEPOSIT_HOLDER_VALUES)[number];

/** `prisma:DepositStatus` — ويقابلُه `apps/web/src/api/contracts.ts#DepositStatus`. */
export const DEPOSIT_STATUS_VALUES = ['HELD', 'SETTLED'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUS_VALUES)[number];

/** `prisma:DepositType` — ويقابلُه `apps/web/src/api/contracts.ts#DepositType`. */
export const DEPOSIT_TYPE_VALUES = ['RENT', 'FACILITY'] as const;
export type DepositType = (typeof DEPOSIT_TYPE_VALUES)[number];

/** `type:apps/api/src/quotes/quotes.service.ts#DerivedQuoteStatus` — ويقابلُه `apps/web/src/api/quotes.ts#DerivedQuoteStatus`. */
export const DERIVED_QUOTE_STATUS_VALUES = ['DRAFT', 'SENT', 'CONVERTED', 'EXPIRED'] as const;
export type DerivedQuoteStatus = (typeof DERIVED_QUOTE_STATUS_VALUES)[number];

/** `prisma:EmployeeStatus` — ويقابلُه `apps/web/src/api/employees.ts#EmployeeStatus`. */
export const EMPLOYEE_STATUS_VALUES = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUS_VALUES)[number];

/** `type:apps/api/src/delegations/extinguished.ts#ExtinctionReason` — ويقابلُه `apps/web/src/auth/PermissionsContext.tsx#ExtinctionReason`. */
export const EXTINCTION_REASON_VALUES = ['NOT_IN_ROOT', 'REVOKED', 'NARROWED'] as const;
export type ExtinctionReason = (typeof EXTINCTION_REASON_VALUES)[number];

/** `prisma:FiscalPeriodStatus` — ويقابلُه `apps/web/src/api/fiscal.ts#FiscalPeriodStatus`. */
export const FISCAL_PERIOD_STATUS_VALUES = ['OPEN', 'CLOSED'] as const;
export type FiscalPeriodStatus = (typeof FISCAL_PERIOD_STATUS_VALUES)[number];

/** `const:apps/api/src/contracts/dto/create-contract.dto.ts#FURNISHED_OPTIONS` — ويقابلُه `apps/web/src/api/contracts.ts#Furnished`. */
export const FURNISHED_VALUES = ['unfurnished', 'furnished', 'partial'] as const;
export type Furnished = (typeof FURNISHED_VALUES)[number];

/** `prisma:HandoverStatus` — ويقابلُه `apps/web/src/api/contracts.ts#HandoverStatus`. */
export const HANDOVER_STATUS_VALUES = ['DRAFT', 'SIGNED'] as const;
export type HandoverStatus = (typeof HANDOVER_STATUS_VALUES)[number];

/** `prisma:HandoverType` — ويقابلُه `apps/web/src/api/contracts.ts#HandoverType`. */
export const HANDOVER_TYPE_VALUES = ['DELIVERY', 'RECEIPT'] as const;
export type HandoverType = (typeof HANDOVER_TYPE_VALUES)[number];

/** `prisma:InstallmentStatus` — ويقابلُه `apps/web/src/api/contracts.ts#InstallmentStatus`. */
export const INSTALLMENT_STATUS_VALUES = ['DUE', 'LATE', 'PARTIAL', 'PAID', 'CANCELLED'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUS_VALUES)[number];

/** `prisma:IntegrationKind` — ويقابلُه `apps/web/src/api/integrations.ts#IntegrationKind`. */
export const INTEGRATION_KIND_VALUES = ['PAYMENT_GATEWAY', 'BNPL', 'ECOMMERCE'] as const;
export type IntegrationKind = (typeof INTEGRATION_KIND_VALUES)[number];

/** `prisma:InvoiceDocType` — ويقابلُه `apps/web/src/api/invoices.ts#InvoiceDocType`. */
export const INVOICE_DOC_TYPE_VALUES = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PREPAYMENT'] as const;
export type InvoiceDocType = (typeof INVOICE_DOC_TYPE_VALUES)[number];

/** `prisma:InvoiceStatus` — ويقابلُه `apps/web/src/api/invoices.ts#InvoiceStatus`. */
export const INVOICE_STATUS_VALUES = ['DUE', 'PARTIAL', 'PAID', 'OVERDUE'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS_VALUES)[number];

/** `prisma:ItemCondition` — ويقابلُه `apps/web/src/api/contracts.ts#ItemCondition`. */
export const ITEM_CONDITION_VALUES = ['GOOD', 'FAIR', 'DAMAGED', 'MISSING'] as const;
export type ItemCondition = (typeof ITEM_CONDITION_VALUES)[number];

/** `prisma:KeyMoneyDirection` — ويقابلُه `apps/web/src/api/contracts.ts#KeyMoneyDirection`. */
export const KEY_MONEY_DIRECTION_VALUES = ['RECEIVED', 'PAID'] as const;
export type KeyMoneyDirection = (typeof KEY_MONEY_DIRECTION_VALUES)[number];

/** `prisma:LeaveRequestStatus` — ويقابلُه `apps/web/src/api/leaves.ts#LeaveStatus`. */
export const LEAVE_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUS_VALUES)[number];

/** `prisma:MaintenancePriority` — ويقابلُه `apps/web/src/api/maintenance.ts#MaintenancePriority`. */
export const MAINTENANCE_PRIORITY_VALUES = ['URGENT', 'HIGH', 'NORMAL'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITY_VALUES)[number];

/** `prisma:MaintenanceStatus` — ويقابلُه `apps/web/src/api/maintenance.ts#MaintenanceStatus`. */
export const MAINTENANCE_STATUS_VALUES = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS_VALUES)[number];

/** `const:apps/api/src/customers/marketing-consent.util.ts#MARKETING_CHANNELS` — ويقابلُه `apps/web/src/api/customers.ts#MarketingChannel`. */
export const MARKETING_CHANNEL_VALUES = ['SMS', 'EMAIL', 'WHATSAPP'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNEL_VALUES)[number];

/** `prisma:NetworkSettlementStatus` — ويقابلُه `apps/web/src/api/banks.ts#NetworkSettlementStatus`. */
export const NETWORK_SETTLEMENT_STATUS_VALUES = ['POSTED', 'VOID'] as const;
export type NetworkSettlementStatus = (typeof NETWORK_SETTLEMENT_STATUS_VALUES)[number];

/** `const:apps/api/src/customers/dto/create-customer.dto.ts#CUSTOMER_KINDS` — ويقابلُه `apps/web/src/api/customers.ts#NewCustomerKind`. */
export const NEW_CUSTOMER_KIND_VALUES = ['NATURAL', 'ESTABLISHMENT', 'LEGAL_PERSON'] as const;
export type NewCustomerKind = (typeof NEW_CUSTOMER_KIND_VALUES)[number];

/** `const:apps/api/src/properties/dto/create-property.dto.ts#OWNERSHIP_TYPES` — ويقابلُه `apps/web/src/api/properties.ts#Ownership`. */
export const OWNERSHIP_VALUES = ['owned', 'leased', 'managed'] as const;
export type Ownership = (typeof OWNERSHIP_VALUES)[number];

/** `prisma:PaymentMethod` — ويقابلُه `apps/web/src/api/payments.ts#PaymentMethod`. */
export const PAYMENT_METHOD_VALUES = ['CASH', 'BANK', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

/** `prisma:PlatformDecisionAction` — ويقابلُه `apps/web/src/api/platformDecisions.ts#PlatformDecisionAction`. */
export const PLATFORM_DECISION_ACTION_VALUES = ['ACCOUNT_ERASURE', 'SUBSCRIPTION_CHANGE', 'REFUND'] as const;
export type PlatformDecisionAction = (typeof PLATFORM_DECISION_ACTION_VALUES)[number];

/** `prisma:PlatformDecisionStatus` — ويقابلُه `apps/web/src/api/platformDecisions.ts#PlatformDecisionStatus`. */
export const PLATFORM_DECISION_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] as const;
export type PlatformDecisionStatus = (typeof PLATFORM_DECISION_STATUS_VALUES)[number];

/** `prisma:PlatformRole` — ويقابلُه `apps/web/src/api/client.ts#PlatformRole`. */
export const PLATFORM_ROLE_VALUES = ['OWNER', 'SUPPORT', 'FINANCE', 'OPERATIONS', 'COMPLIANCE'] as const;
export type PlatformRole = (typeof PLATFORM_ROLE_VALUES)[number];

/** `prisma:PosCardVerification` — ويقابلُه `apps/web/src/api/pos.ts#PosCardVerification`. */
export const POS_CARD_VERIFICATION_VALUES = ['PROVIDER_APPROVED', 'DEVICE_REFERENCE', 'MANUAL_EVIDENCE', 'CASHIER_CONFIRMED'] as const;
export type PosCardVerification = (typeof POS_CARD_VERIFICATION_VALUES)[number];

/** `prisma:PosPaymentAttemptStatus` — ويقابلُه `apps/web/src/api/pos.ts#PosPaymentAttemptStatus`. */
export const POS_PAYMENT_ATTEMPT_STATUS_VALUES = ['CREATED', 'CHARGING', 'APPROVED', 'COMPLETED', 'DECLINED', 'UNKNOWN', 'CANCELLED'] as const;
export type PosPaymentAttemptStatus = (typeof POS_PAYMENT_ATTEMPT_STATUS_VALUES)[number];

/** `isIn:apps/api/src/pos/dto/pos.dto.ts#CreatePosSaleDto.paymentMethod` — ويقابلُه `apps/web/src/api/pos.ts#PosPaymentMethod`. */
export const POS_PAYMENT_METHOD_VALUES = ['CASH', 'CARD', 'SPLIT'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHOD_VALUES)[number];

/** `prisma:PosPaymentResolution` — ويقابلُه `apps/web/src/api/pos.ts#PosPaymentResolution`. */
export const POS_PAYMENT_RESOLUTION_VALUES = ['PROVIDER_CHARGE', 'PROVIDER_STATUS', 'MANUAL_EVIDENCE', 'CANCELLED'] as const;
export type PosPaymentResolution = (typeof POS_PAYMENT_RESOLUTION_VALUES)[number];

/** `prisma:PurchaseDocType` — ويقابلُه `apps/web/src/api/purchases.ts#PurchaseDocType`. */
export const PURCHASE_DOC_TYPE_VALUES = ['PURCHASE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE'] as const;
export type PurchaseDocType = (typeof PURCHASE_DOC_TYPE_VALUES)[number];

/** `prisma:PurchaseStatus` — ويقابلُه `apps/web/src/api/purchases.ts#PurchaseStatus`. */
export const PURCHASE_STATUS_VALUES = ['DUE', 'PARTIAL', 'PAID'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUS_VALUES)[number];

/** `prisma:QuoteStatus` — ويقابلُه `apps/web/src/api/quotes.ts#QuoteStatus`. */
export const QUOTE_STATUS_VALUES = ['DRAFT', 'SENT', 'CONVERTED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUS_VALUES)[number];

/** `isIn:apps/api/src/contracts/dto/record-payment.dto.ts#RecordPaymentDto.method` — ويقابلُه `apps/web/src/api/contracts.ts#RecordPaymentMethod`. */
export const RECORD_PAYMENT_METHOD_VALUES = ['CASH', 'BANK'] as const;
export type RecordPaymentMethod = (typeof RECORD_PAYMENT_METHOD_VALUES)[number];

/** `prisma:ReminderChannel` — ويقابلُه `apps/web/src/api/reminders.ts#ReminderChannel`. */
export const REMINDER_CHANNEL_VALUES = ['WHATSAPP', 'SMS', 'CALL', 'EMAIL', 'OTHER'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNEL_VALUES)[number];

/** `prisma:PaymentMethod` — ويقابلُه `apps/web/src/api/contracts.ts#RentPaymentMethod`. */
export const RENT_PAYMENT_METHOD_VALUES = ['CASH', 'BANK', 'CARD'] as const;
export type RentPaymentMethod = (typeof RENT_PAYMENT_METHOD_VALUES)[number];

/** `prisma:ReservationStatus` — ويقابلُه `apps/web/src/api/reservations.ts#ReservationStatus`. */
export const RESERVATION_STATUS_VALUES = ['ACTIVE', 'EXPIRED', 'CONVERTED'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUS_VALUES)[number];

/** `prisma:ScriptAudience` — ويقابلُه `apps/web/src/api/scripts.ts#ScriptAudience`. */
export const SCRIPT_AUDIENCE_VALUES = ['TENANT', 'CUSTOMER', 'EMPLOYEE'] as const;
export type ScriptAudience = (typeof SCRIPT_AUDIENCE_VALUES)[number];

/** `const:apps/api/src/activities/sectors.ts#SECTORS` — ويقابلُه `apps/web/src/api/activities.ts#Sector`. */
export const SECTOR_VALUES = ['REALESTATE', 'RESTAURANT', 'RETAIL', 'PHARMACY', 'CONTRACTING', 'FREELANCE', 'OTHER'] as const;
export type Sector = (typeof SECTOR_VALUES)[number];

/** `const:apps/api/src/contracts/dto/cancel-contract.dto.ts#SETTLEMENT_BASES` — ويقابلُه `apps/web/src/api/contracts.ts#SettlementBasis`. */
export const SETTLEMENT_BASIS_VALUES = ['none', 'amount', 'installments', 'all'] as const;
export type SettlementBasis = (typeof SETTLEMENT_BASIS_VALUES)[number];

/** `prisma:StockMovementType` — ويقابلُه `apps/web/src/api/inventory.ts#StockMovementType`. */
export const STOCK_MOVEMENT_TYPE_VALUES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPE_VALUES)[number];

/** `type:apps/api/src/inventory/inventory.service.ts#StockStatus` — ويقابلُه `apps/web/src/api/inventory.ts#StockStatus`. */
export const STOCK_STATUS_VALUES = ['out', 'low', 'available'] as const;
export type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

/** `isIn:apps/api/src/purchases/dto/supplier-payment.dto.ts#CreateSupplierPaymentDto.method` — ويقابلُه `apps/web/src/api/supplierPayments.ts#SupplierPaymentInputMethod`. */
export const SUPPLIER_PAYMENT_INPUT_METHOD_VALUES = ['CASH', 'BANK'] as const;
export type SupplierPaymentInputMethod = (typeof SUPPLIER_PAYMENT_INPUT_METHOD_VALUES)[number];

/** `prisma:PaymentMethod` — ويقابلُه `apps/web/src/api/supplierPayments.ts#SupplierPaymentMethod`. */
export const SUPPLIER_PAYMENT_METHOD_VALUES = ['CASH', 'BANK', 'CARD'] as const;
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHOD_VALUES)[number];

/** `prisma:SupportGrantStatus` — ويقابلُه `apps/web/src/api/supportAccess.ts#SupportGrantStatus`. */
export const SUPPORT_GRANT_STATUS_VALUES = ['PENDING', 'APPROVED', 'DENIED', 'REVOKED'] as const;
export type SupportGrantStatus = (typeof SUPPORT_GRANT_STATUS_VALUES)[number];

/** `prisma:TaskAssigneeKind` — ويقابلُه `apps/web/src/api/tasks.ts#TaskAssigneeKind`. */
export const TASK_ASSIGNEE_KIND_VALUES = ['OWNER', 'USER'] as const;
export type TaskAssigneeKind = (typeof TASK_ASSIGNEE_KIND_VALUES)[number];

/** `prisma:TaskPriority` — ويقابلُه `apps/web/src/api/tasks.ts#TaskPriority`. */
export const TASK_PRIORITY_VALUES = ['URGENT', 'HIGH', 'NORMAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

/** `const:apps/api/src/tasks/task-model.ts#TASK_STATUSES` — ويقابلُه `apps/web/src/api/tasks.ts#TaskStatus`. */
export const TASK_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

/** `prisma:TaxCategory` — ويقابلُه `apps/web/src/lib/vat.ts#TaxCategory`. */
export const TAX_CATEGORY_VALUES = ['S', 'Z', 'E', 'O', 'LEGACY_STANDARD', 'LEGACY_ZERO'] as const;
export type TaxCategory = (typeof TAX_CATEGORY_VALUES)[number];

/** `isIn:apps/api/src/payments/dto/payment.dto.ts#CreatePaymentDto.unallocated` — ويقابلُه `apps/web/src/api/payments.ts#UnallocatedFate`. */
export const UNALLOCATED_FATE_VALUES = ['PREPAYMENT', 'ON_ACCOUNT'] as const;
export type UnallocatedFate = (typeof UNALLOCATED_FATE_VALUES)[number];

/** `type:apps/api/src/units/units.service.ts#UnitStatus` — ويقابلُه `apps/web/src/api/units.ts#UnitStatus`. */
export const UNIT_STATUS_VALUES = ['vacant', 'rented', 'maintenance', 'reserved', 'upcoming'] as const;
export type UnitStatus = (typeof UNIT_STATUS_VALUES)[number];

/** `type:apps/api/src/common/vat/vat-period.util.ts#VatPeriodType` — ويقابلُه `apps/web/src/api/obligations.ts#VatPeriodType`. */
export const VAT_PERIOD_TYPE_VALUES = ['QUARTERLY', 'MONTHLY'] as const;
export type VatPeriodType = (typeof VAT_PERIOD_TYPE_VALUES)[number];
