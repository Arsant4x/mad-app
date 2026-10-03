# الدعوى هـ — استهلاكٌ مؤقّتٌ بتكلفة صفر ⇒ يُعلَن ولا يمرّ صامتاً

> **المصدر المقروء:** `D:\worktrees\outbox-266` (main + تغييرُ الطابور الذي لا يمسّ الموضوع) — قراءةٌ فقط.
> لم يُشغَّل اختبارٌ ولا `prisma` ولا `docker` ولا بناء، ولم يُعدَّل ملفٌّ في المستودع.
> كلُّ رقمٍ في هذا التقرير من الشيفرة أو الوثائق؛ **ولا رقمَ فيه من قاعدة البيانات** — أرقامُ القاعدة في §6 استعلاماتٌ لم تُشغَّل.

---

## (1) الدعوى بنصّها

«هـ. استهلاكٌ مؤقّتٌ بتكلفة صفر. ⇒ يُعلَن ولا يمرّ صامتاً.»

وصياغتُها بلغة الشيفرة: حين يُخرج بيعٌ (أو شطبٌ أو إخراجٌ يدويّ أو تحويل) كمّيةً لا تغطّيها طبقات، يُكتب لها **استهلاكٌ مؤقّت** (`layerId = null`) بـ«آخر تكلفةٍ معروفة»؛ وإن لم تكن هناك تكلفةٌ معروفة كانت **صفراً**. والسؤال: هل يمرّ هذا الصفر صامتاً (لا علَمَ في الردّ · لا تقرير · لا عدّ)؟

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### أ. من أين يأتي الصفر

- `apps/api/src/inventory/costing.util.ts:91-111` — `lastKnownUnitCost` تنزل ثلاث درجات: آخر طبقةٍ للصنف **في المستودع** (`:92-97`)، ثم آخر طبقةٍ للصنف **في أيّ مستودع** (`:102-107`)، ثم **حقلُ التكلفة على بطاقة الصنف** `product.cost` (`:109-110`)، و`?? 0` إن غاب الصنف.
- `apps/api/prisma/schema.prisma:2569` — `cost Decimal @default(0)`؛ و`apps/api/src/products/dto/create-product.dto.ts:50-53` — `cost` اختياريّ. ⇒ **كلُّ صنفٍ أُنشئ بلا تكلفة بطاقتُه صفر**، فالدرجةُ الثالثة تعطي صفراً.
- التعليق نفسه في `costing.util.ts:99-101` يعترف: «وصفرٌ في الأخير **ليس خطأً يُخفى**: يظهر في تقرير الاستهلاكات المؤقّتة بتكلفة صفر، وهو أوضح من رقمٍ مخترع». — أي أن الشيفرة **تَعِد** بالإعلان، ومحلُّه التقرير.
- ودرجةٌ رابعة للصفر «المعروف»: طبقةٌ حقيقية بتكلفة صفر مقبولةٌ صراحةً — `apps/api/src/inventory/dto/create-stock-movement.dto.ts:43-46` (`@Min(0)`)، ومُثبَتٌ في `apps/api/test/manual-movements-costing.e2e-spec.ts:92-93` (إدخالٌ بـ`unitCost: 0` ⇒ `201`). فمؤقّتٌ بعدها يأخذ صفراً من الدرجة الأولى — صفرٌ **مصدرُه معروف** لا مجهول.

### ب. كتابة الاستهلاك المؤقّت

- `costing.util.ts:230-249` — إن بقي `outstanding > 0` كُتب صفٌّ `layerId: null` بـ`unitCost: provisionalUnitCost` (قد يكون `0`)، وأُضيف `outstanding × provisionalUnitCost` إلى `totalCost`.
- `costing.util.ts:251-256` — `ConsumeResult` يُرجع `provisionalQty` و`provisionalUnitCost` — **ولا يُرجع مصدرَ التكلفة** (مستودع · صنف · بطاقة · لا شيء)، ولا يُخزَّن المصدرُ في الصفّ (`schema.prisma:6008-6067` — لا عمودَ له).

### ج. المسارات الأربعة التي تستدعي `consumeFifo` — وما يصل الردَّ منها

(بحثٌ: `consumeFifo\(|transferLayers\(` في `apps/api/src` ⇒ `sale-fulfilment.util.ts:145` · `write-offs.service.ts:199` · `inventory.service.ts:151` · `costing.util.ts:469` (التحويل) + اختبارات.)

| المسار | الموضع | ما يُعلَن في الردّ عن المؤقّت | عن الصفر |
|---|---|---|---|
| **البيع بالفاتورة** | `invoices/sale-fulfilment.util.ts:145-154` يجمع `totalCost` و`provisionalQty` **ويُسقط `provisionalUnitCost`**؛ `:77-87` `fulfilmentReport` يُخرج `totalCost` و`provisionalQty` نصّاً؛ `invoices.service.ts:708,710` يُرفقه `stockFulfilment` | `provisionalQty` (كمّيةٌ مجمَّعة لكلّ الفاتورة، لا لكلّ صنف) | **لا شيء** — يُستنتج فقط إن كان `totalCost = '0.00'` والفاتورةُ كلُّها مؤقّتةٌ صفرية؛ وفي فاتورةٍ مختلطة لا يُستنتج أصلاً |
| **البيع بالكاشير** | `pos/pos.service.ts:121-127` `toDeductionReport` يُمرّر `warehouseId · movements · belowZero` **ويُسقط `totalCost` و`provisionalQty` كليهما**؛ `pos/dto/pos-responses.dto.ts:192-199` الصنفُ المعلَن بلا حقلٍ لهما؛ `packages/shared/src/api/responses.ts:283-288` (مولَّد) كذلك | **لا شيء** | **لا شيء** |
| **الإخراج/التسوية السالبة اليدوية** | `inventory/inventory.service.ts:151-154` ثم الردّ `:173` = `{ ...movement, journalEntryId, resultingQty }` | **لا شيء** (سوى `resultingQty` إن نزل تحت الصفر) | **لا شيء** |
| **التحويل** | `inventory.service.ts:155-163` → `costing.util.ts:463-495`؛ الردّ `:173` | **لا شيء** | **لا شيء** — بل `costing.util.ts:475-485` يُنشئ في المقصِد **طبقةً حقيقية** بتكلفة الشريحة المؤقّتة (`unitCost: s.unitCost`) ⇒ صفرٌ مؤقّت في المصدر يصير **طبقةً حقيقية بتكلفة صفر** في المقصِد، فما يُباع منها بعدُ ليس «مؤقّتاً» ولا يظهر في تقرير المؤقّت |
| **الشطب** | `inventory/write-offs.service.ts:199-214` ثم `:279-282` | `provisionalQty` | **لا شيء** |

### د. الدفتر

- `journal/auto-posting.util.ts:280` — `postCogsEntry`: `if (c.baseCost <= 0) return null;` ⇒ بيعٌ كلُّ تكلفته مؤقّتٌ صفريّ **لا قيدَ تكلفةٍ له إطلاقاً** (يُستدعى من `invoices.service.ts:664-671`).
- `auto-posting.util.ts:384-385` — `postManualStockEntry`: صفرٌ لا قيد ⇒ الإخراجُ اليدويّ الصفريّ بلا قيد، و`journalEntryId` يبقى `null` (`inventory.service.ts:153-154,166`).
- `auto-posting.util.ts:534` — `postWriteOffEntry`: `baseCost <= 0` لا قيد.
- حارسُ المطابقة `inventory/inventory-ledger-reconciliation.util.ts:63-68` يجمع المؤقّتَ المفتوح **قيمةً** `SUM(qty × unitCost)` ⇒ الصفريُّ يُسهم بصفر: **لا يُحدث فرقاً ولا يُعدّ** — حدُّ الحارس بنيويّ (يرى القيمة لا الكمّية).

### هـ. التقرير الموعود

