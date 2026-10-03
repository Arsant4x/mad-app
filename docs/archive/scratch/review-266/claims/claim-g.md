# الدعوى ز — حسابُ فروق الصرف واحدٌ للربح والخسارة

> **المصدر المقروء**: `D:\worktrees\outbox-266` (نسخة `main` نظيفة + تغيير outbox لا يمسّ الموضوع) — قراءةٌ وبحثٌ فقط.
> لم يُشغَّل اختبارٌ ولا `prisma` ولا بناء، ولم يُعدَّل ملفٌّ خارج هذا التقرير.
> كل مسارٍ أدناه نسبيٌّ إلى جذر النسخة المذكورة.
> **أمسّ افتراضاً سعودياً؟ لا**: رموز الحسابات ليست علاماتٍ سعودية، والدعوى لا تمسّ عملةً بعينها (`§3.8`).

---

## (1) الدعوى بنصّها

> «ز. حسابُ فروق الصرف واحدٌ للربح والخسارة. ⇒ يُسجَّل ولا يُبنى.»

والمطلوب: توثيقٌ دقيق لأيّ حسابٍ (أو حسابات) تُرحَّل عليه اليوم أرباحُ فروق الصرف المحقَّقة وخسائرُها، وأين يقع ذلك في الشيفرة، وما الذي يلزم لفصلهما. **بلا تصميمٍ معمَّق.**

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### ٢-أ · الثابت الواحد وتعليله المكتوب

- `apps/api/src/journal/auto-posting.util.ts:38-41`:
  ```ts
  /** Currency gains and losses on settlement — the owner picked 5600 for this.
   * A single account carries both directions: a gain lands as a credit against
   * it, which is how a one-line FX difference is conventionally presented. */
  export const FX_DIFFERENCE_ACCOUNT = '5600';
  ```
  **فالحسابُ الواحد تصميمٌ مكتوبٌ صراحةً** لا سهو: الربحُ يُرحَّل **دائناً** على الحساب نفسِه، والخسارةُ **مديناً**.

### ٢-ب · الحساب في الدليل الافتراضي: نوعه «مصروف» واسمه يعلن الاتجاهين

- `apps/api/src/accounts/default-chart.ts:92-94`:
  ```ts
  // 5600 لا 5500: وثيقة تعدد العملات سمّت 5500 لفروق العملة، لكن الرمز كان
  // محجوزاً لمصروفات التأسيس أعلاه.
  { code: '5600', name: 'فروق عملة (ربح/خسارة)', type: 'expense' },
  ```
- **لا حسابَ ربحٍ مستقلّ** في الدليل: الإيراداتُ فيه ثلاثةٌ فقط `4100` · `4200` · `4300` (`default-chart.ts:80-83`)، ولا ثابتَ حسابٍ بنمط `'4xxx'` في الشيفرة غير هذه الثلاثة (البحث: Grep `'4[0-9]{3}'` على `apps/api/src` بلا ملفات `spec` ⟵ ١٨ نتيجة كلُّها `4100`/`4200`/`4300` — `default-chart.ts:80-83` و`auto-posting.util.ts:111…1614`).
- الحسابُ **قابلٌ لتغيير الاسم والنوع** من التاجر ولا يُغيَّر رمزُه: `apps/api/src/accounts/dto/update-account.dto.ts:5-12` (حقلا `name` و`type` فقط، والنوع من الخمسة). وتعليقُ الدليل نفسُه: «ليست مقفلة … تُعدَّل وتُحذف» (`default-chart.ts:30-32`).

### ٢-ج · مَن يرحّل على `5600` — بانيان اثنان لا غير، وأربعة مسارات أعمال

| # | البانِي | سطرُ الفرق | الاتجاه | المستدعي (مسار العمل) |
|---|---|---|---|---|
| ١ | `postRentPaymentEntry` (`auto-posting.util.ts:938-989`) | `fxDifference = round2(cash − revenue)` (`:950`) | `> 0` ⟵ **دائن** `5600` (`:970-972`) · `< 0` ⟵ **مدين** `5600` (`:973-975`) | قبضُ إيجارٍ على **المسار القائم/أساس القبض** — `contracts.service.ts:490-509` (حين `!accrualPath`، `:483`) |
| ٢ | `postPartySettlementEntry` (`auto-posting.util.ts:1267-1300`) | `fxGain = round2(receivable ? cash − settled : settled − cash)` (`:1275`) | `signedLine(5600, fxGain, false)` (`:1287`) ⟵ الموجبُ **دائن**، السالبُ **مدين** (`:1262-1265`) | (أ) سند القبض من عميل ⟵ `postCustomerPaymentEntry` (`:1559-1570`) ⟵ `payments.service.ts:701` (`postAndSettle`) — يستدعيه الإنشاء `:223` والعكس `:490`/`:504` والردُّ `:596`/`:609` وتحصيلُ الكاشير `:341` · (ب) سند الصرف لمورّد ⟵ `postSupplierPaymentEntry` (`:1596-1607`) ⟵ `supplier-payments.service.ts:351` — الإنشاء `:180` والعكس `:305`/`:317` · (ج) قبضُ إيجارٍ **استحقاقيّ** مباشرةً ⟵ `contracts.service.ts:570-581` |

- **ولا ترحيلَ آخر يمسّ `5600`**: Grep `FX_DIFFERENCE_ACCOUNT` على `apps` ⟵ ٨ نتائج: التعريف (`auto-posting.util.ts:41`) + الاستعمالات الخمسة في البانيَين (`:957` `:972` `:974` `:1278` `:1287`) + حارس الدليل (`default-chart.spec.ts:10,39`). وGrep `'5600'` حرفياً على `apps/api/src` لا يجد ترحيلاً آخر (بقيّتُه تعليقاتٌ في `reports.service.ts:753` · `receivables-exposure.util.ts:26,94` · `contracts.service.ts:571` · `payments.service.ts:454` · ومجسٌّ `fiscal/period-lock-tz.live.spec.ts:189`).
- **ولا إعادةَ تقييمٍ لغير المحقَّق**: Grep `(?i)fxGain|fxDifference|fxLoss|exchangeDiff|unrealized|unrealised|revaluat` على `apps/api/src` ⟵ النتائج كلُّها في البانيَين أعلاه فقط (`auto-posting.util.ts:950-974` و`:1275-1287`) — **ضابطُ البحث**: النمطُ نفسُه وجد `fxGain`/`fxDifference` فالمسبارُ يرى. (ويوافقه المسحُ القائم `docs/domain-scan/01-الأستاذ-والقيد-والإقفال.md:111` — «لا قيدَ نهاية فترةٍ للبنود المفتوحة».)
- **ولا هجرةَ تذكر `5600`**: Grep `5600` على `apps/api/prisma/migrations` ⟵ صفر. **ضابطٌ يجد**: Grep `'(1000|1200|2100|3900|5800|2400)'` على المجلد نفسِه ⟵ `20260916090000_journal_line_party/migration.sql:86,88`.
- **ولا ذكرَ في الواجهة**: Grep `5600` على `apps` لم يُرجع ملفاً تحت `apps/web` (النتائج كلُّها تحت `apps/api`)؛ وGrep `(فروق|فرق|فرقُ) ?(ال)?(صرف|عملة|العملة)` على `apps` ⟵ لا نتيجة في `apps/web` — **ضابطُه** أن النمطَ نفسَه وجد `default-chart.ts:94`.

