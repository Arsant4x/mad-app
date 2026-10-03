# قياسُ فرقِ الصرف المحقَّق — المساراتُ التي لا يصل فيها الفرقُ حساباً (ق-١٤٨٩)

> **نصُّ القرار**: «فرقُ الصرف المحقَّق لا يصل حساباً في بعض المسارات — قيدٌ ناقص. قِس المساراتِ والقائم».
>
> **المصدر المقروء**: `D:\mad-app` على `main` عند `56ae0157` (من `git log --oneline -1` في هذا التشغيل)، والشجرةُ نظيفة.
> **قراءةٌ فقط**: لم يُعدَّل ملفٌّ في المستودع، ولم يُشغَّل `jest` ولا `vitest` ولا `playwright` ولا `tsc` ولا `prisma`، **ولم يُشغَّل
> أيُّ استعلام SQL** — الاستعلاماتُ في (٥) مكتوبةٌ ليشغّلها القائد لاحقاً.
> **صفحاتُ الويب**: لم تُقرأ أيُّ صفحةٍ رسمية في هذا القياس — القياسُ على الشيفرة وحدَها. ونصُّ المعيار المحاسبيّ (IAS 21 / IFRIC 22)
> **لم يُقرأ**؛ فكلُّ حكمٍ أدناه على «الصواب المحاسبيّ» مبنيٌّ على قاعدة المشروع المكتوبة (`CLAUDE.md §6.7`: «فروق العملة تُقيَّد في
> حساب ربح/خسارة فروق العملة عند اختلاف السعر بين تاريخ الفاتورة وتاريخ السداد») وعلى تعليقات الشيفرة نفسِها، لا على نصّ المعيار.
> **تاريخ القياس**: 2026-09-27.
> **أمسّ افتراضاً سعودياً؟ لا** (`§3.8`): الأمثلةُ بالريال والدولار توضيحٌ فقط. ومرصودٌ عرضاً افتراضٌ حرفيّ خارج الموضوع:
> `maintenance/maintenance.service.ts:166` (`dto.exchangeRate ?? 1`) و`:187` (`dto.currency?.trim() || 'SAR'`).

---

## ٠) الخلاصة

**نقطةُ البدء** كانت `D:\mad-app-scratch\review-266\claims\claim-g.md` (ومراجعتُه العدائية ع-١…ع-٦). قُرئت كلُّ ملفات المجلد التي تذكر
الصرف/`5600`: `claim-g.md` (٨٣ موضعاً) و`claim-b.md` (٥ — عن غياب الحساب) و`claim-c.md` (١ — حقول العملة على التقبيل)، والبقيّة صفر.

**الآليةُ الوحيدة التي تُرحّل الفرق** بانيان اثنان:
`postRentPaymentEntry` (`apps/api/src/journal/auto-posting.util.ts:959-1008`، الفرقُ `:971` والسطرُ `:989-994`) و`postPartySettlementEntry`
(`:1278-1309`، الفرقُ `:1286` والسطرُ `:1296`). **وكلُّ مسارٍ لا يمرّ بأحدهما، أو يمرّ به بمبلغين محسوبين بالسعر نفسِه، لا يرى فرقاً.**

**ولا يمكن أن يخرج قيدٌ غيرُ متوازن**: `createJournalEntry` يرفض أيَّ فرقٍ بين المدين والدائن يتجاوز `0.001`
(`apps/api/src/journal/journal-posting.util.ts:199-203`). فالصنف (ج) في هذا القياس معناه **دائماً**: الفرقُ **يبقى رصيداً يتيماً في حساب
الذمّة (`1200`/`2100`)** أو **يُطوى في سطرٍ آخر** — لا قيدٌ مختلّ.

| # | المسار | الحكم | أين يذهب الفرق |
|---|---|---|---|
| A1 | إنشاءُ سند قبضٍ مخصَّص | **(أ)** | `5600` |
| A2 | عكسُ سند قبضٍ لم يُعَد توزيعُه | **(أ)** مرآة | `5600` يعود |
| A3 | إنشاءُ سند صرفٍ مخصَّص | **(أ)** | `5600` |
| A4 | عكسُ سند صرفٍ لم يُعَد توزيعُه ولم يُعدَّل شراؤه | **(أ)** مرآة | `5600` يعود |
| A5 | قبضُ إيجارٍ بعملة العقد — المسارُ القائم (أساس القبض) | **(أ)** | `5600` |
| A6 | قبضُ إيجارٍ بعملة العقد — مسارُ الاستحقاق | **(أ)** | `5600` |
| **B1** | **إعادةُ توزيع سند قبض** (`POST /payments/:id/allocate`) — ومنه «على الحساب» ثم التوزيع | **(ج)** | يبقى في **`1200`**، ثم **فرقٌ شبحيّ على `5600`** عند العكس |
| **B2** | **إعادةُ توزيع سند صرف** (`POST /supplier-payments/:id/allocate`) | **(ج)** | يبقى في **`2100`**، ثم شبحٌ عند العكس |
| **B3** | **تعديلُ سعر/عملة فاتورة شراءٍ مسدَّدة** (`PATCH /purchases/:id`) | **(ج)** | يبقى في **`2100`**، ثم شبحٌ عند العكس |
| **B4** | **تطبيقُ دفعةٍ مقدَّمة (386) على فاتورة توريدٍ بسعرٍ آخر** — **وبعملةٍ أخرى بلا رفض** | **(ج)** | يبقى في **`1200`** |
| **B5** | **قبضُ إيجارٍ بعملةٍ غير عملة العقد** | **(ب)** و**(ج)** | القائم: يُطوى في **`4200`/`2400`**؛ الاستحقاق: الزيادةُ **إيرادٌ `4200` + ضريبةُ مخرجات `2200`**، والنقصُ يبقى في **`1200`** والقسطُ **مسدَّدٌ** |
| **B6** | **سندُ ردٍّ لمرتجع** (`POST /payments/refund`) | **(ب)** | يُطوى في قيمة **حساب النقد/البنك**؛ و`exchangeRate` في الطلب **يُقبل ويُهمَل** |
| **B7** | **تحصيلُ مطالبة إيجار** | **(ب)** | يُطوى في **`1000`** |
| **B8** | **تسويةُ وديعة** | **(ب)** + **(ج)** | الردُّ يُطوى في **`1000`**؛ والخصمُ على الذمّة بسعر الوديعة يبقى في **`1200`** إن خالف سعرَ العقد |
| **B9** | **ردُّ المقبوض غير المكتسَب عند إلغاء العقد** | **(ب)** | يُطوى في **`1000`** |
| B10 | تسويةُ الشبكة لمقبوضٍ أجنبيّ بالشبكة | **(ب)** — فرضيةٌ بالقراءة | الصافي يُحسب ولا يُدخَل، فالفرقُ لا مدخلَ له |
| D1–D10 | الكاشير · الإشعاران الدائن والمدين (عميلٌ ومورّد) · بديلُ المردودة · تعديلُ سعر فاتورة المبيعات · إلغاءُ شراءٍ مسدَّد · نقلُ صندوقٍ أجنبيّ · تسويةُ شبكةٍ على بنكٍ أجنبيّ · التخصيصُ بعملةٍ أخرى · إعدامُ ذمّة · عكسُ الاستحقاق وخصمُه وإلغاؤه | **(د)** | لا فرقَ ممكنٌ بالبناء (أو المسارُ مرفوضٌ/غيرُ موجود) — التفصيل في (٢) |
| E1–E4 | رصيدُ بنكٍ أجنبيّ الافتتاحيّ · ترحيلُ سطر كشفٍ لبنكٍ أجنبيّ · سعرُ القبض الافتراضيّ على عقدٍ بعملةٍ أخرى · مرآةُ البنك | **(هـ)** بلا تحويلٍ أصلاً | ليست «فرقاً محقَّقاً» بل **مبلغاً بوحدةٍ خاطئة** — خارجُ الحدّ الضيّق، مرصودةٌ في (٨) |

**وما تغيّر منذ `claim-g`**: ع-١/هـ هناك («غيابُ `5600` يُسقط القيدَ كلَّه») **سُدِّد على `main`** بـ`ق-١٤٦٦` (`b96a55e8`):
`resolveAccountIds` صار يرمي `409` مسمّىً بدل إعادة `null` (`auto-posting.util.ts:28-34`، والصنف `MissingPostingAccountsError` `:37-45`)،
و`5600` في `needCodes` متى وُجد فرق (`:978` و`:1289`) — فالمعاملةُ كلُّها تسقط ولا يُحفظ سندٌ بلا قيد.

**ولماذا لم يظهر شيءٌ من هذا في الواجهة**: لا صفحةَ ويب ترسل `exchangeRate` أصلاً (المسبار: Grep `exchangeRate` على `apps/web/src/pages` ⟵
**صفر ملفات**؛ ضابطُه: النمطُ نفسُه على `apps/web/src` ⟵ ملفّان `api/payments.ts` و`api/supplierPayments.ts`). **فكلُّ المسارات المكسورة
تُبلغ اليوم عبر الـAPI وحدَه** — والقائمُ منها في أيّ قاعدة مصدرُه الاختباراتُ والبذورُ والطلباتُ المباشرة، ويُعدّ بـ(٥).

---

## ١) أين تُحسب المبالغ الأساسية — المشترك

| الموضع | ما يفعله |
|---|---|
| `common/currency/base-amount.util.ts:21-23` | `toBaseAmount(amount, rate) = round2(amount × rate)` — والسعرُ **من المستدعي** دائماً |
| `common/currency/currency-fields.dto.ts` (`CurrencyFieldsDto`) | تعليقُه: «The rate is deliberately taken from the caller rather than looked up here» — **ولا مسارَ تسويةٍ يقرأ جدولَ الأسعار**: Grep `CurrenciesService\|currencies.service` خارج `currencies/` ⟵ **صفر**؛ ضابطُه: Grep `CurrenciesService` على `src` ⟵ ٣ ملفات كلُّها داخل `currencies/` |
| `common/settlement/settlement.util.ts:193-203` (`baseSettledOf`) | الذمّةُ المسوّاة = **كلُّ تخصيصٍ بسعر مستنده** + **غيرُ المخصَّص بسعر السند** |
| `common/settlement/settlement.util.ts:145-186` (`lockAndAssertAllocationsFit`) | يقفل المستند، **يرفض العملةَ المخالفة** (`:171-175`)، ويعيد **خريطةَ أسعار المستندات** (`:183-185`) |
| `journal/auto-posting.util.ts:1278-1309` (`postPartySettlementEntry`) | `fxGain = round2(receivable ? cash − settled : settled − cash)` (`:1286`) ⟵ `signedLine(5600, fxGain, false)` (`:1296`): الموجبُ دائن (ربح)، السالبُ مدين (خسارة) |
| `journal/auto-posting.util.ts:959-1008` (`postRentPaymentEntry`) | `fxDifference = round2(cash − revenue)` (`:971`) ⟵ دائنٌ `5600` إن موجب (`:989-991`)، مدينٌ إن سالب (`:992-994`) |

---

## ٢) المساراتُ واحداً واحداً — بالموضع

### (أ) يُرحَّل الفرقُ على `5600`

- **A1 — إنشاءُ سند قبضٍ مخصَّص**: الأسعارُ من القفل (`payments/payments.service.ts:175-180`)، والذمّةُ `baseSettledOf(...)` (`:235`)، والنقدُ
  `toBaseAmount(p.amount, p.exchangeRate)` (`:706`) ⟵ `postCustomerPaymentEntry` (`:701-715`) ⟵ `postPartySettlementEntry`. مُثبَتٌ باختبار
  `test/payments.e2e-spec.ts:271-293` (فاتورة 3.70 وقبض 3.80 ⟵ `5600` دائن 10).
- **A2 — عكسُ سند القبض** (`:431-512`): النقدُ بسعر الأصل (`:441`، `:498`) والذمّةُ من **تخصيصات الأصل الحالية بأسعار فواتيرها الحالية**
  (`:455-467`). وتعليقُه (`:453-454`) بنصّه: «الذمّة المعكوسة بأسعار فواتيرها هي نفسها التي سُوّيت — فيتطابق القيدان طرفاً بطرف ويعود 5600 إلى
  ما كان». **صحيحٌ ما دامت التخصيصاتُ هي التي رُحِّل عليها الأصل** — وينكسر في B1 (أدناه).
- **A3/A4 — سند الصرف وعكسُه**: `purchases/supplier-payments.service.ts:153-158` · `:190` · `:356` · والعكس `:267-280` · `:305-318`. مُثبَتٌ
  باختبار `test/supplier-payments.e2e-spec.ts:287-297` (شراء 3.70 وسداد 3.80 ⟵ `5600` مدين 10).
- **A5 — إيجارٌ بعملة العقد، المسارُ القائم**: `contracts/contracts.service.ts:485` (`baseExpected` بسعر العقد حين `payCurrency === contract.currency`)
  و`:502` (النقدُ بسعر الدفعة) ⟵ `postRentPaymentEntry`.
- **A6 — إيجارٌ بعملة العقد، مسارُ الاستحقاق**: الاستحقاقُ بسعر العقد (`journal/rent-accrual.util.ts:134-137`) والتسويةُ `postPartySettlementEntry`
  بنقدٍ بسعر الدفعة وذمّةٍ `baseExpected` (`contracts.service.ts:572-581`). مُثبَتٌ باختبار `test/activities-currencies.e2e-spec.ts:355-405`
  (العقدُ فيه `RESIDENTIAL` مصنَّف — فهو مسارُ الاستحقاق).

### (د) لا يمكن أن يُنتج فرقاً — بالبناء أو بالرفض

