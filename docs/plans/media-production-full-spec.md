# المواصفة الكاملة — الإعلام الرقمي والإنتاج الفني
## شركات الإنتاج · الاستوديوهات · الوكالات · صنّاع المحتوى · الموزّعون

**المنصة:** ركز (Rikaz) — نظام ERP/محاسبة متعدد المستأجرين للسوق السعودي
**الإصدار:** 1.0
**التاريخ:** 28 أغسطس 2026
**القاعدة المرجعية:** `mad-app` — `SPEC.md`, `CLAUDE.md`, `gap-analysis.md`
**الحالة:** مواصفة تخطيط — لم يبدأ البناء

---

## فهرس

| # | القسم |
|---|---|
| 1 | نطاق الوثيقة ومبدأ القراءة |
| 2 | تعريف القطاع وأنواع الأنشطة |
| 3 | النماذج الستة ومصفوفة الميزات |
| 4 | المعجم المهني |
| 5 | المبادئ المعمارية الحاكمة |
| 6 | البنية التحتية الأساسية الناقصة (16 محركاً) |
| 7 | دليل الحسابات — الإضافات المطلوبة |
| 8 | شجرة أكواد التكلفة (ATL / BTL) |
| 9 | نموذج البيانات الكامل |
| 10 | محرك الأبعاد المحاسبية |
| 11 | محرك المشاريع وتكاليف الوظائف |
| 12 | محرك الميزانية / الالتزام / الفعلي وتقرير التكلفة |
| 13 | محرك الأعمال تحت التنفيذ والرسملة |
| 14 | محرك الاعتراف بالإيراد (IFRS 15) |
| 15 | محرك أصيل / وكيل |
| 16 | محرك الطاقم والمتعاقدين المستقلين |
| 17 | محرك العهد النثرية الميدانية |
| 18 | محرك ضريبة الاستقطاع |
| 19 | محرك تعدد العملات |
| 20 | الأصول الثابتة والحجوزات والتأجير |
| 21 | مكتبة المحتوى ومحرك الإطفاء |
| 22 | الحقوق والمشاركات ونوافذ الترخيص |
| 23 | محرك حوافز هيئة الأفلام |
| 24 | ملف نشاط: صانع المحتوى |
| 25 | ملف نشاط: الوكالة الإعلانية |
| 26 | ملف نشاط: الاستوديو والتأجير |
| 27 | مصفوفة ضريبة القيمة المضافة |
| 28 | الفوترة الإلكترونية والموجة 25 |
| 29 | سجل التراخيص والتصاريح |
| 30 | حقوق المؤلف والملكية الفكرية |
| 31 | العمل الحر والعمالة الأجنبية |
| 32 | حماية البيانات وإقرارات التصوير |
| 33 | القيود المحاسبية (44 قيداً) |
| 34 | التقارير ومؤشرات الأداء |
| 35 | الأدوار والصلاحيات |
| 36 | التكاملات |
| 37 | القرارات الحاجبة |
| 38 | أسئلة المستشار الضريبي المرخّص |
| 39 | خارطة الطريق التنفيذية |
| 40 | اختبارات القبول |
| 41 | درجة التحقق من المصادر |

---

# 1. نطاق الوثيقة ومبدأ القراءة

هذه الوثيقة تصف **ما يجب بناؤه** لتغطية قطاع الإعلام الرقمي والإنتاج الفني تغطية كاملة داخل منصة ركز، دون افتراض معرفة سابقة بالقطاع.

**مبدأ القراءة:** كل بند مصنّف بأحد ثلاثة تصنيفات:

- 🔵 **نواة مشتركة** — يُبنى مرة واحدة ويخدم قطاعات أخرى (المقاولات، الاستشارات، الصيانة، البرمجيات، التعليم)
- 🟣 **محرك أفقي** — يخدم عدة قطاعات لكن ليس كلها
- 🟠 **ملف نشاط** — خاص بالإعلام حصراً

**النسبة النهائية بعد التحليل الكامل: 71% نواة مشتركة، 17% محركات أفقية، 12% خاص بالقطاع.**

هذه النسبة هي الحجة التجارية الأقوى: بناء هذا القطاع يفتح ضمناً قطاع المقاولات وقطاع الاستشارات المهنية بجهد إضافي محدود.

---

# 2. تعريف القطاع وأنواع الأنشطة

## 2.1 الأنشطة المشمولة

النشاطات التي يغطيها ترخيص إنتاج المحتوى الإعلامي المرئي والمسموع من الهيئة العامة لتنظيم الإعلام تشمل: إنتاج البرامج التلفزيونية والإذاعية، والأفلام، والمحتوى الإعلامي المرئي والمسموع، **وألعاب الفيديو**، والرسوم المتحركة، والدبلجة والترجمة المصاحبة، والمونتاج، والرسوم البيانية، والنصوص المكتوبة للأعمال الإعلامية.

يضاف إليها من تراخيص أخرى:
- مكاتب الدعاية والإعلان ووكالات التسويق
- توزيع أو استيراد الأفلام والفيديو والبرامج التلفزيونية
- منصات توزيع محتوى مرئي ومسموع عبر بروتوكول الإنترنت (OTT/IPTV)
- تشغيل دور السينما الثابتة والمؤقتة
- تسجيل قنوات وبرامج التدوين الصوتي والمرئي (البودكاست)
- تقديم الأفراد للمحتوى الإعلاني عبر منصات التواصل (موثوق)
- خدمات ما قبل الطباعة والتصميم

## 2.2 خارج النطاق (يُغطى في مواصفات أخرى)

- **الفعاليات والمؤتمرات الحيّة** — يشترك في محرك المشاريع لكن له محرك تذاكر ودورة نقدية مختلفة تماماً
- **دور السينما كتشغيل تجزئة** — يقع تحت مواصفة التجزئة + محرك التذاكر
- **الطباعة والنشر الورقي** — تصنيع، يقع تحت مواصفة التصنيع
- **تطوير الألعاب كمنتج برمجي** — يشترك في محرك المشاريع والاعتراف بالإيراد، لكن دورة الإيراد (IAP، الاشتراكات، المتاجر) تحتاج ملف نشاط منفصل

## 2.3 حجم العميل النموذجي

| الشريحة | الوصف | الاحتياج الحاكم |
|---|---|---|
| فرد | صانع محتوى بوثيقة عمل حر | فوترة، تتبع دخل المنصات، عتبة الضريبة |
| صغير (2–10) | استوديو تصوير، وكالة صغيرة | حجوزات، مشاريع مبسّطة، فوترة إلكترونية |
| متوسط (10–60) | شركة إنتاج، وكالة متكاملة | تكاليف وظائف كاملة، استقطاع، اعتراف بالإيراد |
| كبير (60+) | مجموعة إنتاج، موزّع، منصة | مكتبة محتوى، مشاركات، حوافز، تعدد عملات |

---

# 3. النماذج الستة ومصفوفة الميزات

## 3.1 النماذج

**النموذج 1 — شركة إنتاج (Production Company)**
تنتج أفلاماً أو مسلسلات أو إعلانات. المحرك الحاكم: تكاليف الوظائف + WIP + الاعتراف بالإيراد على مدى الزمن. الفرق الجوهري داخل هذا النموذج نفسه:
- **إنتاج بالتكليف (work-for-hire):** العميل يملك العمل ← لا يوجد أصل محتوى، التكلفة تذهب إلى تكلفة الإيراد
- **إنتاج مملوك (owned IP):** الشركة تملك العمل ← يُرسمل كأصل محتوى ويُطفأ
- **إنتاج مشترك (co-production):** ملكية جزئية ← محاسبة ترتيبات مشتركة، وأصل بنسبة الحصة

> هذا التمييز الثلاثي يجب أن يكون حقلاً على كيان المشروع، لأنه يغيّر مسار الترحيل بالكامل.

**النموذج 2 — استوديو تصوير/تسجيل**
يؤجّر المساحة والمعدات والطاقم بالساعة أو اليوم. المحرك: الحجوزات + إشغال الأصول + الإهلاك + الودائع التأمينية. أقرب نموذج محاسبياً إلى الصالونات وقاعات المناسبات.

**النموذج 3 — وكالة إعلانية / وكالة محتوى**
اشتراكات دورية (retainers) + مشاريع + **شراء إعلامي**. القرار الحاكم: أصيل أم وكيل. النموذج الوحيد الذي يمكن أن يتغير فيه الإيراد المعلن بنسبة 1200% بناءً على قرار محاسبي واحد.

**النموذج 4 — صانع محتوى / شبكة (MCN)**
إيراد منصات بعملات أجنبية + عقود علامات تجارية + التسويق بالعمولة + المقايضة العينية. المحرك: تعدد العملات + عقود متعددة الالتزامات + التسوية مع بيانات المنصات.

**النموذج 5 — موزّع / منصة محتوى**
شراء وبيع حقوق لنوافذ زمنية وجغرافية. المحرك: نوافذ الترخيص + إطفاء الحقوق المشتراة + الإتاوات الصادرة + الاستقطاع.

**النموذج 6 — خدمات إنتاج (Line Production / Production Services)**
يقدم خدمة تنفيذية لإنتاج أجنبي يصوّر في المملكة. المحرك: تكاليف مُعاد فوترتها + **مطالبة حافز هيئة الأفلام** + الاستقطاع على الطاقم الأجنبي + التصدير بمعدل صفري.

## 3.2 مصفوفة الميزات

| المحرك | إنتاج | استوديو | وكالة | صانع محتوى | موزّع | خدمات إنتاج |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| الأبعاد المحاسبية | ● | ○ | ● | ○ | ○ | ● |
| المشاريع وتكاليف الوظائف | ● | ○ | ● | ○ | — | ● |
| الميزانية/الالتزام/الفعلي | ● | — | ● | — | — | ● |
| WIP والرسملة | ● | — | ○ | — | ○ | ○ |
| اعتراف بالإيراد على مدى الزمن | ● | — | ● | ○ | ○ | ● |
| أصيل/وكيل | ○ | — | ● | ● | ○ | ● |
| المتعاقدون المستقلون | ● | ● | ● | ○ | — | ● |
| العهد النثرية | ● | — | ○ | — | — | ● |
| ضريبة الاستقطاع | ● | ○ | ● | ○ | ● | ● |
| تعدد العملات | ● | ○ | ● | ● | ● | ● |
| الحجوزات والتأجير | ○ | ● | — | — | — | ○ |
| الأصول الثابتة | ● | ● | ○ | ○ | — | ● |
| مكتبة المحتوى والإطفاء | ● | — | — | ○ | ● | — |
| الحقوق والمشاركات | ● | — | — | ○ | ● | — |
| نوافذ الترخيص | ● | — | — | — | ● | — |
| حوافز هيئة الأفلام | ● | — | — | — | — | ● |
| الاشتراكات الدورية | — | ○ | ● | ○ | — | — |
| تسوية بيانات المنصات | — | — | ○ | ● | ● | — |

● أساسي · ○ مفيد · — غير مطلوب

---

# 4. المعجم المهني

هذه المصطلحات ستظهر في واجهة النظام وفي التقارير. توحيدها منذ البداية يمنع فوضى التسمية.

| المصطلح | العربية | التعريف المحاسبي |
|---|---|---|
| ATL — Above the Line | فوق الخط | تكاليف الحقوق والمنتج والمخرج والممثلين الرئيسيين — تُتفاوض قبل بدء الإنتاج وتكون شبه ثابتة |
| BTL — Below the Line | تحت الخط | تكاليف التنفيذ: الطاقم، المعدات، المواقع، السفر — متغيرة وقابلة للانضغاط |
| Cost Report | تقرير التكلفة | التقرير الأسبوعي المعياري: الميزانية، الفعلي، المرتبط، المتبقي، التقدير عند الإكمال |
| EAC — Estimate at Completion | التقدير عند الإكمال | الفعلي حتى تاريخه + المتبقي المقدّر |
| Committed | مرتبط | مبالغ تعاقدنا عليها ولم تُفوتر بعد — أهم رقم في التقرير |
| Float / Petty Cash | عهدة ميدانية | سلفة نقدية لمدير الإنتاج تُسوّى بالمستندات |
| Kit Fee | بدل معدات شخصية | ما يتقاضاه فني مقابل استخدام معداته الخاصة |
| Per Diem | بدل يومي | بدل إقامة وإعاشة يومي للطاقم خارج مدينتهم |
| Day Rate | أجر اليوم | وحدة التسعير الأساسية للطاقم |
| Call Sheet | ورقة النداء | جدول اليوم التصويري — مصدر بيانات كشف الأيام |
| Wrap | الطيّ | انتهاء التصوير |
| Delivery | التسليم | نقطة انتقال محاسبية حرجة: نهاية WIP وبداية الأصل أو الإيراد |
| Ultimate Revenue (EU) | الإيراد النهائي المقدّر | إجمالي الإيراد المتوقع من عمل خلال عمره — أساس الإطفاء |
| Participations / Residuals | حصص المشاركين | نصيب المؤلف/المخرج/الممثل من الإيراد بعد الإنتاج |
| Window | نافذة | فترة زمنية وجغرافية لحق استغلال محدد |
| Rebate | الحافز النقدي المسترد | استرداد نسبة من الإنفاق المؤهل من هيئة الأفلام |
| NOC | شهادة عدم ممانعة | تصريح التصوير |
| Retainer | اشتراك دوري | مبلغ شهري ثابت مقابل خدمات وكالة |
| Media Buying | الشراء الإعلامي | شراء مساحات إعلانية نيابة عن العميل |
| Rate Card | قائمة الأسعار | أسعار الاستوديو/المعدات بالساعة/اليوم/الأسبوع |

---

# 5. المبادئ المعمارية الحاكمة

**م-1 — النواة أولاً.** لا يُبنى أي شيء "خاص بالإعلام" قبل اكتمال المحركات المشتركة. مخالفة هذا المبدأ تُنتج نظاماً عمودياً لا يقبل التوسع.

**م-2 — أعلام الميزات لا فروع الكود.** النماذج الستة تُفعّل عبر `feature flags` على نفس النواة. لا يوجد `if (industry === 'media')` في أي مكان في منطق الترحيل.

**م-3 — ابنِ بالطبقات، واجعل الطريقة دالة استهلاك.**
مبدأ مستخلص من قرار طريقة التكلفة في مواصفة المخزون: تُبنى البنية الأكثر تفصيلاً دائماً، والطريقة الأبسط تُشتق منها.
- التطبيق هنا: `ContentAsset` يُبنى بجدول إطفاء مدفوع بالفترات، ثم "القسط الثابت" و"تنبؤ الإيراد الفردي" كلاهما دالة فوقه.
- والتطبيق الثاني: `PerformanceObligation` يُبنى بجدول اعتراف بالفترات، و"نقطة زمنية" هي حالة خاصة من "على مدى الزمن" بفترة واحدة.

**م-4 — التصنيف الضريبي يُقفل عند نشوء الالتزام لا عند تنفيذه.**
مستخلص من درس مخطط الربح في قطاع السيارات. التطبيق هنا: فئة الاستقطاع وصفة أصيل/وكيل ونسبة الحافز — كلها تُقفل عند توقيع العقد.

**م-5 — لا معدل حكومي في الكود.** كل نسبة تحددها جهة حكومية تُخزَّن في `RateTable` بتاريخ نفاذ ومرجع المصدر.

**م-6 — لا منطق تنظيمي بالاجتهاد.** الأسئلة الضريبية تُوثَّق وتُرسل لمستشار مرخّص، والإجابة تُربط بالموضع في المصدر عبر تعليق مرجعي.

**م-7 — مبدأ الفاعل الباني (builder actor).** الصلاحيات مبنية على الدور لا على الشخص. مدير الإنتاج يرى ميزانية مشروعه فقط، والمحاسب يرى الدفاتر ولا يرى أجور الطاقم فردياً إلا بصلاحية صريحة.

**م-8 — كل رقم قابل للتتبع إلى مستند.** خاصة في هذا القطاع، حيث الحوافز الحكومية تخضع لتدقيق مالي مستقل، وحيث النثريات الميدانية هي أكبر مصدر لتسرب المستندات.

---

# 6. البنية التحتية الأساسية الناقصة (16 محركاً)

مرتّبة بترتيب البناء الإلزامي.

| # | المحرك | التصنيف | إعادة الاستخدام | الحالة الحالية |
|---|---|---|---|---|
| 1 | تصحيح ترحيل المشتريات إلى أصل | 🔵 | 100% | 🔴 عيب مؤكد |
| 2 | نظام الأبعاد المحاسبية | 🔵 | 100% | ❌ غير موجود |
| 3 | المشاريع وتكاليف الوظائف | 🔵 | 90% | ❌ غير موجود |
| 4 | الميزانية/الالتزام/الفعلي | 🔵 | 85% | ❌ غير موجود |
| 5 | الأعمال تحت التنفيذ والرسملة | 🔵 | 80% | ❌ غير موجود |
| 6 | ضريبة الاستقطاع | 🔵 | 100% | ❌ غير موجود |
| 7 | تعدد العملات | 🔵 | 95% | ❌ غير موجود |
| 8 | الاعتراف بالإيراد IFRS 15 | 🔵 | 85% | ❌ غير موجود |
| 9 | أصيل/وكيل | 🟣 | 60% | ❌ غير موجود |
| 10 | المتعاقدون المستقلون | 🟣 | 80% | ❌ غير موجود |
| 11 | العهد النثرية | 🟣 | 70% | ❌ غير موجود |
| 12 | الأصول الثابتة والإهلاك | 🔵 | 100% | ❌ غير موجود |
| 13 | الحجوزات وإشغال الأصول | 🟣 | 85% | ❌ غير موجود |
| 14 | مكتبة المحتوى والإطفاء | 🟠 | 20% | ❌ غير موجود |
| 15 | الحقوق والمشاركات والنوافذ | 🟠 | 15% | ❌ غير موجود |
| 16 | الحوافز الحكومية (IAS 20) | 🟠 | 30% | ❌ غير موجود |

## 6.1 المحرك 1 — تصحيح ترحيل المشتريات (أولوية قصوى)

الحالة الحالية في `postPurchaseToLedger`: كل فاتورة شراء تُرحَّل إلى حساب مصروف مباشرة عبر خريطة `PURCHASE_CATEGORY_ACCOUNT`، مع افتراضي `5300 — مصروفات إدارية وعمومية`.

**الأثر في هذا القطاع تحديداً:** مسلسل بميزانية 6 ملايين ريال على 14 شهراً يظهر:
- الأشهر 1–13: خسائر تشغيلية متراكمة بلا أي إيراد مقابل
- الشهر 14: إيراد 8 ملايين بتكلفة صفر ← ربح صافي 8 ملايين

القوائم المالية في كل فترة وسيطة **مضللة جوهرياً**، وأي بنك أو ممول أو محاسب قانوني يرفضها.

**التصحيح المطلوب:** خريطة ترحيل مشروطة بثلاثة عوامل — فئة المشتريات، ووجود `projectId`، وحالة المشروع:

```
if (projectId && project.status ∈ [preProduction, production, post])
    → 1350 أعمال إنتاج تحت التنفيذ (بالمشروع وكود التكلفة)
else if (isCapitalAsset)
    → 1600 أصول ثابتة
else if (isInventoryItem)
    → 1300 المخزون
else
    → حساب المصروف المناسب
```

## 6.2 المحرك 6 — ضريبة الاستقطاع (تفاصيل في القسم 18)