### ٢-د · كيف يظهر ذلك في التقارير — **صافياً لا إجمالياً**

- قائمةُ الدخل تجمع **بالنوع**: المصروفاتُ = حساباتُ `type === 'expense'` بمبلغ `مدين − دائن` في الفترة (`apps/api/src/reports/reports.service.ts:542-544` و`:1255-1258`). **فـ`5600` سطرٌ واحد في المصروفات بصافي الاتجاهين**: ربحٌ صافٍ يظهر **مصروفاً سالباً**، وربحُ ١٠ مع خسارة ١٠ في الفترة نفسها يظهران **صفراً**.
- المركزُ المالي ونتيجةُ الفترة بالنوع كذلك (`reports.service.ts:585-597`)، وإقفالُ السنة يجمع `revenue`/`expense` بالنوع (`apps/api/src/fiscal/year-closing.util.ts:79,148-149`).
- والاختبارُ القائم يوثّق الصافي على حساب المصروف صراحةً: «Credit against an expense account: the balance moves by -50» (`apps/api/test/activities-currencies.e2e-spec.ts:370-371`).

### ٢-هـ · الاختبارات التي **تعقد** على `5600` بالرمز

| الملف:السطر | ما يؤكّده | الاتجاه |
|---|---|---|
| `test/payments.e2e-spec.ts:273-293` | قبضٌ دولاري: فاتورة 3.70 وتحصيل 3.80 ⟵ `5600` **دائن 10** | ربح |
| `test/supplier-payments.e2e-spec.ts:287-297` | سدادٌ دولاري: شراء 3.70 وسداد 3.80 ⟵ `5600` **مدين 10** | خسارة |
| `test/activities-currencies.e2e-spec.ts:355-371` | إيجارٌ 3.75 يُقبض 3.80 ⟵ رصيد `5600` يتحرّك **−50** | ربح |
| `test/activities-currencies.e2e-spec.ts:389-394` | يُقبض 3.70 ⟵ رصيد `5600` **+50** | خسارة |
| `test/activities-currencies.e2e-spec.ts:397-405` | بلا فرق ⟵ `5600` لا يتحرّك | — |
| `src/accounts/default-chart.spec.ts:37-48` | كل ثابتٍ مُصدَّر (ومنه `FX_DIFFERENCE_ACCOUNT`) موجودٌ في الدليل | — |

ولا وسم `[SPEC 3.10]` على أيّ اختبار (Grep `SPEC[^\]]*3\.10` على الشجرة ⟵ صفر؛ **ضابطٌ يجد**: Grep `\[SPEC 3\.` على `apps` ⟵ `period-lock-tz.live.spec.ts:223` وغيرُه) — وهو متّسقٌ مع أن `SPEC.md:81` يقول 🟨 عنه.

### ٢-و · ملاحظةٌ جانبية: **الوثيقتان تتخلّفان عن الشيفرة في نطاق `5600`**

- `CLAUDE.md:341` (الصفّ في `§4`): «فروق 5600 على مسار سداد الإيجار فقط (`auto-posting.util.ts:154-170`)» — **والشيفرةُ اليوم** ترحّل الفرقَ على أربعة مسارات (٢-ج)، والأسطرُ المذكورة **قديمة** (البناءُ اليوم في `:950-975` و`:1275-1287`).
- `SPEC.md:81`: `| 3.10 | فروق العملة (ربح/خسارة) | ⬜ | 🟨 *(مسار الإيجار فقط)* |` — الوصفُ نفسُه متخلّف.
- و`CLAUDE.md:1391-1392` (قرار `6.7`) بصيغة المفرد: «تُقيَّد في **حساب** ربح/خسارة فروق العملة».

---

## (3) حكمٌ مبدئيّ بالقراءة

**قائمة — بوصفها وصفاً للحال.** كلُّ فرق صرفٍ محقَّقٍ في الشيفرة يُرحَّل على حسابٍ واحد `5600` بنوع `expense`، ربحاً (دائناً) وخسارةً (مديناً)، والتقاريرُ تعرضه صافياً في سطر مصروفٍ واحد. والدليلُ من ثلاثة مواضع مستقلّة: الثابت وتعليلُه (`auto-posting.util.ts:38-41`) · الدليلُ باسمه ونوعه (`default-chart.ts:94`) · والاختبارات التي تعقد على الرمز للاتجاهين (٢-هـ).

**ولكنها ليست عيباً مخفيّاً** — هي **قرارُ تصميمٍ مكتوب** («A single account carries both directions», `auto-posting.util.ts:39`). والحكمُ المطلوب «يُسجَّل ولا يُبنى» متّسقٌ مع ذلك: لا خطأَ في الدفتر (القيد متوازن، والصافي صحيح)، والفرقُ **في العرض والتحليل** لا في الصحّة.

**ولا يُحسم بالقراءة وحدها** سؤالٌ واحد: **هل وُجد في بيانات التطوير ما يجعل الصافي يُخفي إجمالياً ذا معنى** (منشأةٌ لها ربحٌ وخسارةٌ على `5600` معاً) — يُقاس بالاستعلام في (6-٣).

---

## (4) كيف تُقاس حيّاً — تصميمُ اختبار e2e

**الغرض**: إثباتُ أن ربحاً وخسارةً محقَّقَين يقعان على **حسابٍ واحد** اليوم، فيسقط الاختبار على الشيفرة الحالية **لسببه** لا لغيره.

**الملف المقترح**: `apps/api/test/fx-gain-loss-accounts.e2e-spec.ts` — بنمط `payments.e2e-spec.ts` حرفياً (التهيئة `:84-99`، المنشأة المعزولة `registerIsolatedCompany` — `test/isolated-company.ts:24`، والمساعدان `makeInvoice` `:34-46` و`entryOf` `:72-82`).

