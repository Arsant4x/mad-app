<!-- no-id-scan: فهرسٌ يسرد عناوين وثائقٍ حرفياً، ومنها ما يذكر أمثلة مرفقات -->

# فهرس وثائق التخطيط — `docs/plans/`

> **٥٦ وثيقة** · **٥٤٬٣١٦ سطراً** · **٤٫٠٦ ميجابايت**. منها **٥٣** استُوردت 2026-09-03 من
> أرشيف صاحب المشروع (`خطه بناء.zip` · ١٬٢٦٧٬٥٩٧ بايت)، **وطابق العدُّ الأرشيفَ ٥٣/٥٣**
> بمسبارَين مستقلَّين (`Get-ChildItem -Recurse` · `find`)؛ **ووثيقتا Monorepo** أُضيفتا
> 2026-09-03 مرفقَين من المالك، مطابقتَين بايتاً ببايت (`cmp`) قبل ضبط سطر حالتهما؛
> **وموجزُ شرطَيهما** كُتب في اليوم نفسه (مسوّدة حتى يُقرّ المالك التصنيف).
>
> **الحالة تُقرأ من سطر «الحالة:» في رأس كل وثيقة** — لا تُكتب هنا بيد. **ووثيقةٌ بلا
> سطر حالة مسوّدةٌ افتراضاً** (قرار المالك 2026-09-03: «ما لم يُعلن اعتماده فهو
> مسوّدة» — وأيّها يستحق الاعتماد يُرفع حين يُقرأ ويُقرّ، **لا بأثرٍ رجعي**). وتُعلَّم
> هنا `مسوّدة (افتراضاً)` كي يبقى ظاهراً أن الحالة مشتقّةٌ من غياب السطر لا من نصّه.

## كيف تُقرأ الحالة

| الحالة | معناها | العدد |
|---|---|---|
| **معتمدة** | سطرها يقول «معتمدة» أو «خطة حاكمة» — تُبنى عليها | ٣ |
| **معتمد بشرطين** | معتمدٌ بقرار المالك **وشرطاه مسمّيان في سطر الحالة** — لا يُبنى عليه قبل تحقّقهما | ٢ |
| **مسوّدة** | «مسوّدة» · «أولية» · «تصميم كامل — البناء لم يبدأ» · «خطة رئيسية تسبق البناء» | ٣٩ |
| **مسوّدة (افتراضاً)** | **لا سطر حالة** في رأسها — مسوّدة بقرار المالك 2026-09-03 | ١٢ |
| **متجاوَزة** | تبقى في المجلد ولا تُحذف — فوثيقةٌ تُحذف يُعاد اقتراح ما فيها بعد شهر | ٠ حتى الآن |

**المجموع ٥٦** = ٣ + ٢ + ٣٩ + ١٢.

⚠️ **والمسوّدة المرئية أفضل من المخفية** (قرار المالك 2026-09-01): كل الوثائق هنا
مهما كانت حالتها، **والمسوّدات تُرقَّم حين تُعتمد لا قبل**.

## ⚠️ ثلاثة أنظمة ترقيم تتصادم — اقرأ قبل أن تستشهد

قياسٌ على الـ٥٣ (`LC_ALL=C.UTF-8`، بلا أصنافٍ حرفية عربية):

| الرمز | معناه في الخطة الموحّدة | معناه في وثائق الأنشطة | الحكم |
|---|---|---|---|
| **`ق-N`** | **قرارٌ حاجب** (١٨ قراراً، الجزء الثالث) | **قيدٌ محاسبيّ مرقَّم** داخل النشاط (`ق-1 · استلام عربون`) | 🔴 **الرمز مُحمَّل بمعنيين** — `ق-1` وحده معرَّفٌ **محلياً في ١٢ وثيقة بغير معنى التكلفة**. المرجع [`decisions.md`](decisions.md) |
| **`L<طبقة>-<رقم>`** | محرّك في الخريطة الموحّدة (٦٤ محرّكاً، الجزء الثاني) | مقترحاتٌ جديدة (`L2-21` · `L2-22` · `L3-11` · `L4-7`) وتصادمان (`L2-19` · `L2-20`) | المرجع [`engines.md`](engines.md) |
| **`أ/ب/ج/د`** | **الفئة** (أنشطة الجزء الخامس: `أ-١ الصرافة`) **والمسار** (موجات الجزء السادس: `أ-١ إصلاح الجذر`) | — | 🔴 **الحرف نفسه بثلاثة معانٍ**: مرحلة `§9` · فئة نشاط · مسار بناء. **يُذكَر دائماً بسابقته**: `مرحلة-ب` · `فئة-ب` · `مسار-ب` |

