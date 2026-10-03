# وقائعُ الموجة ٢٥٨ — تُكتب لحظةَ وقوعها

**النموذج:** طلب المالكُ في رأس التوجيه «**5.Opus 5 للبناء**»، وبدّل النموذجَ بأمر
`/model claude-opus-5-5` — **فالبناءُ كلُّه على `claude-opus-5-5`** (Opus 5.5).

## الدمج — مقروءاً من المخرَج
- `#566` ⟵ `b2ae101` · `#567` ⟵ `ef36144` (`git log origin/main`). الطلباتُ المفتوحة بعدهما: **صفر**.
- بوّابةُ `pr-ready.sh 566`: `CLEAN` · خارج `docs/`: **0** · الرأس `616aa77f` (كاملاً `616aa77fe34d23bf489860f08889e09d010abb62`) · `web-tests-light completed success`.
- بوّابةُ `pr-ready.sh 567` **الأولى**: `state=UNKNOWN` ⟸ `✖ الحالُ ليس CLEAN` · `EXIT=1` — **والسيران ناجحان** (`web-tests` · `web-tests-light`).
  ثم قُرئ الحالُ `CLEAN` مباشرةً، وأُعيدت البوّابة ⟸ `✔ جاهزٌ للدمج` · `EXIT=0`. خارج `docs/`: **37** · الرأس `c1c4f0a3`.
  ⇒ **الحالُ يُعاد حسابُه لحظةَ دمج ما قبله — والردُّ عليه صوابٌ لا عطل.**

## السجلّ
- `docs/wave-258-record` ⟵ `b15301c` ⟵ الطلب **`#568`**.
- ⚠️ **حارسُ الترقيم أمسك زلّتي قبل الالتزام**: `ق-٩٠` داخلَ العمود الأوّل (بين علامتَي شيفرة)
  **يُقرأ تسجيلاً لا إحالة** ⟸ `"ق-90"` مكرَّرٌ في `registry-numbering`. نُقل إلى عمود القاعدة ⟸ `5 passed`.

## قراءاتٌ قبل البناء
- **الحزمة م** (`docs/plans/unified-core-plan.md`): **الخصوصيةُ والتشفير** — `㉓A1 ⟵ ⑮A2 ⟵ ⑯A2 · ㉓A2`،
  وتحتاج «**قرارَ KMS (`ق-٧٢٤`)** · والرياضَ قبل أوّل بيانٍ حقيقيّ».
- **`ق-٧٢٨`** (مُقرّ 2026-09-14): «**لا يُشفَّر عمودٌ واحد في القاعدة**» — «يُعاد النظرُ **إن دخل المخطَّطَ
  حقلٌ حسّاسٌ بتعريف النظام … أو حقلُ هويّة**». **و⑮A2 يُدخل حقلَ الهويّة نفسَه.**
- **`⑬A1`** (الصفّ ١٣ في الخطّة الموحّدة): السجلّاتُ الثلاثة + `MAIL FROM` مخصَّص + سطرٌ في `DEPLOY.md`
  **وحارسُ نشرٍ يفحصها (`dig`) قبل أن يُقبل `SMTP_HOST`**؛ الملفّات: `deploy.sh` · `DEPLOY.md` ·
  `production-secrets.ts` · `production-secrets.spec`.
- **`ق-١١٧`**: `rikzapp.com` · `no-reply@` · «**وحارس إقلاعٍ يمنع الإقلاع بلا `SMTP_HOST`**».

---

## ④ التذبذب — **عائلةٌ لا اختبار، ومقيسةٌ قبل العلاج**

### القياس — الحزمةُ كاملةً تحت حِملها، ثلاثَ مرّات (`vitest 3.2.7`)

| التشغيل | الحصيلة |
|---|---|
| ① بالسقف الافتراضيّ (`5000`) | **`4 failed | 28 passed (32)`** · `Duration 190.65s` — الساقطةُ: `PaymentModal` · `ReconciliationPanel` · `LedgerSection` · `NetworkSettlementsPanel` |
| ② ③ **والسقفُ مرفوعٌ في سطر الأمر وحدَه** (`--testTimeout=120000` — للقياس لا للالتزام) | `32 passed` · `128 passed` (مرّتين) · `173.49s` · `164.69s` |

**وأبطأُ اختبارٍ في كلِّ ملفٍّ تحت الحِمل** (أعلى القياسات): `moneyTextGuard` **`30.5 ث`** · `PaymentModal`
**`15.6 ث`** · `NetworkSettlementsPanel` **`11.8 ث`** · `InvoiceBuilderView` **`10.4 ث`** · `CashDepositsPanel`
**`9.8 ث`** · `ContractModal` **`8.0 ث`** · `ReconciliationPanel` **`6.8 ث`** · `LedgerSection` **`6.4 ث`**.
⇒ **ثمانيةُ ملفّاتٍ فيها اختبارٌ يتجاوز خمسَ ثوانٍ تحت الحِمل.**

⭐ **وما يشرح التبدّلَ كلَّه**: خمسةٌ منها كانت تحمل **رقماً مكتوباً بيدٍ على اختبارٍ بعينه**
(`15000` · `20000` · `90_000` — أحدَ عشرَ موضعاً) **فنجت**؛ **والثلاثةُ التي لم يُكتب لها رقمٌ هي التي سقطت**
(`NetworkSettlements` · `Reconciliation` · `LedgerSection`) — وأيُّها يسقط يتبع الحِملَ لحظتَها.

