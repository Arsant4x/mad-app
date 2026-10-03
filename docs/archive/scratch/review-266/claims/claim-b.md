# الدعوى (ب) — الترحيلُ الآليّ يرجع فارغاً إن نقص حسابٌ في الدليل

> **المصدر المقروء:** `D:\worktrees\outbox-266` (main + تغيير الطابور، غير متّصل بالموضوع). كلُّ إحالة `ملف:سطر` نسبيّةٌ إلى هذا الجذر.
> **حدُّ العمل:** قراءةٌ وبحثٌ فقط — لا اختبار ولا `prisma` ولا `docker` ولا قاعدة. كلُّ رقمٍ عن البيانات في القسم ٦ **استعلامٌ مقترح لم يُشغَّل**.
> **الحكم المبدئي:** **قائمةٌ بالقراءة (الآلية حتمية وقابلة للبلوغ من شاشة المالك)؛ وحجمُ أثرها على البيانات غير محسوم حتى يُقاس.**

---

## (1) الدعوى بنصّها

> «ب. الترحيلُ الآليُّ يرجع فارغاً إن نقص حسابٌ في الدليل. ⇒ يُرفض المستندُ برسالة ولا يمرّ بلا قيد، وأعلن عددَ القائم بلا قيد.»

وسؤالُ المهمّة: حين يغيب حسابٌ مطلوب، هل تُعيد الدالّةُ `null` فيُحفظ المستندُ بلا قيد؟ وما المستنداتُ والمساراتُ المتأثّرة؟ وما الاستعلامُ الذي يعدّ القائمَ بلا قيد مع استبعاد ما لا قيدَ له مشروعاً؟

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### 2.1 القلب: `resolveAccountIds` تُعيد `null` بتصميمٍ معلَن

`apps/api/src/journal/auto-posting.util.ts:17-27`:

```ts
/** ... Returns `null` (soft-skip signal) if any code
 * isn't set up for this company yet — matches the mockup's
 * `postInvoiceToLedger`/`postPurchaseToLedger`, which silently skip posting
 * rather than blocking the invoice/purchase itself ... */
async function resolveAccountIds(tx, codes) {
  const rows = await tx.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const ids = new Map(rows.map((r) => [r.code, r.id]));
  return codes.every((c) => ids.has(c)) ? ids : null;
}
```

