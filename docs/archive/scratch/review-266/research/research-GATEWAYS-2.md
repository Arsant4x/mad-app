# بحث GATEWAYS-2: اقتسام العمولة مع مزوّد النظام (R207) ووثيقة PCI DSS المطلوبة منّا (R208)

**تاريخ القراءة:** 2026-09-27 (بتوقيت الرياض، بين 05:00 و05:45 تقريباً). الموجز قال 2026-09-26، والقراءات وقعت بعد منتصف الليل، فالتاريخ المكتوب هنا هو تاريخ القراءة الفعلي.
**النطاق:** بندان من القسم ٨ في `docs/أسئلة-الجهات-النظامية.md:276-277` (السؤالان ٧ و٨ الموجّهان إلى مويسر وتاب وباي تابس).
**القيود المحترمة:** قراءة صفحات عامة فقط، بلا تسجيل دخول ولا إرسال نموذج ولا بريد، وبلا قبول اتفاقية ترخيص. المستودع لم يُمسّ.
**حدّ البحث (معلَن):** أداة البحث العامّة (WebSearch) كانت مستنفدةً في هذه الجلسة (200 من 200)، فلم يُستعمل محرّك بحث قطّ. **كل مصدر أدناه بلغتُه بجلبٍ مباشر من نطاق الجهة نفسها وخرائط مواقعها (`sitemap.xml` / `llms.txt`)**، والنسخ الخام محفوظة في `D:\mad-app-scratch\review-266\research\gw2\` (HTML والنص المستخرج؛ وملفا PCI بصيغة PDF ونصّهما).
**مرجع الحجّية:** مويسر وتاب تنصّ شروطهما على أن **النص العربي هو المعتمد عند الاختلاف** (مويسر، شروط المنصات م17.3؛ تاب، الأحكام العامة)، فحيث وُجد عربيٌّ قُدِّم.

---

## الخلاصة

| # | البند | الحكم | الجواب في سطر |
|---|---|---|---|
| **R207** | اقتسام العمولة مع مزوّد النظام | **`letter`** (منشورٌ جزئيّ) | **باي تابس وحدها تنشر** برنامج شركاء بعمولةٍ على كل إحالةٍ مؤهّلة بعد توقيع اتفاقية، ولا تنشر النسبة. **مويسر وتاب لا تنشران اقتسام عمولتهما**؛ المنشور عندهما آليةٌ أخرى: **المنصة تتقاضى رسمها هي من التاجر** (مويسر: «الرسوم… المستحقة على التاجر لصالح المنصة» تُستقطع قبل التسوية؛ تاب: تقسيم العملية بمعامل `destinations` بحيث يذهب جزءٌ «رسوماً أو عمولة» إلى حساب السوق). والنسب عند مويسر «يقدّمها فريق المبيعات». |
| **R208** | أيّ وثيقة PCI تُطلب منّا وحقول البطاقة لا تمرّ بخوادمنا | **`letter`** | **ولا واحدةٌ من الثلاث تنشر ما تطلبه من منصةٍ (مزوّد خدمة) بعينها.** المنشور كلّه عن **التاجر** بحسب طريقة الربط: الصفحة المستضافة بلا متطلب (باي تابس: «SAQ A أو بلا مستوى PCI»؛ تاب: «SDK Handled»؛ مويسر: التاجر عبر واجهتها لا يحتاج شهادة). ومويسر وحدها تُلزم **المنصة** بالمعيار نصّاً (م5.3 «يلتزم كل طرف») بلا تسمية وثيقة. **ومن جهة المجلس** (نصٌّ أصليّ، إصدارٌ متقاعد): «SAQ D for Service Providers» هو **الاستبيان الذاتي الوحيد** لمقدّمي الخدمات، والمتطلب 12.9.2 يُلزم مزوّد الخدمة بتقديم حالة امتثاله لعملائه عند الطلب. |

**خطابات جاهزة (لم تُرسل):**
- `letters/GATEWAYS-2-Moyasar.md`
- `letters/GATEWAYS-2-Tap.md`
- `letters/GATEWAYS-2-PayTabs.md`

---

## المصادر المقروءة

| رمز | المصدر | الرابط | ما قُرئ |
|---|---|---|---|
| M1 | مويسر: «الشروط والأحكام الخاصة بتقديم خدمة الدفع عبر المنصات»، آخر مراجعة 14 أبريل 2026 (عربي معتمد + إنجليزي) | https://moyasar.com/ar/resources/platform-terms-and-conditions/ · https://moyasar.com/en/resources/platform-terms-and-conditions/ | كاملة (18 مادة) |
| M2 | مويسر: صفحة «حلول الدفع للمنصات والأسواق الإلكترونية» | https://moyasar.com/ar/solutions/platforms-and-marketplaces/ · …/en/… | كاملة |
| M3 | مويسر: «Manage & Automate» و«Subscriptions & SaaS» | https://moyasar.com/en/products/manage-and-automate/ · https://moyasar.com/en/solutions/subscriptions-and-saas/ | كاملتان |
| M4 | مويسر: الشروط والأحكام العامة للتاجر (آخر مراجعة 16 فبراير 2026) | https://moyasar.com/ar/resources/terms/ · …/en/… | بند PCI وما حوله |
| M5 | مويسر (وثائق المطوّرين): «Security Considerations»، آخر تحديث 22 سبتمبر 2026 | https://docs.moyasar.com/guides/coupons/security-considerations | كاملة |
| M6 | مويسر (وثائق المطوّرين): «Custom UI» | https://docs.moyasar.com/guides/card-payments/custom-ui | كاملة |
| M7 | مويسر: خريطة الموقع (23 صفحة غير مدوّنة بالإنجليزية) وخريطة الوثائق (193 عنواناً) | https://moyasar.com/sitemap.xml · https://docs.moyasar.com/sitemap.xml | كاملتان |
| T1 | تاب: الشروط والأحكام لموقع المملكة (عربي معتمد + إنجليزي) | https://www.tap.company/ar-sa/terms-and-conditions · https://www.tap.company/en-sa/terms-and-conditions | كاملة |
| T2 | تاب (وثائق): «Getting Started» للأسواق، محدَّثة 2025-11-13 | https://developers.tap.company/docs/marketplace-getting-started | كاملة |
| T3 | تاب (مرجع): «Destinations» · «Create a Charge» (معامل `platform`) · «Creating a Transaction» للمنصات | https://developers.tap.company/reference/destinations · https://developers.tap.company/reference/create-a-charge · https://developers.tap.company/docs/creating-a-transaction | كاملة |
| T4 | تاب (وثائق): «Overview» (جدول مقارنة طرق الربط)، محدَّثة 2026-03-04 | https://developers.tap.company/docs/get-started | كاملة |
| T5 | تاب (وثائق): «Encrypted Card Flow (PCI)»، محدَّثة 2025-09-11 | https://developers.tap.company/docs/encrypted-card-flow-pci | كاملة |
| T6 | تاب: صفحات «Platforms» و«Marketplaces» و«Development agencies» و«Regulatory Licenses» لموقع المملكة | https://www.tap.company/en-sa/products/platforms · …/marketplaces · …/development-agencies · https://www.tap.company/en-sa/regulatory-licenses | كاملة |
| P1 | باي تابس: «Partner Program» (إنجليزي) و«برنامج الشركاء» (عربي) | https://ai.paytabs.com/en/partner-program/ · https://ai.paytabs.com/ar/برنامج-الشركاء/ | كاملتان |
| P2 | باي تابس (البوابة الفنية): «Get to know More About the PCI Requirements» لكلٍّ من الصفحة المستضافة والنموذج المُدار والنموذج الخاص | https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Hosted-Payment-Page/HPP-Step-1-Setup-and-Activate-Integration-Method/Get%20to%20know%20more%20about%20the%20PCI%20requirements/ (ومثلها تحت `Managed-Form` و`Own-Form`) | الثلاث كاملة |
| P3 | باي تابس (بوابة الدعم): «What is PCI DSS? and What are the Merchant Requirements?»، معدَّلة 30 أبريل 2024 | https://support.paytabs.com/en/support/solutions/articles/60000709976-what-is-pci-dss-and-what-are-the-merchant-requirements- | كاملة |
| P4 | باي تابس: «Security Compliance» | https://ai.paytabs.com/en/security-compliance/ | كاملة |
| S1 | **مجلس معايير أمن صناعة بطاقات الدفع (PCI SSC)**: «SAQ D for Service Providers and Attestation of Compliance» لـ PCI DSS v4.0، أبريل 2022 (**إصدارٌ متقاعد**، منشورٌ بلا اتفاقية) | https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-D-Service-Provider.pdf | الصفحات ii إلى iii (الأهلية) و9 (النطاق) و121 إلى 122 (12.9) عبر `pdftotext` |
| S2 | تعميم ساما 46004436 (عربي نافذ + ترجمته) | https://rulebook.sama.gov.sa/ar/node/10245 | قُرئ في بحث PAY-1؛ واستُعمل هنا نصُّه المحفوظ `pay1/circ-ar-body.txt` و`raw/circ-46004436-en.txt` |

---

## R207 — هل تقتسمون العمولة مع مزوّد النظام؟ وبأي آلية؟ · **`letter`**

### ① باي تابس — **منشورٌ: نعم، عمولة إحالة، بلا نسبة**

- **الإنجليزي (P1):** «Start referring PayTabs payment solutions on your website or online portal and earn a commission for every qualified referral made!»، والبرنامج مفتوحٌ صراحةً لـ«a web development or software solutions company».
- **العربي (P1، المعتمد للقارئ السعودي):** «يُعتبر برنامج شركاء PayTabs طريقة جديدة لكسب دخل إضافي وتقديم حلول سلسة لعملائك».
- **الآلية بنصّها:** التقديم بنموذج ← تقييم الأهلية وطلب الوثائق ← «سيُطلب من الشركاء المؤهلين توقيع اتفاقية» ← لوحة تحكم للشريك لرصد الإحالات (والإنجليزي يضيف «monthly statements of account»). و«قد يخضع الشركاء لفحص "اعرف عميلك" لتحديد مسار الشراكة».
- **ما لم يُنشر:** تعريف «الإحالة المؤهّلة»، وأساس العمولة (نسبة من رسوم المعالجة أم مبلغ ثابت)، ومدّتها، ومن يتحمّلها. ⟵ في الخطاب.
- **حدّ:** الصفحة على `ai.paytabs.com/en/`، وهي الوجهة التي يحيل إليها مُنتقي الدولة «KSA» في الموقع نفسه (مقروءٌ من شيفرة الصفحة)، فلا صفحة سعودية منفصلة.

### ② مويسر — **لا تنشر اقتسام عمولتها؛ تنشر أن المنصة تتقاضى رسمها من التاجر**

- **تعريف «الرسوم» (M1، م1، العربي):** «الرسوم: هي المبالغ أو العمولات المالية المستحقة على التاجر/المستفيد لصالح المنصة مقابل الخدمات المقدمة له.»
- **استقطاعها قبل التسوية (M1، م16.1):** «تتم تسوية مستحقات التاجر/المستفيد بعد استقطاع الرسوم المتفق عليها وضريبة القيمة المضافة»، و(م16.6) «يحق للمنصة مراجعة وتعديل رسوم الخدمات».
- **التقسيم عند الدفع (M2، العربي):** «تقسيم المدفوعات عند الدفع (عمولة المنصة، حصة البائع، شركاء اختياريون)»، و«رسوم مرنة (لكل بائع/خطة/قطاع)». و(M3): «Flexible Fees & Revenue Sharing: set pricing, split payments, and distribute funds automatically to every party.»
- **الأسعار (M2/M3):** «Fees and rates are provided by our sales team.»
- **وصف العلاقة (M1، م17.2):** «لا تمثل الشروط والأحكام شراكة بين الأطراف ولا تمثيلا ولا وكالة ولا نيابة عن أي طرف».
- **ما لم يُنشر:** هل تدفع مويسر للمنصة جزءاً من **رسوم المعالجة التي تتقاضاها هي**؟ لا نصّ.
- **بحثٌ نافٍ مُصادَق:** خريطة موقع مويسر (23 صفحة غير مدوّنة بالإنجليزية) بلا صفحة «شركاء/إحالة» لمزوّدي الأنظمة؛ وصفحة «our-partners» تعرض **البنوك** وحدها. وفي شروط المنصات: `referr|revenue share` ⟵ تطابقٌ واحد لا صلة له («Any financial dispute shall be referred»)، و`AOC|SAQ|attestation` ⟵ **صفر**. **المسبار الموجب على الملفّ نفسه:** `PCI` ⟵ 3 تطابقات، و`platform-terms-and-conditions` حاضرٌ في الخريطة.

### ③ تاب — **لا تنشر اقتسام عمولتها؛ تنشر تقسيم السوق وتعريف «الشريك»**

- **تعريف «الشريك» (T1، العربي المعتمد):** «شريك: يقصد بالكيان الذي يروج لخدمات الطرف الأول نيابة عنه ، ومثلا عليه المنصة أو المطور.» (والإنجليزي: «promoting the First Party's services on behalf of the First Party, such as a Platform or a Developer»). **لا يرد لفظ «الشريك» في الشروط إلا في التعريف** (مقيس)، فلا حقوق ولا عمولة مرتّبة عليه.
- **تقسيم السوق (T2):** «you can split the amount so that a portion goes to your Marketplace account as a fee or commission, and the remaining of the payment amount goes to the Business's account.» ويشترط قبله: «Contact Tap team to confirm if you are eligible to use Tap's Marketplace solution.»
- **ربط العملية بالمنصة (T3):** معامل `platform` في طلب العملية «identifies the platform under which the merchant is operating, linking the transaction to the appropriate platform.» — **آلية نسبةٍ لا آلية دفع**؛ لا نصّ يرتّب عليها عمولة.
- **صفحة المنصات (T6):** لا ذكر لعمولةٍ أو اقتسام؛ و«Talk to Sales».
- **بحثٌ نافٍ مُصادَق:** `https://www.tap.company/en-sa/partners` و`…/partner-program` ⟵ **يحوّلان إلى `/en-sa/404`**؛ وخريطة الموقع (63 عنواناً) بلا صفحة برنامج شركاء. **المسبار الموجب:** `…/en-sa/products/platforms` ⟵ 200 بمحتوى. وفي الشروط: `referr|revenue share|commission` ⟵ ثلاثة تطابقات كلّها غير ذات صلة (عنوان «Fees & Commissions» لرسوم التاجر، و«referred to» مرّتين)؛ والمسبار الموجب `PCI` ⟵ حاضر.