| # | المسار | لماذا |
|---|---|---|
| D1 | تحصيلُ الكاشير | `pos/pos.service.ts:807-819` يمرّر `exchangeRate: Number(invoice.exchangeRate)` و`date: invoice.issueDate`، و`recordPosReceipt` يحسب الذمّةَ بالسعر نفسِه (`payments.service.ts:352`) |
| D2 | الإشعاران الدائن والمدين للعميل | بسعر الفاتورة الأصلية حرفاً (`invoices/invoices.service.ts:1041-1044` · `:1068-1072`) |
| D2' | إشعارا المورّد | بسعر الشراء الأصليّ (`purchases/supplier-notes.service.ts:126` · `:164-167`)؛ وشراءٌ عليه إشعارٌ **مجمَّدٌ سعرُه** (`purchases.service.ts:265-267`) |
| D3 | بديلُ الفاتورة المردودة | بسعر المردودة (`invoices.service.ts:348` · `:397`)، والتخصيصاتُ تنتقل إليه (`:406-408`) بالسعر نفسِه |
| D4 | تعديلُ سعر فاتورة مبيعاتٍ صادرة | مرفوض: `changesSignedContent` يشمل `currency` و`exchangeRate` (`invoices.service.ts:751-759`) ⟵ `409` (`:768-786`) |
| D5 | إلغاءُ شراءٍ عليه سداد | مرفوض (`purchases/purchases.service.ts:500-501`) |
| D6 | نقلُ صندوقٍ بغير عملة الأساس · تسويةُ شبكةٍ على بنكٍ أجنبيّ | مرفوضان: `banks/banks.service.ts:92-93` · `banks/network-settlements.service.ts:157-160` |
| D7 | تخصيصُ سندٍ على مستندٍ بعملةٍ أخرى (إنشاءً أو إعادةَ توزيع) | مرفوض: `settlement.util.ts:171-175` — **لكنه يُتجاوز بعد التخصيص** في B3 (تعديل العملة) و**لا يُفحص أصلاً** في B4 |
| D8 | إعدامُ ذمّة عميل | **لا مسارَ له**: Grep `-i "baddebt\|bad_debt\|bad debt\|writeOffInvoice\|write-off invoice\|ديون معدومة\|إعدام الدين"` على `src` ⟵ **صفر ملفات**؛ ضابطُه: الأمرُ نفسُه بـ`postWriteOffEntry` ⟵ ٣ ملفات |
| D9 | عكسُ الاستحقاق وخصمُه وإلغاؤه وإسقاطُ ما بعد الإلغاء | كلُّها بسعر العقد كالاستحقاق نفسِه (`rent-accrual.util.ts:134` · `:338`) |
| D10 | الأرصدةُ الافتتاحية للحسابات | الحسابُ بلا عملة: نموذج `Account` (`prisma/schema.prisma:1198-1251`) — المسبار `sed -n 1190,1251p … \| grep -c currency` ⟵ **0**، وضابطُه `grep -c openingBalance` على المدى نفسِه ⟵ **2** (الحقل `:1211`) — فالرصيدُ بالأساس دائماً |

### (ج) الفرقُ يبقى رصيداً يتيماً في حساب الذمّة

**B1 — إعادةُ توزيع سند القبض** — `payments.service.ts:385-416`:
- `deleteMany` للتخصيصات (`:400`)، ثم `lockAndAssertAllocationsFit(...)` (`:401-406`) **ونتيجتُه — خريطةُ الأسعار — تُرمى**، ثم `createMany` (`:409`).
  **لا ترحيلَ إطلاقاً** — لا قيدَ فرق ولا قيدَ تصحيح.
- والذمّةُ في قيد الإنشاء كانت **غيرَ المخصَّص بسعر السند** (`settlement.util.ts:201`). فحين يُوزَّع لاحقاً على فاتورةٍ بسعرٍ آخر: **الفرقُ
  المحقَّق لا يُعترف به يومَ وقع**، ويبقى رصيداً في `1200` على العميل.
- ثم **العكسُ** (`:455-467`) يحسب الذمّةَ من التخصيصات **الحالية** — فلا يكون مرآةً للأصل، ويُرحّل على `5600` فرقاً **لم يُرحَّل أصلُه**.
- وأقربُ مدخلٍ إليه اليوم **«على الحساب»**: الإعلانُ مفروضٌ عند الإنشاء (`:182-201`)، وتعليقُه (`:196`) يقول إنه «ذمّةٌ مفوترةٌ تأخّر تخصيصُها» —
  **أي أن تخصيصَه لاحقاً هو المسارُ المقصود نفسُه**.

**B2 — إعادةُ توزيع سند الصرف** — `supplier-payments.service.ts:207-237`: المرآةُ حرفاً — `deleteMany` (`:219`)، القفلُ ونتيجتُه مرميّة (`:220-225`)،
`createMany` (`:228-230`)، ولا ترحيل. وتعليقُه بنصّه (`:202`): «إعادةُ توزيع سندٍ قائم: تحلّ المجموعةُ الجديدة محلَّ تخصيصاته كلِّها — ولا يمسّ مبلغَه
ولا قيدَه.» والعكسُ من التخصيصات الحالية (`:267-280`).

**B3 — تعديلُ سعر فاتورة شراءٍ مسدَّدة أو عملتِها** — `purchases.service.ts:252-424`:
- `quantityOrCostGiven` يشمل `currency` و`exchangeRate` (`:262-263`) **لكنه لا يرفض إلا** إن وُجد إشعارٌ أو استهلاكٌ أو استلامٌ مسجَّل (`:264-273`).
- والحارسُ الوحيد على السداد أن الإجماليَّ لا ينزل تحت المسدَّد (`:302-307`) — **لا شيءَ عن السعر ولا العملة**.
- ثم يُعكس قيدُ الشراء ويُعاد بالسعر الجديد (`:312-316` ثم `:399-416`). **وقيدُ السداد لا يُمسّ** ⟵ الفرقُ بين السعرين يبقى في `2100`.
- **والعملةُ نفسُها تتبدّل** (`:315`) على شراءٍ مخصَّصٍ عليه سندٌ بعملته القديمة — فيقع بعد التخصيص ما يرفضه `settlement.util.ts:171-175` عنده.
- والعكسُ يقرأ **السعرَ الجديد** (`supplier-payments.service.ts:268-272`).
- **وفاتورةُ المبيعات محروسةٌ من هذا** (D4) — والشراءُ وحدَه لا.

**B4 — تطبيقُ الدفعة المقدَّمة** — `invoices.service.ts:1305-1348` ⟵ `auto-posting.util.ts:208-228`:
- مستندُ 386 يصدر **بسعر سند القبض** (`invoices.service.ts:1245-1249`) ويُخصَّص عليه السندُ بإجماليه (`:1268`).
- عند التطبيق ينتقل التخصيصُ إلى فاتورة التوريد **بمبلغه كما هو** (`:1332`)، ويُرحَّل قيدُ التطبيق بمبالغ **المقدَّم الأساسية** (`:1341-1343`:
  `net: Number(doc.baseSubtotal)` · `vat: Number(doc.baseTaxTotal)` · `gross: Number(doc.baseTotal)`) — فيُدان `1200` **بسعر المقدَّم** بينما
  ذمّةُ فاتورة التوريد قُيّدت **بسعرها** (`postInvoiceEntry` — `:145`). **ولا سطرَ فرق**.
- **ولا فحصَ عملةٍ أصلاً**: المسبار `sed -n 1305,1348p invoices/invoices.service.ts | grep -c currency` ⟵ **0**؛ ضابطُه: المسبارُ نفسُه على
  `:1284-1294` (`openPrepayments`) ⟵ **2**. والمقارنةُ `applied > Number(invoice.total)` (`:1325`) تجمع مبلغين قد يكونان بعملتين.
  (وتوكيدٌ مستقلّ: Grep `prepayment_currency` على `messages.ts` ⟵ صفر، والنمطُ `allocation_currency_mismatch` وجد `:121` و`:903`.)

### (ب) الفرقُ يُطوى في سطرٍ آخر

**B5 — قبضُ إيجارٍ بعملةٍ غير عملة العقد** — `contracts.service.ts:440-627` (`RecordPaymentDto extends CurrencyFieldsDto` — `contracts/dto/record-payment.dto.ts:4`):
- `baseExpected` حين تختلف العملة = **النقدُ نفسُه**: `toBaseAmount(netAmount, payRate)` (`:485`). وتعليقُه بنصّه (`:503-505`):
  «Priced at the contract's rate — but only when the payment is in the contract's own currency. A payment made in a different currency
  altogether has no rate difference to recognize.»
  **ويخالفه تعليقُ البانِي نفسِه** (`auto-posting.util.ts:929-934`) بنصّه: «…the gap is a realized currency gain or loss posted to 5600.
  Recognising it as revenue instead would overstate the business's operating performance with something the market did.»
- **المسارُ القائم** (`!accrualPath` — `:490-509`): `fxDifference = 0` ⟵ الإيرادُ `4200`/`2400` = النقدُ بالأساس ⟵ **الفرقُ يُطوى في الإيراد**.
  ⚠️ **ولا يُبلغ اليوم إلا بعقدٍ قديم**: `rentTaxTreatment` يعيد `null` لـ`LEGACY_UNCLASSIFIED`/`LEGACY_UNDECLARED` وحدهما
  (`journal/rent-tax-point.util.ts:58`)، والعقدُ الجديد مصنَّفٌ إلزاماً (`CLAUDE.md §4` صفّ ①) — أو قسطٌ `LEGACY_COLLECTED`.
- **مسارُ الاستحقاق** (`:541-584`): الدفعةُ تُترجَم إلى عملة العقد **بسعر العقد التاريخيّ** — `grossInContractCurrency = round2(toBaseAmount(amount, payRate) /
  contractRate)` (`:486`؛ ومثلُه `rent-accrual.util.ts:85-90`) — فكلُّ ما يزيد على القسط يُستحقّ **دفعةً بلا قسطٍ «بقدرها»** (`rent-accrual.util.ts:301-307`):
  **مدين `1200` · دائن `4200` (+ `2200` إن كان خاضعاً)**. ثم التسويةُ بلا فرق لأن `baseSettled = baseExpected = النقد` (`contracts.service.ts:577-578`).
  ⟸ **زيادةُ السوق تُسجَّل إيجاراً وتُحمَّل ضريبةَ مخرجات**؛ **ونقصُه يبقى ذمّةً في `1200`**.
- **والحالةُ تُقارن عملتين**: `settled = Σ netAmount + discount` **بعملة الدفعات** مقابل `gross` **بعملة العقد** (`:611-615`) ⟸ قسطٌ ينقصه
  ما يقابل الفرق يُختم **`PAID`**.

**B6 — سندُ الردّ لمرتجع** — `payments.service.ts:528-615`:
- `RefundDto extends CurrencyFieldsDto` (`payments/dto/payment.dto.ts:131`) — **فيقبل `currency` و`exchangeRate`**.
- **ولا يقرؤهما**: السعرُ `Number(note.exchangeRate)` (`:554`) للصفّ (`:572-574`) وللنقد (`:603`) وللذمّة (`:607`). (قُرئت الدالّةُ كلُّها `:528-615`:
  تقرأ من الطلب `creditNoteId` · `method` · `bankId` · `amount` · `date` · `reference` · `notes` — ولا غيرها.)
- ⟸ النقدُ الخارجُ اليومَ يُقيَّم **بسعر الإشعار التاريخيّ**، ولا سطرَ `5600`؛ **الفرقُ مطويٌّ في قيمة حساب النقد/البنك الأساسية**.

**B7 — تحصيلُ مطالبة الإيجار** — `contracts.service.ts:1018-1044`: `baseAmount: Number(claim.baseAmount)` (`:1031`) ⟵ `postClaimPaymentEntry`
(`auto-posting.util.ts:1871-1887`): مدين `1000` ودائن `1200` **بالمبلغ نفسِه**. و`PayClaimDto` حقلُه `paidAt` وحده (`contracts/dto/claim.dto.ts:31-34`).
⟸ يُطوى في `1000`.

**B8 — تسويةُ الوديعة** — `contracts.service.ts:1113-1151`: كلُّ الأطراف بسعر الوديعة (`:1128` · `:1146-1149`) ⟵ `postDepositSettlementEntry`
(`auto-posting.util.ts:1709-1741`). و`SettleDepositDto` بلا سعر (`contracts/dto/deposit.dto.ts:50-61`).
⟸ الردُّ يُطوى في `1000`؛ **والخصمُ «على الذمّة» يُدين `1200` بسعر الوديعة** بينما ذمّةُ الإيجار بسعر العقد — وسعرُ الوديعة **قد يخالفه**
(`:1063-1064`: `dto.exchangeRate ?? Number(contract.exchangeRate)`) ⟵ الفرقُ يبقى في `1200`.

**B9 — ردُّ المقبوض غير المكتسَب عند الإلغاء** — `contracts.service.ts:389-400` ⟵ `postDeferredSettlementEntry` (`auto-posting.util.ts:1769-1787`):
مدين `2400` ودائن `1000` **بالأساس التاريخيّ** (`baseAmount: unearnedDetail.collected`). و`CancelContractDto` بلا سعر (حقولُه كلُّها
`contracts/dto/cancel-contract.dto.ts:17-86`: `cancelDate` · `cancelReason` · `installmentDisposition` · `settlementBasis` · `settlementAmount` ·
`settlementLines` · `settlementInstallments` · `unearnedDisposition`). ⟸ يُطوى في `1000`.

**B10 — تسويةُ الشبكة لمقبوضٍ أجنبيّ** (فرضيةٌ بالقراءة، **لم تُقَس**): سندُ القبض بالشبكة لا يُقيَّد بعملة البنك (`payments.service.ts:161-167` —
لا فحصَ عملة)، فيُدين `1251` بالأساس يومَ القبض. والتسويةُ تقرأ الإجماليَّ **من سطور الدفتر** (`banks/network-settlements.service.ts:181`)
**وتحسب الصافي** `gross − fee − feeVat` (`:183`) ولا تُدخله — فما يصل البنكَ فعلاً بعد تحويل المستحوذ **لا مدخلَ له**: إمّا يُطوى في العمولة
أو يبقى فرقَ مطابقةٍ بنكية.

---

## ٣) الحسابُ من الشيفرة — مثالٌ لكلّ مسارٍ مكسور

> كلُّ الأرقام بحساب اليد على الصيغ المقتبَسة، والتقريبُ `round2` نصفاً بعيداً عن الصفر على القيمة العشرية (`common/money/rounding.ts:88-94`).
> **لم يُشغَّل شيءٌ منها.** عملةُ المنشأة ريال في الأمثلة، والفواتيرُ معفاةٌ حيث لا يُذكر غيرُ ذلك.

### B1 — «على الحساب» ثم توزيعٌ ثم عكس (العميل)
| الخطوة | الشيفرة | القيد |
|---|---|---|
| فاتورة A: 100 USD @3.70 | `postInvoiceEntry` `:145-146` | مدين `1200` 370 · دائن `4100` 370 |
| سند P: 100 USD @3.80، `ON_ACCOUNT` | `baseSettledOf(100, 3.8, [], …)` = `onAccount` = 380 (`settlement.util.ts:201`)؛ `cash = 380` ⟵ `fxGain = 0` | مدين نقد 380 · دائن `1200` 380 |
| `POST /payments/P/allocate [{A,100}]` | `:400-410` — لا ترحيل | — |
| **الحال** | | `1200` للعميل = 370 − 380 = **−10** (دائن)، وA **`PAID`**. **الربحُ المحقَّق 10 باقٍ في `1200`** |
| عكسُ P | `baseReceivable = −baseSettledOf(100, 3.8, [{A,100}], {A:3.7})` = **−370** (`:460-467`)؛ `cash = −380`؛ `fxGain = −380 − (−370) = −10` | مدين `1200` 370 · **مدين `5600` 10** · دائن نقد 380 |
| **بعد العكس** | | `1200` = −10 + 370 = **360** والفاتورةُ مفتوحةٌ بـ370 ⟸ ناقصةٌ 10؛ **و`5600` خسارةٌ شبحية 10** لم يُرحَّل أصلُها |

