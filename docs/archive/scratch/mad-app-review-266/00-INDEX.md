# حزمةُ مراجعة — mad-app

منصّةُ خدمةٍ (SaaS) محاسبيةٌ متعدّدةُ المنشآت: كلُّ منشأةٍ تاجرٌ مستقلّ، وبياناتُها معزولةٌ بطبقتين — امتدادٌ في التطبيق يحقن
المنشأةَ في الاستعلامات، وسياساتُ عزل الصفوف (RLS) في PostgreSQL تحت دورٍ غيرِ متجاوز. الخادم NestJS وPrisma وPostgreSQL،
والواجهة React. والمبالغُ `Decimal`، والقيودُ تُرحَّل آلياً من المستندات، والفاتورةُ تُوقَّع وتُرسل لهيئة الزكاة والضريبة والجمارك.

**اللقطة**: `0e0a022af9198522ce4e11e1c993c181ab57153e` (الفرع الرئيس). الشيفرةُ المصدرية وحدَها — **بلا اختبارات** (موجودةٌ في المستودع لمن يطلبها).

| الملفّ | المجال | الملفّات | الأسطر | الحجم | SHA-256 |
|---|---|---|---|---|---|
| `01-foundation-isolation.txt` | الأساس والعزل بين المنشآت | 36 | 9971 | 608 KB | `ffb98ef9e4b6f2d0…` |
| `02-posting.txt` | الترحيل المحاسبيّ | 39 | 5918 | 320 KB | `7b9e8a9ebd8e36df…` |
| `03-invoicing-zatca.txt` | الفوترة وربطُ هيئة الزكاة والضريبة والجمارك | 42 | 7279 | 416 KB | `50e780c071ab18ae…` |
| `04-inventory.txt` | المخزون | 50 | 6972 | 405 KB | `e6dedb5a2a46738b…` |
| `05-pos.txt` | نقاطُ البيع | 14 | 2787 | 166 KB | `12d2d349f86ad5f6…` |
| `06-contracts.txt` | العقود والعقارات | 38 | 4018 | 192 KB | `3b456fa650af58a7…` |

## ما في كلّ ملفّ

### 01-foundation-isolation.txt — الأساس والعزل بين المنشآت

مخطّطُ القاعدة، وسياقُ المستأجر وامتدادُه وحارسُه، والمصادقة، ونطاقُ الفروع، والترقيمُ الذرّيّ — ومعها سياساتُ العزل (RLS) مستخرجةً من الهجرات.