**الخطوات**:
1. منشأةٌ معزولة + عميل + فرع + صندوق `CASH_BOX` (كما `payments.e2e-spec.ts:92-98`).
2. فاتورتان بـ`USD` بسعر `3.7` وإجمالي `100` لكلٍّ (`makeInvoice(100, 'USD', 3.7)` — `:276`).
3. سند قبض **A** على الأولى بسعر `3.8` ⟵ ربحٌ 10؛ وسند قبض **B** على الثانية بسعر `3.6` ⟵ خسارةٌ 10 (`POST /payments` كما `:277-279`).
4. قراءةُ القيدَين بـ`entryOf`، واستخراجُ سطر الفرق من كلٍّ: السطرُ الذي **ليس** حسابَ الصندوق ولا `1200`.

**توكيداتُ عدم العمى أولاً** (تسبق الحكم — «التوكيد على الوجود يسبق التوكيد على الغياب»):
- كلُّ قيدٍ فيه **ثلاثةُ أسطر**، وسطرُ الفرق موجودٌ بمبلغ `10.00` — A **دائن**، B **مدين**.

**التوكيدُ الذي يسقط على الشيفرة الحالية**:
```ts
expect(gainLine.account.code).not.toBe(lossLine.account.code);   // اليوم: '5600' === '5600' ⟵ يسقط
```
**وتوكيدٌ ثانٍ من التقرير** (`GET /reports/income-statement?from=<اليوم>&to=<اليوم>` — `reports.controller.ts:48`): ربحُ 10 يظهر في `revenue`، وخسارةُ 10 في `expenses`. **اليوم** يظهر سطرُ `5600` في `expenses` بـ`0.00` (صافي +10 −10 — `reports.service.ts:542-544`) ولا سطر في `revenue` ⟵ يسقط.

**وتوكيدٌ ثالث — العكس لا يُضخّم الإجماليَّين** (`POST /payments/:id/reverse` — `payments.controller.ts:65`) على A: حسابُ الربح صافيه صفر، **وحسابُ الخسارة لم يتحرّك**. (اليوم يمرّ على الحساب الواحد بالمصادفة البنيوية؛ وهو الذي يمسك الإصلاحَ الخاطئ في (5).)

⚠️ **حدُّ الاختبار**: التوكيدُ الأول يثبت «حسابٌ واحد» فقط؛ ولا يثبت أن فصلهما **مطلوب** — ذاك قرارُ عرضٍ للمالك، والدعوى نفسُها «يُسجَّل ولا يُبنى».

---

## (5) إن كانت قائمة: ما يلزم لفصلهما (بلا تصميمٍ معمَّق)

> الدعوى قائمةٌ وصفاً، والحكمُ المطلوب **تسجيلٌ لا بناء**. فهذا ما يلزم **لو** قُرّر الفصلُ يوماً.

**المواضع:**
1. **ثابتان بدل واحد** في `auto-posting.util.ts:38-41` — مثلاً إبقاء `5600` للخسارة (`expense`) وحسابٌ **جديد** للربح بنوع `revenue` (رمزُه قرارٌ للمالك؛ لا ثابتَ `4xxx` غير `4100/4200/4300` اليوم — ٢-ب).
2. **الحسابُ الجديد يُنشأ عند أول حاجة، لا بـ`resolveAccountIds`**: `resolveAccountIds` تُعيد `null` إن نقص رمزٌ واحد (`auto-posting.util.ts:23-27`)، والبانيان **يسقطان القيدَ كلَّه** حينها (`:958-959` و`:1279-1280`). فإضافةُ رمزٍ جديد إلى `needCodes` بلا إنشاءٍ للمنشآت القائمة **تُسقط قيدَ كلّ سندٍ فيه ربحُ صرف صامتاً** — نقدٌ دخل بلا قيد. **النمطُ القائم للعلاج**: `getOrCreateDeferredRevenueAccount` لـ`2400` بتعليله (`:964-966`)، و`getOrCreateAccountByCode` (`journal/pos-settlement.util.ts:39`)، وحسابُ التلف `5800` (`default-chart.ts:97-99`).
3. **اختيارُ الحساب بالاتجاه الطبيعي للسند لا بإشارة المبلغ** — وهو الفخّ الوحيد الحقيقي:
   - العكسُ يمرّ **بالبانِي نفسِه بمبالغ سالبة**: `payments.service.ts:440-467` (المبلغ والذمّة سالبان) ثم `postAndSettle(... reversal: true)` `:490-504`؛ ومثله `supplier-payments.service.ts:273-280` و`:305-317`. فـ`fxGain` في العكس **مقلوبُ الإشارة** (`auto-posting.util.ts:1275`).
   - فلو اختير الحسابُ بإشارة `fxGain` لذهب **عكسُ الربح مديناً على حساب الخسارة** — الصافي صحيح، **والإجماليّان يتضخّمان معاً**، وهو عكسُ غرض الفصل.
   - و`PartySettlementForPosting` **لا يحمل علَمَ العكس** اليوم (`auto-posting.util.ts:1242-1259`)؛ العلَمُ يصل `postCustomerPaymentEntry`/`postSupplierPaymentEntry` ولا يُستعمل إلا في المذكّرة (`:1563` و`:1600`). فيلزم تمريرُه إلى البانِي واختيارُ الحساب بـ`reversal ? −fxGain : fxGain`.
   - والردُّ على مرتجع (`refund`) **لا فرقَ صرفٍ فيه بالبناء** — الذمّةُ بالسعر نفسِه (`payments.service.ts:596-609`: `baseReceivable = −toBaseAmount(amount, rate)`)؛ وكذا تحصيلُ الكاشير (`:341-354`).
   - مسارُ الإيجار `postRentPaymentEntry` لا عكسَ له في الشيفرة (Grep `rentPayment\.(delete|update)|removePayment|deletePayment|reversePayment` على `apps/api/src` ⟵ نتيجةٌ واحدة فقط `contracts.service.ts:583` وهي تحديثُ `journalEntryId` — فالمسبارُ يرى، ولا مسارَ حذفٍ أو عكس)؛ فالاختيارُ بالإشارة فيه (`:970-975`) سليم.
   - عكسُ القيد اليدويّ (`postReversalEntry`) يقلب السطورَ **بحساباتها نفسِها** (`auto-posting.util.ts:72-95`) — لا يتأثّر.
4. **الدليلُ الافتراضي** (`default-chart.ts:92-94`) + حارسُه (`default-chart.spec.ts:37-48` — يُضاف الثابتُ الجديد إلى `exported`).