### العلاج — بنصّ المالك

- **كلُّ ملفٍّ يُعلن `vi.setConfig({ testTimeout: N })` في رأسه**، و`N` = **ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له**
  مقرّباً إلى الألف، **بحدٍّ أدنى هو الافتراضيّ `5000`** — **مشتقّةً من تقارير JSON بسكربتٍ لا منسوخةً بيد**
  (`apply-web-budgets.mjs`): `changed=32 files=32` · **ولا بايتَ `NUL`** في الملفّات الاثنين والثلاثين.
- **الأرقامُ الأحدَ عشرَ على الاختبارات حُذفت** — المهلةُ في موضعٍ واحد.
- **⛔ والسقفُ العامّ لم يُرفع** — لا في `vitest.config.ts` ولا في `package.json`.
- **والحارس** `src/test/budgetDeclared.test.ts` **بالمحلّل لا بالنصّ**: ملفٌّ بلا ميزانية · ميزانيةٌ دون الافتراضيّ
  · إعلانٌ داخلَ `describe` · رقمٌ على اختبارٍ **أو خطّاف** · وسقفٌ عامّ — كلُّها تُسقطه.

⚠️ **وميزانيةُ الحارس نفسِه كُتبت أوّلَ مرّةٍ تخميناً** («أقلُّ من ثانية») — **فقِيس وحدَه `3090ms`**. نُقل
التحليلُ إلى الجمع فصار ما تقيسه الأحكامُ **`144 ms` تحت الحِمل**، وصُحّح التعليقُ بالمقيس.

### الإثبات — الحزمةُ كاملةً مرّتين تحت الحِمل، **بالميزانيات الملتزَمة وحدَها**

| التشغيل | الحصيلة |
|---|---|
| **أ** | **`Test Files 33 passed (33)` · `Tests 133 passed (133)`** · `Duration 181.85s` |
| **ب** | **`Test Files 33 passed (33)` · `Tests 133 passed (133)`** · `Duration 183.51s` |

**ولا مهلةَ انقضت** — **وأبطأُ الاختبارات فيهما ما زال فوق خمس ثوانٍ** (`30.5` · `11.3` · `10.4` · `8.7` · `8.1` ث)
⇒ **كان السقفُ الافتراضيُّ سيقطعها، والميزانياتُ هي التي أمرّتها.**

### الإثباتُ العكسيّ — والثالثُ كشف ثقباً

| الكسر | ما وقع |
|---|---|
| ① **الآلية**: `testTimeout: 50` في رأس `PaymentModal` | `→ Test timed out in 50ms.` مرّتين ⇒ **الإعلانُ في رأس الملفّ حيٌّ يُحترم** |
| ② ملفٌّ بلا ميزانية (حُذف إعلانُ `vat.test.ts`) | `1 failed` · `+ "src/lib/vat.test.ts"` |
| ③ **أوّلَ مرّة**: عودةُ `}, 15000);` على أوّل `  });` في `PaymentModal` | 🔴 **`5 passed` — مرّ أخضر** |
| ④ سقفٌ عامّ `testTimeout: 30000` في الإعداد | `1 failed` · `+ "testTimeout"` |

🔴 **والثالثُ فُحص قبل أن يُقرأ** (`§8.8`): أوّلُ `  });` في الملفّ **يُغلق `beforeEach` (السطر ٣٠) لا `it`**
⇒ **الكسرُ وقع في غير موضعه، وكشف معاً ثقباً حقيقيّاً**: رقمٌ على خطّافٍ موضعٌ ثانٍ كرقمٍ على اختبار، والحارسُ
لا يراه. **فمُدّ الحارسُ إلى الخطّافات** (`bc7f9a9`)، **وأُعيد الكسرُ على موضعَيه**:
السطر ٥٧ (يُغلق `it`) ⟸ `+ "src/pages/payments/PaymentModal.test.tsx:32"` · والسطر ٣٠ (يُغلق `beforeEach`)
⟸ `+ "…PaymentModal.test.tsx:21"` — **وكلاهما `1 failed`**. و`dirty 0 → 0` في الكسور كلِّها.

**الالتزامات**: `31dc90b` (الميزانياتُ والحارس) · `bc7f9a9` (الخطّافات).

---

## ⑬A1 — ما قُرئ من وثائق أوراكل **نصّاً** (2026-09-23، قبل أيّ سطر)

**مصادقةُ المسبار**: كلُّ صفحةٍ قُرئت بنصّها في المتصفّح، لا بوصفٍ عنها.