- `apps/api/prisma/schema.prisma`
- `apps/api/src/common/tenant/allow-while-closed.decorator.ts`
- `apps/api/src/common/tenant/allow-while-consent-pending.decorator.ts`
- `apps/api/src/common/tenant/allow-while-frozen.decorator.ts`
- `apps/api/src/common/tenant/company-status.util.ts`
- `apps/api/src/common/tenant/current-tenant.decorator.ts`
- `apps/api/src/common/tenant/nested-transaction-probe.ts`
- `apps/api/src/common/tenant/owner-only.decorator.ts`
- `apps/api/src/common/tenant/owner-only.guard.ts`
- `apps/api/src/common/tenant/reopen-window.ts`
- `apps/api/src/common/tenant/requires-action.decorator.ts`
- `apps/api/src/common/tenant/requires-screen.decorator.ts`
- `apps/api/src/common/tenant/support-shell.decorator.ts`
- `apps/api/src/common/tenant/tenant-prisma.module.ts`
- `apps/api/src/common/tenant/tenant-prisma.service.ts`
- `apps/api/src/common/tenant/tenant-scope-exceptions.ts`
- `apps/api/src/common/tenant/tenant-scope.extension.ts`
- `apps/api/src/common/tenant/tenant-wide.decorator.ts`
- `apps/api/src/common/tenant/tenant.exceptions.ts`
- `apps/api/src/common/tenant/tenant.guard.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/current-user.decorator.ts`
- `apps/api/src/auth/dto/login.dto.ts`
- `apps/api/src/auth/dto/password-reset.dto.ts`
- `apps/api/src/auth/jwt-auth.guard.ts`
- `apps/api/src/auth/jwt.strategy.ts`
- `apps/api/src/auth/types.ts`
- `apps/api/src/prisma/prisma.module.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/branches/branch-scope.util.ts`
- `apps/api/src/common/document-sequence.util.ts`
- `apps/api/src/templates/screens.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- (قسم) سياساتُ العزل مستخرجةً من الهجرات

### 02-posting.txt — الترحيل المحاسبيّ

الترحيلُ الآليّ للقيود، ودليلُ الحسابات، والسنةُ المالية وقفلُ الفترات، وأدواتُ المال والتدوير.

- `apps/api/src/journal/auto-posting.util.ts`
- `apps/api/src/journal/deferred-revenue-account.util.ts`
- `apps/api/src/journal/dto/create-journal-entry.dto.ts`
- `apps/api/src/journal/dto/journal-line.dto.ts`
- `apps/api/src/journal/dto/list-journal-query.dto.ts`
- `apps/api/src/journal/dto/reverse-journal-entry.dto.ts`
- `apps/api/src/journal/inventory-accounts.util.ts`
- `apps/api/src/journal/inventory-variance-account.util.ts`
- `apps/api/src/journal/journal-posting.util.ts`
- `apps/api/src/journal/journal.controller.ts`
- `apps/api/src/journal/journal.module.ts`
- `apps/api/src/journal/journal.service.ts`
- `apps/api/src/journal/opening-balance.util.ts`
- `apps/api/src/journal/pos-settlement.util.ts`
- `apps/api/src/journal/prepayment-account.util.ts`
- `apps/api/src/journal/provisional-settlement.util.ts`
- `apps/api/src/journal/receipt-clearing-account.util.ts`
- `apps/api/src/journal/rent-accrual.util.ts`
- `apps/api/src/journal/rent-recognition.util.ts`
- `apps/api/src/journal/rent-tax-point.util.ts`
- `apps/api/src/journal/stock-opening-posting.util.ts`
- `apps/api/src/journal/writeoff-account.util.ts`
- `apps/api/src/accounts/accounts.controller.ts`
- `apps/api/src/accounts/accounts.module.ts`
- `apps/api/src/accounts/accounts.service.ts`
- `apps/api/src/accounts/code-bands.ts`
- `apps/api/src/accounts/default-chart.ts`
- `apps/api/src/accounts/dto/create-account.dto.ts`
- `apps/api/src/accounts/dto/update-account.dto.ts`
- `apps/api/src/fiscal/dto/create-fiscal-year.dto.ts`
- `apps/api/src/fiscal/fiscal.controller.ts`
- `apps/api/src/fiscal/fiscal.module.ts`
- `apps/api/src/fiscal/fiscal.service.ts`
- `apps/api/src/fiscal/period-lock.util.ts`
- `apps/api/src/fiscal/year-closing.util.ts`
- `apps/api/src/common/money/allocation.ts`
- `apps/api/src/common/money/rounding.ts`
- `apps/api/src/common/money/text.ts`
- `apps/api/src/common/money/totals.ts`

### 03-invoicing-zatca.txt — الفوترة وربطُ هيئة الزكاة والضريبة والجمارك

الفواتيرُ والإشعارات، وعروضُ الأسعار، وسنداتُ القبض، والطابورُ الصادر، وتوليدُ المستند الموقَّع وسلسلتُه وإرسالُه للهيئة.

- `apps/api/src/invoices/active-documents.util.ts`
- `apps/api/src/invoices/credit-context.ts`
- `apps/api/src/invoices/credit-limit.util.ts`
- `apps/api/src/invoices/dto/create-credit-note.dto.ts`
- `apps/api/src/invoices/dto/create-debit-note.dto.ts`
- `apps/api/src/invoices/dto/create-invoice.dto.ts`
- `apps/api/src/invoices/dto/invoice-line.dto.ts`
- `apps/api/src/invoices/dto/issue-replacement.dto.ts`
- `apps/api/src/invoices/dto/update-invoice.dto.ts`
- `apps/api/src/invoices/invoices.controller.ts`
- `apps/api/src/invoices/invoices.module.ts`
- `apps/api/src/invoices/invoices.service.ts`
- `apps/api/src/invoices/note-deadline.util.ts`
- `apps/api/src/invoices/sale-fulfilment.util.ts`
- `apps/api/src/quotes/dto/convert-quote.dto.ts`
- `apps/api/src/quotes/dto/quote.dto.ts`
- `apps/api/src/quotes/quote-expiry.util.ts`
- `apps/api/src/quotes/quotes.controller.ts`
- `apps/api/src/quotes/quotes.module.ts`
- `apps/api/src/quotes/quotes.service.ts`
- `apps/api/src/payments/dto/list-payments-query.dto.ts`
- `apps/api/src/payments/dto/payment.dto.ts`
- `apps/api/src/payments/payments.controller.ts`
- `apps/api/src/payments/payments.module.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/outbox/outbox.module.ts`
- `apps/api/src/outbox/outbox.service.ts`
- `apps/api/src/zatca/authority-warnings.util.ts`
- `apps/api/src/zatca/certificate-expiry.service.ts`
- `apps/api/src/zatca/certificate-expiry.util.ts`
- `apps/api/src/zatca/csr.util.ts`
- `apps/api/src/zatca/dto/onboarding.dto.ts`
- `apps/api/src/zatca/egs-unit.util.ts`
- `apps/api/src/zatca/hash-chain.util.ts`
- `apps/api/src/zatca/qr.util.ts`
- `apps/api/src/zatca/ubl/canonicalize.util.ts`
- `apps/api/src/zatca/ubl/invoice-xml.util.ts`
- `apps/api/src/zatca/ubl/xades.util.ts`
- `apps/api/src/zatca/zatca-onboarding.service.ts`
- `apps/api/src/zatca/zatca.controller.ts`
- `apps/api/src/zatca/zatca.module.ts`
- `apps/api/src/zatca/zatca.service.ts`

### 04-inventory.txt — المخزون

الحركاتُ وطبقاتُ التكلفة (FIFO) والاستهلاكُ المؤقّت، والمشترياتُ والاستلام، والمستودعاتُ والأصناف.

- `apps/api/src/inventory/costing.util.ts`
- `apps/api/src/inventory/dto/create-stock-movement.dto.ts`
- `apps/api/src/inventory/dto/create-write-off.dto.ts`
- `apps/api/src/inventory/dto/declare-stock-opening.dto.ts`
- `apps/api/src/inventory/dto/list-movements-query.dto.ts`
- `apps/api/src/inventory/dto/list-write-offs-query.dto.ts`
- `apps/api/src/inventory/dto/reject-write-off.dto.ts`
- `apps/api/src/inventory/inventory-distribution.util.ts`
- `apps/api/src/inventory/inventory-ledger-reconciliation.util.ts`
- `apps/api/src/inventory/inventory.controller.ts`
- `apps/api/src/inventory/inventory.module.ts`
- `apps/api/src/inventory/inventory.service.ts`
- `apps/api/src/inventory/stock-openings.service.ts`
- `apps/api/src/inventory/stock-quantity.util.ts`
- `apps/api/src/inventory/write-off-attachments.service.ts`
- `apps/api/src/inventory/write-offs.service.ts`
- `apps/api/src/purchases/dto/create-goods-receipt.dto.ts`
- `apps/api/src/purchases/dto/create-landed-cost.dto.ts`
- `apps/api/src/purchases/dto/create-purchase.dto.ts`
- `apps/api/src/purchases/dto/create-supplier-note.dto.ts`
- `apps/api/src/purchases/dto/list-supplier-payments-query.dto.ts`
- `apps/api/src/purchases/dto/purchase-line.dto.ts`
- `apps/api/src/purchases/dto/supplier-payment.dto.ts`
- `apps/api/src/purchases/dto/update-purchase.dto.ts`
- `apps/api/src/purchases/goods-receipts.service.ts`
- `apps/api/src/purchases/landed-costs.service.ts`
- `apps/api/src/purchases/layer-cost-allocation.util.ts`
- `apps/api/src/purchases/layer-cost-spread.util.ts`
- `apps/api/src/purchases/non-deductible-vat.util.ts`
- `apps/api/src/purchases/purchase-attachments.service.ts`
- `apps/api/src/purchases/purchase-receipt-reversal.util.ts`
- `apps/api/src/purchases/purchase-receipt.util.ts`
- `apps/api/src/purchases/purchase-return.util.ts`
- `apps/api/src/purchases/purchase-settlement.util.ts`
- `apps/api/src/purchases/purchases.controller.ts`
- `apps/api/src/purchases/purchases.module.ts`
- `apps/api/src/purchases/purchases.service.ts`
- `apps/api/src/purchases/supplier-notes.service.ts`
- `apps/api/src/purchases/supplier-payments.controller.ts`
- `apps/api/src/purchases/supplier-payments.service.ts`
- `apps/api/src/warehouses/dto/create-warehouse.dto.ts`
- `apps/api/src/warehouses/dto/update-warehouse.dto.ts`
- `apps/api/src/warehouses/warehouses.controller.ts`
- `apps/api/src/warehouses/warehouses.module.ts`
- `apps/api/src/warehouses/warehouses.service.ts`
- `apps/api/src/products/dto/create-product.dto.ts`
- `apps/api/src/products/dto/update-product.dto.ts`
- `apps/api/src/products/products.controller.ts`
- `apps/api/src/products/products.module.ts`
- `apps/api/src/products/products.service.ts`

### 05-pos.txt — نقاطُ البيع

الكاشير: المناوبات، والبيعُ وخصمُ المخزون، ومحاولاتُ الدفع بالبطاقة، والأدراج.

- `apps/api/src/pos/dto/pos-responses.dto.ts`
- `apps/api/src/pos/dto/pos.dto.ts`
- `apps/api/src/pos/dto/zatca-receipt-response.dto.ts`
- `apps/api/src/pos/pos-card-verifications.service.ts`
- `apps/api/src/pos/pos-payment-attempts.service.ts`
- `apps/api/src/pos/pos.controller.ts`
- `apps/api/src/pos/pos.module.ts`
- `apps/api/src/pos/pos.service.ts`
- `apps/api/src/cash-drawers/cash-drawers.controller.ts`
- `apps/api/src/cash-drawers/cash-drawers.module.ts`
- `apps/api/src/cash-drawers/cash-drawers.service.ts`
- `apps/api/src/cash-drawers/dto/create-cash-drawer.dto.ts`
- `apps/api/src/cash-drawers/dto/transfer-cash-drawer.dto.ts`
- `apps/api/src/cash-drawers/dto/update-cash-drawer.dto.ts`

### 06-contracts.txt — العقود والعقارات

عقودُ الإيجار وأقساطُها واستحقاقُها والاعتراف، والعقاراتُ والوحدات، والصيانة، والحجوزات.

- `apps/api/src/contracts/claim-attachments.service.ts`
- `apps/api/src/contracts/contract-attachments.service.ts`
- `apps/api/src/contracts/contracts.controller.ts`
- `apps/api/src/contracts/contracts.module.ts`
- `apps/api/src/contracts/contracts.service.ts`
- `apps/api/src/contracts/dto/cancel-contract.dto.ts`
- `apps/api/src/contracts/dto/claim.dto.ts`
- `apps/api/src/contracts/dto/create-contract.dto.ts`
- `apps/api/src/contracts/dto/deposit.dto.ts`
- `apps/api/src/contracts/dto/handover.dto.ts`
- `apps/api/src/contracts/dto/key-money.dto.ts`
- `apps/api/src/contracts/dto/list-contracts-query.dto.ts`
- `apps/api/src/contracts/dto/record-payment.dto.ts`
- `apps/api/src/contracts/dto/renew-contract.dto.ts`
- `apps/api/src/contracts/dto/update-contract.dto.ts`
- `apps/api/src/contracts/handover-photos.service.ts`
- `apps/api/src/contracts/installment-schedule.util.ts`
- `apps/api/src/contracts/rent-accrual.service.ts`
- `apps/api/src/contracts/rent-recognition.service.ts`
- `apps/api/src/properties/dto/create-property.dto.ts`
- `apps/api/src/properties/dto/update-property.dto.ts`
- `apps/api/src/properties/properties.controller.ts`
- `apps/api/src/properties/properties.module.ts`
- `apps/api/src/properties/properties.service.ts`
- `apps/api/src/units/dto/bulk-create-units.dto.ts`
- `apps/api/src/units/dto/create-unit.dto.ts`
- `apps/api/src/units/dto/update-unit.dto.ts`
- `apps/api/src/units/units.controller.ts`
- `apps/api/src/units/units.module.ts`
- `apps/api/src/units/units.service.ts`
- `apps/api/src/maintenance/dto/maintenance.dto.ts`
- `apps/api/src/maintenance/maintenance.controller.ts`
- `apps/api/src/maintenance/maintenance.module.ts`
- `apps/api/src/maintenance/maintenance.service.ts`
- `apps/api/src/reservations/dto/create-reservation.dto.ts`
- `apps/api/src/reservations/reservations.controller.ts`
- `apps/api/src/reservations/reservations.module.ts`
- `apps/api/src/reservations/reservations.service.ts`

## ما استُبعد عمداً

- الاختباراتُ (`*.spec.ts` · `*.e2e-spec.ts`) والتثبيتات، والوثائقُ (`*.md`) كلُّها — ومنها سجلُّ القرارات والخطط والمسوح والتقارير وملفُّ تعليمات المساعد.
- كلُّ ملفٍّ بنوعٍ يحمل أسراراً (`.env*` · مفاتيح · شهادات · مقالب).

## فحصُ الأسرار

أنماطُ خطّاف الالتزام (`$argon2id$` · كتلةُ المفتاح الخاصّ) وأوسع (مفاتيح AWS · رموز GitHub وSlack · مفاتيح دفعٍ حيّة · سرٌّ سداسيٌّ مسنَد)، على الملفّات المصدرية وعلى المكتوب. **النتيجة: لا شيء**.