الغياب الكامل لهذا المحرك هو أخطر فجوة امتثال في المنصة كلها، لأنه:
- **مخالفة شهرية متكررة** لا حدث سنوي
- **لا يمكن تصحيحه بأثر رجعي** — المبلغ حُوِّل للمستفيد بالكامل ولن يُعيده
- **غراماته تراكمية** وتحتسب على أصل الضريبة غير المسددة

## 6.3 المحرك 7 — تعدد العملات

مسجّل في `gap-analysis.md` كغائب حتى في النموذج الأولي (v20). هذا القطاع لا يعمل بدونه:

| المصدر | العملة النموذجية |
|---|---|
| إيرادات المنصات (YouTube/Meta/TikTok) | USD |
| معدات مستوردة (كاميرات، عدسات) | USD / EUR / JPY |
| خدمات مؤثرات بصرية | USD / JOD / EGP |
| ترخيص موسيقى ومكتبات لقطات | USD / EUR |
| اشتراكات برمجيات | USD |
| طاقم أجنبي | متعددة |
| عملاء خليجيون | AED / KWD / QAR |

---

# 7. دليل الحسابات — الإضافات المطلوبة

بناءً على الدليل الحالي (1000 النقدية، 1200 الذمم المدينة، 2100 الذمم الدائنة، 2200 ضريبة القيمة المضافة، 5100–5500 المصروفات).

## 7.1 الأصول

| الكود | الاسم | ملاحظة |
|---|---|---|
| 1250 | عهد ونثريات إنتاج | حساب فرعي لكل مسؤول عهدة |
| 1260 | سلف للمتعاقدين | |
| 1280 | مستحق من جهات حكومية — حوافز إنتاج | |
| 1310 | مخزون مواد إنتاج وإكسسوارات | استهلاكيات |
| 1350 | **أعمال إنتاج تحت التنفيذ (WIP)** | فرعي لكل مشروع |
| 1355 | أعمال تحت التنفيذ — تكاليف تطوير | مرحلة ما قبل الاعتماد |
| 1360 | **أصل عقد — إيراد غير مفوتر** | IFRS 15 |
| 1400 | مصروفات مدفوعة مقدماً | تأمين إنتاج، اشتراكات |
| 1420 | ودائع مدفوعة لمواقع ومورّدين | |
| 1600 | معدات إنتاج وتصوير | |
| 1605 | مجمع إهلاك معدات الإنتاج | |
| 1610 | أثاث وتجهيزات استوديو | |
| 1615 | مجمع إهلاك تجهيزات الاستوديو | |
| 1620 | حق استخدام أصل مستأجر (IFRS 16) | |
| 1625 | مجمع إهلاك حق الاستخدام | |
| 1700 | **مكتبة المحتوى — أصول غير ملموسة** | فرعي لكل عمل |
| 1710 | حقوق قصص وسيناريوهات قيد التطوير | |
| 1720 | حقوق توزيع مشتراة | للموزّعين |
| 1750 | مجمع إطفاء واضمحلال مكتبة المحتوى | |

## 7.2 الخصوم

| الكود | الاسم | ملاحظة |
|---|---|---|
| 2110 | مستحق لمتعاقدين وطاقم | منفصل عن الموردين |
| 2120 | دائنون — وسائل إعلام ومنصات | للوكالات، حساب مرور |
| 2150 | رواتب مستحقة | |
| 2160 | التأمينات الاجتماعية مستحقة | |
| 2210 | ضريبة القيمة المضافة — مخرجات عكسية | reverse charge |
| 2250 | **ضريبة استقطاع مستحقة للهيئة** | فرعي بفترة الإقرار |
| 2300 | **التزام عقد — إيراد مؤجل** | IFRS 15 |
| 2310 | اشتراكات دورية مقبوضة مقدماً | retainers |
| 2350 | مخصص عقود خاسرة | |
| 2400 | ودائع تأمينية مستردة من العملاء | |
| 2450 | التزام حصص المشاركين | participations |
| 2460 | إتاوات مستحقة لمالكي الحقوق | |
| 2500 | إيراد منحة حكومية مؤجل | إن اختيرت هذه السياسة |
| 2600 | التزام إيجار (IFRS 16) | |

## 7.3 الإيرادات

| الكود | الاسم |
|---|---|
| 4100 | إيراد خدمات إنتاج — مشاريع |
| 4110 | إيراد خدمات ما بعد الإنتاج |
| 4200 | إيراد عمولة وكالة (صفة وكيل) |
| 4210 | إيراد خدمات إعلامية (صفة أصيل) |
| 4220 | إيراد اشتراكات دورية |
| 4300 | إيراد محتوى رقمي — منصات |
| 4310 | إيراد رعايات وعقود علامات |
| 4320 | إيراد تسويق بالعمولة |
| 4400 | إيراد تأجير استوديو ومعدات |
| 4410 | إيراد خدمات طاقم |
| 4500 | إيراد تراخيص محتوى |
| 4510 | إيراد توزيع |
| 4600 | إيراد منح وحوافز حكومية |
| 4900 | إيرادات أخرى |

## 7.4 التكاليف والمصروفات

| الكود | الاسم |
|---|---|
| 5100 | تكلفة الإيراد — مشاريع إنتاج |
| 5110 | تكلفة الإيراد — خدمات وطاقم |
| 5120 | تكلفة الإيراد — حصص المشاركين |
| 5130 | تكلفة الإيراد — تأجير ومعدات |
| 5150 | تكلفة شراء مساحات إعلانية (صفة أصيل) |
| 5200 | رواتب وأجور — غير محمّلة على مشاريع |
| 5210 | أتعاب متعاقدين — غير محمّلة |
| 5300 | مصروفات إدارية وعمومية |
| 5310 | اشتراكات برمجيات ومنصات |
| 5320 | رسوم تراخيص وتصاريح |
| 5400 | مصروفات أخرى |
| 5410 | **مصروفات بلا مستند ضريبي صالح** | *(غير قابلة لخصم المدخلات)* |
| 5450 | مصروف مشاريع متوقفة أو ملغاة |
| 5460 | خسائر عقود متوقعة |
| 5500 | مصروف إطفاء مكتبة المحتوى |
| 5510 | خسارة اضمحلال أصول محتوى |
| 5600 | مصروف إهلاك |
| 5800 | فروق عملة — خسائر |
| 5910 | حساب مقاصة إعادة التحميل الداخلي |

---

# 8. شجرة أكواد التكلفة (ATL / BTL)

قالب افتراضي يُنسخ لكل مستأجر ويقبل التعديل. مبني على معيار الصناعة العالمي ومتوافق مع تصنيف النفقات المؤهلة في برنامج حافز هيئة الأفلام.

## 8.1 فوق الخط (ATL) — 1000

```
1100  الحقوق والسيناريو
      1110  شراء حقوق قصة / اقتباس
      1120  أتعاب كاتب السيناريو
      1130  أتعاب معالجة وتطوير
      1140  رسوم قانونية للحقوق
1200  المنتج
      1210  أتعاب المنتج المنفذ
      1220  أتعاب المنتج
      1230  أتعاب منتج الخط (Line Producer)
1300  المخرج
      1310  أتعاب المخرج
      1320  أتعاب مساعد المخرج الأول
1400  الممثلون الرئيسيون
      1410  أجور الأدوار الرئيسية
      1420  بدلات ومزايا الممثلين الرئيسيين
      1430  سفر وإقامة الممثلين الرئيسيين
```

## 8.2 تحت الخط — الإنتاج (BTL) — 2000

```
2100  الطاقم الفني
      2110  مدير التصوير ومساعدوه
      2120  قسم الصوت
      2130  قسم الإضاءة والكهرباء
      2140  قسم الحركة (Grip)
      2150  الطاقم الإداري للإنتاج
      2160  السائقون واللوجستيات
2200  الممثلون الثانويون والكومبارس
      2210  أدوار ثانوية
      2220  أجور الكومبارس
2300  التصميم الفني
      2310  مصمم الإنتاج والديكور
      2320  بناء وتنفيذ الديكورات
      2330  الإكسسوارات
      2340  الأزياء والملابس
      2350  المكياج والشعر
      2360  المؤثرات الخاصة الميدانية (SFX)
2400  المعدات
      2410  إيجار كاميرات وعدسات
      2420  إيجار إضاءة وكهرباء
      2430  إيجار صوت
      2440  إيجار حركة ورافعات
      2450  طائرات مسيّرة (drone)
      2460  مولدات ووقود
2500  المواقع
      2510  رسوم المواقع والتصاريح
      2520  تجهيز وإعادة المواقع لحالتها
      2530  الأمن والحراسة
2600  السفر والإقامة والإعاشة
      2610  تذاكر السفر
      2620  الإقامة الفندقية
      2630  البدلات اليومية (per diem)
      2640  الإعاشة الميدانية (catering)
      2650  النقل الداخلي
2700  التأمين والقانوني والإداري
      2710  تأمين الإنتاج
      2720  الرسوم القانونية
      2730  التصاريح والتراخيص
      2740  مصروفات مكتبية وإدارية
```

## 8.3 ما بعد الإنتاج — 3000

```
3100  المونتاج
3200  تصحيح الألوان
3300  المؤثرات البصرية (VFX)
3400  الصوت وما بعد الإنتاج الصوتي
      3410  المكساج
      3420  المؤثرات الصوتية
      3430  الموسيقى التصويرية الأصلية
      3440  تراخيص موسيقى جاهزة
3500  الترجمة والدبلجة
3600  الرسوم المتحركة والجرافيك
3700  التسليم والنسخ النهائية (deliverables)
```

## 8.4 أخرى — 4000

```
4100  الدعاية والتسويق
4200  رسوم التمويل والفوائد
4300  احتياطي الطوارئ (contingency)
4400  رسوم الإشراف والإدارة العامة (overhead)
```

> **خاصية إلزامية:** كل كود تكلفة يحمل علم `incentiveEligible` قابلاً للتعديل، لأن النفقات المؤهلة للحافز محددة بدقة (انظر القسم 23) وأي إنفاق خارج المملكة أو مع مورّد خارجها غير مؤهل.

---

# 9. نموذج البيانات الكامل

## 9.1 الأبعاد المحاسبية

```prisma
model Dimension {                    // تعريف نوع البُعد
  id, companyId
  code          String              // "PROJECT" | "COST_CENTER" | "DEPARTMENT"
  nameAr, nameEn
  isRequired    Boolean             // إلزامي على كل قيد؟
  appliesTo     String[]            // أنواع الحسابات التي يلزم فيها
}

model DimensionValue {
  id, companyId, dimensionId
  code, nameAr, parentId
  isActive      Boolean
  entityType    String?             // "Project" إذا كان مرتبطاً بكيان
  entityId      String?
}

model JournalLineDimension {         // جدول ربط متعدد للأبعاد
  journalLineId, dimensionId, dimensionValueId
  @@unique([journalLineId, dimensionId])
}
```

## 9.2 المشروع

```prisma
model Project {
  id, companyId
  code                String          // فريد داخل المستأجر
  nameAr, nameEn
  type                ProjectType     // film|series|commercial|documentary|animation|digital|podcast|service
  status              ProjectStatus   // development|greenlit|preProduction|production|post|delivered|archived|cancelled
  ownershipModel      OwnershipModel  // workForHire | ownedIP | coProduction
  coProductionShare   Decimal?        // نسبة الحصة إن كان مشتركاً
  clientId            String?
  currency            String          @default("SAR")
  plannedStart, plannedEnd, actualStart, actualEnd, deliveredAt
  shootingDays        Int?
  incentiveEligible   Boolean         @default(false)
  incentiveClaimId    String?
  wipAccountId        String
  contentAssetId      String?         // يُملأ عند الرسملة
  gamrLicenseId       String?         // ترخيص الإنتاج المرتبط
  nocId               String?         // شهادة عدم الممانعة
  createdBy, createdAt, updatedAt
}

model ProjectPhase {
  id, projectId, phase, plannedStart, plannedEnd, actualStart, actualEnd
}

model CostCode {
  id, companyId
  code                String          // "2410"
  nameAr, nameEn
  parentId            String?
  section             CostSection     // ATL | BTL | POST | OTHER
  defaultAccountId    String
  incentiveEligible   Boolean         @default(false)
  isActive            Boolean
}

model ProjectBudgetLine {
  id, projectId, costCodeId
  budgetOriginal      Decimal
  budgetCurrent       Decimal
  version             Int
  notes               String?
}

model ProjectBudgetRevision {
  id, projectId, version, revisedAt, revisedBy, reason
  totalBefore, totalAfter
}
```

## 9.3 الالتزامات

```prisma
model Commitment {                    // أمر شراء / عقد مورّد
  id, companyId, projectId?, costCodeId
  vendorId?           String
  contractorId?       String
  documentNo          String
  description
  amount              Decimal
  currency            String
  fxRate              Decimal
  consumedAmount      Decimal         @default(0)
  status              CommitmentStatus // draft|open|partiallyConsumed|closed|cancelled
  approvedBy, approvedAt
  whtCategory         String?          // يُقفل هنا
  whtRate             Decimal?
  isGrossedUp         Boolean          @default(false)
}

model CommitmentConsumption {
  id, commitmentId, purchaseId?, contractorPaymentId?, amount, consumedAt
}
```

## 9.4 الطاقم والمتعاقدون

```prisma
model Contractor {
  id, companyId
  nameAr, nameEn
  idType              IdType          // nationalId|iqama|passport|crNumber
  idNumber            String
  isNonResident       Boolean         @default(false)
  residencyCountry    String?
  trcOnFile           Boolean         @default(false)
  trcExpiry           DateTime?
  freelanceDocNo      String?         // وثيقة العمل الحر
  freelanceDocExpiry  DateTime?
  isVatRegistered     Boolean         @default(false)
  vatNumber           String?
  iban                String?
  defaultWhtCategory  String?
  defaultDayRate      Decimal?
  engagementDaysYTD   Int             // مؤشر خطر إعادة التصنيف
}

model CrewRole {
  id, companyId, code, nameAr, nameEn, defaultCostCodeId, section
}

model CrewEngagement {
  id, companyId, projectId, contractorId, crewRoleId, costCodeId
  dayRate, kitFee, perDiem          Decimal
  overtimeThresholdHours            Decimal   @default(12)
  overtimeMultiplier                Decimal   @default(1.5)
  contractedDays                    Int
  startDate, endDate
  currency, fxRate
  whtCategory, whtRate              // مقفلة عند التوقيع
  isGrossedUp                       Boolean
  contractSignedAt                  DateTime?
  contractFileKey                   String?
  status                            EngagementStatus
}

model CrewTimesheet {
  id, engagementId, workDate
  worked              Boolean
  hours               Decimal
  overtimeHours       Decimal
  perDiemClaimed      Boolean
  kitFeeClaimed       Boolean
  callSheetRef        String?
  approvedBy, approvedAt
  postedJournalId     String?
}
```

## 9.5 العهد النثرية

```prisma
model PettyCashFloat {
  id, companyId, projectId, holderId
  issuedAmount, settledAmount, returnedAmount
  currency
  issuedAt, settledAt
  status              FloatStatus     // open|partiallySettled|settled|written_off
}

model PettyCashExpense {
  id, floatId, costCodeId
  expenseDate, description
  amount, vatAmount
  hasValidTaxInvoice   Boolean        @default(false)
  vendorVatNumber      String?
  receiptFileKey       String?
  approvedBy, approvedAt
  postedJournalId      String?
}
```

## 9.6 الاعتراف بالإيراد

```prisma
model RevenueContract {
  id, companyId, clientId, projectId?
  contractNo, signedAt
  totalPrice          Decimal
  currency, fxRateAtSigning
  agentOrPrincipal    AgentPrincipal  // agent | principal — مقفل
  vatTreatment        VatTreatment    // standard | zeroRated_export | exempt | outOfScope
  zeroRatingReason    String?
  evidenceFileKeys    String[]        // مستندات إثبات المعدل الصفري
  status              ContractStatus
}

model PerformanceObligation {
  id, contractId
  description
  allocatedPrice      Decimal
  recognitionMethod   RecognitionMethod // overTime_costToCost | overTime_output | overTime_straightLine | pointInTime
  estimatedTotalCost  Decimal?
  costIncurredToDate  Decimal   @default(0)
  recognizedToDate    Decimal   @default(0)
  billedToDate        Decimal   @default(0)
  completedAt         DateTime?
  isOnerous           Boolean   @default(false)
  onerousProvision    Decimal   @default(0)
}

model RecognitionRun {                // سجل كل دورة اعتراف
  id, obligationId, periodEnd
  percentComplete     Decimal
  recognizedThisPeriod Decimal
  costRecognizedThisPeriod Decimal
  journalId           String
  runBy, runAt
}

model BillingMilestone {
  id, obligationId, description, plannedDate, amount
  invoiceId           String?
  status              MilestoneStatus
}
```

## 9.7 مكتبة المحتوى والحقوق

```prisma
model ContentAsset {
  id, companyId, projectId?
  titleAr, titleEn
  contentType         ContentType     // feature|series|episode|short|documentary|commercial|music|podcast|animation
  parentAssetId       String?         // حلقة تنتمي لموسم
  deliveredAt         DateTime
  capitalizedCost     Decimal
  accumulatedAmortization Decimal  @default(0)
  accumulatedImpairment   Decimal  @default(0)
  ultimateRevenueEstimate Decimal
  ultimateRevenueAsOf     DateTime
  revenueToDate           Decimal  @default(0)
  amortizationPolicy  AmortPolicy     // individualFilmForecast | straightLine
  usefulLifeMonths    Int?            // للقسط الثابت
  saipRegistrationNo  String?
  status              ContentStatus   // active|fullyAmortized|impaired|disposed
}

model ContentAmortizationRun {
  id, contentAssetId, periodEnd
  revenueThisPeriod, euAtRunTime, amortizationRate, amortizationAmount
  journalId, runBy, runAt
}

model UltimateRevenueRevision {
  id, contentAssetId, revisedAt, revisedBy
  euBefore, euAfter, reason, supportingFileKey
}

model RightsRecord {                  // من يملك ماذا
  id, contentAssetId
  rightType           RightType       // copyright|distribution|adaptation|music|imageRights
  holderType          HolderType      // company|thirdParty|shared
  holderId            String?
  sharePercent        Decimal?
  territory           String[]
  validFrom, validUntil
  contractFileKey     String?
}

model ParticipationAgreement {
  id, contentAssetId, beneficiaryId
  roleType            String          // writer|director|composer|leadActor|producer|financier
  basis               ParticipationBasis // grossRevenue|netProfit|fixedPerUnit|flatFee
  rate                Decimal
  thresholdAmount     Decimal?        // لا يستحق قبل تجاوز مبلغ
  cap                 Decimal?
  accruedToDate, paidToDate  Decimal
  isNonResident       Boolean
  whtCategory, whtRate
}

model LicenseWindow {
  id, contentAssetId
  direction           WindowDirection // inbound (اشترينا) | outbound (بعنا)
  counterpartyId      String
  territory           String[]
  mediaType           String[]        // theatrical|tv|svod|avod|est|airline
  exclusivity         Boolean
  startDate, endDate
  licenseFee          Decimal
  currency, fxRate
  recognitionMethod   RecognitionMethod
  contractFileKey     String?
}
```

## 9.8 الضرائب والحوافز