**ما ينكسر (مقروءاً):**
- توكيدا الربح على الرمز `5600`: `test/payments.e2e-spec.ts:293` و`test/activities-currencies.e2e-spec.ts:371` — ينتقلان إلى حساب الربح. وتوكيدا الخسارة (`supplier-payments.e2e-spec.ts:297` · `activities-currencies.e2e-spec.ts:394`) يبقيان إن بقي `5600` للخسارة.
- **القديمُ في الدفتر لا يُنقل**: أسطرُ الربح الدائنة على `5600` قبل الفصل تبقى عليه (الدفترُ لا يُعدَّل — `CLAUDE.md §6.4`)؛ فتقريرُ فترةٍ تعبر تاريخَ الفصل **يخلط** الصافيَ القديم بالإجماليّ الجديد — يُعلَن ويُعدّ ولا يُصحَّح (نمطُ المشروع).
- **اسمُ `5600` في المنشآت القائمة لا يتغيّر**: الدليلُ «يحكم المولود الجديد وحده» (`CLAUDE.md` ملاحظة 4.7، و`createDefaultChart` بـ`skipDuplicates` — `default-chart.ts:120-125`) ⟵ يبقى «فروق عملة (ربح/خسارة)» وهو صار للخسارة وحدَها.
- الوثيقتان (٢-و) تحتاجان تصحيحاً في كل حال.
- **لا ينكسر**: مطابقةُ أعمار الذمم مع `1200` (تقرأ `1200` لا `5600` — `receivables-exposure.util.ts:24-27,94`)، والإقفالُ السنويّ (بالنوع — `year-closing.util.ts:79,148-149`)، وقائمةُ الدخل (بالنوع — `reports.service.ts:539-544`).

**كسرٌ محتمل للإثبات بالعكس (صياغةٌ يكتبها مطوّرٌ فعلاً):**
- **الكسر ①**: اختيارُ الحساب بإشارة المبلغ الخام — `signedLine(fxGain > 0 ? ids.get(FX_GAIN)! : ids.get(FX_LOSS)!, fxGain, false)` — وهي أقربُ ما يُكتب. **يسقط عليه** التوكيدُ الثالث في (4): عكسُ A يحرّك حسابَ الخسارة.
- **الكسر ②**: إضافةُ رمز الربح إلى `needCodes` في `resolveAccountIds` بدل إنشائه عند الحاجة. **يُمسَك** بحالةٍ تُحذف فيها حساباتُ الربح من منشأةٍ معزولة قبل السند (حسابٌ بلا حركة يُحذف) ثم يُؤكَّد `pay.body.journalEntryId` غيرَ `null`.

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل أيّ تغيير

⚠️ **العزل**: `accounts` و`journal_entries` و`journal_lines` تحت `ENABLE` + `FORCE ROW LEVEL SECURITY` (`prisma/migrations/20260719160445_init/migration.sql:155-156` · `20260719231124_journal/migration.sql:16,74-75,80-81`). فالعدُّ بـ`app_user` **بلا سياق يعود صفراً بنجاح**. طريقان:

- **(أ) بدورٍ يتجاوز RLS عمداً (المالك `mad_app` الخارق) — للقراءة وحدها**، مع **ضابطٍ يُثبت أن المسبار يرى** قبل قراءة أيّ رقم:
  ```sql
  -- الضابط: يجب أن يكونا متقاربين (كل منشأة تولد بدليل — default-chart.ts:7-14)
  SELECT current_user, current_setting('is_superuser') AS su,
         (SELECT count(*) FROM companies)                          AS companies,
         (SELECT count(*) FROM accounts WHERE code = '1200')       AS with_1200;
  ```
  فإن جاء `with_1200 = 0` فالمسبارُ أعمى، وكلُّ صفرٍ بعده باطل.

- **(ب) بـ`app_user` داخل سياق كل منشأة** (`companies` بلا RLS في الهجرات — Grep `ALTER TABLE "?(companies|accounts|journal_lines|journal_entries)"? (ENABLE|FORCE)` لم يُرجع `companies`، والنمطُ نفسُه وجد الثلاثة الأخرى):
  ```sql
  BEGIN;
  DO $$
  DECLARE r record; n_co int := 0; n_seen int := 0; g numeric := 0; l numeric := 0; both int := 0; cg numeric; cl numeric;
  BEGIN
    FOR r IN SELECT id FROM companies LOOP
      PERFORM set_config('app.company_id', r.id, true);
      n_co := n_co + 1;
      IF current_setting('app.company_id', true) = r.id AND EXISTS (SELECT 1 FROM accounts WHERE code = '1200') THEN n_seen := n_seen + 1; END IF;  -- ضابطُ الرؤية
      SELECT coalesce(sum(jl.credit),0), coalesce(sum(jl.debit),0) INTO cg, cl
        FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" WHERE a.code = '5600';
      g := g + cg; l := l + cl;
      IF cg > 0 AND cl > 0 THEN both := both + 1; END IF;
    END LOOP;
    RAISE WARNING 'companies=% seen_with_1200=% gains_on_5600=% losses_on_5600=% companies_with_both=%', n_co, n_seen, g, l, both;
  END $$;
  ROLLBACK;
  ```

**الاستعلامات (بالطريق أ؛ وكلٌّ منها يُعاد داخل حلقة ب إن لزم):**

**٦-١ · وجودُ `5600` ونوعُه واسمُه لكل منشأة** (التاجر يملك تغيير النوع والاسم — `update-account.dto.ts:5-12`):
```sql
SELECT count(*)                                                        AS companies,
       count(a.id)                                                     AS with_5600,
       count(*) FILTER (WHERE a.id IS NOT NULL AND a.type <> 'expense') AS retyped,
       count(*) FILTER (WHERE a.id IS NOT NULL AND a.name <> 'فروق عملة (ربح/خسارة)') AS renamed
FROM companies c
LEFT JOIN accounts a ON a."companyId" = c.id AND a.code = '5600';
```

**٦-٢ · أسطرُ `5600` بالاتجاه وبالمصدر (آليّ/يدويّ):**
```sql
SELECT je.auto,
       count(*) FILTER (WHERE jl.credit > 0) AS gain_lines,  coalesce(sum(jl.credit),0) AS gains,
       count(*) FILTER (WHERE jl.debit  > 0) AS loss_lines,  coalesce(sum(jl.debit),0)  AS losses
FROM journal_lines jl
JOIN accounts a         ON a.id  = jl."accountId"
JOIN journal_entries je ON je.id = jl."journalEntryId"
WHERE a.code = '5600'
GROUP BY je.auto;
```