### لماذا `letter` لا `answered`

السؤال بنصّه «هل **تقتسمون العمولة** مع مزوّد النظام؟ وبأي آلية؟». أجابت عنه باي تابس **بالمبدأ** دون الأرقام، وسكتت عنه مويسر وتاب (والمنشور عندهما آليةٌ مختلفة: المنصة **تفرض** رسمها على التاجر). فالأرقام والآلية والتصنيف لا تأتي إلا بردٍّ مكتوب.

### ⚠️ ما يوجبه على القرار (يُعرض على المالك، لا يُحسم هنا)

١. **آليتان مختلفتان جذرياً:** (أ) عمولة إحالة **تدفعها البوابة من إيرادها** (باي تابس) — لا تمسّ مبلغ عملية التاجر؛ و(ب) **رسمٌ للمنصة يُقتطع من عملية التاجر** بالتقسيم أو قبل التسوية (مويسر م1 وم16.1؛ تاب `destinations`) — **جزءٌ من مبلغ العملية يصل حساباً نملكه**. والحدّ في `CLAUDE.md` («أموال التجّار لا تلمس أي حساب نملكه») يحتاج قراراً صريحاً من المالك في (ب): هل حصّة المنصة المقسومة من عملية التاجر «أموال تاجر»؟ **لا أحكم فيه** — وسُئلت البوابات عن البديل غير المقسوم.
٢. **لفظ «نيابة عنه» في تعريف تاب للشريك** يمسّ سؤال التصنيف (وكيل أم مزوّد خدمة تقنية) المطروح في السؤال ٤ من القسم نفسه، ومعه شرط عدم الممانعة (م24). أُدرج سؤالٌ عنه في خطاب تاب.
٣. **تعميم ساما 46004436** يذكر «دليل رسوم (مدى)» ضمن ما تراعيه البنوك ومقدّمو الخدمات عند التعاقد مع شركات الربط (S2، العربي: «…بما في ذلك متطلبات نظام (مدى) التشغيلية والفنية ودليل رسوم (مدى)»). **دليل الرسوم نفسه لم يُقرأ**: غير منشور للعامة (مقيسٌ في PAY-1). فإن كان يقيّد اقتسام رسوم «مدى» فلا نعرفه.