- `inventory/inventory.controller.ts:94-98` — `GET /inventory/provisional` (`view` على شاشة `inventory`) → `inventory.service.ts:181-203`: صفوفُ المؤقّت المفتوح بـ`unitCost` رقماً. **الصفريُّ يظهر صفّاً بـ`unitCost: 0` — بلا علَمٍ ولا مصدرٍ ولا عدٍّ ولا مرشِّح**؛ والبحثُ على الاسمين وحدهما (`:19`).
- **ولا تقرؤه الواجهة**: بحثٌ `provisional|stockFulfilment|inventory/provisional` (غير حسّاس للحالة) في `apps/web/src` ⇒ **صفر**. وبحثٌ عربيّ متناظر `مؤقّت|مؤقت` في `apps/web/src` ⇒ نتائجُ عن الإيصال المؤقّت والروابط المؤقّتة وحدها (`PosPage.tsx:60,971,988` · `AttachmentsSection.tsx:99` …) لا عن الاستهلاك. **ومسبارٌ ضابط**: `stockDeduction|belowZero` في `apps/web/src` ⇒ `PosPage.tsx:439-443` (يُقرأ) — فالبحثُ يرى. ومسارات المخزون التي تستدعيها الواجهة: `apps/web/src/api/inventory.ts:68-74` = `movements` · `stock-levels` · `expiring` — **لا `provisional`**.
- بحثٌ عن أيّ علَمٍ قائم: `costMissing|zeroCost|ZERO_COST|costSource` في `apps` ⇒ **صفر**؛ ومسبارٌ ضابط `belowZero` في `apps` يجد (أعلاه).

### و. الإعلان الوحيد القائم في مسار البيع: `belowZero` — وليس هو

- `sale-fulfilment.util.ts:157-162` يُعلن الأصنافَ التي نزل رصيدُ **حركاتها** تحت الصفر. لكنّ المؤقّت ينشأ من **غياب الطبقات** لا من سالب الحركات؛ فحين تكون الحركاتُ موجبةً والطبقاتُ غائبة (إدخالاتٌ قديمة بلا طبقة — `229` على التطوير يومَ `ق-١٠٦٢` بنصّ `costing.util.ts:430-431`) **يقع مؤقّتٌ صفريّ و`belowZero: []`** — صمتٌ تامّ في الكاشير.
- ⚠️ **ملاحظةٌ جانبية مقروءة (خارج الدعوى)**: حسابُ `belowZero` نفسه في `sale-fulfilment.util.ts:159-160` يقرأ حركاتِ `{ productId, warehouseId }` ويطرح `OUT` وحده ويجمع ما عداه — فـ**التحويلُ الخارج من المستودع يُجمَع موجباً** والداخلُ إليه (`toWarehouseId`) لا يُقرأ؛ خلافاً لـ`inventory/stock-quantity.util.ts:29-31,58-61`. فالتحذيرُ الوحيد القائم **قد يكذب** بوجود تحويلات. (قراءةٌ لا قياس.)

### ز. التسوية — تصحّح لاحقاً، لا تُعلن

- `journal/provisional-settlement.util.ts:35-109` يسوّي المفتوح حين تصل طبقة: الفرقُ `(الحقيقية − المؤقّتة) × الكمّية` (`:68`) ⇒ للصفريّ **الفرقُ = القيمةُ كلُّها**، يُرحَّل على `5100` للبيع (`auto-posting.util.ts:414-424`, `337-368`) **بتاريخ الاستلام لا تاريخ البيع** ⇒ الإيرادُ في فترةٍ وتكلفتُه في أخرى.
- و`:52` — **لا يُسوَّى صفٌّ إلا كاملاً**: طبقةٌ لا تكفي كمّيةَ الصفّ ⇒ يبقى مفتوحاً (وصفرياً) إلى أجلٍ غير مسمّى.

### ح. ما قرّره المالك في الموضوع (مقروءاً من المصدر)

- `docs/decisions.md:2883` (نصّ المالك في توجيه `ق-١٠٦٣`): «٣. ومصدرُ التكلفة يُعلَن — فحركةٌ يدويةٌ بلا تكلفةٍ مُدخَلةٍ **تأخذ من البطاقة، وقد تكون صفراً** ⇒ فيُمنع الصفرُ الصامت: إمّا تُدخَل أو تُرفض.» و`docs/decisions.md:2889` يلخّصها «**لا صفرَ صامت** … (لا أخذَ من البطاقة)».
- **ونُفِّذت على الإدخال وحده**: `inventory.service.ts:92-95` يرفض إدخالاً بلا تكلفة. أمّا **الاستهلاكُ المؤقّت فما زال يأخذ من البطاقة** (`costing.util.ts:109-110`) وقد تكون صفراً — ومُثبَتٌ أنه يأخذ منها: `apps/api/test/opening-stock.e2e-spec.ts:204` («بطاقةُ الصنف 7») و`:216-217`.
- في الخطط (لا القرارات): `docs/plans/retail-full-spec.md:177` «السماح بتكلفة صفر — يضخّم الربح ثم ينهار عند التسجيل»، و`:182` «إن لم يكن للصنف أي تكلفة سابقة إطلاقاً → التكلفة صفر + وسم `costMissing` + بند إلزامي في تقرير إقفال الشهر»؛ و`docs/plans/inventory-master-plan.md:1238` (ح-١١) «صنف بتكلفة صفر — مسموح لكن يُعلَّم ويظهر في تقرير مستقل». **وسمٌ مخطَّطٌ ولم يُبنَ** (بحثُ `costMissing` = صفر، أعلاه).

---

## (3) حكمٌ مبدئيّ بالقراءة: **قائمة** (بصياغةٍ دقيقة: «معلَنةٌ صفّاً في تقريرٍ لا يقرؤه أحد، وصامتةٌ في كلِّ ردٍّ وفي الدفتر»)

**لماذا قائمة:**
1. **الوصولُ ممكنٌ بالـAPI اليوم بلا بياناتٍ قديمة**: صنفٌ جديد بلا تكلفة (بطاقتُه `0`) ⇒ إخراجٌ يدويّ (`inventory.service.ts:88-90` يطلب `qty > 0` وحده، ولا تكلفة للخارج) ⇒ صار الصنفُ «متعقَّباً» (`sale-fulfilment.util.ts:113-118`: له حركة) ⇒ بيعٌ ⇒ لا طبقات ⇒ `lastKnownUnitCost` = `0`.
2. **الكاشير صامتٌ تماماً**: `toDeductionReport` يُسقط `provisionalQty` و`totalCost` (`pos.service.ts:126`)؛ وحين تكون الحركاتُ موجبة فـ`belowZero` فارغ أيضاً.
3. **الفاتورة تُعلن الكمّيةَ المؤقّتة لا صفريّتَها** — ولا لكلّ صنف.
4. **الإخراجُ اليدويّ والتحويلُ لا يُعلنان المؤقّتَ أصلاً**، والتحويلُ **يغسل** الصفرَ طبقةً حقيقية في المقصِد.
5. **الدفترُ لا قيدَ فيه** (`auto-posting.util.ts:280,385,534`) — وهو سلوكٌ صحيح لرقمٍ صفر، لكنه يعني أن **لا أثرَ في أيّ تقريرٍ ماليّ**؛ والمطابقةُ عمياء عنه بالقيمة (`inventory-ledger-reconciliation.util.ts:64`).
6. **الإعلانُ الوحيد**: صفٌّ بـ`unitCost: 0` في `GET /inventory/provisional` — **بلا علَمٍ ولا مصدرٍ ولا عدّ، ولا شاشةَ تقرؤه**. وهو عينُ ما سمّاه `ق-١٠٦٢` «التقرير الذي وعدت به الشيفرة ولم يقرأه أحد» (`inventory.service.ts:178-179`)، **وعينُ «الصفر الصامت» الذي منعه المالك في `ق-١٠٦٣/٣`** على الإدخال ولم يُمدَّ إلى الاستهلاك.