**٦-٣ · المنشآتُ التي يُخفي فيها الصافي إجمالياً** (ربحٌ وخسارةٌ معاً — وهو السؤال الوحيد الذي لا تحسمه القراءة):
```sql
SELECT count(*) AS companies_with_both, coalesce(sum(g),0) AS gross_gains, coalesce(sum(l),0) AS gross_losses
FROM (SELECT jl."companyId", sum(jl.credit) AS g, sum(jl.debit) AS l
        FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId"
       WHERE a.code = '5600'
       GROUP BY jl."companyId"
      HAVING sum(jl.credit) > 0 AND sum(jl.debit) > 0) x;
```

**٦-٤ · أسطرُ `5600` الآتية من عكسٍ** (مذكّراتُ العكس من `auto-posting.util.ts:1563` و`:1600`، وعكسُ القيد اليدوي بـ`reversalOfId`) — حجمُ ما سيُصيبه الكسر ① لو وقع:
```sql
SELECT count(*) FILTER (WHERE je.memo LIKE 'عكس مقبوض%' OR je.memo LIKE 'عكس سداد لمورّد%') AS document_reversals,
       count(*) FILTER (WHERE je."reversalOfId" IS NOT NULL)                              AS entry_reversals,
       count(*)                                                                            AS all_5600_lines
FROM journal_lines jl
JOIN accounts a         ON a.id  = jl."accountId"
JOIN journal_entries je ON je.id = jl."journalEntryId"
WHERE a.code = '5600';
```

**٦-٥ · رموزُ `4xxx` التي أنشأها التجّار** (قبل اختيار رمزٍ لحساب الربح — تصادمٌ محتمل؛ الفهرسُ الفريد `(companyId, code)` يرفض المكرَّر داخل المنشأة):
```sql
SELECT code, count(DISTINCT "companyId") AS companies, string_agg(DISTINCT name, ' | ') AS names
FROM accounts
WHERE code LIKE '4%' AND code NOT IN ('4100','4200','4300')
GROUP BY code ORDER BY code;
```

**٦-٦ · المسارُ صاحبُ الأسطر** (من المذكّرات المعروفة — `auto-posting.util.ts:980` · `:1563` · `:1600` · `contracts.service.ts:576`):
```sql
SELECT CASE
         WHEN je.memo LIKE 'دفعة إيجار%'   THEN 'rent-cash-basis'
         WHEN je.memo LIKE 'قبض إيجار%'    THEN 'rent-accrual'
         WHEN je.memo LIKE 'مقبوض من عميل%' OR je.memo LIKE 'عكس مقبوض%' THEN 'customer-receipt'
         WHEN je.memo LIKE 'سداد لمورّد%'   OR je.memo LIKE 'عكس سداد لمورّد%' THEN 'supplier-payment'
         WHEN je.auto = false               THEN 'manual'
         ELSE 'other' END AS path,
       count(*) AS lines, sum(jl.credit) AS gains, sum(jl.debit) AS losses
FROM journal_lines jl
JOIN accounts a         ON a.id  = jl."accountId"
JOIN journal_entries je ON je.id = jl."journalEntryId"
WHERE a.code = '5600'
GROUP BY 1 ORDER BY 1;
```
(صفُّ `other` غيرُ الصفريّ يعني مسارَ ترحيلٍ على `5600` لم تجده القراءة — يُقرأ قبل البناء.)

---

## (7) ما لا أعرفه

1. **هل قرّر المالكُ الحسابَ الواحد صراحةً؟** التعليقُ يقول «the owner picked 5600» (`auto-posting.util.ts:38`) — **الرمزَ**؛ أما «A single account carries both directions» فتعليلُ المؤلّف. ولم أجد قراراً مسجَّلاً في الفصل أو الجمع: عددُ الأسطر في `docs/decisions.md` التي تحوي `ربح/خسارة` · `ربح وخسارة` · `أرباح فروق` · `خسائر فروق` · `FX_DIFFERENCE` · `فروق العملة` · `فروق عملة` = **صفر** لكلٍّ (قراءةٌ بـ`node` و`includes` لا بـ`grep` على نصٍّ عربيٍّ طويل)؛ **ضابطٌ يجد**: Grep `5600` على `docs/decisions.md` ⟵ ٤ أسطر (`596` · `2461` · `3024` · `3034`)، ولا يتناول أيٌّ منها الفصل (قُرئ سياقُ كلٍّ منها). و`SPEC.md` يذكر «(ربح/خسارة)» مرةً واحدة في عنوان البند (`:81`).
2. **الأرقام الفعلية** على التطوير (كم ربحاً وخسارةً، وهل توجد منشأةٌ بالاتجاهين) — لم تُقَس؛ استعلامات (6).
3. **المعيارُ المحاسبي**: أفهم من معرفةٍ عامة أن IAS 1 (الفقرة 35) يجيز عرضَ فروق الصرف **صافيةً** ما لم تكن جوهرية — **ولم أتحقّق من النصّ في هذه الجلسة**؛ فلا يُبنى عليه قبل قراءته من مصدره.
4. **وثائقُ الخطط تستعمل `5600` لغير فروق العملة**: `docs/plans/compound-master-plan.md:347,427,430` («أتعاب مدير العقار») و`docs/plans/media-production-full-spec.md:371,1933,2008` («إهلاك»). ليس في الشيفرة اليوم؛ لكنه يلزم عند أي فصلٍ أو ترقيم (تصادمٌ مخطَّط لا واقع).
5. **ملاحظةٌ خارج الموضوع لم تُقَس (فرضيةٌ بالقراءة)**: `allocate` يعيد توزيع سندٍ قائم **بلا إعادة ترحيل** (`payments.service.ts:385-415`)، والذمّةُ في قيد الإنشاء كانت «على الحساب» بسعر السند (`common/settlement/settlement.util.ts:199-202`). فإن وُزّع لاحقاً على فاتورةٍ أجنبيةٍ بسعرٍ آخر: **لا فرقَ صرفٍ يُعترف به عند التوزيع**، ثم **عكسُ السند** يحسب الذمّةَ من التخصيصات **الحالية** بأسعار فواتيرها (`payments.service.ts:455-467`) فلا يكون مرآةً لقيد الإنشاء على `5600`/`1200`. لم أُثبته بتشغيل؛ يستحق اختباراً مستقلاً قبل أن يُسمّى عيباً.
6. **لم أقرأ** شاشات الواجهة التي تعرض قائمة الدخل (`apps/web/src/pages/reports/ReportsPage.tsx`) لأرى كيف يُعرض سطرُ مصروفٍ سالب — والدعوى لا تتوقّف عليه.

