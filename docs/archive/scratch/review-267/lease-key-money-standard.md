# خلوُّ الرِّجل ومعيارُ عقود الإيجار — ما يقوله النصّ، ثم الأسئلةُ الأحدَ عشرَ بخياراتها (`ق-١٤٩٢`)

> **بنصّ المالك** (`docs/decisions.md:3754`): «**«على مدّة العقد» حكمي لا نصّ. ⇒ اقرأ المعيارَ الدوليَّ لعقود الإيجار ونسختَه المعتمدة سعودياً، ثم الأسئلةُ الأحدَ عشرَ بخياراتها وما يقوله النصّ. ⛔ ولا بناء.**»
>
> **حدودُ هذا العمل**: قراءةٌ فقط — لا تعديلَ في المستودع، ولا تشغيلَ لأيّ محطة اختبار، ولا تواصلَ مع أيّ جهة. المصادرُ صفحاتٌ ووثائقُ رسمية عامّة قُرئ نصُّها. كلُّ اقتباسٍ حرفيٌّ من مصدره بموضعه، وما لم يُقَس مكتوبٌ «لم يُقَس».
>
> **تاريخُ القراءة**: المصادرُ الخارجية كلُّها جُلبت وقُرئت **2026-09-26**؛ وقراءاتُ الشيفرة بين 2026-09-26 و2026-09-27 (التشغيلُ عبر منتصف الليل).
>
> **الشجرة المقروءة**: طُلب العملُ على `56ae0157`، ووُجد `main` عند القراءة على **`034f94db`** (التزامٌ واحد بعده: `#636` «النسخةُ المشتركة على main»). **`git diff --stat 56ae0157 HEAD` على الملفّات الخمسة المقروءة هنا فارغ** — فأرقامُ الأسطر أدناه صالحةٌ للالتزامَين.

---

## ٠) الخلاصة

1. **حكمُ المالك «على مدّة العقد» يوافق النصَّ في جهته ويخالفه في مقياسه.**
   - **في جهته — للمقبوض (`RECEIVED`)**: النصُّ **يمنع الاعترافَ الفوريّ الحاليّ** ويوجب التوزيعَ: IFRS 16 الفقرة **81** («on either a straight-line basis or another systematic basis»)، ومعيارُ المنشآت الصغيرة والمتوسطة الفقرة **20.25** («on a straight-line basis over the lease term») — **بشرط أن يكون الخلوُّ مدفوعاً من المستأجر إلى المؤجِّر مقابلَ حقّ الاستعمال**، فهو حينئذٍ داخلٌ في تعريف «lease payments» / «fixed payments» (الملحق A). والشيفرةُ اليوم تقول بنصّها «**Not rent**» (`apps/api/src/journal/auto-posting.util.ts:1933`) وترحّله إلى `4300` كاملاً — وهذا **يخالف التعريفَ** لا الحكمَ وحده.
   - **في مقياسه**: النصُّ لا يقول «مدّة العقد» بل **«lease term»** — وهو معرَّفٌ (الفقرة **18** والملحق A): **الفترةُ غيرُ القابلة للإلغاء مع فترات التمديد المؤكَّد بدرجةٍ معقولة**، وقرارُ لجنة التفسيرات (نوفمبر 2019) يوجب النظرَ في «**the broader economics of the contract**» عند تحديد الفترة القابلة للإنفاذ. **فقد تطول «مدّةُ الإيجار» عن «مدّة العقد» المكتوبة** — وهو الشائعُ في العقود التجارية السنوية المتجدّدة.
   - **للمدفوع (`PAID`)**: النصُّ يوافق التوزيعَ على المدّة لا الإبقاءَ في `1600` إلى الأبد — لكنّ **آليته تختلف بالمعيار**: في IFRS 16 يدخل **كلفةَ أصل حقّ الاستعمال** (الفقرة **24(b)** إن دُفع للمؤجِّر، أو **24(c)** إن كان كلفةً مباشرةً أولية) ويُستهلك إلى «end of the lease term» (الفقرة **32**) — **مدّةُ الإيجار الذي تكون المنشأةُ فيه مستأجراً** لا عقدِ الإيجار من الباطن؛ وفي معيار المنشآت يُصرَف **بالقسط الثابت على مدّة الإيجار** (الفقرة **20.15**) إن كان دفعةَ إيجارٍ للمؤجِّر، **والنصُّ ساكتٌ** إن دُفع لطرفٍ ثالث (المستأجر الخارج).
2. **النسخةُ السعودية لا تغيّر شيئاً من الاعتراف أو القياس.** وثيقةُ اعتماد SOCPA (المراجَعة 2025-12-24) تعتمد IFRS 16 بثلاث فقراتٍ مضافة **كلُّها إفصاح** (`60A` · `94A` · `102B`)، وتعتمد معيارَ المنشآت (الطبعتين الثانية والثالثة) بتعديلاتٍ على **الأقسام 3 و4 و5 و7 وحدها — لا شيءَ على القسم 20**. والطبعةُ الثالثة (2025) تحلّ محلّ الثانية **للفترات التي تبدأ في 2027-01-01 أو بعده**.
3. **ما يحسمه النصّ من الأسئلة الأحدَ عشر**: السؤال ① (المعيار) **يحسمه** للمقبوض؛ و② **يجعل جوابَ الجلسة الميدانية حاسماً** (التصنيفُ يتبع مَن دفع لمن)؛ و④ **يحسمه** (مدّةُ الإيجار الرئيس)؛ و⑤ و⑦ **يتكلّم فيهما** عبر تعديل عقد الإيجار (الفقرة **87**)؛ و⑥ **يتكلّم في شقّ المدفوع** (الفقرة **46(a)**: «gain or loss») **ويسكت عن الإنهاء الكامل في شقّ المقبوض**؛ و⑩ **يتكلّم** (IAS 8 الفقرتان **42** و**46**). **ويسكت** عن ③ (الضريبة — خارج المعايير المحاسبية) و⑧ (أسماءُ الحسابات — مع ميلٍ من الفقرة **90(b)** إلى «دخل إيجار» لا «إيرادات أخرى») و⑨ (جزئياً) و⑪ (شكلُ الحفظ).

---

## ١) ما قُرئ وما لم يُقرأ — بالرابط والحال

| # | المصدر | الرابط | الحال (2026-09-26) |
|---|---|---|---|
| م١ | صفحةُ IFRS 16 على موقع المؤسسة | https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/ | **قُرئ «About» والتاريخ فقط**. تبويبُ «Standard» **يتطلّب تسجيلَ الدخول**: الصفحةُ تعرض «You need to Sign in to use this feature»، وروابطُها تمرّ بـ`/bin/oauth-redirect.html/…/j_security_check?configid=ifrs-idp`. **فالنصُّ المحدَّث الحاليّ لم يُقرأ من هذه الصفحة.** |
| م٢ | **نصُّ IFRS 16 كاملاً** — مجلّد «2021 Issued Standards، Part A» من المؤسسة نفسِها | https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ifrs-16-leases.pdf | **قُرئ كاملاً**: `HTTP 200` · `application/pdf` · `294,578` بايت · صفحاتٌ مطبوعة `A819`–`A869` (`52` فاصلَ صفحةٍ في مخرَج `pdftotext`؛ **عددُ شجرة الصفحات لم يُقرأ** — الكائنات مضغوطة). **حدُّه**: قسمُ تاريخه يذكر تعديلات 2020 (كوفيد مايو 2020 · IBOR أغسطس 2020) **ولا يذكر ما بعدها**؛ وصفحةُ م١ تسمّي لاحقاً «Lease Liability in a Sale and Leaseback» (سبتمبر 2022) وتعديلاتٍ تبعيةً من IFRS 18 (أبريل 2024) — **لم يُقرأ نصُّها، وأثرُها على فقرات المؤجِّر لم يُقَس.** |
| م٣ | «Project Summary and Feedback Statement» لـIFRS 16 (يناير 2016) | https://www.ifrs.org/content/dam/ifrs/project/leases/ifrs/published-documents/ifrs16-project-summary.pdf | قُرئ ما يخصّ المؤجِّر (`HTTP 200`، `209,904` بايت). |
| م٤ | **معيارُ المنشآت الصغيرة والمتوسطة، الطبعةُ الثالثة (فبراير 2025)** — نصٌّ HTML كامل من المؤسسة | https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/html-ifrs-for-smes.html | **قُرئ القسمُ 20 كاملاً** والمسرد والقسمُ 10 وملحقُ السريان (`HTTP 200`، `1,752,540` بايت). |
| م٥ | معيارُ المنشآت، الطبعةُ الثانية (2015) | جُرّب: `…/html-standards/english/2021/required/sme/` و`…/pdf-standards-ifrs-for-smes/english/2015/ifrs-for-smes-2015.pdf` | **لم يُقرأ** — الرابطان ردّا `404`. ⚠️ وهي الطبعةُ النافذةُ اليوم سعودياً لمن لم يطبّق الثالثة مبكراً (انظر م٧) — **فمطابقتُها للفقرتين 20.15 و20.25 من الثالثة لم تُقَس.** |
| م٦ | IAS 8 — مجلّد 2021 من المؤسسة | https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors.pdf | قُرئت الفقرات 10–11 و42–46 (`HTTP 200`، `130,577` بايت). **حدُّه**: عنوانُ المعيار تغيّر بعد IFRS 18 (انظر م٧)، وترقيمُ فقرات الأخطاء في النصّ المحدَّث **لم يُقَس**. |
| م٧ | **وثيقةُ اعتماد المعايير الدولية ومعيار المنشآت في المملكة** — SOCPA، «مراجَعة 04/07/1447هـ الموافق 24/12/2025م» | صفحةُ الوثيقة: https://socpa.org.sa/Socpa/Professional-standards/Accounting-standards/Auditing-Standards-Endorsed.aspx ← الملف: https://socpa.org.sa/SOCPA/files/a6/a601d8e2-b506-4816-897b-a582e31c5f4e.pdf | **قُرئ العمودُ الإنجليزيّ** للأقسام المعنيّة (`67` صفحة بقراءة `file` لشجرة الصفحات · `1,204,587` بايت). الرابطُ الإنجليزيّ (`…/Auditing-Standards-Endorsed/2905.aspx`) والعربيّ يُفضيان إلى **الملفّ نفسِه** (`md5` متطابق: `910e62b4…`). ⚠️ **العمودُ العربيّ لم يُقرأ**: `pdftotext` أخرجه فراغاً (حروفٌ غائبة)، وتصييرُ الصفحات يحتاج Playwright المحظورَ في هذه المهمة. **ولم يُعثر في العمود الإنجليزيّ على نصٍّ يقدّم إحدى اللغتين** (البحث عن `prevail` وجد موضعاً واحداً غيرَ ذي صلة، السطر `1359` من المستخرَج). |
| م٨ | صفحتا SOCPA «Accounting Standards Endorsed» و«IFRS for SMEs» | `…/Accounting-standards/Endorsed.aspx` · `…/Accounting-standards/smes.aspx` | **لم تُقرآ — تتطلّبان تسجيلَ الدخول**: كلتاهما تحوّلان إلى `https://sso.socpa.org.sa/?returnUrl=https://socpa.org.sa/Login.aspx`. **فالترجمةُ العربية المعتمدة لـIFRS 16 ولمعيار المنشآت لم تُقرأ.** |
| م٩ | خبرُ SOCPA باعتماد الطبعة الثالثة لمعيار المنشآت (25 يناير 2026) | https://socpa.org.sa/Socpa/Media-Center/News/2026/4079.aspx?lang=en-us | قُرئ. |
| م١٠ | ملفُّ المملكة لدى المؤسسة (Jurisdictional Profile) — «Profile last updated: 28 July 2022» | https://www.ifrs.org/content/dam/ifrs/publications/jurisdictions/pdf-profiles/saudi-arabia-ifrs-profile.pdf | قُرئ قسما «IFRS ENDORSEMENT» و«APPLICATION OF THE IFRS FOR SMEs». ⚠️ **بنصّه**: «The information in this Profile is for general guidance only». |
| م١١ | قرارُ لجنة التفسيرات «Lease Term and Useful Life of Leasehold Improvements» — IFRIC Update نوفمبر 2019 | https://www.ifrs.org/news-and-events/updates/ifric/2019/ifric-update-november-2019/ | قُرئ النصُّ كاملاً (صفحةُ المشروع نفسُها لا تحمل النصّ ثابتاً). |
| — | **لم يُقرأ أصلاً** | — | «الأساسُ في الاستنتاجات» لـIFRS 16 · الأمثلةُ التوضيحية (ومنها تعديلُ المثال 13 «Lease Incentives») · IFRS 9 (إلغاءُ الاعتراف والودائع المستردّة) · IFRS 15 (الأصيلُ والوكيل) · IAS 38 · IAS 40 · قرارُ «Non-refundable Value Added Tax on Lease Payments» · نظامُ ضريبة القيمة المضافة ولائحتُه. |