---

## R208 — أيّ وثيقة PCI DSS (AOC / SAQ) تطلبونها منّا إن كانت حقول البطاقة لا تمرّ بخوادمنا؟ · **`letter`**

### ما تنشره البوابات — وكلّه عن **التاجر** بحسب طريقة الربط

| البوابة | الصفحة المستضافة / إعادة التوجيه | الحقول على صفحة التاجر أو بياناتٌ تمرّ بخادمه | عن **المنصة** |
|---|---|---|---|
| **باي تابس** (P2 · P3) | «Hosted Payment Page Integration Type is suitable for Merchants with PCI SAQ A or merchants who DOES NOT HAVE any PCI levels.» | النموذج المُدار: «PCI certified to a minimum of SAQ A-EP»؛ النموذج الخاص: «a minimum of SAQ D-Merchant» | **لا شيء** — `platform|service provider|partner` ⟵ صفر في الصفحات الأربع؛ المسبار الموجب `SAQ` ⟵ 1 و20 |
| **تاب** (T4 · T5) | جدول المقارنة: «PCI DSS Compliance: SDK Handled» لمجموعة أدوات البطاقة وصفحة الدفع وApple Pay | «Our team will enable the feature of handling the cardholder data when you provide a valid PCI DSS certificate and PCI AOC.» | **لا شيء** في الوثائق؛ والشروط تُلزم **تاب نفسها** بالمعيار (T1، العربي: «يمتثل الطرف الأول لمعايير صناعة بطاقات الدفع وأمن البيانات») |
| **مويسر** (M4 · M5 · M1) | «merchants using Moyasar's API do not need to manage sensitive payment information or obtain PCI DSS certification themselves.» (M5) | شروط التاجر (العربي): «يجب ان لا تمر بيانات البطاقة السرية على خادم التاجر قطعاً، بل يجب ان ترسل مباشرة الى خادم مزود الخدمة.» | **إلزامٌ بلا تسمية وثيقة:** م5.3 من شروط المنصات «يلتزم كل طرف بمعايير ومتطلبات الأمان PCI-DSS» — والمنصة «الطرف الأول» |