**ما لا تحسمه القراءة**: هل يوجد صفٌّ كهذا على قاعدة التطوير الآن وكم (§6)؛ وهل ما تقوله القراءة عن ردّ الكاشير يطابق التشغيل (§4 ③ يقيسه).

---

## (4) كيف تُقاس حيّاً — اختبار e2e محدّد

**الملف:** `apps/api/test/provisional-zero-cost.e2e-spec.ts` · منشأةٌ معزولة (`registerIsolatedCompany` كما `manual-movements-costing.e2e-spec.ts:64`) · مستودع `whA` · فرع `branchId` مربوطٌ بـ`whA` · عميل. الأنماطُ منقولةٌ من `batch-fefo.e2e-spec.ts:49-66` (`product` · `sale` · `move`).

### ① بيعٌ بعد إخراجٍ يدويّ — صنفٌ بلا تكلفة (الصفرُ «المجهول»)
1. `POST /products` `{ unitCode:'H87', expiryTracked:false, taxCategory:'S', name, price:100 }` ⇒ `201` (بلا `cost` ⇒ `0`).
2. `POST /inventory/movements` `{ productId:p, warehouseId:whA, type:'OUT', qty:2, date, reason }` ⇒ `201`.
   - توكيدُ الحال (يمرّ اليوم، ويوثّق الصمت): استهلاكاتُ الحركة = `[{ layerId:null, qty:2, unitCost:0 }]`؛ `body.journalEntryId === null`؛ لا مفتاحَ `provisionalQty` في الردّ.
3. `POST /invoices` `{ customerId, branchId, issueDate, dueDate, lines:[{ description:'بيع', productId:p, quantity:3, unitPrice:150, taxRate:15 }] }` ⇒ `201`.
   - توكيدُ الحال (يمرّ اليوم): `stockFulfilment` = `{ fulfilled:true, warehouseId:whA, movements:1, belowZero:[{ productId:p, resultingQty:'-5.000' }], totalCost:'0.00', provisionalQty:'3.000' }`؛ و**لا قيدَ** بمذكّرة `تكلفة مبيعات ${body.no}` (عدٌّ من `journal_entries` داخل سياق المنشأة = `0`).
   - **التوكيدُ الذي يسقط على الشيفرة الحالية**:
     ```ts
     expect(res.body.stockFulfilment.zeroCostProvisional).toEqual([{ productId: p, qty: '3.000', costSource: 'NONE' }]);
     ```
     اليوم: `undefined` ⇒ يسقط.
4. `GET /inventory/provisional` ⇒ صفّان للصنف بـ`unitCost: 0`.
   - **يسقط اليوم**: `expect(rows.filter(r => r.productId === p).every(r => r.zeroCost === true && r.costSource === 'NONE')).toBe(true)` (الحقلان غائبان).

### ② الصمتُ التامّ — حركاتٌ موجبة بلا طبقات (`belowZero` فارغ)
1. صنفٌ بلا تكلفة؛ حركةُ إدخالٍ قديمة **بلا طبقة** تُكتب مباشرةً داخل سياق المنشأة — بالنمط المُثبَت في `batch-fefo.e2e-spec.ts:242-247` (`type:'IN'`, `origin:'MANUAL'`, `reason`, `qty:10`).
2. `POST /invoices` بكمّية `2` ⇒ اليوم: `belowZero: []` · `totalCost:'0.00'` · `provisionalQty:'2.000'`.
3. **يسقط اليوم**: `zeroCostProvisional` = `[{ productId, qty:'2.000', costSource:'NONE' }]`.

### ③ الكاشير — يُسقط اليوم حتى الكمّية
بنمط `pos.e2e-spec.ts:149-158`: `POST /pos/shifts` `{ openingFloat:0, branchId }` ثم `POST /pos/sales` `{ lines:[{ productId:p, quantity:1 }], paymentMethod:'CASH' }` على صنف ②.
- اليوم: `stockDeduction` = `{ deducted:true, warehouseId:whA, movements:1, belowZero:[] }` — **لا شيءَ عن المؤقّت ولا عن الصفر**.
- **يسقط اليوم**: `expect(res.body.stockDeduction.zeroCostProvisional).toEqual([{ productId, qty:'1.000', costSource:'NONE' }])`.

### ④ ضوابطُ سلبية (تمرّ اليوم وتبقى خضراء بعد الإصلاح)
- صنفٌ بطبقة `qty 1 · unitCost 30` ثم بيعُ `3` ⇒ مؤقّتٌ `2` بـ`30` ⇒ `zeroCostProvisional` = `[]`.
- بيعٌ مغطّى بالطبقات كلُّه ⇒ `zeroCostProvisional` = `[]`.

### ⑤ الصفرُ «المعروف» — يحتاج حكماً (انظر §7)
- إدخالٌ `qty 1 · unitCost 0` (مقبول — `manual-movements-costing.e2e-spec.ts:92`) ثم بيعُ `3` ⇒ مؤقّتٌ `2` بصفرٍ **من طبقة**: التوقّعُ المقترح `costSource:'WAREHOUSE_LAYER'` ويُعلَن صفرياً مع مصدره.

### ⑥ فاتورةٌ مختلطة (تُمسك كسراً محتملاً — §5)
- سطرٌ بصنفٍ مغطّى بطبقة `unitCost 50` + سطرٌ بصنف ① ⇒ `totalCost` ≠ `'0.00'` ولكنّ `zeroCostProvisional` يجب أن يحمل صنفَ ① وحده.

### ⑦ التسوية تُطفئ الإعلان (تمرّ اليوم في شقّها القائم)
- إدخالٌ `qty 10 · unitCost 20` لصنف ① ⇒ `GET /inventory/provisional` لم يعد فيه صنفُ ① إلا ما لم تكفِه الطبقة (`provisional-settlement.util.ts:52`)، وقيدُ `تسوية استهلاكٍ مؤقّت — …` بـ`5100` مدين `60` (`3 × 20`) لصفّ البيع — ومؤقّتُ الإخراج اليدويّ على `5810` (`provisional-settlement.util.ts:64-68,101`). والعدُّ الجديد (§5 ⑦) ينقص.

---

## (5) الإصلاح — بالمواضع، وما ينكسر، والكسرُ المحتمل للإثبات بالعكس

### التصميم (بلا تغيير مخطَّط في الحدّ الأدنى)

**تعريفٌ مشتقٌّ لا علَم** — على نهج المخطَّط (`schema.prisma:6031-6041`: «مؤقّت = `layerId IS NULL` نفسه، لا علَم»):
> **مؤقّتٌ صفريّ = `layerId IS NULL AND unitCost = 0`** — واقعةٌ في الصفّ، لا حالةٌ تُحدَّث.