**وعدّ المراجع كلّه من المصدر:** `ق-N` **٨١٤** مرجعاً · **٧٢** رقماً مميّزاً · **٥٦** رقماً
في ملفَين فأكثر. `L*-*` **٣٥٢** مرجعاً · **٦٨** معرّفاً · ٤ منها غير مسجَّلة.

## المحاور — ما يُستشهَد به أكثر

| الوثيقة | تستشهد بها |
|---|---|
| `inventory-master-plan.md` | **١٦** وثيقة |
| `retail-full-spec.md` | ٩ |
| `hr-master-plan.md` | ٧ |
| `unified-build-plan.md` | ٦ |
| `wholesale-full-spec.md` | ٥ |

⭐ **`unified-build-plan.md` هي الحاكمة** («خطة حاكمة — تحلّ محل خرائط الطريق المتفرقة»)
وقد بُنيت على **٤٣** وثيقة. **والعشر الباقية كُتبت بعدها وتستشهد بها**:
`asset-register` · `handover-forms` · `permissions-tasks` · `gov-integrations` · `reports` ·
`chat` · `delivery` · `customer-app` · `post-unified-gaps` · وهي نفسها.

⚠️ **وهي تستشهد بـ`gap-analysis.md`** — وهو **مؤرشفٌ منذ 2026-08-08** في
`docs/archive/` ورأسه يقول «لا يُعتمد عليها». بندٌ يُراجَع.

## الوثائق — ٦٢