⚠️ **ملاحظة على نصّ مويسر م5.3:** تكملته «يجب ألا تمر بيانات البطاقة السرية على خادم التاجر/المستفيد قطعا، بل يجب أن ترسل مباشرة للطرف الأول / الثالث» — أي أن القالب **يجيز** وصول بيانات البطاقة إلى **المنصة**. وتصميمنا (قيد المالك 2026-08-14) لا يسلكه؛ فالسؤال لمويسر: ما المطلوب من منصةٍ **لا** تستقبلها.

### ما يقوله المجلس (S1، نصٌّ أصليّ، **إصدار v4.0 المتقاعد**)

- **الاستبيان الوحيد لمقدّمي الخدمات (ص iii):** «This SAQ is the ONLY SAQ option for service providers.» — فـ«SAQ A» و«SAQ A-EP» استبياناتٌ **للتجار**، وما يمكن أن يُطلب منّا بوصفنا مزوّد خدمة تقييماً ذاتياً هو **SAQ D for Service Providers** مع شهادة التزامه (AOC)، أو شهادة التزامٍ من تقرير مقيّمٍ معتمد، **بحسب ما تقرّره شبكة الدفع** («applies to all service providers defined by a payment brand as being eligible to complete a self-assessment questionnaire»).
- **واجب مزوّد الخدمة نحو عملائه (12.9.2، ص 121 إلى 122):** «TPSPs support their customers' requests for information to meet Requirements 12.8.4 and 12.8.5 by providing the following upon customer request» — حالة الامتثال، وتوزيع المسؤوليات.
- **النطاق يشمل خادم إعادة التوجيه (ص 9):** «Systems that could impact the security of account data or the CDE (for example, name resolution, or e-commerce (web) redirection servers).» ⟵ وهذا يوافق ما أثبته PAY-1 من FAQ 1604 (يونيو 2026) ونصّ SAQ A عن «the merchant web server upon which the redirection mechanism is located».