1. **`costing.util.ts:91-111`** — `lastKnownUnitCost` تُرجع `{ unitCost, source }` بـ`source ∈ 'WAREHOUSE_LAYER' | 'PRODUCT_LAYER' | 'PRODUCT_CARD' | 'NONE'` (`NONE` حين تكون البطاقةُ صفراً — ولا يُميَّز «صفرٌ مُدخَل على البطاقة» من «لم تُدخَل»، لأن الافتراضيّ `0` — حدٌّ يُعلَن). الدالّةُ غيرُ مُصدَّرة، فمستدعيها الوحيد `consumeFifo:232`.
2. **`costing.util.ts:75-83, 230-256`** — `ConsumeResult` يضيف `provisionalCostSource` و`zeroCostQty` (= `outstanding` إن `provisionalUnitCost === 0`).
3. **`invoices/sale-fulfilment.util.ts:121-171`** — لكلّ سطر يُجمع `{ productId, qty, unitCost, costSource }` للمؤقّت (بدل إسقاط `provisionalUnitCost` في `:153-154`)، ويُضاف إلى `FulfilmentResult` (`:47-58`) مصفوفة `provisional[]` ومشتقّتُها `zeroCostProvisional[]` (مجمَّعةً بالصنف)، وإلى `FulfilmentReport` (`:66-87`) نصّاً (`qty()`/`money()` كما `:83-85`).
4. **`pos/pos.service.ts:103-127`** — فرعُ `deducted: true` يمرّر `provisionalQty` و`zeroCostProvisional` (كما يمرّر `belowZero`)؛ و**`pos/dto/pos-responses.dto.ts:192-199`** يُعلن الحقلين؛ ثم إعادةُ توليد `packages/shared/src/api/responses.ts` (`npm run openapi:snapshot` من `apps/api` — بنصّ رأس الملف `:1-4`)؛ وفي الواجهة `apps/web/src/pages/pos/PosPage.tsx:439-443` تنبيهٌ بجانب `belowZero` («بيع بلا تكلفة معروفة: …»).
5. **`inventory/inventory.service.ts:151-154, 155-163, 173`** — ردُّ الإخراج اليدويّ والتحويل يحمل `provisionalQty` و`zeroCostQty` و`provisionalCostSource`.
6. **`inventory/write-offs.service.ts:279-282`** — يضيف `zeroCostQty` بجانب `provisionalQty`.
7. **التقرير `inventory.service.ts:181-203`** — كلُّ صفٍّ يحمل `zeroCost: Number(r.unitCost) === 0`؛ ومرشِّحٌ اختياريّ `zeroCost=true` (يمدّ `PagedQueryDto` ⇒ يُعاد توليد `packages/shared/src/api/requests.ts` عند `InventoryProvisionalQuery` — `:1694`)؛ **والعدُّ** في مسارٍ مستقلّ `GET /inventory/provisional/summary` ⇒ `{ openCount, openZeroCostCount, openZeroCostQty, openValue }` — لا داخل ردّ القائمة كي لا يتغيّر شكلُها (مصفوفةٌ أو مغلَّف — `common/pagination/paged.util.ts:99-105`).
8. **حارسُ المطابقة `inventory-ledger-reconciliation.util.ts:40-90`** — رقمٌ معلَنٌ خارج المعادلة (كـ`legacyManualUnposted`): `openProvisionalZeroCost: { count, qty }` — لأن قيمتَه صفرٌ فلا تراه المعادلة أبداً.
9. **الواجهة (قرار مالك)**: لا شاشةَ اليوم لـ`/inventory/provisional` (`apps/web/src/api/inventory.ts:68-74`). **الفاعل** (`§3.5`): مالكُ المنشأة/موظّفٌ بـ`inventory:view` ⇒ شاشاتُ المنشأة (المخزون). بندُ واجهةٍ يُقرّره المالك.

**وخيارٌ أوسع يحتاج حكماً** — حفظُ المصدر: عمودُ `costSource` على `inventory_consumptions` (يُكتب لحظةَ الاستهلاك، **واقعةُ منشأ** كـ`unitCost` لا حالة)، وهجرةٌ تعلّم القائمَ `UNKNOWN` وتعدّ بـ`RAISE WARNING` ولا تُصنّف رجعياً (`ق-١٠٦٣/٤` · `§8.28`). بدونه يقول التقريرُ «صفر» ولا يقول «لماذا».

**`§3.8` (التوسّع لدولة أخرى)**: الإصلاح لا يمسّ افتراضاً سعودياً (لا نسبةَ ولا عملةَ ولا نصَّ جهة).
**`§3` (اتجاه الاستيراد)**: لا حافةَ جديدة — `sale-fulfilment` يستورد `costing.util` أصلاً (الدَّين المعلَن)، والإضافةُ حقولٌ على الحافة نفسها.

### ما ينكسر
- **حارسُ `openapi:check` / `response-truth`** حتى يُعاد توليد `packages/shared/src/api/responses.ts` (`:1-4`) — تغييرُ `PosStockDeductedResponse`.
- **الواجهة** `apps/web/src/api/pos.ts` تستورد `PosStockDeductedResponse` — حقلٌ جديد مطلوب لا يكسر القارئ، ولكنّ بنيةً مولَّدة تتغيّر.
- **اختباراتٌ قائمة لا تنكسر بالقراءة**: `pos.e2e-spec.ts:95` `toEqual` على فرع `deducted:false` (لم يتغيّر) · `:158` و`pos-receipt-clearance.e2e-spec.ts:106` `toMatchObject` · `batch-fefo.e2e-spec.ts:182,192,209,233-234,321` توكيداتٌ حقلية · `costing.live.spec.ts:145-147` و`costing-race.live.spec.ts:122` حقلية. (قراءةٌ لا تشغيل.)
- **التحويل**: إن قُرّر إعلانُ «الصفر المغسول» في طبقة المقصِد (`costing.util.ts:475-485`) فهو تغييرُ دلالة لا حقل — يحتاج حكماً (§7).

### كسرٌ محتمل للإثبات بالعكس (صياغاتٌ يكتبها مطوّرٌ فعلاً — `§8.8` الوجه الثاني)
1. **الإعلانُ على مستوى الفاتورة بـ`totalCost === 0`** بدل كلّ سطر ⇒ يسقط ⑥ (الفاتورة المختلطة).
2. **`if (!consumed.provisionalUnitCost)`** بدل `=== 0` ⇒ `null` (لا مؤقّت) يُقرأ صفراً ⇒ يسقط ④ (الضابط السلبي المغطّى كلُّه).
3. **العلَمُ من بطاقة الصنف** (`product.cost === 0`) بدل التكلفة المستعملة ⇒ صنفٌ بطاقتُه صفر وله طبقةٌ في مستودعٍ آخر (`costing.util.ts:102-107` تُعطي تكلفتَها) يُعلَن صفرياً كذباً ⇒ حالةٌ تُضاف: طبقة `unitCost 25` في `whB` ثم بيعٌ من `whA`.
4. **`toDeductionReport` ينسى الحقل** — وهو **ما وقع فعلاً اليوم لـ`provisionalQty`** (`pos.service.ts:126`) ⇒ يسقط ③.
5. **التقرير يحسب `zeroCost` من `r.unitCost === 0`** على `Decimal` لا `Number` ⇒ `false` دائماً ⇒ يسقط ① الخطوة ٤.

وقبل قراءة أيّ سقوط: يُتحقَّق أن الكسرَ وقع (`§8.8`)، وأن العدد الكلّي للاختبارات لم يتغيّر (`0 total` ليس سقوطاً).

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل التغيير

⚠️ **`inventory_consumptions` و`stock_movements` و`inventory_layers` تحت `ENABLE + FORCE`** (`prisma/migrations/20260829200000_l0_cost_layers/migration.sql:199,205-207` · `20260918130000_inventory_manual_costing/migration.sql:44-47`) و`app_user` مالكُها ⇒ **عدٌّ بـ`app_user` بلا سياقٍ يعود صفراً بنجاح** (`CLAUDE.md` قاعدة 2026-08-12). طريقان:

**الطريق أ — بدورٍ يتجاوز العزل** (المستخدم الخارق `mad_app` على التطوير)، **مع مسبارٍ ضابطٍ يُثبت الرؤية** قبل تصديق أيّ صفر:
```sql
-- ضابطٌ: يجب أن يكون > 0 على قاعدةٍ فيها مبيعات
SELECT count(*) AS all_consumptions, count(DISTINCT "companyId") AS companies FROM inventory_consumptions;
```

