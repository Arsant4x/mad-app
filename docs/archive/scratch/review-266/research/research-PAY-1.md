# بحث المجموعة PAY-1 — المدفوعات السعودية ومجلس معايير PCI (R27 · R28 · R29 · R30 · R31)

> **تاريخ القراءة لكل ما في هذا الملف: 2026-09-26.** قراءةٌ للصفحات العامة وحدها: لا نموذجَ قُدِّم، ولا بريدَ أُرسل، ولا دخولَ إلى أي حساب، ولا اتفاقيةَ ترخيصٍ قُبلت (انظر «ما لم يُقرأ»).
>
> **الأحكام:**
>
> | البند | الحكم | حاجبُ إطلاق؟ | الخلاصة بسطر |
> |---|---|---|---|
> | R27 عتبة التصريح الفني | **`letter`** | نعم (لتشغيل الدفع) | النصُّ الأصليّ يوجب «كافة التصاريح الفنية» ولا يعرّفها ولا يعدّدها، ولا وثيقةَ منشورةً تفصّلها؛ والعتبة تفسيرٌ لا يملكه إلا المُصدِر |
> | R28 متطلبات التصريح | **`letter`** | نعم | لا مستندات ولا مدة ولا رسوم ولا سريان منشورة في أي مصدرٍ أصليّ قُرئ |
> | R29 PCI DSS شرطاً للتصريح | **`letter`** | نعم | التعميم ساكتٌ عن PCI (مسبارٌ مُصادَق)، واللائحة تُلزم **المرخَّص له** بمعايير أمن البيانات لا مقدّمَ الخدمة التقنية؛ وشرطُ التصريح نفسِه غير منشور |
> | R30 SAQ A أم A-EP | **`answered`** | نعم (قرارٌ لا يُعكس) | من نصوص المجلس الأصلية: إعادةُ التوجيه والـiframe المستضاف = SAQ A، وحقولٌ على صفحتنا = A-EP؛ والـiframe وحده يحمل معيارَ أهليةٍ للسكربتات |
> | R31 التزام بائع البرنامج (Secure Software) | **`letter`** | نعم (الشرط ② لربط الجهاز) | المجلس نصّاً **لا يُلزم أحداً** بالمعيار؛ الإلزامُ من الشبكات («مدى» عندنا) — فالسؤال يُوجَّه إلى المدفوعات السعودية |
>
> **الرسالة الجاهزة (واحدة، لكل البنود التي تحتاج رداً):** `D:\mad-app-scratch\review-266\research\letters\PAY-1-SaudiPayments.md` — إلى `onboarding@saudipayments.com` (لم تُرسل). **لا رسالةَ إلى مجلس PCI**: المجلس نفسه يحيل أسئلة الإلزام إلى الشبكات، وأسئلةَ الشبكات الأخرى «إلى الشبكة المعنية» (FAQ 1436 أدناه).
>
> **ملفّات القراءة المحلية** كلّها في `D:\mad-app-scratch\review-266\research\pay1\` (HTML منزوع الوسوم `*.txt`، وPDF المجلس المنشورة بلا اتفاقية).

---

## 0) المصادر الأصلية المقروءة

| # | المصدر | الرابط | ما قُرئ |
|---|---|---|---|
| S1 | **تعميم ساما 46004436** «آلية التعامل مع شركات تقديم خدمات أو دعم عمليات مدفوعات التجارة الإلكترونية» — 1446/1/18هـ = 2024/7/24م — **الحالة «نافذ»** — **النصُّ العربيّ** | https://rulebook.sama.gov.sa/ar/node/10245 (يحوّل إلى الصفحة العربية بعنوانها) | المتن كاملاً (`sama-ar.txt`) |
| S2 | الترجمة الإنجليزية للتعميم نفسِه (موسومة «Translated Document») | https://rulebook.sama.gov.sa/en/rules-dealing-e-commerce-payment-service-and-support-providers | المتن كاملاً (`sama-en.txt`) |
| S3 | **التعميم الملغى 42080528** — 1442/11/18هـ = 2021/6/27م — الحالة «ملغى» بـ46004436 — العربي والإنجليزي | https://rulebook.sama.gov.sa/en/rules-dealing-e-commerce-payment-service-and-support-providers-0 (والعربي بلاحقة `-0`) | المتن كاملاً (`sama-ar-0.txt` · `sama-en-0.txt`) |
| S4 | **تعميم ساما 45004804** «استكمال التصاريح الفنية لإطلاق خدمة تمكين العملاء الأفراد من معرفة الحسابات البنكية التابعة لهم» — 1445/1/21هـ — نافذ | https://rulebook.sama.gov.sa/ar/node/10262 | المتن كاملاً (`rb-techappr-ar.txt`) |
| S5 | **تعميم ساما 44075612** «تطبيق خدمة التحقق من الحساب عبر نظامي سريع…» — 1444/9/25هـ — نافذ | https://rulebook.sama.gov.sa/ar/node/1609 | المتن كاملاً (`node1609.txt`) |
| S6 | **إعلان المدفوعات السعودية** عن منح «نيو ليب» التصاريح الفنية — وكالة الأنباء السعودية (واس)، الرياض 27 ربيع الأول 1443هـ = 2 نوفمبر 2021م | https://www.spa.gov.sa/2300863 | المتن كاملاً (مستخرجٌ من JSON الصفحة: `spa-2300863-body.txt`) |
| S7 | **اللائحة التنفيذية لنظام المدفوعات وخدماتها** — العربي (المعتمد) والإنجليزي، في كتيّب القواعد | العربي: الصفحة التي يدلّ عليها `hreflang="ar"` في https://rulebook.sama.gov.sa/en/implementing-regulations-payments-and-payment-services-law | المادة السابعة كاملة، والمادة الخامسة والثلاثون (العربي والإنجليزي)، وعدٌّ على النصّ كلّه |
| S8 | صفحة «مدى» الحيّة لدى ساما (يحوّل إليها mada.com.sa اليوم) + خبر ساما «إطلاق الواجهة الجديدة لمدفوعات التجارة الإلكترونية» 07/07/2025 | https://www.sama.gov.sa/ar-sa/payment/Pages/mada.aspx · https://www.sama.gov.sa/ar-sa/MediaCenter/News/Pages/news-1095.aspx | كاملتين |
| S9 | موقع المدفوعات السعودية | www.saudipayments.com | **الحيّ لم يُفتح** (انظر «ما لم يُقرأ») · الأرشيف: فهرس Wayback لـ`saudipayments.com/*` (1105 عناوين) + الصفحة الرئيسية العربية بلقطة 2024-09-14 |
| S10 | موقع «مدى» القديم (مؤرشف): «Terminal certifications» (لقطة 2023-01-31) · «مدى للتجارة الإلكترونية» (2024-06-25) · «قائمة مزودي الخدمة» (2026-01-06) · «مقدم خدمة دعم التاجر لنقاط البيع» (2016-08-02) | http://web.archive.org/web/20230131162704/https://www.mada.com.sa/en/content/terminal-certifications/12 وأخواتها | كاملةً |
| S11 | **PCI SSC FAQ 1588** «How does an e-commerce merchant meet the SAQ A eligibility criteria for scripts?» — February 2025 | https://www.pcisecuritystandards.org/faqs/1588/ | كاملاً |
| S12 | **PCI SSC FAQ 1604** «Do ASV scans in SAQ A apply to merchants with webpages that redirect to TPSPs or include TPSPs' embedded iframes?» — **June 2026** | https://www.pcisecuritystandards.org/faqs/1604/ | كاملاً |
| S13 | **PCI SSC FAQ 1291** (SAQ A-EP لـDirect Post و SAQ A لـiframe/redirect) و**FAQ 1292** (الفروق التقنية) — August 2015 | https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/why-is-saq-a-ep-used-for-direct-post-while-saq-a-is-used-for-iframe-or-url-redirect/ · https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/why-is-there-a-different-approach-for-direct-post-implementations-than-for-iframe-and-url-redirect-what-are-the-technical-differences-and-how-do-they-impact-the-security-of-e-commerce-transactions/ | كاملين |
| S14 | **مدوّنة المجلس الرسمية**: «Important Updates Announced for Merchants Validating to SAQ A» (2025-01-30) · «FAQ Clarifies New SAQ A Eligibility Criteria…» (2025-02-28) | https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a · https://blog.pcisecuritystandards.org/faq-clarifies-new-saq-a-eligibility-criteria-for-e-commerce-merchants | كاملتين |
| S15 | صفحة المجلس «Assessing the Security of Your Cardholder Data» (أنواع الـSAQ ووصفها) | https://listings.pcisecuritystandards.org/pci_security/completing_self_assessment | كاملة |
| S16 | **SAQ A v4.0** و**SAQ A-EP v4.0** (April 2022 — **إصدارٌ متقاعد**) — منشوران على نطاق المجلس بلا اتفاقية | https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf · …/PCI-DSS-v4-0-SAQ-A-EP.pdf | معايير الأهلية كاملة + المتطلب 12.8 (pdftotext) |
| S17 | **Secure Software**: صفحة المعيار (حيّة) · **FAQ 1540** (Nov 2021) · **FAQ 1436** (Dec 2022) · **FAQ 1301** (المحطّات في تقييم PCI DSS) · **Secure Software Program Guide v1.0** (June 2019، منشور بلا اتفاقية) | https://www.pcisecuritystandards.org/standards/secure-software/ · https://www.pcisecuritystandards.org/faqs/1540/ · https://www.pcisecuritystandards.org/faqs/1436/ · https://www.pcisecuritystandards.org/faqs/1301/ · https://listings.pcisecuritystandards.org/documents/Secure-Software-Program-Guide-v1.pdf | كاملةً؛ والدليلُ القسمُ 5.1 |

### ما لم يُقرأ — ولماذا

| ما لم يُقرأ | السبب |
|---|---|
| **موقع المدفوعات السعودية الحيّ** www.saudipayments.com | يوم القراءة تقدّم الشهادةُ `CN=communicate.sa` (SAN: `communicate.sa` وحدها، صالحة من 2026-09-22) فيرفضها `curl` وWebFetch بـ«الاسم لا يطابق». **لم يُتجاوز التحقّق للقراءة.** قُرئ الأرشيف بدلاً منه، وهو **بلا أي صفحة عن التصاريح** (مسبار ② أدناه) |
| **SAQ A v4.0.1 r1** (الساري منذ 31 مارس 2025) و**SAQ A-EP v4.0.1** و**دليل برنامج Secure Software الحالي** | مكتبةُ المجلس تشترط الضغطَ على **«ACCEPT»** لاتفاقية ترخيص («By clicking on the "ACCEPT" button below, you are agreeing that you will be bound…») — **قبولُ شروطٍ لا يجوز لي بلا إذن**، فلم يُقبل. ⟵ **تصحيح**: بحثُ 2026-08-14 قال «الروابط تردّ 404/403»؛ **الردّ صفحةُ اتفاقية لا رابطٌ مكسور**. والتعويضُ: نصُّ معيار السكربتات الجديد مقتبسٌ حرفاً في FAQ 1588 والمدوّنة (S11 · S14)، وما حُذف مسمّى في المدوّنة (6.4.3 · 11.6.1 · 12.3.1) |
| الصفحة الحيّة لنماذج تراخيص المدفوعات لدى ساما (`ApplyLicense/Pages/Payment_Forms.aspx`) | ردّت صفحةَ خطأ («حدث خطأ ما في طلبك…») |
| قواعد نظام «مدى» التشغيلية والفنية ودليل رسومه | غير منشورة للعامة في أي موضعٍ وُجد؛ وأرشيف mada.com.sa بلا صفحةٍ لها (مسبار ③) |

---

## R27 — عتبة التصريح الفني من المدفوعات السعودية · **`letter`** (حاجبُ تشغيل الدفع)

**ما يقوله النصُّ الأصليّ (S1، المتن، الفقرة الثانية — عربيّ معتمد):**

> «ويتعين على الشركات المزاولة لهذه الخدمات الحصول على كافة التصاريح الفنية اللازمة من المدفوعات السعودية، وأن تقتصر خدماتها على الربط والدعم التقني فقط…»

و«هذه الخدمات» هي في الجملة نفسها: «خدمات الربط والدعم التقني لعمليات مدفوعات التجارة الإلكترونية». **ولا يعرّفها التعميم ولا يعدّد التصاريح.** والبندُ الثاني من التأكيدات يجعل التحقّق منها على البنوك ومقدّمي الخدمات حين يتعاقدون مع هذه الشركات: «…وذلك بعد التحقق من حصولها على كافة التصاريح الفنية اللازمة، ومراعاة قواعد الإسناد لطرف ثالث… بما في ذلك متطلبات نظام (مدى) التشغيلية والفنية ودليل رسوم (مدى)».

**وثلاث قرائن أصلية جديدة على ماهية «التصريح الفني» — قرائن لا جواب:**

1. **الاسم**: التعميم الملغى (S3، البند «ثانياً») سمّى الفئة صراحةً: «تُعد خدمات الربط والدعم التقني لعمليات مدفوعات التجارة الإلكترونية **Payment Technical Service Provider** من الخدمات المساندة…». فالمصطلح الرسمي الذي يُسأل به هو **PTSP**.
2. **المُصدِر ومحلّ التصريح**: إعلانُ المدفوعات السعودية نفسِها (S6): حصول الشركة «على التصاريح الفنية اللازمة لتوفير قبول مدفوعات التجارة الإلكترونية مباشرة عبر الارتباط بنظام "مدى"»، و«بموجب التصريح الفني، الذي تم عبر مركز تصاريح "المدفوعات السعودية"». ⟵ المثال الوحيد المنشور رسمياً **بوابةُ دفعٍ ترتبط بـ«مدى» مباشرة** — لا نظامٌ يحيل إلى بوابة.
3. **القناة**: تعميمان نافذان (S4 · S5) يجعلان «استكمال التصاريح الفنية» مع المدفوعات السعودية «عبر البريد الإلكتروني (onboarding@saudipayments.com)» — في سياق خدمات «سريع» للبنوك، لكنه **القناة الوحيدة المنشورة** للتصاريح الفنية مع الشركة.

**وقرينة تاريخية (أرشيف رسمي، 2016 — ضعيفة لقِدمها):** صفحة «مدى» (S10): «يعتبر قسم التصاريح في الإدارة العامة لنظم المدفوعات في مؤسسة النقد هو الجهة الوحيدة المخولة بإعطاء مثل هذه التصاريح وشهادات الاعتماد…» (النصّ مقطوعٌ في الأرشيف). والمدفوعات السعودية تقول عن نفسها (S9، أرشيف 2024-09-14): «في 2019م تم دمج الإدارة العامة لنظم المدفوعات ونظام سداد للمدفوعات تحت مسمى المدفوعات السعودية». ⟵ «التصاريح الفنية» وظيفةٌ انتقلت من الإدارة العامة لنظم المدفوعات في ساما إلى الشركة.

**ما لم يُجب — ولماذا رسالة:** هل **إحالةُ** المشتري إلى صفحة مستضافة، أو iframe، أو استدعاءُ API البوابة، أو اتفاقيةُ شراكةٍ مع البوابة — تُدخلنا في «الشركات المزاولة لهذه الخدمات»؟ **تفسيرٌ لنطاق التعميم لا يملكه إلا المُصدِر.** والقرينة ② تميل إلى أن التصريح لمن يرتبط بـ«مدى» — **ولا يُبنى عليها حكم**. ⟵ الرسالة، الأسئلة 1 و2 و3 و10.

**بحثُ النفي («لا وثيقة منشورة تعدّد التصاريح أو تعرّف العتبة») ومسابيره المُصادَقة:**

| # | المسبار | النتيجة | الضابط على الموضع نفسه |
|---|---|---|---|
| ① | عدٌّ على متن S1 العربي: `PCI` · `أمن البيانات` · `معايير` · `بطاقات` | **0 · 0 · 0 · 0** | `مدى` = **2** · `التصاريح الفنية` = **2** |
| ② | فهرس Wayback لـ`saudipayments.com/*` (1105 عناوين): `ptsp` · `certif` · `permit` · `تصريح` (مرمَّزة) | **0 · 0 · 0 · 0** | `whistleblowing` = **3** · `privacy-notice` = **2** |
| ③ | فهرس Wayback لـ`mada.com.sa/*` (1470 عنواناً): `ptsp` · `permit` · `تصريح` | **0 · 0 · 0** — و`certif` = **1** (`terminal-certifications/12`، قُرئ: عن **بائعي أجهزة** نقاط البيع، انظر R31) | `mada-e-commerce` = **5** · `service-provider-list` = **6** |
| ④ | اللائحة التنفيذية العربية كاملة (S7): `المدفوعات السعودية` · `التصاريح الفنية` | **0 · 0** — فالشرطُ يعيش في التعميم وحده | `مقدمو الخدمات الفنية` = **1** (م٧/٩) · `معايير أمن البيانات` = **1** (م٣٥) |
| ⑤ | WebSearch: `site:rulebook.sama.gov.sa "Saudi Payments" technical permits OR PTSP OR "technical service provider"` | لا وثيقة تعدّد التصاريح | أعاد التعميم المعروف 42080528 (ومنه عُرف 45004804 و44075612) |

⚠️ **لم تُستعمل خانةُ البحث في كتيّب القواعد** (نموذج GET) التزاماً بـ«لا نموذجَ يُقدَّم»؛ والبحثُ عبر محرّكٍ خارجيّ بقيد النطاق (⑤) بديلُها.

**ما لا يُغيّر الحكم (سياق):** إعلان ساما 07/07/2025 (S8) عن «الواجهة الجديدة لمدفوعات التجارة الإلكترونية» بـ«مواصفات موحدة وميسرة للربط والتكامل مع نظام المدفوعات الوطني "مدى"» — **لا يذكر التصاريح ولا الفئة**؛ يُسأل عنه إن ذكرته المدفوعات السعودية في ردّها.

---

## R28 — متطلبات التصريح الفني · **`letter`** (حاجبُ تشغيل الدفع)

**ما يقوله النصّ الأصليّ:** لا شيء. المتطلبات والمستندات والمدة والرسوم والسريان واشتراطُ النشاط والمقرّ **غير مذكورة** في S1 ولا S3 ولا S4 ولا S5 ولا S6، ولا في اللائحة (مسبار ④)، ولا في أرشيف موقعَي المدفوعات السعودية و«مدى» (②③). وموقعُ الشركة الحيّ لم يُفتح (الشهادة). ⟵ **الرسالة، الأسئلة 4 و5 و6.**

**ما لا يصحّ ملؤه من مصادر ثانوية:** بيانات البوابات الصحفية (Paymob 2023-05 · noon payments 2026-06 · PayerMax · URWAY «eMSP - PTSP #PTSP001») تقول إن الشهادة «PTSP» تصدر عن المدفوعات السعودية وإن noon ذكرت «e-commerce Merchant Service Provider (eMSP) Framework» — **ثانويةٌ تدلّ على وجود إطارٍ اسمه eMSP ولا تنقل نصّه**. لم يُعثر على الإطار نفسه منشوراً. ⚠️ وبيانُ noon ينسب الشهادة إلى «SAMA» بينما S6 وبيانُ Paymob ينسبانها إلى المدفوعات السعودية — **تناقضٌ ثانويّ لا يُحسم إلا بالردّ**.

---

## R29 — PCI DSS شرطاً للتصريح الفني · **`letter`** (حاجبُ تشغيل الدفع)

**ما يقوله النصّ الأصليّ:**

1. **التعميم ساكتٌ عن PCI** — مسبارٌ مُصادَق (① في R27): صفرٌ على العربي، وصفرٌ على الإنجليزي (`PCI` 0 · `Data Security` 0 · `standard` 0؛ والضابط `MADA` 2 · `technical permits` 1).
2. **اللائحة تُلزم المرخَّص له لا مقدّمَ الخدمة التقنية** — المادة الخامسة والثلاثون (S7، عربي معتمد): «ويجب على المرخص له الالتزام بالمعايير الفنية المعتمدة لنظام المدفوعات الذي يكون عضوًا فيه أو التي تنطبق عليه، وأي معايير فنية أخرى ذات صلة بتنفيذ عمليات المدفوعات، بما في ذلك مجال بطاقات المدفوعات ومعايير أمن البيانات وما يجري عليها من تعديلات.» — **ولا يرد فيها اسم «PCI» في العربي** (عدّ `PCI` على النصّ العربي كلّه = **0**؛ الضابط `معايير أمن البيانات` = 1). الاسمُ في الترجمة وحدها: «(including the Payment Card Industry – Data Security Standards as may be applicable and amended)».
3. **والتعميم يُحيل التعاقد إلى «متطلبات نظام (مدى) التشغيلية والفنية»** — وهي غير منشورة. فإن كان PCI DSS شرطاً فمحلُّه تلك المتطلبات أو التصريح نفسه، **ولا يُرى من الخارج**.

**وموقف المجلس نفسه** (S17، FAQ 1436، ديسمبر 2022): أسئلة الإلزام تُوجَّه إلى الشبكات، و«Questions regarding compliance and reporting requirements for payment card account data affiliated with other payment networks should be referred to the applicable payment network.» ⟵ **لـ«مدى» فالجهة هي المدفوعات السعودية.** ⟵ **الرسالة، السؤال 7.**

⚠️ **تصحيحٌ لما في المستودع:** `docs/licensing-and-operations.md:206` يقول «`PCI DSS` مذكورةٌ بوصفها التزامَ المرخَّص «بحسب انطباقها»». **المضمون صحيح** (الالتزام على المرخَّص له)، لكن **الاسمَ «PCI DSS» وعبارةَ «بحسب انطباقها» من الترجمة الإنجليزية**؛ العربيُّ المعتمد يقول «معايير أمن البيانات» في «مجال بطاقات المدفوعات» بلا تسمية.

---

## R30 — موقع حقول البطاقة: SAQ A أم SAQ A-EP · **`answered`** (من نصوص المجلس الأصلية)

**① الفيصل بين النوعين — نصُّ معايير الأهلية** (S13، FAQ 1291 يقتبسها من الاستبيانين):

> SAQ A: «All elements of the payment page(s) delivered to the consumer's browser originate only and directly from a PCI DSS validated third-party service provider(s)»
> SAQ A-EP: «Each element of the payment page(s) delivered to the consumer's browser originates from either the merchant's website or a PCI DSS compliant service provider(s)»

وFAQ 1292 يحسم الحالة الحدّية: «If any element of a payment page originates from the merchant's website, the implementation is not eligible for SAQ A.» وسببُه: «fully-hosted payment pages and payment pages loaded into an iFrame are resistant to the transparent theft of cardholder data as it is entered by the consumer; techniques such as Direct Post and JavaScript forms are not.» ⟵ **حقولٌ على صفحتنا (Direct Post أو نموذج JavaScript) = A-EP ولو مع توكنة.** وSAQ A v4.0 (S16، إصدارٌ متقاعد) بالصياغة نفسها في معاييره: «All elements of the payment page(s)/form(s) delivered to the customer's browser originate only and directly from a PCI DSS compliant TPSP/payment processor.»

**② الجديد منذ 31 مارس 2025 — معيار السكربتات، ويخصّ الـiframe وحده** (S14، 2025-01-30): حُذفت المتطلبات 6.4.3 و11.6.1 و12.3.1 من SAQ A، وأُضيف معيار أهلية بأن التاجر «confirm their site is not susceptible to attacks from scripts that could affect the merchant's e-commerce system(s)». ونطاقُه (S11، FAQ 1588):

> «The above SAQ A eligibility criteria only applies to e-commerce merchants with a webpage that includes a TPSP's/payment processor's embedded payment page/form (for example, one or more inline frame(s) (iframes)).»

ولا ينطبق على إعادة التوجيه («HTTP 30x redirect, a meta redirect tag, or a JavaScript redirect»). ويُستوفى بطريقين: تقنياتٌ كالتي في 6.4.3 و11.6.1 **يطبّقها التاجر أو طرفٌ ثالث**، **أو** «Obtaining confirmation from the merchant's PCI DSS compliant TPSP/payment processor providing the embedded payment page/form(s) that… the TPSP's/payment processor's solution includes techniques that protect the merchant's payment page from script attacks.»

**③ ما يبقى على صفحة التاجر في SAQ A حتى مع إعادة التوجيه:**
- **فحوص ASV الخارجية** (S12، FAQ 1604، **يونيو 2026**): «Yes. SAQ A for PCI DSS v4.x includes requirements for external vulnerability scanning by a PCI SSC Approved Scanning Vendor (ASV) for merchant e-commerce webpages, even where payment processing is fully outsourced to a third party.» — ويشمل صراحةً الصفحات التي تُعيد التوجيه والتي تضمّن iframe.
- **حماية الخادم الذي يقع عليه آلية التوجيه** (S16، SAQ A v4.0 — متقاعد، ولم يُقرأ ما يقابله في v4.0.1 r1): «PCI DSS Requirements that address the protection of computer systems (for example, Requirements 2, 6, and 8) apply to e-commerce merchants that redirect customers from their website to a third party for payment processing, and specifically to the merchant web server upon which the redirection mechanism is located.»
- **قائمة مزوّدي الخدمة** (S16، 12.8.1): قائمةٌ بكل TPSP «with which account data is shared or that could affect the security of account data».

**④ وإن استضفنا نحن صفحة التاجر** (متجرُه على منصّتنا): معيار A-EP ينصّ (S16): «If the merchant website is hosted by a TPSP, the TPSP is compliant with all applicable PCI DSS requirements (including PCI DSS Appendix A if the TPSP is a multi-tenant hosting provider)»؛ وفي SAQ A نحن «TPSP… that could affect the security of account data» في قائمة 12.8.1، وخادمُنا هو «the merchant web server upon which the redirection mechanism is located». ⟵ **يُثبت ما في `CLAUDE.md §8 💳`**: نظهر في قائمة مزوّدي خدمة عملائنا ولو لم نلمس رقم بطاقة.

**⑤ من يقرّر الاستبيان في النهاية** (S11 · S14): ليس المجلس — «Merchants should continue to consult with their compliance-accepting entity… (typically, an acquirer (merchant bank) or the payment brands)»؛ و«PCI SSC does not define compliance requirements for any organization or set compliance validation responsibilities.» ⟵ في المملكة: البنك المحصِّل أو البوابة المرخَّصة عن التاجر.

**الافتراض الموسوم (قرار تصميمٍ لا ذوق تاجر، ويُعلَن):** **إعادةُ توجيهٍ كاملة إلى صفحة البوابة المستضافة افتراضاً** — لأنها SAQ A **بلا معيار السكربتات**. والـiframe المستضاف **مسموحٌ فقط** إن قدّمت البوابة **تأكيداً مكتوباً** بحسب الخيار الثاني في FAQ 1588، أو طبّقنا نحن تقنيات 6.4.3/11.6.1 على صفحات المتاجر. **وحقولُ البطاقة على صفحتنا ممنوعة** (قيد المالك 2026-08-14 قائمٌ ومسنودٌ بالنصّ).

**🔴 ما يوجبه على البناء/التشغيل — جديدٌ مقروء:** بما أن صفحات المتاجر التي تُعيد التوجيه **على خوادمنا**، فمتطلباتُ SAQ A الواقعة على «صفحة التاجر» (فحوص ASV ربع السنوية بحسب 11.3.2 — FAQ 1604 · والمتطلبات 2 و6 و8 على الخادم الحامل لآلية التوجيه) **تقع عملياً على منصّتنا** — ويُتوقَّع أن يطلب التاجر أو بنكه **شهادةَ التزامنا (AOC)** بوصفنا TPSP. ⚠️ **حدّ**: نصُّ v4.0.1 r1 لهذه الملاحظة لم يُقرأ (الاتفاقية)؛ وFAQ 1604 (يونيو 2026) يؤكّد ASV على v4.x صراحةً.

---

## R31 — التزام بائع البرنامج تحت معيار البرمجيات الآمنة (ربط جهاز الدفع) · **`letter`** (الشرط ② لرفع التعليق)

**ما يقوله المجلس — مُجاب من نصّه:**

1. **المجلس لا يُلزم أحداً باستعمال برمجيات معتمدة** (S17، FAQ 1540، نوفمبر 2021): «Whether an entity is required to use software validated to the Secure Software Standard is determined by individual payment brand mandates, and not by PCI SSC.» — ومثلُها في صفحة المعيار الحيّة: «Compliance programs for all PCI SSC standards are managed by the payment brands.»
2. **ونطاقُ الأهلية** (S17، دليل البرنامج **v1.0، يونيو 2019** — الإصدار الحالي خلف الاتفاقية فلم يُقرأ): المؤهَّل «Software products involved in or directly supporting or facilitating payment transactions that store, process, or transmit clear-text account data»، وغيرُ المؤهَّل منه «Payment Software intended for use on hardware terminals (e.g., PTS POI devices).» ⟵ برنامجُ نقطة بيعٍ **لا يستقبل بيانات البطاقة** (يرسل المبلغ ويتلقّى النتيجة) **خارج نطاق الأهلية بحسب v1.0** — فلا «التزامَ تحقّقٍ» عليه من المجلس. ⚠️ **وحدّه معلَن**: معاييرُ الأهلية الحالية لم تُقرأ، و«Eligibility requirements will change as new modules are added».
3. **لكن التاجر يبقى مسؤولاً عن نقطة الاتصال** (S17، FAQ 1301): «The boundaries of the cardholder data environment are not affected by the presence or absence of a PTS-approved terminal, and any payment terminal interactions with the merchant's environment are in scope for a merchant's PCI DSS implementation.» — ويطلب المقيِّمُ التقاطَ حركة المرور «from the payment terminal to any attached systems (for example, cash registers or point-of-sale systems)». ⟵ **يؤكّد اقتباس `docs/licensing-and-operations.md:28`** (والمصدرُ هو FAQ 1301 بالرقم).

**وما في المنظومة السعودية (أرشيف رسمي — قرينة):** صفحة «مدى» «Terminal certifications» (S10، لقطة 2023-01-31): «The procedure for the Security Certification of POS terminals sets out the conditions that vendors of POS terminals must fulfil in order to qualify for an approval certificate issued by the General Department of Payment Systems (GDPS) and SAMA.» و«All certifications are handled based on the rules set by EMVCo…»، والتواصل `certification@sama.gov.sa`. ⟵ **اعتمادٌ لبائعي الأجهزة**، ولا يذكر برامجَ الكاشير المتصلة بها.

**ما لم يُجب — ولماذا رسالة:** هل تشترط **«مدى»** (الشبكة المعنية بحسب FAQ 1436) في برنامجٍ يتصل بجهازها بهذه الصورة **اعتماداً أو تصريحاً** — Secure Software أو اعتمادَ ربطٍ بالجهاز أو غيرَه؟ **غير منشور** (مسبار ③: لا صفحة غير «Terminal certifications»). ⟵ **الرسالة، السؤالان 8 و9.**

⚠️ **ويبقى خارج الرسالة (ليس جهةً نظامية):** إلزاماتُ Visa وMastercard تصل عبر **البنك المحصِّل/مزوّد الجهاز** تعاقدياً — يُسأل عنها المزوّدُ حين يُختار (سؤالٌ تجاريّ، لا رسالةٌ لجهة).

---

## تصحيحاتٌ وإضافاتٌ لما في المستودع

| # | ما في المستودع | ما وُجد في النصّ الأصليّ اليوم |
|---|---|---|
| ① | `docs/بحث-خدمات-الدفع.md §8`: «صفحات rulebook العربية أعادت 403/404 — معظم الاقتباسات من الترجمة الإنجليزية» | **النصُّ العربيّ لتعميم 46004436 قُرئ كاملاً** من كتيّب القواعد (S1)، ويطابق ما بُني عليه. ويضيف في المحظور على مقدّم الخدمة «**ومكافحة الاحتيال المالي**» مع «اعرف عميلك» وغسل الأموال |
| ② | الفئة بلا اسمٍ رسمي في الملف | التعميم الملغى 42080528 سمّاها **«Payment Technical Service Provider»** (S3) — المصطلح الذي يُسأل به |
| ③ | «لا وثيقة عامة تفصّل التصاريح» | **صحيحٌ ومُثبَتٌ بمسابير مُصادَقة** (①–⑤)؛ وأُضيفت قرينتان رسميتان: إعلانُ واس 2021 (التصريح لبوابةٍ «مباشرة عبر الارتباط بنظام مدى» عبر «مركز تصاريح المدفوعات السعودية») · وقناةُ `onboarding@saudipayments.com` في تعميمين نافذين |
| ④ | `licensing-and-operations.md:206` «PCI DSS مذكورةٌ… «بحسب انطباقها»» | الاسم والعبارة **من الترجمة**؛ العربيُّ المعتمد (م٣٥) «معايير أمن البيانات» بلا تسمية — المضمونُ (على المرخَّص له) صحيح |
| ⑤ | `بحث-خدمات-الدفع.md §8`: «وثيقة SAQ A بإصدار v4.0.1: الروابط تردّ 404/403» | الردُّ **صفحةُ اتفاقية ترخيص** («ACCEPT») لا رابطٌ مكسور؛ لم تُقبل. ومعيار السكربتات الجديد مقروءٌ حرفاً من FAQ 1588 |
| ⑥ | `CLAUDE.md §8 💳`: iframe = SAQ A «+ معيار أهلية إضافي للسكربتات» | **مُثبَت** (FAQ 1588)، ويُضاف: **لا ينطبق على إعادة التوجيه** — فهي الأخفّ؛ و**فحوصُ ASV تنطبق على الاثنين** (FAQ 1604، يونيو 2026) |
| ⑦ | `licensing-and-operations.md:28` «مقروءٌ من FAQ المجلس» بلا رقم | الرقم **FAQ 1301**، والاقتباس مطابق |
| ⑧ | — | موقع المدفوعات السعودية الحيّ **معطَّل الشهادة** يوم القراءة (`CN=communicate.sa`)، و`mada.com.sa` **يحوّل اليوم** إلى صفحة «مدى» في `sama.gov.sa` |

---

## حدُّ هذا البحث — معلَن

- **لم يُقرأ الموقع الحيّ للمدفوعات السعودية** (الشهادة)، فكلُّ نفيٍ عنه نفيٌ **على أرشيفه** — مُصادَقٌ بضوابط، لكنه أرشيف.
- **لم تُقرأ الإصدارات السارية** من SAQ A/A-EP v4.0.1 ودليل Secure Software (اتفاقية ترخيص لم تُقبل)؛ والاعتمادُ على FAQ والمدوّنة الرسميين والإصدارات المتقاعدة المنشورة بلا اتفاقية، **وكلُّ اقتباسٍ من متقاعدٍ موسومٌ بذلك**.
- **لم تُقرأ كلُّ تعاميم ساما**؛ فُحصت **عناوين** قائمة تعاميم «نظم المدفوعات ومقدمو خدمات المدفوعات» (https://rulebook.sama.gov.sa/en/payment-systems-and-payment-services-providers-circulars — 90 صفّاً، بلا ترقيم صفحات؛ `rb-circ.txt`) بكلمات `commerce|mada|technical|PCI|card|security|gateway|merchant|outsourc` — لا عنوانَ آخر في التصاريح الفنية للتجارة الإلكترونية غير 46004436 وسابقه 42080528 (والضابط: وُجدا في القائمة نفسها). و«The Unified Pricing Model for Point-of-Sale and E-Commerce Services» (1443/11/14هـ) عنوانُه تسعيرٌ لا تصاريح، **ولم يُقرأ متنه**.
- **R30 مُجابٌ على مستوى المجلس**؛ لكن **من يقبل الاستبيان** هو البنك المحصِّل عن التاجر (FAQ 1588) — فلا يُدّعى «SAQ A» لتاجرٍ بعينه قبل تأكيد بنكه/بوابته.

---

## مراجعةٌ عدائية (2026-09-27)

> **الطريقة:** فُتح كلُّ رابطٍ مذكور من جديد بيدي (`curl`، لا نسخة الباحث)، ونُزعت الوسوم، وبُحث عن كل اقتباسٍ **حرفاً** بعد توحيد المسافات وعلامات الاقتباس المعقوفة، ومعه **عبارةٌ ضابطةٌ سالبة** يجب ألّا تُوجد (فلم تُوجد). ملفات PDF بـ`pdftotext`. النسخ المحلية والسكربتات في `D:\mad-app-scratch\review-266\research\pay1-adv\` (`check.mjs` · `checks1..5.json`). لا نموذجَ قُدِّم ولا بريدَ أُرسل ولا اتفاقيةَ قُبلت ولا تحقّقَ شهادةٍ تُجووز.

### الخلاصة: **الأحكام الخمسة تصمد**. لا حكمَ ينقلب. وأربعُ ملاحظاتِ دقّةٍ لا تغيّر الحكم.

| البند | الحكم | بعد المراجعة |
|---|---|---|
| R27 | `letter` | **يصمد** |
| R28 | `letter` | **يصمد** |
| R29 | `letter` | **يصمد** |
| R30 | `answered` | **يصمد** بحدٍّ معلَن (الملاحظة ① أدناه) |
| R31 | `letter` | **يصمد**؛ والاستدلال بنطاق الأهلية استنتاجٌ من «أمثلة» لا نصّ (الملاحظة ⑤) |

### R30 — كل اقتباسٍ فُتح ووُجد

| المصدر | الرابط (قُرئ 2026-09-27) | ما وُجد حرفاً |
|---|---|---|
| FAQ 1291 (August 2015) | https://www.pcisecuritystandards.org/faqs/1291/ | معيارا الأهلية لـSAQ A وA-EP كلاهما |
| FAQ 1292 (August 2015) | https://www.pcisecuritystandards.org/faqs/1292/ | «If any element of a payment page originates from the merchant's website, the implementation is not eligible for SAQ A.» وجملة «fully-hosted payment pages…» |
| FAQ 1588 (February 2025) | https://www.pcisecuritystandards.org/faqs/1588/ | جملة النطاق (iframes) · قائمة إعادة التوجيه الثلاث · خيار «Obtaining confirmation…» · «Merchants should continue to consult with their compliance-accepting entity…» |
| FAQ 1604 (June 2026) | https://www.pcisecuritystandards.org/faqs/1604/ | «Yes. SAQ A for PCI DSS v4.x includes requirements for external vulnerability scanning…» والقائمة الصريحة «Redirect transactions to a TPSP» و«Include a TPSP's embedded iframe» |
| مدوّنة المجلس (Posted 30 Jan, 2025) | https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a | حذف 6.4.3 و11.6.1 و12.3.1 · معيار السكربتات الجديد · «PCI SSC does not define compliance requirements…» |
| مدوّنة المجلس (Posted 28 Feb, 2025) | https://blog.pcisecuritystandards.org/faq-clarifies-new-saq-a-eligibility-criteria-for-e-commerce-merchants | التاريخ والعنوان |
| SAQ A v4.0 (April 2022، متقاعد) | https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf | معيار الأهلية · ملاحظة المتطلبات 2 و6 و8 على خادم آلية التوجيه · 12.8.1 (نصّه موزّعٌ على عمودَي جدول، قُرئ من التخطيط) |
| SAQ A-EP v4.0 (April 2022، متقاعد) | https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A-EP.pdf | «If the merchant website is hosted by a TPSP… multi-tenant hosting provider)» |

### R27 · R28 · R29 · R31 — المصادر الأصلية فُتحت ووُجد ما نُسب إليها

- **S1** (https://rulebook.sama.gov.sa/ar/node/10245): «ويتعين على الشركات المزاولة لهذه الخدمات الحصول على كافة التصاريح الفنية اللازمة من المدفوعات السعودية» موجود حرفاً، والحالة «نافذ»، والتاريخ 1446/1/18، و«ومكافحة الاحتيال المالي» موجودة. **المسبار ① أُعيد**: `PCI` 0 · `أمن البيانات` 0 · `معايير` 0 · `بطاقات` 0، والضابط `التصاريح الفنية` 2. و`مدى` على الصفحة كاملةً 4 (اثنان منها في قائمة التنقّل «سداد مدى سريع»)، واثنان في المتن كما قال الباحث.
- **S3 العربي** (بلاحقة `-0`): «Payment Technical Service Provider» موجود داخل النصّ العربي نفسه، والحالة «ملغى»، والتاريخ 1442/11/18.
- **S4** (node/10262) و**S5** (node/1609): العنوان `onboarding@saudipayments.com` وعبارة «بالتنسيق مع المدفوعات السعودية عبر البريد الإلكتروني» موجودان في كلٍّ منهما، والتاريخان 1445/1/21 و1444/9/25، والحالة «نافذ».
- **S6** (https://www.spa.gov.sa/2300863): العبارتان موجودتان في المتن المضمَّن في JSON الصفحة (`__NEXT_DATA__`)، والتاريخ «27 ربيع الأول 1443 هـ الموافق 02 نوفمبر 2021 م».
- **S7**: جملة المادة الخامسة والثلاثين العربية موجودة حرفاً؛ و`PCI` على النصّ العربي كلّه 0 والضابط `معايير أمن البيانات` موجود؛ والإنجليزي يحمل «(including the Payment Card Industry – Data Security Standards as may be applicable and amended)».
- **S8**: خبر 07/07/2025 بلا ذكرٍ لـ«التصاريح» أو «تصريح» (0)، والعبارة «مواصفات موحدة وميسرة للربط والتكامل مع نظام المدفوعات الوطني» موجودة؛ وصفحة «مدى» بلا أي عنوان بريد.
- **S17**: FAQ 1540 (November 2021) · FAQ 1436 (December 2022؛ الصفحة تعرض «network .» بمسافةٍ قبل النقطة بسبب رابطٍ داخلها، والنصّ نفسه) · FAQ 1301 · جملة صفحة المعيار «Compliance programs for all PCI SSC standards are managed by the payment brands.» · دليل البرنامج v1.0 (June 2019) القسم 5.1 — كلّها موجودة.
- **موقع المدفوعات السعودية** اليوم 2026-09-27 ما زال يقدّم `CN=communicate.sa` (صالحة 2026-09-22 إلى 2026-12-21): `curl` ⟵ `SEC_E_WRONG_PRINCIPAL`، والنطاق بلا `www` ⟵ `SEC_E_CERT_EXPIRED`. لم يُتجاوز التحقّق.
- **مسبار ② (أرشيف المدفوعات السعودية)**: إعادةُ جلب فهرس Wayback ردّت **503** اليوم؛ فأُعيدت العدود على فهرس الباحث المحفوظ (1105 أسطر): `ptsp` · `certif` · `permit` · `تصريح` = 0، والضابطان `whistleblowing` 3 و`privacy-notice` 2 — مطابقة. ⚠️ **لكن الأرشيف رقيق**: `merchant` · `gateway` · `e-commerce` · `onboarding` = 0 كلّها، فالنفيُ عليه ضعيفٌ بطبيعته (وقد وُسم أرشيفاً، فلا انقلاب).

### ملاحظاتُ دقّة (لا تقلب حكماً)

1. **R30، حدُّ «حقولٌ على صفحتنا = A-EP»**: يقوم على FAQ 1291 و1292 (2015، منشوران حيّين اليوم) وعلى SAQ A v4.0 المتقاعد. ولا يكرّر أيٌّ من FAQ 1588 وFAQ 1604 والمدوّنتين معيارَ المنشأ (`originate only and directly` = 0 في الأربعة؛ الضابط: العبارة نفسها موجودة في FAQ 1291). ونصُّ SAQ A v4.0.1 r1 الساري لم يُقرأ (اتفاقية). **الحكم يصمد على مستوى بيانات المجلس الحيّة، والحدُّ معلَنٌ هنا.**
2. **«فحوص ASV ربع السنوية بحسب 11.3.2 (FAQ 1604)»**: FAQ 1604 يسمّي 11.3.2 و11.3.2.1 **ولا يذكر الدورية** (البحث عن `three months|quarterl` = 0). الدوريةُ «At least once every three months» في نصّ 11.3.2 من SAQ A v4.0 (متقاعد). **تصحيحُ إسناد**، والمضمون صحيح.
3. **الإسنادُ المزدوج (S11 · S14) في ⑤ من R30**: «Merchants should continue to consult…» في FAQ 1588، و«PCI SSC does not define…» في مدوّنة 2025-01-30 وحدها (غائبة عن مدوّنة 2025-02-28). الإسناد بالزوج صحيح.
4. **وصفُ S15** («أنواع الـSAQ ووصفها») غير دقيق: الصفحة الحيّة اليوم لا تعدّد أنواع الاستبيان (`SAQ A` = 0، و`(SAQ)` مرةً واحدة)، وتقول «contact your acquiring bank or payment card brand for assistance». لم يُقتبس منها شيءٌ في الأحكام، فلا أثر.
5. **R31، استدلالُ «خارج نطاق الأهلية بحسب v1.0»**: استثناء «Payment Software intended for use on hardware terminals (e.g., PTS POI devices)» يخصّ برنامجاً **يعمل على الجهاز نفسه** لا برنامجَ كاشيرٍ يتصل به؛ والجدولُ معنونٌ «Examples of Payment Software» فهو أمثلةٌ لا تعريفٌ جامع. فالحكمُ بخروج برنامجنا من النطاق **استنتاجٌ** من مثال «clear-text account data» لا نصّ. الحكم `letter` يصمد، والسؤالان 8 و9 في الرسالة هما الطريق الصحيح.

### الرسالة `letters\PAY-1-SaudiPayments.md`

| الشرط | الحال |
|---|---|
| عنوانٌ رسميّ بمصدرٍ ورابط | ✅ `onboarding@saudipayments.com`، ومصدراه node/10262 وnode/1609 **فُتحا ووُجد فيهما العنوان** |
| الموضوع | ✅ موجود |
| عربيةٌ رسمية | ✅ |
| **خلوّها من الشرطات** (`U+002D` · `U+2010` إلى `U+2015` · `U+2212` · `U+FE58` · `U+FE63` · `U+FF0D`) | ✅ **صفر** — والمسبار مُصادَق: 371 على ملف البحث هذا (موجب)، و0 على نصٍّ بلا شرطة (سالب). **لا سطرَ أُعيدت كتابته.** |
| الوقائع المذكورة فيها (أرقام التعاميم وتواريخها، الإعلان، المسمّى) | ✅ كلّها طابقت المصادر أعلاه |

⚠️ **حدُّ هذه المراجعة:** رصيدُ البحث في محرّك البحث نفد (200 من 200)، فلم يُبحث بحثاً مستقلاً عن قناةٍ منشورة مخصّصة لتصاريح التجارة الإلكترونية لدى المدفوعات السعودية؛ وصفحتا ساما المقروءتان («مدى» وخبر 1095) بلا عنوان بريد. فتنبيهُ القناة في رأس الرسالة يبقى كما هو.