- **التخطّي منقولٌ من النموذج المتصفّحي صراحةً** (التعليق نفسه) — وهو ما يحذّر منه `CLAUDE.md §1` («احذر القيود الموروثة من النموذج»).
- الشيفرةُ تعرف العلّة وتوثّقها في خمسة مواضع على الأقل بلا علاج عند الترحيل: `accounts/default-chart.ts:10-14` · `journal/inventory-accounts.util.ts:10-12` · `journal/deferred-revenue-account.util.ts:26-28` · `companies/create-company-account.ts:24-26` · `fiscal/period-lock-tz.live.spec.ts:173-179` («والتخطّي الناعم **يشبه النجاح تماماً**»). والمخطّط يوثّق `null` حالةً مشروعة: `prisma/schema.prisma:1583-1587` («Null when required accounts (1200/4100/2200) aren't set up yet ... the invoice itself is still created, just not posted»).
- **العلاج الذي اختير سابقاً (4.7) وقائيٌّ لا رافض**: «الدواء ليس تحذيراً وقت الترحيل، بل ألّا تُولد منشأة بلا دليل» (`accounts/default-chart.ts:14`) — والدليلُ يُنشأ في معاملة الميلاد (`companies/create-company-account.ts:123`).

### 2.2 لماذا يبقى الباب مفتوحاً بعد 4.7 — مسارٌ يبلغه التاجر من شاشته

- الدليلُ الافتراضيّ **غير مقفل بنصّه**: «تُنشأ كحسابات عادية تماماً — **تُعدَّل وتُحذف**» (`accounts/default-chart.ts:30-32`).
- `DELETE /accounts/:id` (`accounts/accounts.controller.ts:44-49`، فعل `delete`) ⟵ `AccountsService.remove` (`accounts/accounts.service.ts:216-244`) لا يحمي إلا `SYSTEM_ACCOUNT_CODES` = `3300` و`3900` وحدهما (`fiscal/year-closing.util.ts:55-58`؛ الفحص `accounts.service.ts:265-269`)، ويرفض فقط حساباً له سطور قيد (`P2003` ⟵ `409`، `accounts.service.ts:232-241`).
- الواجهة تعرض الحذف: `apps/web/src/pages/accounts/AccountsPage.tsx:64` → `apps/web/src/api/accounts.ts:30`.
- **فالنتيجة:** منشأةٌ جديدة حذفت `4100` قبل أول بيع (لا سطور عليه بعد) — أو `4300` أو `5600` أو `5700` أو `1600` أو أيَّ رمز فئة شراء (`5200`–`5500`) لم يُستعمل بعد — تُصدر مستنداتها لاحقاً **بنجاح وبلا قيد**. ولا مسار لتغيير الرمز (`accounts/dto/update-account.dto.ts:5-22` بلا حقل `code`)، ولا حذف ناعم للحساب (`schema.prisma:1188-1248` بلا `deletedAt`/`archived`).
- والمصدر الثاني: منشآتٌ سبقت 4.7 ولم يُكمَل دليلها (سكربت `scripts/backfill-default-chart.ts:21-52` موجود؛ هل شُغّل على كلّ قاعدة؟ — القسم ٦).

### 2.3 الدوالّ السبع والعشرون التي تتخطّى — ورموزُها

كلّها في `journal/auto-posting.util.ts`، والسطرُ هو موضع `if (!ids) return …`:

| # | الدالّة | سطر التخطّي | الرموز التي تُطلب بالرمز |
|---|---|---|---|
| 1 | `postInvoiceEntry` | 113 | `1200` `4100` (+`2200` إن ضريبة) |
| 2 | `postPrepaymentInvoiceEntry` | 157 | `1200` (+`2200`) |
| 3 | `postPrepaymentApplicationEntry` | 188 | `1200` (+`2200`) |
| 4 | `postCreditNoteEntry` | 219 | `1200` `4100` (+`2200`) |
| 5 | `postDebitNoteEntry` | 245 | `1200` `4100` (+`2200`) |
| 6 | `postCogsEntry` | 283 | `5100` |
| 7 | `postCogsReversalEntry` | 317 | `5100` |
| 8 | `postCogsSettlementEntry` | 346 | `5100` |
| 9 | `postSupplierNoteEntry` | 589 | `2100` `5100` + حساب الفئة |
| 10 | `postPurchaseEntry` | 660 | `2100` (+ حساب الفئة إن بندٌ خدميّ) |
| 11 | `postLandedCostEntry` | 780 | `5100` + حساب الفئة |
| 12 | `postNonDeductibleVatEntry` | 839 | `5100` (+ حساب الفئة) |
| 13 | `postRentPaymentEntry` | 959 | `1000` إن لا بنك · `4200` (+`5600`) |
| 14 | `postDeferredRecognitionEntry` | 1022 | `4200` |
| 15 | `postRentAccrualEntry` | 1092 | `1200` `4200` (+`2200`) |
| 16 | `postRentAccrualReversalEntry` | 1147 | `1200` (+`4200` +`2200`) |
| 17 | `postDeferredToOtherIncomeEntry` | 1187 | `4300` |
| 18 | `postPartySettlementEntry` (⟵ `postCustomerPaymentEntry` 1559 · `postSupplierPaymentEntry` 1596 · قبض الإيجار الاستحقاقيّ) | 1280 | `1000` إن لا حساب نقد · `1200`/`2100` (+`5600`) |
| 19 | `postDepositReceiptEntry` | 1647 | `1000` `2300` |
| 20 | `postDepositSettlementEntry` | 1717 | `2300` أو `1000` (+`1200` +`4300` +`1000`) |
| 21 | `postDeferredSettlementEntry` | 1769 | `1000` أو `4300` |
| 22 | `postContractSettlementEntry` | 1816 | `1200` `4300` |
| 23 | `postClaimIssueEntry` | 1855 | `1200` `4300` |
| 24 | `postClaimPaymentEntry` | 1876 | `1000` `1200` |
| 25 | `postClaimWaiverEntry` | 1903 | `1200` `4300` |
| 26 | `postKeyMoneyEntry` | 1954 | `1000` + `4300` أو `1600` |
| 27 | `postMaintenanceCostEntry` | 2009 | `5700` `1000` |

حسابُ الفئة من `common/purchase-categories.ts:29-36,43` (`5100`–`5500`، والمستقرّ `5300`).

**وغيرُ متأثّر** (يُنشئ حسابه عند الحاجة بدل التخطّي): الاستلام `postGoodsReceiptEntry` (724-739)، الشطب `postWriteOffEntry` (529-550)، الحركة اليدوية `postManualStockEntry` (379-407)، `postWriteOffSettlementEntry` (430-457)، الإيداع/الشبكة/نقل الدرج (1345-1518) — وكلّها تستعمل `getOrCreate…`. والنمطُ نفسُه موجودٌ جاهزاً: `getOrCreateAccountByCode` في `journal/pos-settlement.util.ts:38-54` («فلا ترحيلَ يُتخطّى لغياب حساب»).

### 2.4 المستدعون — وماذا يُحفظ حين يعود `null`

| المستند / المسار | الموضع | ما يُكتب رغم غياب القيد |
|---|---|---|
| **فاتورة مبيعات** (`POST /invoices` · بيع الكاشير مباشرةً ومزامنةً وبالبطاقة · تحويل عرض السعر · البدل عن مردودة — كلّها عبر `createWithinTx`: `invoices/invoices.service.ts:529`؛ المستدعون `pos/pos.service.ts:722` · `quotes/quotes.service.ts:286` · `invoices.service.ts:374`) | `invoices.service.ts:676-710` | الفاتورة تُحفظ و`journalEntryId` فارغ (708)، **وحدثُ الإصدار إلى الهيئة يُكتب قبل الفحص** (698-702)، والمخزونُ خرج (657-663)، وقيد التكلفة قد يُرحَّل بلا إيراده (664-671) |
| تعديل الفاتورة | `invoices.service.ts:822-844` | مسارٌ لا يُبلَغ عملياً: كلُّ ما يمسّ الترحيل مرفوضٌ على الصادر (`737-773`) |
| **إشعار دائن / مدين** | `invoices.service.ts:1148-1159` | الإشعارُ يُحفظ، وحدثُ الهيئة (1098-1102)، والإرجاعُ إلى الرفّ وقيدُ عكس تكلفته (1119-1146) |
| **مستند الدفعة المقدَّمة 386** | `invoices.service.ts:1240-1254` | المستند + التخصيص + حدث الهيئة (1256-1260) |
| تطبيق الدفعة المقدَّمة | `invoices.service.ts:1320-1331` | **النتيجة مُهمَلة**: صفّ `invoice_prepayments` ونقلُ التخصيص بلا قيد، ولا عمود يدلّ |
| قيد التكلفة / عكسُها / تسويةُ المؤقّت | `invoices.service.ts:665` · `:352` · `:1139`؛ `purchases/purchase-receipt.util.ts:139` · `inventory/inventory.service.ts:147` · `inventory/stock-openings.service.ts:224` | **النتيجة مُهمَلة** — الطبقاتُ تتحرّك و`1300` لا |
| **فاتورة شراء — إنشاء** | `purchases/purchases.service.ts:202-228` | الشراء يُحفظ بلا قيد (224)، **والاستلامُ الضمنيُّ قبله يرحّل `1300`/الوسيط** (202-209) فيبقى الوسيطُ دائناً بلا مقابل، ويُتخطّى `reconcileNonDeductibleVat` (227) |
| **فاتورة شراء — تعديل** | `purchases.service.ts:393-417` | القيدُ القديم **يُعكس** (394-396) ثم الجديد `null` ⟵ `journalEntryId: null` (414): شراءٌ كان مرحَّلاً يصير **غيرَ مرحَّلٍ وقيدُه معكوس**. (مثال: تغيير الفئة إلى فئةٍ حُذف حسابُها) |
| إشعار المورّد | `purchases/supplier-notes.service.ts:196-215` | الإشعار والأثرُ على الرفّ وحصصُ التكلفة (183-194) |
| التكلفة المحمَّلة | `purchases/landed-costs.service.ts:198-228` | التوزيعُ ورفعُ تكلفة الطبقات (198-213) بلا قيد |
| ضريبة المدخلات غير القابلة للخصم | `purchases/non-deductible-vat.util.ts:297-329` | الحدثُ وتعديلُ الطبقات بلا قيد |
| **سند قبض** (يدويّ · الكاشير `recordPosReceipt` · العكس · الردّ) | `payments/payments.service.ts:701-729` (المستدعون 223 · 341 · 490 · 596) | السند يُحفظ **والتخصيصُ يجعل الفاتورة مسدَّدة**، **ومرآةُ البنك تتحرّك** بـ`entryNo: null` (721-729) |
| **سند صرف لمورّد** | `purchases/supplier-payments.service.ts:351-374` | كسابقه، ومرآةُ البنك تتحرّك (366-374) |
| **قبض إيجار** — المسار القائم | `contracts/contracts.service.ts:491-539` | الدفعة بـ`journalEntryId` فارغ (532)، ومرآةُ البنك `matched: false` (587-603) |
| قبض إيجار — مسار الاستحقاق | `contracts.service.ts:572-583` | الدفعة + صفوف الاستحقاق بلا قيد التسوية |
| **صفّ استحقاق إيجار / عكسُه** | `journal/rent-accrual.util.ts:139-185` · `:347-392` | الصفّ بلا قيد وعدّاداتُ القسط تُزاد (174-185) — **ويُعدّ في الإقرار** (`obligations/obligations.service.ts:978`) |
| احتجاز المستحقّ بعد الإلغاء | `rent-accrual.util.ts:515-523` | **النتيجة مُهمَلة** |
| تحوّل الإيراد المؤجَّل | `contracts/rent-recognition.service.ts:155-167` | **الوحيد الذي لا يُضيّع**: `break` ولا يتقدّم العدّاد فيُعاد لاحقاً |
| تسوية إلغاء العقد | `contracts.service.ts:350-373` | العقد `CANCELLED` بـ`settlementAmount` و`settlementEntryId` فارغ |
| إقفال المؤجَّل عند الإلغاء | `contracts.service.ts:393-408` | **النتيجة مُهمَلة ثم يُغلق العدّاد** (408): التزامُ `2400` يبقى بلا مخرج |
| التقبيل · المطالبة (إصدار/تحصيل/إسقاط) · الوديعة (قبض/تسوية) | `contracts.service.ts:930-951` · `977-998` · `1034-1039` · `1072-1097` · `1137-1171` | الصفّ يُحفظ و`journalEntryId`/`settlementEntryId` فارغ |
| الصيانة | `maintenance/maintenance.service.ts:169-188` | البلاغ `DONE` بتكلفة وبلا قيد |

### 2.5 ما يُعلَن اليوم عن القائم بلا قيد — جزئيّ

- الإقرار يعدّ صفوف الاستحقاق بلا قيد: `obligations/obligations.service.ts:60-61,978`.
- مطابقة وسيط الاستلام تعدّ المشتريات بلا قيد: `purchases/goods-receipts.service.ts:332-337,383`.
- **ولا إعلانَ جامعٌ لغيرهما.** بل تُخفي بعضُ الشاشات غيرَ المرحَّل: تسويةُ الشبكة تقرأ `journalEntryId: { not: null }` فقط (`banks/network-settlements.service.ts:64-70`) — سندُ بطاقةٍ بلا قيد لا يظهر للتسوية أصلاً.

### 2.6 البحث النافي — بمسباره

| البحث | النتيجة | حالة التحكّم (يجب أن يجد) |
|---|---|---|
| مفتاح رسالة لنقص الحساب: `account_missing\|accounts_missing\|chart_incomplete\|missing_account` في `apps/api/src/common/i18n` | **0** | `account_system_protected\|account_has_journal_lines` ⟵ وُجد `messages.ts:64` و`:561` |
| اختبارٌ يثبت التخطّي على نقص حساب: `soft-skip\|journalEntryId\).toBeNull\|...` في `apps/api/test` | وُجدت 5 أسطر كلّها **حالاتٌ مشروعة** (`contract-deposits.e2e-spec.ts:223` وديعة إيجار · `maintenance.e2e-spec.ts:85,144` بلا تكلفة · `goods-receipts.e2e-spec.ts:357,372` استلامٌ قديم) — **لا اختبار يحذف حساب ترحيلٍ ثم يُصدر مستنداً** | المسبار نفسُه وجد هذه الخمسة، فليس أعمى |
| حذف حسابات في الاختبارات: `.delete(\`/accounts/` | 14 سطراً؛ ما قرأتُه منها يحذف حساباتٍ زرعها الاختبار. `default-chart.e2e-spec.ts:175-181` يحذف `5700/4300/1600` مباشرةً **ولا يُصدر مستنداً بعدها** | — (لم أفتح الأربعة عشر كلّها — حدٌّ معلن) |
| هجرةٌ تُدرج مستنداتٍ مباشرةً (فتكون بلا قيد مشروعاً): `INSERT INTO "(rent_accruals\|payments\|invoices\|purchases\|…)"` | **ملفٌّ واحد**: `20260919140000_goods_receipts` (استلاماتٌ قديمة بلا قيد مقصود) | `INSERT INTO "?[a-z_]+"?` ⟵ 5 ملفات منها `egs_units` و`cash_drawer` |
| مسارُ تخطٍّ آخر بقراءة حساب برمزه: `\.account\.find(First\|Unique\|Many)\(` في `src` | 30 موضعاً؛ **التخطّي في الترحيل وحده في `auto-posting.util.ts:24`**. والبقيّة قراءاتُ تقارير، أو `getOrCreate`، أو قراءةٌ تُعيد `[]` (`network-settlements.service.ts:64-65`) | المسبار وجد `auto-posting.util.ts:24` المعروف |

---

## (3) الحكم المبدئيّ بالقراءة

**قائمةٌ — في شقّها الآليّ.** وغيرُ محسومةٍ بالقراءة وحدها — في شقّها العدديّ.

**لماذا قائمة:**
1. الآليةُ حتمية لا احتمالية: `codes.every(...) ? ids : null` (`auto-posting.util.ts:26`) ثم `if (!ids) return null` في 27 دالّة (الجدول 2.3)، والمستدعون يُكملون الحفظ (الجدول 2.4).
2. **قابلةٌ للبلوغ من شاشة المالك نفسه** اليوم: حذفُ حسابٍ افتراضيٍّ بلا سطور مسموح (`accounts.service.ts:216-244` · `default-chart.ts:30-32`)، فلا يلزم «منشأةٌ قديمة» لإنتاجها.
3. الأثرُ ليس «قيدٌ ناقص» فحسب بل **تفارقٌ بين ثلاثة مصادر**: الهيئةُ أُبلغت (`invoices.service.ts:698-702`)، والتخصيصُ جعل الفاتورة مسدَّدة (`payments.service.ts` مع `716`)، ومرآةُ البنك تحرّكت (`payments.service.ts:721-729` · `contracts.service.ts:587-603`) — والدفترُ لم يتحرّك. وهو «رقمٌ يتحرّك بلا قيدٍ يسنده» الذي يسمّيه المستودع **تعريفَ العطل** (`common/bank-mirror.spec.ts:9`).
4. وستةُ مساراتٍ **لا عمودَ يدلّ عليها** (قيود التكلفة الثلاثة، تطبيق الدفعة المقدّمة، إقفال المؤجَّل، الاحتجاز) — فغيابها لا يُعدّ بعمودٍ فارغ أصلاً.

**لماذا لا يُحسم الشقّ العدديّ بالقراءة:** عددُ المستندات القائمة بلا قيد، وعددُ المنشآت الناقصة الدليل على التطوير والمنشور، **يتوقّفان على البيانات** — والقاعدة لم تُمسّ (حدّ المهمّة). والقسم ٦ يعطي الاستعلامات.

**وملاحظةٌ جانبية مقروءة لا مقيسة** (تمسّ تصميم الإصلاح): `rent-accrual.util.ts:223-226` يلتقط `BadRequestException` بوصفه «قفل الفترة»، بينما `assertPeriodOpen` يرمي **`ConflictException`** (`fiscal/period-lock.util.ts:57,60`). فالتقاطُ «الفترة المقفلة» الموثّقُ في `rent-accrual.util.ts:36-37` يبدو غيرَ مطابقٍ لما يُرمى فعلاً. خارج هذه الدعوى — ويُقاس وحدَه.

---

## (4) كيف تُقاس حيّاً — اختبار e2e محدّد

**الملف المقترح:** `apps/api/test/posting-missing-account.e2e-spec.ts` — على منشآتٍ معزولة (`test/isolated-company.ts:24-47`: `registerIsolatedCompany` / `removeIsolatedCompany`) كي لا يمسّ منشآت العرض المشبعة.

**المبدأ:** يُنتَج النقصُ **بمسار التاجر** (`DELETE /accounts/:id`) لا بـ`prisma` — فالاختبار يثبت أن الباب مفتوحٌ من الشاشة، ثم يُصدَر المستند.

```ts
// ⓪ حالةُ التحكّم — يجب أن تمرّ اليوم وبعد الإصلاح (تثبت أن المسبار يرى)
const ok = await registerIsolatedCompany(app, 'b-ctrl');
const c0 = await customer(ok);
const inv0 = await auth(ok, post('/invoices')).send(invoiceBody(c0)).expect(201);
expect(inv0.body.journalEntryId).toBeTruthy();

// ① الفاتورة بعد حذف 4100 من شاشة الحسابات
const co = await registerIsolatedCompany(app, 'b-4100');
const acc = (await auth(co, get('/accounts')).expect(200)).body as { id: string; code: string }[];
await auth(co, del(`/accounts/${acc.find((a) => a.code === '4100')!.id}`)).expect(204);
// §8.8: وقوعُ الكسر يُفحص قبل قراءة النتيجة
expect(((await auth(co, get('/accounts'))).body as { code: string }[]).some((a) => a.code === '4100')).toBe(false);
const cust = await customer(co);
const before = ((await auth(co, get('/invoices')).expect(200)).body).length;   // مصفوفة بلا page (common/pagination/paged.util.ts:99-104)
const res = await auth(co, post('/invoices')).send(invoiceBody(cust));        // {customerId, issueDate:'2026-07-20', dueDate:'2026-08-20', lines:[{…unitPrice:100, taxRate:15}]} كـ default-chart.e2e-spec.ts:100-102
expect(res.status).toBe(409);                  // ⟵ يسقط اليوم: «Expected 409, Received 201»
expect(String(res.body.message)).toContain('4100');
expect(((await auth(co, get('/invoices'))).body).length).toBe(before);        // لم يُحفظ شيء
```

**التوكيد الذي يسقط على الشيفرة الحالية:** `expect(res.status).toBe(409)` — الشيفرةُ اليوم تعيد `201` وجسمٌ `journalEntryId: null` (`invoices.service.ts:708`). وللإثبات «بالأثر» أيضاً (يُضاف قبل التوكيد، ويمرّ اليوم): رصيدُ `1200` من `GET /accounts` بقي صفراً رغم فاتورة بـ`115`.

**حالاتٌ أخرى في الملف نفسه — كلٌّ على منشأةٍ معزولة:**

| # | الكسر (بالشاشة) | المستند | اليوم | بعد الإصلاح |
|---|---|---|---|---|
| ② | حذف `1000` بعد فاتورة مرحَّلة | `POST /payments` `{method:'CASH', allocations:[{invoiceId, amount:115}]}` بلا `bankId` (مسموح: `payments.service.ts:161-164`) | `201`، `journalEntryId: null`، والفاتورة `PAID` و`1200` ما زال `115` | `409` يسمّي `1000`، والفاتورة `DUE` |
| ③ | حذف `2100` | `POST /purchases` `{supplierId, date, subtotal:200}` (كـ `default-chart.e2e-spec.ts:115`) | `201` بلا قيد | `409` يسمّي `2100` |
| ④ | حذف `4200` | إنشاء عقدٍ مصنَّف بقسطٍ حلّ (يرحّل الاستحقاق في الإنشاء: `contracts.service.ts:252`) | `201` وصفّ استحقاقٍ بلا قيد (`rent-accrual.util.ts:170`) | `409` — **وهذه الحالة تمسك الكسر المحتمل (٥-ج-٢)** |
| ⑤ | حذف `4300` | `POST /contracts/:id/claims` | `201` بلا قيد | `409` |
| ⑥ (بيعُ الكاشير) | حذف `4100` | `POST /pos/shifts` ثم `POST /pos/sales` (كـ `default-chart.e2e-spec.ts:140-145`) | `201` و`status: 'PAID'` بلا قيد إيراد | `409` — **ويُقرّر المالك هل يُقبل هذا** (القسم ٥) |

**حدٌّ معلن:** الاختبار يحتاج `db-integration` (قاعدة حيّة)، ولا يُوسَم `[SPEC …]` قبل أن يُبنى الإصلاح (الوسم ادّعاءُ مبنيّ — `CLAUDE.md §4` الطبقة ①).

---

## (5) تصميمُ الإصلاح — بالمواضع، وما ينكسر، والكسرُ المحتمل

### 5.أ الخيار الذي تنصّ عليه الدعوى: **الرفض برسالةٍ مسمّاة**

1. **`journal/auto-posting.util.ts:17-27`** — `resolveAccountIds` ترمي بدل `null`:
   - صنفٌ مسمّى، مثلاً `MissingPostingAccountsError extends ConflictException` (**`409` لا `400`** — انظر ٥-ج-٢)، برسالةٍ تسمّي الرموز وأسماءها من `DEFAULT_CHART` (`accounts/default-chart.ts:40-103`) وتدلّ على المخرج («أعد إنشاء الحساب 4100 إيرادات المبيعات من شاشة الحسابات»).
   - مفتاحٌ جديد في `common/i18n/messages.ts` (لا مفتاح قائماً — البحث في 2.6).
   - نوعُ الإرجاع `Promise<Map<string,string>>`.
2. **حذف سطور التخطّي السبعة والعشرين** (الجدول 2.3). ويبقى `return null` المشروع على المبالغ الصفرية (مثلاً `109` · `280` · `944` · `1086`).
3. **لا يرمي قبل الكتابة إلا لأن المعاملة واحدة**: كلُّ المستدعين داخل `runInTenantContext` (مثلاً `invoices.service.ts:273` · `purchases.service.ts` · `contracts.service.ts:443`)، فالرميُ يُسقط المستند وحركاتِ مخزونه وحدثَ الهيئة معاً — «يُرفض المستند» حرفياً.
4. **`contracts/rent-recognition.service.ts:165-167`** — `if (!entry) break;` يصير ميتاً؛ يُحذف أو يُبقى حارساً للمبالغ الصفرية.
5. **الإعلان عن القائم** (شقّ الدعوى الثاني): هجرةٌ **تعدّ ولا تكتب** وتُعلن بـ`RAISE WARNING` (`CLAUDE.md §8.28`) — **بالدوران على المنشآت بـ`set_config`** لا بلا سياق (سابقة `ق-١١٧٨`: «عدُّها الأوّل رأى صفراً تحت `FORCE`»)؛ ونقطةُ قراءةٍ/قسمٌ في تقريرٍ قائم يعرض العدد لكل جدول (القسم ٦ هو المادّة).
6. **تحديث التوثيق الذي يصف التخطّي حالةً مشروعة**: `schema.prisma:1583-1587` وتعليقات `auto-posting.util.ts:104-107,646-650,928,1074-1075,1557,1641,1699-1700,1810` و`default-chart.ts:10-14` و`inventory-accounts.util.ts:10-12` و`deferred-revenue-account.util.ts:26-28` و`create-company-account.ts:24-26` و`rent-accrual.util.ts:38`.
7. **طبقةٌ ثانية مقترحة (قرار مالك):** منعُ حذف حسابٍ يُطلب برمزه في الترحيل، بنمط `assertNotSystemAccount` (`accounts.service.ts:265-269`)، والمجموعةُ مشتقّةٌ من السطح الذي يقرؤه `accounts/default-chart.spec.ts:72-109` لا مكتوبةٌ بيد. ⚠️ **يعارض النصّ المعلَن** «تُعدَّل وتُحذف» (`default-chart.ts:30-32`) — فلا يُبنى بلا إذن.

### 5.ب البديل الذي يحلّ العطل بلا رفض — للمقارنة (قرار مالك)

داخل `resolveAccountIds`: كلُّ رمزٍ غائبٍ من `DEFAULT_CHART` يُنشأ بـ`getOrCreateAccountByCode` (`journal/pos-settlement.util.ts:38-54`) باسمه ونوعه من الدليل — **النمطُ نفسُه المستعمل اليوم لتسعة حسابات** (`1300`/`1250` · `2400` · `5800` · `5810` · `3900` · `3300` · `2450` · `1251`/`1190`).
- **مكسبه:** لا بيعَ يُرفض (يتّسق مع حجّة المالك في ⑬: «منعُ إصدار فاتورة … أقسى عطلٍ ممكن»)، ولا مستندَ بلا قيد.
- **ثمنه:** يُعيد حساباً حذفه المالك عمداً، **بصمت** — افتراضٌ صامتٌ من نوعٍ آخر؛ ويُعلَن بإشعارٍ إن اختير.

### 5.ج ما ينكسر بالخيار (أ)

1. **الكاشير**: منشأةٌ ناقصةُ `4100`/`1200`/`2200` **لا تبيع** — `pos.service.ts:722` يرمي. المزامنةُ الأوفلاين **لا تُضيّع البيع** (يبقى في الطابور ويُعرض الخطأ ويتوقّف التفريغ عند أول فشل: `apps/web/src/pages/pos/PosPage.tsx:177-190`) لكنها تتعطّل حتى يُعاد الحساب. ومحاولةُ دفعٍ بالبطاقة: البطاقةُ شُحنت والإتمامُ يسقط فتبقى المحاولةُ «مقبولةً معلَنة» (`pos.service.ts:735-738`) — لم أقِس مسارها الكامل.
2. **العقود**: إنشاءُ عقدٍ مصنَّف أو تجديدُه يسقط إن غاب `1200`/`4200` (`contracts.service.ts:252` · `:776`).
3. **الكنس الليلي**: منشأةٌ ناقصة يسقط كنسُها **كلُّه** (يُسجَّل خطأً لكل منشأة ولا يوقف البقية: `contracts/rent-accrual.service.ts:41-53`) بدل أن يكتب صفوفاً بلا قيد.
4. **المنشآت القديمة الناقصة** تتوقّف مستنداتها كلّها لحظة النشر ⟵ **شرطٌ قبل النشر**: تشغيل `scripts/backfill-default-chart.ts` (21-52) على كل قاعدة، وقياسُ القسم ٦-ب قبله وبعده.
5. **الاختبارات**: لم أجد اختباراً يعتمد التخطّي (2.6)؛ والحيُّ `period-lock-tz.live.spec.ts:173-186` يزرع حساباته فلا يتأثّر.

### 5.د كسرٌ محتملٌ للإثبات بالعكس (بصياغةٍ يكتبها مطوّرٌ فعلاً — `§8.8` الوجه الثاني)

1. **«حتى لا يتوقّف البيع»** — في `postInvoiceEntry`:
   ```ts
   const ids = await resolveAccountIds(tx, needCodes).catch(() => null);
   if (!ids) return null;
   ```
   ⟵ الحالة ① تعود `201` فتسقط، و⑥ كذلك.
2. **الصنفُ الجديد يرث `BadRequestException`** (`class MissingPostingAccountsError extends BadRequestException`) ⟵ يبتلعه `rent-accrual.util.ts:225` ظنّاً أنه «فترةٌ مقفلة» فيُحفظ العقدُ `201` بلا استحقاق ⟵ **الحالة ④ تسقط**. (ولهذا نصّ ٥-أ-١ على `409`.)
3. **دالّةُ ترحيلٍ جديدة تتجاوز المُحلِّل**:
   ```ts
   const other = await tx.account.findFirst({ where: { code: OTHER_INCOME_ACCOUNT } });
   if (!other) return null;
   ```
   ⟵ لا تمسكها الحالاتُ الحيّة إلا إن كانت على مسارها؛ فيلزم حارسٌ مشتقّ: كلُّ قراءة حسابٍ برمزه في `src/journal` تمرّ بـ`resolveAccountIds` أو `getOrCreate…` — **حارسٌ نصّيّ لازمٌ لا كافٍ** (`CLAUDE.md` «الحارس النصّي يقول مكتوبة ولا يقول تعمل»)، ويُثبت بهذا الكسر نفسه.
4. (للطبقة ٥-أ-٧ إن بُنيت) إزالةُ فحص المنع من `remove()` ⟵ حالةٌ «`DELETE` لـ`4100` على منشأةٍ وليدة يعود `409`» تسقط.

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل التغيير

### 6.0 مصادقة المسبار أولاً (`CLAUDE.md` «شرطُ تسجيل أي نفي»)

الجداولُ كلّها تحت `ENABLE + FORCE RLS`؛ **بدور `app_user` بلا `app.company_id` يعود كلُّ عدٍّ صفراً بنجاح** (`CLAUDE.md` قاعدة 2026-08-12 «عدٌّ خارج سياق المستأجر يرى الغياب»). فيُشغَّل بدورٍ يتجاوزها (المالك الخارق للقاعدة — `CLAUDE.md §6.1`) أو بالدوران على المنشآت (6.ه):

```sql
-- يجب: rolsuper = t أو rolbypassrls = t — وإلا فكلُّ ما يلي عمى
SELECT current_user, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
-- حالتان معلومتان: الأولى > 0 على التطوير، والثانية تُطابَق بمجموع 6.ب
SELECT (SELECT count(*) FROM invoices) AS invoices_total,
       (SELECT count(*) FROM invoices WHERE "journalEntryId" IS NOT NULL) AS invoices_posted;
```

⚠️ يُكتب الاستعلام في ملف `.sql` بترميز UTF-8 ويُمرَّر ملفاً (لا يُلصق عبر PowerShell 5.1 — نصوص المذكّرات العربية في 6.د تتلف). ولا يُشغَّل وجلسةٌ أخرى تكتب على `mad_app` (ذاكرة المشروع: المورد المشترك).

### 6.أ المنشآت الناقصة الدليل — برموز الترحيل

```sql
WITH req(code) AS (VALUES ('1000'),('1200'),('1600'),('2100'),('2200'),('2300'),
                          ('4100'),('4200'),('4300'),('5100'),('5200'),('5300'),
                          ('5400'),('5500'),('5600'),('5700'))
SELECT c.id, c."orgName", c.status,
       array_agg(req.code ORDER BY req.code) FILTER (WHERE a.id IS NULL) AS missing
FROM companies c
CROSS JOIN req
LEFT JOIN accounts a ON a."companyId" = c.id AND a.code = req.code
GROUP BY c.id, c."orgName", c.status
HAVING count(*) FILTER (WHERE a.id IS NULL) > 0
ORDER BY c."orgName";
```
(الرموز من الجدول 2.3 ومن `common/purchase-categories.ts:29-36`.)

### 6.ب المستندات القائمة بلا قيد — مع استبعاد ما لا قيدَ له مشروعاً

```sql
WITH u AS (
  -- الفواتير والإشعاران و386: لا مسوّدة للفاتورة (invoices.service.ts:758)؛ المشروع وحده baseTotal <= 0 (auto-posting.util.ts:109,154,215,241)
  SELECT "companyId", 'invoices' AS doc, "docType"::text AS kind, "baseTotal" AS amt, "createdAt" AS at,
         ("zatcaStatus"::text <> 'NOT_SUBMITTED') AS reached_zatca
  FROM invoices WHERE "journalEntryId" IS NULL AND "baseTotal" > 0
  UNION ALL
  -- الشراء وإشعارا المورّد: المُلغى يحتفظ بقيده (purchases.service.ts:506-508) فيُعدّ مفصولاً لا مستبعداً
  SELECT "companyId", 'purchases', "docType"::text || CASE WHEN "voidedAt" IS NULL THEN '' ELSE ' (voided)' END, "baseTotal", "createdAt", NULL
  FROM purchases WHERE "journalEntryId" IS NULL AND "baseTotal" > 0
  UNION ALL
  -- سندات القبض/الردّ/العكس: لا قيد مشروعاً فقط حين النقد والذمّة صفر (auto-posting.util.ts:1270)
  SELECT "companyId", 'payments', kind::text || CASE WHEN "reversesId" IS NULL THEN '' ELSE ' (reversal)' END, "baseAmount", "createdAt", NULL
  FROM payments WHERE "journalEntryId" IS NULL AND amount <> 0
  UNION ALL
  SELECT "companyId", 'supplier_payments', CASE WHEN "reversesId" IS NULL THEN 'PAYMENT' ELSE 'REVERSAL' END, "baseAmount", "createdAt", NULL
  FROM supplier_payments WHERE "journalEntryId" IS NULL AND amount <> 0
  UNION ALL
  -- دفعات الإيجار: netAmount > 0 إلزاميّ (contracts.service.ts:474-475) فكلُّها يُتوقّع لها قيد
  SELECT "companyId", 'rent_payments', method::text, "baseNetAmount", "createdAt", NULL
  FROM rent_payments WHERE "journalEntryId" IS NULL AND "netAmount" > 0
  UNION ALL
  -- صفوف الاستحقاق: موجبةٌ وسالبة (العكس/الخصم)؛ الصفر وحده مشروع (auto-posting.util.ts:1086,1143)
  SELECT "companyId", 'rent_accruals', kind::text, "baseGross", "createdAt", NULL
  FROM rent_accruals WHERE "journalEntryId" IS NULL AND "baseGross" <> 0
  UNION ALL
  SELECT "companyId", 'contract_key_money', direction::text, "baseAmount", "createdAt", NULL
  FROM contract_key_money WHERE "journalEntryId" IS NULL AND "baseAmount" > 0
  UNION ALL
  SELECT "companyId", 'contract_claims.issue', kind::text, "baseAmount", "createdAt", NULL
  FROM contract_claims WHERE "journalEntryId" IS NULL AND "baseAmount" > 0
  UNION ALL
  SELECT "companyId", 'contract_claims.settle', status::text, "baseAmount", "createdAt", NULL
  FROM contract_claims WHERE status <> 'OPEN' AND "settlementEntryId" IS NULL AND "baseAmount" > 0
  UNION ALL
  -- وديعة إيجار (EJAR) بلا قيد مقصود (contracts.service.ts:1067-1083 · contract-deposits.e2e-spec.ts:222-223)
  SELECT "companyId", 'contract_deposits.receipt', type::text, "baseAmount", "createdAt", NULL
  FROM contract_deposits WHERE holder = 'COMPANY' AND "journalEntryId" IS NULL AND "baseAmount" > 0
  UNION ALL
  -- تسوية EJAR بردٍّ كامل بلا خصم لا قيد لها مقصوداً (auto-posting.util.ts:1706-1708)
  SELECT d."companyId", 'contract_deposits.settle', d.holder::text, d."baseAmount", d."createdAt", NULL
  FROM contract_deposits d
  WHERE d.status = 'SETTLED' AND d."settlementEntryId" IS NULL AND d."baseAmount" > 0
    AND (d.holder = 'COMPANY' OR EXISTS (SELECT 1 FROM deposit_deductions x WHERE x."depositId" = d.id AND x.amount > 0))
  UNION ALL
  -- settlementAmount يُكتب فقط حين > 0 (contracts.service.ts:366)
  SELECT "companyId", 'contracts.cancel_settlement', status::text, "settlementAmount", "cancelDate"::timestamp, NULL
  FROM contracts WHERE status = 'CANCELLED' AND "settlementAmount" > 0 AND "settlementEntryId" IS NULL
  UNION ALL
  -- بلاغٌ بلا تكلفة بلا قيد مقصوداً (maintenance.e2e-spec.ts:141-144)
  SELECT "companyId", 'maintenance_requests', status::text, "baseCost", "createdAt", NULL
  FROM maintenance_requests WHERE "baseCost" > 0 AND "journalEntryId" IS NULL
  UNION ALL
  SELECT "companyId", 'landed_cost_distributions', CASE WHEN "voidedAt" IS NULL THEN 'ACTIVE' ELSE 'VOIDED' END, "baseAmount", "createdAt", NULL
  FROM landed_cost_distributions WHERE "journalEntryId" IS NULL AND "baseAmount" > 0
  UNION ALL
  -- تقريب: baseAmount = Σ المكوّنات؛ حدثٌ مكوّناته تتصافى إلى صفر لا يُعدّ هنا (auto-posting.util.ts:834)
  SELECT "companyId", 'non_deductible_vat_events', "trigger"::text, "baseAmount", "createdAt", NULL
  FROM non_deductible_vat_events WHERE "journalEntryId" IS NULL AND "baseAmount" <> 0
)
SELECT doc, kind,
       count(*)                                                   AS unposted,
       count(DISTINCT "companyId")                                AS companies,
       round(sum(amt), 2)                                         AS base_sum,
       count(*) FILTER (WHERE at <  '2026-07-20')                 AS before_journal,      -- قبل هجرة 20260719231124_journal
       count(*) FILTER (WHERE at >= '2026-07-20' AND at < '2026-08-09') AS before_default_chart, -- قبل 4.7
       count(*) FILTER (WHERE at >= '2026-08-09')                 AS after_default_chart,
       count(*) FILTER (WHERE reached_zatca)                      AS reported_to_zatca
FROM u
GROUP BY doc, kind
ORDER BY doc, kind;
```

**ويُطابَق** كلُّ صفٍّ ذي `companies > 0` بقائمة 6.أ: مستنداتٌ بلا قيد لمنشأةٍ **دليلُها اليوم كامل** تعني أن الحساب أُعيد بعد الحذف أو اكتمل بالسكربت — فالقائمُ تاريخٌ لا يُصلحه اكتمالُ الدليل.

**وحدودُه المعلنة:** حدودُ الأزمنة الثلاثة تقريبية (زمنُ الدمج لا زمنُ نشر كل قاعدة)؛ و`createdAt` بتوقيت الخادم.

### 6.ج أثرُ مرآة البنك بلا قيد

```sql
SELECT source, count(*) AS rows, round(sum(amount), 2) AS amount
FROM bank_transactions
WHERE "entryNo" IS NULL AND source IN ('customer-payment','supplier-payment','rent')
GROUP BY source;
```
(المصادر من `payments.service.ts:725` · `supplier-payments.service.ts:370` · `contracts.service.ts:595`.)

### 6.د المساراتُ بلا عمودٍ دالّ — بالمذكّرة (استدلالٌ لا عدٌّ قاطع)

```sql
-- فواتير خرج مخزونُها بتكلفةٍ ولا قيدَ تكلفة لها — مذكّرتها «تكلفة مبيعات <no>» (auto-posting.util.ts:288)
-- قيدُ التكلفة وُلد في f31676e3 (2026-08-30 16:42 +0300 · #82) فما قبله بلا قيد تكلفة مشروعاً
SELECT i."companyId", count(DISTINCT i.id) AS invoices_without_cogs_entry
FROM invoices i
JOIN invoice_lines il ON il."invoiceId" = i.id
JOIN stock_movements m ON m."invoiceLineId" = il.id AND m.origin = 'SALE' AND m.type = 'OUT'
JOIN inventory_consumptions ic ON ic."movementId" = m.id AND ic."unitCost" > 0
WHERE i."docType" = 'INVOICE' AND i."createdAt" >= '2026-08-30 13:43:00'
  AND NOT EXISTS (SELECT 1 FROM journal_entries je
                  WHERE je."companyId" = i."companyId" AND je.auto AND je.memo = 'تكلفة مبيعات ' || i.no)
GROUP BY 1;

-- تطبيقُ دفعةٍ مقدَّمة بلا قيد — مذكّرته من auto-posting.util.ts:196 (يُنسخ النصّ من المصدر حرفاً: «مقدَّمة» بشدّة)
SELECT ip."companyId", count(*) AS applications_without_entry
FROM invoice_prepayments ip
JOIN invoices inv ON inv.id = ip."invoiceId"
JOIN invoices pp  ON pp.id  = ip."prepaymentInvoiceId"
WHERE ip.gross > 0
  AND NOT EXISTS (SELECT 1 FROM journal_entries je
                  WHERE je."companyId" = ip."companyId" AND je.auto
                    AND je.memo LIKE 'تطبيق دفعة مقدَّمة ' || pp.no || ' على ' || inv.no || ' — %')
GROUP BY 1;
```
**وما لا يُعدّ بمذكّرةٍ ولا عمود:** إقفالُ المؤجَّل عند الإلغاء (`contracts.service.ts:393-408`) والاحتجاز (`rent-accrual.util.ts:515-523`) — يُستدلّ عليهما بمطابقة رصيد `2400` مع التزام الأقساط (وقيدُ التكلفة يُستدلّ عليه كذلك بمطابقة `1300`⇄الطبقات: `inventory/inventory-ledger-reconciliation.util.ts`).

### 6.ه البديل بالدوران على المنشآت (إن لم يتوفّر دورٌ متجاوز)

```sql
DO $$
DECLARE c record; n bigint; total bigint := 0; seen bigint := 0;
BEGIN
  FOR c IN SELECT id, "orgName" FROM companies LOOP
    seen := seen + 1;
    PERFORM set_config('app.company_id', c.id, true);
    -- مصادقةُ الآلية (ذاكرة المشروع: «أثبت الآلية لا الأثر»): السياقُ قائمٌ فعلاً
    IF current_setting('app.company_id', true) IS DISTINCT FROM c.id THEN RAISE EXCEPTION 'context not set for %', c.id; END IF;
    SELECT count(*) INTO n FROM invoices WHERE "journalEntryId" IS NULL AND "baseTotal" > 0;
    IF n > 0 THEN RAISE WARNING 'invoices بلا قيد: % — %', c."orgName", n; END IF;
    total := total + n;
  END LOOP;
  IF seen = 0 THEN RAISE EXCEPTION 'companies غير مقروء لهذا الدور — العدّ أعمى'; END IF;
  RAISE WARNING 'companies=% · invoices بلا قيد=%', seen, total;
END $$;
```
(ويُكرَّر جسمُ العدّ لكلّ صفٍّ من 6.ب.)

---

## (7) ما لا أعرفه

1. **الأعداد نفسُها** — على التطوير وعلى المنشور — لم تُقَس (حدّ المهمّة). فلا أعرف هل القائمُ بلا قيد صفرٌ أم آلاف، ولا كم منشأةً ناقصة الدليل اليوم، ولا هل شُغّل `backfill-default-chart` على المنشور.
2. **قرار المالك بين (أ) الرفض و(ب) الإنشاء عند الحاجة و/أو منع الحذف** — والدعوى تنصّ على (أ)، بينما حجّة ⑬ («منعُ إصدار فاتورة … أقسى عطل») ونمطُ `getOrCreate` القائم لتسعة حسابات يشيران إلى (ب) لمسار البيع على الأقل.
3. **سلوكُ كلّ شاشة ويب أمام `409` الجديد** — قرأتُ الكاشير وحده (`PosPage.tsx:177-190,295-302,418-425`)؛ بقيةُ الشاشات لم أقرأ معالجتها.
4. **مسارُ محاولة الدفع بالبطاقة كاملاً** حين يسقط الإتمام بعد الشحن — قرأتُ الإعلان (`pos.service.ts:735-738`) لا المسار.
5. **التقاط `BadRequestException` في `rent-accrual.util.ts:225`** مقابل `ConflictException` من قفل الفترة (`period-lock.util.ts:57,60`) — مقروءٌ متعارضاً، لم يُقَس حيّاً؛ وقد يكون هناك مصدرُ `BadRequest` آخر مقصود (مثلاً `journal-posting.util.ts:202` قيدٌ غير متوازن).
6. **أربعة عشر سطرَ حذفٍ للحسابات في الاختبارات** — لم أفتحها كلّها؛ ما فتحتُه يحذف حساباتٍ مزروعة.
7. **دقّة استبعادات 6.ب** في حالتين: `non_deductible_vat_events` (مجموعٌ يتصافى) و`rent_accruals` لصفوفٍ كتبتها مساراتٌ لم أقرأها إن وُجدت (لم أجد هجرةً تُدرج فيها — 2.6).
8. **هل تُفحص فترةٌ مالية لمنشأةٍ وليدة بتاريخ `2026-07-20`** في الاختبار المقترح — نسختُه من `default-chart.e2e-spec.ts:100-102` الذي يمرّ اليوم، ولم أتحقّق من سببه.

---

## مراجعةٌ عدائية

> **المُراجِع:** وكيلٌ مستقلّ · قراءةٌ وبحثٌ فقط على `D:\worktrees\outbox-266` · لم يُشغَّل اختبارٌ ولا قاعدة. كلُّ إحالةٍ نسبيّةٌ إلى `apps/api` ما لم يُذكر غيرُه.

### ر-١ · الحكم: **قائمةٌ — يصمد**، والإحالاتُ مطابِقة

- عددتُ مواضع التخطّي بنمطٍ ثانٍ مستقلّ (`resolveAccountIds|if \(!ids\)` على `src`): **٢٧ استدعاءً** في `journal/auto-posting.util.ts` (112 · 156 · 187 · 218 · 244 · 282 · 316 · 345 · 588 · 659 · 779 · 838 · 958 · 1021 · 1091 · 1146 · 1186 · 1279 · 1646 · 1716 · 1768 · 1815 · 1854 · 1875 · 1902 · 1953 · 2008) — يطابق الجدول 2.3. والتحكّمُ في البحث نفسِه وجد تعليقاتٍ معروفة (`journal/writeoff-account.util.ts:15` · `accounts/default-chart.ts:10`).
- وتحقّقتُ بالقراءة من: `auto-posting.util.ts:17-27` · `invoices/invoices.service.ts:657-710` · `purchases/purchases.service.ts:202-228,393-417,502-510` · `payments/payments.service.ts:161-167,701-729` · `contracts/contracts.service.ts:350-408,491-603,1018-1044,1054-1177` · `journal/rent-accrual.util.ts:139-185,215-234` · `fiscal/period-lock.util.ts:57,60` · `accounts/accounts.service.ts:216-244,265-269` · `fiscal/year-closing.util.ts:55-58` · `accounts/default-chart.ts:30-32` · `accounts/accounts.controller.ts:44-49` · `apps/web/src/pages/accounts/AccountsPage.tsx:64,150`. **لا إحالةَ خاطئة** فيما فحصت. والملاحظةُ الجانبية (`BadRequestException` في `rent-accrual.util.ts:225` مقابل `ConflictException` في `period-lock.util.ts:57,60`) **مؤكَّدة** — و`createJournalEntry` يرمي `BadRequest` وحيداً على عدم التوازن (`journal/journal-posting.util.ts:202`).

### ر-٢ · أثرٌ فات التقرير: التخطّي **يُنتج قيوداً خاطئة لاحقاً**، لا قيداً ناقصاً فحسب

1. **فاتورةٌ متخطّاة ثم سندُها مرحَّل ⟵ `1200` سالب.** `postPartySettlementEntry` لا يطلب `4100` (`auto-posting.util.ts:1278`)، فمنشأةٌ حذفت `4100` تُصدر فاتورةً بلا قيد (`invoices.service.ts:676,708`) ثم يُرحَّل قبضُها **دائناً على `1200` بلا مدينٍ سبقه**. وبيعُ الكاشير يفعلها **في المعاملة نفسها**: الفاتورة تُتخطّى والسندُ يُرحَّل على درج المناوبة (`pos/pos.service.ts:765-804` ⟵ `payments.service.ts:701-716`). فالحالة ⑥ في القسم ٤ ليست «بلا قيد إيراد» فقط، بل **نقدٌ في الدرج مقابل ذممٍ سالبة**.
2. **استحقاقٌ متخطّى ثم اعترافٌ مرحَّل ⟵ `2400` مدين.** حين يغيب `1200` أو `2200` ويبقى `4200`: `writeAccrual` يزيد `baseAccruedNet` بالصافي كاملاً (`rent-accrual.util.ts:178-180`) و`baseRecognized` بـ`posting.earned = 0` (183)، ثم `recognizeDueWithinTx` يأخذ الأساسَ `baseAccruedNet` (`contracts/rent-recognition.service.ts:207`) ويرحّل مدين `2400` / دائن `4200` (`auto-posting.util.ts:1018-1037` — يطلب `4200` وحده و`2400` بـ`getOrCreate`) **لمبلغٍ لم يُقيَّد دائناً في `2400` قطّ**. والقسطُ يُختم `accrualCompletedAt` (`rent-accrual.util.ts:230-232`) **فلا يُعيد كنسٌ قيدَه بعد إعادة الحساب**. فعبارةُ 2.4 «الوحيد الذي لا يُضيّع» صادقةٌ عن تخطّيه هو، **لكنه يبني على تخطّي غيره**.
3. **بدلُ المردودة** (`invoices.service.ts:363-374`): قيدُ المردودة يُعكس ثم يُصدَر البدلُ بـ`createWithinTx` — فإن تُخطّي صار بيعٌ مرحَّلٌ **معكوساً بلا بديل**. التقرير ذكر النظيرَ في تعديل الشراء (2.4) ولم يذكره للفاتورة.
4. ⟵ **وهذا كلُّه لا يراه 6.ب**: السندُ له قيد، والتحوّلُ له قيد. فالعددُ المعلَن يلزمه استعلامان إضافيان (ر-٥).

### ر-٣ · إعلاناتٌ جزئيةٌ قائمة فاتت 2.5

- `reports/reports.service.ts:319-341` (`bankDifference`) يعدّ لكلّ بنكٍ صفوفَ المرآة بلا `entryNo` (`unpostedCount` · `unpostedSum`) — وتشمل مرآةَ السندات غير المرحَّلة.
- `reports/reports.service.ts:834-850` (مطابقةُ الأعمار مع `1200`) تُعلن `accountMissing: true` حين يغيب `1200` (836)، **وتنسب كلَّ فرقٍ آخر إلى «قيدٍ يدوي على الذمم»** (830-832) — ففاتورةٌ غيرُ مرحَّلة تظهر فرقاً سالباً **منسوباً إلى سببٍ خاطئ**.
- فالصحيح: «لا إعلانَ جامعٌ»، لا «لا إعلانَ لغيرهما».

### ر-٤ · تصميمُ الإصلاح (5.أ) — أربعةُ كسورٍ لم تُذكر

1. **الترقيمُ يُحرق ولا يُسترجَع.** العدّادُ يُزاد **على منفذٍ خاصّ خارج معاملة العمل** (`common/document-sequence.util.ts:102-108`)، والفاتورةُ تُرقَّم (`invoices.service.ts:558`) قبل `postInvoiceEntry` (676). فرميٌ من داخل الترحيل — كما يقترح 5.أ-١ — **يترك فجوةً في `INV-`/`CN-`/`DN-`/`PP-`/`PUR-`/`RCV-`/`PAY-`/`EJ-` عند كلّ محاولة**، نقيضَ «**ولا فجوةَ من رفض**» (`invoices.service.ts:544-548` · `ق-٣٣٦`). وعبارةُ 5.أ-٣ «الرميُ يُسقط المستند … معاً» **ناقصة**: يُسقط كلَّ شيءٍ **إلا الرقم**. (والفجوةُ تقع اليوم على رفض قفل الفترة داخل `createJournalEntry` — لكن الإصلاح يضيف مصدراً جديداً.)
   ⟵ **التصميم:** فحصٌ مسبق `assertPostingAccounts(tx, codes)` **في رأس كلّ مسارٍ قبل `nextDocumentNumber`**، ويبقى رميُ `resolveAccountIds` شبكةً ثانية. **وتوكيدٌ يُضاف للحالة ①:** بعد إعادة إنشاء `4100` تصدر الفاتورةُ التالية برقمٍ متّصل.
2. **محاولةُ الدفع بالبطاقة: مالٌ يُؤخذ بلا بيع.** الإنشاءُ يحضّر البيعَ **بلا فاتورة** (`pos/pos-payment-attempts.service.ts:36,62-72`)، ثم **الشحن** (117-130)، ثم الإتمام `settle` ⟵ `completeSaleWithinTx` ⟵ `createWithinTx` (336-352 ⟵ `pos.service.ts:722`). برفض (أ): المحاولةُ تبقى `APPROVED` **والبطاقةُ مشحونة**، و«لا تُقفل مناوبتُها» (`pos.service.ts:735`)، **والكانسُ كلَّ عشر دقائق** (`pos-payment-attempts.service.ts:235-263`) **يسقط عند أوّل محاولةٍ عالقة فيترك بقيّةَ محاولات المنشأة في الدورة** — لا `try/catch` داخل حلقة `sweepCompany` (255-261)، والالتقاطُ على مستوى المنشأة وحدها (241-245).
   ⟵ الفحصُ المسبق يجب أن يقع في `prepareSale` **عند إنشاء المحاولة قبل الشحن**، لا عند الإتمام.
3. **رموزٌ مطلوبةٌ بلا شرط ⟵ رفضٌ كاذب تحت (أ).** `postSupplierNoteEntry` يطلب `5100` دائماً (588) والدالّةُ `push` تتخطّى الصفر (596-598)؛ `postLandedCostEntry` يطلبه (779) ولا يستعمله إلا إن `cogs > 0` (783)؛ `postNonDeductibleVatEntry` يطلبه دائماً (838) ويستعمله إن `cogs ≠ 0` (846)؛ `postInvoiceEntry` يطلب `4100` ولو `baseSubtotal = 0` (111,116). ومنشأةٌ حذفت `5100` — والشراءُ المخزنيُّ لا يمسّه بعد م٥ (669-676) — **سيُرفض إشعارُ مورّدها وتوزيعُ تكلفتها المحمَّلة بلا سبب**.
   ⟵ قبل تحويل `null` إلى رمي: `needCodes` تطابق السطورَ فعلاً (كما يفعل `postPurchaseEntry:658`).
4. **في المسارات الخلفية لا يرى أحدٌ «الرسالة».** كنسُ الاستحقاق (`contracts/rent-accrual.service.ts:41-53`) والاعتراف (`contracts/rent-recognition.service.ts:78-85`) وكانسُ المحاولات: الرفضُ يصير **سطرَ سجلّ خادم**. وشرطُ «أعلن» يحتاج إشعاراً للمالك (نمطُه قائم: `NotificationsService.raise` في `invoices.service.ts:1106-1116`).
5. **وإضافةٌ لـ5.ج-٢:** إلغاءُ العقد يمرّ بـ`recognizeDueWithinTx` (`contracts.service.ts:326`) فيسقط الإلغاءُ كلُّه إن غاب `4200` — لا الإنشاءُ والتجديد وحدهما.
6. **5.ج-٤ يناقض 5.ب:** تشغيلُ `backfill-default-chart` قبل النشر **يُعيد صامتاً كلَّ رمزٍ حذفه المالك عمداً** (`createDefaultChart` بـ`skipDuplicates` — `accounts/default-chart.ts:120-126`)، وهو «الافتراض الصامت» الذي انتقده 5.ب. والتمييزُ بين «وُلد بلا دليل» و«حذفه المالك» مقروءٌ من سجلّ التدقيق: الحذفُ مسارٌ مُدقَّق (`accounts.controller.ts:44-49` بلا `@NoAudit`؛ `audit_logs.screen`/`action` — `prisma/schema.prisma:2687-2688`).

### ر-٥ · القياس (القسم ٦) — عمى محتمل وتصحيحات

1. **مُثبَّتاتُ الاختبارات تلوّث العدّ — وهو أخطرُ ما في القسم ٦.** `src/zatca/icv-concurrency.live.spec.ts:110-157` ينشئ منشأةً `probe-icv-*` **بلا دليلٍ إطلاقاً** (لا `createDefaultChart`) وفاتورتين **بإدراجٍ خام** `baseTotal = 115` بلا قيد، و`afterAll` (160-164) **لا يحذفها**. فكلُّ تشغيلٍ على قاعدةٍ يضيف منشأةً إلى 6.أ (ناقصةَ الرموز الستّة عشر كلّها) وفاتورتين إلى 6.ب. وكذلك `scripts/benchmark-property-kpis.ts:107-124` يُدرج دفعاتِ إيجار `notes = 'BM-PAYMENT'` بلا قيد، و`--keep` (227-228) يُبقيها. **فرقمُ 6.أ و6.ب على التطوير سيُقرأ «منشآتٌ حقيقية بلا قيد» وهو مُثبَّتات.**
   ⟵ يُفصل: `c."orgName" LIKE 'probe-%'` · `rent_payments.notes = 'BM-PAYMENT'`؛ ويُصنَّف 6.أ إلى «ناقصةُ الكلّ (١٦/١٦) = وُلدت بلا دليل» مقابل «ناقصةُ البعض = حُذف».
2. **مسبارُ 2.6 الأول نصفُ أعمى.** `common/i18n/messages.ts` يحمل NUL عمداً (ذاكرة المشروع)، والبحثُ **بالمجلّد** يتوقّف عنده: بحثي طبع «`binary file matches (found "\0" byte around offset 169981)`»، وحالتا التحكّم (`:64` و`:561`) **كلتاهما قبله** فلا تُثبتان رؤيةَ ذيل الملف. أعدتُ البحثَ **على الملف صراحةً**: التحكّمُ `account_system_protected` وُجد في `:561` **و`:1702`** (بعد الـNUL)، و`account_missing|accounts_missing|chart_incomplete|missing_account|posting_account` = **صفر**. **فالنفيُ صحيح — بمسبارٍ صار مُصادَقاً الآن.**
3. **`reported_to_zatca` يقيس الحالةَ لا الطابور.** الحدثُ يُكتب في `outbox_events` داخل المعاملة (`invoices.service.ts:698-702` · `prisma/schema.prisma:6538-6563`)، و`zatcaStatus` يبقى `NOT_SUBMITTED` حتى يعالجه الموزّع — فعلى قاعدةٍ بلا اعتمادٍ يعطي العمودُ صفراً وهو «أُرسل إلى الطابور». يُضاف: `EXISTS (SELECT 1 FROM outbox_events o WHERE o.type = 'invoice.issued' AND o.payload->>'invoiceId' = invoices.id)` (القيمةُ من `shared/events/domain-events.ts:12`، والمفتاحُ من `invoices.service.ts:701`).
4. **`base_sum` يخلط عملتين:** `contracts."settlementAmount"` بعملة العقد لا الأساس (`contracts.service.ts:340,366` — لا `toBaseAmount` على المخزَّن). صغيرٌ لكنه يُعلَن.
5. **جداولُ صفّ الأقساط اسمُها `contract_installments`** (`prisma/schema.prisma:5082`) — لمن يوسّع 6.د.
6. **عددُ أسطر حذف الحسابات في الاختبارات ١٣ لا ١٤**: `bank-account-link:111` · `trial-balance:75` · `journal-tenant-isolation:139,144,145` · `i18n-error-messages:89` · `cash-drawers:59` · `opening-after-movement:78` · `account-opening-date:80` · `opening-balance-entries:48,220,258,263` — و`default-chart.e2e-spec.ts:180` بـ`deleteMany`. لا يمسّ الحكم.
7. **استعلاماتُ التراكب (ر-٢) — بدورٍ متجاوزٍ للعزل كما في 6.0:**

```sql
-- سنداتُ قبضٍ مرحَّلة على فواتير غير مرحَّلة (دائنُ 1200 بلا مدين)
SELECT p."companyId", count(DISTINCT p.id) AS receipts, round(sum(a.amount), 2) AS allocated
FROM payments p
JOIN payment_allocations a ON a."paymentId" = p.id
JOIN invoices i ON i.id = a."invoiceId"
WHERE p."journalEntryId" IS NOT NULL AND i."journalEntryId" IS NULL AND i."baseTotal" > 0
GROUP BY 1;

-- مرآتُها للمورّدين
SELECT sp."companyId", count(DISTINCT sp.id) AS payments, round(sum(sa.amount), 2) AS allocated
FROM supplier_payments sp
JOIN supplier_payment_allocations sa ON sa."paymentId" = sp.id
JOIN purchases pu ON pu.id = sa."purchaseId"
WHERE sp."journalEntryId" IS NOT NULL AND pu."journalEntryId" IS NULL AND pu."baseTotal" > 0
GROUP BY 1;

-- الأثرُ في الدفتر: 1200 سالب و2400 مدين (من السطور لا من عمود balance)
SELECT a."companyId", a.code, round(sum(l.debit - l.credit), 2) AS debit_minus_credit
FROM accounts a JOIN journal_lines l ON l."accountId" = a.id
WHERE a.code IN ('1200', '2400')
GROUP BY a."companyId", a.code
HAVING (a.code = '1200' AND sum(l.debit - l.credit) < 0)
    OR (a.code = '2400' AND sum(l.debit - l.credit) > 0);
```
   ⚠️ الأخيرُ **مؤشّرٌ لا نسبة**: قيدٌ يدويّ على `1200` يُنتج الأثرَ نفسَه. ويُصادَق بالحالتين على قاعدة اختبار: منشأةٌ معزولة وليدة بفاتورةٍ مرحَّلة وسند قبضها كاملاً **يجب ألّا تظهر** (`1200` = صفر)، ومنشأةُ الحالة ⑦ أدناه **يجب أن تظهر** — لا منشآتُ العرض على التطوير، فحالُها غيرُ معلوم (ذاكرة المشروع: `demo-company-a` مشبعة).

### ر-٦ · الاختبار (القسم ٤) — ما يُضاف كي لا يشهد لنفسه

- ⑦ **التراكب:** حذف `4100` ⟵ فاتورة (`201` بلا قيد اليوم) ⟵ `POST /payments` بتخصيصها ⟵ **توكيد: رصيدُ `1200` من `GET /accounts` = `-115`** اليوم. بعد الإصلاح لا تُنشأ الفاتورة أصلاً.
- ⑧ **الاستحقاق ثم الاعتراف:** حذف `1200` (منشأةٌ وليدة بلا فواتير) ⟵ عقدٌ مصنَّف بقسطٍ حلّ وفترةُ خدمته انقضت ⟵ `RentRecognitionService.runForContract` (`contracts/rent-recognition.service.ts:62-64`) ⟵ **توكيد: رصيدُ `2400` مدين** اليوم. **وحالةُ تحكّمٍ لازمة** على منشأةٍ كاملة بالعقد نفسه تُثبت أن الاستحقاق وقع فعلاً (صفٌّ في `rent_accruals` بقيد) — وإلا مرّ ④ و⑧ لسببٍ آخر (عقدٌ غيرُ مصنَّف أو قسطٌ لم يحلّ: `rent-accrual.util.ts:246-266`).
- ⑨ **محاولةُ البطاقة** (إن بُني الإصلاح): المحاولةُ على منشأةٍ حذفت `4100` **تُرفض عند الإنشاء قبل الشحن** — توكيد: لا `chargeStartedAt` على المحاولة. (لم أقرأ حزمةَ اختبار المحاولات القائمة لأعرف محوّلَها التجريبي — يُقرأ قبل الكتابة.)
- **ولا اختبارَ مقترحاً لشقّ «أعلن»** نفسِه: نقطةُ العدّ أو الهجرة تُثبَت بصفٍّ غير مرحَّلٍ **يُزرع خاماً** ثم يُطالَب العدُّ به — **بسياقٍ وبلا سياق** (الثاني يجب أن يُسقط لا أن يعيد صفراً).

### ر-٧ · ما لم أتحقّق منه

- سلوكُ `HttpExceptionFilter` في شكل `message` (نصٌّ أم مصفوفة) — يمسّ توكيد `toContain('4100')` في ①.
- هل يوجد اختبارٌ قائمٌ يمرّ اليوم **بفضل** التخطّي على منشأةٍ بدليلٍ جزئيّ غير `period-lock-tz.live.spec.ts:181-189` — لم أقرأ الحزمة كلّها.
- على أيّ قاعدةٍ شُغّل `icv-concurrency.live.spec.ts` فعلاً (التطوير أم قاعدة الفحص) — فحجمُ التلوّث يُقاس لا يُفترض.