**الطريق ب — بـ`app_user` داخل سياق كلِّ منشأة** (جدولُ `companies` بلا RLS — بحثُ `ALTER TABLE "companies" (ENABLE|FORCE)` في الهجرات = صفر، وضابطُه يجد `stock_movements`/`inventory_layers`)، **ويُقرأ السياقُ بعد ضبطه** (إثباتُ الآلية لا الأثر):
```sql
BEGIN;
DO $$
DECLARE r record; seen text; tot int := 0; prov int := 0; zero int := 0; open_zero int := 0; open_zero_qty numeric := 0;
BEGIN
  FOR r IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', r.id, true);
    seen := current_setting('app.company_id', true);
    IF seen IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'السياق لم يُضبط لـ%', r.id; END IF;
    tot  := tot  + (SELECT count(*) FROM inventory_consumptions);
    prov := prov + (SELECT count(*) FROM inventory_consumptions WHERE "layerId" IS NULL);
    zero := zero + (SELECT count(*) FROM inventory_consumptions WHERE "layerId" IS NULL AND "unitCost" = 0);
    SELECT open_zero + count(*), open_zero_qty + COALESCE(SUM(c.qty),0) INTO open_zero, open_zero_qty
      FROM inventory_consumptions c
      WHERE c."layerId" IS NULL AND c."unitCost" = 0
        AND NOT EXISTS (SELECT 1 FROM inventory_consumptions s WHERE s."settlesId" = c.id);
  END LOOP;
  RAISE NOTICE 'كلُّ الاستهلاكات: % · المؤقّت: % · المؤقّتُ الصفريّ: % · المفتوحُ منه: % (كمّية %)', tot, prov, zero, open_zero, open_zero_qty;
END $$;
ROLLBACK;
```
(`NOTICE` هنا جلسةٌ تفاعلية لا هجرة — `§8.28` يخصّ الهجرات.)

**الاستعلامات (تُشغَّل بالطريق أ، أو يُلفّ كلٌّ منها بالحلقة أعلاه):**

**① المؤقّتُ الصفريّ بمصدر الحركة، مفتوحاً ومسوّىً:**
```sql
SELECT m.origin, m.type,
       count(*)                                                     AS provisional_rows,
       count(*) FILTER (WHERE c."unitCost" = 0)                     AS zero_rows,
       count(*) FILTER (WHERE s.id IS NULL)                         AS open_rows,
       count(*) FILTER (WHERE s.id IS NULL AND c."unitCost" = 0)    AS open_zero_rows,
       COALESCE(SUM(c.qty) FILTER (WHERE s.id IS NULL AND c."unitCost" = 0), 0) AS open_zero_qty,
       count(DISTINCT c."companyId") FILTER (WHERE c."unitCost" = 0) AS companies_with_zero
FROM inventory_consumptions c
JOIN stock_movements m ON m.id = c."movementId"
LEFT JOIN inventory_consumptions s ON s."settlesId" = c.id
WHERE c."layerId" IS NULL
GROUP BY ROLLUP (m.origin, m.type)
ORDER BY 1 NULLS LAST, 2 NULLS LAST;
```

**② المصدرُ المرجَّح للصفر** (تقريبيّ — طبقةٌ وُجدت قبل الاستهلاك قد تكون رُفعت تكلفتُها بعده؛ حدٌّ معلَن):
```sql
SELECT CASE
         WHEN EXISTS (SELECT 1 FROM inventory_layers l WHERE l."productId" = m."productId" AND l."warehouseId" = m."warehouseId" AND l."createdAt" < c."createdAt") THEN 'LAYER_SAME_WAREHOUSE'
         WHEN EXISTS (SELECT 1 FROM inventory_layers l WHERE l."productId" = m."productId" AND l."createdAt" < c."createdAt") THEN 'LAYER_OTHER_WAREHOUSE'
         ELSE 'CARD_OR_NONE'
       END AS probable_source,
       count(*) AS rows, SUM(c.qty) AS qty
FROM inventory_consumptions c
JOIN stock_movements m ON m.id = c."movementId"
WHERE c."layerId" IS NULL AND c."unitCost" = 0
GROUP BY 1;
```

**③ فواتيرُ البيع المتأثّرة، وهل لها قيدُ تكلفة أصلاً** (الربطُ بالمذكّرة — `auto-posting.util.ts:288` — إذ لا مفتاحَ من القيد إلى الفاتورة):
```sql
WITH z AS (
  SELECT i."companyId", i.id, i.no, SUM(c.qty) AS zero_qty, bool_and(s.id IS NOT NULL) AS all_settled
  FROM inventory_consumptions c
  JOIN stock_movements m ON m.id = c."movementId" AND m.origin = 'SALE' AND m.type = 'OUT'
  JOIN invoice_lines il ON il.id = m."invoiceLineId"
  JOIN invoices i ON i.id = il."invoiceId"
  LEFT JOIN inventory_consumptions s ON s."settlesId" = c.id
  WHERE c."layerId" IS NULL AND c."unitCost" = 0
  GROUP BY i."companyId", i.id, i.no)
SELECT count(*) AS invoices,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je."companyId" = z."companyId" AND je.memo = 'تكلفة مبيعات ' || z.no)) AS invoices_without_cogs_entry,
       count(*) FILTER (WHERE NOT all_settled) AS invoices_with_open_zero,
       SUM(zero_qty) AS zero_qty
FROM z;
```

**④ الصامتُ تماماً — مؤقّتٌ صفريّ مفتوح ورصيدُ الحركات غيرُ سالب** (فلا `belowZero`؛ الرصيدُ بمعادلة `stock-quantity.util.ts:24-33`):
```sql
WITH bal AS (
  SELECT "productId", wh AS "warehouseId", SUM(d) AS qty FROM (
    SELECT "productId", "warehouseId" AS wh,
           CASE type WHEN 'IN' THEN qty WHEN 'OUT' THEN -qty WHEN 'ADJUSTMENT' THEN qty WHEN 'TRANSFER' THEN -qty END AS d
    FROM stock_movements
    UNION ALL
    SELECT "productId", "toWarehouseId", qty FROM stock_movements WHERE type = 'TRANSFER' AND "toWarehouseId" IS NOT NULL
  ) x GROUP BY "productId", wh)
SELECT count(*) AS open_zero_rows_non_negative_balance, SUM(c.qty) AS qty
FROM inventory_consumptions c
JOIN stock_movements m ON m.id = c."movementId"
JOIN bal b ON b."productId" = m."productId" AND b."warehouseId" = m."warehouseId"
WHERE c."layerId" IS NULL AND c."unitCost" = 0
  AND NOT EXISTS (SELECT 1 FROM inventory_consumptions s WHERE s."settlesId" = c.id)
  AND b.qty >= 0;
```

**⑤ مرشَّحو المستقبل** — (صنف · مستودع) رصيدُ حركاته أكبرُ من متبقّي طبقاته، وبطاقتُه صفر ولا طبقةَ له في أيّ مستودع ⇒ أوّلُ بيعٍ منه صفريّ:
```sql
WITH bal AS (/* كما في ④ */
  SELECT "productId", wh AS "warehouseId", SUM(d) AS qty FROM (
    SELECT "productId", "warehouseId" AS wh, CASE type WHEN 'IN' THEN qty WHEN 'OUT' THEN -qty WHEN 'ADJUSTMENT' THEN qty WHEN 'TRANSFER' THEN -qty END AS d FROM stock_movements
    UNION ALL SELECT "productId", "toWarehouseId", qty FROM stock_movements WHERE type = 'TRANSFER' AND "toWarehouseId" IS NOT NULL
  ) x GROUP BY "productId", wh),
lay AS (SELECT "productId", "warehouseId", SUM("qtyRemaining") AS qty FROM inventory_layers GROUP BY 1, 2)
SELECT count(*) AS pairs, count(DISTINCT b."productId") AS products
FROM bal b
LEFT JOIN lay l ON l."productId" = b."productId" AND l."warehouseId" = b."warehouseId"
JOIN products p ON p.id = b."productId"
WHERE b.qty > COALESCE(l.qty, 0) + 0.0005
  AND p.cost = 0
  AND NOT EXISTS (SELECT 1 FROM inventory_layers x WHERE x."productId" = b."productId");
```