وصورةٌ ثانية لا تمرّ بـ«على الحساب»: سندٌ خُصِّص عند إنشائه على A@3.70 (ربح 10 على `5600`) ثم أُعيد توزيعُه على B@3.60: الذمّةُ المسوّاة
الحقيقية 360 والربحُ 20 — **والمرحَّلُ 10**، والفرقُ 10 في `1200`.

### B2 — المرآة (المورّد)
سند صرف 100 USD @3.80 بلا تخصيص ⟵ مدين `2100` 380 · دائن نقد 380. شراء 100 USD @3.70 ⟵ دائن `2100` 370. التوزيعُ لا يرحّل ⟵ `2100` للمورّد =
**+10 (مدين)** والشراء `PAID` — **الخسارةُ المحقَّقة 10 باقيةٌ في `2100`**. العكسُ: `basePayable = −370`، `cash = −380`،
`fxGain = settled − cash = −370 + 380 = +10` (`auto-posting.util.ts:1286`) ⟵ **دائن `5600` 10 — ربحٌ شبحيّ**.

### B3 — تعديلُ سعر شراءٍ مسدَّد
| الخطوة | القيد |
|---|---|
| شراء 100 USD @3.70 (معفى، خدميّ) | مدين مصروف 370 · دائن `2100` 370 |
| سداد 100 USD @3.80 مخصَّص | `basePayable = 370`، `cash = 380`، `fxGain = 370 − 380 = −10` ⟵ مدين `2100` 370 · مدين `5600` 10 · دائن نقد 380 |
| `PATCH /purchases/:id {exchangeRate: 3.6}` | عكسُ الأصل (`:401`) مدين `2100` 370 · دائن مصروف 370؛ وإعادة (`:403-416`) مدين مصروف 360 · دائن `2100` 360 |
| **الحال** | `2100` = −370 + 370 + 370 − 360 = **+10**، والشراء `PAID`. **الخسارةُ الحقيقية 380 − 360 = 20 والمرحَّل 10** |
| عكسُ السداد | `basePayable = −(100 × 3.60) = −360`، `cash = −380`، `fxGain = −360 + 380 = +20` ⟵ **دائن `5600` 20**؛ فصافي `5600` = 10 − 20 = **ربحٌ شبحيّ 10**، و`2100` = 10 − 360 = −350 مقابل ذمّةٍ مفتوحةٍ 360 |

وبتبديل العملة `{currency: 'SAR', exchangeRate: 1}` بدل السعر: `2100` = −370 + 370 + 370 − 100 = **+270**.

### B4 — دفعةٌ مقدَّمة @3.80 تُطبَّق على توريدٍ @3.70 (خاضع 15%)
| الخطوة | الشيفرة | القيد |
|---|---|---|
| سند 115 USD @3.80، `PREPAYMENT` | الذمّةُ 437 على الحساب (`:235`) | مدين نقد 437 · دائن `1200` 437 |
| مستند 386 | الصافي `round2(115/1.15) = 100`، الضريبة 15 (`:1207-1227`)؛ الأساس 380 / 57 / 437 (`:1247-1249`) | مدين `1200` 437 · دائن `2450` 380 · دائن `2200` 57 |
| توريد INV: 100 + 15% = 115 USD @3.70 | `postInvoiceEntry` | مدين `1200` 425.50 · دائن `4100` 370 · دائن `2200` 55.50 |
| التطبيق | `:1341-1343` | مدين `2450` 380 · مدين `2200` 57 · دائن `1200` **437** |
| **الحال** | | `1200` = −437 + 437 + 425.50 − 437 = **−11.50** والتوريد `PAID`؛ `2450` = 0؛ `2200` = 55.50 دائن. **الربحُ 11.50 باقٍ في `1200`** |

(والإقرارُ يقرأ ضريبةَ المقدَّم المطبَّق بسعر المقدَّم — `obligations/obligations.service.ts:655-660` — فجانبُ `2200` متّسقٌ مع الإقرار اليوم؛ **الخللُ في
`1200` وحدَه**.)

### B5 — عقد 1000 USD @3.75، يُدفع ريالاً بسعر 1
- **مسارُ الاستحقاق، معفى، يُدفع 3800 ريال**: `grossInContractCurrency = round2(3800 × 1 / 3.75) = 1013.33` (`:486`)؛ `excess = min(1013.33, max(0, 1013.33 − 1000))
  = 13.33` (`rent-accrual.util.ts:304`) ⟵ استحقاقٌ `UNLINKED` بأساس `round2(13.33 × 3.75) = 49.99` (`:134-137`): مدين `1200` 49.99 · **دائن `4200` 49.99**.
  والتسوية: `baseCash = 3800`، `baseSettled = toBaseAmount(3800, 1) = 3800` ⟵ لا `5600`. **`1200`** = 3750 + 49.99 − 3800 = **−0.01**؛ **والربحُ 50 صار إيجاراً 49.99**.
- **ولو كان تجارياً خاضعاً غيرَ شامل** (القسطُ الإجماليّ 1150 USD = 4312.50) ودُفع 4370 ريالاً: `grossInContract = 1165.33`، `excess = 15.33`؛
  `splitGrossAmount` (`rent-tax-point.util.ts:95-100`): الضريبة `round2(15.33 × 0.15 / 1.15) = 2.00`، الصافي 13.33؛ بالأساس: الإجمالي 57.49، **الضريبة 7.50**،
  الصافي 49.99 ⟵ **مدين `1200` 57.49 · دائن `4200` 49.99 · دائن `2200` 7.50** — **ضريبةُ مخرجاتٍ على فرق صرف**، ويقرؤها الإقرارُ من صفوف
  `rent_accruals` الخاضعة (`obligations.service.ts:589-592`).
- **ويُدفع 3700 ريالاً**: `grossInContract = 986.67` ⟵ لا زيادة؛ التسوية: مدين نقد 3700 · دائن `1200` 3700 ⟵ **`1200` = +50 باقية**؛ والحالة:
  `settled = 3700` (ريال) مقابل `gross = 1000` (دولار) (`contracts.service.ts:611-614`) ⟵ **`PAID`**.
- **المسارُ القائم** (عقدٌ قديم): مدين نقد 3800 · دائن `4200`/`2400` 3800 ⟵ **الربحُ 50 في الإيراد**.

### B6 — ردٌّ بعد تغيّر السعر
فاتورة 100 USD @3.70 سُدِّدت 100 USD @3.70، ثم إشعارٌ دائن كامل (بسعر الفاتورة — D2)، ثم ردٌّ نقديٌّ يومَ صار السعر 3.80:
`rate = 3.70` (`:554`) ⟵ `baseCash = −370`، `baseReceivable = −370` ⟵ `fxGain = 0` ⟵ مدين `1200` 370 · دائن نقد **370**. **والخارجُ فعلاً 100 USD
قيمتُها 380** ⟵ الخسارةُ 10 **مطويّةٌ في قيمة حساب النقد** (يبقى مقوَّماً بأكثر مما فيه بـ10).

### B7/B8/B9 — المطالبة والوديعة والمقبوضُ غيرُ المكتسَب
مطالبة 100 USD @3.75 ⟵ مدين `1200` 375 · دائن `4300` 375؛ تُحصَّل يومَ 3.80 ⟵ مدين `1000` **375** · دائن `1200` 375 — **والنقدُ الداخل قيمتُه 380**
⟸ الربحُ 5 مطويٌّ في `1000`. والوديعةُ والمقبوضُ غيرُ المكتسَب على النمط نفسِه بالاتجاه المعاكس (نقدٌ خارج).

---

## ٤) ما يعني هذا في التقارير

- **مطابقةُ الأعمار مع `1200`** تعرض الرصيدَ اليتيمَ «فرقاً غيرَ منسوب» (`CLAUDE.md §4` — صفّ 4.6)؛ **ولم يُقَس** هل تقرأ الأعمارُ مستندات العملة
  الأجنبية بالأساس أم بعملتها.
- **كشفُ حساب الطرف** (`GET /reports/statement?customerId=…|supplierId=…`) يقرأ حسابَ الرقابة `1200`/`2100` بسطوره التي تحمل بُعدَ الطرف
  (`reports/reports.service.ts:980-987`) — **فالرصيدُ اليتيم يظهر فيه باسم العميل/المورّد** بينما مستنداتُه مسدَّدة. وهو المقياسُ الذي تبنيه الاختباراتُ في (٦).
- **قائمةُ الدخل**: B5 يرفع الإيرادَ (`4200`)، وB1–B4 يُخفون الربح/الخسارة عن `5600` ثم يُظهرونها شبحاً عند العكس.

---

## ٥) الاستعلاماتُ — للعدّ على قاعدةٍ قائمة (لم تُشغَّل)

**العزل**: `payments` · `payment_allocations` · `supplier_payments` · `rent_payments` · `invoice_prepayments` تحت `FORCE ROW LEVEL SECURITY`
(الهجرات: `20260808200000_customer_payments/migration.sql:84` و`:89` · `20260915120000_supplier_payments/migration.sql:123` ·
`20260720032345_real_estate_core/migration.sql:182` و`20260916200000_rent_accrual/migration.sql:67` · `20260922020000_prepayment_invoice/migration.sql:60` و`:80`)،
وكذلك `accounts`/`journal_*` (مقيسٌ في `claim-g` §٦). **فالعدُّ بـ`app_user` بلا سياق يعود صفراً بنجاح.** طريقان:

- **(أ) بدورٍ خارقٍ للقراءة وحدَها** داخل `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;` — **بعد الضابط P0**.
- **(ب) بـ`app_user` داخل سياق كل منشأة** — قالبُه في آخر هذا القسم.

أسماءُ الجداول والأعمدة مقروءةٌ من `prisma/schema.prisma` في هذا التشغيل: `payments` (`:5193`) · `payment_allocations` (`:5230`) ·
`supplier_payments` (`:5302`) · `supplier_payment_allocations` (`:5332`) · `invoice_prepayments` (`:1664`) · `rent_payments` (`:5389`) ·
`rent_accruals` (`:5463`) · `contract_deposits` (`:4128`) · `contract_claims` (`:4035`) · `contract_installments` (`:5099`) ·
`journal_entries` (`:3153`) · `journal_lines` (`:3263`) · `bank_transactions` (`:3043`) · `companies` (`:598`، والعمود `baseCurrency` `:458`) ·
`accounts` (`:1251`) · `invoices` (`:1626`) · `purchases` (`:1951`) · `banks` (`:2991`) · `contracts` (`:4238`).
وقيمُ التعداد: `PaymentKind {RECEIPT, REFUND}` · `InvoiceDocType {INVOICE, CREDIT_NOTE, DEBIT_NOTE, PREPAYMENT}` · `RentAccrualKind {DUE, PREPAYMENT,
UNLINKED, REVERSAL, DISCOUNT}` · `InstallmentStatus {DUE, LATE, PARTIAL, PAID, CANCELLED}` · `ClaimStatus {OPEN, PAID, WAIVED}` ·
`DepositStatus {HELD, SETTLED}` · `DepositHolder {COMPANY, EJAR}`.

> **حدٌّ معلَن**: الاستعلاماتُ مكتوبةٌ بالقراءة **ولم تُنفَّذ** — صحّتُها النحوية غيرُ مُثبَتة. وقاعدةُ التطوير تحمل بقايا اختبارات؛
> **فالرقمُ عليها يقيس الاختبارات والبذور لا تجّاراً**.

### P0 — ضابطُ الرؤية (يسبق كلَّ رقم)
```sql
SELECT current_user,
       current_setting('is_superuser')                                   AS su,
       (SELECT count(*) FROM companies)                                  AS companies,
       (SELECT count(*) FROM accounts WHERE code = '1200')               AS with_1200,
       (SELECT count(*) FROM journal_lines)                              AS lines_visible,
       (SELECT count(*) FROM payments p JOIN companies c ON c.id = p."companyId"
         WHERE p.currency <> c."baseCurrency")                           AS foreign_receipts,
       (SELECT count(*) FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId"
         WHERE a.code = '5600')                                          AS lines_on_5600;
```
**المعنى**: `with_1200 = 0` أو `lines_visible = 0` مع `companies > 0` ⟸ **المسبارُ أعمى، وكلُّ صفرٍ بعده باطل**. و`foreign_receipts = 0` يعني أن
P1/P2 سيعودان صفراً **لغياب الحالة لا لسلامة الشيفرة** — يُكتب كذلك.

### P1 — سنداتُ القبض: الذمّةُ المرحَّلة في قيد السند ≠ الذمّةُ من تخصيصاته الحالية (B1 · B4)
```sql
WITH pay AS (
  SELECT p.id, p.currency, p.amount, p."exchangeRate" AS prate, p."journalEntryId"
  FROM payments p
  WHERE p.kind = 'RECEIPT' AND p."reversesId" IS NULL AND p."journalEntryId" IS NOT NULL
),
settled_now AS (
  SELECT pay.id,
         round( coalesce(sum(round(pa.amount * i."exchangeRate", 2)), 0)
              + round((pay.amount - coalesce(sum(pa.amount), 0)) * pay.prate, 2), 2) AS base_now,
         count(pa.id) FILTER (WHERE i.currency <> pay.currency)                     AS cross_ccy_allocs
  FROM pay
  LEFT JOIN payment_allocations pa ON pa."paymentId" = pay.id
  LEFT JOIN invoices i             ON i.id = pa."invoiceId"
  GROUP BY pay.id, pay.amount, pay.prate, pay.currency
),
posted AS (
  SELECT pay.id, round(coalesce(sum(jl.credit - jl.debit), 0), 2) AS base_posted
  FROM pay
  JOIN journal_lines jl ON jl."journalEntryId" = pay."journalEntryId"
  JOIN accounts a       ON a.id = jl."accountId" AND a.code = '1200'
  GROUP BY pay.id
),
applied_prepay AS (
  SELECT DISTINCT pp."prepaymentPaymentId" AS id
  FROM invoices pp
  JOIN invoice_prepayments ip ON ip."prepaymentInvoiceId" = pp.id
  WHERE pp."prepaymentPaymentId" IS NOT NULL
),
d AS (
  SELECT n.id, n.base_now - coalesce(po.base_posted, 0) AS drift, n.cross_ccy_allocs, (ap.id IS NOT NULL) AS via_prepayment
  FROM settled_now n
  LEFT JOIN posted po USING (id)
  LEFT JOIN applied_prepay ap USING (id)
)
SELECT count(*)                                                    AS receipts_checked,
       count(*) FILTER (WHERE abs(drift) >= 0.01)                  AS drifted,
       count(*) FILTER (WHERE abs(drift) >= 0.01 AND via_prepayment)     AS drifted_via_prepayment_application,
       count(*) FILTER (WHERE abs(drift) >= 0.01 AND NOT via_prepayment) AS drifted_via_allocate,
       coalesce(sum(drift) FILTER (WHERE abs(drift) >= 0.01), 0)   AS residue_in_1200_debit_positive,
       count(*) FILTER (WHERE cross_ccy_allocs > 0)                AS receipts_with_cross_currency_allocations
FROM d;
```
**الصيغة** مطابقةٌ لـ`baseSettledOf` (`settlement.util.ts:199-202`). **المعنى**: `drifted > 0` ⟸ سنداتٌ **فرقُها المحقَّق لم يُرحَّل** (B1 إن لم تكن
دفعةً مقدَّمة، B4 إن كانت)، و`residue_in_1200_debit_positive` صافي ما بقي في `1200` (السالبُ ربحٌ عالق، الموجبُ خسارةٌ عالقة). و
`receipts_with_cross_currency_allocations > 0` ⟸ تخصيصٌ بعملتين **لا يُنشئه إلا B4** (القفلُ يرفضه في غيره). ⚠️ سندٌ أُعيد توزيعُه على مستندٍ
**بالسعر نفسِه** لا يظهر — وهو صحيح: لا أثرَ صرفٍ له.