---

## مراجعةٌ عدائية

> المراجِع: وكيلُ تحقّقٍ عدائيّ — قراءةٌ وبحثٌ فقط على `D:\worktrees\outbox-266`؛ لا اختبار ولا `prisma` ولا بناء. كلُّ مسارٍ نسبيٌّ إلى جذر النسخة.
> **ما طُوبق حرفاً وصحّ** (لا يُعاد): `auto-posting.util.ts:23-27` · `:38-41` · `:938-989` (`:950` · `:957-959` · `:970-975`) · `:1242-1300` (`:1262-1265` · `:1275` · `:1278-1280` · `:1287`) · `:1559-1570` · `:1596-1607` · `:72-102`؛ `default-chart.ts:30-32` · `:80-83` · `:92-94` · `:120-125`؛ `contracts.service.ts:483` · `:490-509` · `:570-583`؛ `payments.service.ts:223` · `:341-354` · `:385-415` · `:440-505` · `:554-609` · `:701`؛ `supplier-payments.service.ts:180-192` · `:273-280` · `:305-318` · `:351`؛ `reports.service.ts:539-544` · `:585-597` · `:1255-1258`؛ `year-closing.util.ts:79` · `:148-149`؛ `payments.controller.ts:65` · `reports.controller.ts:48` · `test/isolated-company.ts:24`؛ الاختبارات في (٢-هـ) كلُّها؛ `SPEC.md:81` · `CLAUDE.md:341` · `:1391`؛ عدُّ Grep `FX_DIFFERENCE_ACCOUNT` = ٨ و`'4[0-9]{3}'` = ١٨؛ `docs/decisions.md` بـ`5600` = ٤ أسطر (`596` `2461` `3024` `3034`)؛ لا وسم `[SPEC …3.9|3.10]` (ضابطٌ يجد: النمطُ نفسُه على `3.7` وجد `period-lock-tz.live.spec.ts` و`fiscal-year-delete-guard.e2e-spec.ts`).

### ع-١ · الحكمُ يقوم وصفاً — لكن جملتَه الحاكمة أوسعُ من الشيفرة

«**كلُّ فرق صرفٍ محقَّقٍ في الشيفرة يُرحَّل على حسابٍ واحد `5600`**» (القسم 3) **لا تصحّ بعمومها**. الصحيح: *كلُّ فرقٍ **يُعترَف به** يقع على `5600` من بانيَين اثنين* — وثمّة فروقٌ محقَّقةٌ **لا يُعترف بها في أيّ حساب**، أو **يسقط قيدُها كلُّه**. فجوابُ «على أيّ حسابٍ تقع؟» اليوم أربعة: `5600` · **لا شيء (باقٍ في `1200`/`2100`)** · **لا شيء (مطويٌّ في قيمة النقد بسعرٍ تاريخيّ)** · **لا قيدَ أصلاً**.

**أ) تطبيقُ الدفعة المقدَّمة — مسارٌ فاتَ التقرير كلُّه.** مستندُ 386 يصدر **بسعر سند القبض** (`invoices.service.ts:1232-1235` — `p.exchangeRate`)، ثم يُطبَّق على فاتورة التوريد **بسعرها هي** فيُرحَّل قيدُ التطبيق بـ`doc.baseTotal` أي بسعر السند (`invoices.service.ts:1320-1331` ⟵ `auto-posting.util.ts:180-202`: مدين `2450`/`2200` · دائن `1200` بالإجماليّ الأساسيّ للمقدَّم) **بلا سطر فرق**. فالفرقُ بين سعر المقدَّم وسعر التوريد **يبقى رصيداً يتيماً في `1200`** ولا يبلغ `5600`. **ولا فحصَ عملةٍ أصلاً** في `applyPrepayments` (`invoices.service.ts:1291-1334`)، والمقارنةُ `applied > invoice.total` (`:1311`) تجمع مبلغَين بعملتَين. **البحث**: Grep `prepayment_[a-z_]*currency|currency_mismatch` على `apps/api/src` (بلا `messages.ts`) ⟵ نتيجةٌ واحدة `settlement.util.ts:173` (فحصُ السند لا المقدَّم) — وهي **الضابطُ نفسُه** الذي يُثبت أن النمط يرى.

**ب) إعادةُ توزيع السند — الفرقُ لا يُعترف به عند التوزيع، ويظهر «شبحاً» عند العكس.** التقرير رآها في (7-5) «خارج الموضوع»، **وهي في صميمه** وتقع في الجانبين لا في القبض وحده: `payments.service.ts:385-415` **و**`supplier-payments.service.ts:207-237` (الأخيرة فاتت التقرير) يبدّلان التخصيصات **بلا إعادة ترحيل**؛ والعكسُ يحسب الذمّةَ من التخصيصات **الحالية** بأسعار مستنداتها (`payments.service.ts:455-467` · `supplier-payments.service.ts:268-280`). حسابٌ يدويّ بالقراءة: سندٌ `100 USD` على الحساب بسعر `3.8` ⟵ `مدين نقد 380 / دائن 1200 380` بلا فرق (`settlement.util.ts:199-202`)؛ يُوزَّع على فاتورة `3.7` ⟵ لا قيد؛ يُعكس ⟵ `cash = −380 · settled = −370 · fxGain = −10` (`auto-posting.util.ts:1275`) ⟵ **مدين `5600` 10** في العكس وحده. فرقٌ محقَّقٌ لم يُعترف به يوم وقع، وخسارةٌ وهميّة يوم العكس.

**ج) تعديلُ سعر فاتورة شراءٍ مسدَّدة — مسارٌ فاتَ التقرير.** التعديلُ يقبل `exchangeRate` (وحتى `currency`) على شراءٍ عليه تخصيصاتُ سداد ما دام لم يُستهلك ولا إشعارَ عليه ولا استلامَ مسجَّلاً (`purchases.service.ts:259-270`) والحارسُ الوحيد أن الإجماليَّ لا ينزل تحت المسدَّد (`:296-301`)، ثم يُعكس القيدُ ويُعاد بالسعر الجديد (`:289` · `:306-310` · `:395`). **وقيدُ السداد لا يُمسّ** ⟵ فرقُ الصرف المحسوب بالسعر القديم يبقى، والفرقُ الجديد يستقرّ رصيداً في `2100`؛ وعكسُ السداد لاحقاً يقرأ **السعرَ الجديد** (`supplier-payments.service.ts:268-280`) فلا يكون مرآةً للأصل. (فاتورةُ المبيعات محروسةٌ من هذا: `invoices.service.ts:737-773`.)