| البند | المقروء | المصدر |
|---|---|---|
| **ترتيبُ البدء الرسميّ** | مجموعةٌ ومستخدم ← صلاحيات ← **بيانات SMTP** ← **نطاقُ البريد** ← السجلّات ← **SPF** ← **DKIM** ← **المرسِلُ المعتمد** ← اتّصالُ SMTP ← إرسالٌ وتحقّق | `Email/Reference/gettingstarted.htm` |
| **المنفذ** | «Email Delivery **supports TLS on port 465**» — TLS من أوّل الاتصال لا `STARTTLS` | `configuresmtpconnection.htm` |
| **المرسِلُ المعتمد** | إقليميّ؛ «**If DKIM isn't active, you can't create the approved sender**»؛ ولا يُنشأ في الحجرة الجذرية | `create-email-domain` · `Create_an_approved_sender` |
| **DKIM** | سجلُّ **`CNAME`** يولّده الكونسول؛ مفتاحان أقصى للنطاق وواحدٌ فعّال؛ «**rotate your keys every six months**» | `configure-dkim-using-the-console.htm` |
| **SPF** | جدولٌ بثلاث مجموعاتٍ لا غير: **Americas** `include:rp…` · **Asia/Pacific** `include:ap.rp…` · **Europe** `include:eu.rp…` — **ولا يسمّي الشرقَ الأوسط** | `configurespf.htm` |
| **مسارُ الارتداد المخصَّص** | اقتراحُهم `<REGIONKEY>.rp.<sending-domain>` بسجلّ `MX` = `10 bmta.email.<REGION IDENTIFIER>.oci.oraclecloud.com` وSPF عليه | `create-email-domain` |
| **الصلاحيات** | ستُّ عباراتٍ من صفحة السياسة (`use email-family` · `manage credentials … smtp` …) | `create-policy.htm` |

### 🔴 والحدُّ اليوميّ — **جدولُ أوراكل يخالف «مئةٌ يومياً مجّاناً»**

من `General/service-limits/default.htm` ← «Email Delivery Limits»، **بنصّه**:

| المورد | الاسم | Universal Credits | Pay As You Go | **Trial** | **Always Free** |
|---|---|---|---|---|---|
| Emails sent in last 24 hours | `max-emails-day` | 50,000 | 50000 | **200** | **0** |
| Emails sent per minute | `sendrate` | 18,000 | 18,000 | **10** | **10** |

و«**Always free resources are for a tenancy and can't be increased**» · و«**Limits can't be increased without
SPF and DKIM set up for each sending domain**».

⇒ **«مئةٌ يومياً» لا تطابق عموداً واحداً** — والمجّانيُّ الدائم **صفر**. **فالرقمُ الملزِم ما تعرضه
الحجرةُ نفسُها في وحدة التحكّم** (`max-emails-day`)، **ولا يُكتب في الشيفرة رقمٌ لم يُقرأ منها** (`§8.14`).

**ومن أين جاءت «مئةٌ يومياً» على الأرجح** — صفحةُ المنتج `oracle.com/application-development/email-delivery/`
(جدولُ الأسعار مقروءاً بالسكربت، 2026-09-23):

| البند | سعرُ الوحدة | الوحدة |
|---|---|---|
| «Email Delivery - 1,000 Emails Sent (**First 3,100 emails**)» | **—** (بلا سعر) | 1000 emails sent |
| «Email Delivery - 1,000 Emails Sent (Greater than 3,100 emails)» | **$0.085** | 1000 emails sent |

⟸ **`3,100 ÷ 31 = 100`** — فـ«مئةٌ يومياً» **شريحةُ سعرٍ مجّانية لا حدُّ إرسال**: أوّلُ ٣٬١٠٠ رسالةٍ بلا ثمن ثم
٠٫٠٨٥ دولاراً لكلِّ ألف؛ **والحدُّ اليوميّ شيءٌ آخر** (`max-emails-day`). ⚠️ **وحدُّ القراءة**: الصفُّ **لا يسمّي
الفترة** («شهرياً» غيرُ مكتوبٍ فيه) — والقسمةُ على ٣١ استنتاجي من تطابق الرقم، لا نصٌّ مقروء. ⚠️ **وتخمينُ عنوانٍ
ثانٍ سقط**: `…/email-delivery/pricing/` ⟸ «Page not found»، فقُرئت صفحةُ المنتج نفسُها.

---

## ④ب — سقوطُ `afterAll` في أربع حزمٍ e2e: **المهلةُ الأخرى في العائلة نفسِها**

**بقرار المالك «لا جلسةَ مستقلّة» عولج هنا** — وهو غيرُ ميزانية الحزمة: مهلةُ **معاملة المستأجر** (خمسُ ثوانٍ
**لا تُرفع** — `ق-١٣٠١`)، لا مهلةُ `jest`.

**السبب مقروءاً**: `purgeInvoicesForTest` (مساعدُ تنظيفٍ للاختبار) كان يُزيل المستنداتِ **كلَّها في معاملةٍ واحدة**.

**والعلاج**: معاملةٌ لكلِّ مستند (`6edd0f7`) — والترتيبُ (الأوراقُ أولاً) محفوظٌ بالتتابع، وكلُّ مستندٍ ذرّيّ.

### ⚠️ وإثباتُه الأوّلُ كان كاذبَ الشهادة — فقِيست الآليةُ لا اللون

| القياس | الناتج |
|---|---|
| الحزمُ الأربع بعد التقسيم | `4 passed` · `43 passed` · `EXIT=0` |
| **الإثباتُ العكسيّ الأوّل** (إعادةُ الشيفرة القديمة) | 🔴 **`PASS` — مرّت القديمةُ أيضاً** ⇒ لونٌ لا يشهد: السقوطُ متقطّع |

فحُقن توقيتٌ مؤقّت في الصيغتين، **وشُغّلت `pos-offline-incidents` أربعَ مرّات** (١٤ مستنداً في كلٍّ):