**⑥ الصفرُ المغسول في التحويل** — طبقاتُ مقصِدٍ وُلدت من مؤقّتٍ صفريّ:
```sql
SELECT count(*) AS layers, SUM(l."qtyReceived") AS received, SUM(l."qtyRemaining") AS remaining
FROM inventory_layers l
JOIN inventory_consumptions c ON c.id = l."transferConsumptionId"
WHERE l."sourceType" = 'TRANSFER' AND c."layerId" IS NULL AND c."unitCost" = 0;
```

**⑦ مطابقةُ عدٍّ بعدٍّ ثانٍ (`§8.7` الحادثة الثالثة)**: مجموعُ `open_zero_rows` في ① (سطر `ROLLUP` الكلّي) = `open_zero` في الحلقة (الطريق ب). افتراقُهما يعني أن أحد المسبارين أعمى.

---

## (7) ما لا أعرفه

1. **لا رقمَ من القاعدة**: هل على التطوير مؤقّتٌ صفريّ الآن، وكم، وفي كم منشأة — §6 لم يُشغَّل. ورقمُ `123` مؤقّتاً مفتوحاً (`provisional-settlement.util.ts:18-19`) قديمٌ من `ق-١٠٦٢` ولا يقول كم منه صفريّ؛ وهجرةُ `ق-١٠٦٣` عدّت المفتوح بلا تمييز الصفر (`20260918130000_inventory_manual_costing/migration.sql:35-38`).
2. **هل الصفرُ «المعروف» يُعلَن كالمجهول**: طبقةٌ بتكلفة صفر مقبولةٌ صراحةً (هديةٌ من المورّد · بونص الصيدليات — `docs/plans/pharmacy-master-plan.md:75`). أرى إعلانه **بمصدره** لا إخفاءه — حكمُ مالك.
3. **التحويلُ الذي يغسل الصفرَ طبقةً حقيقية** (`costing.util.ts:475-485`): أيُعلَن في المقصِد، أم يكفي إعلانُه في المصدر حتى التسوية (`provisional-settlement.util.ts:88-97` تنقل الفرقَ إلى المقصِد)؟ حكمُ مالك.
4. **حفظُ المصدر عموداً أم اشتقاقُ الصفر وحده** — خيارٌ تصميميّ (§5)؛ المخطَّطُ يكره الأعلام (`schema.prisma:6031-6041`) والمصدرُ واقعةُ منشأ لا حالة — أرجّح الاشتقاق في الحدّ الأدنى والعمودَ إن طلب المالك «لماذا».
5. **هل ينطبق «لا أخذَ من البطاقة» (`decisions.md:2889`) على الاستهلاك المؤقّت** أيضاً؟ النصّ في سياق الحركة اليدوية الداخلة؛ والشيفرةُ تأخذ من البطاقة للمؤقّت ومختبَرةٌ عليه (`opening-stock.e2e-spec.ts:204`). إن كان يسري فالإصلاحُ أوسع من الإعلان (يمسّ `costing.util.ts:109-110`) — إحالةٌ تُقاس بسؤال المالك لا تُفترض (`§8.14`).
6. **الكاشير في e2e**: هل تحتاج منشأةٌ معزولة درجاً/صندوقاً قبل `POST /pos/sales` — لم أقرأ `pos.e2e-spec.ts` كاملاً (قرأتُ `:100-194`)؛ يُنسخ الإعدادُ منه حرفاً.
7. **`belowZero` مع التحويلات** (§2-و): قراءةٌ تقول إنه يُحسب خطأً؛ لم يُقَس — بندٌ مستقلّ إن ثبت.
8. **الواجهة**: لا شاشةَ لتقرير المؤقّت؛ هل هو داخلُ نطاق «لا شاشة» المعلَن لبنودٍ مماثلة (`ق-١١٠١`)؟ لم أتحقّق من نطاقه.

---

## مراجعةٌ عدائية

> **المُراجِع:** قارئٌ ثانٍ على `D:\worktrees\outbox-266` — قراءةٌ فقط، بلا تشغيلٍ ولا قاعدة. كلُّ حكمٍ أدناه قراءةٌ لا قياس.
> **الحصيلة:** الحكمُ «قائمة» **يصمد**. والمواضعُ المسمّاة في §2 صحيحةٌ كلُّها عند القراءة إلا انزياحاً بسطرٍ واحد (ر-١٠). لكن التقرير
> **فاته مساران يُنتجان «مؤقّتاً صفرياً مفتوحاً» وهمياً أو دائماً** (ر-١ · ر-٢)، وفي تصميم القياس **ثلاثةُ مسابير عمياء** (ر-٣ · ر-٤ · ر-٥)،
> وفي الاستعلامات **ثلاثةٌ تعدّ غيرَ ما تدّعيه** (ر-٦ · ر-٧ · ر-٨).

### ما تحقّقتُ منه ووجدتُه كما قيل (بلا تعديل)
`costing.util.ts:91-111` (الدرجات الثلاث و`?? 0`) · `:99-101` (الوعد بالتقرير) · `:230-256` (صفُّ `layerId: null` و`ConsumeResult` بلا مصدر) ·
`schema.prisma:2569` و`products.service.ts:52` (`cost: dto.cost ?? 0`) · `create-product.dto.ts:50-53` · `sale-fulfilment.util.ts:77-87, 113-118, 145-154, 157-162` ·
`invoices.service.ts:657-671, 708, 710` · `pos.service.ts:121-127` · `pos-responses.dto.ts:192-199` · `packages/shared/src/api/responses.ts:283-288` ·
`inventory.service.ts:88-95, 151-154, 155-163, 173, 181-203` · `inventory.controller.ts:94-98` · `write-offs.service.ts:199-214, 279-282` ·
`auto-posting.util.ts:280, 384-385, 534, 337-368, 414-424` · `provisional-settlement.util.ts:41, 52, 64-68, 100-102` ·
`inventory-ledger-reconciliation.util.ts:63-68` · `decisions.md:2883` (نصُّ الشرط ٣ عند الموضع 1538 من السطر) و`:2889` · `retail-full-spec.md:177,182` ·
`inventory-master-plan.md:1238` · `opening-stock.e2e-spec.ts:204-217` · `manual-movements-costing.e2e-spec.ts:92-93` · `batch-fefo.e2e-spec.ts:49-66, 242-247`.
ونفيُ `costMissing|zeroCost|ZERO_COST|costSource` في `apps`/`packages` = صفر، **ومسبارُه الضابط** `belowZero` وجد
`sale-fulfilment.util.ts` و`pos-responses.dto.ts` و`pos.service.ts` — فالنفيُ ليس أعمى. ونفيُ `provisional|stockFulfilment` في `apps/web/src` = صفر،
وضابطُه `stockDeduction|belowZero` وجد `PosPage.tsx:439-443`.

### ر-١ 🔴 مسارٌ فائت: المؤقّتُ المُعكَس أو المُرتجَع **يبقى مفتوحاً ثم يُسوّى** — فيُعلَن صفرياً وهو وهم، ويُرحَّل تكلفةً لبيعٍ لم يعد قائماً
- **عكسُ الإخراج اليدويّ**: `inventory.service.ts:420-425` يستدعي `restoreConsumption` ولا يقرأ `restored.provisionalQty`؛ و`costing.util.ts:297-300`
  يعدّ صفَّ المؤقّت غيرَ المسوّى `provisionalQty += qty; continue;` **ولا يكتب شيئاً** — فيبقى الصفُّ `layerId IS NULL` بلا `settledBy`.
- **مرتجعُ البيع**: `sale-fulfilment.util.ts:279-282` → `restoreConsumptionPartial` → `costing.util.ts:387-390` بالسلوك نفسِه؛ وترتيبُ الإعادة
  **من الأحدث** (`:366` `orderBy: desc`) يجعل الشريحةَ المؤقّتة — وهي آخرُ ما كُتب (`:233`) — **أوّلَ ما يُرتجَع**. و`invoices.service.ts`
  لا يقرأ `provisionalQty` من نتيجة المرتجع أصلاً (بحثُ `provisionalQty` في `apps/api/src` لا يجده في `invoices.service.ts`؛ ضابطُه يجده في
  `sale-fulfilment.util.ts:282`).