```prisma
model WhtRateTable {
  id
  category            String          // royalty|technicalService|managementFee|dividend|interest|rentMovable|airFreight|telecom|other
  nameAr, nameEn
  rate                Decimal
  effectiveFrom, effectiveTo
  sourceReference     String          // مرجع النص النظامي
  verifiedAt, verifiedBy
}

model TaxTreatyRate {
  id, countryCode, category
  cappedRate          Decimal
  conditions          String?
  effectiveFrom, effectiveTo, sourceReference
}

model WhtTransaction {
  id, companyId
  payeeType           PayeeType       // contractor|vendor|participant|other
  payeeId             String
  payeeCountry        String
  paymentDate         DateTime
  grossAmount         Decimal
  currency, fxRate
  grossAmountSar      Decimal
  category            String
  statutoryRate       Decimal
  treatyApplied       Boolean
  treatyRate          Decimal?
  trcFileKey          String?
  appliedRate         Decimal
  whtAmount, whtAmountSar, netPaid  Decimal
  isGrossedUp         Boolean
  returnPeriod        String          // "2026-09"
  returnId            String?
  certificateNo       String?
  certificateIssuedAt DateTime?
  sourceDocType, sourceDocId
}

model WhtReturn {
  id, companyId, period
  totalGross, totalWht  Decimal
  dueDate             DateTime        // اليوم العاشر من الشهر التالي
  filedAt, paidAt
  referenceNo         String?
  status              ReturnStatus
}

model IncentiveClaim {
  id, companyId, projectId
  program             IncentiveProgram // filmCommission|filmAlUla|neom|other
  applicationNo       String?
  preApprovalSignedAt DateTime?       // إلزامي قبل بدء التصوير
  agreementFileKey    String?
  minimumSpendRequired Decimal
  eligibleSpendToDate  Decimal
  rebateRate          Decimal
  expectedAmount      Decimal
  recognitionPolicy   GrantPolicy     // costReduction | deferredGrantIncome
  auditSubmittedAt, approvedAt
  approvedAmount, receivedAmount  Decimal?
  receivedAt          DateTime?
  status              ClaimStatus
}

model LicenseRegistry {
  id, companyId
  authority           String          // GAMR|MOC_Film|SAIP|MHRSD|Municipality
  licenseType         String
  licenseNo           String
  scope               String?
  issuedAt, expiresAt
  fileKey             String?
  blocksOnExpiry      Boolean  @default(false)
  blockedOperations   String[]        // ["createProject","issueInvoice"]
  reminderDaysBefore  Int      @default(60)
}
```

## 9.9 الأصول والحجوزات

```prisma
model FixedAsset {
  id, companyId, assetTag, nameAr, category
  acquisitionDate, acquisitionCost, currency, fxRate
  usefulLifeMonths, residualValue
  depreciationMethod  DepMethod
  accumulatedDepreciation
  internalRechargeRatePerDay  Decimal?  // لإعادة التحميل على المشاريع
  serialNumber, location, status
}

model BookableResource {
  id, companyId
  resourceType        ResourceType    // studio|equipment|crew|vehicle
  fixedAssetId        String?
  nameAr, capacity
  isActive
}

model RateCard {
  id, resourceId
  unit                RateUnit        // hour|halfDay|day|week|month
  price               Decimal
  minimumUnits        Int
  effectiveFrom, effectiveTo
}

model Booking {
  id, companyId, resourceId
  clientId?, projectId?
  startAt, endAt
  quotedAmount, depositAmount
  status              BookingStatus   // tentative|confirmed|inUse|returned|cancelled|noShow
  invoiceId?, depositRefundedAt
  conditionOutNotes, conditionInNotes
}
```

## 9.10 المنصات الرقمية

```prisma
model DigitalPlatformAccount {
  id, companyId
  platform            String          // youtube|tiktok|meta|snapchat|x|twitch|spotify
  accountHandle       String
  payoutCurrency      String
  payoutEntityCountry String          // بلد الكيان الدافع — حاسم للمعالجة الضريبية
  vatTreatment        VatTreatment
}

model PlatformStatement {
  id, platformAccountId, periodStart, periodEnd
  grossRevenue, platformFee, taxWithheldAtSource, netPayout
  currency, fxRateAtPayout
  statementFileKey
  reconciledAt, journalId
}
```

---

# 10. محرك الأبعاد المحاسبية

## 10.1 لماذا نظام أبعاد وليس حقل مشروع

الخيار الساذج: إضافة `projectId` إلى `JournalLine`. يعمل — إلى أن يطلب أول عميل تقريراً بمركز التكلفة أو بالقسم أو بالفرع. عندها يجب إضافة حقل ثانٍ، ثم ثالث، وكل تقرير كُتب سابقاً يحتاج إعادة كتابة.

**التوصية القاطعة: نظام أبعاد عام من أول migration.** الجهد الإضافي ~30%، والمكسب أن قطاعات المقاولات والاستشارات والصيانة تصبح متاحة بلا إعادة هندسة.

## 10.2 قواعد الإلزام

بُعد المشروع لا يكون إلزامياً على كل قيد — بل مشروطاً بنوع الحساب:

| نوع الحساب | إلزامية بُعد المشروع |
|---|---|
| WIP (1350) | **إلزامي** |
| تكلفة الإيراد (51xx) | **إلزامي** |
| إيراد المشاريع (4100) | **إلزامي** |
| مصروفات إدارية (53xx) | اختياري |
| نقدية، ذمم، ضرائب | ممنوع |

القاعدة تُخزَّن في `Dimension.appliesTo` وتُفحص في طبقة التحقق قبل الترحيل — لا في واجهة المستخدم فقط.

## 10.3 أثر أمان المستأجر

إضافة `JournalLineDimension` تعني جدولاً جديداً محدد النطاق بالمستأجر. يجب:
1. إضافته إلى `TENANT_SCOPED_MODELS` في `tenant-scope.extension.ts`
2. إضافة `ENABLE/FORCE ROW LEVEL SECURITY` + `CREATE POLICY` في الـ migration

بحسب النمط الموثّق في `README.md`. هذا ينطبق على **كل** كيان جديد في هذه المواصفة.

---

# 11. محرك المشاريع وتكاليف الوظائف

## 11.1 دورة حياة المشروع

```
development ──► greenlit ──► preProduction ──► production ──► post ──► delivered ──► archived
      │                                                                    
      └──────────────────────► cancelled ◄──────────────────────────────────
```

**قواعد الانتقال المحاسبية:**

| الانتقال | الأثر المحاسبي |
|---|---|
| → development | التكاليف إلى 1355 (تطوير) — قابلة للشطب |
| development → greenlit | نقل رصيد 1355 إلى 1350 (WIP) |
| development → cancelled | شطب كامل رصيد 1355 إلى 5450 |
| → preProduction/production/post | كل الشراء المرتبط يذهب إلى 1350 |
| → delivered (workForHire) | نقل 1350 إلى 5100 بالتوازي مع الاعتراف بالإيراد |
| → delivered (ownedIP) | نقل 1350 إلى 1700 (رسملة) |
| → delivered (coProduction) | نقل بنسبة الحصة إلى 1700، والباقي تسوية مع الشريك |
| → cancelled بعد greenlit | شطب رصيد 1350 إلى 5450 مع اختبار قابلية الاسترداد |

## 11.2 قاعدة إلزامية

لا يُسمح بترحيل أي مستند إلى مشروع في حالة `delivered` أو `archived` أو `cancelled` دون صلاحية خاصة وسبب مكتوب. هذا يمنع تلوث تكلفة مشروع مُغلق بمصروفات لاحقة — وهو خطأ شائع يدمّر تقارير الربحية التاريخية.

## 11.3 التحميل غير المباشر (Overhead Allocation)

بعض الشركات تحمّل نسبة من المصروفات الإدارية على المشاريع. يُدعم كخيار قابل للتعطيل:

- الأساس: نسبة من التكلفة المباشرة، أو معدل بالساعة، أو نسبة ثابتة
- **قيد التحميل يمر عبر حساب مقاصة (5910)** ولا يُنشئ إيراداً وهمياً
- ⚠️ **التكلفة غير المباشرة عادةً غير مؤهلة للحافز** — يجب فصلها بعلم `incentiveEligible = false`

---

# 12. محرك الميزانية / الالتزام / الفعلي وتقرير التكلفة

## 12.1 المعادلة الحاكمة

```
المتاح = الميزانية الحالية − الفعلي − المرتبط غير المستهلك
التقدير عند الإكمال (EAC) = الفعلي + المرتبط غير المستهلك + المتبقي المقدّر
الانحراف = الميزانية الحالية − EAC
```

**"المرتبط" هو الرقم الذي تخطئ فيه كل الأنظمة العامة.** مدير الإنتاج الذي وقّع عقد إيجار كاميرات بـ 400,000 ريال لم يدفع شيئاً بعد، لكن الميزانية استُهلكت فعلياً. النظام الذي يعرض "الفعلي" فقط يُظهر ميزانية سليمة حتى الشهر الأخير.

## 12.2 تقرير التكلفة (Cost Report)

التقرير المعياري الأسبوعي. الأعمدة إلزامية بهذا الترتيب:

| كود | البند | الميزانية الأصلية | الميزانية الحالية | الفعلي | المرتبط | الإجمالي المستهلك | المتبقي المقدّر | EAC | الانحراف |
|---|---|---|---|---|---|---|---|---|---|

مع تجميع على مستوى: القسم (ATL/BTL/Post/Other) ← المجموعة ← الكود.

**متطلبات إلزامية:**
- تصدير إلى Excel بتنسيق قابل للتسليم لجهة التمويل
- لقطة (snapshot) محفوظة أسبوعياً غير قابلة للتعديل — لأن الممولين يقارنون التقارير المتتابعة
- تمييز بصري للانحراف السالب > 5% وللبنود التي تجاوزت 100%
- عمود اختياري: النفقات المؤهلة للحافز فقط

## 12.3 تعديلات الميزانية

تعديل الميزانية حدث موثّق لا تحرير حقل:
- كل تعديل يُنشئ نسخة جديدة (`version`) مع سبب واعتماد
- الميزانية الأصلية (`budgetOriginal`) لا تتغير أبداً
- تقرير مقارنة النسخ متاح

---

# 13. محرك الأعمال تحت التنفيذ والرسملة

## 13.1 مصادر التغذية

| المصدر | الحساب المدين |
|---|---|
| فاتورة شراء مرتبطة بمشروع | 1350 بالمشروع وكود التكلفة |
| كشف أيام طاقم معتمد | 1350 |
| رواتب موظفين محمّلة | 1350 |
| تسوية عهدة نثرية | 1350 |
| إعادة تحميل إهلاك المعدات | 1350 |
| توزيع مصروف مدفوع مقدماً | 1350 |
| تحميل غير مباشر (إن فُعّل) | 1350 |

## 13.2 اختبار قابلية الاسترداد

في نهاية كل فترة، لكل مشروع نشط:

```
إذا كان (رصيد WIP + التكلفة المتبقية المقدّرة) > (الإيراد المتعاقد عليه + الإيراد المتوقع)
    → المشروع خاسر → قيد مخصص فوري بكامل الخسارة (ق-25)
```

هذا ليس اختياراً محاسبياً — هو مطلب معياري. وفي قطاع تجاوز الميزانية فيه هو القاعدة، يجب أن يُشغَّل آلياً لا يدوياً.

## 13.3 مشاريع التطوير (Development Slate)

المشاريع في مرحلة التطوير خاصة: أكثرها لن يُنتج أبداً. المعالجة:
- تُجمّع في 1355 منفصلاً عن 1350
- **مراجعة إلزامية كل 12 شهراً**: مشروع تطوير لم يتحرك سنة كاملة يُشطب أو يُبرَّر كتابةً
- تقرير "عمر مشاريع التطوير" ضمن التقارير الإلزامية

---

# 14. محرك الاعتراف بالإيراد (IFRS 15)

## 14.1 الخطوات الخمس مطبقة على الإنتاج

| الخطوة | التطبيق العملي |
|---|---|
| 1. تحديد العقد | `RevenueContract` — بتاريخ توقيع وسعر إجمالي |
| 2. تحديد التزامات الأداء | فيلم واحد = التزام واحد غالباً؛ لكن "إنتاج + حملة تسويقية + 12 مقطعاً قصيراً" = ثلاثة التزامات |
| 3. تحديد سعر المعاملة | يشمل المقابل المتغير (مكافآت الأداء، حوافز التسليم المبكر) بقيود |
| 4. توزيع السعر | بنسبة أسعار البيع المستقلة لكل التزام |
| 5. الاعتراف | عند (أو خلال) الوفاء بكل التزام |

## 14.2 اختيار الطريقة

**على مدى الزمن** إذا تحقق أحد الشروط — والأشيع في الإنتاج بالتكليف:
> العميل يسيطر على الأصل أثناء إنشائه، أو الأصل لا استخدام بديل له وللمنتج حق نافذ في الدفع مقابل ما أُنجز.

عقد إنتاج مسلسل لمنصة بمواصفات محددة، مع بنود دفع مرحلية وحق في التعويض عند الإلغاء ← **على مدى الزمن**.

**في نقطة زمنية:** ترخيص عمل جاهز، بيع محتوى مخزون، الإنتاج المملوك الذي يُباع بعد الإنجاز.

## 14.3 حساب نسبة الإنجاز (cost-to-cost)

```
نسبة الإنجاز = التكلفة المتكبدة حتى تاريخه ÷ إجمالي التكلفة المقدّرة
الإيراد التراكمي المستحق = سعر الالتزام × نسبة الإنجاز
إيراد الفترة = التراكمي المستحق − المعترف به سابقاً
```

**مصائد يجب برمجتها صراحةً:**

1. **التكاليف غير المعبّرة عن التقدم تُستبعد من البسط.** مثال: معدات اشتُريت ولم تُستخدم بعد، أو دفعة مقدمة لمورّد. تُستبعد من التكلفة المتكبدة وتُستبعد من التقدير الكلي معاً.
2. **إعادة تقدير التكلفة الكلية إلزامية شهرياً.** تغييرها يغيّر النسبة بأثر تراكمي في فترة التغيير (catch-up).
3. **النسبة لا تتجاوز 100%** ولا تتراجع دون سبب موثّق.
4. **الاعتراف يُجمّد** إذا صار العقد خاسراً — يُعترف بالإيراد ويُعترف فوراً بكامل الخسارة.

## 14.4 أصل العقد مقابل الذمم المدينة

هذا أكثر ما تخطئ فيه الأنظمة المحلية:

| | متى ينشأ | الطبيعة |
|---|---|---|
| **أصل العقد (1360)** | اعترفنا بالإيراد ولم نصدر فاتورة بعد | حق مشروط بإتمام أداء إضافي |
| **الذمم المدينة (1200)** | أصدرنا الفاتورة | حق غير مشروط في مبلغ نقدي |
| **التزام العقد (2300)** | قبضنا/فوترنا قبل الأداء | التزام بتقديم خدمة |

الفصل مطلوب في القوائم، ولا يجوز عرضها صافيةً إلا داخل العقد الواحد.

## 14.5 المقابل المتغير

في عقود الإعلام: مكافآت الأداء، حصص الأرباح، حوافز المشاهدات. القاعدة: يُدرج في سعر المعاملة **فقط بالقدر الذي يكون فيه من المرجّح جداً ألا يحدث انعكاس جوهري**. عملياً: لا يُعترف بحصص الأرباح المستقبلية إلا عند تأكدها.

---

# 15. محرك أصيل / وكيل

## 15.1 السؤال

وكالة تشتري مساحة إعلانية بـ 92,000 وتفوتر العميل 100,000. هل إيرادها 8,000 أم 100,000؟

## 15.2 الاختبار

**أصيل** إذا سيطرت الوكالة على الخدمة قبل تحويلها للعميل. المؤشرات:
- المسؤولية الأساسية عن الوفاء بالخدمة
- تحمّل مخاطر المخزون (شراء مساحة قبل بيعها)
- حرية تحديد السعر

**وكيل** إذا كان دورها الترتيب فقط.

## 15.3 لماذا هو قرار حاجب

| البند | صفة وكيل | صفة أصيل |
|---|---|---|
| الإيراد المعلن | 8,000 | 100,000 |
| هامش الربح المعلن | 100% | 8% |
| عتبة التسجيل الضريبي (375,000) | تُبلغ متأخراً | تُبلغ مبكراً |
| التصنيف القطاعي والتقييم | مختلف جذرياً | |

**القرار يُخزَّن على مستوى العقد** لأن الوكالة الواحدة قد تكون أصيلاً في عقد ووكيلاً في آخر. ويُقفل عند التوقيع.

## 15.4 نفس المنطق ينطبق على

- **صانع المحتوى مع شبكة MCN** — هل الشبكة أصيل أم وكيل في إيراد المنصة؟
- **موزّع الأفلام** — هل يشتري الحقوق (أصيل) أم يوزّع بعمولة (وكيل)؟
- **خدمات الإنتاج** — هل يُعيد فوترة التكاليف بهامش (أصيل) أم يحصّل عمولة إدارة (وكيل)؟

---

# 16. محرك الطاقم والمتعاقدين المستقلين

## 16.1 لماذا لا يمكن دمجه في محرك الرواتب

| | موظف | متعاقد طاقم |
|---|---|---|
| العقد | غير محدد/محدد المدة، مسجّل في قوى | لمشروع واحد |
| الأجر | شهري | باليوم |
| التأمينات | إلزامية | اختيارية (لحامل وثيقة العمل الحر) |
| نهاية الخدمة | مستحقة | لا |
| الإجازات | رصيد متراكم | لا |
| حماية الأجور (WPS) | إلزامي | لا ينطبق |
| نطاقات | يُحتسب | **لا يُحتسب** |
| الفاتورة | لا | قد يصدر فاتورة ضريبية |
| الاستقطاع | لا (للمقيم) | نعم إن كان غير مقيم |

دمجهما في كيان واحد يُنتج التزامات وهمية بمكافآت نهاية خدمة على متعاقدي يوم واحد، وهو خطأ يظهر بعد سنوات في صورة رقم ضخم لا أساس له.

## 16.2 عناصر أجر اليوم الأربعة

> **درس مستعار مباشرة من قاعدة "سلال الأجر الخمس" في مواصفة الموارد البشرية.** كما أن الأجر الشهري ليس رقماً واحداً، فإن أجر اليوم ليس رقماً واحداً.

| العنصر | الطبيعة | المعالجة الضريبية | مؤهل للحافز؟ |
|---|---|---|---|
| **الأجر الأساسي اليومي** | مقابل عمل | خاضع للاستقطاع إن كان غير مقيم | نعم (أجور الطاقم) |
| **الوقت الإضافي** | بعد 12 ساعة عادةً بمعامل 1.5 | مثل الأساسي | نعم |
| **بدل المعدات (kit fee)** | مقابل **إيجار منقولات** لا مقابل عمل | فئة استقطاع مختلفة | نعم (ضمن إيجار المعدات) |
| **البدل اليومي (per diem)** | تعويض إعاشة | معالجة مختلفة | نعم (إقامة وسفر) |

خلطها في رقم واحد يُنتج ثلاثة أخطاء متزامنة: فئة استقطاع خاطئة، وتصنيف تكلفة خاطئ، ومطالبة حافز غير دقيقة.

## 16.3 كشف الأيام (Timesheet)