| الجولة | القديمة: معاملةٌ واحدة | الجديدة: معاملةٌ لكلِّ مستند |
|---|---|---|
| ١ | 🔴 **انقضت المعاملة** — `Transaction not found … old closed transaction` ⟸ `Test Suites: 1 failed` (**والاختباراتُ `6 passed`**) | أطولُ معاملة **`1094 ms`** · ومجموعُها **`7103 ms`** |
| ٢ | **`4775 ms`** من سقف `5000` — **مرّت بفارق `225 ms`** | أطولُ معاملة **`896 ms`** · ومجموعُها **`5925 ms`** |

⇒ **العملُ نفسُه يستغرق `5.9–7.1 ث`** — فمعاملةً واحدةً **يقع على السقف ويتجاوزه بحسب لحظته** (وهو التقطّعُ بعينه)،
ومقسَّماً **لا تتجاوز أكبرُ معاملةٍ `1.1 ث`**: **هامشٌ أربعةُ أضعافٍ ونصف تحت السقف**. و`dirty 0 → 0`.

⭐ **والدرس**: الإثباتُ العكسيُّ لسقوطٍ **متقطّع** لا يُقرأ بلونه — كسرٌ يمرّ أحياناً ليس دليلاً على شيء.
**يُقاس الزمنُ الذي يقع عليه الحدّ** (`§8.8`/الوجه الثالث: «حارسُ سباقٍ يفرض التداخلَ ولا ينتظره»).

---

## ⑬A1 — قراءةٌ ثانيةٌ لوثائق أوراكل نصّاً (2026-09-23، أثناء البناء — بالمتصفّح `get_page_text`)

| الصفحة | المقروء بنصّه |
|---|---|
| `Email/Tasks/configurespf.htm` | **أربعةُ صفوف لا ثلاثة** (تصحيحٌ لسطر «ثلاث مجموعاتٍ لا غير» أعلاه): Americas `include:rp…` · Asia/Pacific `include:ap.rp…` · Europe `include:eu.rp…` · **All Commercial Regions** `v=spf1 include:rp.oracleemaildelivery.com include:ap.rp.oracleemaildelivery.com include:eu.rp.oracleemaildelivery.com ~all` — **ولا يسمّي الشرقَ الأوسط**؛ و«The Approved Senders section within the Console provides validation of an SPF record» |
| `Email/Tasks/configure-dkim-using-the-console.htm` | المالكُ يُدخل **بادئةَ** المنتقي والنظامُ يولّده («Replacement keys each have their own unique selector and include a date component») — ≤ 63 حرفاً `a-z 0-9 -`؛ «Generate DKIM Record» يولّد **`CNAME`**؛ «maximum of two DKIM keys … only one … active»؛ «rotate your keys every six months»؛ والتحقّق من صفحة تفاصيل النطاق |
| `Email/Reference/gettingstarted_topic-create-email-domain.htm` | **مسارُ الارتداد المخصَّص اختياريّ** و«Setting up DKIM is more likely to improve your deliverability than a custom return path»؛ الاسمُ المقترح `<REGIONKEY>.rp.<sending-domain>` · `MX` = `10 bmta.email.<REGION IDENTIFIER>.oci.oraclecloud.com` (تجاريٌّ فقط) + SPF عليه · **DMARC**: «best practice to put a p=none policy in place» · و⚠️ «**If you don't want to manage and process DMARC reports, don't create a DMARC record**» |
| `General/Concepts/regions.htm` | صفُّ الجدول مقروءاً بالسكربت: `Saudi Arabia Central (Riyadh) \| me-riyadh-1 \| Riyadh, Saudi Arabia \| RUH \| OC1 \| 1` ⟸ **مفتاحُ الإقليم `RUH`، والنطاقُ `OC1` تجاريّ** |
| `Email/Reference/gettingstarted_topic-Configure_the_SMTP_connection.htm` | «Email Delivery **supports TLS on port 465**» · والعنوانُ «Public endpoint» يُقرأ من Email Delivery ← Configuration |

⚠️ **ونصُّ DMARC عند أوراكل يخالف ما نفرضه**: هم «لا تُنشئه إن لم تعالج التقارير»، ونحن نشترطه —
**لأن الضابطَ الوطنيّ يسمّيه** (`ECC-2:2024 2-4-3-5`). والتوفيقُ: `v=DMARC1; p=none` **بلا `rua`** سجلٌّ صحيح
(حقلُ التقارير اختياريّ) — فيُعلَن ولا يُلزِم المالكَ بصندوق تقارير.

⚠️ **وتخمينُ عنوانٍ سقط**: كتبتُ رابطَ `create-email-domain.htm` تخميناً فأعاد «Page not found» — فقُرئ الرابطُ
الصحيح من صفحة البدء (`find`)، لا خُمِّن ثانيةً.