### P2 — عكسُ سند القبض ليس مرآةَ أصله (شبحُ B1/B4)
```sql
SELECT count(*)                                                              AS reversals_checked,
       count(*) FILTER (WHERE abs(fo.v + fr.v) >= 0.01 OR abs(ro.v + rr.v) >= 0.01) AS non_mirror_reversals,
       coalesce(sum(fo.v + fr.v) FILTER (WHERE abs(fo.v + fr.v) >= 0.01), 0)  AS phantom_on_5600_credit_positive
FROM payments r
JOIN payments o ON o.id = r."reversesId"
CROSS JOIN LATERAL (SELECT coalesce(sum(jl.credit - jl.debit), 0) AS v FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" AND a.code = '5600' WHERE jl."journalEntryId" = o."journalEntryId") fo
CROSS JOIN LATERAL (SELECT coalesce(sum(jl.credit - jl.debit), 0) AS v FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" AND a.code = '5600' WHERE jl."journalEntryId" = r."journalEntryId") fr
CROSS JOIN LATERAL (SELECT coalesce(sum(jl.credit - jl.debit), 0) AS v FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" AND a.code = '1200' WHERE jl."journalEntryId" = o."journalEntryId") ro
CROSS JOIN LATERAL (SELECT coalesce(sum(jl.credit - jl.debit), 0) AS v FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" AND a.code = '1200' WHERE jl."journalEntryId" = r."journalEntryId") rr
WHERE r.kind = 'RECEIPT';
```
**المعنى**: عكسٌ مرآةٌ يجعل `5600` و`1200` للزوج صفراً؛ **غيرُ الصفر** ⟸ عكسٌ حسب ذمّتَه من تخصيصاتٍ تغيّرت بعد الترحيل — **ربحٌ/خسارةٌ على `5600`
لا أصلَ لها** (`phantom…` الموجبُ ربحٌ شبحيّ).

### P3 — سنداتُ الصرف: المرحَّلُ في `2100` ≠ المحسوبُ من التخصيصات الحالية (B2 · B3)
```sql
WITH sp AS (
  SELECT s.id, s.currency, s.amount, s."exchangeRate" AS prate, s."journalEntryId"
  FROM supplier_payments s
  WHERE s."reversesId" IS NULL AND s."journalEntryId" IS NOT NULL
),
settled_now AS (
  SELECT sp.id,
         round( coalesce(sum(round(a.amount * pu."exchangeRate", 2)), 0)
              + round((sp.amount - coalesce(sum(a.amount), 0)) * sp.prate, 2), 2) AS base_now,
         count(a.id) FILTER (WHERE pu.currency <> sp.currency)                     AS cross_ccy_allocs
  FROM sp
  LEFT JOIN supplier_payment_allocations a ON a."paymentId" = sp.id
  LEFT JOIN purchases pu                   ON pu.id = a."purchaseId"
  GROUP BY sp.id, sp.amount, sp.prate, sp.currency
),
posted AS (
  SELECT sp.id, round(coalesce(sum(jl.debit - jl.credit), 0), 2) AS base_posted
  FROM sp
  JOIN journal_lines jl ON jl."journalEntryId" = sp."journalEntryId"
  JOIN accounts ac      ON ac.id = jl."accountId" AND ac.code = '2100'
  GROUP BY sp.id
),
edited AS (  -- شراءٌ مخصَّصٌ عليه أُعيد ترحيلُه بتعديل؛ المذكّرة حرفاً من purchases.service.ts:401
  SELECT DISTINCT a."paymentId" AS id
  FROM supplier_payment_allocations a
  JOIN purchases pu       ON pu.id = a."purchaseId"
  JOIN journal_entries je ON je."companyId" = pu."companyId"
                         AND je.memo = 'عكسُ فاتورة شراء ' || pu.no || ' — تعديل'
),
d AS (
  SELECT n.id, n.base_now - coalesce(po.base_posted, 0) AS drift, n.cross_ccy_allocs, (e.id IS NOT NULL) AS purchase_edited
  FROM settled_now n LEFT JOIN posted po USING (id) LEFT JOIN edited e USING (id)
)
SELECT count(*)                                                              AS supplier_payments_checked,
       count(*) FILTER (WHERE abs(drift) >= 0.01)                            AS drifted,
       count(*) FILTER (WHERE abs(drift) >= 0.01 AND purchase_edited)        AS drifted_with_edited_purchase,
       count(*) FILTER (WHERE abs(drift) >= 0.01 AND NOT purchase_edited)    AS drifted_via_allocate,
       coalesce(sum(drift) FILTER (WHERE abs(drift) >= 0.01), 0)             AS residue_in_2100_credit_positive,
       count(*) FILTER (WHERE cross_ccy_allocs > 0)                          AS payments_with_cross_currency_allocations
FROM d;
```
**المعنى**: `drifted_with_edited_purchase > 0` ⟸ B3 (سعرٌ أو عملةٌ عُدِّلا بعد السداد — **والتعديلُ هنا أيُّ إعادة ترحيل**، فالسببُ يُقرأ من
الصفّ)، والباقي B2. و`payments_with_cross_currency_allocations > 0` ⟸ **شراءٌ بُدِّلت عملتُه بعد التخصيص** (B3) — لأن القفلَ يرفضه عند التخصيص.

### P4 — عكسُ سند الصرف ليس مرآةَ أصله
كـP2 حرفاً مع `supplier_payments` و`2100` بدل `payments` و`1200`، وبلا شرط `kind`.

### P5 — تطبيقُ الدفعة المقدَّمة بسعرٍ أو عملةٍ أخرى (B4 — يصادق P1)
```sql
SELECT count(*)                                                                        AS applications_checked,
       count(*) FILTER (WHERE pp.currency = inv.currency AND pp."exchangeRate" <> inv."exchangeRate") AS same_ccy_other_rate,
       coalesce(sum(round(ip.gross * inv."exchangeRate", 2) - pp."baseTotal")
                FILTER (WHERE pp.currency = inv.currency AND pp."exchangeRate" <> inv."exchangeRate"), 0) AS residue_in_1200_debit_positive,
       count(*) FILTER (WHERE pp.currency <> inv.currency)                             AS cross_currency_applications
FROM invoice_prepayments ip
JOIN invoices pp  ON pp.id  = ip."prepaymentInvoiceId"
JOIN invoices inv ON inv.id = ip."invoiceId";
```
**الصيغة**: `ip.gross = doc.total` (`invoices.service.ts:1329`) والقيدُ يُدين `1200` بـ`doc.baseTotal` (`:1343`). **المعنى**: `residue…` يجب أن يساوي
`drifted_via_prepayment_application` من P1 أثراً (مسباران مستقلّان يتصادقان)؛ و`cross_currency_applications > 0` ⟸ **مقدَّمٌ بعملةٍ طُبّق على
فاتورةٍ بأخرى** — الأرقامُ فيه بلا معنى وتُعدّ ولا تُجمع.

### P6 — قبضُ الإيجار بعملةٍ غير عملة العقد (B5)
```sql
WITH x AS (
  SELECT rp.id, rp."installmentId", rp."exchangeRate" AS prate, c."exchangeRate" AS crate,
         CASE WHEN rp."journalEntryId" IS NULL THEN 'unposted'
              WHEN EXISTS (SELECT 1 FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" AND a.code = '1200'
                            WHERE jl."journalEntryId" = rp."journalEntryId") THEN 'accrual-path'
              ELSE 'cash-path' END AS path,
         (SELECT coalesce(sum(ra."baseGross"), 0) FROM rent_accruals ra
           WHERE ra."paymentId" = rp.id AND ra.kind = 'UNLINKED' AND rp."installmentId" IS NOT NULL) AS excess_gross,
         (SELECT coalesce(sum(ra."baseTax"), 0) FROM rent_accruals ra
           WHERE ra."paymentId" = rp.id AND ra.kind = 'UNLINKED' AND rp."installmentId" IS NOT NULL) AS excess_tax
  FROM rent_payments rp
  JOIN contracts c ON c.id = rp."contractId"
  WHERE rp.currency <> c.currency
)
SELECT path,
       count(*)                                  AS payments,
       count(*) FILTER (WHERE prate = crate)     AS rate_equals_contract_rate,
       sum(excess_gross)                         AS fx_driven_excess_accrual_base,
       sum(excess_tax)                           AS output_vat_on_that_excess
FROM x GROUP BY path ORDER BY path;

-- أقساطٌ خُتمت بمقارنة عملتين (contracts.service.ts:611-615)
SELECT count(DISTINCT i.id) AS installments_settled_across_currencies
FROM contract_installments i
JOIN rent_payments rp ON rp."installmentId" = i.id
JOIN contracts c      ON c.id = i."contractId"
WHERE rp.currency <> c.currency AND i.status IN ('PAID', 'PARTIAL');
```
**المعنى**: `payments > 0` في أيّ مسار ⟸ فرقُ صرفٍ لم يصل `5600`؛ `fx_driven_excess_accrual_base > 0` ⟸ **فرقُ صرفٍ سُجِّل إيجاراً**، و
`output_vat_on_that_excess > 0` ⟸ **وضريبةُ مخرجاتٍ حُمِّلت عليه ودخلت الإقرار**؛ و`rate_equals_contract_rate > 0` ⟸ **على الأرجح** سعرٌ افتراضيّ
ورث سعرَ العقد لعملةٍ أخرى (E3 — `contracts.service.ts:471`) — «على الأرجح» لأن التطابقَ قد يكون مقصوداً؛ لم يُقَس.

### P7 — المساراتُ بسعرٍ تاريخيٍّ حتماً (B6–B9): عدٌّ لا مبلغ
```sql
SELECT 'refunds_foreign'            AS path, count(*) FROM payments p JOIN companies co ON co.id = p."companyId"
  WHERE p.kind = 'REFUND' AND p.currency <> co."baseCurrency"
UNION ALL
SELECT 'claims_paid_foreign',       count(*) FROM contract_claims cc JOIN companies co ON co.id = cc."companyId"
  WHERE cc.status = 'PAID' AND cc.currency <> co."baseCurrency"
UNION ALL
SELECT 'deposits_settled_foreign',  count(*) FROM contract_deposits d JOIN companies co ON co.id = d."companyId"
  WHERE d.status = 'SETTLED' AND d.holder = 'COMPANY' AND d.currency <> co."baseCurrency"
UNION ALL
SELECT 'deposits_rate_ne_contract', count(*) FROM contract_deposits d JOIN contracts c ON c.id = d."contractId"
  WHERE d.status = 'SETTLED' AND (d."exchangeRate" <> c."exchangeRate" OR d.currency <> c.currency)
UNION ALL
SELECT 'cancelled_foreign_contracts', count(*) FROM contracts c JOIN companies co ON co.id = c."companyId"
  WHERE c.status = 'CANCELLED' AND c.currency <> co."baseCurrency";
```
**المعنى**: **المبلغُ لا يُقاس** — لا يُخزَّن سعرُ يوم التسوية في هذه المسارات أصلاً. فغيرُ الصفر يعني «صفوفٌ **فرقُها المحقَّق غيرُ معروفٍ ومطويّ**
في `1000`/البنك»، ولا يُحسب له رقم. و`deposits_rate_ne_contract > 0` وحده له أثرٌ محسوب في `1200` (B8).

### P8 — (هـ) بلا تحويلٍ أصلاً — للعلم لا لـ`5600`
```sql
-- بنكٌ أجنبيّ: القيدُ الافتتاحيّ بالمبلغ الأجنبيّ لا بالأساس (banks.service.ts:241)
SELECT count(*) AS foreign_banks_with_opening,
       count(*) FILTER (WHERE abs(coalesce(op.v, 0) - b."baseOpeningBalance") >= 0.01) AS opening_posted_unconverted
FROM banks b
JOIN companies co ON co.id = b."companyId"
CROSS JOIN LATERAL (SELECT sum(jl.debit - jl.credit) AS v
                    FROM journal_entries je JOIN journal_lines jl ON jl."journalEntryId" = je.id AND jl."accountId" = b."accountId"
                    WHERE je."openingForAccountId" = b."accountId") op
WHERE b.currency <> co."baseCurrency" AND b."openingBalance" <> 0;

-- سطرُ كشفٍ رُحِّل لبنكٍ أجنبيّ بمبلغه الخام (reconciliation.service.ts:187 — القيدُ اليدويّ auto=false، auto-posting.util.ts:1341)
SELECT count(*) AS statement_postings_on_foreign_banks
FROM bank_transactions bt
JOIN banks b            ON b.id = bt."bankId"
JOIN companies co       ON co.id = b."companyId"
JOIN journal_lines jl   ON jl.id = bt."matchedLineId"
JOIN journal_entries je ON je.id = jl."journalEntryId" AND je.auto = false AND je.no = bt."entryNo"
WHERE b.currency <> co."baseCurrency";
```