- المصدر: ورقة النداء اليومية (call sheet)
- الاعتماد إلزامي من مدير الإنتاج قبل الترحيل
- **قاعدة صارمة:** لا يُرحَّل كشف أيام بلا `CrewEngagement` موقّع ومعتمد. هذا يمنع الدفع بلا تعاقد — وهو أكبر ثغرة رقابية في الإنتاج الميداني.
- الترحيل التلقائي إلى WIP بكود التكلفة المرتبط بالدور

## 16.4 مؤشر خطر إعادة التصنيف

النظام يحسب لكل متعاقد `engagementDaysYTD`. عند تجاوز عتبة قابلة للتكوين (افتراضياً 120 يوماً لدى نفس المنشأة خلال 12 شهراً) يظهر تنبيه:

> "تجاوز عدد أيام ارتباط هذا المتعاقد الحد المُعرَّف. راجع طبيعة العلاقة مع مستشار قانوني — قد ترقى إلى علاقة عمل."

النظام **ينبّه ولا يقرر**. القرار قانوني.

---

# 17. محرك العهد النثرية الميدانية

## 17.1 المشكلة

مدير موقع يستلم 50,000 ريال نقداً، ينفقها على مدى ثلاثة أسابيع على 80 مصروفاً صغيراً: نقل، وجبات، إكسسوارات، أجور كومبارس نقدية، رسوم مواقع. كثير منها بلا فاتورة ضريبية.

هذه هي **أكبر نقطة تسرّب مستندي** في الإنتاج، وأخطر بند في تدقيق الحافز.

## 17.2 التصميم

1. **صرف العهدة** → حساب 1250 فرعي باسم المسؤول (ق-10)
2. **تسجيل المصروفات** — كل مصروف بكود تكلفة وصورة إيصال إلزامية وعلم `hasValidTaxInvoice`
3. **التسوية** — ترحيل جماعي إلى WIP، مع فصل:
   - المصروفات بفاتورة ضريبية صالحة → ضريبة المدخلات قابلة للخصم
   - المصروفات بلا فاتورة صالحة → 5410، **لا خصم للمدخلات**
4. **إقفال العهدة** — الرصيد يُعاد نقداً أو يُرحَّل لعهدة جديدة

## 17.3 ضوابط رقابية إلزامية

- حد أقصى للعهدة الواحدة قابل للتكوين
- **لا تُصرف عهدة جديدة لمن لديه عهدة مفتوحة تجاوزت مدة محددة**
- تقرير أعمار العهد المفتوحة
- كل مصروف نقدي فوق حد معيّن يتطلب اعتماداً إضافياً
- صورة الإيصال إلزامية — بدونها لا يُرحَّل المصروف

---

# 18. محرك ضريبة الاستقطاع

## 18.1 متى ينطبق

على المدفوعات من مقيم سعودي (أو منشأة دائمة) إلى **غير مقيم** مقابل دخل من مصدر سعودي. المبدأ مصدري: الدخل يُضرَّب في المملكة لأن الخدمة أو الحق مرتبط بالمملكة.

## 18.2 المعدلات النظامية

| الفئة | المعدل | أمثلة في هذا القطاع |
|---|---|---|
| إتاوات ورسوم ترخيص | **15%** | ترخيص موسيقى، حقوق اقتباس، مكتبات لقطات، حقوق صورة، برمجيات (بحسب الحالة) |
| خدمات فنية واستشارية | **5%** | مؤثرات بصرية، مونتاج خارجي، تصحيح ألوان، استشارة إخراجية |
| أتعاب إدارية | **20%** | إشراف إداري عام، أتعاب مكتب رئيسي |
| إيجار منقولات | فئة منفصلة | إيجار كاميرات من شركة أجنبية، بدل معدات لفني أجنبي |
| توزيعات أرباح وفوائد | 5% | تمويل الإنتاج |
| شحن جوي وبحري | 5% | شحن المعدات |
| اتصالات دولية | فئة منفصلة | البث والنقل |
| أخرى | حسب النص | |

> ⚠️ **المعدلات مأخوذة من مصادر مهنية متعددة متسقة (PwC، DLA Piper، وغيرها). يجب مطابقتها بالنص النظامي للمادة 68 من نظام ضريبة الدخل ولائحته التنفيذية قبل إدخالها في `WhtRateTable`.**

## 18.3 التصنيف — أخطر جزء

الفرق بين 5% و15% على عقد بمليون ريال هو 100,000 ريال. والهيئة تنظر إلى **الجوهر الاقتصادي لا عنوان الفاتورة**.

**قواعد تمييز يجب أن تكون في واجهة المستخدم كمساعد اختيار:**

| السؤال | إذا نعم |
|---|---|
| هل الدفعة مقابل **حق استخدام** ملكية فكرية أو حقوق مؤلف أو خبرة فنية؟ | إتاوة — 15% |
| هل الدفعة مقابل **أداء عمل محدد بمخرج قابل للتسليم** بمعرفة فنيين؟ | خدمة فنية — 5% |
| هل الدفعة مقابل **إشراف إداري عام** بلا مخرج محدد؟ | أتعاب إدارية — 20% |
| هل الدفعة مقابل **استخدام أصل منقول**؟ | إيجار منقولات |

**حالات ملتبسة يجب توثيقها كأسئلة للمستشار (القسم 38):**
- ممثل أجنبي يؤدي داخل المملكة، والعقد يتضمن تنازلاً عن حقوق الصورة ← خدمة أم إتاوة أم مختلط؟
- اشتراك برمجي سحابي — أصدرت الهيئة دليلاً خاصاً بمدفوعات البرمجيات في يناير 2024 بأمثلة مفصّلة
- مدفوعات إعلانات جوجل وميتا

## 18.4 الاتفاقيات الضريبية

المملكة طرف في شبكة واسعة من اتفاقيات تجنب الازدواج الضريبي. الاستفادة **ليست تلقائية**:
- تُشترط **شهادة إقامة ضريبية (TRC)** سارية من بلد المستفيد
- تُشترط شروط الملكية النفعية والجوهر
- الهيئة تتيح خيار **التطبيق التلقائي للمعدل المخفّض عند السداد** (بدلاً من الاسترداد لاحقاً) بشرط الإفصاح الكامل عن تفاصيل كل دفعة في الإقرار الشهري

**متطلب تقني:** رفع TRC كمرفق إلزامي قبل السماح بتطبيق معدل اتفاقية، مع فحص تاريخ الصلاحية.

## 18.5 الإجمالي مقابل الخصم

| السيناريو | الحساب |
|---|---|
| **العقد بالإجمالي** (الشائع نظامياً) | 100,000 مستحقة → يُحوَّل 85,000 ويُورَّد 15,000 |
| **العقد بالصافي** (gross-up) | يُطلب استلام 100,000 صافية → الإجمالي = 100,000 ÷ 0.85 = 117,647؛ يُحوَّل 100,000 ويُورَّد 17,647 |

الفرق: **التكلفة الحقيقية للشركة ترتفع 17.6%**. لذلك يجب أن يكون هذا حقلاً على العقد يُقفل عند التوقيع، وأن يُعرض أثره على الميزانية **قبل** التوقيع لا بعده.

## 18.6 الإقرار والسداد

- **دورية شهرية**
- **الاستحقاق: خلال العشرة أيام الأولى من الشهر التالي**
- إصدار شهادة استقطاع للمستفيد غير المقيم (يحتاجها لخصم ضريبي في بلده)
- **متطلب تقني:** تنبيه تلقائي يوم 1 و5 و8 من كل شهر عند وجود معاملات غير مُقرّة، وحجب إقفال الفترة المحاسبية حتى تسجيل الإقرار

## 18.7 تقرير التسوية

تقرير شهري يطابق: مجموع `WhtTransaction` للفترة ← رصيد حساب 2250 ← المبلغ المسدد فعلياً. أي فرق يُعرض صراحةً.

---

# 19. محرك تعدد العملات

## 19.1 التصميم

- **العملة الوظيفية:** الريال السعودي دائماً (لعميل سعودي)
- كل سطر مستند وكل سطر قيد يحمل: `currency`, `fxRate`, `amountOriginal`, `amountSar`
- مصدر السعر: يدوي، أو جدول أسعار يومي، أو تكامل (مؤجل)

## 19.2 نقاط الاعتراف بالفروق

| الحدث | المعالجة |
|---|---|
| نشأة المعاملة | بسعر تاريخ المعاملة |
| السداد/التحصيل | فرق محقق → 5800 أو إيراد فروق |
| نهاية الفترة — بنود نقدية (نقدية، ذمم، التزامات) | إعادة تقييم → فرق غير محقق |
| نهاية الفترة — بنود غير نقدية (WIP، أصول محتوى، مقدمات) | **لا تُعاد ترجمتها** — تبقى بسعرها التاريخي |

النقطة الأخيرة مصدر خطأ شائع: تُعاد ترجمة رصيد WIP كل شهر فتتذبذب تكلفة المشروع بلا سبب اقتصادي.

## 19.3 حالة المنصات الرقمية

بيان AdSense يصل بالدولار عن شهر كامل. المعالجة السليمة:
- الإيراد يُعترف به بسعر متوسط الفترة أو سعر تاريخ البيان (سياسة ثابتة)
- التحصيل يقع بعد 20–30 يوماً بسعر مختلف → فرق محقق
- **الضريبة المستقطعة من المنصة نفسها** (بعض المنصات تستقطع ضريبة أمريكية على مشاهدات أمريكية) تُسجَّل كبند منفصل وقد تكون قابلة للخصم من الضريبة في المملكة — **سؤال للمستشار**

---

# 20. الأصول الثابتة والحجوزات والتأجير

## 20.1 الأصول الثابتة

معدات الإنتاج عالية القيمة وسريعة التقادم. المتطلبات:
- عمر إنتاجي قابل للتكوين لكل فئة (كاميرات ~4 سنوات، عدسات ~8، إضاءة ~6، حواسيب ~3 — إرشادي)
- طرق إهلاك متعددة
- **معدل إعادة التحميل اليومي** لكل أصل — لتحميل تكلفته على المشاريع
- تتبع الأرقام التسلسلية والموقع والحالة
- التخلص والبيع مع احتساب الربح/الخسارة

## 20.2 محرك الحجوزات

- تقويم لكل مورد قابل للحجز (استوديو، كاميرا، طاقم، مركبة)
- **منع التعارض إلزامي** على مستوى قاعدة البيانات لا الواجهة
- قوائم أسعار متدرجة بتاريخ نفاذ: ساعة / نصف يوم / يوم / أسبوع / شهر
- حجز مبدئي بمدة صلاحية ثم تأكيد
- **الوديعة التأمينية = التزام (2400) لا إيراد** — خطأ شائع
- توثيق حالة المعدة عند الخروج والعودة بالصور
- سياسة الإلغاء والغياب

## 20.3 مؤشرات الإشغال

| المؤشر | الحساب |
|---|---|
| نسبة الإشغال | الساعات المحجوزة ÷ الساعات المتاحة |
| الإيراد لكل أصل | إيراد الفترة ÷ الأصل |
| العائد على الأصل | (الإيراد − الإهلاك − الصيانة) ÷ التكلفة الدفترية |
| نقطة التعادل للأصل | التكلفة ÷ صافي الإيراد اليومي |

المؤشر الأخير هو ما يستخدمه صاحب الاستوديو لقرار "أشتري الكاميرا أم أستأجرها؟" — وهو أعلى قيمة يقدمها النظام لهذا النموذج.

## 20.4 عقود الإيجار (IFRS 16)

عقد إيجار استوديو أو مستودع لمدة > 12 شهراً:
- إثبات حق استخدام أصل (1620) والتزام إيجار (2600)
- إهلاك حق الاستخدام + مصروف فوائد على الالتزام
- الإعفاءات: عقود قصيرة الأجل (≤12 شهراً) والأصول منخفضة القيمة تبقى مصروفاً — وهذا يغطي أغلب إيجارات المواقع اليومية في الإنتاج

---

# 21. مكتبة المحتوى ومحرك الإطفاء

## 21.1 الإطار المعياري

**لا يوجد معيار IFRS مخصص للأفلام.** المعايير الأمريكية (ASC 926) تعالج الموضوع صراحةً، لكن تحت المعايير الدولية تُعالج تكاليف الإنتاج إما كمخزون (IAS 2) أو كأصل غير ملموس (IAS 38) بحسب نموذج العمل.

الممارسة الدولية السائدة — ومنها ما تفعله كبرى الشركات — هي **رسملة تكلفة إنتاج الأفلام والأعمال الإبداعية وإطفاؤها على مدى فترة المنفعة المتوقعة**. مرجع مهني أساسي: ورقة PwC MIAG رقم 10 حول رسملة وإطفاء واضمحلال تكاليف الأفلام.

**التصميم الموصى به (تطبيق المبدأ م-3):** يُبنى `ContentAsset` محايداً عن التصنيف، بجدول إطفاء مدفوع بالفترات، وحقل `classification` يحدد العرض في القوائم فقط. هذا يسمح بتغيير السياسة المحاسبية دون تغيير السكيما.

## 21.2 طريقة تنبؤ الإيراد الفردي

```
معدل الإطفاء للفترة = إيراد الفترة من هذا العمل ÷ الإيراد النهائي المقدّر (EU)
إطفاء الفترة = التكلفة المرسملة الصافية × معدل الإطفاء
```

**مثال كامل:**

| البند | القيمة |
|---|---|
| التكلفة المرسملة | 10,000,000 |
| EU عند التسليم | 25,000,000 |
| إيراد السنة الأولى | 12,000,000 |
| معدل الإطفاء | 12 ÷ 25 = 48% |
| إطفاء السنة الأولى | 4,800,000 |
| القيمة الدفترية | 5,200,000 |

في السنة الثانية، وبعد أداء أضعف من المتوقع، يُخفَّض EU إلى 18,000,000:

| البند | القيمة |
|---|---|
| الإيراد المتبقي المتوقع | 18,000,000 − 12,000,000 = 6,000,000 |
| إيراد السنة الثانية | 4,000,000 |
| معدل الإطفاء | 4 ÷ 6 = 66.7% |
| إطفاء السنة الثانية | 5,200,000 × 66.7% = 3,467,000 |

## 21.3 تقدير الإيراد النهائي — أخطر حكم في المحاسبة الإعلامية

**المبالغة في EU تؤجّل الإطفاء وتضخّم قيمة الأصل والأرباح.** هذا ليس خطأً نظرياً — هو نمط تلاعب معروف في الصناعة.

**ضوابط إلزامية في النظام:**
1. EU يُخزَّن مع **تاريخ التقدير** ومن قدّره
2. **مراجعة إجبارية كل ربع سنة** — النظام يحجب إقفال الربع إذا وُجد أصل محتوى نشط لم يُراجع EU له
3. كل تعديل يُوثَّق في `UltimateRevenueRevision` بسبب ومستند داعم
4. **تقرير الفعلي مقابل التقدير** لكل عمل — يقيس دقة التقديرات تاريخياً، وهو ما يطلبه المدقق أول شيء
5. تنبيه تلقائي إذا كان الإيراد الفعلي في أول 90 يوماً أقل من 60% من المتوقع لتلك الفترة
6. التعديل **بأثر مستقبلي فقط** — لا تُعدَّل الفترات السابقة

## 21.4 الاضمحلال

اختبار عند وجود مؤشر — وأداء ضعيف مبكر مؤشر واضح. المقارنة: القيمة الدفترية مقابل القيمة القابلة للاسترداد (القيمة الحالية للتدفقات المتبقية المتوقعة).

## 21.5 الهيكل الهرمي

مسلسل من 3 مواسم × 10 حلقات: هل الأصل هو المسلسل أم الموسم أم الحلقة؟
- **التوصية:** الأصل على مستوى **الموسم** افتراضياً، مع دعم الهيكل الهرمي عبر `parentAssetId`
- السبب: الإيراد يُباع ويُرخَّص بالموسم عادةً، والحلقة وحدة صغيرة جداً لتقدير EU لها معنى

---

# 22. الحقوق والمشاركات ونوافذ الترخيص

## 22.1 سجل الحقوق

**لا يجوز افتراض أن الشركة تملك كامل الحقوق لمجرد أنها دفعت التكاليف.**

اعتمدت الهيئة السعودية للملكية الفكرية حزمة تنظيمية محدّثة تشمل اللائحة التنفيذية المحدّثة لنظام حقوق المؤلف وقواعد تسوية المخالفات، ومن أبرز ما نظّمته:
- **حقوق المساهمين في المصنفات السمعية البصرية** تحديداً: كتّاب السيناريو، والمخرجون، ومؤلفو الموسيقى التصويرية
- ضوابط توزيع ملكية الحقوق **بين المؤلف وصاحب العمل** في المصنفات التي يبتكرها العاملون أثناء أداء أعمالهم
- أحكام المصنفات الجماعية
- حماية دائمة لتعبيرات التراث الثقافي السعودي (الحكايات والأشعار والأغاني والرقصات التقليدية والأعمال الحرفية) مع حظر تحريفها أو استغلالها بما يمس قيمتها

**الأثر التقني:** كيان `RightsRecord` إلزامي لكل `ContentAsset`، يوضّح لكل نوع حق: مملوك بالكامل / مرخّص لمدة / مشترك بنسبة، مع النطاق الجغرافي والمدة والمستند.

⚠️ **النص الكامل للائحة المحدّثة لم يُقرأ في هذا البحث. مراجعة مباشرة من `saip.gov.sa` مطلوبة قبل تصميم نهائي لهذا الكيان.**

## 22.2 المشاركات (Participations)

نصيب مستمر من الإيراد لمساهم في العمل.

**أنواع الأساس:**

| الأساس | الوصف | تعقيد الحساب |
|---|---|---|
| نسبة من الإيراد الإجمالي | الأبسط والأوضح | منخفض |
| نسبة من صافي الربح | يتطلب تعريفاً تعاقدياً دقيقاً لـ"الصافي" | **مرتفع جداً** |
| مبلغ ثابت لكل وحدة | لكل عرض/بيع | متوسط |
| مبلغ مقطوع | دفعة واحدة | منخفض |

> **تحذير تصميمي:** "صافي الربح" في عقود الإعلام مصطلح تعاقدي لا محاسبي، وتعريفه يختلف من عقد لآخر (هل تُخصم مصاريف التوزيع؟ الفوائد؟ رسوم الإشراف؟). **لا تحاول توحيده.** الحل: `ParticipationAgreement` يحمل قائمة بنود قابلة للخصم مُعرَّفة لكل اتفاقية.

**عتبة وسقف:** كثير من الاتفاقيات لا تستحق قبل تجاوز الإيراد لمبلغ معين (استرداد التكلفة أولاً)، وقد يكون لها سقف أعلى. كلاهما حقل إلزامي.

**الاستحقاق:** يُحتسب آلياً عند كل اعتراف بإيراد من العمل، ويُرحَّل إلى 5120 / 2450.

## 22.3 نوافذ الترخيص

نافذة = (عمل) × (نطاق جغرافي) × (نوع وسيط) × (فترة زمنية) × (حصرية).

**متطلبات:**
- **منع التعارض:** لا يجوز بيع حق حصري متداخل في نفس النطاق والوسيط والفترة. تحقق إلزامي عند إنشاء نافذة صادرة.
- تتبع النوافذ الواردة (حقوق اشتريناها) — للموزّعين، وتُطفأ على مدى النافذة
- تنبيه انتهاء النافذة قبل 90 يوماً
- تقرير "الحقوق المتاحة للبيع" — أي نطاقات وأوسطة ما زالت غير مباعة

---

# 23. محرك حوافز هيئة الأفلام