**وقُرئت لخطوات المالك** (`get_page_text`، 2026-09-23): «Creating User Permissions» — **ستُّ عبارات** سياسة
(`use email-family` · `manage credentials … where target.credential.type = 'smtp'` · `manage email-family` ·
`manage suppressions in tenancy` · `manage log-groups` · `read log-content`) وبناءُ السياسة من Identity & Security ←
Policies · «Creating SMTP Credentials» — Identity & Security ← الدومين ← User management ← المستخدم ← SMTP credentials
← Generate credentials، و«you can't retrieve the password again after closing» · «Creating an Approved Sender» —
«**must not be created in the root compartment**» · إقليميّ · يُنشأ بعد تفعيل DKIM، ويجوز `@domain` لكلِّ العناوين ·
«Viewing a Tenancy's Limits and Usage» — **Governance & Administration ← Tenancy Management ← Limits, Quotas and
Usage** ومن قائمة الصفّ «Open support request».

## ② غيرُ القابل للخصم في طبقةٍ استُهلك بعضُها — ما قُرئ من الشيفرة (تحليلٌ لا بناء)

| الموضع | المقروء |
|---|---|
| `purchases/layer-cost-spread.util.ts` | الحكمُ القائم (إشعارُ السعر `ق-٩٩٠` والتكلفةُ المحمَّلة `ق-١١٤٦`): **ما على الرفّ يرفع تكلفةَ الطبقة على `1300`، وما استُهلك `5100` في فترة الحدث** — `onShelfQty = min(unitsAffected, qtyRemaining)` و`consumedQty = unitsAffected − onShelfQty` |
| `purchases/landed-costs.service.ts:180-183` | `unitsAffected: layer.qtyReceived` · `qtyRemaining: layer.qtyRemaining` ⟸ **كلُّ ما غادر الطبقةَ «مستهلَك»** |
| `inventory/costing.util.ts` `transferLayers` | التحويلُ **يستهلك طبقةَ المصدر** (`consumeFifo` · `exit: 'OTHER'`) **ويُنشئ طبقةً في المقصِد بتكلفة الشريحة** ⟸ الوحدةُ المحوَّلة على رفٍّ آخر **وتُعدّ «مستهلَكة» في طبقتها الأصلية** |
| `inventory/write-offs.service.ts:199-204` | الإتلافُ يستهلك الطبقات (`consumeFifo` · `exit: 'OTHER'`) ⟸ يُعدّ «مستهلَكاً» فحصّتُه إلى `5100` لا `5800` |
| `inventory/costing.util.ts` `restoreConsumption` | مرتجعُ البيع **يزيد `qtyRemaining` للطبقة الأصلية** (فتُقيَّم الوحدةُ بتكلفة الطبقة **الحالية**) **ويعكس `5100` بـ`consumption.unitCost` القديمة** ⟸ فرقُ الرفع لا يعود من `5100` إلى `1300` |
| `purchases/purchase-return.util.ts` (رأسُه) | المُعادةُ إلى المورّد تخرج **من طبقة استلامها**، و«فرقُ سعر المُعاد عن تكلفة طبقته» ⟵ `5100` |
| مسبارٌ مُصادَق: `qtyRemaining` في `src/reports` = **`0` ملفّ** (والموجبُ `src/inventory` = **`5`**) · `INVENTORY_ACCOUNT_CODE` خارج تعريفه = **رفضُ الرصيد الافتتاحيّ وحدَه** (`accounts.service.ts:285`) | ⟸ **لا مطابقةَ بين رصيد `1300` وقيمة الطبقات** — فالافتراقُ يتراكم بلا حارس |
| `obligations/obligations.service.ts:141` | وسمُ «قُدِّم» يُرفع بـ`deleteMany` — **قابلٌ للعكس بيد التاجر** |

## ③ GlitchTip — مقروءٌ قبل البناء (2026-09-23)

| المصدر | المقروء بنصّه |
|---|---|
| `glitchtip.com/documentation/install` — «Data Retention» | `GLITCHTIP_RETENTION_DAYS` **90** «Master default for all retention periods» · `GLITCHTIP_EVENT_RETENTION_DAYS` «Error event retention (hot + cold)» (افتراضُه القيمةُ الأمّ) · `GLITCHTIP_EVENT_HOT_DAYS` **30** «Days to keep events in PostgreSQL before archival» · «Older data is archived to Parquet files on **S3 or the local filesystem** (cold)» |
| مصدرُ الخادم `glitchtip-backend/apps/event_ingest/api.py` | `@router.post("/{project_id}/store/")` ⟵ `event_store` · والتعميةُ على الخادم أيضاً: `request.auth.scrub_config, settings.GLITCHTIP_PII_SCRUB_DEFAULT` |
| `…/event_ingest/authentication.py` | المفتاحُ من `sentry_key`/`glitchtip_key` في الاستعلام، أو `Authorization: Bearer`، أو رأسُ **`X-Sentry-Auth`** (`parse_auth_header` ⟵ `sentry_key`) — «Avoids reading the request body» |

⇒ **الإرسالُ بلا مكتبة**: حدثٌ يُبنى بقائمة سماحٍ ويُرسَل `POST` إلى `/api/<project>/store/` برأس `X-Sentry-Auth`
— فلا يجمع شيءٌ ما لم نختره (مكتبةُ Sentry تجمع افتراضاً ما لا نراه). **والبادئةُ مقروءةٌ أيضاً**:
`glitchtip/urls.py:43` `path("api/", api.urls)` · `glitchtip/api/api.py:59` `api.add_router("", event_ingest_router)`
⟸ **`/api/<project_id>/store/`**؛ وبجانبه `urls.py:28` `api/<int:project_id>/envelope/`. ⚠️ **وحدُّه**: لا خادمَ
GlitchTip لدينا بعد — فأوّلُ إرسالٍ حيّ هو ما يُثبت الوصلَ كاملاً.