### القالب (ب) — بـ`app_user` داخل سياق كل منشأة
```sql
BEGIN;
SET TRANSACTION READ ONLY;
DO $$
DECLARE r record; n_total int := 0; n_seen int := 0; v int; s int := 0;
BEGIN
  FOR r IN SELECT id FROM companies LOOP             -- companies بلا عزل صفوف (claim-g §٦)
    PERFORM set_config('app.company_id', r.id, true);
    n_total := n_total + 1;
    IF current_setting('app.company_id', true) = r.id
       AND EXISTS (SELECT 1 FROM accounts WHERE code = '1200') THEN n_seen := n_seen + 1; END IF;  -- ضابطُ الرؤية
    -- هنا الاستعلامُ المطلوب مختصَراً إلى عدٍّ واحد: SELECT count(*) INTO v FROM (…) q WHERE abs(q.drift) >= 0.01;
    s := s + coalesce(v, 0);
  END LOOP;
  RAISE WARNING 'companies=% seen_with_1200=% count=%', n_total, n_seen, s;
END $$;
ROLLBACK;
```
⚠️ المتغيّراتُ بأسماءٍ غير محجوزة (لا `both` — عيبُ `claim-g` ع-٣)، و`seen_with_1200 < companies` يُقرأ **منشآتٍ لم يُرَ فيها شيء**
لا منشآتٍ سليمة.

---

## ٦) الإصلاحُ الأصغر لكلّ مسار — ونقيضُه — والاختبار

> **قبل البناء (`§3.6` و`§4` القاعدة الحاكمة)**: الإصلاحاتُ محاسبيةٌ داخلية لا تمسّ الضريبة **إلا B5** (يوقف تحميلَ ضريبة مخرجاتٍ على فرق صرف)
> **وB4** (لا يمسّ سطرَي `2200` لكنه على مستندٍ ضريبيّ). **ولم يُقرأ نصٌّ نظاميّ لأيٍّ منهما في هذا القياس** — يُعلَن ولا يُتجاوز.
> **والوسم**: `SPEC.md:81` يقول عن `3.10` «🟨 *(مسار الإيجار فقط)*» — فاختبارٌ يُوسَم `[SPEC 3.10]` يُسقط الحارسَ ③ (`apps/api/src/common/spec-tags.spec.ts`)
> ما لم يُحدَّث الصفُّ في الطلب نفسِه.

### F1 — B1 وB2: إعادةُ التوزيع تُرحّل فرقَها
- **الموضع**: `payments.service.ts` `allocate()` و`supplier-payments.service.ts` `allocate()`.
- **الإضافة**:
  1. **قبل** `deleteMany` (`payments.service.ts:400` · `supplier-payments.service.ts:219`): تُقرأ أسعارُ مستندات التخصيصات القديمة، ويُحسب
     `before = baseSettledOf(amount, payment.exchangeRate, oldAllocations, oldRates)`.
  2. تُلتقط نتيجةُ `lockAndAssertAllocationsFit` (`payments.service.ts:401` · `supplier-payments.service.ts:220`) بدل رميها، ويُحسب
     `after = baseSettledOf(amount, payment.exchangeRate, requested, rates)`.
  3. `delta = round2(after − before)`؛ إن `|delta| ≥ 0.01` ⟵ قيدٌ بـ`postPartySettlementEntry` نفسِه: `baseCash: 0` و`baseSettled: delta`
     (والجانبُ والطرفُ والفرعُ من السند)، بيوم التوزيع ومذكّرةٍ تسمّي السند.
  4. **وسطران في `postPartySettlementEntry`** (`auto-posting.util.ts:1289` · `:1292-1295`): لا يُطلب `1000` ولا يُضاف سطرُ النقد حين `cash === 0`.
     فيخرج القيد: **القبض** `delta > 0` ⟵ دائن `1200` · مدين `5600`؛ `delta < 0` ⟵ مدين `1200` · دائن `5600`. **والصرف** مرآتُه على `2100`.
- **ولا يلزم تغييرُ العكس**: بعد F1 يصير مرحَّلُ السند = الإنشاء + التسويات = الذمّةُ من التخصيصات الحالية، **فتصدق فرضيةُ `:453-454`**.
  (والأزواجُ القائمة من P2/P4 تبقى كما رُحِّلت — تُعلَن وتُعدّ ولا تُصحَّح، نمطُ المشروع.)
- **النقيضُ الواقعيّ للإثبات بالعكس**: حسابُ `before` **بعد** `deleteMany` — أي من تخصيصاتٍ فارغة فيصير `amount × payment.exchangeRate`. صياغةٌ
  يكتبها مطوّرٌ فعلاً لأن الحذفَ يسبق في الدالّة. **يتطابق مع الصحيح في حالة «على الحساب»**، ويفترق في حالة «من A إلى B» — فالاختبارُ يحمل الحالتين.
- **الاختبار** — `apps/api/test/fx-realized-difference.e2e-spec.ts`، منشأةٌ معزولة (`registerIsolatedCompany` — `test/isolated-company.ts:24`)، ونقدٌ
  بلا `bankId` (فيقع على `1000` ولا تُمسّ مرآةُ صندوقٍ بعملةٍ أخرى — E4). والمقياسان: **`GET /reports/statement?customerId=…`** (`closing`) وسطرُ
  `5600` في **`GET /reports/trial-balance`** (`creditTotal − debitTotal`، قبل الحالة وبعدها — `reports.service.ts:901-904`).
  - **①** فاتورة A: 100 USD @3.70 (`makeInvoice(100,'USD',3.7)` بنمط `test/payments.e2e-spec.ts:34-46`) ⟵ سند 100 USD @3.80 `unallocated: 'ON_ACCOUNT'`
    ⟵ `POST /payments/:id/allocate [{A,100}]`. **التوكيد**: `closing === '0.00'` · `Δ5600 = +10.00` · A `PAID`. ثم `POST /payments/:id/reverse`:
    `closing === '370.00'` · `Δ5600` التراكميّ `0.00`.
  - **②** (يمسك النقيض): فاتورة A2 @3.70 وB @3.60؛ سند 100 USD @3.80 **مخصَّصٌ عند إنشائه** على A2 (`Δ5600 = +10`) ⟵ توزيعٌ إلى B.
    **التوكيد**: `closing === '370.00'` (A2 مفتوحة) · `Δ5600 = +20.00`. ثم العكس: `closing === '730.00'` · `Δ5600 = 0.00`.
    (**اليوم**: `closing` بعد التوزيع `380.00` لا `370.00`، و`Δ5600 = +10`؛ **والنقيض** يعطي `360.00` و`+30`.)
  - **③** مرآتُهما للمورّد (`makePurchase` بنمط `test/supplier-payments.e2e-spec.ts:39-52`، `GET /reports/statement?supplierId=…`، والإشاراتُ معكوسة:
    `Δ5600 = −10.00` ثم `−20.00`).

### F2 — B3: السعرُ والعملةُ مجمَّدان على شراءٍ مسدَّد
- **الموضع**: `purchases.service.ts` `update()` بعد `:273` (قبل أيّ كتابة): إن كان `dto.exchangeRate !== undefined || dto.currency !== undefined`
  **و**`allocatedFor(purchaseTarget(tx), id) > 0` ⟵ `409` مسمّى برقم الشراء، والمخرجُ «اعكس السند أوّلاً» — كنظيره القائم على الإجماليّ (`:300-307`).
  **بالحضور لا بالقيمة** كحارسَي `:262-263` وفاتورة المبيعات (`invoices.service.ts:743-750`)؛ ولا يُكسر به الواجهة: لا صفحةَ ترسل `exchangeRate`
  (المسبارُ في ٠).
- **لا ينكسر** `test/supplier-payments.e2e-spec.ts:326` (يعدّل `subtotal` لشراءٍ مسدَّد بالريال — لا سعرَ ولا عملة).
- **النقيض**: حارسٌ على `dto.currency` وحدَه — «العملةُ هي الخطيرة». **يمسكه** تعديلٌ للسعر وحدَه.
- **الاختبار ④**: شراء 100 USD @3.70 مسدَّدٌ بـ100 USD @3.80 ⟵ `PATCH /purchases/:id {exchangeRate: 3.6}` **يُرفض `409`** برسالةٍ تحوي رقمَ الشراء، و
  `closing` للمورّد `0.00`، و`Δ5600 = −10.00` لا غير. ⟵ ثم `{currency:'SAR', exchangeRate: 1}` **يُرفض كذلك**. (**اليوم**: `200`، و`closing` يصير
  `10.00` مديناً.)

### F3 — B4: التطبيقُ يُسوّي الذمّةَ بسعر فاتورة التوريد، والفرقُ على `5600` — والعملةُ المخالفة تُرفض
- **الموضع**: `invoices.service.ts` `applyPrepayments()` (`:1305-1348`) — ونوعُ الوسيط `invoice` يُوسَّع بـ`currency` و`exchangeRate` (`created` يحملهما):
  1. بعد `:1322`: `if (doc.currency !== invoice.currency)` ⟵ `400` برسالةٍ جديدة تسمّي المستند (نظيرُ `allocation_currency_mismatch` — `messages.ts:121`).
  2. يُمرَّر إلى `postPrepaymentApplicationEntry` مبلغٌ جديد `settled = toBaseAmount(Number(doc.total), Number(invoice.exchangeRate))`.
- **وفي البانِي** (`auto-posting.util.ts:208-228`): سطرا `2450` و`2200` **كما هما بأساس المقدَّم**؛ ودائن `1200` **بـ`settled`**؛ و`fx = round2(gross − settled)`:
  موجبٌ ⟵ دائن `5600`، سالبٌ ⟵ مدين `5600`؛ و`FX_DIFFERENCE_ACCOUNT` يُضاف إلى `needCodes` حين `fx ≠ 0`.
  المثال: مدين `2450` 380 · مدين `2200` 57 · دائن `1200` 425.50 · **دائن `5600` 11.50**.
- **النقيض**: «حوّل كلَّ السطور بسعر فاتورة التوريد» — مدين `2450` 370 · مدين `2200` 55.50 · دائن `1200` 425.50. **متوازنٌ ويُنظّف `1200`** —
  لكنه يترك `2450` دائناً بـ10 و`2200` بفرقٍ 1.50 عن الإقرار (الذي يقرأ المقدَّمَ بسعره — `obligations.service.ts:659-660`).
- **الاختبار ⑤**: سند 115 USD @3.80 `unallocated: 'PREPAYMENT'` و`prepaymentTax: {taxCategory: 'S'}` (بنمط `test/prepayment.e2e-spec.ts:82`) ⟵ فاتورة
  USD @3.70 بسطر 100 وضريبة 15% و`prepaymentInvoiceIds: [386]` (بنمط `:104`). **التوكيد**: `closing` للعميل `'0.00'` · `Δ5600 = +11.50` ·
  سطرُ `2450` في الميزان صافيه `0.00` · `Δ2200` دائن `55.50`. ⟵ ثم مقدَّمٌ بالريال يُطبَّق على فاتورة USD ⟵ **`400`** يسمّي المستند.
  (**اليوم**: `closing = '-11.50'`، `Δ5600 = 0`، والعملةُ المخالفة `201`.)

### F4 — B5: قبضُ الإيجار بعملةٍ غير عملة العقد يُرفض
- **الموضع**: `contracts.service.ts` `recordPayment()` بعد `:471` — **قبل** قرار المسار (`:483`) وقبل أيّ كتابة: `if (payCurrency !== contract.currency)` ⟵ `400`
  مسمّى، على نمط `settlement.util.ts:171-175` («رفضٌ صريح خيرٌ من تخصيصٍ صامتٍ خاطئ» — `:170`).
- ⚠️ **قرارُ مالك لا تصحيحٌ صامت**: التعليقُ `:503-505` يعلن المسارَ مقصوداً. **والبديلُ الأكبر** (يُحتفظ بالقبض بعملةٍ أخرى): سعرٌ ثانٍ في الطلب
  لعملة العقد يومَ القبض، فتُترجَم الدفعةُ به لا بسعر العقد — لا يُبنى قبل قرار. **ويُعدّ القائمُ أولاً** (P6).
- **ويُسقط معه** E3 للإيجار (سعرُ القبض الافتراضيّ `?? contract.exchangeRate` لعملةٍ أخرى — `:471`).
- **النقيض**: «اشترط سعراً صريحاً لعملةٍ أخرى» — يرفض إن غاب `dto.exchangeRate` ويقبل `{currency:'SAR', exchangeRate: 1}`. **يمسكه** الاختبارُ نفسُه.
- **الاختبار ⑥**: عقد `RESIDENTIAL` بعملة USD @3.75 (بنمط `test/activities-currencies.e2e-spec.ts:306-322`) ⟵ `POST /contracts/:id/payments
  {installmentId, amount: 3800, currency: 'SAR', exchangeRate: 1, method: 'CASH', date}` ⟵ **`400`**، ولا صفَّ `rent_payments` جديداً (قائمةُ دفعات العقد)،
  و`4200`/`1200`/`5600` بلا حركة. ويبقى اختبارُ `:336-405` أخضرَ (لا يرسل `currency`).
  ⚠️ **المسارُ القائم لا يُبلغ في اختبارٍ حيّ بمستندٍ جديد** (التصنيفُ إلزاميّ) — فموضعُ الحارس **قبل** `:483` هو ما يغطّيه؛ **لم يُقَس** بناءُ عقدٍ قديمٍ
  في الاختبار (قيدُ `CHECK` على `createdAt`).

### F5 — B6: الردُّ يقرأ سعرَ يومه، والفرقُ على `5600`
- **الموضع**: `payments.service.ts` `refund()`: بعد `:554` `const cashRate = dto.exchangeRate ?? rate;` ورفضُ `dto.currency` المخالفة لعملة الإشعار؛
  `exchangeRate: cashRate` و`baseAmount: round2(-toBaseAmount(amount, cashRate))` (`:573-574`)؛ و`exchangeRate: cashRate` في `postAndSettle` (`:603`) —
  **و`baseReceivable` يبقى بسعر الإشعار** (`:607`). فيُخرج `postPartySettlementEntry` الفرقَ وحدَه: 100 USD بـ3.80 ⟵ دائن نقد 380 · مدين `1200` 370 ·
  **مدين `5600` 10**.
- **النقيض**: إبدالُ `rate` نفسِه في `:554` بـ`dto.exchangeRate ?? Number(note.exchangeRate)` — **سطرٌ واحد يبدو الإصلاحَ كلَّه**، فيقيّم الذمّةَ أيضاً بسعر
  اليوم: لا `5600`، و`1200` يبقى مديناً بـ10.