## 23.1 المعطيات المؤكدة

**السقف:** أُعلن في مايو 2026 خلال مهرجان كان **رفع الحافز من 40% إلى ما يصل إلى 60% من النفقات المؤهلة**، ضمن تحديث شامل يشمل تحسين وتسريع إجراءات الصرف، وإطلاق **دليل إجراءات التدقيق المالي والصرف**، بالتعاون مع جهات وطنية أبرزها صندوق التنمية الثقافي.

**الأهلية:** البرنامج متاح لشركات الإنتاج المحلية والدولية (بكيان محلي أو شريك سعودي). **الشركات الحكومية وشبه الحكومية والكيانات المملوكة للدولة غير مؤهلة.**

**الشروط الأساسية:**
1. أن تكون شركة إنتاج مسجّلة ومرخّصة في المملكة، أو لديها اتفاقية إنتاج مشترك رسمية مع شركة مرخّصة
2. الحصول على شهادة عدم ممانعة للتصوير (NOC)
3. استكمال نموذج الطلب والحصول على الموافقات
4. استيفاء الحد الأدنى للإنفاق المؤهل
5. إثبات الدعم المالي للمشروع
6. **الموافقة المسبقة بتوقيع اتفاقية الحافز إلزامية قبل بدء التصوير**

**الحد الأدنى للإنفاق المؤهل:**

| نوع العمل | الحد الأدنى |
|---|---|
| الأفلام الروائية الطويلة | 750,000 ريال (~200,000 دولار) |
| الأفلام الوثائقية الطويلة | 187,000 ريال (~50,000 دولار) |
| أفلام الرسوم المتحركة الطويلة | 187,000 ريال (~50,000 دولار) |

**الحد الأدنى لأيام التصوير:** 5 أيام بوحدة الإنتاج الرئيسية.

**التغطية:** الحافز يغطي مراحل الإنتاج وما بعد الإنتاج للمشاريع المقبولة، **بشرط إتمام عملية الإنتاج بالكامل**.

## 23.2 النفقات المؤهلة

**فوق الخط (ATL):**
- أتعاب المنتج (شاملة تكاليف حقوق النص)
- أتعاب المخرج (شاملة حقوق السيناريو)
- أتعاب أعضاء الطاقم الرئيسيين (الممثلون الرئيسيون، كاتب السيناريو الرئيسي)

**تحت الخط (BTL):**
- أجور طاقم الإنتاج والممثلين والكومبارس
- أجور طاقم تصميم الديكور والأزياء
- أجور طاقم المكياج وتصفيف الشعر والمؤثرات الخاصة

**نفقات أخرى مؤهلة:**
- رسوم ومصاريف إيجار مواقع التصوير والمعدات
- الخدمات المرتبطة بالإنتاج والخدمات المهنية
- الإنشاءات، بما فيها بناء مواقع التصوير
- الإقامة ومصاريف السفر (الداخلي والدولي إلى المدن السعودية)
- مصاريف ما بعد الإنتاج

**غير المؤهل:** كل ما عدا ذلك، **بما في ذلك كل النفقات المتكبدة خارج المملكة أو مع موردين خارج المملكة**، ما لم تنص الشروط على خلاف ذلك.

## 23.3 المستندات المطلوبة للتقديم

السجل التجاري السعودي · ترخيص الإنتاج الإعلامي المرئي والمسموع من هيئة الأفلام · فسح محتوى النص من هيئة الأفلام · شهادة عدم ممانعة للتصوير · **إثبات ملكية حقوق المؤلف أو اتفاقية ترخيص أو عقد تنازل** · ملف أعمال الشركة السابقة (وشركة الإنتاج المشترك إن وُجدت) · السير الذاتية للمنتج والمخرج والكاتب · الميزانية التقديرية (بالنموذج المقدَّم) · إثبات الدعم المالي · لوحة المزاج (Mood Board) · قائمة الممثلين والطاقم · النص بالعربية والإنجليزية · معالجة الفيلم (اللوغلاين والملخص والمعالجة) · جدول الإنتاج (بالنموذج المقدَّم) · رؤية المخرج

## 23.4 الأثر على التصميم

**متطلب 1 — التعليم من اليوم الأول.**
كل سطر تكلفة يحمل: `incentiveEligible` (موروث من كود التكلفة، قابل للتجاوز) + بلد المورّد + مكان أداء الخدمة. محاولة استخراج النفقات المؤهلة لاحقاً تعني إعادة تصنيف يدوية لآلاف السطور تحت ضغط موعد التدقيق.

**متطلب 2 — حاجز الموافقة المسبقة.**
النظام يعرض تحذيراً واضحاً عند تعليم مشروع كمؤهل للحافز دون تسجيل `preApprovalSignedAt`، وعند الانتقال إلى حالة `production` قبل توقيع اتفاقية الحافز.

**متطلب 3 — تقرير المطالبة.**
تقرير مخصص بشكل يقبله التدقيق المالي المستقل: النفقات المؤهلة مصنّفة بالبنود المعتمدة، مع رابط لكل مستند داعم، والحد الأدنى للإنفاق وأيام التصوير محسوبين آلياً.

**متطلب 4 — تتبع الفرق.**
الفرق بين المطالب به والمعتمد يُعالج في نفس الحساب الذي سُجّل فيه أصلاً — إن كانت السياسة تخفيض التكلفة، يُعاد الفرق إلى WIP أو تكلفة الإيراد.

## 23.5 البرامج الموازية

- **فيلم العلا (Film AlUla)** — يسهّل التقديم عند التصوير في العلا
- **نيوم** — برنامج حافز نقدي منفصل، متاح للأفلام وجميع أشكال الإنتاج التلفزيوني بما فيها الدراما وبرامج الواقع والوثائقيات والإعلانات والمحتوى القصير

الحقل `IncentiveClaim.program` يستوعبها بنسب وشروط مستقلة.

## 23.6 السياسة المحاسبية (IAS 20)

سياستان مقبولتان:

| السياسة | القيد | الأثر |
|---|---|---|
| **تخفيض التكلفة** (موصى بها) | تخفيض WIP أو تكلفة الإيراد | هامش المشروع يعكس الاقتصاد الحقيقي |
| **إيراد منحة مؤجل** | إيراد يُعترف به بالتوازي مع الإطفاء | يضخّم الإيراد والتكلفة معاً |

**لا يجوز الخلط.** تُختار مرة واحدة وتُطبَّق باتساق.

⚠️ **مسألة مفتوحة:** تعديلات اللائحة التنفيذية للضريبة (2025) على المادة 39 توضح أن مدفوعات الجهات الحكومية مقابل سلع أو خدمات **لا تُعد إعانات** إذا كانت مقابل توريدات. هل ينطبق ذلك على حافز هيئة الأفلام؟ **سؤال إلزامي للمستشار الضريبي.**

---

# 24. ملف نشاط: صانع المحتوى

## 24.1 مصادر الإيراد

| المصدر | العملة | معالجة ضريبية | تعقيد |
|---|---|---|---|
| إعلانات المنصات (AdSense وما شابه) | أجنبية | تصدير خدمات؟ ← **سؤال مفتوح** | مرتفع |
| عقود رعاية مع علامات محلية | ريال | خاضعة 15% | منخفض |
| عقود رعاية مع علامات أجنبية | أجنبية | تصدير خدمات محتمل | متوسط |
| التسويق بالعمولة | مختلطة | حسب موقع التاجر | متوسط |
| الاشتراكات المدفوعة من الجمهور | أجنبية | حسب موقع المشترك | مرتفع |
| الهدايا الرقمية والبثوث | أجنبية | | مرتفع |
| بيع منتجات (merch) | ريال | خاضعة 15% | منخفض |
| **المقايضة العينية** (منتج مجاني مقابل محتوى) | — | **خاضعة بالقيمة العادلة** | مرتفع |

## 24.2 المقايضة — بند مُغفَل دائماً

علامة تجارية ترسل منتجاً بقيمة 15,000 ريال مقابل ثلاثة مقاطع. هذه **معاملة خاضعة للضريبة من الطرفين** بالقيمة العادلة، وليست هدية.

النظام يجب أن يدعم:
- تسجيل عقد رعاية بمقابل عيني أو مختلط
- تقييم المقابل العيني بالقيمة العادلة مع مستند داعم
- إصدار فاتورة ضريبية بالقيمة العادلة (قيد ق-33)
- التنبيه إلى أن قيمة المقايضة **تُحتسب ضمن عتبة التسجيل الضريبي (375,000)**

هذا وحده سبب كافٍ لتسجيل مؤثرين لم يظنوا أنفسهم قريبين من العتبة.

## 24.3 تسوية بيانات المنصات

- استيراد بيان الفترة (رفع ملف يدوياً في المرحلة الأولى)
- التوفيق بين: الإيراد الإجمالي − رسوم المنصة − الضريبة المستقطعة عند المصدر = صافي التحويل
- التحقق من مطابقة صافي التحويل للإيداع البنكي
- الضريبة المستقطعة من المنصة تُسجَّل كبند منفصل — قابليتها للخصم **سؤال للمستشار**

## 24.4 التزامات ترخيصية

ترخيص **"موثوق"** لتقديم المحتوى الإعلاني عبر منصات التواصل مطلوب للأفراد الذين ينشرون محتوى إعلانياً. من شروطه:
- ألا يكون قد صدر بحق مقدم الطلب حكم جزائي في جريمة مخلة بالشرف والأمانة
- ألا يكون قد صدر بحقه قرار نهائي من الهيئة أو لجان النظر في مخالفات نظام المطبوعات والنشر خلال الأشهر الستة السابقة
- ألا يكون المحتوى المنشور عبر حساباته خلال الأشهر الستة السابقة مخالفاً لضوابط المحتوى الإعلامي

كذلك تتيح الهيئة **تسجيل قنوات وبرامج التدوين الصوتي والمرئي** للأشخاص الطبيعيين والاعتباريين.

> ⚠️ **رسوم ترخيص موثوق: المصادر غير الرسمية متضاربة بشدة** (تراوحت بين مئات الريالات و15,000 ريال). **لا يُدخل أي رقم في الكود** — يُخزَّن في `RateTable` بعد التحقق من مصدر رسمي.

## 24.5 وثيقة العمل الحر

- متاحة للسعوديين بين 18 و60 عاماً في المجالات المعتمدة من وزارة الموارد البشرية
- تُصدر عبر منصة العمل الحر بالنفاذ الوطني الموحد
- **لا يُحتسب حاملوها في نطاقات** (بخلاف الموظفين عن بُعد بعقود مسجّلة في قوى)
- **الاشتراك في التأمينات الاجتماعية اختياري** — فرع المعاشات، بشريحة دخل يختارها المستقل
- تمكّن من إصدار فواتير نظامية والتعامل مع العملاء المؤسسيين
- عند تجاوز الإيراد السنوي 375,000 ريال ← التسجيل في ضريبة القيمة المضافة إلزامي

**متطلب تقني:** حقل تاريخ انتهاء الوثيقة مع تنبيه، ومؤشر تقدّم نحو عتبة الـ 375,000 يُعرض في لوحة المعلومات.

---

# 25. ملف نشاط: الوكالة الإعلانية

## 25.1 الاشتراكات الدورية (Retainers)

نموذج الإيراد الأشيع. المعالجة:
- المقبوض مقدماً → 2310 (التزام)
- يُعترف به على مدى الشهر — إما بالقسط الثابت أو بنسبة الساعات المستهلكة
- **بنك الساعات:** كثير من العقود تحدد سقف ساعات شهرياً. تجاوزه يُفوتر إضافياً، وعدم استهلاكه قد يُرحَّل أو يسقط — بحسب العقد
- تقرير "الساعات المستهلكة مقابل المتعاقد عليها" لكل عميل — مؤشر ربحية الاشتراك

## 25.2 الشراء الإعلامي

انظر القسم 15. أهم ثلاثة متطلبات:
1. حساب مرور منفصل (2120) لدائني وسائل الإعلام
2. صفة أصيل/وكيل على مستوى العقد
3. **تقرير مطابقة الشراء الإعلامي:** ما فوترناه للعميل مقابل ما فوترتنا به الوسيلة — الفروق هنا هي مصدر الخسائر غير المرئية

## 25.3 المشاريع داخل الاشتراك

عميل باشتراك شهري يطلب حملة إضافية. يحتاج النظام تمييزاً واضحاً بين:
- عمل ضمن الاشتراك (لا فوترة إضافية، لكن يستهلك تكلفة)
- عمل خارج الاشتراك (مشروع منفصل بفوترة منفصلة)

بدون هذا التمييز، ربحية العميل الحقيقية غير قابلة للحساب.

## 25.4 التعاقد مع المؤثرين

الوكالة تتعاقد مع مؤثرين نيابة عن العميل. أسئلة تصميمية:
- هل المؤثر مورّد للوكالة (أصيل) أم أن الوكالة وسيط (وكيل)؟
- هل المؤثر مسجّل ضريبياً؟ هل يصدر فاتورة ضريبية؟
- هل المؤثر غير مقيم؟ ← استقطاع
- هل لديه ترخيص موثوق؟ ← **مسؤولية تعاقدية يجب توثيقها**

---

# 26. ملف نشاط: الاستوديو والتأجير

مغطى في القسم 20. الإضافات الخاصة:

## 26.1 حزم الخدمات

الاستوديو نادراً ما يبيع "ساعة استوديو" وحدها — بل حزمة: مساحة + إضاءة + فني + وجبة. النظام يحتاج:
- كيان حزمة (bundle) يجمع موارد وخدمات بسعر إجمالي
- توزيع الإيراد على مكونات الحزمة لأغراض تقارير ربحية الموارد
- منع الحجز إذا كان أحد مكونات الحزمة غير متاح

## 26.2 التأمين والمسؤولية

- إثبات تأمين على المستأجر كشرط للتسليم
- تتبع الأضرار وخصمها من الوديعة
- سجل حالة المعدة بالصور عند الخروج والعودة — يقلل النزاعات بشكل حاسم

---

# 27. مصفوفة ضريبة القيمة المضافة

## 27.1 المصفوفة

| المعاملة | المعالجة | الفئة | ملاحظات |
|---|---|---|---|
| خدمة إنتاج لعميل سعودي | خاضعة 15% | S | |
| خدمة إنتاج لعميل خليجي | **خاضعة 15%** | S | المعدل الصفري لا ينطبق داخل دول المجلس |
| خدمة إنتاج لعميل خارج دول المجلس | معدل صفري (بشروط) | **Z** | يتطلب مستندات إثبات |
| إيراد منصة رقمية أجنبية | **سؤال مفتوح** | ؟ | انظر 27.3 |
| تأجير استوديو/معدات محلياً | خاضعة 15% | S | |
| ترخيص محتوى لجهة أجنبية | معدل صفري (بشروط) | Z | |
| ترخيص محتوى لجهة سعودية | خاضعة 15% | S | |
| رعاية من علامة سعودية | خاضعة 15% | S | |
| مقايضة عينية | **خاضعة 15% بالقيمة العادلة** | S | |
| وديعة تأمينية مستردة | خارج النطاق | O | ليست مقابل توريد |
| خدمة مستوردة (VFX خارجي، برمجيات) | **ضريبة عكسية** | RC | مدين ودائن معاً |
| استيراد معدات | خاضعة عند الجمارك | | |
| حافز هيئة الأفلام | **سؤال مفتوح** | ؟ | انظر 27.4 |

## 27.2 المعدل الصفري لتصدير الخدمات

المادة 33 من اللائحة التنفيذية تتيح المعدل الصفري للخدمات المقدمة لعملاء خارج دول مجلس التعاون، مع استثناءات. أُعيدت صياغتها في 2019 لتقليل الشروط وتوسيع النطاق، ثم عُدّلت في 2025 بحيث **ضُيّق أحد الاستثناءات**: إذا كانت هناك منفعة تعود على مقيم في المملكة من الخدمة، يُشترط الآن أن يكون ذلك الشخص **"مرتبطاً" بالعميل التعاقدي** لكي يسقط المعدل الصفري.

> ملاحظة انتقالية مهمة: بسبب الأحكام الانتقالية، تُعامل جميع الدول عدا المملكة على أنها خارج دول المجلس إلى حين تفعيل النظام الإلكتروني للخدمات بين الدول الأعضاء. **يجب التحقق من سريان هذا الوضع حالياً قبل البناء عليه.**

**متطلب تقني:** فاتورة بمعدل صفري تحتاج:
1. رمز فئة الضريبة `Z`
2. سبب الإعفاء المكتوب
3. **حزمة مستندات إثبات مرفقة** — وهذا أكبر خطر في المراجعة الضريبية

النظام يجب أن **يمنع** إصدار فاتورة بمعدل صفري بلا مستندات مرفقة، أو على الأقل يُعلّمها بعلم "ناقصة الإثبات" في تقرير مخصص.

## 27.3 إيرادات المنصات الرقمية — أهم سؤال مفتوح

الوضع: صانع محتوى سعودي يتلقى مدفوعات من كيان أجنبي (مثل جوجل أيرلندا) مقابل عرض إعلانات على محتواه، والجمهور مختلط — جزء منه داخل المملكة.

**الاحتمالات:**
1. تصدير خدمة إعلانية لغير مقيم ← معدل صفري
2. خدمة تعود منفعتها على معلنين ومشاهدين داخل المملكة ← خاضعة 15%
3. معالجة مختلطة بحسب توزيع الجمهور

تعديلات 2025 على المادة 47 عرّفت **"السوق الإلكترونية"** ووضعت أحكاماً لضريبة الخدمات الإلكترونية والسلع عبرها، مع استثناءات محددة بحسب الترتيبات التعاقدية.

**لا يوجد مصدر سعودي رسمي واضح وقاطع في هذا البحث.** هذا **أهم سؤال** في القسم 38.

**التصميم الآمن:** حقل `vatTreatment` على `DigitalPlatformAccount` قابل للتكوين، مع بديل "خاضعة" افتراضياً (الأكثر تحفظاً)، وسجل قرار موثّق.

## 27.4 قيود خصم ضريبة المدخلات

تعديلات 2025 على المادة 50 أضافت فئات جديدة **غير قابلة لخصم ضريبة المدخلات، منها الفعاليات وخدمات الضيافة**، مع استثناءات للتأمين النظامي والالتزامات الصحية.

**الأثر المباشر:** الإعاشة الميدانية (catering) وضيافة المواقع بنود يومية في ميزانيات الإنتاج بمبالغ كبيرة. إن كانت غير قابلة للخصم، فتكلفتها الحقيقية أعلى 15% مما يظنه المنتج.

**متطلب تقني:** علم `inputVatDeductible` على كود التكلفة، افتراضياً `false` لأكواد الإعاشة والضيافة، مع سؤال صريح للمستشار.

## 27.5 نسبة الخصم النسبي

منشأة لديها توريدات خاضعة وتوريدات بمعدل صفري: كلاهما يسمح بخصم المدخلات، فلا مشكلة.
منشأة لديها توريدات معفاة: يجب حساب نسبة الخصم النسبي.
**متطلب:** المحرك يدعم النسبة، حتى لو كانت 100% لأغلب عملاء هذا القطاع.

---

# 28. الفوترة الإلكترونية والموجة 25

## 28.1 الوضع

تكامل المرحلة الثانية مكتمل بنحو 90% في المنصة. المرجع المفتوح المصدر المعتمد: `Saleh7/php-zatca-xml`.