**⚠️ ولا شيءَ في أيٍّ ممّا قُرئ يسمّي «خلوَّ الرِّجل» (key money).** المسبار: `grep -i` على نصّ IFRS 16 كاملاً وعلى القسم 20 من معيار المنشآت بالكلمات `key money` · `premium` · `assign` ⇒ **صفر** في الاثنين. **والشاهدُ أنّ المسبارَ يرى**: الكلمتان `lump-sum` و`upfront` بالطريقة نفسِها أصابتا **موضعاً واحداً** في IFRS 16 (الفقرة **B56**، أدناه). **فكلُّ حكمٍ أدناه على الخلوّ استنباطٌ من التعريفات لا نصٌّ يسمّيه** — وهذا يُقال في كل سؤال.

---

## ٢) الحالُ في الشيفرة — مقروءٌ في هذا التشغيل

| الموضع | ما فيه |
|---|---|
| `apps/api/prisma/schema.prisma:3924-3931` | `enum KeyMoneyDirection` — `RECEIVED` «The tenant paid the company for the right to the location» · `PAID` «The company paid to take over a leased location — goodwill attached to the site, not rent». |
| `apps/api/prisma/schema.prisma:3935-3964` | `model ContractKeyMoney` — اتجاهٌ ومبلغٌ وعملةٌ وسعرُ صرف **بلا حقلِ فترةٍ ولا عدّادِ اعتراف**. |
| `apps/api/src/journal/auto-posting.util.ts:1932-1935` | تعليقُ الترحيل بنصّه: «**Received** — cash in, other income. **Not rent**: it buys the *right to the location*». |
| `apps/api/src/journal/auto-posting.util.ts:1940-1943` | «⚠️ **Amortization is not implemented.** Paid key money sits in 1600 until someone writes it down with a manual journal entry.» |
| `apps/api/src/journal/auto-posting.util.ts:1945-1968` | `postKeyMoneyEntry`: المقبوض مدين `1000` / دائن `OTHER_INCOME_ACCOUNT`؛ والمدفوع مدين `KEY_MONEY_ASSET_ACCOUNT` / دائن `1000`. والثابتان: `OTHER_INCOME_ACCOUNT = '4300'` (`:1623`) · `KEY_MONEY_ASSET_ACCOUNT = '1600'` (`:1916`). |
| `apps/api/src/contracts/contracts.service.ts:920-930` | `recordKeyMoney` يقرأ العقدَ (`:923`) ثم يرحّل (`:930`) **بلا فحصٍ لحالة العقد** — يؤكّد ثغرةَ الموجز §٤-1. وتعليقُه (`:916-918`) يُقرّ بخلوٍّ ثانٍ «a top-up on renewal». |
| `apps/api/prisma/schema.prisma:3428-3437` | `enum ContractStatus`: `DRAFT` · `UPCOMING` («Signed and confirmed, but its term hasn't started yet — the state a renewal sits in between agreement and the old lease expiring») · `DUE` · `LATE` · `CANCELLED`. **فالتجديدُ في النظام عقدٌ جديد** — وهذا يمسّ السؤال ⑤. |
| `apps/web/src/pages/contracts/KeyMoneySection.tsx:12-15` | «يُسجَّل نقداً وارداً ضمن إيرادات أخرى» · «يُسجَّل أصلاً في حساب «تقبيل وحقوق انتفاع» لا مصروفاً — منفعته تمتد طوال مدة الإيجار». |

**⚠️ انحرافُ أرقام الأسطر في الموجز** (`docs/موجز-إطفاء-خلو-الرجل.md`): يحيل إلى `schema.prisma:3905-3947` والنموذجُ فعلاً `3935-3964` (السطر `3905` داخل `HandoverItem`)؛ وإلى `auto-posting.util.ts:1950-1975` للقيدين و`:1945-1948` للإقرار بالغياب، والفعليُّ `1945-1968` و`1940-1943`. **المضمونُ مطابق والأرقامُ منزاحة** — تُصحَّح في الموجز حين يُعاد.

---

## ٣) نصوصُ IFRS 16 — من م٢، حرفياً بأرقام فقراتها

### ٣-أ) التعريفات (الملحق A — «This appendix is an integral part of the Standard.»)

- **lease payments**: «Payments made by a lessee to a lessor relating to the right to use an underlying asset during the lease term, comprising the following: (a) fixed payments (including in-substance fixed payments ), less any lease incentives; …» — و«For the lessor, … Lease payments do not include payments allocated to non-lease components.»
- **fixed payments**: «Payments made by a lessee to a lessor for the right to use an underlying asset during the lease term, excluding variable lease payments.»
  *(الاقترانُ بين المصطلح وتعريفه في هذا الموضع قُرئ بمطابقة الترتيب في النسختين المستخرَجتين — العمودان متداخلان في الـPDF.)*
- **lease incentives**: «Payments made by a lessor to a lessee associated with a lease, or the reimbursement or assumption by a lessor of costs of a lessee.»
- **initial direct costs**: «Incremental costs of obtaining a lease that would not have been incurred if the lease had not been obtained, except for such costs incurred by a manufacturer or dealer lessor in connection with a finance lease.»
- **lease term**: «The non-cancellable period for which a lessee has the right to use an underlying asset, together with both: (a) periods covered by an option to extend the lease if the lessee is reasonably certain to exercise that option; and (b) periods covered by an option to terminate the lease if the lessee is reasonably certain not to exercise that option.»
- **lease modification**: «A change in the scope of a lease, or the consideration for a lease, that was not part of the original terms and conditions of the lease (for example, adding or terminating the right to use one or more underlying assets, or extending or shortening the contractual lease term).»
- **effective date of the modification**: «The date when both parties agree to a lease modification.»
- **commencement date of the lease**: «The date on which a lessor makes an underlying asset available for use by a lessee.»
- **inception date of the lease**: «The earlier of the date of a lease agreement and the date of commitment by the parties to the principal terms and conditions of the lease.»
- **short-term lease**: «A lease that, at the commencement date, has a lease term of 12 months or less. A lease that contains a purchase option is not a short-term lease.»
- **sublease**: «A transaction for which an underlying asset is re-leased by a lessee (`intermediate lessor') to a third party, and the lease (`head lease') between the head lessor and lessee remains in effect.»
- **contract** (معرَّفٌ في معيارٍ آخر): «An agreement between two or more parties that creates enforceable rights and obligations.»

### ٣-ب) المؤجِّر

- **61**: «A lessor shall classify each of its leases as either an operating lease or a finance lease.»
- **62**: «A lease is classified as a finance lease if it transfers substantially all the risks and rewards incidental to ownership of an underlying asset. A lease is classified as an operating lease if it does not transfer substantially all the risks and rewards incidental to ownership of an underlying asset.»
- **63** (أمثلةُ التمويليّ): «(a) the lease transfers ownership of the underlying asset to the lessee by the end of the lease term; … (c) the lease term is for the major part of the economic life of the underlying asset even if title is not transferred; (d) at the inception date, the present value of the lease payments amounts to at least substantially all of the fair value of the underlying asset; …»
- **66**: «Lease classification is made at the inception date and is reassessed only if there is a lease modification.»
- **81** ⭐: «A lessor shall recognise lease payments from operating leases as income on either a straight-line basis or another systematic basis. The lessor shall apply another systematic basis if that basis is more representative of the pattern in which benefit from the use of the underlying asset is diminished.»
- **83**: «A lessor shall add initial direct costs incurred in obtaining an operating lease to the carrying amount of the underlying asset and recognise those costs as an expense over the lease term on the same basis as the lease income.»
- **87** ⭐: «A lessor shall account for a modification to an operating lease as a new lease from the effective date of the modification, considering any prepaid or accrued lease payments relating to the original lease as part of the lease payments for the new lease.»
- **90(b)**: «for operating leases, lease income, separately disclosing income relating to variable lease payments that do not depend on an index or a rate.»
- **97**: «A lessor shall disclose a maturity analysis of lease payments, showing the undiscounted lease payments to be received on an annual basis for a minimum of each of the first five years and a total of the amounts for the remaining years.»
- **17**: «For a contract that contains a lease component and one or more additional lease or non-lease components, a lessor shall allocate the consideration in the contract applying paragraphs 73-90 of IFRS 15.»
- **B56** ⭐ (الموضعُ الوحيد الذي يذكر الدفعةَ المقطوعة المقدَّمة): «Whenever necessary in order to classify and account for a lease of land and buildings, a lessor shall allocate lease payments (including any lump-sum upfront payments) between the land and the buildings elements …»
- **ملخّصُ المشروع (م٣، ص1)**: «IFRS 16 substantially carries forward the lessor accounting requirements in IAS 17. Accordingly, a lessor continues to classify its leases as operating leases or finance leases, and to account for those two types of leases differently.»

### ٣-ج) مدّةُ الإيجار — للطرفين («An entity» لا «a lessee»)

- **18**: «An entity shall determine the lease term as the non-cancellable period of a lease, together with both: (a) periods covered by an option to extend the lease if the lessee is reasonably certain to exercise that option; and (b) periods covered by an option to terminate the lease if the lessee is reasonably certain not to exercise that option.»
- **B34**: «… an entity shall apply the definition of a contract and determine the period for which the contract is enforceable. A lease is no longer enforceable when the lessee and the lessor each has the right to terminate the lease without permission from the other party with no more than an insignificant penalty.»
- **B36**: «The lease term begins at the commencement date and includes any rent-free periods provided to the lessee by the lessor.»
- **B37** (عواملُ التمديد المؤكَّد): «… (b) significant leasehold improvements undertaken (or expected to be undertaken) over the term of the contract …; (c) costs relating to the termination of the lease, such as negotiation costs, relocation costs, costs of identifying another underlying asset suitable for the lessee's needs …; (d) the importance of that underlying asset to the lessee's operations, considering, for example, … the location of the underlying asset and the availability of suitable alternatives; …»
- **B39**: «The shorter the non-cancellable period of a lease, the more likely a lessee is to exercise an option to extend the lease or not to exercise an option to terminate the lease.»
- **B2** (ضمُّ العقود): «… an entity shall combine two or more contracts entered into at or near the same time with the same counterparty (or related parties of the counterparty), and account for the contracts as a single contract if one or more of the following criteria are met: (a) the contracts are negotiated as a package with an overall commercial objective that cannot be understood without considering the contracts together; (b) the amount of consideration to be paid in one contract depends on the price or performance of the other contract; …»

**وقرارُ لجنة التفسيرات (م١١، نوفمبر 2019)** بنصّه: «The Committee observed that, in applying paragraph B34 and determining the enforceable period of the lease described in the request, an entity considers: the broader economics of the contract, and not only contractual termination payments. For example, if either party has an economic incentive not to terminate the lease such that it would incur a penalty on termination that is more than insignificant, the contract is enforceable beyond the date on which the contract can be terminated; …» — ومثالُه في القرار **تحسيناتُ المأجور غير القابلة للنزع**، **لا الخلوّ**.

### ٣-د) المستأجر — لشقّ المدفوع

- **5–6**: «A lessee may elect not to apply the requirements in paragraphs 22-49 to: (a) short-term leases; …» · «… the lessee shall recognise the lease payments associated with those leases as an expense on either a straight-line basis over the lease term or another systematic basis.»
- **24**: «The cost of the right-of-use asset shall comprise: (a) the amount of the initial measurement of the lease liability …; (b) any lease payments made at or before the commencement date, less any lease incentives received; (c) any initial direct costs incurred by the lessee; …»
- **32**: «… Otherwise, the lessee shall depreciate the right-of-use asset from the commencement date to the earlier of the end of the useful life of the right-of-use asset or the end of the lease term.»
- **34**: «If a lessee applies the fair value model in IAS 40 Investment Property to its investment property, the lessee shall also apply that fair value model to right-of-use assets that meet the definition of investment property in IAS 40.»
- **45(b)**: «determine the lease term of the modified lease applying paragraphs 18-19; …»
- **46**: «(a) decreasing the carrying amount of the right-of-use asset to reflect the partial or full termination of the lease for lease modifications that decrease the scope of the lease. The lessee shall recognise in profit or loss any gain or loss relating to the partial or full termination of the lease. (b) making a corresponding adjustment to the right-of-use asset for all other lease modifications.»
- **48**: «The requirement in paragraph 47(a) does not apply to right-of-use assets that meet the definition of investment property, which shall be presented in the statement of financial position as investment property.»
- **B58**: «In classifying a sublease, an intermediate lessor shall classify the sublease … (b) otherwise, the sublease shall be classified by reference to the right-of-use asset arising from the head lease, rather than by reference to the underlying asset …»

### ٣-هـ) IAS 8 (م٦) — لسؤال القائم

- **42**: «Subject to paragraph 43, an entity shall correct material prior period errors retrospectively in the first set of financial statements authorised for issue after their discovery by: (a) restating the comparative amounts for the prior period(s) presented in which the error occurred; or (b) if the error occurred before the earliest prior period presented, restating the opening balances of assets, liabilities and equity for the earliest prior period presented.»
- **46**: «The correction of a prior period error is excluded from profit or loss for the period in which the error is discovered.»
- **10** (عند غياب النصّ): «In the absence of an IFRS that specifically applies to a transaction, other event or condition, management shall use its judgement in developing and applying an accounting policy that results in information that is: (a) relevant …; and (b) reliable …»

---

## ٤) النسخةُ المعتمدة سعودياً — من م٧ (العمود الإنجليزيّ)

*(أرقامُ الصفحات هنا أرقامُ صفحات ملفّ الـPDF بعدّ فواصل الصفحات في المستخرَج — لا الرقمُ المطبوع «SOCPA n» الذي ينزاح عنها بصفحة.)*

- **معنى «المعتمد»** (ص7، «Important points to be considered in reading this document», البند 5): «The word "IFRSs" is read whenever it appears to mean `IFRSs that are endorsed in Saudi Arabia and other standards and pronouncements endorsed by SOCPA'. The "endorsed" standards are IFRSs as issued by IASB in addition to the requirements and disclosures added to some standards by SOCPA.»
- **وطبيعةُ التعديلات** (البند 1): «The modifications (if any) in general are either an endorsement of an alternative allowed by the standards, additional disclosure, or a recognition of a Saudi specific factor».
- **اعتمادُ IFRS 16** (البند 3 من «Approval and Revisions»): «… resolution dated 26/8/1438 A.H, corresponding to 22/5/2017 A.D, endorsing IFRS 16 Leases and IFRIC 22 …»؛ والبند 6: «… resolution dated 19/5/1444 A.H, corresponding to 13/12/2022 A.D, that requires additional disclosures relating to the amendment issued by IASB to IFRS 16 Leases in September 2022.»
- **نصُّ الاعتماد** (ص37 من ملفّ الـPDF): «IFRS 16 Leases is endorsed for endorsement taking in consideration the following modification:» — ثم **ثلاث فقراتٍ مضافة فقط**:
  - **60A** (للمستأجر): «To fulfil the requirement of paragraph 59(a) which requires disclosure of the nature of the lessee's leasing activities, the contractual terms, for each party to lease contract, at minimum in relation to ownership, basic maintenance, guarantee and insurance of the leased asset, and the ownership transfer arrangements (if any) shall be disclosed.»
  - **94A** (للمؤجِّر): «To fulfil the requirement of paragraph 92(a) which requires the disclosure of the nature of the lessor's leasing activities, (a) contractual terms, for each party to lease contract in relation to ownership, basic maintenance, guarantee, and insurance of the leased asset and the ownership transfer arrangements (if any); and (b) contractual effects of termination of the contract because of the force majeure and whether lessee is required to pay the subsequent lease payments shall be disclosed.»
  - **102B**: إفصاحاتٌ عن البيع وإعادة الاستئجار بدفعاتٍ متغيّرة.
- **⟸ لا تعديلَ سعوديٌّ على الاعتراف أو القياس في IFRS 16.** المسبار: قراءةُ قسم IFRS 16 كاملاً في الوثيقة (ص37–38) — والفقراتُ الثلاث كلُّ «Reason for the addition» فيها عن الإفصاح. **والشاهدُ أنّ المسبارَ يرى التعديلات**: البحثُ نفسُه (`grep -i lease`) أمسك الفقرات الثلاث وأمسك إضافةَ IAS 40 **75A** (ص27–28): «An entity shall disclose separately the amount of investment properties held for rental income and for capital appreciation and of those that the entity held for a currently undetermined future use.»
- **IAS 8** (ص17): «The IAS 8 Accounting Policies, Changes in Accounting Estimates and Errors is endorsed as it was first issued by the IASB without any modifications.» ثم: «… the consequential amendments made by IASB to the standard arising from IFRS 18 were endorsed, including changing the Standard's title to become Basis of Preparation of Financial Statements …».
- **معيارُ المنشآت** (ص54 وص61): الطبعةُ الثانية «(This Standard shall be superseded by the IFRS for SMEs Accounting Standard, Third Edition, 2025, for the annual reporting periods beginning on or after 1/1/2027. Early application is permitted)»؛ والتعديلاتُ الخاصّة في الطبعتين **على الأقسام 3 و4 و5 و7 وحدها**. المسبار: كلُّ عنوان «Section …» من السطر `3338` إلى آخر المستخرَج ⇒ الأقسام `3 · 4 · 5 · 7` مرّتين (الطبعتان) **ولا قسمَ 20** — **والمسبارُ يرى** لأنه أمسك الأقسامَ الأربعة وفقراتها (`3.9` · `3.25` · `4.11` · `5.5` · `5.12` · `5.13` · `7.4` · `7.22`).
- **خبرُ الاعتماد** (م٩، 25 يناير 2026): «… the Board resolved on 04/07/1447 AH (corresponding to December 24, 2025) to approve the adoption of the updated version (third edition) of the IFRS for SMEs Accounting Standard in Saudi Arabia, with early adoption permitted, taking into account the modifications set out in the endorsement document for IFRS in Saudi Arabia.»
- **مَن يطبّق أيَّهما** (م١٠، بتحديث 2022-07-28 وتحت تنويهه): «All IFRS Accounting Standards are required for publicly accountable entities. Other entities may use full IFRS Accounting Standards or IFRS for SMEs Standard.» و«All SMEs (as defined in the IFRS for SMEs Accounting Standard) are required to use the IFRS for SMEs Accounting Standard endorsed in Saudi Arabia. Alternatively, an SME is permitted to use full IFRS Accounting Standards that are endorsed in Saudi Arabia, with two conditions: …». ⚠️ **وهل يُلزَم المؤجِّرُ الفرد (غيرُ الشركة) بأيٍّ منهما: لم يُقَس.**

---

## ٥) معيارُ المنشآت الصغيرة والمتوسطة، القسم 20 — من م٤ (الطبعة الثالثة 2025)

- **A1** (السريان): «… An entity shall apply the amended and revised sections for annual periods beginning on or after 1 January 2027. Earlier application is permitted.»
- **20.4**: «A lease is classified as a finance lease if it transfers substantially all the risks and rewards incidental to ownership. A lease is classified as an operating lease if it does not transfer substantially all the risks and rewards incidental to ownership.»
- **20.8**: «Lease classification is made at the inception of the lease and is not changed during the term of the lease unless the lessee and the lessor agree to change the provisions of the lease (other than simply by renewing the lease), in which case the lease classification shall be re-evaluated.»
- **20.15** (المستأجر، التشغيليّ): «A lessee shall recognise lease payments under operating leases (excluding costs for services such as insurance and maintenance) as an expense over the lease term on a straight-line basis unless either: (a) another systematic basis is representative of the time pattern of the user's benefit, even if the payments are not on that basis; or (b) the payments to the lessor are structured to increase in line with expected general inflation …»
- **20.24**: «A lessor shall present assets subject to operating leases in its statement of financial position according to the nature of the asset.»
- **20.25** ⭐ (المؤجِّر، التشغيليّ): «A lessor shall recognise lease income from operating leases (excluding amounts for services such as insurance and maintenance) in profit or loss on a straight-line basis over the lease term, unless either: (a) another systematic basis is representative of the time pattern of the lessee's benefit from the leased asset, even if the receipt of payments is not on that basis; or (b) the payments to the lessor are structured to increase in line with expected general inflation (based on published indexes or statistics) to compensate for the lessor's expected inflationary cost increases.»
- **20.27**: «A lessor shall add to the carrying amount of the leased asset any initial direct costs it incurs in negotiating and arranging an operating lease and shall recognise such costs as an expense over the lease term on the same basis as the lease income.»
- **المسرد — lease**: «An agreement whereby the lessor conveys to the lessee in return for a payment or series of payments the right to use an asset for an agreed period of time.»
- **⟸ ولا تعريفَ لـ«lease term» في مسرد الطبعة الثالثة، ولا ذِكرَ لـ«lease incentives» في القسم 20.** المسبار: كلُّ سطرٍ في المسرد يبدأ بـ`lease` ⇒ مدخلان فقط («lease An agreement…» و«lessee's incremental borrowing rate…»)؛ و`grep -i incentive` على الطبعة كاملةً ⇒ موضعان خارج القسم 20 («sales incentives» في الإيراد، و«‘incentive’ or ‘penalty’» في العملات). **والمسبارُ يرى** لأنه أمسكهما.
- **ولا فقرةَ لتعديل عقد الإيجار التشغيليّ ولا لإنهائه** (القسم 20 مقروءاً كاملاً من 20.1 إلى 20.35). **وعند السكوت**: «**10.4** If this Standard does not specifically address a transaction, other event or condition, an entity's management shall use its judgement …» و«**10.6** … management may also consider the requirements and guidance in full IFRS Accounting Standards dealing with similar and related issues.»
- **وتصحيحُ الأخطاء**: «**10.21** To the extent practicable, an entity shall correct a material prior period error retrospectively in the first financial statements authorised for issue after its discovery by: (a) restating the comparative amounts for the prior period(s) presented in which the error occurred; or (b) … restating the opening balances of assets, liabilities and equity for the earliest prior period presented.»

---

## ٦) حكمُ المالك «على مدّة العقد» في ميزان النصّ

> **حكمُ المالك (`ق-١٤٦٧` · `docs/decisions.md:3720`)**: «**⇒ يُعترف به على مدّة العقد.**» — **ويبقى حكمَه** (`ق-١٤٩٢`: «حكمي لا نصّ»). وما يلي قراءةُ النصّ لا تعديلٌ للحكم.

| الشقّ | ما يقوله النصّ | الحكمُ في ميزانه |
|---|---|---|
| **المقبوض، والدافعُ المستأجرُ لنا مقابلَ حقّ الاستعمال** | دفعةُ إيجارٍ ثابتة (تعريف «fixed payments») ⇒ دخلٌ **بالقسط الثابت أو أساسٍ منتظمٍ آخر** (IFRS 16: **81**) / **بالقسط الثابت على مدّة الإيجار** (المنشآت: **20.25**). و**B56** يسمّي «lump-sum upfront payments» جزءاً من دفعات الإيجار. | **يؤيّد الجهة** (توزيعٌ لا فوريّ) **ويخالف الشيفرةَ الحالية** (`4300` فوراً، و«Not rent» في `auto-posting.util.ts:1933`). |
| **مقياسُ الفترة** | «**lease term**» لا «مدّة العقد»: غيرُ القابلة للإلغاء + التمديدُ المؤكَّد بدرجةٍ معقولة (**18**)، والفترةُ القابلة للإنفاذ بالاقتصاد الأوسع للعقد (**B34** + قرار 2019). | **يختلف في المقياس حيث يكون التجديدُ مؤكَّداً بدرجةٍ معقولة**؛ ويتطابقان حيث لا تمديدَ مؤكَّد. |
| **المدفوع، والمنشأةُ مستأجرٌ** | IFRS 16: كلفةُ أصل حقّ الاستعمال (**24(b)** للمؤجِّر · **24(c)** كلفةٌ مباشرة أولية) ⇒ استهلاكٌ حتى «the end of the lease term» (**32**)؛ إلا إذا اختير إعفاءُ القصير (**5–6**). المنشآت: مصروفٌ بالقسط الثابت على مدّة الإيجار (**20.15**) إن كان دفعةً للمؤجِّر. | **يؤيّد الجهة** (لا بقاءَ في `1600` إلى الأبد)، **والمدّةُ مدّةُ الإيجار الذي نحن فيه مستأجرون**. **ويسكت** إن دُفع لطرفٍ ثالث في معيار المنشآت. |
| **القسطُ الثابت أم غيرُه** | «**or another systematic basis**» — ويُلزِم به «if that basis is more representative» (**81**). | **النصُّ يسمح بغير القسط الثابت ويُلزم به إن كان أصدق**؛ والموجزُ اختار القسطَ الثابت باليوم — **وهو الافتراضُ الذي يقدّمه النصّ**. |

---

## ٧) الأسئلةُ الأحدَ عشر — بخياراتها وحججها وما يقوله النصّ

> المصدرُ: `docs/موجز-إطفاء-خلو-الرجل.md:67-77` (§٥). والترقيمُ ترقيمُ الموجز.

### السؤال ① — المعيار: هل «على مدّة العقد» نصٌّ؟ وللشقّين؟

**السؤال بنصّ الموجز**: «لم يُقرأ نصُّ IFRS 16 ولا معيار المنشآت الصغيرة والمتوسطة عبر SOCPA، والإطارُ نفسُه (`ق-٩`) مفتوح. فالمعالجةُ «على مدّة العقد» حكمُك لا نصٌّ مقروء — للشقّين معاً.»

| الخيار | حجّتُه |
|---|---|
| **أ.** يُبنى على IFRS 16 الكامل | الإطارُ الأوسع؛ ومن لا يُلزَم به يجوز له (م١٠). وهو الوحيد الذي يعالج التعديلَ والإنهاءَ نصّاً (**87** · **46**). |
| **ب.** يُبنى على معيار المنشآت (القسم 20) | «All SMEs … are required to use the IFRS for SMEs Accounting Standard endorsed in Saudi Arabia» (م١٠) — وأكثرُ المؤجِّرين منشآتٌ صغيرة. لكنه **يسكت** عن التعديل والإنهاء ولا يعرّف «lease term». |
| **ج.** سلوكٌ واحدٌ يطابق الاثنين في المشترك، ويُعلَن ما يفترقان فيه | **شقُّ المقبوض متطابقٌ نصّاً** (**81** ≈ **20.25**: القسط الثابت على مدّة الإيجار)، فلا يلزم حسمُ `ق-٩` له. والافتراقُ كلُّه في **المدفوع** (أصلُ حقّ استعمال في IFRS 16 · مصروفٌ مقدَّم في المنشآت) **وفي التعديل والإنهاء**. |

**ما يقوله النصّ**: **يحسم شقَّ المقبوض** — «A lessor shall recognise lease payments from operating leases as income on either a straight-line basis or another systematic basis» (IFRS 16 **81**)، و«… in profit or loss on a straight-line basis over the lease term» (المنشآت **20.25**)، **ولا تعديلَ سعوديٌّ عليهما** (§٤). **وشرطُه**: أن يكون العقدُ تشغيلياً (**61–63** · **20.4**) — وتأجيرُ وحدةٍ في مبنى لا ينقل «substantially all the risks and rewards» في الغالب، **وهذا حكمٌ لكل عقد لا نصٌّ عامّ**. **وللمدفوع يتكلّم بآليتين مختلفتين** (§٦). **والنصُّ لا يسمّي الخلوّ** (§١) — فالحسمُ استنباطٌ من تعريف «lease payments»: «Payments made by a lessee to a lessor relating to the right to use an underlying asset during the lease term».
**وحكمُ المالك**: **مؤيَّدٌ في الجهة، ومقياسُه «lease term» لا «مدّة العقد»** (§٦).

### السؤال ② — الجلسةُ الميدانية: مَن يدفع الخلوَّ لمن؟

**السؤال بنصّ الموجز**: «من يدفع الخلوَّ لمن في السوق؟ إن دفعه الداخلُ للخارج فالمقبوضُ ثمنُ تنازلٍ عن حقّ لا إيجارٌ مقدَّم، والمدفوعُ قد يُستردّ بالتنازل فلا يُطفأ إلى الصفر.»

| الواقعةُ في السوق | التصنيفُ بتعريفات النصّ | حجّتُه |
|---|---|---|
| **أ.** المستأجرُ يدفع **للمنشأة المؤجِّرة** | **دفعةُ إيجار** ⇒ توزيعٌ على مدّة الإيجار (**81** · **20.25**) | التعريف: «Payments made by a lessee to a lessor …» |
| **ب.** **المنشأةُ المؤجِّرة** تدفع للمستأجر | **حافزُ إيجار** يُطرح من دفعات الإيجار | التعريف: «Payments made by a lessor to a lessee associated with a lease …»، و«fixed payments …, less any lease incentives». ⚠️ **وليس هذا ما يسمّيه النظامُ `PAID`** (§٢: «The company paid to take over a leased location») — لكنه واقعةٌ يُسأل عنها في الجلسة. |
| **ج.** المستأجرُ الداخل يدفع **للمستأجر الخارج** (المنشأةُ الخارج) | **ليس دفعةَ إيجارٍ للمؤجِّر الأصليّ**. للمنشأة الخارجة: إن أبقت إيجارَها وأجّرت من الباطن فهي «intermediate lessor» (تعريف «sublease» + **B58**)؛ وإن تنازلت نهائياً فهو **إلغاءُ اعترافٍ بعقدها** | **التنازلُ النهائيّ لا يعالجه ما قُرئ** — IFRS 9 (إلغاءُ الاعتراف بالتزام الإيجار) **لم يُقرأ**. |
| **د.** **المنشأة** (مستأجرٌ داخل) تدفع **للمستأجر الخارج** | **كلفةٌ مباشرةٌ أولية** إن كانت «Incremental costs of obtaining a lease that would not have been incurred if the lease had not been obtained» ⇒ في أصل حقّ الاستعمال (**24(c)**) | **النصُّ لا يسمّي الخلوَّ كلفةً مباشرة** — التصنيفُ حكمٌ على التعريف. وفي معيار المنشآت لا تُذكر الكلفةُ المباشرة للمستأجر إلا في التمويليّ (**20.9**) ⇒ **سكوتٌ** للتشغيليّ ⇒ **10.4**. |

**ما يقوله النصّ**: **لا يجيب عن الواقعة الميدانية** (مَن يدفع لمن في السوق) — **لكنه يجعل جوابَها حاسماً**: التعريفاتُ تفرّق **بالدافع والمدفوع له** لا بالاسم. **وقاعدتان تمنعان الالتفاف**: الضمُّ (**B2** — عقدان مع الطرف نفسِه «at or near the same time» يُعاملان عقداً واحداً إن تفاوضا حزمةً)، والفصلُ (**17** — ما كان مقابلاً لغير حقّ الاستعمال يُخصَّص بـIFRS 15 لا يدخل دفعاتِ الإيجار). **و«الاستردادُ بالتنازل»** (المدفوعُ لا يُطفأ إلى الصفر): الفقرة **32** تستهلك الأصلَ حتى «the earlier of the end of the useful life of the right-of-use asset or the end of the lease term» — **ولا تذكر قيمةً متبقّيةً لأصل حقّ الاستعمال يستردّها المستأجرُ بالتنازل؛ فالنصُّ المقروء لا يحسمه**، ومعالجتُه كأصلٍ غير ملموس (IAS 38) **لم تُقرأ**.

### السؤال ③ — ضريبةُ القيمة المضافة على الخلوّ التجاريّ

**السؤال بنصّ الموجز**: «لم تُبحث، والقيدُ اليوم بلا سطر ضريبة. تُبحث من كتالوج الهيئة قبل البناء.»

| الخيار | حجّتُه |
|---|---|
| **أ.** خاضعٌ كالإيجار التجاريّ | إن كان دفعةً مقابلَ حقّ استعمال عقارٍ تجاريّ فهو من جنس الإيجار. |
| **ب.** يتبع تصنيفَ العقد (`Contract.classification`) | النظامُ يصنّف العقدَ سكنياً/تجارياً للضريبة (CLAUDE.md §4، `ق-٨٩١`). |
| **ج.** لا يُبنى قبل البحث من كتالوج الهيئة | قاعدةُ المشروع الحاكمة للبحث النظاميّ. |

**ما يقوله النصّ**: **النصُّ المحاسبيّ لا يحسمه** — IFRS 16 ومعيارُ المنشآت ووثيقةُ SOCPA **لا تتناول ضريبةَ القيمة المضافة على الخلوّ** (قُرئت أقسامُها المعنيّة كاملة). والمرجعُ نظامُ ضريبة القيمة المضافة ولائحتُه وأدلّةُ الهيئة — **لم تُقرأ في هذا العمل**. ⚠️ **وملاحظةٌ تُعلَن لا تُحسم**: توقيتُ الاعتراف المحاسبيّ (موزَّعاً) قد يفترق عن نقطة الضريبة (عند القبض) — كما افترقا في الإيجار (`rent-tax-point.util.ts`)؛ **وهذا يُقاس عند البحث الضريبيّ ولا يُفترض**.

### السؤال ④ — «مدّةُ العقد» للمدفوع: العقدُ الفرعيّ أم الرئيس؟

**السؤال بنصّ الموجز**: «مدّةُ العقد الفرعيّ؟ أم عقدِ الإيجار الرئيس للعقار المستأجَر؟ والمقترح: فترةٌ مُعلَنة على صفّ الخلوّ.»

| الخيار | حجّتُه |
|---|---|
| **أ.** مدّةُ العقد المسجَّل في النظام (الفرعيّ) | الخلوُّ مسجَّلٌ على عقدٍ بعينه (`ContractKeyMoney.contractId`)؛ أبسطُ بناءً. |
| **ب.** مدّةُ عقد الإيجار الرئيس (الذي المنشأةُ فيه مستأجر) | الخلوُّ المدفوعُ اشترى **حقَّ المنشأة في الموقع** لا حقَّ مستأجرها. |
| **ج.** فترةٌ مُعلَنة على صفّ الخلوّ (المقترح) | تستوعب أ وب ولا تفترض. |
| **د.** بلا إطفاءٍ إلى الصفر (قيمةٌ مستردّة بالتنازل) | إن كان الخلوُّ يُستردّ بالتنازل في السوق (انظر ②). |

**ما يقوله النصّ**: **يحسمه لـ(ب)** في IFRS 16: أصلُ حقّ الاستعمال «represents a lessee's right to use an underlying asset for the lease term» (التعريف)، ويُستهلك إلى «the end of the lease term» (**32**) — **مدّةُ الإيجار الذي المنشأةُ فيه مستأجر**؛ والعقدُ الفرعيّ يُصنَّف «by reference to the right-of-use asset arising from the head lease» (**B58**). **فـ(أ) يخالف النصَّ حيث تختلف المدّتان**، و**(ج) يوافقه إن أُعلنت الفترةُ مدّةَ الإيجار الرئيس** («lease term» بتعريفه). **و(د) لا يحسمه النصُّ المقروء** (②). **وتنبيهان من النصّ**: إن كان الإيجارُ الرئيسُ قصيراً (١٢ شهراً فأقلّ) واختير الإعفاءُ فالمدفوعُ مصروفٌ «on either a straight-line basis over the lease term» (**6**)؛ وإن كان أصلُ حقّ الاستعمال يحقّق تعريفَ العقار الاستثماريّ (المنشأةُ تؤجّر من الباطن) فيُعرض «as investment property» (**48**) ويتبع نموذجَ القيمة العادلة إن اختير (**34**). **وفي معيار المنشآت**: «over the lease term» (**20.15**) للإيجار الذي المنشأةُ فيه مستأجر — **والنتيجةُ نفسُها (ب)** إن كان الخلوُّ دفعةً للمؤجِّر.
⚠️ **وحدٌّ من الموجز نفسِه**: في «عقار التشغيل» قد لا تكون المنشأةُ مستأجراً أصلاً بل وكيلاً للمالك (`docs/موجز-إيجار-عقار-التشغيل.md` §٤، `ق-٨٤٩`) — **وحينئذٍ لا يسري IFRS 16 على المنشأة في هذا الشقّ**، ومعيارُ الأصيل والوكيل (IFRS 15) **لم يُقرأ**.

### السؤال ⑤ — التجديد: يمدّ فترةَ الخلوّ أم تنتهي بعقده؟

**السؤال بنصّ الموجز**: «يمدّ فترةَ الخلوّ أم تنتهي بعقده؟ والمقترحُ المحافظ: لا يمتدّ ما لم يُعلَن.»

| الخيار | حجّتُه |
|---|---|
| **أ.** لا يمتدّ ما لم يُعلَن (المقترح) | محافظ؛ لا افتراضَ للتجديد. |
| **ب.** الباقي عند الاتفاق على التجديد يُوزَّع على المدّة الجديدة | التجديدُ تمديدٌ للإيجار نفسِه. |
| **ج.** تُحدَّد المدّةُ من البداية شاملةً التجديدَ المؤكَّدَ بدرجةٍ معقولة | الخلوُّ نفسُه حافزٌ اقتصاديٌّ للبقاء. |

**ما يقوله النصّ (IFRS 16)** — **يتكلّم في الثلاثة، والأثرُ يتوقّف على تاريخين**:
- **التجديدُ تعديلٌ لعقد الإيجار**: التعريفُ يعدّ من أمثلته «extending … the contractual lease term». **وللمؤجِّر**: «account for a modification to an operating lease as a new lease from the effective date of the modification, considering any prepaid or accrued lease payments relating to the original lease as part of the lease payments for the new lease» (**87**)؛ وتاريخُ السريان «The date when both parties agree to a lease modification». ⇒ **إن اتُّفق على التجديد قبل نهاية العقد فالباقي من الخلوّ في ذلك التاريخ يُوزَّع على الإيجار الجديد كلِّه — وهذا (ب)**. وإن اتُّفق عليه عند النهاية فالباقي صفرٌ أصلاً، **فيتطابق (أ) و(ب)**.
- **والتجديدُ المؤكَّدُ من البداية جزءٌ من مدّة الإيجار** (**18(a)**، **B37**، **B39**، وقرار 2019) ⇒ **(ج)**. **والخلوُّ نفسُه ليس من أمثلة B37 نصّاً** (أمثلتُها التحسيناتُ وكلفُ الإنهاء والانتقال وأهمّيةُ الموقع) — فعدُّه حافزاً للبقاء **حكمٌ لا نصّ**؛ **لكنّ «the location of the underlying asset»** (B37(d)) **عاملٌ منصوص** — وهو ما يُدفع الخلوُّ لأجله.
- **وللمستأجر (شقّ المدفوع)**: «determine the lease term of the modified lease» (**45(b)**) و«making a corresponding adjustment to the right-of-use asset» (**46(b)**) ⇒ يستمرّ الاستهلاكُ إلى نهاية المدّة المعدَّلة (قراءةُ **32** على الإيجار المعدَّل — **استنباط**).
- ⚠️ **وحدٌّ في النظام** (§٢): التجديدُ في النظام **عقدٌ جديدٌ بحالة `UPCOMING`** (`schema.prisma:3430-3433`) — والنصُّ يعامله **تعديلاً للإيجار نفسِه** (التعريف) **ويضمّ العقدين إن تفاوضا حزمةً** (**B2**). **فربطُ الخلوّ بعقده وحده يخالف النصَّ في الحالة (ب)**.
**وفي معيار المنشآت**: «is not changed during the term of the lease unless … (other than simply by renewing the lease)» (**20.8**) — **عن التصنيف وحده**؛ ولا فقرةَ للتعديل ولا تعريفَ لـ«lease term» ⇒ **النصُّ لا يحسمه** ⇒ **10.4** و**10.6** (الرجوعُ الجائزُ إلى IFRS 16).
**وحكمُ المالك «على مدّة العقد»**: **يخالفه النصُّ في (ب) و(ج)** — حيث يمتدّ الإيجارُ باتفاقٍ قبل النهاية أو بتجديدٍ مؤكَّد.

### السؤال ⑥ — الإنهاءُ المبكّر: وجهةُ باقي المقبوض، وشطبُ باقي المدفوع

**السؤال بنصّ الموجز**: «وجهةُ باقي المقبوض (دخلٌ أم ردٌّ) تُدخَل بلا افتراض — كوجهة الإيراد المؤجَّل. وشطبُ باقي المدفوع: مصروفُ الإطفاء نفسُه أم خسارةٌ مستقلّة؟»

**شقُّ المقبوض:**

| الخيار | حجّتُه |
|---|---|
| **أ.** الباقي دخلٌ فوراً عند الإنهاء | لا مدّةَ باقيةً يُوزَّع عليها. |
| **ب.** الباقي التزامٌ بالردّ | إن كان العقدُ أو الاتفاقُ يوجب الردّ. |
| **ج.** وجهةٌ يُدخلها المستخدم (المقترح) | الواقعةُ التعاقدية لا يعرفها النظام. |

**ما يقوله النصّ**: **التقصيرُ تعديلٌ** («extending or shortening the contractual lease term» — التعريف) ⇒ **الفقرة 87**: الباقي يُضمّ إلى دفعات «الإيجار الجديد» (المدّةِ المقصَّرة الباقية) من تاريخ الاتفاق. **أمّا الإنهاءُ الكامل (لا مدّةَ باقية) فلا تعالجه فقرةٌ للمؤجِّر التشغيليّ** — **النصُّ لا يحسمه**؛ وإن كان الباقي **مستحقَّ الردّ** فهو خارجُ دفعات الإيجار (مقابلٌ لا لحقّ الاستعمال) ويُعالج بـIFRS 9 — **لم يُقرأ**. ⇒ **(ج) يوافق النصَّ بمعنى محدّد**: الوجهةُ **واقعةٌ تعاقدية تُسجَّل** (مردودٌ أم لا)، **لا خيارٌ محاسبيّ** يختاره المستخدم.
⚠️ **وعن الثغرة §٤-2 في الموجز** (الاعترافُ حتى الإلغاء شهريٌّ لا يوميّ): النصُّ يقول «straight-line basis over the lease term» — **ولا يحدّد وحدةَ الزمن** (يوم أم شهر)؛ **فالحسمُ حكمٌ**، والمطابقةُ الأقربُ لـ«straight-line» التقسيمُ باليوم.

**شقُّ المدفوع:**

| الخيار | حجّتُه |
|---|---|
| **أ.** الباقي يُحمَّل على مصروف الإطفاء نفسِه | بساطةُ الحساب الواحد. |
| **ب.** خسارةٌ مستقلّة عن الإنهاء | الإنهاءُ حدثٌ لا مرورُ زمن. |
| **ج.** يبقى أصلاً إن استُردّ بالتنازل | انظر ②. |

**ما يقوله النصّ (IFRS 16)**: «**(a) decreasing the carrying amount of the right-of-use asset to reflect the partial or full termination of the lease for lease modifications that decrease the scope of the lease. The lessee shall recognise in profit or loss any gain or loss relating to the partial or full termination of the lease.**» (**46(a)**) ⇒ **يؤيّد (ب)**: ربحٌ أو خسارةٌ على الإنهاء **لا استهلاك**. ⚠️ **وحدُّه**: الفقرةُ لتعديلٍ «that decrease the scope of the lease» — والإنهاءُ بخيارٍ كان داخلاً في تقدير المدّة **ليس تعديلاً** بالتعريف («that was not part of the original terms and conditions»)؛ فتطبيقُها على كل إنهاءٍ مبكّر **استنباط**. **و(ج) لا يحسمه النصُّ المقروء**. **وفي معيار المنشآت**: لا أصلَ حقّ استعمال في التشغيليّ ولا فقرةَ إنهاء ⇒ **النصُّ لا يحسمه** ⇒ **10.4**.

### السؤال ⑦ — خلوٌّ في منتصف المدّة (زيادةٌ عند التجديد)

**السؤال بنصّ الموجز**: «يُوزَّع على الباقي من تاريخ دفعه؟»

| الخيار | حجّتُه |
|---|---|
| **أ.** يُوزَّع على الباقي **من تاريخ دفعه** (المقترح) | التاريخُ الموثَّق في صفّ الخلوّ (`paidAt`). |
| **ب.** يُضمّ إلى الباقي من الخلوّ الأول ويُوزَّع الكلُّ على الإيجار المعدَّل **من تاريخ الاتفاق** | الزيادةُ تعديلٌ في المقابل. |
| **ج.** يُعترف به فوراً | لا مدّةَ جديدةَ مقابلَه. |

**ما يقوله النصّ (IFRS 16)**: الزيادةُ في المقابل تعديلٌ («a change in … the consideration for a lease» — التعريف) ⇒ **87**: إيجارٌ جديد **«from the effective date of the modification»** مع ضمّ «any prepaid or accrued lease payments relating to the original lease» ⇒ **يؤيّد (ب)**، **ويخالف (أ) في تاريخ البدء** (تاريخُ **الاتفاق** لا تاريخُ الدفع — وهما قد يتطابقان)، **ويخالف (ج)**. **وفي معيار المنشآت**: **لا يحسمه** (لا فقرةَ تعديل) ⇒ **10.4/10.6**.

### السؤال ⑧ — الحسابات: `2410` · `5750` · دخلُ المقبوض · القصرُ على التجاريّ

**السؤال بنصّ الموجز**: «`2410` و`5750` مقترحان، وحسابُ دخل المقبوض `4300` أم مستقلّ؟ وهل يُقصر الخلوُّ على العقد التجاريّ؟»

| البند | الخيارات | حججُها |
|---|---|---|
| **دخلُ المقبوض** | **أ.** `4300` «إيرادات أخرى» · **ب.** حسابُ دخل إيجار (أو فرعيٌّ تحته) · **ج.** حسابٌ مستقلّ «دخلُ خلوٍّ» | أ: القائم؛ ب: الخلوُّ دفعةُ إيجار؛ ج: يُرى منفصلاً ويُجمع في الإفصاح. |
| **الالتزامُ المؤجَّل** | **أ.** `2410` مستقلّ (المقترح) · **ب.** `2400` | أ: تقريرُ الإيراد المؤجَّل يُبنى من الأقساط (الموجز §٢)؛ ب: جنسٌ واحد. |
| **المدفوع** | **أ.** `1600` + مصروفُ إطفاء `5750` · **ب.** يُعرض ضمن أصل حقّ الاستعمال واستهلاكِه | أ: القائم؛ ب: IFRS 16. |
| **القصر على التجاريّ** | **أ.** يُقصر · **ب.** لا يُقصر | أ: الخلوُّ عرفٌ تجاريّ؛ ب: لا مانعَ في النموذج. |

**ما يقوله النصّ**: **لا يسمّي حساباتٍ** — دليلُ الحسابات خارجه. **لكنه يميل في ثلاث**: (١) المؤجِّرُ يُفصح عن «**lease income**» للتشغيليّ (**90(b)**) — والخلوُّ المقبوضُ **دفعةُ إيجار** بالتعريف ⇒ **دخلُه دخلُ إيجار**، **فـ(أ) `4300` «إيرادات أخرى» يُعسّر الإفصاحَ ولا يوافق التصنيف**؛ والنصُّ **لا يمنع (ج)** ما دام يُجمع مع دخل الإيجار. (٢) **لا يسمّي حسابَ الالتزام المؤجَّل للمؤجِّر** ⇒ `2410` أو `2400` **حكمٌ**. (٣) للمدفوع في IFRS 16: أصلُ حقّ الاستعمال يُعرض منفصلاً أو يُفصح عن بنده (**47(a)**)، واستهلاكُه «depreciation charge for the right-of-use asset» (**49**) — **فالتسميةُ «إطفاء» مقابل «استهلاك» شكلٌ لا يمنعه النصّ**. **والقصرُ على التجاريّ: النصُّ لا يفرّق بين سكنيّ وتجاريّ** ⇒ **لا يحسمه**. ⚠️ **ولا يعتمد الإفصاحُ السعوديّ** (**60A** · **94A**) على شكل الحساب — بل على **الشروط التعاقدية**.

### السؤال ⑨ — التسجيلُ على عقدٍ ملغى أو مسوّدة

**السؤال بنصّ الموجز**: «رفضٌ مسمّى؟»

| الخيار | حجّتُه |
|---|---|
| **أ.** رفضٌ مسمّى للاثنين | لا مدّةَ يُوزَّع عليها (الملغى)، ولا عقدَ (المسوّدة). |
| **ب.** يُقبل على `UPCOMING` ويُؤجَّل الاعترافُ حتى البدء، ويُرفض على `DRAFT` و`CANCELLED` | العقدُ الموقَّع قبل بدئه عقدٌ قائم. |
| **ج.** يُقبل كما اليوم | لا حاجزَ اليوم (`contracts.service.ts:920-930`). |

**ما يقوله النصّ**: **يتكلّم جزئياً**: «The lease term begins at the commencement date» (**B36**) — والبدءُ «The date on which a lessor makes an underlying asset available for use by a lessee» ⇒ **دفعةٌ على عقدٍ موقَّعٍ لم يبدأ تُؤجَّل حتى البدء** (يؤيّد شقَّ (ب) في `UPCOMING`). **والمسوّدةُ**: «contract» = «An agreement … that creates enforceable rights and obligations» — **مسوّدةٌ لم تُبرم ليست عقداً**، فما يُقبض عليها **ليس دفعةَ إيجار بعدُ** — **وتصنيفُه (سلفةٌ أم التزام) لم يُقرأ** (IFRS 9/15). **والملغى**: لا «lease term» باقيةً — **النصُّ لا يحسم** ما يُقبض بعد الإلغاء. ⇒ **النصُّ يؤيّد ألّا يُعترف بالمقبوض دخلاً إيجاريّاً على المسوّدة والملغى، ويؤيّد التأجيلَ حتى البدء على الموقَّع** — **والرفضُ المسمّى أم الحجزُ قرارُ بناءٍ لا نصّ**.

### السؤال ⑩ — القائم: يُعلَن قديماً أم يُلحَق بقيدٍ واحد؟

**السؤال بنصّ الموجز**: «يُعلَن قديماً ولا يُمسّ، أم يُلحَق بقيدٍ واحدٍ بتاريخ اليوم؟ والمقيسُ على التطوير بقايا اختبارٍ وحدَها.»

| الخيار | حجّتُه |
|---|---|
| **أ.** يُعلَن قديماً ولا يُمسّ | نمطُ المشروع (`LEGACY_COLLECTED` في الإيجار). |
| **ب.** قيدُ لحاقٍ واحدٌ بتاريخ اليوم **عبر الدخل/المصروف** | يُصلح الأرصدةَ فوراً. |
| **ج.** تصحيحٌ بأثرٍ رجعيّ **خارجَ ربح الفترة** (على الرصيد الافتتاحيّ لحقوق الملكية) | تصحيحُ خطأ فتراتٍ سابقة. |

**ما يقوله النصّ**: **يتكلّم** — إن كان الترحيلُ الفوريّ خطأً **جوهرياً في فتراتٍ سابقة**: «**shall correct material prior period errors retrospectively**» (IAS 8 **42**؛ والمنشآت **10.21** بنصٍّ مقارب مع «To the extent practicable»)، و«**The correction of a prior period error is excluded from profit or loss for the period in which the error is discovered.**» (IAS 8 **46**) ⇒ **يخالف (ب) حين يكون الأثرُ جوهرياً ويعود لفتراتٍ سابقة**، **ويؤيّد (ج)**؛ **و(أ) لا يوافقه إن كان الخطأُ جوهرياً** (بقاءُ الخطأ). **وحدودٌ تُعلَن**: (١) «material» حكمٌ لكل منشأة — **والنصُّ يعلّق الواجبَ عليه**؛ (٢) تصحيحُ ما يقع **في السنة الجارية المفتوحة** ليس «prior period error» — **فالقيدُ في الفترة نفسِها لا يمنعه النصّ**؛ (٣) ترجمةُ «restating the opening balances» إلى قيدٍ في دفترٍ لا قائمةٍ مالية **استنباطٌ** (قيدٌ على حقوق الملكية بتاريخ أوّل فترةٍ مفتوحة). **والمقيس**: الموجزُ قاس `64` صفّاً كلُّها بقايا اختبار — **لم يُعَد قياسُه هنا**، **والخادمُ المنشور لم يُقَس**.

### السؤال ⑪ — شكلُ الحفظ: أعمدةٌ على الصفّ أم جدولُ اعتراف؟

**السؤال بنصّ الموجز**: «أعمدةٌ على صفّ الخلوّ، أم جدولُ اعترافٍ يعطي كلَّ قيدٍ مصدرَه في الأستاذ؟ والثاني شرطٌ لعرض المصدر، وإلا ظهرت قيودُ الاعتراف في الأستاذ بلا مصدر.»

| الخيار | حجّتُه |
|---|---|
| **أ.** أعمدةٌ على صفّ الخلوّ (فترةٌ + عدّادُ المعترَف) | أبسط؛ صفٌّ واحد. |
| **ب.** جدولُ اعتراف — صفٌّ لكل قيد | كلُّ قيدٍ له مصدرٌ في الأستاذ؛ ويُعكس ويُعاد بحدّه. |
| **ج.** اشتقاقٌ عند القراءة بلا تخزين | لا حالةَ تنحرف (نمطُ «الروتينية تُحسب عند القراءة»). |

**ما يقوله النصّ**: **لا يحسمه** — المعاييرُ تحكم **الاعترافَ والقياسَ والعرضَ والإفصاح** لا شكلَ السجلّ. **وما يتّصل به منها**: دخلُ الإيجار **للفترة** (**90(b)**) — يلزم أن يُعرف ما اعتُرف به في كل فترة؛ وتحليلُ الاستحقاق (**97**) عن «lease payments to be received» — **والخلوُّ المقبوضُ مقدَّماً ليس «to be received»** فلا يدخله؛ والإفصاحُ السعوديّ (**94A**) عن الشروط التعاقدية. **فالخياراتُ الثلاثة تفي بالنصّ إن أعطت الدخلَ لكل فترة**. **وشرطُ «مصدرٍ لكل قيد» قاعدةُ المشروع لا المعيار** — وهي التي ترجّح (ب)، لا النصّ.

---

## ٨) ما يلزم أن يُعلَن مع أيّ حكم

1. **كلُّ ما سبق استنباطٌ من التعريفات** — لا نصَّ في IFRS 16 ولا في القسم 20 يسمّي الخلوّ (المسبار في §١).
2. **النصُّ الحاليّ لـIFRS 16 لم يُقرأ** (تسجيلُ دخول)؛ المقروءُ مجلّد 2021، وأثرُ تعديلات 2022 وIFRS 18 على فقرات المؤجِّر **لم يُقَس**.
3. **الترجمةُ العربية المعتمدة من SOCPA لم تُقرأ** (تسجيلُ دخول)، **والعمودُ العربيّ من وثيقة الاعتماد لم يُقرأ** (استخراجٌ فارغ) — والاقتباساتُ من العمود الإنجليزيّ للوثيقة نفسِها.
4. **الطبعةُ الثانية (2015) من معيار المنشآت لم تُقرأ** — وهي النافذةُ حتى 2027 لمن لم يطبّق الثالثة.
5. **IFRS 9 · IFRS 15 · IAS 38 · IAS 40 · الأساسُ في الاستنتاجات · الأمثلةُ التوضيحية · نظامُ ضريبة القيمة المضافة — لم تُقرأ**؛ وكلُّ سؤالٍ أحال إليها مكتوبٌ «لم يُقرأ».

---

## ٩) ملفّاتُ العمل (خارج المستودع)

المصادرُ المجلوبة ونصوصُها المستخرَجة في `D:\mad-app-scratch\review-267\lease-src\`:
`ifrs-16-leases.pdf` (`md5 e6133bae…`) و`ifrs-16-leases.txt`/`ifrs16-raw.txt` · `ifrs16-project-summary.pdf` · `ias-8.pdf` · `smes-*.html` و`smes2025.txt` · `socpa-endorse-ar.pdf` (`md5 910e62b4…`) و`socpa-endorse-ar.txt` · `sa-profile.pdf` · `ifric-nov2019.txt` · `socpa-4079.txt` · والمحوِّلُ `html2txt.mjs`.

---

## مراجعةٌ عدائية — تحقّقٌ مستقلّ لكلّ ادّعاء (مراجِعٌ ثانٍ)

> **الحدود**: قراءةٌ فقط؛ لا تعديلَ في المستودع ولا أمرَ git كاتب، ولا تشغيلَ لأيّ محطة اختبار (`jest`/`vitest`/`playwright`/`tsc`/`prisma`)، ولا تواصلَ مع أيّ جهة. **لم يُحذف حرفٌ من نصّ المؤلّف** — هذا القسمُ مُلحَقٌ به.
>
> **التاريخ**: جُلبت المصادرُ كلُّها من جديد **2026-09-27 00:35 بتوقيت الجهاز (= 2026-09-26 21:35 UTC)** — لا من ملفّات المؤلّف في `lease-src\`، بل بنفسي إلى:
> `C:\Users\mnqad\AppData\Local\Temp\claude\D--mad-app\e226e196-3c27-44af-a820-03530ffbef49\scratchpad\v\`
>
> **الأدوات**: `pdftotext` (نمطا `raw` و`layout`) · `count.cjs` يقرأ `/Count` من شجرة الصفحات **بفكّ تدفّقات الكائنات المضغوطة** بـ`zlib` · `chk.cjs` يطابق الاقتباسَ بعد توحيد المسافات وعلامات الاقتباس والوصلات والحروف المركّبة، ويقسمه عند «…» · `pg.cjs` يعطي رقمَ صفحة الـPDF بعدّ فواصل الصفحات. **الشجرةُ المقروءة**: `034f94db` (`git rev-parse HEAD`)، ونسخةُ العمل نظيفة.

### م-١) ادّعاءاتُ الشيفرة — كلُّ موضعٍ فُتح بنفسي

| # | الادّعاء | الحكم | الدليل المقروء في هذا التشغيل |
|---|---|---|---|
| ش١ | `main` على `034f94db`، و`git diff --stat 56ae0157 HEAD` فارغٌ على الملفّات المقروءة | **ثابت** | الفرقُ الوحيد بين الالتزامَين ملفّان: `.claude/hooks/block-shell-text-writes.mjs` و`apps/api/src/common/hooks-present.spec.ts`؛ وفارغٌ على `schema.prisma` و`auto-posting.util.ts` و`contracts.service.ts` و`KeyMoneySection.tsx` والموجز و`docs/decisions.md` |
| ش٢ | `schema.prisma:3924-3931` — `enum KeyMoneyDirection` بتعليقَيه | **ثابت** | التعدادُ `3924-3930`، والتعليقان `3925` و`3927-3928` حرفاً |
| ش٣ | `schema.prisma:3935-3964` — `ContractKeyMoney` بلا حقلِ فترةٍ ولا عدّاد | **ثابت** | الحقول: `direction` · `amount` · `note` · `currency` · `exchangeRate` · `baseAmount` · `paidAt` · `journalEntryId` (`3945-3955`). **وفاته** تعليقُ النموذج نفسِه (`3932-3934`): الخلوُّ «not refundable like a deposit and not periodic like rent» — انظر م-٤ ⑥ |
| ش٤ | `auto-posting.util.ts:1932-1935` «Received — cash in, other income. Not rent…» | **ثابت** | النصُّ في `1933-1935`، ويُكمله المصدرُ بـ«and it is not refundable, which is what separates it from a deposit» — **قطعه المؤلّف** وهو يمسّ ⑥ |
| ش٥ | `:1940-1943` الإقرارُ بغياب الإطفاء | **ثابت** | **وفاته** أن الشيفرةَ نفسَها تسمّي المقياس «over the lease term» (`1941-1942`) لا «مدّة العقد» — موافقٌ لخلاصته ١ |
| ش٦ | `:1945-1968` القيدان · `4300` (`:1623`) · `1600` (`:1916`) | **ثابت** | مدين `1000`/دائن `4300` للمقبوض (`1950-1953`)، ومدين `1600`/دائن `1000` للمدفوع (`1954-1957`) |
| ش٧ | `contracts.service.ts:920-930` بلا فحصٍ لحالة العقد | **ثابتٌ للخادم، ناقصٌ للصورة** | ولا فحصَ في المتحكّم (`contracts.controller.ts:215-219`، فعل `record` وحده) ولا في `dto/key-money.dto.ts:6-22`. **لكنّ الواجهة تحجب الزرَّ على الملغى**: `KeyMoneySection.tsx:55` (`contract.status !== 'CANCELLED'`)، وتُخفي القسمَ إن لم يكن فيه صفٌّ والعقدُ ملغى (`:49`) — **ولا حاجبَ لـ`DRAFT` ولا `UPCOMING`**. فـ«يُقبل كما اليوم» في ⑨(ج) = الخادمُ يقبل الكلّ، والواجهةُ تمنع الملغى وحده |
| ش٨ | التعليق `:916-918` «a top-up on renewal» | **ثابت** | السطر `917` |
| ش٩ | `schema.prisma:3428-3437` و«التجديدُ في النظام عقدٌ جديد» | **ثابت، ودليلُه أقوى ممّا ذُكر** | `contracts.service.ts:677-680` («a **new** contract … Not an edit of the old contract») · الربطُ `renewedFromId` (`schema.prisma:4215` · `contracts.service.ts:745`) · **والتجديدُ المبكّر قبل انتهاء القديم مدعومٌ صراحةً** (`contracts.service.ts:703-705`) · **ولا حقلَ لتاريخ الاتفاق على العقد**: التواريخُ `start` · `end` · `cancelDate` · `createdAt` وحدها (`schema.prisma:4182-4183` · `4200` · `4221`)؛ و`signedAt` الموجودُ (`:3881`) على نموذج التسليم لا العقد |
| ش١٠ | `KeyMoneySection.tsx:12-15` | **ثابت** | والتعليق `17-21` يكرّر «never refunded» |
| ش١١ | انحرافُ أرقام الموجز | **ثابت** | الموجز `docs/موجز-إطفاء-خلو-الرجل.md:11` (`3905-3947`) · `:15` (`1950-1975`) · `:22` (`1945-1948`)؛ والسطر `3905` داخل `HandoverItem` (`3898`) فعلاً |
| ش١٢ | `docs/decisions.md:3754` و`:3720` | **ثابت حرفاً** | و`:3720` يُكمل حكمَ المالك بـ«🔴 ويخصّ العقارات» — لم يُنقل |
| ش١٣ | نصُّ الأسئلة من الموجز `:67-77` | **ثابت حرفاً** | الأسئلةُ الأحدَ عشرَ مطابقة |

### م-٢) المصادرُ الخارجية — أُعيد جلبُها وطوبقت الاقتباسات

| # | المصدر | الحكم | ما قِيس |
|---|---|---|---|
| ص١ | م١ صفحةُ IFRS 16 تتطلّب الدخول | **ثابت** | `HTTP 200`؛ النصُّ «You need to Sign in to use this feature»؛ والرابطُ `/bin/oauth-redirect.html/…/j_security_check?configid=ifrs-idp`. **ومسبارٌ زائد**: `…/pdf-standards/english/{2022…2026}/{issued,required}/part-a/ifrs-16-leases.pdf` ⇒ **عشرةُ ردودٍ HTML لا PDF** (عنوانُها «IFRS Digital subscription required» أو «Loading...») — فالنصُّ المحدَّث **غيرُ متاحٍ علناً بهذا النمط**، وقيدُ المؤلّف في §٨-2 صادق |
| ص٢ | م٢ نصُّ IFRS 16 (2021) | **ثابت، ويُستدرك عدٌّ** | `HTTP 200` · `application/pdf` · `294,578` بايت · `md5 e6133bae379b607210097e0d5fba2a59` (مطابق). **«عددُ شجرة الصفحات لم يُقرأ» — قِيس الآن: `/Count 52`** من داخل تدفّق كائنٍ مضغوط، مطابقٌ لـ`52` فاصلاً. والمطبوع `A819`–`A869` مطابق |
| ص٣ | اقتباساتُ IFRS 16 (§٣-أ … §٣-د، و47(a) و49) | **ثابتة** | **43 مقطعاً طوبقت: 42 حرفاً**، والثالث والأربعون (B58) لا يفترق إلا بأثر استخراج («right-ofuse» في المخرَج). ومقطعُ الفقرة 49 «depreciation charge for the right-of-use asset» ثابتٌ في السطر `804` من مخرَجي، و47(a) ثابتة. وقرانُ «fixed payments» بتعريفه **ثابتٌ بالترتيب**: قائمةُ المصطلحات (commencement · economic life · effective date · fair value · finance lease · **fixed payments** · gross investment) تقابل قائمةَ التعريفات بالترتيب نفسِه |
| ص٤ | م٣ ملخّصُ المشروع «ص1» | **النصُّ ثابت، الموضعُ مردود** | `209,904` بايت؛ الاقتباسُ في **صفحة الـPDF 2** («At a glance»)، وتذييلُها المطبوع «2 \| IFRS 16 Leases \| January 2016»؛ الصفحةُ 1 غلافٌ |
| ص٥ | م٤ معيارُ المنشآت (الطبعة الثالثة) | **ثابت** | `HTTP 200`؛ حجمي `1,752,674` مقابل `1,752,540` عند المؤلّف (فرقُ `134` بايتاً — **سببُه لم يُقَس**، والنصُّ المقارَن متطابق). 20.4 · 20.8 · 20.15 · 20.24 · 20.25 · 20.27 · المسرد (lease) · A1 · 10.4 · 10.6 · 10.21 — **كلُّها حرفاً** |
| ص٦ | م٥ الطبعة الثانية — `404` | **ثابت** | الرابطان ردّا `404` في تشغيلي |
| ص٧ | م٦ IAS 8 | **ثابت** | `130,577` بايت؛ 46 و10 حرفاً؛ و42 حرفاً إلا تذييلَ صفحةٍ يقع بين (a) و(b) في المخرَج |
| ص٨ | م٧ وثيقةُ SOCPA | **ثابتة** | `1,204,587` بايت · `md5 910e62b4950210f0e2486b09af8f5d49` · `/Count 67`؛ ورابطا `Auditing-Standards-Endorsed.aspx` و`…/2905.aspx` يُفضيان إلى الملفّ نفسِه (تحقّقتُ منهما). الاقتباساتُ الإحدى عشرة ثابتة (اثنان يفترقان بتداخل العمود العربيّ لا بالنصّ). والبندان «3» و«6» من «Approval and Revisions» ثابتان بترقيمهما |
| ص٩ | «الرقمُ المطبوع «SOCPA n» ينزاح عن صفحة الـPDF بصفحة» (§٤) | **مردود** | في تشغيلي **الرقمُ المطبوع يساوي رقمَ صفحة الـPDF** — على الصفحات 2–41 في مخرَجَي `raw` و`layout` معاً. وعليه: عنوانُ IFRS 16 ص37، و60A و94A ص38، **وتتمّةُ سبب 94A و102B ص39** (لا «37–38» وحدها)؛ وIAS 8 ص17 ✓؛ و75A ص28 (عنوانُ IAS 40 ص27) ✓ |
| ص١٠ | العمودُ العربيّ فارغ | **ثابت** | `0` حرفٍ عربيّ مقابل `79,288` حرفاً لاتينياً في المخرَجَين (الشاهدُ الموجب: اللاتينيّ مُستخرَج) |
| ص١١ | لا نصَّ يقدّم إحدى اللغتين | **ثابت** | `prevail` ⇒ إصابةٌ واحدة: «prevailing Customary norms» (السطر `1342` في مخرَجي، عن أفراد العائلة) — غيرُ ذات صلة |
| ص١٢ | م٨ صفحتا SOCPA تتطلّبان الدخول | **ثابت** | كلتاهما حُوّلت إلى `https://sso.socpa.org.sa/?returnUrl=https://socpa.org.sa/Login.aspx` («تسجيل الدخول … نفاذ») |
| ص١٣ | م٩ خبرُ SOCPA | **ثابت حرفاً** | |
| ص١٤ | م١٠ ملفُّ المملكة | **ثابت حرفاً** | «Profile last updated: 28 July 2022» والتنويه والاقتباسان |
| ص١٥ | م١١ قرارُ نوفمبر 2019 | **النصُّ ثابت، والوصفُ «يوجب» مردودٌ جزئياً** | الاقتباسُ حرفاً، وهو تحت «Committee's agenda decisions» (نهائيّ لا مبدئيّ). لكنّ الصفحةَ نفسَها تسمّي ما تُنتجه القراراتُ «explanatory material» — **فالإيجابُ من B34 نفسِها، والقرارُ شارحٌ لا مُنشِئ** |

### م-٣) الادّعاءاتُ النافية — أُعيد كلُّ مسبارٍ مع شاهدٍ موجب

| # | النفي | الحكم | المسبار ⟶ النتيجة · الشاهدُ الموجب |
|---|---|---|---|
| ن١ | «key money / premium / assign» صفرٌ في IFRS 16 | **ثابت** | `grep -i -c` على المخرَجين ⟶ `0`؛ الشاهد: `lump-sum` = `1` و`upfront` = `1` (كلاهما B56) و`right-of-use` = `46`. **ووجدتُ ما لم يذكره**: `prepaid` = `2` — الفقرة 87 والفقرة C8 (انتقالية)؛ فـ87 **النصُّ الوحيد العامل** على دفعاتٍ مقدَّمة |
| ن٢ | الصفرُ نفسُه في القسم 20 | **ثابت** | القسمُ 20 (206 سطراً) ⟶ `0` للكلمات الثلاث؛ الشاهد: `premium` = `5` و`assign` = `2` **في غير القسم 20** من الطبعة نفسِها |
| ن٣ | لا تعريفَ لـ«lease term» في مسرد المنشآت | **ثابت** | لا مدخلَ يبدأ بـ`lease term`؛ الشاهد: المدخلان `lease` و`interest rate implicit in the lease` و`minimum lease payments` موجودة |
| ن٤ | لا «incentive» في القسم 20 | **ثابت** | `0` في القسم؛ `2` في الطبعة كلّها («sales incentives» و«‘incentive’ or ‘penalty’») |
| ن٥ | لا تعديلَ سعوديٌّ على القسم 20 ولا على اعتراف IFRS 16 وقياسه | **ثابت** | عناوينُ «Section n» من الصفحة 54 إلى الآخر ⟶ `3 · 4 · 5 · 7` مرّتين (8 عناوين)؛ ومواضعُ `lease` في جزء المنشآت (ص59 · ص65 · ص66) كلُّها **إفصاحُ دخلِ/كلفةِ تمويلٍ** (5.13 وما في معناه) لا اعتراف. ولا فرضَ سعوديٌّ لنموذج التكلفة في IAS 40 (القسمُ ص27–28: 75A إفصاحٌ وحده) |
| ن٦ | المعاييرُ لا تتناول ضريبةَ القيمة المضافة | **ثابت** | `value added` و`VAT` و`sales tax` ⟶ `0` في IFRS 16 والقسم 20 ووثيقة SOCPA؛ الشاهد: `taxes` = `11` في وثيقة SOCPA (الزكاةُ وضريبةُ الدخل) |
| ن٧ | النصُّ لا يحدّد وحدةَ الزمن | **ثابت** | `daily` · `per day` · `each day` · `monthly` · `per month` ⟶ `0` في IFRS 16 والقسم 20؛ الشاهد: `annual` = `11` و`2` |

### م-٤) محاولةُ نقض الخلاصات — سؤالاً سؤالاً

- **① (ج) «شقُّ المقبوض متطابقٌ نصّاً … فلا يلزم حسمُ `ق-٩` له» — ثابتٌ بقيد.** يتطابق **النمط** (القسطُ الثابت افتراضاً)، ولا تتطابق **الفترة**: IFRS 16 يعرّف مدّةَ الإيجار (18 · B34)، ومعيارُ المنشآت لا يعرّفها (ن٣). فحيث يوجد خيارُ تمديدٍ أو إنهاء يفترق الإطاران في **طول** التوزيع — فلا يُستغنى عن `ق-٩` كلّياً. ⚠️ **وترتيبُ الرجوع في المنشآت** ليس 10.4 ثم 10.6 مباشرةً: **الفقرة 10.5 توجب قبل ذلك «in descending order»** مصادرَ المعيار نفسِه في المسائل المشابهة ثم مفاهيمَ القسم 2؛ و10.6 (المعاييرُ الكاملة) «may» لا «shall». ويُضاف من م١٠ أن المنشأةَ التي تختار المعاييرَ الكاملة تطبّقها «in full, not selectively» — فلا خلطَ بين الإطارين للمنشأة الواحدة.
- **① (أ) «الوحيدُ الذي يعالج التعديلَ والإنهاءَ نصّاً» — ثابتٌ بقيد**: للمؤجِّر يعالج **التعديلَ** (87) وحده؛ والإنهاءُ الكاملُ للمؤجِّر **لا فقرةَ له** (والمؤلّفُ يقرّ بهذا في ⑥)، و46(a) للمستأجر.
- **④ — ثابتٌ في حكمه، وفاته أن البيانات موجودة.** النظامُ **يمثّل عقدَ الإيجار الرئيس فعلاً**: `Property.ownership` بثلاث قيم `owned` · `leased` · `managed` (`schema.prisma:3294-3295`؛ `create-property.dto.ts:3`)، ولـ`leased` حقولُ الإيجار الرئيس `leaseStart`/`leaseEnd`/`leaseValue`/`leaseCycle` بتعليق «the company's own head-lease terms» (`schema.prisma:3297-3302`)، **والعقدُ الفرعيّ يُرفض خارج نافذته** (`contracts.service.ts:635-638`، `contract_outside_head_lease`). ⇒ **الخيار (ب) قابلٌ للاشتقاق من البيانات** لا يحتاج حقلاً مُعلَناً — **بحدٍّ**: الحقلان اختياريان (`create-property.dto.ts:39-45`) والفحصُ لا يقع إلا إن وُجدا معاً. **و«الوكيل» ليس افتراضاً**: `managed` هو حالُه، ويعامله الترحيلُ الضريبيّ وكيلاً (`rent-tax-point.util.ts:59-63`). **وحالةٌ لم يذكرها**: `PAID` على عقارٍ **`owned`** — المنشأةُ فيه مؤجِّرٌ رئيس تدفع للمستأجر الخارج؛ والخادمُ لا يمنعها (لا فحصَ للملكية في `recordKeyMoney`). وقراءتُها في IFRS 16 تقع — إن عُدّت «Incremental costs of obtaining a lease» — تحت **83** (كلفةٌ مباشرةٌ أولية للمؤجِّر تُضاف إلى الأصل وتُصرف على مدّة الإيجار) أو تحت **20.27** في المنشآت، **وإلا فهي كلفةُ إنهاءٍ لعقدٍ سابق** — حكمٌ لا نصّ.
- **⑤ — ثابتٌ فيما قال، وفاته مسارٌ منصوص.** الفقرة **21** موجَّهةٌ لـ«An entity» (للطرفين): «An entity shall revise the lease term» إذا تغيّرت الفترةُ غيرُ القابلة للإلغاء، **ومن أمثلتها ممارسةُ المستأجر خياراً لم يدخل التقديرَ الأول**. فالتجديدُ **بخيارٍ منصوصٍ في العقد الأصليّ** ليس «تعديلاً» (التعريفُ يشترط «not part of the original terms») ⇒ **مراجعةُ مدّة (21) لا إيجارٌ جديد (87)**؛ والتجديدُ **باتفاقٍ جديد** تعديلٌ (87). **والنظامُ لا يعرف أيَّهما وقع** (لا حقلَ لخيار التجديد)، **ولا يحفظ تاريخَ الاتفاق** الذي تبدأ منه 87 — أقربُ بديلٍ `createdAt` لصفّ التجديد (ش٩). **وفي المنشآت**: 20.8 تستثني «simply … renewing the lease» من إعادة التصنيف — تلميحٌ إلى أن التجديدَ البسيط استمرارٌ للإيجار نفسِه، **لا نصٌّ في التوزيع**.
- **⑤ و⑥ لشقّ `PAID` — تناقضٌ داخليّ لم يُرصد.** خلاصتُه في ④: المدفوعُ يتبع **الإيجارَ الرئيس**. **والعقدُ في النظام هو العقدُ الفرعيّ** (المنشأةُ فيه مؤجِّرٌ من الباطن). ⇒ **تجديدُ العقد الفرعيّ لا يمدّ الإيجارَ الرئيس، وإلغاؤه ليس إنهاءً له** — فلا «شطبَ للباقي» عند إلغاء العقد الفرعيّ (مقترحُ الموجز §٢ للإنهاء المبكّر) ولا تمديدَ عند تجديده؛ **الحدثُ المؤثّر تغيّرُ `Property.leaseEnd`** أو إنهاءُ الإيجار الرئيس نفسِه. وتطبيقُ 45(b)/46 على «التجديد في النظام» كما فعل المؤلّف في ⑤ **يخلط العقدَين**.
- **⑥ `RECEIVED` — ثابتٌ في النصّ، وفاته أمران.** (١) **المنتَجُ اليوم يعرّف الخلوَّ «غيرَ مستردّ»** في أربعة مواضع (`schema.prisma:3933` · `auto-posting.util.ts:1934` · `KeyMoneySection.tsx:13` و`:19-20`) — فالخيار (ب) «التزامٌ بالردّ» **يخالف تعريفَ المنتَج القائم** ما لم ينصّ العقد. (٢) **وسببُ إضافة 94A السعوديّة** (ص38–39) يذكر «the accumulated refundable rent upon termination» — **ردُّ الإيجار المتراكم عند الإنهاء واقعةٌ سعودية مقصودةٌ بالإفصاح** — وإن كان السببُ نفسُه يصف «finance lease contract» والفقرةُ عامّةٌ للمؤجِّر. **وملاحظةٌ نصّية**: تعريفُ «lease modification» يضرب من أمثلته «terminating the right to use» — فالإنهاءُ الكاملُ **باتفاق** داخلٌ في التعريف، و87 لا تُبقي مدّةً يُوزَّع عليها؛ **فالباقي غيرُ المستردّ يُعترف به عند الإنهاء — استنباطٌ لا نصّ**، وحكمُ المؤلّف «النصُّ لا يحسمه» يبقى صادقاً حرفاً.
- **⑧ — ثابتٌ، وفاته ما في الدليل والحرّاس.** (١) **حسابُ دخل الإيجار قائم**: `4200` «إيرادات الإيجار» (`default-chart.ts:81`)، **وتعليقُ `4300` في الدليل نفسِه** يقول «ليست إيجاراً، فلا تُضخِّم 4200» (`:82`) — **فمعيارُ الشيفرة نفسُها** يضع الخلوَّ في `4200` إن كان دفعةَ إيجار. (٢) **لكنّ حارسَ `ق-٤٦٩`** (`journal/rent-revenue-single-source.spec.ts`) يقرّر أن «مسارُ ترحيلٍ ثانٍ يذكر `4200` يتجاوز القاعدةَ كلَّها» (`:9-11`)؛ **ونصُّه يسمح** بذكر `4200` في `auto-posting.util.ts` (`:26`) — فترحيلُ الخلوّ إلى `4200` هناك **يمرّ من الحارس ويصطدم بقصده**، و`2400` محصورٌ في `deferred-revenue-account.util.ts` (`:58-60`). ⇒ اختيارُ (ب) قرارٌ يمسّ `ق-٤٦٩`، لا تسميةٌ فقط. (٣) **القصرُ على التجاريّ**: التعليقاتُ كلُّها تقول «commercial location» (`contracts.controller.ts:214` · `contracts.service.ts:913-914` · `schema.prisma:3932`)، **ولا إنفاذ**: لا فحصَ لـ`classification` في `recordKeyMoney`، والقسمُ يُعرض لكلّ عقد (`ContractDetailModal.tsx:732`) مع تعليقٍ يسمّي «the common residential case» (`KeyMoneySection.tsx:47-48`). (٤) **لا نموذجَ لأصل حقّ استعمالٍ ولا لالتزام إيجارٍ** في الخادم: `grep` على `right-of-use|rightOfUse|حق الاستخدام|حق استخدام|lease liability|leaseLiability` في `apps/api/src` (بلا ملفّات الاختبار) ⟶ `0`؛ الشاهد: بإضافة `حقوق انتفاع` إلى النمط نفسِه أصاب الأمرُ نفسُه `default-chart.ts:54` و`accounts/code-bands.ts:46` ⇒ **(ب) للمدفوع لا مُضيفَ له في النظام اليوم**، و`1600` «تقبيل وحقوق انتفاع» أقربُ ما فيه.
- **⑨ — ثابت**، مع تصحيح «اليوم» (ش٧): الواجهةُ تمنع الملغى، والخادمُ لا.
- **⑩ — ثابت، ومسارٌ ثانٍ يؤدّي إلى (ج) نفسِه.** إن لم يُعدّ الترحيلُ الفوريّ «خطأً» (IAS 8 الفقرة 5 تعرّفه بإساءة استعمال معلوماتٍ متاحة) فتغييرُه **تغييرُ سياسةٍ محاسبية**: الفقرة **14** لا تجيزه إلا إن كان مطلوباً أو أوثقَ وأنفع، و**19(b)** «changes an accounting policy voluntarily, it shall apply the change retrospectively» — **فالاتجاهُ واحد: أثرٌ رجعيّ لا قيدُ لحاقٍ في ربح الفترة**.
- **⑪ — ثابت، وآليةُ «بلا مصدر» مقيسة.** `reports/ledger.util.ts:74-95` (`SOURCE_ARMS`) يربط كلَّ قيدٍ بمصدره عبر **عمودٍ واحدٍ لكلّ جدول** (`contract_key_money.journalEntryId` ⟶ `KEY_MONEY` في `:93`). ⇒ صفٌّ واحدٌ بأعمدة (أ) لا يحمل إلا معرّفاً لقيدٍ واحد، **فقيودُ الاعتراف الشهرية تظهر في الأستاذ بلا مصدر ما لم يُضف جدولٌ وذراعٌ في `SOURCE_ARMS`** — وهذا يؤكّد ترجيحَ الموجز لـ(ب) بشيفرةٍ لا بقاعدةٍ وحدها.

### م-٥) ما فات المؤلّف — مساراتٌ لم يطرقها

1. **عقدُ الإيجار الرئيس ممثَّلٌ في البيانات** (`Property.ownership` + `leaseStart`/`leaseEnd`) — يغيّر جوابَ ④ من «حقلٌ مُعلَن» إلى «مشتقٌّ من العقار حين يوجد» (م-٤ ④).
2. **حالةُ `PAID` على عقارٍ مملوك** — مسموحةٌ في الخادم ولها قراءةٌ أخرى (83 / 20.27 أو كلفةُ إنهاء).
3. **الفقرة 21** — التجديدُ بخيارٍ أصليّ مراجعةُ مدّةٍ لا تعديل؛ والنظامُ لا يميّز ولا يحفظ تاريخَ الاتفاق.
4. **العقدُ الفرعيّ ليس الإيجارَ الرئيس** — فأحداثُه (إلغاءٌ · تجديد) لا تمسّ فترةَ المدفوع بحكم ④ نفسِه.
5. **تعريفُ المنتَج «غيرُ مستردّ»** في أربعة مواضع، **وسببُ 94A السعوديّ عن «الإيجار المستردّ المتراكم عند الإنهاء»**.
6. **`4200` قائمٌ وحارسُ `ق-٤٦٩`** — ثمنُ الخيار (ب) في ⑧.
7. **لا أصلَ حقّ استعمالٍ في النظام** — فخيارُ IFRS 16 للمدفوع بلا مُضيف.
8. **مسرد المنشآت «minimum lease payments»**: «payments over the lease term that the lessee is or can be required to make» — **يسند** دخولَ الخلوّ المقبوض من المستأجر في دفعات الإيجار في معيار المنشآت أيضاً، لا في IFRS 16 وحده.
9. **وثيقةُ SOCPA تحدّد نسختَها** «as of 13-12-2022» (ص7، البند 2)، **وتُدخل في «المعتمد» معاييرَ SOCPA الأخرى ونشراتِها الفنية** «such as the subject of Zakat» (ص7، تتمّةُ البند 5 التي قطعها المؤلّف). ⟶ **هل لـSOCPA نشرةٌ فنيّةٌ في خلوّ الرِّجل؟ لم يُبحث** — والصفحاتُ خلف تسجيل الدخول.
10. **قرارُ «Lessor Forgiveness of Lease Payments (IFRS 9 and IFRS 16)»** مُدرجٌ في صفحة م١ بين المشاريع المكتملة — يمسّ الإعفاءَ والإنهاءَ للمؤجِّر (⑥)؛ **لم يُقرأ**.

### م-٦) الخلاصةُ المصحَّحة

1. **خلاصةُ المؤلّف الأولى ثابتة**: للمقبوض من المستأجر مقابلَ حقّ الاستعمال يوجب النصُّ التوزيعَ (IFRS 16 الفقرة 81 · المنشآت 20.25) ويخالف ترحيلَ اليوم إلى `4300`؛ والمقياسُ «مدّةُ الإيجار» لا «مدّةُ العقد» — **والشيفرةُ نفسُها تسمّيه «lease term»** (`auto-posting.util.ts:1941-1942`).
2. **النسخةُ السعودية لا تمسّ الاعترافَ ولا القياس — ثابت** (مسبارٌ مُصادَق: الأقسام 3/4/5/7 وحدها، وثلاثُ فقراتِ إفصاحٍ في IFRS 16). **ويُصحَّح**: صفحاتُ SOCPA المطبوعةُ **تساوي** صفحاتِ الـPDF (لا انزياح)، وقسمُ IFRS 16 يمتدّ إلى ص39.
3. **④ يُحسم لـ(ب) — ثابت، وأقربُ للبناء ممّا قدّر**: مدّةُ الإيجار الرئيس **موجودةٌ في `Property.leaseStart`/`leaseEnd`** لعقارات `leased` (اختياريّةً)، و`managed` هو الوكيل.
4. **⑤ و⑥ للمدفوع يُعاد بناؤهما على ④**: أحداثُ العقد الفرعيّ لا تغيّر فترةَ المدفوع؛ **ومقترحُ الموجز «شطبُ الباقي» عند الإلغاء يخالف ④**.
5. **⑤ للمقبوض**: 87 للتجديد **باتفاقٍ جديد**، و**21** للتجديد **بخيارٍ أصليّ** — والنظامُ لا يميّز بينهما ولا يحفظ تاريخَ الاتفاق.
6. **⑧**: `4200` قائم، والخيارُ (ب) يمسّ `ق-٤٦٩`؛ و«القصرُ على التجاريّ» مقصودٌ في التعليقات **غيرُ مُنفَّذ**؛ ولا أصلَ حقّ استعمالٍ في النظام.
7. **ما بقي لم يُقرأ كما أعلن المؤلّف** (IFRS 9 · IFRS 15 · IAS 38 · الأساسُ في الاستنتاجات · الطبعةُ الثانية · النصُّ العربيّ · نظامُ الضريبة) **ويُضاف**: نشراتُ SOCPA الفنيّة، وقرارُ «Lessor Forgiveness».

**ملفّاتُ المراجعة** (خارج المستودع): في مجلّد الـscratchpad أعلاه — `ifrs16.pdf` (`md5 e6133bae…`) · `ps.pdf` (`0751bbd0…`) · `ias8.pdf` (`dbfce1bb…`) · `socpa.pdf` (`910e62b4…`) · `sa.pdf` (`48d3bd42…`) · `smes.html` · `ifric.html` · `socpa4079.html` · `ifrs16page.html` · ونصوصُها `*.raw.txt`/`*.layout.txt`/`*.txt` · والأدوات `chk.cjs` · `count.cjs` · `pg.cjs` · `h2t.cjs` · وقوائمُ الاقتباسات `q16.txt` · `qsmes.txt` · `qias8.txt` · `qsocpa.txt`.