- **ثم الكاتب**: `provisional-settlement.util.ts:41` يختار كلَّ مفتوحٍ على (صنف · مستودع) **بلا استثناءٍ لحركةٍ مُعكَسة أو مُرتجَعة**
  (البحثُ عن `reversalOf|returnsLineId` في الملف = صفر). فأوّلُ استلامٍ يُنقص الطبقةَ الجديدة بكمّيةٍ عادت فعلاً إلى الرفّ، ويُرحّل
  `(الحقيقية − 0) × الكمّية` على `5100` (`:68`, `:102`) — **وللصفريّ هو القيمةُ كلُّها**.
- **وحارسٌ قائمٌ يقول إن هذا انحراف**: `manual-movements-costing.e2e-spec.ts:193-217` يشترط `الطبقات − المؤقّت المفتوح = رصيد الحركات`؛ وعكسُ
  مؤقّتٍ يرفع رصيدَ الحركات ولا يمسّ الطبقات ولا المفتوح ⇒ انحرافٌ بمقدار الكمّية. **ولا اختبارَ يعكس مؤقّتاً أو يرتجعه** فلم يُمسَك.
- **أثرُه على الدعوى**: (أ) تقريرُ `GET /inventory/provisional` وعدُّ §6 ①④ **يعدّان هذه الصفوف «مؤقّتاً صفرياً مفتوحاً»** وهي ليست بيعاً قائماً؛
  (ب) الإصلاحُ المقترح في §5 سيُعلنها كذلك؛ (ج) قد يكون جزءٌ من «المفتوح» على التطوير من هذا الصنف. **قراءةٌ لا قياس** — يُقاس بـ⑧ أدناه.
- **ما يُضاف لـ§6**: تقسيمُ المفتوح الصفريّ بعمودين:
  ```sql
  EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversalOfId" = c."movementId")                                   AS reversed,
  EXISTS (SELECT 1 FROM stock_movements rm JOIN invoice_lines rl ON rl.id = rm."invoiceLineId"
          WHERE rm.type = 'IN' AND rm.origin = 'SALE' AND rl."returnsLineId" = m."invoiceLineId")                      AS returned
  ```

### ر-٢ 🟠 مسارٌ فائت: التحويلُ **الداخل** إلى مستودعٍ فيه مؤقّتٌ مفتوح لا يسوّيه
مستدعو `settleProvisionalConsumptions` ثلاثةٌ لا غير: `inventory.service.ts:145` (إدخالٌ يدويّ) · `stock-openings.service.ts:210` ·
`purchase-receipt.util.ts:136`. و`transferLayers` (`costing.util.ts:475-493`) ينشئ طبقةَ المقصِد مباشرةً ولا يستدعيه، وفرعُ التحويل في
`inventory.service.ts:155-163` كذلك. ⇒ مؤقّتٌ صفريّ في المقصِد **يبقى مفتوحاً والبضاعةُ على الرفّ**، ويُستهلك ما وصل بالتحويل في البيوع التالية
والصفُّ الصفريّ قائم. §2-ز قال «تصحّح لاحقاً» — **وهذا مسارُ وصولٍ لا يصحّح**. يُضاف إلى الإعلان: «مفتوحٌ رغم رصيدٍ موجب».

### ر-٣ مسبارٌ أعمى: §4 ① الخطوة ٤ `every` على مصفوفةٍ فارغة
`rows.filter(r => r.productId === p).every(...)` **صحيحٌ على المصفوفة الفارغة** — فإصلاحٌ يُسقط صفوفَ الصنف من التقرير (مرشِّحُ فرعٍ ·
بحثٌ · قطعُ صفحة — `inventory.service.ts:184`, `:189-201`) **يمرّ أخضر**. يلزم قبله `expect(mine).toHaveLength(2)` ثم `every`.

### ر-٤ خطأٌ في §4 ④: «ضوابطُ سلبية تمرّ اليوم» — **لا تمرّ اليوم**
`expect(res.body.stockFulfilment.zeroCostProvisional).toEqual([])` على الشيفرة الحالية = `expect(undefined).toEqual([])` ⇒ **يسقط**. وإن
كُتبت بـ`?? []` لتمرّ اليوم صارت **عمياءَ عن الحالة التي وُضعت لها** (تمرّ على كلِّ شيفرةٍ لا تُنتج الحقل). الصياغةُ الصحيحة: الضابطُ
السلبيّ **يُقرأ بعد الإصلاح وحده** ويبدأ بـ`expect(Array.isArray(x)).toBe(true)` — والقاعدةُ `§8.17/③`: «التوكيد على الوجود يسبق التوكيد على الغياب».

### ر-٥ الإعلانُ في الردّ **عابرٌ** — فلا يكفي وحده، والتقريرُ هو الإعلانُ الوحيد الذي يبقى
- `invoices.service.ts:687-690`: «`stockFulfilment` **حقلٌ عابر لا عمود** — لا يُخزَّن ولا يُقرأ لاحقاً». وردُّ الفاتورة لا يقرؤه أيُّ شاشة
  (بحثُ `stockFulfilment` في `apps/web/src` = صفر) — فـ«الفاتورة تُعلن الكمّية» في §3/٣ إعلانٌ **لا يبلغ إنساناً**.
- **وبيعُ الكاشير الأوفلاين**: `pos-responses.dto.ts:225-236` — إعادةُ المزامنة بالمعرّف نفسِه **لا تحمل `stockDeduction`**، والمزامنةُ
  الأولى تجري من طابور الجهاز لا من شاشة `completed()` (`PosPage.tsx:438-449`). ⇒ علَمٌ في الردّ لا يصل البائعَ في البيع الأوفلاين.
- ⟸ **يُعاد ترتيبُ §5**: التقريرُ والعدُّ (البند ٧) **هما الإعلانُ**، والأعلامُ في الردود (٣–٦) تحسينٌ لحظيّ. وتقسيمُ «مجموعُ الصفريّ
  المفتوح» على الحالة أعلاه (ر-١) شرطٌ فيه، وإلا أعلن وهماً.

### ر-٦ §6 ④ «الصامتُ تماماً» يقيس **الآن** بمعادلةٍ **غير** معادلة `belowZero`
(أ) `belowZero` يُحسب **لحظةَ البيع** (`sale-fulfilment.util.ts:157-162`)، والاستعلامُ يقيس رصيدَ اليوم — وتحويلٌ داخلٌ لاحق (ر-٢) أو مرتجعٌ
(ر-١) يقلب السالبَ موجباً فيُعدّ بيعٌ أُعلن يومَها «صامتاً». (ب) المعادلةُ في الاستعلام معادلةُ `stock-quantity.util.ts:24-33` الصحيحة،
**و`belowZero` يحسب بغيرها** (`:160` يجمع التحويلَ الخارج موجباً ولا يقرأ الداخل) — والتقرير نفسُه نبّه إلى ذلك في §2-و ثم لم يطبّقه.
(ج) يشمل مخارجَ لا `belowZero` لها أصلاً (يدويّ · شطب · تحويل). **التصحيح**: `m.origin = 'SALE' AND m.type = 'OUT'`، ورصيدٌ محسوبٌ
بمعادلة `:159-160` حرفاً **على الحركات التي سبقت `m."createdAt"`**:
```sql
(SELECT COALESCE(SUM(CASE WHEN x.type = 'OUT' THEN -x.qty ELSE x.qty END), 0)
   FROM stock_movements x
  WHERE x."productId" = m."productId" AND x."warehouseId" = m."warehouseId" AND x."createdAt" <= m."createdAt") >= 0
```
(تقريبيّ: بيعٌ بسطرين للصنف نفسِه يكتب حركتين في معاملةٍ واحدة — حدٌّ يُعلَن.)