**الموجة 25** (أُعلنت 24 يوليو 2026): خفض العتبة إلى **187,500 ريال** بموعد امتثال **1 فبراير 2027**.

## 28.2 الأثر على هذا القطاع

العتبة الجديدة تعني أن **كل استوديو وكل وكالة وكل صانع محتوى محترف** يدخل النطاق. لا يوجد عميل واقعي في هذا القطاع خارج النطاق.

## 28.3 المسارات

| نوع الفاتورة | المسار |
|---|---|
| فاتورة ضريبية B2B (الأغلبية الساحقة) | **Clearance** — تصديق قبل الإصدار |
| فاتورة مبسّطة B2C | Reporting — إبلاغ خلال 24 ساعة |

هذا القطاع B2B بأغلبيته، عدا دور السينما وبيع المنتجات للجمهور.

## 28.4 نقاط انتباه خاصة

1. **الفواتير بمعدل صفري** تحتاج رمز فئة `Z` وسبب الإعفاء — حقول إلزامية في XML
2. **الفواتير بعملة أجنبية** تحتاج عرض المبلغ بالريال وسعر الصرف
3. **إشعارات الدائن والمدين** — تعديلات الميزانية وتسويات الشراء الإعلامي تولّدها بكثرة
4. **تسلسل ICV وسلسلة التجزئة** لا يجوز كسرها — أي فاتورة تُلغى تحتاج إشعار دائن لا حذفاً

---

# 29. سجل التراخيص والتصاريح

## 29.1 الجهات ذات العلاقة

| الجهة | المنصة | النطاق |
|---|---|---|
| الهيئة العامة لتنظيم الإعلام | gmedia.gov.sa · elaam.gmedia.gov.sa · mawthooq.gmedia.gov.sa | تراخيص الإنتاج والإعلان والتوزيع والبودكاست |
| وزارة الثقافة / هيئة الأفلام | film.sa · abdea.moc.gov.sa | تراخيص الأنشطة الثقافية والفنية، الحوافز، فسح النصوص |
| الهيئة السعودية للملكية الفكرية | saip.gov.sa | تسجيل المصنفات وحقوق المؤلف |
| هيئة الزكاة والضريبة والجمارك | zatca.gov.sa | التسجيل الضريبي، الفوترة، الاستقطاع |
| وزارة الموارد البشرية | qiwa.sa · منصة العمل الحر | تصاريح العمل، وثيقة العمل الحر |
| الهيئة العامة للمساحة والمعلومات الجيومكانية | — | تصاريح الطائرات المسيّرة |
| وزارة الداخلية | — | تصاريح التصوير الأمنية |
| الهيئة العامة للطيران المدني | — | التصوير الجوي |
| البلديات | — | تصاريح إشغال الشارع |

> برنامج الحافز يوفّر دعماً لوجستياً بالتنسيق مع وزارة الداخلية، والهيئة العامة للمساحة والمعلومات الجيومكانية (تصاريح الطائرات المسيّرة)، وهيئة الزكاة والضريبة والجمارك، ووزارة الخارجية، وهيئة الاتصالات وتقنية المعلومات، ووزارة الاستثمار، والهيئة العامة للطيران المدني.

## 29.2 منصة "أبدع"

المنصة الإلكترونية الموحدة للتراخيص والتصاريح الثقافية التابعة لوزارة الثقافة، أُطلقت في مارس 2021 لإصدار تصاريح وتراخيص مزاولة الأنشطة الثقافية والفنية للأفراد والمنشآت. نُقلت إليها تصاريح كانت لدى وزارة الإعلام (مثل تصريح عرض الفن البصري والأمسية الشعرية والندوة الأدبية)، وتضم تراخيص هيئات: الفنون البصرية، الأزياء، الأدب والنشر والترجمة، التراث، وغيرها. وهي المنصة التي يحيل إليها موقع هيئة الأفلام لتراخيص وتصاريح الإنتاج.

**وزارة الثقافة تنص صراحةً على أنه لا يمكن لأي جهة الاستفادة من الخدمات إلا بعد إصدار التصريح المتعلق بكل نشاط.**

## 29.3 التراخيص المفصّلة

| الترخيص | الجهة | المستفيد | ملاحظة |
|---|---|---|---|
| ترخيص إنتاج المحتوى الإعلامي المرئي والمسموع | الهيئة العامة لتنظيم الإعلام | شركات ومؤسسات | يشمل البرامج والأفلام وألعاب الفيديو والرسوم المتحركة والدبلجة والمونتاج والرسوم البيانية والنصوص |
| شهادة عدم ممانعة لتصريح تصوير | الهيئة / هيئة الأفلام | جهات إعلامية | **يشترط وجود ترخيص الإنتاج مسبقاً** |
| فسح محتوى النص | هيئة الأفلام | متقدمو الحافز | مستند إلزامي للحافز |
| ترخيص موثوق للمحتوى الإعلاني | الهيئة | أفراد مؤثرون | شروط سلوكية ومحتوى |
| تسجيل قنوات التدوين الصوتي والمرئي | الهيئة | أفراد ومنشآت | البودكاست |
| وثيقة ممارس العمل الإعلامي | الهيئة | أفراد | تحفظ الحقوق المهنية وتسهّل الوصول لمصادر المعلومات |
| ترخيص مكاتب الدعاية والإعلان والتسويق | الهيئة | وكالات | |
| ترخيص توزيع أو استيراد الأفلام والبرامج | الهيئة | موزّعون | |
| ترخيص منصة توزيع محتوى عبر الإنترنت | الهيئة | منصات OTT | |
| ترخيص تشغيل دور السينما (ثابتة/مؤقتة) | الهيئة | مشغّلون | |
| فسح الملصق السينمائي | الهيئة | موزّعون | للعرض في الأماكن العامة ودور السينما |
| فسح المحتوى الإعلاني التجاري وتصنيفه عمرياً | الهيئة | معلنون | للعرض في صالات السينما |

## 29.4 التصميم

`LicenseRegistry` مع:
- تنبيه قبل الانتهاء بمدة قابلة للتكوين (افتراضياً 60 يوماً)
- علم `blocksOnExpiry` وقائمة العمليات المحجوبة
- مثال حاكم: **لا يُسمح بإنشاء مشروع تصوير إذا كان ترخيص الإنتاج منتهياً**، لأن شهادة عدم الممانعة تشترط سريانه
- ربط الترخيص بالمشروع وبمطالبة الحافز

---

# 30. حقوق المؤلف والملكية الفكرية

## 30.1 نظام حماية حقوق المؤلف

تعريفات جوهرية من النظام:

- **المصنف السمعي البصري:** أي مصنف معد للسمع والنظر في آن واحد، يتكون من مجموعة صور مترابطة مصحوبة بأصوات ومسجلة على دعامة ملائمة، ويُعرض بواسطة أجهزة مناسبة
- **المصنف السمعي:** أي تثبيت سمعي لأداء أو صوت معين مهما كانت طريقة التثبيت
- **المصنف الجماعي:** المصنف الذي تشترك في وضعه جماعة بتوجيه من شخص طبيعي أو معنوي يتكفل بنشره تحت إدارته أو باسمه، ويندمج عمل المشتركين فيه في الهدف العام بحيث لا يمكن فصل عمل كل مشترك وتمييزه على حدة

## 30.2 اللائحة التنفيذية المحدّثة

اعتمدت الهيئة السعودية للملكية الفكرية حزمة تنظيمية تشمل اللائحة التنفيذية المحدّثة وقواعد وإجراءات تسوية مخالفات نظام حقوق المؤلف. من أبرز ما تضمنته:
- تنظيم **حقوق المساهمين في المصنفات السمعية البصرية** — كتّاب السيناريو والمخرجون ومؤلفو الموسيقى التصويرية — بما يحفظ حقوق جميع المشاركين في العمل الإبداعي
- أحكام المصنفات الجماعية والمصنفات التي يبتكرها العاملون أثناء أداء أعمالهم، مع **ضوابط توزيع ملكية الحقوق بين المؤلف وصاحب العمل**
- حماية دائمة لتعبيرات التراث الثقافي السعودي
- **تسوية الانتهاكات خلال 15 يوماً** ضمن قواعد التسوية

## 30.3 تسجيل المصنفات

خدمة تسجيل المصنفات لدى الهيئة تشمل فئات متعددة (مصنفات مكتوبة، فنية وفنية تطبيقية، برمجيات وتطبيقات). الرسوم رمزية وتختلف بين الأفراد والمؤسسات والطلاب وبين الفحص والتسجيل (بمئات الريالات).

**متطلب تقني:** حقل `saipRegistrationNo` على `ContentAsset`، وتنبيه للتسجيل عند التسليم — لأن **إثبات ملكية حقوق المؤلف مستند إلزامي في مطالبة الحافز**.

## 30.4 قاعدة تصميمية حاكمة

> النظام يجب أن يمنع رسملة عمل كأصل محتوى دون وجود `RightsRecord` مكتمل يوضّح أساس الملكية. لأن أصلاً لا نملك حقوقه ليس أصلاً.

---

# 31. العمل الحر والعمالة الأجنبية

## 31.1 المسارات الثلاثة للطاقم

| المسار | الأداة | الأثر المحاسبي |
|---|---|---|
| موظف سعودي/مقيم | عقد في قوى، حماية أجور، تأمينات | محرك الرواتب |
| مستقل سعودي | وثيقة العمل الحر | محرك المتعاقدين — لا تأمينات إلزامية |
| أجنبي غير مقيم | تأشيرة عمل مؤقت أو زيارة عمل | محرك المتعاقدين + **استقطاع** |

## 31.2 العمالة الأجنبية

نظام العمل (المواد 32–40) يشترط للعامل غير السعودي الحصول على تصريح عمل من وزارة الموارد البشرية، وأن يكون قد دخل البلاد بشكل نظامي.

تُصدر تأشيرات العمل عبر منصة قوى، وتشمل **تأشيرات العمل الدائمة والمؤقتة**. من شروط إصدارها للمنشأة: سريان السجل التجاري، والوجود في النطاق الأخضر المتوسط أو أعلى، والتقيد بنظام حماية الأجور دون ملاحظات، والالتزام بتوثيق العقود بالنسبة المطلوبة، ووجود مبلغ كافٍ في منصات وزارة الداخلية، والالتزام بالتقييم الذاتي السنوي (للمنشآت من 10 موظفين فأكثر).

**الأثر التشغيلي الحاسم:** شركة إنتاج تحتاج استقدام طاقم أجنبي لمشروع محدد قد **تُمنع من إصدار التأشيرات إذا كان تصنيفها في نطاقات دون الأخضر المتوسط**. هذا يربط قرار الإنتاج بحالة السعودة — وهو ما لا تعرضه أي أداة إنتاج.

**متطلب تقني (غير حاجب):** لوحة "جاهزية الاستقدام" تعرض حالة نطاقات وحماية الأجور ونسبة توثيق العقود، مع تنبيه عند تعارضها مع مشروع مخطط له طاقم أجنبي. يتطلب تكامل قوى ونطاقات المخطط في مواصفة الموارد البشرية.

## 31.3 خطر إعادة التصنيف

مغطى في 16.4. الأثر المالي المحتمل عند إعادة التصنيف: تأمينات بأثر رجعي + مكافأة نهاية خدمة + غرامات. النظام ينبّه فقط.

---

# 32. حماية البيانات وإقرارات التصوير

## 32.1 المخاطر

- **صور ومقاطع الأشخاص** بيانات شخصية بحكم نظام حماية البيانات الشخصية
- تصوير الكومبارس والمارّة في الأماكن العامة
- بيانات الطاقم (الهويات، الجوازات، البيانات البنكية)
- بيانات الجمهور في المحتوى التفاعلي

## 32.2 المتطلبات

`TalentRelease` — كيان إقرار موافقة:
```
id, projectId, personName, personIdRef
scopeOfUse        String[]    // ["theatrical","digital","marketing","perpetual"]
territory         String[]
validUntil        DateTime?
signedAt, signedFileKey
isMinor           Boolean     // موافقة ولي الأمر إن كان قاصراً
guardianConsentFileKey String?
```

**قاعدة حاكمة:** لا يُسمح بتعليم `ContentAsset` كجاهز للنشر إذا وُجد ظهور مسجّل بلا إقرار موافقة سارٍ يغطي نطاق الاستخدام المقصود.

> هذا امتداد مباشر لنفس المبدأ المُطبَّق في مواصفة الصالونات بشأن صور العملاء قبل/بعد: **الافتراض الآمن هو المنع حتى إثبات الموافقة، لا العكس.**

## 32.3 حفظ السجلات وموقع الخادم

- مدة الحفظ النظامية للسجلات الضريبية **ست سنوات**، والتخزين مطلوب داخل المملكة
- ⚠️ **مسألة معلّقة على مستوى المنصة ولم تُحسم** — وتزداد حدّة هنا لأن الملفات الإعلامية بالتيرابايت
- **توصية تصميمية:** فصل تخزين **المستندات المحاسبية** (فواتير، عقود، إيصالات) عن تخزين **الأصول الإعلامية** (لقطات، مشاريع مونتاج). الأولى ملزمة بالإقامة داخل المملكة وحجمها صغير؛ الثانية ضخمة وقد تخضع لقواعد مختلفة. خلطهما في مستودع واحد يجعل الالتزام مكلفاً بلا داعٍ.

## 32.4 الوظائف المحظورة (ZATCA)

سجلات التدقيق والحذف الناعم يجب أن **تستثني السجلات الضريبية صراحةً** خلال فترة الحفظ. لا حذف ولا تعديل بلا أثر — مطلب امتثال لا خيار تصميم.

---

# 33. القيود المحاسبية (44 قيداً)

> الأكواد استرشادية وتتبع دليل الحسابات في القسم 7. `(P)` = يحمل بُعد المشروع إلزامياً.

## أ) التأسيس والأصول

**ق-1 — شراء معدات إنتاج محلياً**
```
1600 معدات إنتاج وتصوير            مدين   200,000
2200 ضريبة مدخلات                   مدين    30,000
     2100 الذمم الدائنة              دائن   230,000
```

**ق-2 — استيراد معدات**
```
1600 معدات إنتاج (السعر + الشحن + الجمارك)  مدين   250,000
2200 ضريبة مدخلات (على القيمة الجمركية)     مدين    37,500
     2100 الذمم الدائنة — المورّد الأجنبي     دائن   220,000
     1000 النقدية (جمارك وشحن)                دائن    67,500
```

**ق-3 — عقد إيجار استوديو طويل الأجل (IFRS 16)**
```
1620 حق استخدام أصل مستأجر          مدين   القيمة الحالية للدفعات
     2600 التزام إيجار                دائن
شهرياً: 5600 إهلاك حق الاستخدام مدين / 1625 دائن
        5700 مصروف فوائد            مدين / 2600 دائن
```

## ب) دورة تكلفة المشروع

**ق-4 — حجز التزام بأمر شراء**
> **لا قيد محاسبي.** يُسجَّل في `Commitment` ويظهر في تقرير التكلفة كـ"مرتبط". هذا مقصود: الالتزام ليس مصروفاً ولا خصماً حتى الاستلام.

**ق-5 — فاتورة شراء إنتاج محمّلة على مشروع** *(تصحيح `postPurchaseToLedger`)* `(P)`
```
1350 أعمال إنتاج تحت التنفيذ — كود التكلفة   مدين    80,000
2200 ضريبة مدخلات                            مدين    12,000
     2100 الذمم الدائنة                       دائن    92,000
+ تحديث Commitment.consumedAmount
```

**ق-6 — أجور موظفين محمّلة على مشروع** `(P)`
```
1350 أعمال إنتاج تحت التنفيذ               مدين    60,000
     2150 رواتب مستحقة                      دائن    54,000
     2160 التأمينات الاجتماعية مستحقة        دائن     6,000
```

**ق-7 — استحقاق أجر متعاقد مقيم (العناصر الأربعة)** `(P)`
```
1350 WIP — أجور طاقم (2110)                مدين    24,000   (12 يوم × 2,000)
1350 WIP — وقت إضافي                        مدين     3,000
1350 WIP — بدل معدات (2410)                 مدين     2,400
1350 WIP — بدلات يومية (2630)               مدين     3,600
2200 ضريبة مدخلات (إن كان مسجلاً)            مدين     4,950
     2110 مستحق لمتعاقدين                    دائن    37,950
```

**ق-8 — سداد لمتعاقد غير مقيم مع استقطاع (خدمة فنية 5%)**
```
2110 مستحق لمتعاقدين                       مدين   100,000
     1000 النقدية                           دائن    95,000
     2250 ضريبة استقطاع مستحقة              دائن     5,000
+ إنشاء WhtTransaction بفترة الإقرار
```

**ق-9 — نفس الحالة بشرط الصافي (gross-up) — إتاوة 15%** `(P)`
```
الإجمالي = 100,000 ÷ (1 − 0.15) = 117,647
1350 أعمال إنتاج تحت التنفيذ               مدين   117,647
     1000 النقدية                           دائن   100,000
     2250 ضريبة استقطاع مستحقة              دائن    17,647
```

**ق-10 — صرف عهدة نثرية** `(P)`
```
1250 عهد ونثريات إنتاج — (المسؤول)         مدين    50,000
     1000 النقدية                           دائن    50,000
```

**ق-11 — تسوية العهدة** `(P)`
```
1350 WIP (بأكواد التكلفة المتعددة)          مدين    41,000
2200 ضريبة مدخلات (الفواتير الصالحة فقط)     مدين     3,900
5410 مصروفات بلا مستند ضريبي صالح           مدين     2,600
     1250 عهد ونثريات إنتاج                  دائن    47,500
     1000 النقدية (المتبقي المعاد)            دائن     2,500
```

**ق-12 — عجز في العهدة غير مبرَّر**
```
1260 سلف على الموظفين (للخصم من المستحقات)  مدين
     1250 عهد ونثريات إنتاج                  دائن
```

**ق-13 — إعادة تحميل إهلاك المعدات على المشروع** `(P)`
```
1350 أعمال إنتاج تحت التنفيذ — معدات        مدين    18,000
     5910 حساب مقاصة إعادة التحميل           دائن    18,000
(قيد الإهلاك الفعلي مستقل: 5600 مدين / 1605 دائن)
```

**ق-14 — تأمين إنتاج مدفوع مقدماً وتوزيعه** `(P)`
```
عند السداد:  1400 مصروفات مدفوعة مقدماً   مدين  90,000 / 1000 دائن
شهرياً:      1350 WIP — تأمين (2710)      مدين  30,000 / 1400 دائن
```

**ق-15 — شراء حقوق قصة أو سيناريو (ATL)** `(P)`
```
1350 WIP — حقوق وسيناريو (1110)            مدين   150,000
2200 ضريبة مدخلات                           مدين    22,500
     2100 الذمم الدائنة                      دائن   172,500
```

**ق-16 — ترخيص موسيقى من مالك حق أجنبي (إتاوة 15%)** `(P)`
```
1350 WIP — تراخيص موسيقى (3440)            مدين    60,000
     1000 النقدية                           دائن    51,000
     2250 ضريبة استقطاع مستحقة              دائن     9,000
```

**ق-17 — تكاليف قابلة لإعادة الفوترة للعميل (pass-through)** `(P)`
```
عند التكبد:   1350 WIP — تكاليف معاد فوترتها  مدين / 2100 دائن
عند الفوترة:  1200 الذمم المدينة  مدين / 4100 إيراد أو 1350 دائن (حسب صفة أصيل/وكيل)
```