- **الاختبار ⑦**: فاتورة 100 USD @3.70 مسدَّدة بسندٍ @3.70 ⟵ `POST /invoices/:id/credit-note {reason}` ⟵ `POST /payments/refund {creditNoteId, date,
  method: 'CASH', amount: 100, currency: 'USD', exchangeRate: 3.8}`. **التوكيد**: `closing === '0.00'` · `Δ5600 = −10.00` · في قيد الردّ: سطرُ النقد
  دائن `380.00` و`1200` مدين `370.00`.

### F6 — B7 · B8 · B9: أولويةٌ أدنى — تحتاج حقلَ سعرٍ في الطلب
- **B7**: `PayClaimDto` يرث `CurrencyFieldsDto`، و`settleClaim` (`contracts.service.ts:1034`) يستدعي للتحصيل `postPartySettlementEntry` بـ`side: 'RECEIVABLE'`
  و`baseCash = toBaseAmount(claim.amount, dto.exchangeRate ?? claim.exchangeRate)` و`baseSettled = claim.baseAmount` و`unitId` — بدل `postClaimPaymentEntry`.
  **النقيض**: السعرُ الجديد للطرفين. **الاختبار**: مطالبة 100 USD @3.75 تُحصَّل @3.80 ⟵ `Δ5600 = +5.00` و`1200` للعميل يعود.
- **B8**: ردُّ الوديعة بسعر يوم التسوية (حقلٌ في `SettleDepositDto`)، والخصمُ «على الذمّة» يُدين `1200` **بسعر العقد** — والفرقان على `5600`. **النقيض**: تقييمُ
  `2300` بسعر العقد أيضاً (يترك `2300` برصيد). ⚠️ وفي البانِي عيبُ تقريبٍ منفصل بالقراءة (**لم يُقَس**): `baseAmount` يُقرّب مرّةً والأطرافُ الثلاثة كلٌّ على حدة
  (`contracts.service.ts:1129-1149`) فقد يختلّ القيدُ بهللة فيُرفض `400`.
- **B9**: سعرُ يوم الإلغاء لما يُردّ (`CancelContractDto` بلا سعر — `cancel-contract.dto.ts:17-86`).

---

## ٧) النفيُ ومسابيرُه (كلُّ صفرٍ بضابطٍ وجد)

| النفي | المسبار | الضابط الذي وجد |
|---|---|---|
| لا فحصَ عملةٍ في `applyPrepayments` | `sed -n 1305,1348p … \| grep -c currency` ⟵ **0** | المسبارُ نفسُه على `:1284-1294` ⟵ **2** |
| لا رسالةَ رفضٍ لعملة المقدَّم | Grep `prepayment_currency` على `messages.ts` ⟵ صفر | `allocation_currency_mismatch` ⟵ `:121` و`:903` |
| لا مسارَ لإعدام ذمّة | Grep بسبعة أنماط (إنجليزية وعربية حرفية) على `src` ⟵ **0 ملفات** | الأمرُ نفسُه بـ`postWriteOffEntry` ⟵ 3 ملفات |
| جدولُ الأسعار لا يقرؤه مسارُ تسوية | Grep `CurrenciesService\|currencies.service` خارج `currencies/` ⟵ **0** | Grep `CurrenciesService` ⟵ 3 ملفات في `currencies/` |
| لا حذفَ ولا عكسَ لدفعة إيجار | Grep `rentPayment\.(delete\|deleteMany\|update\|updateMany)` ⟵ نتيجةٌ واحدة `contracts.service.ts:583` (ختمُ `journalEntryId`) | Grep `rentPayment\.create` ⟵ `:519` |
| لا صفحةَ ويب ترسل سعراً | Grep `exchangeRate` على `apps/web/src/pages` ⟵ **0 ملفات** | على `apps/web/src` ⟵ ملفّان في `api/` |
| `assertBoxInBranch` لا يقارن العملة | **قُرئت الدالّةُ كلُّها** (`branches/branch-scope.util.ts:128-138`): تقارن الفرعين وحدهما | — (قراءةٌ لا مسبار) |
| `CancelContractDto` بلا سعر | قائمةُ حقوله كلُّها (Grep `!:\|?:` على الملف) ⟵ ثمانيةُ حقولٍ ليس منها سعر | الأمرُ نفسُه أظهر `cancelDate` و`unearnedDisposition` |
| `refund()` لا يقرأ `dto.exchangeRate` ولا `dto.currency` | **قُرئت الدالّةُ كلُّها** (`payments.service.ts:528-615`) | — |

---

## ٨) خارجُ الحدّ الضيّق — مرصودٌ بالقراءة

- **E1 — رصيدُ بنكٍ أجنبيّ الافتتاحيّ بلا تحويل**: `banks.service.ts:241` `delta: openingBalance` (بعملة البنك) و`:245` يكتب الرقمَ نفسَه على
  `account.openingBalance`، والتعديلُ كذلك (`:283` · `:293`) ⟵ `postOpeningDeltaEntry` لا يحوّل (`journal/opening-balance.util.ts:151-172`).
  بينما الصفُّ نفسُه يخزّن `baseOpeningBalance` صحيحاً (`:229`). **الإصلاحُ الأصغر**: `delta: toBaseAmount(openingBalance, exchangeRate)`. (P8)
- **E2 — ترحيلُ سطر كشفٍ لبنكٍ أجنبيّ بمبلغه الخام**: `banks/reconciliation.service.ts:187` `amount: Number(row.amount)` — والصفُّ يحمل `baseAmount`
  (`transactions/transactions.service.ts:93`) — ولا حارسَ عملةٍ في `bankOf` (`reconciliation.service.ts:49-54`) بخلاف تسوية الشبكة (D6). (P8)
- **E3 — سعرٌ افتراضيّ لعملةٍ أخرى**: `dto.exchangeRate ?? Number(contract.exchangeRate)` مع `dto.currency` مخالفة — القبض (`contracts.service.ts:470-471`)
  والوديعة (`:1063-1064`) والتقبيل (`:926-927`) والمطالبة (`:973-974`): ريالٌ بلا سعرٍ صريح على عقدٍ دولاريّ يُضرب في 3.75.
- **E4 — مرآةُ البنك بعملتين**: سندٌ بالدولار على صندوقٍ بالريال يزيد `bank.balance` بالمبلغ الدولاريّ (`auto-posting.util.ts:1544`؛ لا فحصَ عملةٍ في
  `payments.service.ts:161-171`) — **والاختبارُ القائم يفعلها** (`test/payments.e2e-spec.ts:277`، الصندوقُ `:95-97` بلا عملة). الدفترُ صحيح والمرآةُ لا.
- **حالةُ القسط بعملتين** (`contracts.service.ts:611-615`) — ذُكرت في B5.
- **تغطيةُ «على الحساب» بعملتين**: `openRemainingOf` يجمع متبقّي فواتير العميل بعملاتها كلِّها (`payments.service.ts:273-281`) — فسندٌ دولاريّ «على
  الحساب» يُغطّى بفواتيرَ ريالية ثم لا يمكن توزيعُه عليها (D7) ⟵ يبقى في `1200` بلا مخرج. **لم يُقَس.**

---

## ٩) ما لم يُقَس

1. **لم يُشغَّل أيُّ استعلام** — عددُ الصفوف المتأثّرة في أيّ قاعدةٍ مجهول؛ و(٥) مكتوبٌ للقائد، وصحّتُه النحوية بالقراءة.
2. **لم يُشغَّل أيُّ اختبار** — الأرقامُ في (٣) بحساب اليد على الصيغ المقتبَسة.
3. **نصُّ IAS 21 وIFRIC 22 لم يُقرأ** — ومنه سؤالٌ مفتوح في B4: هل يُقاس إيرادُ الجزء المدفوع مقدَّماً بسعر المقدَّم (فلا «فرقَ صرف» أصلاً)؟ الإصلاحُ F3
   مبنيٌّ على قاعدة المشروع (`CLAUDE.md §6.7`) لا على المعيار. **والمعاملةُ الضريبية** لفرق السعر بين المقدَّم والتوريد لم تُبحث.
4. **B10** (الشبكة) فرضيةٌ بالقراءة.
5. **هل تقرأ الأعمارُ مستندات العملة الأجنبية بالأساس** — لم يُقرأ `reports/receivables-exposure.util.ts`.
6. **كيف يُبلغ المسارُ القائم لقبض الإيجار في اختبارٍ حيّ** (عقدٌ `LEGACY_*` بعد قيد `CHECK`) — لم يُجرَّب.
7. **هل يقبل `createJournalEntry` سطراً صفرياً** — لم يُحتج إليه لأن F1 يقترح حذفَ سطر النقد الصفريّ لا إبقاءه.
8. **إن كان في الواجهة مسارٌ غيرُ الصفحات يرسل سعراً** (مكوّناتٌ خارج `pages/`) — المسبارُ غطّى `pages/` و`src` كلَّه (ملفّا `api/` فقط)، **فلا**؛ مذكورٌ للحدّ.

---

## مراجعةٌ عدائية (2026-09-27 بتقويم البيئة؛ ونصُّ المهمّة يذكر 2026-09-26)

> **المراجِع**: وكيلُ تحقّقٍ عدائيّ، قراءةٌ فقط. لم يُعدَّل ملفٌّ في المستودع، ولم يُشغَّل `jest`/`vitest`/`playwright`/`tsc`/`prisma`، **ولا استعلامُ SQL**.
> **الشجرة**: `D:\mad-app` صار عند `034f94db` لا `56ae0157` — و`git diff --stat 56ae0157 034f94db` يُظهر ملفَّين فقط
> (`.claude/hooks/block-shell-text-writes.mjs` و`apps/api/src/common/hooks-present.spec.ts`) — **فكلُّ أرقام الأسطر أدناه صالحةٌ على الالتزامَين**.
> **كلُّ موضعٍ أدناه فُتح في هذا التشغيل** (`awk` بأرقام الأسطر). والحسابُ الوحيد الذي شُغّل: نسخةٌ حرفيّةٌ من `roundTo`/`shiftDecimal`
> (`common/money/rounding.ts:63-66` و`:88-94`) في `node -e` لا تكتب ملفاً — **لم تُشغَّل شيفرةُ المشروع نفسُها**.
> **صفحاتُ الويب** (قراءةٌ فقط، بلا تواصل): (١) `https://www.ifrs.org/issued-standards/list-of-standards/ifric-22-foreign-currency-transactions-and-advance-consideration/`
> — `HTTP 200`، `109,901` بايت — وجُملةُ «IFRIC 22 clarifies which exchange rate to use…» وُجدت حرفاً في HTML الخام، لكن الصفحة **ملخّصٌ لا نصُّ التفسير**.
> (٢) `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018R0519` (لائحة المفوضية (EU) 2018/519 التي تعتمد IFRIC 22) — `HTTP 200`،
> `38,657` بايت عبر `curl`؛ **وأداةُ `WebFetch` أعادتها فارغةً مرّتين** فلم يُقبل ذلك صمتاً وقُرئ HTML الخام. منها: الفقرة ١ (خلفية) والفقرة ٤ (النطاق)
> والفقرة ٨ (الإجماع). ⚠️ **ولم يُقرأ ما يُلزم به التاجرَ السعوديَّ** (اعتمادُ الهيئة السعودية للمراجعين والمحاسبين لـIFRS أو IFRS للمنشآت الصغيرة) — **لم يُقَس**.
> **حدُّ الاقتباس**: نصوصُ المعيار محميّةٌ بحقوق المؤسسة، فيُقتبس منها سطرٌ واحد قصير ويُعاد صوغُ الباقي مع رقم الفقرة.

### ١) الادّعاءاتُ واحداً واحداً