## ⑬A1 — الالتزامُ والإثباتُ العكسيّ

- الفرع `feat/mail-domain-auth` من `origin/main` (`ef36144`) ⟵ الالتزام **`f177802`**.
- الاختباراتُ قبله: `mail-dns-check` **`6 passed`** (`172.5 s` للملفّ، `61 s` للحالات) · `mail/mail|production-secrets`
  **`4 suites · 34 passed`** · `boot-vars-reach-container` **`2 passed`** بعد الإصلاح · `tsc` **`0`**.
- **الإثباتُ العكسيّ — خمسةُ كسورٍ بصياغةٍ محتملة** (`reverse-a1.sh`، `16:17:33Z → 16:29:49Z`، `dirty 0 → 0`):

| الكسر | الصياغةُ المحتملة | الحصيلة |
|---|---|---|
| p1 `mail-dns-check.sh` | غيابُ DMARC يُطبع ولا يُسقط (`fail=1` محذوف — «أوراكل تقول لا تُنشئه») | `1 failed, 5 passed` — ⑥ |
| p3 `production-secrets.ts` | الحلقةُ على `REQUIRED` لا على `rules` (المتغيّرُ الجديد يُعرَّف ولا يُستعمل) | `3 failed, 17 passed` — ③④⑤ |
| p5 `mail-quota.service.ts` | الموضعُ من `SELECT` بعد الزيادة لا من `RETURNING` | **`1 failed, 1 passed` في التشغيلات الثلاثة** — ② |
| p6 `mail.service.ts` | الإرسالُ بلا نداء العدّ | `4 failed, 2 passed` — ①②④⑥ |
| p7 `mail-quota.util.ts` | `n >= 0` لا `n > 0` | `2 failed, 24 passed` — ③ في الإقلاع و⑥ في الأداة |

⇒ **وحارسُ التركيب** (`boot-vars-reach-container`) أُثبت **بالعطل الحقيقيّ لا بكسرٍ محقون**: سقط على غياب
`MAIL_DAILY_LIMIT` من `docker-compose.prod.yml` قبل إضافته.

## ③ — البناءُ والإثباتُ العكسيّ

- الفرع `feat/error-tracking` **مكدَّسٌ على** `feat/mail-domain-auth` (يشتركان في `production-secrets.ts`
  و`docker-compose.prod.yml`) ⟵ الالتزام **`ff3433e`**؛ و⑬A1 أُضيف له التزامٌ ثانٍ **`bd23d3a`** (صفّا البريد في
  `docs/licensing-and-operations.md`).
- قبل الالتزام: `tsc` **`0`** · `error-tracking|production-secrets|boot-vars-reach-container|request-id`
  **`6 suites · 49 passed`** (منها `test/request-id.e2e-spec.ts` لأن النمطَ طابقه).
- مِن مسح الأبواب: البابُ ⑪ (`docs/domain-scan/11-تشغيل-المنصة.md`) البندُ **A3 (S14)** «تتبّعُ أخطاءٍ **بعين المنشأة**
  + مقاييسُ طلباتٍ/زمنٍ + إنذار» — **بُني شقُّ التتبّع وحدَه**؛ و«بعين المنشأة» لا يُرسَل (ليس في قائمة المالك) —
  **والبصمةُ تُعكس عندنا لا عند المتتبّع**: نحسب HMAC لمستخدمينا فنعرف منشأتَه.
- **الإثباتُ العكسيّ — سبعةُ كسور** (`reverse-et.sh`، حتى `16:58:30Z`، `dirty 0 → 0`):

| الكسر | الصياغةُ المحتملة | الحصيلة |
|---|---|---|
| r1 `error-reporter.ts` | «للتشخيص»: `request: { url, headers }` في الحدث | `1 failed, 4 passed` — ① |
| r2 `error-event.util.ts` | الرسالةُ كلُّها سطراً واحداً بدل سطرها الأوّل | `1 failed, 6 passed` — ③ |
| r3 `error-event.util.ts` | نمطُ البريد محذوف | `2 failed, 10 passed` — ② و① |
| r4 `http-exception.filter.ts` | `status >= 400` بدل `>= 500` | `1 failed, 4 passed` — ② |
| r5 `error-reporter.ts` | `throw err` بدل `return false` في `catch` | 🔴 **لم تكتمل الحزمة: سقطت عمليةُ jest نفسُها** — `triggerUncaughtException … [DOMException [TimeoutError]]` (`Node.js v24.18.0`) ⟸ **وعدٌ غيرُ منتظَرٍ يُرفض يُسقط العمليةَ كلَّها — وفي الإنتاج هي عمليةُ الخادم**؛ فالكسرُ أُمسك بأشدِّ صوره لا بسطر اختبار |
| r6 `error-event.util.ts` | المعرّفُ خاماً بلا بصمة | `2 failed, 10 passed` — ⑤ و① |
| r7 `production-secrets.ts` | فحصُ `https` محذوف (`parseDsn` يقبل المحلّيّ) | `1 failed, 22 passed` — ③ |

## ⑥A3 — رسالةُ «تغيّر بعد التقديم» (إصلاحٌ خارج التوجيه، طلبٌ مستقلّ)