**ق-18 — رسملة المشروع المكتمل (ownedIP)** `(P)`
```
1700 مكتبة المحتوى                          مدين  6,000,000
     1350 أعمال إنتاج تحت التنفيذ            دائن  6,000,000
```

**ق-19 — نقل تكلفة المشروع إلى تكلفة الإيراد (workForHire)** `(P)`
```
5100 تكلفة الإيراد — مشاريع إنتاج            مدين
     1350 أعمال إنتاج تحت التنفيذ            دائن
```

**ق-20 — شطب مشروع ملغى** `(P)`
```
5450 مصروف مشاريع متوقفة أو ملغاة           مدين   420,000
     1355 أعمال تحت التنفيذ — تطوير          دائن   420,000
```

## ج) الإيراد

**ق-21 — دفعة مقدمة عند توقيع العقد**
```
1000 النقدية                                مدين  2,300,000
     2300 التزام عقد                         دائن  2,000,000
     2200 ضريبة مخرجات                       دائن    300,000
```

**ق-22 — الاعتراف بالإيراد بنسبة الإنجاز** `(P)`
```
التكلفة المتكبدة 3,000,000 ÷ التكلفة المقدرة 6,000,000 = 50%
سعر الالتزام 10,000,000 × 50% = 5,000,000 تراكمي
المعترف به سابقاً 2,000,000 ← إيراد الفترة 3,000,000

1360 أصل عقد — إيراد غير مفوتر              مدين  3,000,000
     4100 إيراد خدمات إنتاج                  دائن  3,000,000
```

**ق-23 — تكلفة الإيراد المقابلة** `(P)`
```
5100 تكلفة الإيراد — مشاريع                  مدين  1,800,000
     1350 أعمال إنتاج تحت التنفيذ            دائن  1,800,000
```

**ق-24 — إصدار فاتورة محطة تعاقدية**
```
1200 الذمم المدينة                          مدين  4,600,000
     1360 أصل عقد                            دائن  2,000,000
     2300 التزام عقد                         دائن  2,000,000
     2200 ضريبة مخرجات                       دائن    600,000
```
> التوزيع بين 1360 و2300 يعتمد على العلاقة بين المفوتر والمعترف به تراكمياً — يُحسب آلياً لا يدوياً.

**ق-25 — مخصص عقد خاسر** `(P)`
```
الخسارة المتوقعة = التكلفة المقدرة الكلية − سعر العقد = 700,000
5460 خسائر عقود متوقعة                      مدين   700,000
     2350 مخصص عقود خاسرة                    دائن   700,000
```

**ق-26 — وكالة بصفة وكيل (agent)**
```
1200 الذمم المدينة — العميل                 مدين   115,000
     2120 دائنون — وسائل الإعلام             دائن    92,000
     4200 إيراد عمولة وكالة                  دائن     8,000
     2200 ضريبة مخرجات                       دائن    15,000
عند سداد الوسيلة: 2120 مدين / 1000 دائن
```

**ق-27 — وكالة بصفة أصيل (principal)**
```
1200 الذمم المدينة                          مدين   115,000
     4210 إيراد خدمات إعلامية                دائن   100,000
     2200 ضريبة مخرجات                       دائن    15,000

5150 تكلفة شراء مساحات إعلانية               مدين    92,000
2200 ضريبة مدخلات                            مدين    13,800
     2100 الذمم الدائنة — الوسيلة             دائن   105,800
```

**ق-28 — الاعتراف باشتراك دوري شهري**
```
2310 اشتراكات مقبوضة مقدماً                 مدين    50,000
     4220 إيراد اشتراكات دورية               دائن    50,000
```

**ق-29 — إيراد منصة رقمية بعملة أجنبية**
```
USD 10,000 × 3.7520 = 37,520
1210 ذمم مدينة — منصات رقمية                مدين    37,520
     4300 إيراد محتوى رقمي                   دائن    37,520
(فئة الضريبة بحسب السياسة المعتمدة — انظر 27.3)
```

**ق-30 — تحصيل بعملة أجنبية مع فرق صرف**
```
1000 النقدية — حساب دولاري (10,000 × 3.7480)  مدين    37,480
5800 فروق عملة — خسائر                        مدين        40
     1210 ذمم مدينة — منصات رقمية              دائن    37,520
```

**ق-31 — إيراد تأجير استوديو ووديعة تأمينية**
```
عند الحجز:  1000 النقدية  مدين  5,000 / 2400 ودائع تأمينية دائن  5,000
عند الخدمة: 1200 الذمم المدينة مدين 23,000
                 4400 إيراد تأجير استوديو   دائن  20,000
                 2200 ضريبة مخرجات          دائن   3,000
عند الإعادة سليمة: 2400 مدين 5,000 / 1000 دائن 5,000
عند وجود ضرر:      2400 مدين 5,000 / 4900 إيرادات أخرى دائن (بقيمة الضرر) / 1000 دائن (الباقي)
```

**ق-32 — إيراد ترخيص نافذة محتوى**
```
نقطة زمنية (حق استخدام):
1200 الذمم المدينة        مدين  575,000
     4500 إيراد تراخيص محتوى  دائن  500,000
     2200 ضريبة مخرجات        دائن   75,000

على مدى الزمن (حق وصول): يُوزَّع بالقسط على أشهر النافذة عبر 2300
```

**ق-33 — رعاية بمقابل عيني (مقايضة)**
```
1310 مخزون / 1600 أصول (بالقيمة العادلة)     مدين    15,000
2200 ضريبة مدخلات                             مدين     2,250
     4310 إيراد رعايات                         دائن    15,000
     2200 ضريبة مخرجات                         دائن     2,250
```
> الطرفان يصدران فاتورة ضريبية. صافي الأثر النقدي صفر، لكن الإيراد **يُحتسب في عتبة 375,000**.

## د) المحتوى والحقوق

**ق-34 — إطفاء بطريقة تنبؤ الإيراد الفردي**
```
التكلفة 10,000,000 · EU 25,000,000 · إيراد الفترة 12,000,000
المعدل = 48% ← الإطفاء = 4,800,000

5500 مصروف إطفاء مكتبة المحتوى               مدين  4,800,000
     1750 مجمع إطفاء مكتبة المحتوى            دائن  4,800,000
```

**ق-35 — تعديل تقدير الإيراد النهائي**
> **لا قيد في فترة التعديل.** يُسجَّل في `UltimateRevenueRevision` ويؤثر على معدل الإطفاء في الفترات اللاحقة فقط. تعديل الفترات السابقة **خطأ محاسبي**.

**ق-36 — اضمحلال أصل محتوى**
```
5510 خسارة اضمحلال أصول محتوى                مدين  1,200,000
     1750 مجمع الإطفاء والاضمحلال             دائن  1,200,000
```

**ق-37 — استحقاق حصص المشاركين**
```
إيراد الفترة 12,000,000 × 5% للمخرج = 600,000
5120 تكلفة الإيراد — حصص مشاركين              مدين   600,000
     2450 التزام حصص مشاركين                  دائن   600,000
```

**ق-38 — سداد حصة لمشارك غير مقيم (إتاوة 15%)**
```
2450 التزام حصص مشاركين                      مدين   600,000
     1000 النقدية                             دائن   510,000
     2250 ضريبة استقطاع مستحقة                دائن    90,000
```

**ق-39 — إطفاء حقوق توزيع مشتراة (للموزّع)**
```
5100 تكلفة الإيراد — إطفاء حقوق               مدين
     1720 حقوق توزيع مشتراة (أو مجمع إطفائها)  دائن
(يُطفأ على مدى النافذة أو بتنبؤ الإيراد)
```

## هـ) الحوافز

**ق-40 — الاعتراف باستحقاق الحافز (سياسة تخفيض التكلفة)** `(P)`
```
الإنفاق المؤهل 5,000,000 × 60% = 3,000,000
1280 مستحق من جهات حكومية — حافز إنتاج        مدين  3,000,000
     1350 أعمال إنتاج تحت التنفيذ             دائن  3,000,000
```

**ق-41 — السياسة البديلة (منحة مؤجلة)**
```
1280 مستحق من جهات حكومية                    مدين  3,000,000
     2500 إيراد منحة حكومية مؤجل              دائن  3,000,000
لاحقاً بالتوازي مع الإطفاء:
2500 إيراد منحة مؤجل  مدين / 4600 إيراد منح حكومية دائن
```

**ق-42 — استلام الحافز مع فرق اعتماد** `(P)`
```
المعتمد 2,850,000 مقابل مطالبة 3,000,000
1000 النقدية                                 مدين  2,850,000
1350 أعمال إنتاج تحت التنفيذ (عكس الفرق)      مدين    150,000
     1280 مستحق من جهات حكومية                دائن  3,000,000
```

## و) الضرائب

**ق-43 — سداد إقرار ضريبة الاستقطاع الشهري**
```
2250 ضريبة استقطاع مستحقة                    مدين   121,647
     1000 النقدية                             دائن   121,647
+ تحديث WhtReturn.paidAt وإصدار الشهادات
```

**ق-44 — الضريبة العكسية على خدمة مستوردة** `(P)`
```
1350 WIP — مؤثرات بصرية (3300)               مدين    80,000
2200 ضريبة القيمة المضافة — مدخلات            مدين    12,000
     2100 الذمم الدائنة — المورّد الأجنبي      دائن    80,000
     2210 ضريبة القيمة المضافة — مخرجات عكسية  دائن    12,000
```
> محايد الأثر عند كون النشاط خاضعاً بالكامل. **يصبح تكلفة فعلية** عند وجود توريدات معفاة أو عند كون البند غير قابل لخصم المدخلات (انظر 27.4). ولاحظ أن هذه الدفعة قد تخضع **أيضاً** لضريبة الاستقطاع — الضريبتان منفصلتان ولا تُلغي إحداهما الأخرى.

---

# 34. التقارير ومؤشرات الأداء

## 34.1 تقارير المشروع

| التقرير | الدورية | الجمهور |
|---|---|---|
| **تقرير التكلفة (Cost Report)** | أسبوعي | مدير الإنتاج، الممول |
| الميزانية مقابل الفعلي بكود التكلفة | عند الطلب | الإدارة |
| المرتبطات المفتوحة | أسبوعي | الإنتاج والمشتريات |
| التدفق النقدي المتوقع للمشروع | أسبوعي | المالية |
| ربحية المشروع (فعلي ومتوقع) | شهري | الإدارة |
| كشوف أيام الطاقم | أسبوعي | الإنتاج |
| العهد المفتوحة وأعمارها | أسبوعي | المالية |
| النفقات المؤهلة للحافز | شهري + عند المطالبة | المالية، المدقق |

## 34.2 التقارير المالية

- قائمة الدخل بالمشروع وبالنشاط
- الميزانية العمومية مع فصل: WIP، أصل العقد، التزام العقد، مكتبة المحتوى
- تقرير أعمار الذمم المدينة والدائنة
- **تقرير الاعتراف بالإيراد:** لكل عقد — المفوتر، المعترف به، أصل العقد، التزام العقد
- **تقرير تسوية ضريبة الاستقطاع** الشهري
- تقرير المعدل الصفري ومستندات الإثبات (والفواتير ناقصة الإثبات)
- تقرير فروق العملة المحققة وغير المحققة

## 34.3 تقارير المحتوى

- مكتبة المحتوى: التكلفة، الإطفاء المتراكم، القيمة الدفترية، الإيراد التراكمي
- **الفعلي مقابل EU لكل عمل** — مقياس دقة التقدير
- الأعمال المرشحة للاضمحلال (أداء أقل من 60% من المتوقع)
- التزامات المشاركين المستحقة وغير المسددة
- النوافذ المنتهية والنوافذ المتاحة للبيع

## 34.4 مؤشرات الأداء

| المؤشر | النموذج |
|---|---|
| هامش المشروع (فعلي) | إنتاج |
| نسبة تجاوز الميزانية | إنتاج |
| دقة التقدير عند الإكمال | إنتاج |
| نسبة الإشغال | استوديو |
| الإيراد لكل أصل | استوديو |
| ربحية العميل الشهرية | وكالة |
| الساعات المستهلكة/المتعاقد عليها | وكالة |
| الإيراد لكل ألف مشاهدة | صانع محتوى |
| توزيع الإيراد بالعملة | الجميع |
| نسبة الاسترداد من الحافز | إنتاج |
| متوسط دورة التحصيل | الجميع |

## 34.5 لوحة الامتثال

لوحة واحدة تعرض بالأحمر/الأصفر/الأخضر:
- التراخيص المنتهية أو المقاربة على الانتهاء
- إقرار الاستقطاع المستحق (والأيام المتبقية)
- الإقرار الضريبي المستحق
- الفواتير غير المُرسَلة إلى ZATCA
- المشاريع بلا موافقة حافز مسبقة رغم تعليمها كمؤهلة
- الأعمال بلا سجل حقوق مكتمل
- الظهورات بلا إقرارات موافقة
- المتعاقدون المتجاوزون لعتبة أيام الارتباط
- أصول المحتوى التي لم يُراجع EU لها هذا الربع

---

# 35. الأدوار والصلاحيات

| الدور | يرى | لا يرى | يستطيع |
|---|---|---|---|
| **مالك/مدير عام** | كل شيء | — | كل شيء |
| **المدير المالي** | كل الدفاتر والتقارير | — | الاعتماد، الإقفال، السياسات |
| **المحاسب** | الدفاتر والمستندات | أجور الطاقم الفردية (إلا بصلاحية) | الترحيل، الإقرارات |
| **منتج منفذ** | كل المشاريع | الدفاتر العامة | اعتماد الميزانيات والتعديلات |
| **مدير إنتاج** | **مشاريعه فقط** | مشاريع أخرى، الدفاتر | إنشاء التزامات، اعتماد كشوف الأيام، تسوية العهد |
| **منسق إنتاج** | مشروعه — قراءة | الميزانيات المالية التفصيلية | إدخال المصروفات والكشوف |
| **مسؤول عهدة** | عهدته فقط | كل ما عداها | تسجيل مصروفات ورفع إيصالات |
| **مدير حسابات (وكالة)** | عملاؤه | عملاء آخرون | إنشاء مشاريع، متابعة الاشتراكات |
| **مسؤول حجوزات** | التقويم والحجوزات | الدفاتر | إنشاء وتعديل الحجوزات |
| **مسؤول الحقوق** | مكتبة المحتوى والحقوق | التكاليف التفصيلية | إدارة النوافذ والمشاركات |
| **مدقق خارجي** | قراءة فقط لنطاق محدد بمدة | — | تصدير |

**قواعد إلزامية:**
- فصل المهام: من ينشئ الالتزام لا يعتمده، ومن يسجّل المصروف لا يسوّي العهدة
- كل عملية اعتماد تُسجَّل باسم ووقت
- الوصول إلى أجور الطاقم الفردية صلاحية منفصلة صراحةً
- سجل تدقيق غير قابل للحذف للسجلات الضريبية

---

# 36. التكاملات

| التكامل | الأولوية | الحالة | ملاحظة |
|---|---|---|---|
| **ZATCA — الفوترة الإلكترونية** | عالية | ~90% مكتمل | يحتاج تغطية Z والعملات الأجنبية |
| **ZATCA — إقرار الاستقطاع** | عالية | غير مبدوء | قد لا توجد واجهة برمجية — التصدير كبديل |
| **العنوان الوطني (SPL)** | متوسطة | ناقص (مسجّل في gap-analysis) | مطلوب للمنشأة والعملاء والموردين |
| **واثق (Wathq)** | متوسطة | مخطط | التحقق من السجلات التجارية للعملاء والموردين |
| **نفاذ الوطني** | متوسطة | التصميم مكتمل، معلّق على إقامة البيانات | تسجيل الدخول والتحقق من الهوية |
| **قوى** | متوسطة | مخطط في مواصفة الموارد البشرية | التأشيرات، العقود، نطاقات |
| **مدد / حماية الأجور** | متوسطة | مخطط | للموظفين لا للمتعاقدين |
| **التأمينات الاجتماعية** | متوسطة | مخطط | |
| **منصة العمل الحر** | منخفضة | استكشاف | التحقق من وثيقة العمل الحر |
| **film.sa** | منخفضة | لا توجد واجهة معروفة | التصدير اليدوي للمطالبة |
| **SAIP** | منخفضة | لا توجد واجهة معروفة | تسجيل يدوي مع حفظ الرقم |
| **البنوك المفتوحة (SAMA / Lean)** | متوسطة | مخطط | التسوية البنكية بعملات متعددة |
| **بوابات الدفع (Moyasar)** | منخفضة | مخطط | للاستوديوهات والحجوزات |
| **أسعار الصرف** | متوسطة | غير مبدوء | مصدر يومي موثوق |
| **بيانات المنصات الرقمية** | منخفضة | رفع يدوي أولاً | لا توجد واجهات موحدة |

> **درس متكرر من مسارات سابقة:** سلوك الواجهات الحكومية يختلف عن التوثيق. مستودعات التنفيذ المجتمعية (كما في حالة `Saleh7/php-zatca-xml`) أفضل مصدر لاكتشاف المزالق العملية من الوثائق الرسمية.

---

# 37. القرارات الحاجبة

يجب حسمها **قبل** أول migration. كل واحدة منها يغيّر السكيما بشكل غير قابل للتراجع عملياً.

## ح-1 — نظام أبعاد عام أم حقل مشروع مفرد
**التوصية: نظام أبعاد عام.** الجهد +30%، والبديل يعني إعادة كتابة كل تقرير عند أول طلب لمركز تكلفة.
**الأثر إن تأجل:** كارثي.

## ح-2 — تعدد العملات على مستوى السطر
تخزين `currency` + `fxRate` + `amountOriginal` على **كل** سطر مستند وسطر قيد.
**التوصية: يُبنى الآن حتى لو ظل معطّلاً بعلم ميزة.** إضافته لاحقاً تعني ترحيل بيانات لكل قيد تاريخي.

## ح-3 — سياسة الاعتراف بالإيراد قابلة للتكوين
تُخزَّن على مستوى `PerformanceObligation` لا في الكود.
**التوصية: محرك واحد يفسّر السياسة، و"نقطة زمنية" حالة خاصة من "على مدى الزمن".**

## ح-4 — أصيل أم وكيل على مستوى العقد
**التوصية: حقل إلزامي على `RevenueContract` يُقفل عند التوقيع، مع سجل قرار.**

## ح-5 — معالجة أصل المحتوى
**التوصية: كيان محايد عن التصنيف بجدول إطفاء مدفوع بالفترات، وحقل `classification` للعرض فقط.**
(تطبيق المبدأ م-3)

## ح-6 — سياسة المنح الحكومية
تخفيض التكلفة أم إيراد مؤجل. **التوصية: تخفيض التكلفة** — يعطي هامشاً أوضح على مستوى المشروع.
**يُختار مرة واحدة على مستوى المستأجر ويُقفل.**

## ح-7 — الإجمالي أم الخصم في الاستقطاع
**التوصية: حقل على `Commitment`/`CrewEngagement` يُقفل عند التوقيع، مع عرض الأثر على الميزانية قبل الاعتماد.**

## ح-8 — توقيت تعليم النفقات المؤهلة للحافز
**التوصية: `incentiveEligible` على كود التكلفة وعلى سطر التكلفة من أول migration.**