| # | الادّعاء (بموضع المؤلّف) | الحكم | الدليلُ في هذا التشغيل |
|---|---|---|---|
| 1 | `maintenance.service.ts:166` `dto.exchangeRate ?? 1` و`:187` `\|\| 'SAR'` | **ثابت** | السطران حرفاً |
| 2 | الفرقُ يُرحَّل في بانيَين فقط: `postRentPaymentEntry` (`:959-1008`، `:971`، `:989-994`) و`postPartySettlementEntry` (`:1278-1309`، `:1286`، `:1296`) | **ثابت — وبمسبارٍ أقوى** | Grep `FX_DIFFERENCE_ACCOUNT\|'5600'` على `src` (بلا `spec`) ⟵ الثابتُ `:72` والدليلُ `default-chart.ts:94` والأسطرُ `:978` `:991` `:993` `:1289` `:1296` لا غير. ومستدعو البانيَين: `contracts.service.ts:491` `:572` و`auto-posting.util.ts:1569` `:1606` (غلافا القبض والصرف) ثم `payments.service.ts:701` و`supplier-payments.service.ts:351` |
| 3 | `createJournalEntry` يرفض فرقاً > `0.001` (`journal-posting.util.ts:199-203`) | **ثابت** | وكذلك `totalDebit <= 0` |
| 4 | `ق-١٤٦٦`: `resolveAccountIds` يرمي `409` (`:28-34`)، الصنفُ `:37-45`، و`5600` في `needCodes` (`:978`، `:1289`)، والالتزام `b96a55e8` | **ثابت** | `ConflictException` = `409`؛ والالتزامُ في `git log` بعنوان `(ق-١٤٦٦)` |
| 5 | لا صفحةَ ويب ترسل `exchangeRate` | **ثابت — ويُزاد** | `pages/` ⟵ صفر؛ `src` ⟵ `api/payments.ts` و`api/supplierPayments.ts`، **وكلا الموضعَين أنواعُ ردٍّ** (`:29-30` و`:35-36`) لا حقولُ إرسال. **والصفحاتُ لا ترسل `currency` أيضاً**: أربعُ إصاباتٍ في `pages/` كلُّها عرضٌ أو اختبار (`InvoiceBuilderView.tsx:305` يعرض عملةَ المقدَّم) |
| 6 | أعدادُ `claim-g.md` ٨٣ و`claim-b.md` ٥ و`claim-c.md` ١ والبقيّة صفر | **ثابت — والنمطُ لم يُكتب** | أُعيد إنتاجُها بالنمط `5600\|صرف\|exchangeRate\|fx\|FX` (`LC_ALL=C.UTF-8`)؛ وبنمطٍ أوسع يضمّ «عملة» يصيب `claim-e.md` مرّتين، وكلاهما خارجُ الموضوع (`:150` و`:162`). ومراجعتُه ع-١…ع-٦ موجودة، وع-٧ صفر |
| 7 | `toBaseAmount` (`base-amount.util.ts:21-23`) والتعليق «deliberately taken from the caller» (`currency-fields.dto.ts:9`) | **ثابت** | — |
| 8 | «لا مسارَ تسويةٍ يقرأ جدولَ الأسعار» (مسبارُ اسم الخدمة) | **ثابت — بمسبارٍ على الاسم الصحيح** | مسبارُ المؤلّف يبحث عن اسم الخدمة لا عن النموذج (`§8.16`). أُعيد على النموذج: `\.exchangeRate\.(find\|create\|update\|…)` ⟵ `currencies.service.ts:145-150` وحدَه (ضابطٌ وجد) — فلا قارئَ آخر |
| 9 | `lockAndAssertAllocationsFit` `:145-186`، رفضُ العملة `:171-175`، الخريطة `:183-185`؛ `baseSettledOf` `:193-203`، `:201` | **ثابت** | — |
| 10 | A1 (`payments.service.ts:175-180` · `:235` · `:706` · `:701-715`) واختبارُه `test/payments.e2e-spec.ts:271-293` | **ثابت** | — |
| 11 | A2 (`:431-512`، `:441`، `:498`، `:455-467`) والتعليق `:453-454` | **ثابت** | الاقتباسُ مقطوعٌ عند «إلى ما كان» والسطرُ يكمل «: الحسبةُ نفسُها…» — قطعٌ لا تحريف |
| 12 | A3/A4 (`supplier-payments.service.ts:153-158` · `:190` · `:356` · `:267-280` · `:305-318`) واختبارُه `:287-297` | **ثابت** | — |
| 13 | A5/A6 (`contracts.service.ts:485` · `:502` · `:572-581`؛ `rent-accrual.util.ts:134-137`) واختبارُه `activities-currencies.e2e-spec.ts:355-405` | **الشيفرةُ ثابتة؛ وتصنيفُها (أ) مطعونٌ فيه** — انظر (٢-أ) | — |
| 14 | D1 (`pos.service.ts:807-819`، `payments.service.ts:352`) | **ثابت** | — |
| 15 | D2 (`invoices.service.ts:1041-1044` · `:1068-1072`) وD2' (`supplier-notes.service.ts:126` · `:164-167`؛ `purchases.service.ts:265-267`) | **ثابت** | — |
| 16 | D3 (`:348` · `:397` · `:406-408`) وD4 (`:751-759` · `:768-786`) وD5 (`purchases.service.ts:500-501`) وD6 (`banks.service.ts:92-93` · `network-settlements.service.ts:157-160`) | **ثابت** | — |
| 17 | D8 «**لا مسارَ لإعدام ذمّة**» | **مردودٌ جزئياً** | مسبارُ المؤلّف السباعيّ صفرٌ فعلاً (وضابطُه `postWriteOffEntry` ⟵ ٣ ملفات، **وكلُّها شطبُ مخزون**). **لكن للإيجار مسارُ إسقاط ذمّة**: `POST contracts/:id/claims/:claimId/waive` (`contracts.controller.ts:236`) ⟵ `waiveClaim` (`contracts.service.ts:1012-1016`، تعليقُه «Writes a claim off») ⟵ `postClaimWaiverEntry` (`auto-posting.util.ts:1889-1912`): مدين `4300` / دائن `1200`. فاتته الصياغةُ «Writing off / Writes … off / إسقاط». **وحكمُ (د) يبقى**: الإسقاطُ بـ`claim.baseAmount` بلا نقد، فلا فرقَ صرف |
| 18 | D9 (`rent-accrual.util.ts:134` · `:338`) | **ثابت** | — |
| 19 | D10: نموذج `Account` `:1198-1251` بلا عملة | **ثابتٌ حكماً؛ المدى مردود** | النموذج ينتهي `:1258` لا `:1251`؛ والعدُّ على المدى الكامل `1198-1258` ⟵ `currency` = **0** (ضابط `openingBalance` = 2) |
| 20 | B1 (`:385-416`، `:400`، `:401-406` مرميّة، `:409`، `:182-201`، `:196`) ومثالُه في (٣) | **ثابت** | الحسابُ أُعيد يداً: `1200` = −10 ثم 360، و`5600` خسارةٌ شبحية 10 |
| 21 | B2 (`:207-237`، `:219`، `:220-225`، `:228-230`، التعليق `:202` حرفاً) | **ثابت** | — |
| 22 | B3 (`purchases.service.ts:252-424`، `:262-263`، `:264-273`، `:302-307`، `:312-316`، `:315`، `:399-416`) ومثالُه | **ثابت** | `2100` = +10 ثم −350، و+270 بتبديل العملة |
| 23 | B4 (`invoices.service.ts:1305-1348`، `:1245-1249`، `:1268`، `:1332`، `:1341-1343`، `:1325`) والمسباران | **ثابت** | أُعيد المسبار ⟵ `0` والضابط ⟵ `2`؛ والمستدعي الوحيد `:719` بلا فحصٍ قبله، و`prepaymentInvoiceIds` لا يظهر إلا في `create-invoice.dto.ts:63` و`:719` و`:1309-1311` |
| 24 | B5 (`:440-627`، `:485`، `:486`، `:490-509`، `:503-505` حرفاً، `:541-584`، `:611-615`؛ `rent-tax-point.util.ts:58` · `:95-100`؛ `rent-accrual.util.ts:85-90` · `:301-307`؛ `auto-posting.util.ts:929-934` حرفاً) | **ثابت** | أرقامُ المثال حُسبت بنسخة `round2`: `13.33` · `49.99` · `2.00` · `57.49` · `7.50` · `1165.33`. ⚠️ ومثالُ «يُدفع 3700» يفترض قسطاً حلّ؛ لو سبق القبضُ الاستحقاقَ فنقطةُ `PREPAYMENT` بـ`986.67` (أساس `3700.01`) ثم نقطةُ `DUE` بالباقي `13.33` عند الحلول (`rent-accrual.util.ts:198-206` · `:230`) — **فالنتيجةُ واحدة (+50 في `1200` والقسطُ `PAID`) وإن اختلف توقيتُها** |
| 25 | B5: «ويقرؤها الإقرارُ من صفوف `rent_accruals` الخاضعة (`obligations.service.ts:589-592`)» | **الحكمُ ثابت؛ الموضعُ مردود** | `:584-594` دالّةُ **حدّ الفترة الشهرية** لا الإقرار. الإقرارُ يقرأ الإيجارَ في `rentSection` (`obligations.service.ts:958-967`): `standardVat` = مجموعُ `baseTax` للصفوف `taxable` — فصفُّ `UNLINKED` الخاضع يدخل الإقرار فعلاً |
| 26 | B6 (`:528-615`، `:554`، `:572-574`، `:603`، `:607`؛ `RefundDto extends CurrencyFieldsDto` `payment.dto.ts:131`) وقائمةُ ما يُقرأ من الطلب | **ثابت** | قُرئت الدالّة كلُّها: `creditNoteId` `:532` · `method` `:541` · `bankId` `:542` · `amount` `:549` · `date` `:555` · `reference` `:570` · `notes` `:571` — ولا `currency` ولا `exchangeRate` |
| 27 | B7 (`:1018-1044`، `:1031`، `postClaimPaymentEntry` `:1871-1887`، `PayClaimDto` `claim.dto.ts:31-34`) | **ثابت** | — |
| 28 | B8: «الخصمُ على الذمّة **يُدين** `1200`» | **الاتجاهُ مردود؛ الحكمُ ثابت** | `postDepositSettlementEntry` **يُقيّد `1200` دائناً** (`auto-posting.util.ts:1728`) — يُنقص ذمّةَ المستأجر. والفرقُ بين سعر الوديعة وسعر الذمّة يبقى في `1200` كما قال. (وF6-B8 «يُدين `1200` بسعر العقد» يُقرأ «يُقيّده دائناً») |
| 29 | B8: عيبُ تقريبٍ «لم يُقَس» (`contracts.service.ts:1129-1149`) | **ثابتٌ حسابياً** | بنسخةٍ حرفية من `roundTo`: وديعة `0.03` بسعر `1.5`، وخصمٌ على الذمّة `0.01` وعلى الدخل `0.01` وردٌّ `0.01` ⟵ مدين `2300` = `0.05` ودائنٌ `0.02+0.02+0.02` = `0.06`، والفرقُ `0.01 > 0.001` ⟵ `journal_entry_unbalanced` (`journal-posting.util.ts:201-202`). **لم يُشغَّل المسارُ الحيّ** |
| 30 | B9 (`:389-400`، `postDeferredSettlementEntry` `:1769-1787`، حقولُ `CancelContractDto` الثمانية) | **ثابت** | الحقولُ `:20` `:24` `:30` `:46` `:51` `:59` `:64` `:86`؛ و`:10` `:14` لصنف `SettlementLineDto` |
| 31 | B10 (`payments.service.ts:161-167`؛ `network-settlements.service.ts:181` · `:183`) | **ثابتٌ قراءةً — لم يُقَس** | الإجماليُّ من سطور `1251` (`:66-81` ثم `:181`) |
| 32 | (٣) أمثلة B1–B6 بحساب اليد | **ثابت** | أُعيد كلُّ سطرٍ يداً وبالنسخة الحرفية لـ`round2` |
| 33 | (٤) «مطابقةُ الأعمار تعرض الرصيدَ اليتيم فرقاً غيرَ منسوب» — «ولم يُقَس هل تقرأ الأعمارُ بالأساس» | **ثابت؛ والمجهولُ مقيسٌ الآن قراءةً** | `reports/receivables-exposure.util.ts:229-232`: متبقّي الفاتورة = `baseTotal` − التخصيصات × **سعر الفاتورة** + الإشعارات بأساسها؛ و`:206-215`: غيرُ المخصَّص × **سعر السند**. فالأعمارُ بالأساس، ورصيدُ B1 اليتيم يظهر فرقاً لا صفّاً |
| 34 | `reports.service.ts:980-987` (الكشف) و`:901-904` (الميزان) | **ثابت** | ⚠️ كشفُ المورّد `side = 'credit'` (`:982`) فرصيدُ B2/B3 المدين يظهر **سالباً** في `closing` — «`10.00` مديناً» في F2 يُقرأ `-10.00` نصّاً، **لم يُقَس** شكلُ النصّ |
| 35 | (٥) أسطرُ `@@map` التسعة عشر و`baseCurrency` `:458` | **ثابت** | كلُّها حرفاً |
| 36 | (٥) قيمُ التعدادات السبعة | **ثابت** | وأُضيف `ContractStatus {DRAFT, UPCOMING, DUE, LATE, CANCELLED}` الذي يستعمله P7 |
| 37 | (٥) أسطرُ `FORCE` في الهجرات | **ثابت** | الأسطرُ السبعة حرفاً؛ و`accounts`/`journal_*` تحت `FORCE` في خمس هجرات، و`companies` بلا `ENABLE`/`FORCE` (صفرٌ بضابط `payments` الذي وُجد) |
| 38 | (٥) الأعمدةُ المستعملة في P0–P8 | **ثابتٌ وجوداً — لم يُنفَّذ** | كلُّ عمودٍ موجودٌ في نموذجه (منها `companyId` على `contract_claims`/`contract_deposits`، و`matchedLineId`/`entryNo`، و`reversesId` على الجدولَين). ومذكّرةُ P3 تطابق `postReversalEntry` لأنه يمرّر `memo` كما هو (`auto-posting.util.ts:122`). ⚠️ `deposits_rate_ne_contract` في P7 **يعدّ أكثرَ ممّا يُحدث أثراً**: الأثرُ في `1200` لا يقع إلا لوديعةٍ عليها خصمٌ «على الذمّة» |
| 39 | P2 بعنوان «**شبحُ B1/B4**» | **مردودٌ جزئياً** | سندٌ أصدر مستندَ 386 **لا يُعكس ولا يُعاد توزيعُه**: `assertNoPrepaymentInvoice` في `reverse` (`payments.service.ts:437`) وفي `allocate` (`:390`)، وتعريفُها `:374-377`. فشبحُ العكس لـB1 وحدَه، **ورصيدُ B4 لا يزول بعكسٍ ولا يُنشئ شبحاً** |
| 40 | (٦) F1 «لا يلزم تغييرُ العكس» | **ثابت** | مجموعُ فروق الإنشاء والتسويات = `cash − settled(الحالي)`، والعكسُ يعيده بإشارةٍ معاكسة ⟵ `5600` صفر |
| 41 | (٦) F1 — الاختبار ②: «**اليوم** `closing` بعد التوزيع `380.00` و`Δ5600 = +10`؛ **والنقيض** `360.00` و`+30`» | **مردود — الرقمان مقلوبان** | الفاتورتان 370 + 360 مديناً، والسندُ دائنٌ 370 ⟵ **اليوم** `1200` = **`360.00`** (لا 380) و`Δ5600 = +10`. **والنقيض**: `before` بعد الحذف = `100 × 3.80 = 380`، `after = 360`، `delta = −20` ⟵ مدين `1200` 20 ودائن `5600` 20 ⟵ **`380.00`** و`+30`. والمتوقَّعُ بعد الإصلاح (`370.00`، `+20`، ثم `730.00`، `0.00`) **ثابت** |
| 42 | (٦) F1 الاختبار ① و③، وF2 ④، وF5 ⑦، وF6 (B7 `+5.00`) | **ثابتٌ حساباً** | أُعيدت يداً |
| 43 | (٦) F3 — «الفرقُ على `5600`» | **مردودٌ بالمعيار (IFRS الكامل)** | انظر (٢-ب) |
| 44 | (٦) F5 — تخزينُ `exchangeRate: cashRate` على صفّ الردّ (`:573-574`) | **مردودٌ كما صيغ — أثرٌ جانبيّ فاته** | صفُّ الردّ **بلا تخصيصات** (`:557-576`)، والأعمارُ تحوّل غيرَ المخصَّص بـ**سعر الصفّ** (`receivables-exposure.util.ts:214`). فبعد F5 يُحسب «غيرُ المخصَّص» `+100 × 3.80 = 380` بينما `1200` مُدِين بـ`370` ⟵ **فرقٌ غيرُ منسوب 10 في مطابقة الأعمار يصنعه الإصلاح نفسُه**. المخرج: يبقى سعرُ الصفّ سعرَ الإشعار ويُمرَّر `cashRate` إلى `postAndSettle` وحدَه (مع حقلٍ لتخزينه إن لزم)، أو تُعدَّل الأعمار — قرارُ بناء |
| 45 | (٦) F1 الخطوة ٤ — «هل يقبل `createJournalEntry` سطراً صفرياً» (مجهول ٧) | **مقيسٌ قراءةً** | لا رفضَ: الفحصُ على المجموعَين وحدهما (`:199-203`) والكتابةُ لكلّ سطرٍ كما هو (`:243-248`)؛ ولا قيدَ `CHECK` على `debit`/`credit`: Grep `CHECK.*(debit\|credit)` على الهجرات ⟵ صفر، وضابطُه (قيودُ المفاتيح على `journal_lines`) وجد. فحذفُ السطر الصفريّ في F1 **لازمٌ** لا تجميل — وإلا كُتب سطرُ نقدٍ صفريّ في الدفتر |
| 46 | (٧) جدولُ النفي | **ثابت إلا D8** | أُعيدت المسابيرُ كلُّها بضوابطها؛ و`rentPayment\.(delete\|…)` أُضيف له بحثٌ عن SQL خام (`DELETE FROM`/`UPDATE "rent_payments"`) ⟵ صفر، وضابطُه (`"rent_payments"` في `rent-recognition.service.ts:115` وغيره) وجد |
| 47 | (٨) E1 (`banks.service.ts:229` · `:241` · `:245` · `:283` · `:293`؛ `opening-balance.util.ts:151-172`) وE2 (`reconciliation.service.ts:187` · `:49-54`؛ `transactions.service.ts:93`) وE3 (`:470-471` · `:1063-1064` · `:926-927` · `:973-974`) وE4 (`auto-posting.util.ts:1544`؛ `payments.e2e-spec.ts:277` · `:95-97`) | **ثابت** | «التقبيل» هنا هو `recordKeyMoney` (`:912-957`) |
| 48 | (٨) «تغطيةُ على الحساب بعملتين» (`payments.service.ts:273-281`) | **ثابتٌ قراءةً** | `select: { id, total }` بلا عملة |
| 49 | الإشارةُ إلى `SPEC.md:81` | **ثابت** | الصفُّ حرفاً: `\| 3.10 \| فروق العملة (ربح/خسارة) \| ⬜ \| 🟨 *(مسار الإيجار فقط)* \| 🟠 \|` |