| الملف | العنوان | التاريخ | الحالة | أسطر | تعتمد على |
|---|---|---|---|---|---|
| [`3pl-full-spec.md`](plans/3pl-full-spec.md) | المواصفة الكاملة — نشاط مراكز التخزين والخدمات اللوجستية (3PL) | — | مسوّدة | 901 | inventory-master-plan.md، wholesale-full-spec.md |
| [`agency-full-spec.md`](plans/agency-full-spec.md) | المواصفة الشاملة لملف نشاط: الإعلان والتسويق وشراء الوسائط | 2026-08-27 | مسوّدة | 1158 | — |
| [`agri-contracting-full-spec.md`](plans/agri-contracting-full-spec.md) | المواصفة الكاملة — نظام محاسبي للمقاولات الزراعية والري والبيئة | 2026-08-28 | مسوّدة | 1338 | — |
| [`agriculture-full-spec.md`](plans/agriculture-full-spec.md) | المواصفة الكاملة — الزراعة والثروة الحيوانية والمزارع | 2026-08-27 | مسوّدة | 814 | inventory-master-plan.md، retail-full-spec.md، wholesale-full-spec.md |
| [`asset-register-master-plan.md`](plans/asset-register-master-plan.md) | سجل الأصول والعهد — الخطة الرئيسية | 2026-08-31 | مسوّدة | 396 | handover-forms-master-plan.md، unified-build-plan.md |
| [`automotive-master-plan.md`](plans/automotive-master-plan.md) | الخطة الرئيسية — نشاط السيارات وقطع الغيار | 2026-08-26 | مسوّدة | 1078 | pharmacy-master-plan.md |
| [`chat-master-plan.md`](plans/chat-master-plan.md) | خطة بناء نظام التواصل (الدردشة الكتابية والصوتية) — منصة ركز | 2026-08-28 | مسوّدة | 702 | — |
| [`compound-master-plan.md`](plans/compound-master-plan.md) | الخطة الرئيسية — نظام محاسبي متكامل للمجمعات السكنية المغلقة (كومباوند) وما يشابهها | — | مسوّدة | 896 | — |
| [`contacts-identity-plan.md`](plans/contacts-identity-plan.md) | خطّةُ جهات الاتصال — هويّةٌ واحدةٌ وجدولا دور: الهجرةُ على القائم · المطابقةُ بلا تخمين · الكلفة · ما ينكسر (ق-١٤٣٩ · الخيار ب — لا بناءَ قبل الحكم) | 2026-09-25 | بانتظار حكم المالك | 155 | — |
| [`customer-app-master-plan.md`](plans/customer-app-master-plan.md) | الخطة الرئيسية — طبقة قنوات الطلب للعميل النهائي | — | مسوّدة | 899 | hr-master-plan.md، inventory-master-plan.md، retail-full-spec.md |
| [`delivery-master-plan.md`](plans/delivery-master-plan.md) | الخطة الرئيسية — نشاط توصيل الطلبات (Delivery) | 2026-08-28 | مسوّدة | 971 | hr-master-plan.md، inventory-master-plan.md، retail-full-spec.md |
| [`ecommerce-full-spec.md`](plans/ecommerce-full-spec.md) | المواصفة الشاملة لمنظومة التجارة الإلكترونية | 2026-08-27 | مسوّدة (افتراضاً) | 959 | inventory-master-plan.md، retail-full-spec.md، wholesale-full-spec.md |
| [`education-rikaz-complete.md`](plans/education-rikaz-complete.md) | قطاع التعليم والتدريب — الوثيقة الكاملة | — | مسوّدة (افتراضاً) | 1731 | hr-master-plan.md |
| [`events-full-spec.md`](plans/events-full-spec.md) | المواصفة الشاملة لملف نشاط الفعاليات والمؤتمرات والمناسبات | 2026-08-27 | مسوّدة | 1104 | inventory-master-plan.md |
| [`exchange-full-spec.md`](plans/exchange-full-spec.md) | المواصفة الكاملة — نظام محاسبي لمكاتب الصرافة والتحويل المالي | — | مسوّدة (افتراضاً) | 1767 | automotive-master-plan.md، hr-master-plan.md، inventory-master-plan.md |
| [`freelance-full-spec.md`](plans/freelance-full-spec.md) | المواصفة الشاملة لوحدة العمل الحر | 2026-08-27 | مسوّدة | 378 | inventory-master-plan.md، retail-full-spec.md |
| [`fuel-station-full-spec.md`](plans/fuel-station-full-spec.md) | المواصفة الكاملة — محطات الوقود ومراكز الخدمة المتكاملة | — | مسوّدة | 2291 | automotive-master-plan.md، hr-master-plan.md، inventory-master-plan.md، retail-full-spec.md |
| [`fulfillment-models-full-spec.md`](plans/fulfillment-models-full-spec.md) | المواصفة الكاملة — محرّك نماذج التنفيذ | 2026-08-27 | مسوّدة | 1421 | — |
| [`furniture-full-spec.md`](plans/furniture-full-spec.md) | مواصفة كاملة — متاجر الأثاث والمفروشات (مخزون + طلبيات مسبقة) | — | مسوّدة | 987 | — |
| [`general-retail-full-spec.md`](plans/general-retail-full-spec.md) | مواصفة نشاط التجزئة العامة (السلع غير الغذائية) — رِكز | 2026-08-27 | مسوّدة | 1162 | inventory-master-plan.md، retail-full-spec.md |
| [`gift-shop-full-spec.md`](plans/gift-shop-full-spec.md) | المواصفة الكاملة — وحدة محلات الهدايا والتحف والمقتنيات | — | مسوّدة | 898 | inventory-master-plan.md، retail-full-spec.md |
| [`gov-integrations-master-plan.md`](plans/gov-integrations-master-plan.md) | التكاملات الحكومية — طبقة فوق الخطة الموحّدة | 2026-08-28 | مسوّدة (افتراضاً) | 586 | unified-build-plan.md |
| [`handover-forms-master-plan.md`](plans/handover-forms-master-plan.md) | نماذج الاستلام والتسليم وما يشابهها — الخطة الرئيسية | 2026-08-31 | **معتمدة مرجعاً** (`ق-١٥٩٩`، 2026-10-03؛ ومسارُ التوقيع بالرابط محكومٌ `ق-١٦٢٠`؛ والمحرّكُ موقوفٌ على النموذج المرئيّ الجديد وما بقي من القرارات، `ق-١٦٢٢`) | 649 | asset-register-master-plan.md، unified-build-plan.md |
| [`handover-forms-wave-zero.md`](plans/handover-forms-wave-zero.md) | محرّكُ نماذج التسليم: الموجةُ صفر (القراراتُ في التصميم، ووصلُ MinIO) | 2026-10-03 | **مخرجُ الموجة صفر** (`ق-١٦١٠`/أ؛ لا شيفرة، ومعه النموذجُ المرئيّ `handover-forms-visual-model.html` أُعيد بمسار الرابط `ق-١٦٢٢`؛ ومسائلُ المخزن محكومة `ق-١٦١٧`، ومسارُ التوقيع في البنية §٤ `ق-١٦٢٠`) | 94 | handover-forms-master-plan.md |
| [`hardware-full-spec.md`](plans/hardware-full-spec.md) | المواصفة الكاملة — قطاع السباكة والكهرباء ومواد البناء | — | مسوّدة | 1126 | inventory-master-plan.md، retail-full-spec.md، wholesale-full-spec.md |
| [`healthcare-master-plan.md`](plans/healthcare-master-plan.md) | الخطة الشاملة لبناء النظام المحاسبي للمنشآت الصحية | 2026-08-26 | مسوّدة (افتراضاً) | 523 | — |
| [`hospitality-master-plan.md`](plans/hospitality-master-plan.md) | الخطة الرئيسية — نشاط الضيافة والفنادق والشقق المفروشة | — | مسوّدة | 787 | — |
| [`hr-master-plan.md`](plans/hr-master-plan.md) | الخطة الرئيسية — وحدة الموارد البشرية والرواتب (رِكز) | 2026-08-26 | مسوّدة | 1048 | — |
| [`imaging-physio-complete.md`](plans/imaging-physio-complete.md) | مراكز الأشعة التشخيصية والعلاج الطبيعي — الوثيقة الكاملة | — | مسوّدة | 1375 | — |
| [`insurance-brokerage-master-plan.md`](plans/insurance-brokerage-master-plan.md) | الخطة الرئيسية — وساطة التأمين والأنشطة الوكيلية (العمولات) | — | مسوّدة | 666 | — |
| [`inventory-master-plan.md`](plans/inventory-master-plan.md) | الخطة الشاملة لبناء نظام المخزون والمستودعات المحاسبي | 2026-08-26 | مسوّدة (افتراضاً) | 1383 | pharmacy-master-plan.md |
| [`irreversible-20-plan.md`](plans/irreversible-20-plan.md) | خطّةُ العشرين الباقية من الثلاثة والعشرين «لا يُعكَس» — جدولٌ واحد: البندُ · يعتمد على ماذا · كلفتُه بالأيام بالمقياس المعلَن · حزمتُه (ق-١٢٥٤) | 2026-09-21 | بانتظار حكم المالك | 77 | — |
| [`jewelry-full-spec.md`](plans/jewelry-full-spec.md) | المواصفة الكاملة — نشاط المجوهرات والمعادن الثمينة والأحجار الكريمة | — | مسوّدة | 1227 | — |
| [`lab-master-plan.md`](plans/lab-master-plan.md) | الخطة الرئيسية — ملف نشاط: المختبرات الطبية المستقلة (B2B) وما يشابهها | — | مسوّدة | 803 | inventory-master-plan.md، pharmacy-master-plan.md، wholesale-full-spec.md |
| [`manufacturing-full-spec.md`](plans/manufacturing-full-spec.md) | المصانع والإنتاج — المواصفة الكاملة | 2026-08-27 | مسوّدة (افتراضاً) | 955 | — |
| [`media-production-full-spec.md`](plans/media-production-full-spec.md) | المواصفة الكاملة — الإعلام الرقمي والإنتاج الفني | — | مسوّدة | 2636 | — |
| [`monorepo-proposal.md`](plans/monorepo-proposal.md) | مقترح: هيكل المستودع الموحّد (Monorepo) لمنصة رِكز | 2026-09-03 | معتمد بشرطين | 134 | — |
| [`monorepo-research.md`](plans/monorepo-research.md) | بحث: المستودع الموحّد (Monorepo) مقابل المستودعات المتعددة (Polyrepo) | 2026-09-03 | معتمد بشرطين | 212 | monorepo-proposal.md |
| [`monorepo-preconditions.md`](plans/monorepo-preconditions.md) | موجز الشرطَين قبل أول نقل — اعتماد Monorepo (معيار النواة/المحرّك وتصنيف الـ٥١ · حارس التدرّج) | 2026-09-03 | معتمدة | 243 | monorepo-proposal.md، monorepo-research.md |
| [`optical-master-plan.md`](plans/optical-master-plan.md) | الخطة الرئيسية — نشاط البصريات والنظارات الطبية | — | مسوّدة (افتراضاً) | 743 | — |
| [`payments-receivables-owner-reference.md`](plans/payments-receivables-owner-reference.md) | أنظمة الدفعات والمستحقات: مرجع تصميمي لمنصة رِكز (مرجعُ صاحب المشروع محفوظاً بنصّه بايتاً ببايت · ق-١٥٨٩؛ وقياسُ المبنيّ عليه في [`domain-scan/34`](domain-scan/34-الدفعات-والمستحقات-على-مرجع-صاحب-المشروع.md)) | 2026-09-17 | مرجعٌ لصاحب المشروع، **وأحكامُه على ما يخالف قراراً أحدث** (`ق-١٦٠٢` · `ق-١٦٠٣`): الحفظُ ١٥ سنةً للعقار يغلب «ستَّ سنوات» · الإطارُ معيارُ المنشآت الصغيرة والمتوسطة افتراضاً · التمويلُ والفائدةُ الفعلية خارج الإصدار الأوّل · زائدُ الإيجار على الأقدم استحقاقاً داخل العقد · الفائضُ على `ق-١٢٦٤` | 389 | — |
| [`permissions-tasks-master-plan-1.md`](plans/permissions-tasks-master-plan-1.md) | الصلاحيات والمهام — طبقة الحوكمة التشغيلية | 2026-08-31 | مسوّدة (افتراضاً) | 986 | gov-integrations-master-plan.md، post-unified-gaps.md، reports-master-plan.md، unified-build-plan.md |
| [`pharmacy-master-plan.md`](plans/pharmacy-master-plan.md) | خطة بناء نظام الصيدليات — رِكز | 2026-08-24 | مسوّدة | 370 | — |
| [`post-unified-gaps.md`](plans/post-unified-gaps.md) | فجوات ما بعد الخطة الموحّدة — الملف الحاكم | — | مسوّدة (افتراضاً) | 775 | chat-master-plan.md، unified-build-plan.md |
| [`professional-services-full-spec.md`](plans/professional-services-full-spec.md) | الخدمات المهنية — المواصفة الفنية الكاملة | 2026-08-26 | مسوّدة | 1114 | — |
| [`projects-engine-master-plan.md`](plans/projects-engine-master-plan.md) | خطة بناء محرك المشاريع والعقود — رِكز | 2026-08-26 | مسوّدة | 665 | — |
| [`realestate-contracting-master-plan.md`](plans/realestate-contracting-master-plan.md) | المواصفة الرئيسية — العقارات والمقاولات | 2026-08-26 | مسوّدة | 801 | — |
| [`recruitment-master-plan.md`](plans/recruitment-master-plan.md) | الخطة الرئيسية — نشاط الاستقدام وتقديم الخدمات العمالية | — | مسوّدة | 1064 | hr-master-plan.md |
| [`reports-master-plan.md`](plans/reports-master-plan.md) | خطة بناء نظام التقارير — رِكز | 2026-08-29 | معتمدة | 537 | gov-integrations-master-plan.md، post-unified-gaps.md، unified-build-plan.md |
| [`retail-full-spec.md`](plans/retail-full-spec.md) | مواصفة نشاط التجزئة — رِكز | 2026-08-26 | مسوّدة | 1065 | — |
| [`salon-master-plan.md`](plans/salon-master-plan.md) | الخطة الرئيسية — نشاط الصالونات ومراكز العناية | — | مسوّدة (افتراضاً) | 291 | — |
| [`security-guarding-master-plan.md`](plans/security-guarding-master-plan.md) | الخطة الشاملة — نظام محاسبي لشركات الأمن والحراسة الأهلية والأنشطة المشابهة | — | مسوّدة | 982 | — |
| [`service-center-full-spec.md`](plans/service-center-full-spec.md) | رِكز — المواصفة الكاملة: الصيانة ومراكز الخدمة | — | مسوّدة | 1819 | inventory-master-plan.md |
| [`shared-types-plan.md`](plans/shared-types-plan.md) | خطّةُ الأنواع المشتركة — أربعُ خطواتٍ بكلفتها وما ينكسر: معرّفُ عمليةٍ واحد · مخطّطاتُ الطلب الستّة · توليدُ المئة والتسعة · الردودُ بمِسنَن (ق-١٣٧٠) | 2026-09-24 | حُكمت (٢٦١ · ق-١٣٨٢…١٣٨٦) — تُبنى بالترتيب | 168 | — |
| [`support-full-spec.md`](plans/support-full-spec.md) | المواصفة الشاملة لنظام خدمة العملاء والدعم الفني | 2026-08-27 | مسوّدة | 759 | — |
| [`transport-logistics-full-spec.md`](plans/transport-logistics-full-spec.md) | مواصفة كاملة — وحدة النقل والخدمات اللوجستية | — | مسوّدة | 1339 | inventory-master-plan.md |
| [`travel-master-plan.md`](plans/travel-master-plan.md) | الخطة الرئيسية — ملف نشاط وكالات السفر والسياحة والحجوزات | 2026-08-28 | معتمدة | 1739 | hr-master-plan.md، inventory-master-plan.md |
| [`unified-build-plan.md`](plans/unified-build-plan.md) | خطة البناء الموحّدة — منصة رِكز | — | معتمدة | 757 | — |
| [`unified-core-plan.md`](plans/unified-core-plan.md) | الخطّةُ الموحّدة — الثلاثةُ والعشرون الجديدة من الأبواب ⑪…㉔ وباقي خطّة العشرين (د · و · هـ · ز · ح) ومكسورُ اليوم الباقي، جدولٌ واحد بخمسةَ عشرَ حزمةً على ما تكرّر — وحزمةُ الجسر «ر» (ق-١٢٧٢ · ق-١٣٩٠) | 2026-09-22 | بانتظار حكم المالك | 120 | — |
| [`veterinary-master-plan.md`](plans/veterinary-master-plan.md) | الخطة الرئيسية — العيادات البيطرية ومستلزمات الحيوانات الأليفة | — | مسوّدة | 1272 | — |
| [`wholesale-full-spec.md`](plans/wholesale-full-spec.md) | مواصفة نشاط تجارة الجملة والتوزيع — رِكز | 2026-08-26 | مسوّدة | 638 | — |
| [`خطة-نشاط-السوبرماركت.md`](plans/خطة-نشاط-السوبرماركت.md) | خطة بناء نظام التجزئة الغذائية (سوبرماركت · ميني ماركت · بقالة · تموينات) | — | مسوّدة (افتراضاً) | 438 | — |

## كيف يُحرَس هذا الفهرس

`ops/process-gates/registry-numbering.test.mjs` (السير `process-gates`) يُسقط الحزمة إن:

- وُجد ملفٌ في `docs/plans/` **بلا صفٍّ هنا**، أو صفٌّ هنا **بلا ملف** — بالاتجاهين.
- استُشهد في وثيقةٍ بمعرّف محرّكٍ `L*-*` **غير مسجَّل** في [`engines.md`](engines.md).
- تكرّر معرّفٌ في أيٍّ من السجلَّين.

**وميله معلَن: إنذارٌ كاذب لا صمتٌ كاذب** — وثيقةٌ لم تُفهرس بعد تُنذر، ورقمٌ متصادم لا يُسكَت.
