# ب — تصميمٌ قبل البناء (④B1 · ④A1 · ⑤A3)

## ④B1 الخصمُ على السطر
- `InvoiceLine.discount Decimal(18,2) @default(0)` (+ `QuoteLine.discount`): مبلغٌ مطلق ≥ 0 و≤ (الكمية × السعر). لا نسبة — النسبةُ تُحسب في الشاشة وتُرسَل مبلغاً (لا افتراضَ تدوير في الخادم).
- `common/money/totals.ts`: `MoneyLine.discount?` — صافي السطر = round2(qty × price − discount)؛ الوعاءُ والضريبةُ من الصافي (قاعدةُ الهيئة: التجميعُ لكل نسبة على الصافي).
- UBL: على السطر `cac:AllowanceCharge` (`ChargeIndicator=false` · `Amount` · `BaseAmount`?) و`LineExtensionAmount` = الصافي؛ وعلى المستند `AllowanceTotalAmount` (BT-107) = مجموع خصوم السطور، `TaxExclusiveAmount` (BT-109) = Σ الصافي.
- POS: `PosSaleLine.discount?` يمرّ إلى سطر الفاتورة.
- الحرّاس: `totals.spec` يُمسّ (حالةٌ بخصمٍ نصفيّ)؛ `invoices` e2e يُمسّ؛ `pos` يُمسّ.
- البحث: BR-KSA-? (AllowanceCharge على السطر: BR-KSA-DEC-?, «Invoice line allowance amount (BT-136)» و«Invoice line net amount (BT-131) = (BT-146 × BT-149/BT-150) − BT-136 + BT-141»). يُقرأ من zatca-xml-standard.txt قبل البناء.

## ④A1 الدفعةُ المقدَّمة بمستندٍ ضريبيّ
- `InvoiceDocType.PREPAYMENT` — نوعُ المستند لدى الهيئة **386** (BT-3 · KSA-30: «Prepayment Document Type Code must be 386»).
- يصدر من سند القبض غير المخصَّص (`Payment` بلا `allocations` أو بمتبقٍّ): سطرٌ خدميّ «دفعةٌ مقدَّمة» بمبلغ القبض شاملاً الضريبة (`15/115`) وضريبته؛ القيد: مدين النقد (كما سند القبض) · دائن `2450 دفعاتٌ مقدَّمة من العملاء` · دائن `2200`.
- عند فاتورة التوريد: يُخصم المقدَّم (`PrepaidAmount` BT-113 = Σ (KSA-31 + KSA-32))، وسطورٌ إضافية بمرجع المستند 386 (KSA-26..34) — البناءُ في ⑤A3.
- القبضُ على الحساب (بلا تخصيص وبلا مستند) يُرفض إلا لعميلٍ اعتباريٍّ يُفوتَر بالأجل (تصريحٌ صريح على البطاقة `billedOnAccount`?) — قرارُ تصميم: كيف يُعلَن؟ حقلٌ على العميل.
- الهجرة: القبضُ القائم غيرُ المخصَّص يُعدّ ويُصرخ به ولا يُصحَّح.

## ⑤A3 أعلامُ المعاملة والدفعةُ المقدَّمة والخصم في المستند
- `InvoiceTypeCode/@name` (KSA-2) بسبعة أرقام `NNPNESB`: 01/02 ثم P (طرفٌ ثالث) N (اعتباريّ/nominal) E (تصدير) S (ملخَّص) B (ذاتية) — تُشتقّ: E من بلد المشتري ≠ SA (ومن الصادرات)؛ الباقي 0 حتى يُبنى.
- `AllowanceCharge` من خصم السطر؛ `PrepaymentInvoice` بحقوله؛ العيّناتُ الستُّ موسَّعةً في `runComplianceChecks`.