### ٢) ما يطعن في الاستنتاجات لا في المواضع

**(٢-أ) A5/A6 «صحيحٌ على `5600`» — بسعر توقيع العقد لكلّ قسط.** كلُّ نقطة استحقاقٍ تُقيَّم بـ`contract.exchangeRate`
(`rent-accrual.util.ts:134`، ومثلُه `:338`) أيّاً كان تاريخُها — قسطُ السنة الثالثة بسعر يوم التوقيع. وقاعدةُ المشروع نفسُها تقول
«**سعر الصرف وقت العملية**» (`CLAUDE.md:1389`)، والفقرةُ ١ من IFRIC 22 (خلفية، EUR-Lex) تنقل عن الفقرة ٢٢ من IAS 21 أن تاريخَ المعاملة
هو التاريخُ الذي تستوفي فيه المعاملةُ شروطَ الاعتراف أوّلاً. ⟸ **ما يُرحَّل على `5600` في A5/A6 يحمل انجرافَ السعر بين التوقيع والاستحقاق**،
وهذا جزءٌ من قياس الإيراد عند الاستحقاق لا فرقُ تسوية. **ودفعةُ الإيجار قبل الاستحقاق** (نقطة `PREPAYMENT`) مقابلٌ مقدَّم بنصّ نطاق
IFRIC 22 (الفقرة ٤)، فإيرادُها يُقاس بسعر يوم القبض ولا فرقَ صرفٍ أصلاً (الفقرة ٨) — والشيفرةُ تُنشئ ذمّةً بسعر العقد وتسوّيها في اللحظة
نفسِها بفرقٍ على `5600`. **والاختبارُ `activities-currencies.e2e-spec.ts:355-405` يثبّت هذا التصميم عقداً** (`toBeCloseTo(-50)` عند `:371`).
⟵ **ليس «مكسوراً» بمعيار المشروع المكتوب ضيّقاً** (`§6.7`: «بين تاريخ الفاتورة وتاريخ السداد»)، **لكنه مطعونٌ فيه** بقاعدة «وقت العملية»
وبالمعيار؛ والحسمُ قرارُ مالك بعد معرفة الإطار الملزِم — **لم يُقَس**.

**(٢-ب) F3 (B4) يضع الفرقَ على `5600`، والمعيار يضعه في الإيراد.** مستندُ 386 التزامٌ غيرُ نقديّ نشأ من مقابلٍ مقدَّم (`2450`). والفقرة ٨ من
IFRIC 22 تجعل تاريخَ المعاملة لقياس الإيراد المقابل هو «the date on which an entity initially recognises the non-monetary asset or
non-monetary liability» (EUR-Lex، قسم CONSENSUS، الفقرة 8). ⟸ **إيرادُ الجزء المدفوع مقدَّماً يُقاس بسعر المقدَّم (3.80 ⟵ 380) ولا «فرقَ صرف»**؛
فـ`11.50` في المثال = فرقُ إيرادٍ `10` + فرقُ ضريبةٍ `1.50`، لا ربحُ صرف. **ونقيضُ المؤلّف** («حوّل كلَّ السطور بسعر التوريد») مردودٌ كذلك.
والمعالجةُ الضريبية لفرق `1.50` **لم تُبحث** (ولم يبحثها المؤلّف — مجهولُه ٣). ⚠️ **الرصيدُ اليتيم في `1200` نفسُه ثابت** — المطعونُ فيه **وجهةُ الإصلاح**.

**(٢-ج) F1 للمورّد حين يسبق السندُ الشراءَ.** مثالُ B2 نفسُه (سندٌ بلا تخصيص ثم شراء) صورةُ **دفعةٍ مقدَّمة لمورّد**: `create` للمورّد لا يشترط
تغطيةً بمشترياتٍ مفتوحة (`supplier-payments.service.ts:135-199` — لا نظيرَ لـ`payment_on_account_uncovered`)، بخلاف العميل الذي يُلزَم بها
(`payments.service.ts:195-201`، فـB1 للعميل ذمّةٌ نقديةٌ و`5600` فيه صحيح). ⟸ **إن كان السندُ مقدَّماً فبنصّ IFRIC 22 يُقاس المصروفُ بسعره ولا فرقَ**؛
وF1 يُرحّل الفرقَ على `5600`. ⚠️ **وتوقيتُ F1**: الفرقُ يُرحَّل **بيوم التوزيع** وقد نشأ يومَ القبض — فيقع في فترةٍ لاحقة، وقفلُ فترة القبض لا يمسّه.

### ٣) ما فاته القياس

| # | الفائت | الموضع (مقروءٌ في هذا التشغيل) | الأثر |
|---|---|---|---|
| M1 | **عملةٌ أجنبية بلا سعرٍ صريح تُسعَّر `1` بصمت — في كلّ مستند** | `resolveCurrency` (`common/currency/base-amount.util.ts:34-39`، السطر `:37` `exchangeRate ?? DEFAULT_EXCHANGE_RATE`)؛ والمستدعون التسعة: `banks.service.ts:207` · `contracts.service.ts:185` · `invoices.service.ts:553` · `journal-posting.util.ts:221` · `payments.service.ts:157` · `purchases.service.ts:122` · `supplier-payments.service.ts:139` · `quotes.service.ts:134` · `transactions.service.ts:73`. والـDTO لا يربط السعرَ بالعملة (`currency-fields.dto.ts:18-27`). **نفيٌ بمسبار**: لا مفتاحَ رسالةٍ يطلب سعراً لعملةٍ أجنبية (Grep `-a` على مفاتيح `rate`/`currency` في `messages.ts` ⟵ أحد عشر مفتاحاً ليس منها ذلك، وضابطُه `allocation_currency_mismatch` `:121` وُجد). **ولا تُفحص العملةُ مقابلَ جدول `currencies`**: `currency_not_found` لا يُرمى إلا في `currencies.service.ts:67` و`:93` | **الوجهُ المعاكس للموضوع — فرقٌ يصل `5600` وهو ليس فرقاً**: فاتورة 100 USD بلا سعر ⟵ أساسُها 100؛ ثم سندٌ 100 USD @3.75 مخصَّصٌ عليها ⟵ `fxGain = 375 − 100 = +275` على `5600` (`auto-posting.util.ts:1286`). وE3 عند المؤلّف حالةٌ خاصّةٌ منه (الافتراضيُّ هناك سعرُ العقد لا `1`) |
| M2 | **النقدُ الأجنبيّ في البنك/الصندوق لا يُحقَّق فرقُه أبداً** | لا مسارَ إعادة تقييم: Grep `revalu\|unrealized\|unrealised\|إعادة التقييم\|إعادة تقييم\|غير المحقق\|غير محقق` على `src` ⟵ إصابةٌ واحدة كاذبة (`xades.util.ts` — «signatu**reValu**e»)، وضابطُه `realized\|محقَّق` وجد ٤ ملفات. والنقدُ يُقيَّد في كلّ حركةٍ بسعر يومها (`:706`، `:356`، `:502`/`:577`) | حسابُ الأستاذ لبنكٍ بالدولار يتراكم بأسعارٍ تاريخيةٍ مختلطة؛ **فإذا فُرّغ الرصيدُ الدولاريّ بقي في حساب البنك رصيدٌ بالريال** — فرقُ صرفٍ محقَّقٌ على بندٍ نقديّ **لا يصل `5600`**. صنفٌ كاملٌ غائبٌ عن جدول (٠)؛ ويقترن بـE1 وE4 |
| M3 | **سعرٌ متقادمٌ يُورَث** | عرضُ السعر ⟵ الفاتورة: `issueDate: today` مع `exchangeRate: Number(quote.exchangeRate)` (`quotes.service.ts:254-264`)؛ تجديدُ العقد يرث سعرَ الأصل (`contracts.service.ts:720`)؛ واستحقاقاتُ الإيجار كلُّها بسعر العقد (`rent-accrual.util.ts:134` · `:338`) | يخالف «سعر الصرف وقت العملية» (`CLAUDE.md:1389`)؛ الذمّةُ والضريبةُ بالريال تُقاس بسعر يومٍ آخر، **والفرقُ المرحَّل على `5600` عند السداد يتضخّم بما ليس تسويةً**. (والفاتورةُ المحوَّلة مستندٌ ضريبيّ — أثرُه على مبلغ الضريبة بالريال **لم يُبحث**) |
| M4 | **إيداعُ نقدٍ في بنكٍ بعملةٍ أخرى بلا حارس** | `cash-deposits.service.ts:66-92`: البنكُ يُقرأ بلا `currency` (`:71`)، ولا فحص (Grep `currency` على الملف ⟵ صفر؛ ضابطُه على `banks.service.ts` وجد)؛ ثم المطابقةُ تقارن `deposit.amount` بـ`row.amount` خاماً (`reconciliation.service.ts:175`) | من عائلة E2/D6 — مبلغٌ بوحدةٍ خاطئة؛ ونظيرُه (نقلُ الصندوق وتسويةُ الشبكة) محروس |
| M5 | **تخلّفُ الوثيقتين عن الشيفرة في `3.10`** | `CLAUDE.md:341` («فروق 5600 على مسار سداد الإيجار فقط (`auto-posting.util.ts:154-170`)») و`SPEC.md:81` (🟨 «مسار الإيجار فقط») — بينما A1/A3 مبنيّان (`ق-٨٧١`) ومُختبَران؛ و`auto-posting.util.ts:154-170` اليوم **`postInvoiceEntry` ومستندُ 386** لا الإيجار | إحالةٌ ميتة ونطاقٌ ناقص في الوثيقة الحاكمة؛ يُصحَّح مع أيّ طلبٍ يوسم `[SPEC 3.10]` |
| M6 | (خارجُ الحدّ) **ذمّةُ تسوية الإلغاء بلا مسار تحصيل** | `postContractSettlementEntry`: مدين `1200` بسعر العقد (`auto-posting.util.ts:1818-1826`)؛ و`recordPayment` يرفض العقدَ الملغى (`contracts.service.ts:449`)؛ ولا قارئَ آخر لـ`settlementAmount` (Grep ⟵ `contracts.service.ts` وحدَه؛ ضابطُه `settlementEntryId` وجد المطالبات والودائع) | لا تُحصَّل إلا بخصم وديعةٍ «على الذمّة» (B8، بسعر الوديعة) — **فلا فرقَ صرفٍ يُحسب لها أصلاً**. مرصودٌ قراءةً، **لم يُقَس** |

### ٤) الخلاصةُ المصحَّحة

- **ثابتٌ كما كُتب**: البانيان الوحيدان؛ B1–B10 مواضعَ وآلياتٍ؛ D1–D7 وD9؛ E1–E4؛ الأمثلةُ الحسابية؛ الجداولُ والأعمدةُ والتعداداتُ وأسطرُ `FORCE`؛ ومسابيرُ النفي (بضوابطها) إلا D8.
- **مردود**: (١) أرقامُ «اليوم» و«النقيض» في اختبار F1 ② مقلوبة — اليوم `360.00`، النقيض `380.00`؛ (٢) D8 «لا مسارَ لإعدام ذمّة» — إسقاطُ مطالبة الإيجار مسارٌ قائم (بلا أثر صرف)؛
  (٣) «شبح B4» — سندُ 386 لا يُعكس ولا يُوزَّع؛ (٤) B8 «يُدين `1200`» — يُقيّده دائناً؛ (٥) موضعُ قراءة الإقرار للإيجار `:958-967` لا `:589-592`؛
  (٦) مدى نموذج `Account` حتى `:1258`؛ (٧) وجهةُ F3 (`5600`) تخالف IFRIC 22 الفقرة ٨؛ (٨) F5 كما صيغ يكسر مطابقةَ الأعمار بفرق 10.
- **مُجاب قراءةً بعد أن كان مجهولاً**: الأعمارُ بالأساس (مجهول ٥)؛ لا رفضَ لسطرٍ صفريّ (مجهول ٧)؛ عيبُ تقريب الوديعة واقعٌ حسابياً (B8).
- **مطعونٌ فيه بقرار مالك**: تصنيفُ A5/A6 (أ) — سعرُ التوقيع لكلّ قسط، والمقدَّمُ من الإيجار (IAS 21 ¶22 منقولةً في IFRIC 22 ¶1، وIFRIC 22 ¶4 و¶8، و`CLAUDE.md:1389`).
- **فائت**: M1 (سعر `1` الصامت — فرقٌ مصنوعٌ على `5600`)، M2 (النقدُ الأجنبيّ بلا تحقيقٍ ولا تقييم)، M3 (السعرُ الموروث)، M4، M5، M6.
- **لم يُتحقَّق**: صحّةُ استعلامات (٥) تنفيذاً وأعدادُها؛ أيُّ مسارٍ حيّ (بلا اختبار ولا طلب)؛ B10؛ الإطارُ المحاسبيّ الملزِم للتاجر السعوديّ؛
  المعالجةُ الضريبية لفرق B4 وB5؛ شكلُ نصّ `closing` السالب في كشف المورّد.