**حدّ S1:** إصدار v4.0 متقاعد؛ والساري (v4.0.1) تحجبه اتفاقية ترخيص على مكتبة المجلس **لم تُقبل** (كما في PAY-1). فكل اقتباسٍ أعلاه موسومٌ بأنه من المتقاعد.

### لماذا `letter`

ما **تطلبه البوابة** منّا سياسةُ جهةٍ لا تنشرها؛ والمجلس يحدّد ما **يجوز** (SAQ D-SP أو تقرير مقيّم) لا ما **يُطلب**. والبحث النافي مُصادَق في الجدول أعلاه لكل بوابة.

### الافتراض الموسوم للتخطيط (لا للبناء، ويُستبدل بالرد)

**أن تطلب بوابةٌ أو بنكٌ محصِّل منّا شهادة التزامٍ بوصفنا مزوّد خدمة**، ومسارها الذاتي الوحيد عند المجلس **SAQ D for Service Providers** — لا SAQ A. وأثره: عبء امتثالٍ على المنصة أوسع كثيراً من «SAQ A» الذي يقع على التاجر، **ويُقدَّر قبل أول ربطٍ حيّ**. هذا افتراضٌ أحوط يُعلن ولا يُبنى عليه ادّعاء امتثال.

---

## ما لم يُقرأ