**د) الردُّ على مرتجع — لا «فرقَ بالبناء» بل فرقٌ مكتوم.** التقرير صادقٌ حرفياً (`payments.service.ts:554` · `:574` · `:603` · `:607`: النقدُ والذمّةُ كلاهما بسعر الإشعار)، لكن الوصف الأدقّ: **النقدُ الخارج يُقيَّم بسعر الفاتورة التاريخيّ لا بسعر يوم الردّ**، ولا حقلَ `exchangeRate` في طلب الردّ أصلاً — فالفرقُ المحقَّق **مطويٌّ في قيمة حساب النقد/البنك الأساسية** ولا يبلغ حساباً.

**هـ) الحالُ اليوم لا خطرُ الإصلاح: غيابُ `5600` يُسقط القيدَ كلَّه.** ما وصفه التقرير في (5-2) خطراً على **حسابٍ جديد** قائمٌ **اليوم على `5600` نفسِه**: `needCodes` يضمّه متى وُجد فرق (`auto-posting.util.ts:957` · `:1278`) و`resolveAccountIds` يعيد `null` (`:23-27`) فيسقط **قيدُ النقد والذمّة معاً** (`:958-959` · `:1279-1280`)، بينما مرآةُ البنك تتحرّك (`payments.service.ts:716-729` — `if (entry)` ثم `mirrorBankMovement` بلا شرط). و`5600` **قابلٌ للحذف** ما دام بلا سطور (`accounts.service.ts:216-243`؛ المحميّان نظامياً `3300` و`3900` وحدهما — `year-closing.util.ts:55-58`).

**و) مسدودٌ عمداً (يدعم الحكم):** نقلُ صندوقٍ بغير عملة المنشأة يُرفض لأنه «يحتاج سعرَ يومٍ وفرقَ صرف» (`banks.service.ts:92-93`) — فلا مسارَ ثالثاً يرحّل على `5600`.

### ع-٢ · تصحيحاتُ استشهاد

- «`update-account.dto.ts:5-12` (حقلا `name` و`type` فقط)» ⟵ **ليس «فقط»**: الـDTO يحمل كذلك `openingBalance` و`openingDate` (`update-account.dto.ts:14-21`). وهذا يمسّ القياس (ع-٣): رصيدٌ افتتاحيٌّ على `5600` **قيدٌ آليٌّ عليه** (`accounts.service.ts:161-202` ⟵ `opening-balance.util.ts:169` `auto: true`).
- «الحسابُ قابلٌ لتغيير … النوع» ⟵ **ما دام بلا سطور فقط**: `accounts.service.ts:146-153` يرفض تغيير النوع لحسابٍ عليه أيُّ سطرٍ (`account_type_locked`). فـ`retyped` في (6-١) لا يتجاوز منشآتٍ لم يقع عليها فرقٌ قطّ.
- `schema.prisma:5226` يذكر `5600` (تعليقٌ على `SupplierPayment`) — فات قائمة (٢-ج) للتعليقات؛ بلا أثر.

### ع-٣ · القياسُ (القسم 6) — سيعدّ ما ليس فرقَ صرف

**أخطر ما في التقرير**: الاستعلامات `6-2` · `6-3` · `6-4 (all_5600_lines)` · حلقة (ب) تجمع **كلَّ** سطرٍ على `5600`، وعلى `5600` قيودٌ آليّةٌ **معروفةٌ ليست فروقاً**:
- **قيدُ إقفال السنة** يصفّر `5600` بالجانب المقابل لرصيده (`year-closing.util.ts:77-96` · `:153-157` · `:171-178` — `auto: true`، `closingForFiscalYearId`)، **وعكسُه** عند إعادة فتح فترة (`:194-208` — `auto: true`).
- **القيدُ الافتتاحيّ** وقيدُ فرقه (`openingForAccountId`، `auto: true`).

⟸ منشأةٌ لها أرباحُ صرفٍ فقط ثم أُقفلت سنتُها تحمل **سطرَ إقفالٍ مديناً** على `5600` فتُعدّ في `6-3` «ربحاً وخسارةً معاً» — **إيجابٌ كاذب على السؤال الوحيد الذي قال التقرير إن القراءة لا تحسمه**. و`6-6` يضعها في `other` ثم يقول التقرير إن `other` «مسارٌ لم تجده القراءة» — **خطأ**: هي مساراتٌ معروفة. **التصحيح**: يُضاف إلى كلِّ استعلامٍ من `6-2`…`6-6` وإلى حلقة (ب):
```sql
AND je."closingForFiscalYearId" IS NULL
AND je."openingForAccountId"   IS NULL
AND NOT EXISTS (SELECT 1 FROM journal_entries o
                WHERE o.id = je."reversalOfId" AND o."closingForFiscalYearId" IS NOT NULL)
```
(وفي حلقة (ب) يلزم `JOIN journal_entries je ON je.id = jl."journalEntryId"` لأن الشرط على القيد.) ويُضاف إلى `6-6` صفّان صريحان `year-closing` و`opening` قبل `other`، فيبقى `other` إنذاراً حقيقياً.

**وعيبٌ نحويّ في حلقة (ب)**: المتغيّر `both` **كلمةٌ محجوزة في SQL** (`TRIM(BOTH …)`)؛ و`both := both + 1` و`RAISE WARNING … , both` تُمرَّر تعابيرُها إلى محلّل SQL فتسقط بخطأ نحويّ — سقوطٌ صاخبٌ لا صفرٌ صامت، لكنه يُبطل الطريق (ب) كما كُتب. يُسمّى `n_both`.

**والعدُّ بـRLS سليم**: `accounts`/`journal_entries`/`journal_lines` تحت `ENABLE+FORCE` (`20260719160445_init/migration.sql:155-156` · `20260719231124_journal/migration.sql:74-75,80-81`)، و`companies` بلا سياسة (Grep `ON "?companies"?` على الهجرات ⟵ فهارسُ ومشغِّلات فقط؛ ضابطٌ يجد: النمطُ نفسُه بـ`accounts` وجد `CREATE POLICY tenant_isolation_accounts` في `init:158`). والطريق (أ) بالدور الخارق يتجاوز `FORCE` — وضابطُه `with_1200` صحيح.