- الفرع `fix/vat-filed-note` من `origin/main` ⟵ **`a281901`**: `filedChangeNote` في `return-correction.util.ts`
  (الحدُّ من `CORRECTION_UNDERSTATEMENT_LIMIT` والاتجاهُ من الفرق) + عودةُ توثيق `VatReturnFiling` إلى نموذجه
  وتصحيحُ «سجلٌّ لا يُحذف» (الوسمُ يُرفع بـ`deleteMany`).
- `npx prisma validate` ✔ · و`prisma format --check` «unformatted» **قائمٌ على `main` نفسِه** (مقيس على نسخته) لا مِنّي.
- الاختبارات: `return-correction|rent-accrual-return|prisma-client-fingerprint|model-parent-declared` **`4 suites · 30
  passed`** (منها `rent-accrual-return.e2e-spec.ts` `257.5 s` — المرحلةُ ⑩ توكّد `م٦٣` و«عشرين يوماً»).
  ⚠️ وأوّلُ أمرٍ سقط بـ`Both --runInBand and --maxWorkers were specified` — **خطأُ أمرٍ لا اختبار**؛ أُعيد بواحدٍ منهما.
- **الإثباتُ العكسيّ** (`reverse-vat.sh`، `dirty 0 → 0`): v1 الحدُّ مكتوباً `'15,000'` ⟸ `2 failed, 6 passed` · v2 كلُّ
  تغيّرٍ نقصاً (`diff !== 0`) ⟸ `1 failed, 7 passed`.

## المحطةُ على اتّحاد الفروع الأربعة (فرعٌ محلّيٌّ مؤقّت لا يُدفع)

- `tmp/station-258` = `feat/error-tracking` (وتحته ⑬A1) + دمجُ `fix/web-test-budgets` + دمجُ `fix/vat-filed-note` ⟵
  الرأس **`a1dace3`** · `dirty=0` · و`npx prisma generate` للاتّحاد قبلها.
- **`station-split.sh w258u`** على `mad_app_clean`: `common` **`EXIT=0 · 591 s` · `83 passed` · `509 passed`** · `rest`
  **`EXIT=0 · 512 s` · `76 passed` · `507 passed`** · `STATION_DONE=0`.

- **e2e كاملاً** (`e2e-all.sh w258u` على `mad_app_clean`، بعد المحطة مباشرةً): `FAIL test/batch-fefo.e2e-spec.ts (78.202 s)` —
  حالتا ③ و④ `expected 201 "Created", got 500` على `POST /purchases`، **وسببُه في سجلّ الخادم**: `Transaction already
  closed … The timeout for this transaction was 5000 ms, however 5077 ms passed` (والثانية `5034 ms`) — **مهلةُ معاملة
  المستأجر في مسار شراءٍ لم تلمسه هذه الموجة**. **والذاكرةُ الحرّة لحظتَها `286 MB` من `7,975 MB`** (مقروءةٌ بـ`Win32_OperatingSystem`)
  ⟸ يُعاد وحدَه على القاعدة النظيفة بعد انتهاء الحزمة (`alone-29.sh` · `ALONE_DB=clean`) قبل أيّ حكم.
- **نهايةُ الحزمة**: `EXIT=1  4413 s` · `▶ أحكامُ الشرائح: FAIL · PASS · PASS · PASS ⇒ FAIL` · `ملفّاتُ e2e على القرص: 158 · شرائح: 4`
  — **والساقطُ الوحيد `batch-fefo`**.
- **وإعادتُه وحدَه — مرّتان، والأولى عطلُ أداة**: `alone-29.sh` بسقف `1536 MB` ⟸ **`EXIT=134`** «JavaScript heap out of memory»
  (`Mark-Compact … 1532.9 → 1531.0 MB`) — **الأداةُ أضيقُ من e2e لا الاختبار ساقط**؛ فأُعيد بسقف مُشغِّل الشرائح نفسِه
  (`--max-old-space-size=3072` · `--forceExit --runInBand` · الذاكرةُ الحرّة `2,822 MB`) ⟸ **`PASS test/batch-fefo.e2e-spec.ts
  (102.759 s)` · `Tests: 9 passed, 9 total` · `EXIT=0`**.
  ⇒ **حِملٌ لا شيفرة** — وبدليلين مستقلّين: وحدَه أخضر، والسيرُ على لينكس أخضرُ على كلِّ فرع.

## الطلبات — مقروءةً من مخرَج `gh pr create`

- **`#569`** ⟵ `fix/web-test-budgets` (④ التذبذب) — قاعدتُه `main`.
- **`#570`** ⟵ `feat/mail-domain-auth` (⑬A1) — قاعدتُه `main`.
- **`#571`** ⟵ `feat/error-tracking` (③) — **قاعدتُه `feat/mail-domain-auth`** (مكدَّس).
- **`#572`** ⟵ `fix/vat-filed-note` (⑥A3 الرسالة) — قاعدتُه `main`.
- دُفعت الفروعُ الأربعة **والحزمةُ المحلّية e2e ما زالت تعمل** — والمحطةُ الموحّدة (`api-unit` كاملةً) خضراء قبله.
- **السيرُ على الأربعة** (`gh run list` ثم البوّابةُ `pr-ready.sh` — حكمُها سطرُها لا رمزُ خروجِ `tail`):