| المصدر | السبب |
|---|---|
| باي تابس: «Why does PayTabs Need PCI Certification For Using Payment Forms?» (https://support.paytabs.com/en/support/solutions/articles/60000691825-why-does-paytabs-need-pci-certification-for-using-payment-forms-) | **الجلب فشل مرّتين** (`fetch failed`، بلا رمز حالة). والمقالة الشقيقة P3 قُرئت كاملة وتغطي المضمون نفسه («Why Paytabs Requires PCI Certification?»). |
| PCI DSS v4.0.1 وSAQ الساري | اتفاقية ترخيص لم تُقبل (قيدٌ لا خلل). |
| دليل رسوم «مدى» | غير منشور للعامة (PAY-1). |
| أي عقدٍ لبرنامج شركاء أو اتفاقية منصة بتوقيع | غير منشورة؛ باي تابس تنصّ على أن الاتفاقية تُوقَّع بعد تقييم الأهلية. |

## قنوات المراسلة المنشورة (مقروءة ومفكوكة من حماية البريد في الصفحة نفسها)

| الجهة | القناة المقترحة | أين نُشرت |
|---|---|---|
| **مويسر** | نموذج «تواصل مع فريق المبيعات» (لا بريد منشوراً للمبيعات والشراكات) · بريد الدعم الفني `support@moyasar.com` · بريد الشكاوى `care@moyasar.com` | https://moyasar.com/ar/contact-sales/ · https://docs.moyasar.com/ («Contact Support») · https://moyasar.com/ar/resources/support/ |
| **تاب** | بريد فريق تجربة المطوّرين `integrations@tap.company` · نموذج «Talk to Sales» | https://developers.tap.company/docs/encrypted-card-flow-pci (صفحة PCI نفسها) · https://www.tap.company/en/company/contact |
| **باي تابس** | `customercare@paytabs.com` · نموذج «برنامج الشركاء» | https://docs.paytabs.com/manuals/ («Need Assistance? … reach out to us on») · https://ai.paytabs.com/en/partner-program/ |

⚠️ `info@moyasar.com` و`order@tap.company` يظهران في **البيانات المنظَّمة المخفية** للصفحات لا في نصّها المرئي، وبجوار الأول هاتفٌ بصيغة مثال (`+966-11-123-4567`) — فلم يُعتمدا.

---

## مراجعةٌ عدائية (2026-09-27)

**من راجع وكيف:** فاحصٌ عدائيّ مستقلّ، فتح بنفسه كلَّ رابطٍ أوّليٍّ مذكور أعلاه بجلبٍ جديد (طلب GET عامّ بلا دخول ولا نموذج ولا بريد، ولا محرّك بحث)، **في 2026-09-27** (تاريخ القراءة الفعلي؛ التكليف ذكر 2026-09-26). النسخ الخام والنصّ المستخرج في `D:\mad-app-scratch\review-266\research\gateways2-adv\` (`*.html` و`*.txt` و`*.dec.txt`، وملف المجلس `pci-saqd-sp.pdf` بنصّه). **المسبار مصادَق بحالتين:** موجبة معلومة («يلتزم كل طرف بمعايير ومتطلبات الأمان PCI-DSS» ⟵ وُجد) وسالبة معلومة («14 أبريل 2026» بالهمزة ⟵ لم يوجد، والصفحة تكتبها «14 ابريل 2026»)؛ ومسبار الشرطات مصادَق بعيّنة فيها ثلاث شرطات ⟵ 3.

### الأحكام بعد المراجعة

| البند | الحكم الأصلي | بعد المراجعة | الخلاصة |
|---|---|---|---|
| **R207** | `letter` | **يثبت `letter`** | كل اقتباسٍ بُني عليه وُجد حرفاً في مصدره. لا بوابة تنشر نسبة العمولة ولا أساسها؛ وباي تابس وحدها تنشر المبدأ. |
| **R208** | `letter` | **يثبت `letter`، وتُصحَّح خانة تاب في الجدول** | لا بوابة تسمّي وثيقةً تطلبها من المنصة. لكن عبارة «لا شيء في الوثائق» عن تاب **لا تثبت** (البند ١ أدناه). |

**لا حكم `answered` في هذا الملف**، فلا جواب يُسقَط.

### ما ثبت حرفاً (فُتح الرابط وطوبق النصّ)

| الرمز | ما طوبق | النتيجة |
|---|---|---|
| M1 (عربي) | تعريف «الرسوم» في م1 · م16.1 «بعد استقطاع الرسوم المتفق عليها» · م16.6 · م17.2 · م17.3 (يعتدّ بالنص العربي) · م5.3 بتكملتها «للطرف الأول / الثالث» · التعريفات «الطرف الأول (المنصة)» · 18 مادة · «آخر مراجعة: 14 ابريل 2026» | ثبت كله |
| M2/M3 | «تقسيم المدفوعات عند الدفع (عمولة المنصة، حصة البائع، شركاء اختياريون)» · «رسوم مرنة (لكل بائع/خطة/قطاع)» · «Flexible Fees & Revenue Sharing…» (في صفحة manage-and-automate وحدها لا في subscriptions-and-saas) · «Fees and rates are provided by our sales team.» | ثبت |
| M4 | «يجب ان لا تمر بيانات البطاقة السرية على خادم التاجر قطعاً…» | ثبت |
| M5 | «merchants using Moyasar’s API do not need to manage sensitive payment information or obtain PCI DSS certification themselves» · «Last updated on Sep 22, 2026» | ثبت (وانظر البند ٣ في سياقه) |
| مويسر (قنوات) | `support@moyasar.com` بعد فكّ حماية البريد في https://docs.moyasar.com/ · `care@moyasar.com` في بيانات صفحة الدعم · صفحة `resources/our-partners` تعرض البنوك وحدها · خريطة الموقع 23 صفحة إنجليزية غير مدوّنة بلا برنامج شركاء | ثبت |
| T1 | تعريف «شريك» بنصّه العربي (بمسافة قبل الفاصلة في الأصل: «نيابة عنه ، ومثلا») · لفظ «شريك» مرّة واحدة في العربي و`partner` مرّة واحدة في الإنجليزي · «يمتثل الطرف الأول لمعايير صناعة بطاقات الدفع وأمن البيانات» · «اللغة العربية هي المعتمدة» | ثبت |
| T2/T3 | «as a fee or commission» · «Contact Tap team to confirm if you are eligible to use Tap’s Marketplace solution» (بفاصلة عليا منحنية) · تاريخ 2025-11-13 · وصف معامل `platform` | ثبت |
| T4 | «SDK Handled» لـ Card SDK v2 وApple Pay وCheckout SDK · تاريخ 2026-03-04 · «Our team will enable the feature of handling the cardholder data when you provide a valid PCI DSS certificate and PCI AOC.» | ثبت؛ والجملة الأخيرة في **T4** (قسم «Custom Integration») لا في T5، والخطاب ينسبها إلى «Overview» فهو صحيح |
| T5 | `integrations@tap.company` مربوطاً بعبارة «developer experience team» · تاريخ 2025-09-11 · وفيها أيضاً «Upon you submit your PCI and AOC certificate, tap will issue an RSA public key» | ثبت |
| تاب (نافٍ) | `/en-sa/partners` و`/en-sa/partner-program` ⟵ تحويل إلى `/en-sa/404` · المسبار الموجب `/en-sa/products/platforms` ⟵ 200 وفيها «Payments for platforms» و«Talk to Sales» · خريطة الموقع 63 عنواناً بلا شركاء | ثبت |
| P1 | «Start referring PayTabs payment solutions … earn a commission for every qualified referral made!» · «monthly statements of account» · العربي «يُعتبر برنامج شركاء PayTabs طريقة جديدة لكسب دخل إضافي…» · «سيُطلب من الشركاء المؤهلين توقيع اتفاقية» · «قد يخضع الشركاء لفحص “اعرف عميلك” لتحديد مسار الشراكة» (بعلامتي تنصيص منحنيتين) | ثبت |
| P2/P3 | النصوص الثلاثة (SAQ A · SAQ A‑EP · SAQ D‑Merchant) · «Modified on Tue, Apr 30, 2024» · `platform` و`service provider` و`partner` صفر في الصفحات الأربع | ثبت |
| باي تابس (قناة) | `customercare@paytabs.com` في رأس https://docs.paytabs.com/manuals/ بعد فكّ الحماية (مكتوب «customercare@PayTabs.com»، والنطاق لا يفرّق بين الحروف) | ثبت |
| S1 | الملف نفسه بصمةً (sha256 يبدأ `de0c4a12ac8fb395` في النسختين) · «This SAQ is the ONLY SAQ option for service providers.» ص iii · «applies to all service providers defined by a payment brand…» · نصّ 12.9.2 | ثبت |
| S2 | «…بما في ذلك متطلبات نظام (مدى) التشغيلية والفنية ودليل رسوم (مدى).» · الحالة «نافذ» · 2024/7/24 | ثبت |

### ما لا يثبت أو يُصحَّح

1. **خانة تاب «عن المنصة» في جدول R208: «لا شيء في الوثائق» لا يثبت.** جدول المقارنة في T4 (https://developers.tap.company/docs/get-started) يقرأ في صف «PCI DSS Compliance» تحت عمود «Plugins»: **«SDK/Partner Handled»**، والصفحة نفسها تقول «Or you can use plugins built by our partners like: Shopify Native plugin Shopify Redirection plugin». فتاب **تذكر الشريك** في توزيع عبء الامتثال، ولا تسمّي وثيقةً تطلبها منه. الحكم `letter` باقٍ، والصياغة الصحيحة للخانة: «ذِكرٌ واحد بلا تسمية وثيقة: خانة الإضافات SDK/Partner Handled». **وأُضيف سؤالٌ عنه إلى خطاب تاب (السؤال ٧).**
2. **أرقام صفحات S1:** «Systems that could impact the security of account data or the CDE…» في **الصفحة المطبوعة 10** (صفحة PDF رقم 19) لا 9. ونصّ 12.9.2 يقع كله في **الصفحة 122** (صفحة PDF رقم 131)، والصفحة 121 تحمل ما قبله. لا أثر على الحكم.
3. **سياق M5:** جملة مويسر في دليل **الكوبونات** (قسما «PCI DSS and Coupons» و«How Moyasar Simplifies Compliance»)، وموضوعها التاجر الذي يستعمل واجهة مويسر البرمجية فتمرّ بيانات البطاقة «directly to Moyasar servers»، لا الصفحة المستضافة بعينها. وضعُها تحت عمود «الصفحة المستضافة» توسّعٌ في السياق؛ والخطاب يطرحها سؤالاً (السؤال ٩) فلا يضرّ.
4. **البحث النافي في شروط تاب:** التطابقات الثلاثة هي «referred to» مرّة و«referring to» مرّة وعنوان «Fees & Commissions»، لا «referred to» مرّتين. لا أثر.

### الخطابات

| الخطاب | القناة ومصدرها | الموضوع | العربية | الشرطات قبل ⟵ بعد | ما عُدّل |
|---|---|---|---|---|---|
| `letters/GATEWAYS-2-Moyasar.md` | نموذج «تواصل مع فريق المبيعات» يُبلغ من رابط «تواصل مع المبيعات» في ذيل https://moyasar.com/ar/ (مقروء في الشيفرة: `href="/ar/contact-sales/"`) · وبريد `support@moyasar.com` من https://docs.moyasar.com/ | حاضر | رسمية | 1 ⟵ 0 | السطر 4: حُذف الرابط المباشر للنموذج (فيه شرطة) وأُحيل إلى الصفحة الرئيسية، لأن صيغته المرمَّزة `contact%2Dsales` **أعادت 404** عند التجربة · السطر 6: أُعيدت صياغة التنبيه |
| `letters/GATEWAYS-2-Tap.md` | `integrations@tap.company` من https://developers.tap.company/docs/encrypted%2Dcard%2Dflow%2Dpci · ونموذج «Talk to Sales» في https://www.tap.company/en/company/contact | حاضر | رسمية | 3 ⟵ 0 | السطر 5: الشرطات بترميزها المئوي، وأعاد الرابط المرمَّز 200 بنصٍّ مطابق بصمةً (`a2d689429545bf6e`) · السطر 7: التنبيه · السؤال ٧: أُضيف سؤال «SDK/Partner Handled» |
| `letters/GATEWAYS-2-PayTabs.md` | `customercare@paytabs.com` من https://docs.paytabs.com/manuals/ · ونموذج برنامج الشركاء https://ai.paytabs.com/en/partner%2Dprogram/ | حاضر | رسمية | 1 ⟵ 0 | السطر 6: الشرطة بترميزها المئوي، وأعاد الرابط 200 بنصٍّ مطابق بصمةً (`93aa4df1f1557434`) · السطر 7: التنبيه · السؤال ٣: علامتا التنصيص كما في الأصل (“ ”) |

⚠️ **حدّ الترميز المئوي:** `%2D` مكافئٌ للشرطة في المسار بنصّ RFC 3986 (البند 6.2.2.2)، وثبت عملياً لتاب وباي تابس وسقط لمويسر. فمن يرسل الخطاب يفتح الرابط قبل الإرسال.

**لم يُرسل شيء، ولم يُملأ نموذج، ولم يُسجَّل دخول.** والمستودع لم يُمسّ.