## ح-9 — فصل تخزين المستندات المحاسبية عن الأصول الإعلامية
**التوصية: مستودعان منفصلان.** المحاسبية ملزمة بالإقامة داخل المملكة وصغيرة؛ الإعلامية ضخمة وقواعدها قد تختلف.

## ح-10 — موقع البيانات وحفظ السجلات
**مسألة قائمة على مستوى المنصة كلها ولم تُحسم.** تحجب: نفاذ، وسجلات التدقيق، والحذف الناعم، وهذا القطاع.

---

# 38. أسئلة المستشار الضريبي المرخّص

> لا يجوز البت في أي منها بالاجتهاد داخل الكود. تُوثَّق الإجابات وتُربط بمواضعها في المصدر عبر تعليق مرجعي يذكر رقم السؤال وتاريخ الإجابة.

## ضريبة القيمة المضافة

1. **[الأهم]** إيرادات المنصات الرقمية (يوتيوب/تيك توك/ميتا/سناب) لصانع محتوى أو ناشر مقيم في المملكة: هل تُعامل كتصدير خدمات بمعدل صفري تحت المادة 33، أم خاضعة 15% باعتبار المنفعة تعود على جمهور ومعلنين داخل المملكة؟ وكيف تؤثر تعديلات المادة 47 بشأن "السوق الإلكترونية"؟ وما مستند الإثبات المقبول في غياب فاتورة عميل تقليدية؟
2. تعديل المادة 33 (2025) الذي يشترط أن يكون المستفيد المقيم **"مرتبطاً" بالعميل التعاقدي**: كيف يُطبَّق على عقد إنتاج مع شركة أجنبية يُعرض العمل الناتج عنه داخل المملكة؟
3. هل ما زالت الأحكام الانتقالية سارية بحيث تُعامل كل دول المجلس كخارج الإقليم؟ وما الوضع الحالي للنظام الإلكتروني للخدمات؟
4. **قيود المادة 50 المحدّثة على خصم مدخلات الفعاليات والضيافة:** هل تشمل الإعاشة الميدانية للطاقم (catering) وضيافة المواقع؟ وهل يوجد استثناء لكونها تكلفة إنتاج مباشرة؟
5. المقايضة العينية في عقود الرعاية: تأكيد المعالجة كتوريد خاضع بالقيمة العادلة من الطرفين، وأساس تحديد القيمة العادلة المقبول.
6. الوديعة التأمينية على المعدات: خارج النطاق حتى تُصادر؟ وما معالجتها عند المصادرة؟

## ضريبة الاستقطاع

7. الدفعة لممثل أو مخرج غير مقيم مقابل عمل **أُدّي داخل المملكة**: خدمة فنية (5%) أم إتاوة (15%)؟ وهل يتغير الحكم إذا تضمن العقد تنازلاً عن حقوق الصورة والاستغلال؟ وهل يُقسَّم العقد إلى مكوّنين بمعدلين؟
8. مدفوعات إعلانات جوجل وميتا وسناب: خدمة إعلانية أم إتاوة؟ وهل تخضع للضريبة العكسية أيضاً؟
9. اشتراكات البرمجيات السحابية (أدوات المونتاج والمؤثرات) في ضوء دليل الهيئة الصادر يناير 2024 بشأن مدفوعات البرمجيات: أي بند ينطبق؟
10. **بدل المعدات (kit fee)** لفني أجنبي: أجر خدمة أم إيجار منقولات؟
11. ترخيص موسيقى من مكتبة أجنبية (شراء ترخيص جاهز لا تكليف): إتاوة بالتأكيد؟
12. **البدل اليومي (per diem)** للطاقم الأجنبي: هل يدخل في وعاء الاستقطاع أم يُعامل كتعويض مصاريف؟

## الحوافز والزكاة

13. الحافز النقدي من هيئة الأفلام: هل هو دخل خاضع للزكاة/الضريبة؟ وهل يخضع لضريبة القيمة المضافة؟ وهل تعديلات **المادة 39** (بشأن كون مدفوعات الجهات الحكومية مقابل توريدات لا إعانات) تنطبق عليه؟
14. أصل المحتوى المرسمل والزكاة: هل يدخل في وعاء الزكاة؟ وكيف يُعامل الإطفاء والاضمحلال؟
15. الضريبة المستقطعة من المنصات الأجنبية عند المصدر (مثل الاستقطاع الأمريكي على مشاهدات أمريكية): هل تُخصم من الالتزام الضريبي في المملكة أم تُعامل كتكلفة؟

## العمل والتصنيف

16. متعاقد بوثيقة عمل حر يعمل 200 يوم سنوياً لدى نفس المنشأة: ما حد خطر إعادة التصنيف كعلاقة عمل، وما الأثر الرجعي على التأمينات ونهاية الخدمة؟
17. حصص المشاركين المدفوعة لأفراد سعوديين غير مسجلين ضريبياً: ما المستند المقبول لإثبات المصروف؟

## محاسبية

18. التصنيف الموصى به لأصل المحتوى تحت المعايير المعتمدة في المملكة: مخزون (IAS 2) أم أصل غير ملموس (IAS 38)؟ وهل توجد ممارسة سعودية سائدة؟
19. سياسة المنح: تخفيض التكلفة أم إيراد مؤجل — أيهما الأنسب لمنشأة صغيرة أو متوسطة؟
20. عتبة رسملة تكاليف مرحلة التطوير: متى تُرسمل ومتى تُصرف؟

---

# 39. خارطة الطريق التنفيذية

## الموجة 0 — تصحيح الأساس 🔴
**المدة التقديرية:** 1–2 جلسة
- تصحيح `postPurchaseToLedger` — ترحيل مشروط إلى أصل (مخزون/WIP/أصل ثابت) لا مصروف
- إنشاء حسابات WIP والمخزون الحقيقية
- ترحيل بيانات الاختبار والتحقق من الأرصدة
> **مطلوب لكل القطاعات. لا شيء يُبنى قبله.**

## الموجة 1 — الأبعاد والمشاريع 🔵
- `Dimension` / `DimensionValue` / `JournalLineDimension` + سياسات RLS
- `Project` + دورة الحياة + قواعد الانتقال
- `CostCode` + شجرة ATL/BTL الافتراضية
- ربط الأبعاد بـ `Purchase` و`Invoice` و`JournalLine`
- قواعد الإلزام بحسب نوع الحساب
> **حاجب لكل ما بعده.**

## الموجة 2 — الميزانية والالتزامات 🔵
- `ProjectBudgetLine` + `ProjectBudgetRevision`
- `Commitment` + `CommitmentConsumption`
- **تقرير التكلفة** مع اللقطات الأسبوعية
- تصدير Excel بتنسيق التسليم للممولين

## الموجة 3 — الطاقم والعهد 🟣
- `Contractor` + `CrewEngagement` + `CrewTimesheet`
- العناصر الأربعة لأجر اليوم
- `PettyCashFloat` + `PettyCashExpense` + التسوية
- علم `hasValidTaxInvoice` وحساب 5410
- مؤشر خطر إعادة التصنيف

## الموجة 4 — الضرائب والعملات 🔵
- `WhtRateTable` + `TaxTreatyRate` + `WhtTransaction` + `WhtReturn`
- مساعد اختيار فئة الاستقطاع
- الإجمالي/الخصم مع عرض الأثر
- إصدار الشهادات والإقرار الشهري والتنبيهات
- تعدد العملات كاملاً + إعادة التقييم + فروق الصرف
- الضريبة العكسية
> **حاجب لأي عميل يتعامل مع غير مقيمين — أي كل عملاء القطاع تقريباً.**

## الموجة 5 — الاعتراف بالإيراد 🔵
- `RevenueContract` + `PerformanceObligation` + `RecognitionRun`
- أصل العقد والتزام العقد
- `BillingMilestone`
- محرك نسبة الإنجاز مع استبعاد التكاليف غير المعبّرة
- العقود الخاسرة واختبار قابلية الاسترداد الآلي
- محرك أصيل/وكيل

## الموجة 6 — الأصول والحجوزات 🟣
- `FixedAsset` + الإهلاك + إعادة التحميل الداخلي
- `BookableResource` + `RateCard` + `Booking` + منع التعارض
- الودائع التأمينية
- الحزم ومؤشرات الإشغال
- IFRS 16 (اختياري في هذه الموجة)

## الموجة 7 — المحتوى والحقوق 🟠
- `ContentAsset` + محرك الإطفاء + مراجعة EU الإجبارية
- `UltimateRevenueRevision` + تقرير الفعلي مقابل التقدير
- الاضمحلال
- `RightsRecord` + `ParticipationAgreement` + محرك الاستحقاق
- `LicenseWindow` + منع التعارض

## الموجة 8 — الامتثال والحوافز 🟠
- `IncentiveClaim` + تقرير المطالبة + حواجز الموافقة المسبقة
- `LicenseRegistry` + الحجب عند الانتهاء
- `TalentRelease` + قاعدة منع النشر
- تغطية المعدل الصفري في الفوترة الإلكترونية
- **لوحة الامتثال الموحدة**

## الموجة 9 — ملفات الأنشطة 🟠
- ملف صانع المحتوى: `DigitalPlatformAccount` + `PlatformStatement` + التسوية + المقايضة
- ملف الوكالة: الاشتراكات + بنك الساعات + مطابقة الشراء الإعلامي
- ملف الاستوديو: الحزم + تقارير الإشغال المتقدمة
- ملف الموزّع: النوافذ الواردة + إطفاء الحقوق المشتراة

## الترتيب غير القابل للتبديل

```
0 ──► 1 ──► 2
       │
       ├──► 3
       ├──► 4 ──► 5
       ├──► 6
       └──► 7 ──► 8 ──► 9
```

الموجات 3 و4 و6 متوازية بعد 1. الموجة 5 تعتمد على 4 (للعملات). الموجة 7 تعتمد على 1 و2. الموجة 8 تعتمد على 2 و7.

---

# 40. اختبارات القبول

اختبارات يجب أن تمر قبل اعتبار أي موجة مكتملة.

## الموجة 0–1
- [ ] فاتورة شراء بمشروع نشط تُرحَّل إلى 1350 لا إلى 53xx
- [ ] فاتورة شراء بلا مشروع تُرحَّل إلى حساب المصروف
- [ ] محاولة ترحيل قيد إلى 1350 بلا بُعد مشروع ← رفض بخطأ واضح
- [ ] محاولة إضافة بُعد مشروع إلى قيد نقدية ← رفض
- [ ] مستأجر (أ) لا يستطيع رؤية مشاريع مستأجر (ب) — على مستوى RLS لا التطبيق فقط
- [ ] تغيير حالة المشروع إلى `cancelled` يولّد قيد الشطب تلقائياً

## الموجة 2
- [ ] أمر شراء بـ 400,000 يظهر في "المرتبط" ولا يظهر في "الفعلي"
- [ ] استلام فاتورة بـ 150,000 مقابل الأمر ← المرتبط 250,000، الفعلي 150,000
- [ ] تعديل الميزانية ينشئ نسخة جديدة والأصلية لا تتغير
- [ ] لقطة تقرير التكلفة الأسبوعية غير قابلة للتعديل بعد الحفظ

## الموجة 3
- [ ] كشف أيام بلا تعاقد موقّع ← رفض الترحيل
- [ ] كشف أيام بـ 12 يوماً + وقت إضافي + بدل معدات + بدل يومي ← أربعة سطور WIP بأكواد تكلفة مختلفة
- [ ] تسوية عهدة بمصروفات مختلطة ← ضريبة المدخلات على الصالحة فقط، والباقي إلى 5410
- [ ] مصروف عهدة بلا صورة إيصال ← رفض
- [ ] متعاقد تجاوز 120 يوماً ← يظهر التنبيه

## الموجة 4
- [ ] دفعة لغير مقيم بفئة إتاوة ← استقطاع 15% وإنشاء `WhtTransaction`
- [ ] نفس الدفعة بشرط الصافي ← الإجمالي محسوب بالقسمة على (1 − المعدل)
- [ ] محاولة تطبيق معدل اتفاقية بلا TRC مرفقة ← رفض
- [ ] TRC منتهية الصلاحية ← رفض
- [ ] محاولة إقفال الشهر مع وجود معاملات استقطاع غير مُقرَّة ← حجب
- [ ] فاتورة بالدولار ← الرصيد بالريال صحيح، وإعادة التقييم في نهاية الفترة تولّد فرقاً غير محقق
- [ ] رصيد WIP بعملة أجنبية **لا** يُعاد تقييمه

## الموجة 5
- [ ] عقد بـ 10 ملايين وتكلفة مقدرة 6 ملايين، تكلفة متكبدة 3 ملايين ← إيراد تراكمي 5 ملايين
- [ ] رفع التكلفة المقدرة إلى 7 ملايين ← النسبة تنخفض والفرق يُعالج في الفترة الحالية
- [ ] رفع التكلفة المقدرة إلى 11 مليوناً ← العقد خاسر ← مخصص فوري بكامل الخسارة
- [ ] فوترة أقل من المعترف به ← رصيد في 1360
- [ ] فوترة أكثر من المعترف به ← رصيد في 2300
- [ ] عقد بصفة وكيل ← الإيراد = العمولة فقط
- [ ] تحويل العقد إلى صفة أصيل بعد التوقيع ← رفض بلا صلاحية خاصة

## الموجة 7
- [ ] إطفاء بتنبؤ الإيراد: تكلفة 10 ملايين، EU 25 مليوناً، إيراد 12 مليوناً ← إطفاء 4.8 مليون
- [ ] تخفيض EU إلى 18 مليوناً ← لا قيد في الفترة، والمعدل يتغير في الفترة التالية
- [ ] محاولة إقفال ربع سنة مع أصل محتوى لم يُراجع EU له ← حجب
- [ ] محاولة رسملة عمل بلا `RightsRecord` مكتمل ← رفض
- [ ] بيع نافذة حصرية متداخلة مع نافذة قائمة ← رفض
- [ ] الاعتراف بإيراد من عمل عليه اتفاقية مشاركة ← استحقاق تلقائي في 2450

## الموجة 8
- [ ] تعليم مشروع كمؤهل للحافز بلا `preApprovalSignedAt` ← تحذير بارز
- [ ] الانتقال إلى `production` بلا اتفاقية حافز موقّعة لمشروع مؤهل ← تحذير
- [ ] مصروف مع مورّد خارج المملكة ← لا يُحتسب في النفقات المؤهلة
- [ ] ترخيص إنتاج منتهٍ ← منع إنشاء مشروع جديد
- [ ] فاتورة بمعدل صفري بلا مستندات إثبات ← تُعلَّم في تقرير "ناقصة الإثبات"
- [ ] محتوى فيه ظهور بلا إقرار موافقة ← منع تعليمه جاهزاً للنشر
- [ ] محاولة حذف قيد ضريبي داخل فترة الحفظ ← رفض مطلق

---

# 41. درجة التحقق من المصادر

| البند | الحالة | المصدر | الإجراء المطلوب |
|---|---|---|---|
| رفع حافز هيئة الأفلام إلى 60% | ✅ مؤكد | Variety، Deadline، Screen Daily (مايو 2026) + film.sa | — |
| الحد الأدنى للإنفاق المؤهل (750,000 / 187,000) | ✅ مؤكد | film.sa مباشرة | مراجعة دورية |
| الحد الأدنى لأيام التصوير (5 أيام) | ✅ مؤكد | film.sa مباشرة | — |
| قائمة النفقات المؤهلة | ✅ مؤكد | film.sa مباشرة | — |
| المستندات المطلوبة للحافز | ✅ مؤكد | film.sa مباشرة | — |
| **دليل إجراءات التدقيق المالي والصرف** | ⚠️ **لم يُقرأ** | مذكور في تصريحات هيئة الأفلام | **تنزيل وقراءة إلزامية قبل الموجة 8** |
| النسب الفعلية بحسب فئة الإنفاق | ⚠️ غير معروفة | "ما يصل إلى 60%" | مراجعة الدليل |
| معدلات الاستقطاع 5/15/20% | ✅ متسقة | PwC، DLA Piper، مصادر مهنية متعددة | **مطابقة بالنص النظامي (المادة 68) قبل الترميز** |
| موعد الإقرار (العاشر من الشهر التالي) | ✅ متسق | مصادر متعددة | — |
| دليل الهيئة لمدفوعات البرمجيات (يناير 2024) | ✅ موجود | DLA Piper | **قراءة كاملة مطلوبة** |
| تعديلات اللائحة التنفيذية للضريبة 2025 (المواد 33، 39، 47، 50، 73) | ✅ مؤكدة | KPMG، EY | **قراءة النص المعدَّل كاملاً** |
| شروط المعدل الصفري (المادة 33) | ⚠️ جزئي | BDO، دليل الهيئة (الرابط معطّل) | **الحصول على الدليل من مركز المعرفة مباشرة** |
| الأحكام الانتقالية لدول المجلس | ⚠️ **قد تكون تغيّرت** | مصدر 2019 | **التحقق من الوضع الحالي — سؤال 3** |
| معالجة إيرادات المنصات الرقمية | ❌ **لا مصدر رسمي** | — | **أهم سؤال للمستشار** |
| اللائحة التنفيذية المحدّثة لحقوق المؤلف | ✅ صدرت (~يوليو 2026) | الهيئة عبر تغطية إعلامية | **قراءة النص الكامل من saip.gov.sa** |
| رسوم تسجيل المصنفات لدى SAIP | ✅ منشورة | saip.gov.sa | تُخزَّن في RateTable |
| تراخيص الهيئة العامة لتنظيم الإعلام | ✅ مؤكدة | gmedia.gov.sa | — |
| **رسوم ترخيص موثوق** | ❌ **متضاربة بشدة** | مصادر غير رسمية متناقضة | **لا تُدخل في الكود إطلاقاً** |
| شروط ترخيص موثوق | ✅ منشورة | gmedia.gov.sa | — |
| منصة أبدع ونطاقها | ✅ مؤكدة | وكالة الأنباء السعودية، moc.gov.sa | — |
| وثيقة العمل الحر (الشروط والتأمينات) | ✅ متسقة | hrsd.gov.sa + مصادر ثانوية | التحقق من الشرائح الحالية |
| شروط إصدار تأشيرات العمل عبر قوى | ✅ مؤكدة | qiwa.sa | — |
| الموجة 25 (187,500 ريال / 1 فبراير 2027) | ✅ مؤكدة سابقاً | مسارات سابقة | — |
| مدة حفظ السجلات (6 سنوات) | ✅ مؤكدة سابقاً | مسارات سابقة | — |
| PwC MIAG رقم 10 (رسملة تكاليف الأفلام) | ⚠️ **لم تُقرأ** | موجودة | **قراءة مفيدة قبل الموجة 7** |

## الخطوات الفورية التالية

1. **حسم ح-1** (نظام الأبعاد) — يحدد شكل النواة للسنوات القادمة ويؤثر على قطاعات لم نصل إليها بعد
2. **تنزيل وقراءة:** دليل إجراءات التدقيق المالي والصرف (هيئة الأفلام)، دليل توريد الخدمات لغير المقيمين (الهيئة)، دليل مدفوعات البرمجيات (الهيئة، يناير 2024)، اللائحة التنفيذية المحدّثة لحقوق المؤلف (SAIP)، ورقة PwC MIAG رقم 10
3. **إرسال الأسئلة العشرين** في القسم 38 لمستشار ضريبي مرخّص
4. **بدء الموجة 0** — مطلوبة لكل القطاعات على أي حال

---

*انتهت المواصفة.*