| الطلب | الحال | خارج `docs/` | الرأس | السير |
|---|---|---|---|---|
| `#569` | `CLEAN` · قاعدته `main` | 34 | `6edd0f74` | `web-tests` ✔ · `web-tests-light` ✔ ⟸ **«✔ جاهزٌ للدمج»** |
| `#570` | `CLEAN` · قاعدته `main` | 18 | `bd23d3a5` | ✔ · ✔ ⟸ **«✔ جاهزٌ للدمج»** |
| `#571` | `CLEAN` · قاعدته `feat/mail-domain-auth` | 11 | `ff3433e3` | ✔ · ✔ ⟸ **«✔ جاهزٌ للدمج»** |
| `#572` | `CLEAN` · قاعدته `main` | 4 | `a2819010` | ✔ · ✔ ⟸ **«✔ جاهزٌ للدمج»** |

  ⇒ **والثقيلُ على لينكس يشمل `db-integration` (e2e كاملاً)** — **فـ`batch-fefo` مرّ هناك على كلِّ فرعٍ وحدَه**، وسقوطُه المحلّيّ
  تحت `286 MB` حرّة حِملٌ حتى يُثبت غيرَه تشغيلُه وحدَه.

## صفُّ النتائج `ق-١٣٣٦` في `#568`

- نسخةُ عملٍ منفصلة `D:/worktrees/rec-258` على `docs/wave-258-record` (والحزمةُ المحلّية تعمل على الرئيسية) — استُبدل الصفُّ
  المؤقّت بحقنٍ يشترط وقوعَ النصّ مرّةً (`inject.mjs`).
- حرّاسُ السجلّ هناك: `registry-numbering` · `registry-not-with-code` · `rule-extension-attached` · `platform-decisions` (وحدةً
  وe2e) ⟸ **`5 passed` · `23 passed` · `EXIT=0`**.
- الالتزامُ **`29776e7`** ⟸ دُفع (`b15301c..29776e7`).
- **بوّابةُ `#568`**: `CLEAN` · خارج `docs/`: **0** · الرأس `29776e7e` · `web-tests-light completed success` ⟸ **«✔ جاهزٌ للدمج»**
  (والثقيلُ غيرُ مطلوبٍ لطلب وثائق).
- **الطلباتُ المفتوحة بعد الموجة** (`gh pr list --state open`): `#572` · `#571` · `#570` · `#569` · `#568` — **خمسةٌ كلُّها لهذه
  الموجة**. والفرعُ المحلّيّ المؤقّت `tmp/station-258` حُذف (`was a1dace3`)، والنسخةُ الرئيسية على `feat/error-tracking`؛
  ونسخةُ العمل `D:/worktrees/rec-258` **باقيةٌ** — حذفُها خارج النسخة الحالية بإذنك.

## ⑬A1 — ما أمسكه البناءُ قبل الالتزام

- **`docker-compose.prod.yml` يسرد بيئةَ `api` بالاسم ولم يكن فيه `MAIL_DAILY_LIMIT`** ⟸ لو ضبطه المالكُ في
  `.env.production` لرُفض الإقلاعُ بـ«غير مضبوط». الحارسُ الجديد `boot-vars-reach-container.spec.ts` سقط عليه
  أوّلاً (`1 failed, 1 passed` · `+ "MAIL_DAILY_LIMIT"`) قبل الإصلاح — **فالحارسُ يرى**.
- **توثيقُ `VatReturnFiling` الأصليّ (`ق-٩١٩`) معلّقٌ فوق `enum VatPeriod` على `main` منذ الحزمة و (#567)**:
  حين أُدخل التعدادُ بين التوثيق ونموذجه كتبتُ للنموذج إعلاناً بديلاً وتركتُ الأصلَ فوق التعداد يصفه خطأً —
  **والتصق بنموذج العدّاد حين أدخلتُه بعده**. نُقل العدّادُ إلى آخر المخطَّط، **وإصلاحُ التوثيق طلبٌ مستقلّ**.
- **وفي الموضع نفسِه تناقضٌ نظاميّ على شاشة التاجر**: `obligations.service.ts:688` يقول «نقصٌ **دون 15,000 ريال**
  يجوز إدراجُه في الإقرار التالي (م٦٣/٣)» — **والنصُّ المقروء في الموجة ٢٥٧ «less than five thousand (5,000) SAR»**،
  وتوثيقُ ⑥A3 في المخطَّط «دون خمسة آلاف». ولا اختبارَ يوكّد نصَّ الرسالة (مقيس: `grep`).
- **`mail-dns-check.spec.ts`**: `172.5 s` للملفّ محلياً، منها **`61 s` للحالات** (٩ تشغيلاتٍ لـ`bash` على ويندوز
  `7–12 s` لكلٍّ) **والباقي تجميعُ `ts-jest` لملفٍّ متغيّر** — ومثلُه `mail.service.spec.ts` الجديد `148.9 s`.
- **وسمٌ خمّنتُه وحذفتُه**: كتبتُ `[SPEC 11.6]` على وصف الحارس **بلا قراءة `SPEC`** — فقُرئ: لا بندَ لمصادقة
  النطاق، و`13.7` «إشعارات بالبريد» ⬜ لا يُثبته هذا. فحُذف الوسم.