### ر-٧ §6 ⑤ «مرشَّحو المستقبل» أعمى عن **مسار الوصول الذي سمّاه التقرير نفسُه**
الشرطُ `b.qty > COALESCE(l.qty,0)` مع `NOT EXISTS` طبقةٍ للصنف ⇒ يصير `b.qty > 0`؛ فصنفٌ **رصيدُه صفرٌ أو سالب** (حالةُ §3/١ و§4 ①: إخراجٌ يدويٌّ
بلا إدخال) **يُستبعد**، وأوّلُ بيعٍ منه صفريٌّ يقيناً (`sale-fulfilment.util.ts:113-118` يكفيه «له حركة»؛ و`costing.util.ts:109-110`). **التصحيح**:
```sql
SELECT count(DISTINCT p.id) FROM products p
WHERE p.cost = 0
  AND EXISTS (SELECT 1 FROM stock_movements m WHERE m."productId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_layers x WHERE x."productId" = p.id);
```
ويُعدّ **منفصلاً** ما آخرُ طبقاته (بـ`acquiredAt` ثم `createdAt` — `costing.util.ts:94`) تكلفتُها صفر: صفرٌ «معروف» بمصدر `WAREHOUSE_LAYER`/`PRODUCT_LAYER`.

### ر-٨ §6 ⑥ «الصفرُ المغسول» أعمى عمّا سبق `ق-١٣٦٤`
`transferConsumptionId` أُضيف في `20260924170000_layer_cost_distribution/migration.sql:24` **بلا ملءٍ رجعيّ**، ورأسُ الهجرة `:13-14` يقول صراحةً:
«طبقاتُ التحويل القائمة بلا وصلة … تُعدّ هنا ولا تُعاد». ⇒ الـ`JOIN` على `transferConsumptionId` يرى ما بعد الهجرة وحده. يُضاف عدٌّ ثانٍ:
`l."sourceType" = 'TRANSFER' AND l."transferConsumptionId" IS NULL AND l."unitCost" = 0` (صفرٌ مجهولُ المنشأ — لا يُنسب للمؤقّت بلا حكم).
**وما يُباع من هذه الطبقات** صفرٌ **غيرُ مؤقّت** لا يلتقطه `zeroCostProvisional` بعد الإصلاح: يُعدّ بـ`c."layerId" IN (…تلك الطبقات…)`.

### ر-٩ تصحيحُ جدول §2-ج (الشطب): **ليس «لا شيء» عن الصفر**
`write-offs.service.ts:222` يخزّن `baseCost: consumed.totalCost` **عموداً** على الواقعة ويُردّ في `...result.saved` (`:282`) ويُسرد في
`GET /inventory/write-offs`؛ والتعليقُ `:156-158` يعلنه صراحةً: «فتُعتمد الواقعة بحركتها **بلا قيد**، ويظلّ `baseCost = 0` **معلناً ذلك في التقرير**».
فالشطبُ **الأقوى إعلاناً** بين المسارات (عمودٌ دائم) — لكنه إجماليٌّ لا يميّز شطباً جزؤه مؤقّتٌ صفريّ. وهو **وعدٌ ثانٍ في الشيفرة** لم يذكره التقرير.

### ر-١٠ تفاصيلُ صغيرة
- `costing.util.ts:430-431` ⟵ الرقم `229` في **`:429-430`** (السطرُ `431` إغلاقُ التعليق).
- §2-ج (الإخراج اليدويّ): «`resultingQty` إن نزل تحت الصفر» — `resultingQty` يُردّ **دائماً** (`inventory.service.ts:172-173`).
- §5 البند ٨: `inventoryLedgerReconciliation` **لا مسارَ HTTP له** — البحثُ في `apps/api/src` لا يجد مستدعياً غيرَ تعريفه (`:53`)؛ مستهلكوه
  في `apps/api/test` وحدها (`inventory-ledger-reconciliation.e2e-spec.ts:71` · `non-deductible-vat.e2e-spec.ts:77` · `vat-return-closing.e2e-spec.ts:53`).
  فإضافةُ `openProvisionalZeroCost` إليه **حارسٌ لا إعلان** — لا يُحسب في «يُعلَن». ولا ينكسر به شيء: التوكيداتُ `objectContaining` (`:151`, `:184`, `:240`).
- تعريفُ «صفريّ» بـ`unitCost = 0` حرفاً يُفلت «الصفرَ الفعليّ»: بطاقةٌ بـ`0.001` (`Decimal(18,6)` — `schema.prisma:2569`) × ٣ ⇒ `totalCost`
  يُدوَّر إلى `0.00` (`costing.util.ts:252`) ⇒ لا قيدَ (`auto-posting.util.ts:280`) والعلَمُ `false`. حدٌّ يُعلَن أو يُعرَّف بالمال المدوَّر.
- الإخراجُ اليدويّ الصفريّ الجديد (`journalEntryId = null` لأن القيمة صفر — `auto-posting.util.ts:385`) **لا يتميّز** عن «اليدويّ القديم
  بلا قيد» في `provisional-settlement.util.ts:67` ولا في `inventory-ledger-reconciliation.util.ts:68` — أثرُه الرقميّ صفرٌ هنا (`(الحقيقية − 0) × ك`
  = `الحقيقية × ك`)، **لكن أيَّ عدٍّ يفرز «القديم» بـ`journalEntryId IS NULL` يخلط الصنفين**؛ الفيصلُ `createdAt` مقابل لحظة هجرة `20260924160000_manual_stock_entries`.
- §4 ①: `POST /invoices` يمرّ بـ`assertBuyerKindDeclared` (`invoices.service.ts:550`) — العميلُ يُنشأ بـ`kind` كما `batch-fefo.e2e-spec.ts:90`.

### ما يُضاف إلى §4 (يسقط على الشيفرة الحالية إن صحّ ر-١/ر-٢)
- **⑧ المرتجعُ ثم الاستلام**: صنفُ ① ⟵ بيعُ `3` (مؤقّتٌ صفريّ) ⟵ إشعارٌ دائنٌ `GOOD` بـ`3` على السطر ⟵ إدخالٌ `10 × 20`.
  التوكيد: `GET /inventory/provisional` لا يحمل صفَّ البيع **قبل** الإدخال، ولا قيدَ `تسوية استهلاكٍ مؤقّت` بـ`5100` **بعده**، وحارسُ
  `manual-movements-costing.e2e-spec.ts:193-217` صفرٌ للزوج. اليوم (قراءةً): الصفُّ مفتوح، ثم يُسوّى بـ`60` على `5100`، والطبقةُ `7` والحركاتُ `10`.
- **⑨ العكسُ ثم الاستلام**: إخراجٌ يدويٌّ صفريّ ⟵ `POST /inventory/movements/:id/reverse` ⟵ إدخال. التوكيدُ نفسُه على `5810`.
- **⑩ التحويلُ الداخل**: مؤقّتٌ صفريّ في `whB` ⟵ تحويلُ `5` من `whA` (بطبقة) إلى `whB`. اليوم (قراءةً): الصفُّ يبقى مفتوحاً — يُعلَن ولا يُعدّ خطأً حتى يحكم المالك.

### حكمُ المُراجِع
**الحكمُ يصمد: قائمة** — الصفرُ صامتٌ في ردّ الكاشير والإخراج اليدويّ والتحويل، وغيرُ مقروءٍ في الفاتورة، ومسرودٌ بلا علَمٍ في تقريرٍ لا شاشةَ له.
**وأهمُّ تصحيح**: عدُّ «المؤقّت الصفريّ المفتوح» وتقريرُه — اليوم وبعد الإصلاح المقترح — يشملان صفوفاً **عُكست أو ارتُجعت** وتبقى مفتوحةً
ثم يسوّيها أوّلُ استلامٍ بقيمتها كاملةً على `5100`/`5810` (ر-١)؛ فالإعلانُ بلا تقسيمٍ على هذه الحالة يُعلن وهماً، ويُخفي عطلَ دفترٍ أكبر من الصمت نفسِه.