**واستعلاماتٌ ناقصة تقيس ع-١** (بالطريق (أ) بعد الضابط نفسه):
```sql
-- ع-١/هـ: سنداتٌ بلا قيد — منها ما سقط لغياب 5600
SELECT 'payments' t, count(*) FROM payments          WHERE "journalEntryId" IS NULL AND amount <> 0
UNION ALL SELECT 'supplier_payments', count(*) FROM supplier_payments WHERE "journalEntryId" IS NULL AND amount <> 0
UNION ALL SELECT 'rent_payments',     count(*) FROM rent_payments     WHERE "journalEntryId" IS NULL AND "netAmount" <> 0;

-- ع-١/أ: تطبيقُ مقدَّمٍ بسعرٍ أو عملةٍ تخالف فاتورةَ التوريد (فرقٌ باقٍ في 1200)
SELECT count(*) AS applications,
       sum(ip.gross * (pp."exchangeRate" - inv."exchangeRate")) AS residue_in_1200_if_same_currency,
       count(*) FILTER (WHERE pp.currency <> inv.currency) AS cross_currency
FROM invoice_prepayments ip
JOIN invoices pp  ON pp.id  = ip."prepaymentInvoiceId"
JOIN invoices inv ON inv.id = ip."invoiceId"
WHERE pp."exchangeRate" <> inv."exchangeRate" OR pp.currency <> inv.currency;

-- ع-١/ب·أ: سندُ قبضٍ تخصيصُه الحاليّ بسعرٍ يخالف سعرَه وقيدُه بلا سطر 5600 (إعادةُ توزيعٍ أو مقدَّمٌ طُبِّق)
SELECT count(DISTINCT p.id)
FROM payments p
JOIN payment_allocations pa ON pa."paymentId" = p.id
JOIN invoices i ON i.id = pa."invoiceId"
WHERE p."reversesId" IS NULL AND p.kind <> 'REFUND' AND p."journalEntryId" IS NOT NULL
  AND i."exchangeRate" <> p."exchangeRate"
  AND NOT EXISTS (SELECT 1 FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId"
                  WHERE jl."journalEntryId" = p."journalEntryId" AND a.code = '5600');
```
(أسماءُ الجداول من `schema.prisma`: `payments:5176` · `payment_allocations:5213` · `supplier_payments:5285` · `rent_payments:5372` · `invoice_prepayments:1654` · `invoices:1616`. **لم تُشغَّل** — صحّتُها النحوية بالقراءة.)

### ع-٤ · اختبارُ القسم 4 — ليس أعمى، لكن توكيدَه الثالث يُوصف خطأً

- التوكيدان الأول والثاني يسقطان على الشيفرة الحالية **لسببهما**، والتمهيدُ (ثلاثةُ أسطر وسطرُ فرقٍ `10.00` بالاتجاهين) يمنع العمى. ✔
- التوكيدُ الثالث «**اليوم يمرّ … بالمصادفة البنيوية**» **خطأ**: على الحساب الواحد، عكسُ A يضع **مدين 10** على `5600` (`fxGain = −380 − (−370) = −10` ⟵ `signedLine(…, −10, false)` = مدين — `auto-posting.util.ts:1262-1265` · `:1275` · `:1287`)، و`5600` هو «حسابُ الخسارة» نفسُه ⟵ **«لم يتحرّك» يسقط اليوم**؛ و«صافي حساب الربح صفر» يسقط كذلك (A دائن 10 + B مدين 10 + عكسُ A مدين 10 = مدين 10). فهو أحمرُ اليوم وأحمرُ على الكسر ① — **لا يميّز بينهما قبل الإصلاح**، وقيمتُه بعده وحدَه. لا ضرر، لكن الوصف يُصحَّح.
- **وحدُّه الأهمّ**: يعمل على سندٍ **مخصَّصٍ من إنشائه**؛ فلا يرى ع-١/ب·ج حيث العكسُ ليس مرآةً للأصل.

### ع-٥ · تصميمُ الفصل (القسم 5) — ما يكسره ولم يذكره

- **قاعدةُ «`reversal ? −fxGain : fxGain`» تفترض أن العكسَ مرآةُ الأصل — وهو ليس كذلك** في ع-١/ب (توزيعٌ بعد الإنشاء) وع-١/ج (سعرُ شراءٍ عُدِّل بعد السداد): العكسُ يحمل فرقاً **لا أصلَ له** أو بقدرٍ آخر، فيقع على حساب الربح أو الخسارة **بلا ما يقابله**، ويتضخّم الإجماليّان — وهو عينُ ما صُمّم الفصلُ لمنعه. **فالفصلُ يشترط أولاً** إمّا إعادةَ ترحيل الفرق عند التوزيع وعند تعديل السعر، أو أن يقرأ العكسُ **سطورَ قيد الأصل** (كـ`postReversalEntry` — `auto-posting.util.ts:72-102`) بدل إعادة الحساب من التخصيصات الحالية.
- **كسرٌ ثالثٌ للإثبات بالعكس** (صياغةٌ محتملة): حسابُ الاتجاه في العكس من **التخصيصات الحالية** (كما يفعل `baseSettledOf` اليوم) — يُمسك بحالة: سندٌ على الحساب ⟵ `POST /payments/:id/allocate` على فاتورةٍ بسعرٍ آخر ⟵ `reverse` ⟵ توكيد: مجموعُ حركة حسابَي الربح والخسارة عبر الإنشاء والعكس **صفر**. (يسقط على الشيفرة الحالية: `5600` مدين 10.)
- `getOrCreate` للحساب الجديد صحيح (5-2)، **ويلزم مثلُه لـ`5600` نفسِه** وإلا بقي ع-١/هـ.
- تطبيقُ المقدَّم (ع-١/أ) خارج البانيَين أصلاً: الفصلُ على البانيَين لا يمسّه، ويبقى فرقُه بلا حساب.

### ع-٦ · الخلاصة

**الحكمُ قائم** بوصفه وصفاً: كلُّ فرقِ صرفٍ **يُعترف به** اليوم يقع على `5600` واحدٍ بنوع `expense` من بانيَين (`auto-posting.util.ts:957-975` · `:1275-1287`)، ويُعرض صافياً. **والتصحيحُ الأهمّ**: ليس «كلُّ فرقٍ محقَّق» — تطبيقُ الدفعة المقدَّمة وإعادةُ التوزيع وتعديلُ سعر الشراء المسدَّد والردُّ بسعرٍ تاريخيّ تُبقي فروقاً محقَّقةً **بلا أيّ حساب**، وغيابُ `5600` يُسقط القيدَ كلَّه اليوم؛ **واستعلاماتُ القسم 6 تعدّ قيودَ الإقفال والافتتاح على `5600` فروقاً** فتُنتج إيجاباً كاذباً في `6-3` ما لم تُستثنَ.
