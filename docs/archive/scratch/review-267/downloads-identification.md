# تعريفُ الملفَّين المأذونِ بتنزيلهما قبل تنزيلهما — `ق-١٤٨٣` (حزمةُ الهيئة) · `ق-١٤٨٨` (veraPDF)

> **تاريخُ القراءة:** 2026-09-26 (قياساتُ `HEAD` بين `20:36` و`20:53` UTC، مقروءةً من ترويسة `Date` في كلّ ردّ).
> **الشجرة:** `D:\mad-app` على `main` عند `034f94db` (المهمّةُ ذكرت `56ae0157`؛ `main` تقدّم التزاماً واحداً — مقروءٌ من `git log -1`).
> **نصُّ الإذنين** مقروءٌ في هذا التشغيل: `docs/decisions.md:3745` (`ق-١٤٨٣`) و`docs/decisions.md:3750` (`ق-١٤٨٨`).

**ما لم يُفعل عمداً:**
- **لم تُنزَّل أيُّ حمولة.** كلُّ حجمٍ أدناه من `Content-Length` في طلب `HEAD` (`curl -sIL`)، وكلُّ اسمٍ من `Content-Disposition` أو `Location`. المقروءُ كاملاً: صفحاتُ HTML الرسمية، وملفُّ توقيعٍ نصّيّ (`.asc`، 659 بايتاً)، وملفّاتُ بصمةٍ نصّية من Maven Central (64/128/40 حرفاً).
- **لم يُعلَّم مربّعُ «أوافق على الشروط والأحكام»** في بوّابة المطوّرين — مقروءٌ من الصفحة بعد انتهاء العمل: `acceptTerms` قيمتُه `checked:false`. الموافقةُ فعلٌ يعود للمالك (انظر §٣).
- **لا تواصل** مع أيّ جهة؛ ولا تعديلَ لأيّ ملفٍّ في المستودع؛ ولا اختبارات.
- أداةُ `firecrawl` غيرُ مفوَّضة في هذه الجلسة (تحتاج تفويضاً عبر `claude mcp` أو `/mcp` في جلسةٍ تفاعلية) — ولم تلزم: القراءةُ تمّت بـ`curl` ولوحة المتصفّح.

---

## جدولُ الإعلان (ما يُعلَن قبل التنزيل)

| البند | ① حزمةُ الهيئة (SDK — جافا) | ② veraPDF (المُثبِّت الرسميّ) |
|---|---|---|
| **اسمُ الملفّ** | `zatca-einvoicing-sdk-Java-238-R3.4.8.zip` | `verapdf-greenfield-1.30.2-installer.zip` |
| **الإصدار** | `3.4.8` («SDK Version 3.4.8» — آخرُ إصدارٍ في سجلّ الإصدارات) | `1.30.2` (إصدارٌ رسميّ «official release»، رقمٌ زوجيّ للفرع الثانوي) |
| **الرابطُ الرسميّ** | `https://sadzit.sharepoint.com/:u:/s/EXTERNALZATCA/IQCVzjXNpLTOTZbrYhs_w7aIAb7pPg1wfwl6wACeu1xCPAQ?e=pn3riq` | `https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.2-installer.zip` |
| **الصفحةُ الرسميّة التي يظهر فيها** | `https://sandbox.zatca.gov.sa/downloadSDK` (بوّابةُ المطوّرين — زرُّ «تنزيل حزمة أدوات تطوير البرمجيات ← Java» و«تنزيل حزمة SDK إصدار (جافا 11)») | `https://software.verapdf.org/rel/1.30/` (ومنه `https://verapdf.org/software/` و`https://docs.verapdf.org/install/`) |
| **الحجم (`HEAD`)** | **49,169,499 بايتاً** (46.89 MiB) | **32,923,960 بايتاً** (31.40 MiB) |
| **`Last-Modified`** | `Sun, 21 Dec 2025 11:36:07 GMT` | `Wed, 03 Jun 2026 10:56:26 GMT` |
| **بصمةٌ منشورة؟** | **لا** — لا بصمةَ ولا توقيعَ منشوران (المسبارُ وضابطُه في §١-٤) | **توقيعُ GPG منشور** (`.zip.asc`) وبصمةُ المفتاح منشورةٌ في وثائق الأداة؛ **ولا `sha256` منشورة** على موقعها لهذا الملفّ بعينه |
| **الشروط** | شروطُ الحزمة **صامتةٌ** عن الحفظ والتوزيع؛ وشروطُ استخدام بوّابة الهيئة **تمنع** النسخَ والتحميلَ والتوزيعَ «للجمهور أو لأغراض تجارية» بلا موافقةٍ خطّية | ترخيصٌ مزدوج **GPLv3+ / MPLv2+** — **يسمح صراحةً بإعادة التوزيع** |
| **التوصيةُ بقاعدة المالك** | **يُنزَّل في السير من رابطه الرسميّ مثبَّتاً ببصمته** (بصمةٌ نحسبها نحن عند التنزيل المعلَن، لأن الهيئة لم تنشر بصمة) | **يُحفظ في المستودع** في مجلّدٍ مسمّىً بإصداره ومصدره، بعد التحقّق من توقيعه |

---

## ١) حزمةُ الهيئة — `ق-١٤٨٣`

### ١-١ أين الرابطُ الرسميّ — صفحتان رسميّتان، **إحداهما متقادمة**

**(أ) صفحةُ موقع الهيئة العامّ** — `https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx` (HTML مقروءٌ كاملاً، 263,724 بايتاً):
- زرُّ «Download SDK» في السطر `725` من الصفحة المنزَّلة يشير إلى:
  `https://sadzit.sharepoint.com/:u:/g/EfjCGimzSjNPpVrWgn4f-mgBZ55D3EtCizFD7E8caZ4Kcg?e=gfOEcw&download=1`
- `HEAD` عليه (بجرّة ملفّات تعريف ارتباط) أعاد:
  ```
  Location: /ZATCA%20Library/zatca-envoice-sdk-203.zip?ga=1
  Content-Length: 40884034
  Last-Modified: Fri, 13 May 2022 21:07:01 GMT
  Content-Disposition: attachment; ... filename="zatca-envoice-sdk-203.zip"
  ```
- ⚠️ **هذا ملفٌّ من مايو 2022** (والاسمُ فيه خطأٌ إملائيّ من المصدر: `envoice`). **لا يُعتمد** — فالصفحةُ العامّةُ متخلّفةٌ عن بوّابة المطوّرين.

**(ب) بوّابةُ المطوّرين** — `https://sandbox.zatca.gov.sa/downloadSDK` (تطبيقٌ يُرسَم بالمتصفّح؛ قُرئ في لوحة المتصفّح بالعربية ثم بالإنجليزية):
- زرُّ «تنزيل حزمة أدوات تطوير البرمجيات / Download SDK» **معطَّلٌ حتى يُعلَّم مربّعُ الموافقة**، وروابطُه من إعداد الصفحة (`globalThis._env_`، مقروءاً في الصفحة):
  ```
  REACT_APP_DOWNLOAD_SDK_JAVA     = https://sadzit.sharepoint.com/:u:/s/EXTERNALZATCA/IQCVzjXNpLTOTZbrYhs_w7aIAb7pPg1wfwl6wACeu1xCPAQ?e=pn3riq
  REACT_APP_DOWNLOAD_SDK_DOT_NET  = https://sadzit.sharepoint.com/:u:/s/EXTERNALZATCA/IQBFo0TI2yTdRrHw5orrYghGAZUSOoqra29zpIRcCgrqRHI?e=vcOS6V
  REACT_APP_BETA_SDK_LINK         = https://sadzit.sharepoint.com/:u:/g/EfoJso7rhCZJmER2rXT7VSQBD-HP7VEGVf8HoRD3Xt-5AA?e=xzJaAs
  REACT_APP_DOWNLOAD_SDK_LINK     = https://sadzit.sharepoint.com/:u:/g/EV2GE3hw-x1KqGdTwqNS7OUBBYEwN9r_OSAx9vErGQ7r5Q?e=wGfxE4
  ```
  وفي حزمة الصفحة (`/assets/index-CqfbJeRB.js`) يربط المكوّنُ الزرَّ الرئيسيَّ بـ`href:a.sdkJava` و`href:a.sdkDotNet` — **لا** بـ`REACT_APP_DOWNLOAD_SDK_LINK` (هذا المتغيّرُ معرَّفٌ في الإعداد ولا يستعمله الزرّ).
- وسجلُّ الإصدارات («سجلّ الإصدارات / Version History») في الحزمة نفسِها ينصّ:
  `{title:"SDK Version 3.4.8",description:"<ul><li>Bug fixes for the validation rule (BR-KSA-81)</li></ul>",file:"https://sadzit.sharepoint.com/:u:/s/EXTERNALZATCA/IQCVzjXNpLTOTZbrYhs_w7aIAb7pPg1wfwl6wACeu1xCPAQ?e=pn3riq", … key:348, dotNetFile:"…IQBFo0TI2yTdRrHw5orrYghGAZUSOoqra29zpIRcCgrqRHI?e=vcOS6V"}`
  **فالرابطُ نفسُه هو زرُّ التنزيل الرئيسيّ وهو ملفُّ الإصدار 3.4.8** — مصدران مستقلّان في الصفحة يتّفقان. و«Simulation SDK Version 3.4.8» يشير إلى الملفَّين أنفسِهما.

⚠️ **ملاحظةُ نطاق:** الملفّاتُ مستضافةٌ على `sadzit.sharepoint.com` (موقع `EXTERNALZATCA`) لا على `*.gov.sa`. **دليلُ رسميّتها أن الصفحتين الرسميّتين تُحيلان إليها** — لا غير. (مستأجرُ الدخول في إعادة التوجيه: `login.microsoftonline.com/63996317-3453-4be2-b104-0eee31c91811`.)

### ١-٢ القياسات — `HEAD` على كلّ رابطٍ في بوّابة المطوّرين (بجرّة ملفّات تعريف ارتباط)

| الرابط (المتغيّر) | اسمُ الملفّ من `Content-Disposition` | `Content-Length` | `Last-Modified` | `ETag` |
|---|---|---|---|---|
| `SDK_JAVA` ⭐ | `zatca-einvoicing-sdk-Java-238-R3.4.8.zip` | **49,169,499** | Sun, 21 Dec 2025 11:36:07 GMT | `"{CD35CE95-B4A4-4DCE-96EB-621B3FC3B688},2"` |
| `SDK_DOT_NET` | `zatca-einvoicing-sdk-DotNet-238-R3.4.8.zip` | 313,500,482 | Sun, 21 Dec 2025 11:35:57 GMT | `"{C844A345-24DB-46DD-B1F0-E68AEB620846},2"` |
| `BETA_SDK_LINK` (جافا 21 تجريبيّ) | `zatca-einvoicing-sdk-238-R4.0.0.zip` | 67,203,981 | Sun, 03 Nov 2024 12:35:25 GMT | `"{8EB209FA-84EB-4926-9844-76AD74FB5524},2"` |
| `DOWNLOAD_SDK_LINK` (غيرُ مستعمل في الزرّ) | `zatca-einvoicing-sdk-238-R3.3.8.zip` | 344,963,223 | Sun, 24 Nov 2024 10:35:53 GMT | `"{7813865D-FB70-4A1D-A867-53C2A352ECE5},2"` |

مسارُ الخادم لملفّ الجافا (من `Location`): `/sites/EXTERNALZATCA/ZatcaSDK/SDK/3.4.8/zatca-einvoicing-sdk-Java-238-R3.4.8.zip`.

**لماذا نسخةُ جافا 3.4.8 لا غيرها:**
- **3.4.8 هو الأحدث** في سجلّ الإصدارات (مقروءٌ في الصفحة: «النسخة الخاصّة بحزمة أدوات تطوير البرمجيات 3.4.8 — إصلاح الأخطاء في قاعدة التحقق (BR-KSA-81)»).
- **جافا لا .NET**: مشغّلُ السير لينكس (`runs-on: ubuntu-latest` — `.github/workflows/web-tests.yml:128` و`:204` و`:553` و`:622`، و`web-tests-light.yml:88` و`:130` و`:290`)؛ والجافا أصغرُ بستّة أضعاف (46.89 MiB مقابل 298.98 MiB).
- **لا 4.0.0 التجريبيّ**: نصُّ الهيئة عنه: «SDK version 4.0.0 (Beta) upgrades to Java 21 and updates dependencies, with no changes to business logic or schema files. This release is intended for testing and feedback.» وملفُّه مؤرَّخ 2024-11-03 — **قبل** سلسلة 3.4.x؛ فالاستنتاج (غيرُ مقيس بفتح الملفّ) أنه لا يحمل إصلاحات القواعد اللاحقة (مثل BR-KSA-81).

⚠️ **`ETag` ينتهي بـ`,2`** على الملفّات الأربعة: في SharePoint هذا رقمُ نسخة العنصر — أي أن **الملفّ خلف الرابط نفسِه قد يُستبدل** دون تغيير اسمه. وهذا بعينه ما يجعل التثبيتَ بالبصمة ضرورةً لا زينة.

### ١-٣ الحزمةُ تحمل المخطّطات وقواعدَ Schematron — من سجلّ الإصدارات الرسميّ (لا من فتح الملفّ)

الملفُّ لم يُفتح (لم يُنزَّل). ما يثبت محتواه نصوصُ الهيئة نفسِها في سجلّ الإصدارات:
- «Remove the unused validation rule BR-KSA-54 from **schematrons**.»
- «SDK version 4.0.0 (Beta) … with no changes to business logic or **schema files**.»
- «Enhancements to the output of the **XSD validation** error to display the missing or incorrect path/tag resulting in the error.»
- ووصفُ الصفحة: «An offline downloadable tool which can be used to validate an XML based e-invoice, credit or debit note files in accordance with the ZATCA published requirements…»

**أسماءُ الملفّات داخل الحزمة ومساراتُها: لم تُقَس** (تحتاج فتحَ الملفّ بعد التنزيل المعلَن).

### ١-٤ البصمة — **لا بصمةَ منشورة**

- **المسبار** على سجلّ الإصدارات كاملاً في حزمة الصفحة (117,463 حرفاً بين أوّل إصدارٍ و`key:3481`): `sha(1|256|512)` = **0** · `checksum` = **0** · `md5` = **0** · سلسلةٌ ستّ‑عشريّةٌ بطول 64 = **0** · `بصمة` = **0** · `تجزئة` = **0**.
- **الضابطُ الموجب** (المسبارُ يرى): `BR-KSA-81` = **4** إصابات · `SDK Version` = **72** · وكلمةُ `hash` = **3** إصابات (كلُّها عن «invoice hash»/«Previous invoice hash» في وصف الإصدارات، لا بصمةَ ملفّ).
- وعلى صفحة الموقع العامّ: لا إصابةَ لـ`sha|checksum|hash|md5` إلا أسماءَ ملفّات الصفحة (`sharing.js`…)، والضابطُ الموجب: الرابطُ نفسُه وجد (`sadzit` في السطر `725`).
- **`ETag` ليس بصمةَ محتوى** — هو معرّفُ عنصرٍ ونسخةٌ في SharePoint.

⟵ **فالتثبيتُ بالبصمة يعني بصمةً نحسبها نحن** (`sha256`) عند التنزيل الأوّل المعلَن، **وتُعلَن بوصفها بصمتَنا لا بصمةَ الهيئة**.

### ١-٥ الشروط — بنصّها

**(أ) شروطُ الحزمة نفسِها** — `https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx`، الأسطر `715`–`723` من الصفحة (والنصُّ نفسُه في بوّابة المطوّرين بالإنجليزية):

> Zakat, Tax and Customs Authority "ZATCA" has developed "the SDK toolkit" to help Persons subject to E-Invoicing Regulation and developers of technical solutions verify the compliance of generated E-Invoices, credit and debit notes to the requirements of the E-Invoicing Regulation.
> When using the SDK Toolkit, persons subject to E-Invoicing Regulation and developers of technical solutions must consider the following:
> A. Invoice files are considered compliant with the E-Invoicing Regulation only once they have passed the verification process which is carried out through the SDK Toolkit.
> B. All requirements for the Integration Phase as defined in the E-Invoicing Regulation, as well as E-Invoice Specifications documents and Security Features must be fulfilled.
> C. Meeting the requirements under the verification process made through the SDK Toolkit does not imply that the E-invoices, credit or debit notes have been approved by ZATCA. And it does not exempt Persons subject to E-Invoicing Regulation and developers of technical solutions from the responsibility of ensuring that the E-Invoice meets the E-Invoicing requirements; or any penalties or fines arising from failure to comply with applicable laws.
> I accept the above terms and conditions

**والنصُّ العربيّ** (بوّابةُ المطوّرين بالعربية، قسم «الشروط والأحكام»):

> طّورت هيئة الزكاة والضريبة والجمارك "حزمة أدوات تطوير البرمجيات" لمساعدة الأشخاص الخاضعين للائحة الفوترة الالكترونية ومطوّري الحلول التقنية على التحقق من امتثال الفواتير الإلكترونية والإشعارات الدائنة والمدينة لمتطلبات لائحة الفوترة الإلكترونية.
> يجب على الأشخاص الخاضعين للائحة الفوترة الالكترونية ومطوّري الحلول التقنية عند استعمال حزمة تطوير أدوات البرمجيات مراعاة ما يلي:
> أ. تُعتبر أنواع الفواتير بأنها ممتثلة لمتطلبات لائحة الفوترة الإلكترونية فقط عند اجتيازها عمليات التحقق التي تتم من خلال حزمة أدوات تطوير البرمجيات.
> ب. يجب استيفاء جميع متطلبات مرحلة التكامل والربط الموضحة في لائحة الفوترة الإلكترونية، بالإضافة إلى المستندات الخاصّة بمواصفات الفاتورة الإلكترونية والخصائص الأمنية.
> ج. استيفاء المتطلبات بموجب عمليات التحقق التي تتمّ من خلال حزمة أدوات تطوير البرمجيات لا يعني بأنّ الهيئة قد وافقت على الفواتير الإلكترونية أو الإشعارات الدائنة أو المدينة ولا يعفي الأشخاص الخاضعين للائحة الفوترة الالكترونية ومطوّري الحلول التقنية من مسؤولية التأكّد من أنّ الفاتورة الإلكترونية أو الإشعارات الدائنة أو المدينة تستوفي متطلبات الفوترة الإلكترونية كما لا يعفي من العقوبات والغرامات الناشئة عن عدم الامتثال للأنظمة المعمول بها.
> "أوافق على الشروط والأحكام المذكورة أعلاه"

⟵ **شروطُ الحزمة صامتةٌ تماماً عن الحفظ والنسخ وإعادة التوزيع** — تتكلّم عن أثر التحقّق القانونيّ وحدَه. (المسبار: `licen|third.party|open.source|apache|gpl|مفتوح` في سجلّ الإصدارات = **0**؛ الضابطُ الموجب: `schematrons` و`Readme` و`log4j` وُجدت.)

**(ب) شروطُ استخدام بوّابة الهيئة** — الرابطُ في تذييل بوّابة المطوّرين نفسِها («شروط الاستخدام» ← `https://zatca.gov.sa/ar/Pages/Terms.aspx`، وبالإنجليزية ← `https://zatca.gov.sa/en/Pages/Terms.aspx` — مقروءان من روابط الصفحة). **النصُّ العربيّ** (آخرُ تحديثٍ ظاهر: 09 يونيو 2026)، قسم «حقوق الملكية»:

> هذه البوابة وما فيها من خدمات ومواقع أخرى متشعبة منها تابعة لهيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية، وكل المواد المتوافرة في هذه البوابة بما في ذلك الرسوم التصويرية للمعلومات والبرمجيات (المحتويات) محمية بموجب حقوق النشر والعلامات التجارية وأشكال حقوق الملكية الأخرى.
> وبما أن أحد الأهداف الرئيسية للبوابة يتمثل في زيادة الوعي وإثراء الثقافة لمستخدمي البوابة وزوارها، فيسمح فقط للمستخدم الشخصي وللاستخدام غير الربحي بالاستفادة من محتوى البوابة وأي معلومات منشورة عليها، مع ضرورة الإشارة إلى أن بوابة هيئة الزكاة والضريبة والجمارك هي مصدر ذلك المحتوى وتلك المعلومات.
> وعلى الجانب الآخر لا يجوز بأي شكل من الأشكال بيع، أو ترخيص، أو تأجير، أو تعديل، أو نسخ، أو استنساخ، أو إعادة طبع، أو تحميل، أو إعلان، أو نقل، أو توزيع، أو العرض علنًا، أو تحرير، أو إنشاء أعمال مشتقة من أي مواد أو محتويات من هذه البوابة للجمهور أو لأغراض تجارية دون الحصول على الموافقة الخطية المسبقة من هيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية.

وفي «المرجعية القضائية»: «… علمًا أن اللغة العربية ستكون هي اللغة الرسمية المستخدمة لحل أي خلافات تنشأ عن استخدامك للبوابة أو أي من محتوياتها.»

**والنصُّ الإنجليزيّ** (آخرُ تحديثٍ ظاهر: 26 Aug 2026) — «Property Rights»:

> Furthermore, it is not allowed under any circumstances to sell, license, rent, modify, copy, imitate, re-print, download, advertise, transfer, distribute, publicly display, edit, or create works derived from any of this portal's materials or content for audience or commercial purposes without obtaining a previous written acceptance from the Zakat, Tax and Customs Authority (ZATCA) in the Kingdom of Saudi Arabia.

⚠️ **فرقٌ بين النصّين يخصّنا:** العربيُّ — وهو لغةُ الفصل — يذكر «**والبرمجيات**» صراحةً ضمن «المحتويات» المحميّة؛ والإنجليزيُّ يقول «with information and graphics included» ولا يذكرها.

**الحكمُ بقاعدة المالك («فإن سمحت بحفظه في المستودع…»):** **لا تسمح.** شروطُ الحزمة صامتة، وشروطُ البوّابة — المحالُ إليها من تذييل صفحة التنزيل نفسِها — **تمنع النسخَ والتوزيعَ «لأغراض تجارية» بلا موافقةٍ خطّية مسبقة**، ومنصّتُنا تجارية. فالصامتُ لا يُقرأ إذناً، والعامُّ يمنع.

⚠️ **وحدُّ هذا الحكم معلَن (قراءةُ نصٍّ لا رأيٌ قانونيّ):** البندُ العامُّ نفسُه يذكر «**تحميل**» بين الممنوع لأغراضٍ تجارية؛ بينما صفحةُ الحزمة موجَّهةٌ نصّاً إلى «مطوّري الحلول التقنية» ليستعملوها في التحقّق — وهذا هو استعمالُنا. فالتنزيلُ للاستعمال المقصود مسنودٌ بغرض الصفحة، **والحفظُ في مستودعٍ (نسخٌ دائم) لا يسنده شيء**. التمييزُ بين الاثنين قرارُ المالك لا قراري.

### ١-٦ الأدواتُ المضمَّنة في الحزمة وشروطُها

- **لا نصَّ للهيئة على تراخيص الأدوات المضمَّنة** في أيّ صفحةٍ قُرئت (المسبارُ والضابطُ في ١-٥).
- ما يُستدلّ عليه من سجلّ الإصدارات وحدَه:
  - «SDK Version 2.0.0 — This version fixes a security issue that was identified in the java component **log4j** …» ⟵ نسخةُ الجافا تضمّ مكوّناتٍ من أطرافٍ ثالثة (log4j مذكورةٌ بالاسم).
  - «SDK Version 3.1.2B — Fixes to: SDK .Net **ChilkatDotNet47 dll**» ⟵ نسخةُ .NET تضمّ مكتبةَ Chilkat (وهي مكتبةٌ تجارية — **ترخيصُها لم يُقرأ في هذا التشغيل**). سببٌ إضافيّ لاختيار الجافا.
  - «please refer to the "**Readme**" folder in the SDK for a description about this latest release» ⟵ في الحزمة مجلّد `Readme`؛ **ما فيه من تراخيص لم يُقَس**.
- ⟵ **يُقرأ مجلّدُ `Readme` وأيُّ ملفّ ترخيصٍ داخل الحزمة بعد التنزيل المعلَن وقبل البناء عليها.**

### ١-٧ فخٌّ في التنزيل من السير — مقيس

طلبُ الرابط **بلا جرّة ملفّات تعريف ارتباط** لم يصل الملفّ: سلسلةُ التوجيه انتهت بـ:
```
Location: https://login.microsoftonline.com:443/63996317-3453-4be2-b104-0eee31c91811/oauth2/authorize?...
HTTP/1.1 200 OK
Content-Length: 58797
Content-Type: text/html; charset=utf-8
```
أي **صفحةُ دخولٍ بحالة `200`** — فأمرٌ ساذج مثل `curl -L -o sdk.zip <url>` **يخرج بالرمز `0` ويحفظ صفحةَ HTML باسم `sdk.zip`**. وبجرّة ملفّات (`-c`/`-b` على ملفٍّ واحد) وصل الملفُّ `200` بحجمه واسمه. ⟵ خطوةُ السير تستعمل جرّةَ ملفّات، **وتتحقّق من `Content-Disposition` والحجم `49169499` والبصمة قبل أيّ استعمال** — والبصمةُ وحدها تمسك الحالتين (صفحة دخول · ملفّ مُستبدَل).

### ١-٨ التوصية — حزمةُ الهيئة

**يُنزَّل في السير من رابطه الرسميّ مثبَّتاً ببصمته** — لأن الشروط لا تسمح بالحفظ (§١-٥):
1. **الإعلانُ قبل التنزيل** (هذا الملفّ): `zatca-einvoicing-sdk-Java-238-R3.4.8.zip` · `https://sadzit.sharepoint.com/:u:/s/EXTERNALZATCA/IQCVzjXNpLTOTZbrYhs_w7aIAb7pPg1wfwl6wACeu1xCPAQ?e=pn3riq` (من `https://sandbox.zatca.gov.sa/downloadSDK`) · **49,169,499 بايتاً** · الإصدار **3.4.8**.
2. **البصمة**: الهيئةُ لم تنشر بصمة ⟵ تُحسب `sha256` عند التنزيل الأوّل المعلَن وتُسجَّل في الشيفرة **بوصفها بصمتَنا**، ومعها الحجمُ واسمُ الملفّ و`Last-Modified` مرجعاً ثانوياً.
3. **السير**: تنزيلٌ بجرّة ملفّات ← تحقّقٌ من الاسم والحجم والبصمة ← فشلٌ صاخب عند أيّ اختلاف (لا تراجعَ صامت إلى نسخةٍ أخرى).
4. **لا يُحفظ الملفّ ولا محتواه المفكوك (XSD/Schematron) في المستودع** — الحكمُ نفسُه يشمل النسخَ المفكوكة.

---

## ٢) veraPDF — `ق-١٤٨٨`

### ٢-١ خياراتُ التنزيل الرسميّة — مقيسة

| الخيار | المصدر | الإصدار | الحجم (`HEAD`) | التحقّقُ المنشور | الحكم |
|---|---|---|---|---|---|
| **المُثبِّت (Greenfield) — إصدار** ⭐ | `https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.2-installer.zip` | 1.30.2 | **32,923,960** | توقيعُ GPG `.zip.asc` + بصمةُ المفتاح في `docs.verapdf.org/install/` | **الموصى به** — الموقعُ الرسميّ للأداة، إصدارٌ رسميّ |
| الرابطُ الثابت «الأحدث» | `https://software.verapdf.org/rel/verapdf-installer.zip` | يتبع الأحدث | 32,923,960 (الملفُّ نفسُه اليوم: `ETag "6a20085a-1f66138"` مطابق) | — | **لا يُثبَّت عليه** — يتغيّر مع كلّ إصدار |
| إصدارُ التطوير | `https://software.verapdf.org/dev/verapdf-installer.zip` (`1.31.99`) | تطوير | لم يُقَس | `.asc` | **مرفوض** — نصُّ الموقع: «these are development prototypes with accompanying bugs and missing features … we offer no support or guarantees» |
| Maven Central — المُثبِّت | `https://repo1.maven.org/maven2/org/verapdf/apps/installer/1.30.2/installer-1.30.2-installer.zip` | 1.30.2 | 32,923,959 | `sha256`/`sha512`/`sha1`/`md5` + `.asc` بالمفتاح نفسِه | بديلٌ؛ **ليس الموقعَ الرسميَّ للأداة** (وإن أحالت إليه وثائقُها لتبعيّات Maven)، **ويختلف ببايتٍ واحد عن ملفّ الموقع** — فبصمتُه لا تصلح للتحقّق من ملفّ الموقع |
| Maven Central — `cli` | `…/org/verapdf/apps/cli/1.30.2/cli-1.30.2.jar` | 1.30.2 | 16,038,834 | `sha256: 287cc9c9757f99dcff4a2d39b68268245b48103fb6af443162d5a29df2afa332` + `.asc` | بديلٌ أصغر؛ **هل هو قابلٌ للتشغيل وحدَه (`java -jar`)؟ لم يُقَس** |
| صورةُ Docker للسطر الأمريّ | `ghcr.io/verapdf/cli` | **وسومُ تطويرٍ فقط**: `latest`, `v1.31.170`…`v1.31.178` (من `/v2/verapdf/cli/tags/list`) | — (المُلخَّص لـ`latest`: `sha256:1c8870ff880373c6e9babdd64a1b48f3ce0c8dc28e7657cb356cfcf2f8b4e059`) | مُلخَّصُ السجلّ | **مرفوض** — README الأداة: «To run the latest dev build available in the GitHub registry»؛ لا وسمَ لإصدار 1.30.x |
| صورةُ REST | `verapdf/rest` (Docker Hub) | لم يُقَس | لم يُقَس | لم يُقَس | خارجُ الحاجة (خادمُ REST لا أداةُ سطر أوامر) |

### ٢-٢ الموصى به — القياساتُ كاملة

```
GET https://software.verapdf.org/get-latest-version.php
  "releases": { "version": "1.30", "greenfield": { "filename": "verapdf-greenfield-1.30.2-installer.zip",
                "path": "/releases/1.30/verapdf-greenfield-1.30.2-installer.zip", "has_signature": true,
                "signature_path": "/releases/1.30/verapdf-greenfield-1.30.2-installer.zip.asc" } }

HEAD https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.2-installer.zip
  HTTP/1.1 200 OK · Content-Type: application/zip · Content-Length: 32923960
  Last-Modified: Wed, 03 Jun 2026 10:56:26 GMT · ETag: "6a20085a-1f66138"
  Content-Disposition: inline; filename="verapdf-greenfield-1.30.2-installer.zip"

HEAD …/verapdf-greenfield-1.30.2-installer.zip.asc   → 200 · application/pgp-signature · 659 بايتاً
HEAD https://software.verapdf.org/keys/KEY           → 200 · application/pgp-keys · 5613 بايتاً · Last-Modified: Tue, 28 Jul 2026 19:38:10 GMT
```
وصفحةُ `https://software.verapdf.org/rel/1.30/` تعرض: «verapdf-greenfield-1.30.2-installer.zip … 2026-06-03 10:56 … 31.40 MB».

### ٢-٣ التوقيعُ والبصمة — منشوران، **ومتطابقان**

- **نصُّ وثائق الأداة** (`https://docs.verapdf.org/install/`): «You'll need a copy of our GPG key. You can get it from our downloads site or from a keyserver: `gpg --keyserver keyserver.ubuntu.com --recv 78B17FE7` … The public key fingerprint is **13DD 102B 4DD6 9354 D12D E5A8 3184 8632 78B1 7FE7**.»
- **فكُّ رأس ملفّ التوقيع** (`.asc` المقروء، بلا تنزيل الحمولة): حزمةُ توقيعٍ من النسخة 4، خوارزمية RSA، تجزئة SHA-512؛ الحزمةُ الفرعيّة «Issuer Fingerprint» = **`13DD102B4DD69354D12DE5A83184863278B17FE7`**، ووقتُ التوقيع `2026-06-03T10:56:20Z`، ومعرّفُ المُصدِر `3184863278B17FE7`.
- ⟵ **بصمةُ الموقِّع في الملفّ تطابق البصمةَ المنشورة حرفاً بحرف.** (وتوقيعُ Maven للملفّ البديل يحمل الرأسَ نفسَه `FiEEE90QK03Wk1TRLeWoMYSGMnixf+c` = المفتاحُ نفسُه.)
- **ما لم يُقَس:** صحّةُ التوقيع على الملفّ نفسِه (`gpg --verify`) — تحتاج الملفّ، فتُجرى بعد التنزيل المعلَن.
- **لا `sha256` منشورة على موقع الأداة لهذا الملفّ**: المسبارُ على صفحة `/rel/1.30/`: `sha256`=0 · `sha1`=0 · `md5`=0 · `checksum`=0؛ **الضابطُ الموجب**: `\.asc`=15 إصابة، واسمُ الملفّ=6. وعلى صفحة التثبيت: `sha256`=0 و`checksum`=0 مقابل `fingerprint`=1 و`78B17FE7`=1.

### ٢-٤ الترخيص — بنصّه

- **`https://verapdf.org/home/`**: «veraPDF is dual-licensed under the GNU General Public License v3 or later (GPLv3+) and Mozilla Public License v2 or later (MPLv2+).» · وفيها: «Other project outputs such as test corpora and documentation are issued under a Creative Commons license.»
- **`https://docs.verapdf.org/develop/`** (قسم License): «VeraPDF free software: you can redistribute it and/or modify it under the terms of either: The GNU General public license GPLv3+ … The Mozilla Public License MPLv2+ …»
- **README الرسميّ** (`https://raw.githubusercontent.com/veraPDF/veraPDF-apps/master/README.md`، الأسطر 15–20): «The veraPDF PDF/A Validation Library is dual-licensed, see: GPLv3+ (LICENSE.GPL) · MPLv2+ (LICENSE.MPL)».

**الحكمُ بقاعدة المالك: تسمح بالحفظ** — «you can redistribute it» نصٌّ صريح. **وشرطُه المقروءُ من النصّ** (قراءةٌ لا رأيٌ قانونيّ): تبقى إشعاراتُ الترخيص مع الملفّ؛ وإن أُعطيت النسخةُ لطرفٍ خارج المنشأة لزم بيانُ مصدر الشيفرة (المصدرُ عامٌّ على GitHub `https://github.com/veraPDF`). **ومحتوى المُثبِّت من مكتباتٍ لأطرافٍ ثالثة وتراخيصِها: لم يُقَس** (وثائقُ التثبيت تذكر أن المُثبِّت مبنيٌّ على IzPack: «Framework: 5.1.3-84aaf ( IzPack )»).

### ٢-٥ التوصية — veraPDF

**يُحفظ في المستودع** في مجلّدٍ مسمّىً بإصداره ومصدره، مثلاً:
```
<مكانٌ يختاره القائد>/verapdf/1.30.2--software.verapdf.org/
  verapdf-greenfield-1.30.2-installer.zip        (32,923,960 بايتاً)
  verapdf-greenfield-1.30.2-installer.zip.asc    (659 بايتاً)
  KEY                                            (من https://software.verapdf.org/keys/KEY — 5,613 بايتاً)
  LICENSE.GPL · LICENSE.MPL                      (من مستودع الأداة الرسميّ)
  SOURCE.md                                      (الروابط · تاريخ التنزيل · بصمة المفتاح المنشورة · sha256 المحسوبة)
```
**الترتيب:** يُعلَن ← يُنزَّل ← `gpg --verify` بمفتاحٍ بصمتُه `13DD 102B 4DD6 9354 D12D E5A8 3184 8632 78B1 7FE7` (يُقارَن حرفاً قبل الوثوق) ← تُحسب `sha256` وتُسجَّل ← يُحفظ ← والسيرُ يتحقّق من `sha256` قبل الفكّ.

⚠️ **كلفةٌ تُعلَن للمالك لا تنقض القاعدة:** ملفٌّ ثنائيٌّ بـ31.40 MiB يدخل تاريخَ git **إلى الأبد** ويتكرّر مع كلّ ترقية إصدار. والقاعدةُ تقول «يُحفظ»؛ فإن رأى المالك الحجمَ سبباً للاستثناء فالبديلُ الجاهز: التنزيلُ في السير من الرابط نفسِه مثبَّتاً بالتوقيع والبصمة.

**وملاحظةُ تشغيل:** المُثبِّت يتطلّب تثبيتاً غيرَ تفاعليّ بملفّ `auto-install.xml` (موثَّقٌ في `docs.verapdf.org/install/` — «./verapdf-install ./auto-install.xml»). **هل يعمل ذلك على مشغّل السير بلا واجهة؟ لم يُقَس.**

---

## ٣) ما يلزم قبل التنفيذ — للقائد وللمالك

1. **مربّعُ «أوافق على الشروط والأحكام» في بوّابة الهيئة**: الزرُّ الرسميّ معطَّلٌ حتى يُعلَّم، والتنزيلُ من السير بالرابط المباشر **يتخطّى المربّع تقنياً**. الشروطُ الثلاثة (أ·ب·ج) معروضةٌ بنصّها أعلاه؛ **قبولُها قرارُ المالك صراحةً** — والإذنُ `ق-١٤٨٣` يقول «اقرأ شروطَ الاستعمال» ولا يقول «اقبلها». يُستحسن أن يُسجَّل قبولُه بنصّه قبل أول تنزيل.
2. **Java في السير — تنزيلٌ ثالثٌ غيرُ مأذون:** حزمةُ الهيئة تشترط «JDK versions >=11 and <15» (نصُّ بوّابة المطوّرين)، وveraPDF يشترط «Java 8, 11, 17 or 21» (README الأسطر 32 و77). **فـJDK 11 يخدم الاثنين.** والسيرُ اليوم لا يثبّت Java: `setup-java|java-version|temurin` = **0** في `web-tests.yml` و`web-tests-light.yml` (الضابطُ الموجب: `runs-on` وُجد 7 مرّات في الملفّين). **وهل في `ubuntu-latest` JDK 11 مثبَّتٌ مسبقاً؟ لم يُقَس** — فإن لم يكن، فتنزيلُ JDK إذنٌ ثالثٌ يُطلب من المالك.
3. **بصمةُ حزمة الهيئة تُحسب مرّةً وتُعلَن**: وتُذكر في التقرير أنها **بصمتُنا** (الهيئة لم تنشر بصمة) — كي لا تُقرأ لاحقاً بصمةً رسمية.
4. **الشروطُ العامّة لبوّابة الهيئة**: الحكمُ «لا تسمح بالحفظ» قراءةٌ لنصٍّ عامّ؛ ولا تواصلَ مع الهيئة لاستيضاحه (ممنوعٌ في هذه المهمّة). إن أراد المالك الحفظَ في المستودع فطريقُه نصًّا: «الموافقة الخطية المسبقة من هيئة الزكاة والضريبة والجمارك» — وهذا قرارُه.

---

## ٤) ما لم يُقَس

- محتوى حزمة الهيئة (أسماءُ ملفّات XSD وSchematron ومساراتُها، ومجلّد `Readme`، وأيُّ ملفّ ترخيصٍ فيه) — يحتاج التنزيل.
- تراخيصُ المكوّنات المضمَّنة في حزمة الهيئة (log4j وغيرها في الجافا؛ Chilkat في .NET).
- صحّةُ توقيع veraPDF على الملفّ فعلاً (`gpg --verify`) — يحتاج التنزيل.
- قابليّةُ `cli-1.30.2.jar` من Maven للتشغيل وحدَه.
- وجودُ JDK 11 في مشغّل `ubuntu-latest`، وعملُ مُثبِّت veraPDF بلا واجهة عليه.
- هل تتبدّل روابطُ SharePoint (رمز `e=`) أو تنتهي — الرابطُ القديم من 2022 ما زال يعمل اليوم، ولا يُستنتج منه ثبات.
- صفحةُ «إخلاء المسؤولية» في موقع الهيئة: الرابطان المجرَّبان (`/en/Pages/Disclaimer.aspx` و`/en/Pages/Privacy.aspx`) أعادا القالبَ نفسَه بالحجم نفسِه (261,328 بايتاً) بلا نصٍّ ذي صلة — فلم تُقرأ.
- تاريخُ آخر تحديثٍ لصفحة `DownloadSDK.aspx` في الموقع العامّ (يُجلب بنداءٍ داخليّ لم يُجرَ).

---

## ٥) المصادر — كلُّها مقروءةٌ في 2026-09-26

| المصدر | ما قُرئ منه |
|---|---|
| `https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx` | شروطُ الحزمة (الأسطر 715–723)، ورابطُ 2022 (السطر 725) |
| `https://sandbox.zatca.gov.sa/downloadSDK` (عربيّ ثم إنجليزيّ، لوحةُ المتصفّح) | الروابطُ الأربعة، سجلُّ الإصدارات، الشروطُ بالعربية، متطلّبُ JDK، رابطُ «شروط الاستخدام»، حالةُ مربّع الموافقة |
| `https://sandbox.zatca.gov.sa/assets/index-CqfbJeRB.js` (حزمةُ الصفحة نفسِها، مقروءةٌ في المتصفّح) | ربطُ الأزرار بالمتغيّرات، سجلُّ الإصدارات كاملاً، مسابيرُ البصمة والترخيص |
| روابطُ `sadzit.sharepoint.com` الخمسة | `HEAD` فقط: الاسم · الحجم · `Last-Modified` · `ETag` |
| `https://zatca.gov.sa/ar/Pages/Terms.aspx` · `https://zatca.gov.sa/en/Pages/Terms.aspx` | «حقوق الملكية» و«المرجعية القضائية» بنصّهما |
| `https://verapdf.org/home/` · `https://verapdf.org/software/` | الترخيصُ المزدوج، رابطُ المُثبِّت، تحذيرُ إصدارات التطوير |
| `https://software.verapdf.org/rel/` · `…/rel/1.30/` · `…/get-latest-version.php` | الإصدارُ الأحدث، اسمُ الملفّ، الحجمُ المعروض، التوقيع |
| `https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.2-installer.zip(.asc)` · `https://software.verapdf.org/keys/KEY` | `HEAD`، ونصُّ `.asc` (659 بايتاً) |
| `https://docs.verapdf.org/install/` · `https://docs.verapdf.org/develop/` · `https://docs.verapdf.org/cli/` | بصمةُ المفتاح، التثبيتُ غيرُ التفاعليّ، نصُّ الترخيص |
| `https://raw.githubusercontent.com/veraPDF/veraPDF-apps/master/README.md` (وفرع `integration`) · `…/veraPDF-rest/…/README.md` · `…/veraPDF-library/…/README.md` | الترخيص، متطلّبُ Java، وصفُ صورة Docker بأنها «dev build» |
| `https://ghcr.io/v2/verapdf/cli/tags/list` · `…/manifests/latest` | الوسوم والمُلخَّص (بيانات وصفية، بلا سحب صورة) |
| `https://repo1.maven.org/maven2/org/verapdf/apps/{cli,installer,greenfield-apps}/…` | `maven-metadata.xml`، قوائمُ 1.30.2، البصماتُ المنشورة، `HEAD` |
| المستودع: `docs/decisions.md:3745` · `:3750` · `.github/workflows/web-tests.yml:128,204,553,622` · `web-tests-light.yml:88,130,290` | نصُّ الإذنين، ومشغّلُ السير |

---

## مراجعةٌ عدائية

> **المُراجِع:** وكيلٌ مستقلّ، للقراءة فقط. **وقتُ القراءة:** 2026-09-26 بين `21:19` و`22:20` UTC (مقروءاً من ترويسة `Date` في الردود؛ = فجرَ 2026-09-27 بتوقيت الرياض).
> **المنهج:** كلُّ ادّعاءٍ أُعيد قياسُه من مصدره لا من نصّ المؤلّف: `git`/`grep` على `D:\mad-app` (`main` عند `034f94db`)، و`curl` (طلباتُ `HEAD`، وقراءةُ صفحات HTML ونصوصٍ فقط)، و`node` (`indexOf`/`slice`) على حزمة البوّابة. **لم تُنزَّل أيُّ حمولة** (لا ملفُّ الهيئة ولا مُثبِّت veraPDF ولا صورةُ Docker). المقروءُ محفوظٌ في `D:\mad-app-scratch\review-267\adv\`.
> ⚠️ **حادثةُ أداة:** `grep -oE '.{150}…'` بنمطٍ عريض على حزمة البوّابة (9,951,212 بايتاً، أسطرٌ طويلة) علّق حتى سقف الأداة (`§8.7` الوجه الثامن عشر)؛ أُوقف، وتُحقِّق بـ`Win32_Process` أن لا `grep` لي بقي حيّاً (الباقي أوامرُ جلساتٍ أخرى لم تُمسّ)، وأُعيدت القراءةُ كلُّها بـ`node indexOf`.

**الحصيلة** (معدودةً من خانات الحكم في الجداول أدناه بعد كتابتها، لا مقدَّرة): **٥٠** بنداً — **ثابت ٣٧** (منها سبعةٌ بتدقيقٍ أو حدٍّ يُضاف: 8 · 11 · 23 · 29 · 45 · 46 · 47) · **مردودٌ كلّياً أو جزئياً ٥** (البنود 12 · 13 · 14 · 26 · 42) · **لم يُتحقَّق ٢** (24 · 25) · **ما تركه المؤلّف «لم يُقَس» وحُسم الآن بقياسٍ أو وثيقة ٤** (33 · 40 · 43 · 48) · **جديدٌ لم يُذكر ٢** (49 · 50). ومعها **تسعةُ أمورٍ فاتت المؤلّف** (القسم «هـ»)، أثقلُها ثلاثة: `&download=1`، وانتقالُ `ubuntu-latest` إلى Java 25 افتراضياً، وصورةُ Docker Hub الرسميّة `verapdf/cli:v1.30.2`.

### أ) ادّعاءاتُ المستودع

| # | الادّعاء | الحكم | الدليل (مقروءٌ في هذا التشغيل) |
|---|---|---|---|
| 1 | `main` عند `034f94db` لا `56ae0157` | **ثابت** | `git log -1` ⟵ `034f94db5173a00fe79145caeee4e8a87151eab1`؛ و`56ae0157` أبوه مباشرةً |
| 2 | نصّ `ق-١٤٨٣` في `docs/decisions.md:3745` ونصّ `ق-١٤٨٨` في `:3750` | **ثابت** | السطران كما وُصفا. ⚠️ ونصُّ `ق-١٤٨٣` يقول «**من موقع الهيئة الرسميّ وحده**» — وهذا يمسّ البند «هـ-٨» أدناه |
| 3 | `runs-on: ubuntu-latest` في `web-tests.yml:128,204,553,622` و`web-tests-light.yml:88,130,290` | **ثابت** | سبعةُ أسطرٍ بأرقامها حرفاً؛ ولا ملفَّ سيرٍ ثالثاً (`ls .github/workflows` ⟵ الملفّان وحدهما) |
| 4 | `setup-java\|java-version\|temurin` = 0 في الملفّين | **ثابت** | `grep -ciE` ⟵ `0` و`0`؛ **ضابطي الموجب**: `setup-node\|node-version` ⟵ `6` و`4`؛ و`java\|jdk\|jre` في كلّ ملفّات السير ⟵ لا إصابة |

### ب) حزمةُ الهيئة (`ق-١٤٨٣`)

| # | الادّعاء | الحكم | الدليل |
|---|---|---|---|
| 5 | الصفحةُ العامّة `…/en/…/DownloadSDK.aspx` بحجم 263,724 بايتاً، والرابطُ `EfjCGimz…&download=1` في السطر `725` | **ثابت** | `Content-Length: 263724` (Date `21:19:04`)، والسطر `725` يحمل `id="btnDownloadSDK"` بالرابط نفسِه |
| 6 | `HEAD` على رابط 2022 ⟵ `zatca-envoice-sdk-203.zip` · 40,884,034 · `Fri, 13 May 2022 21:07:01 GMT` | **ثابت** | القيمُ الثلاث حرفاً، و`ETag: "{291AC2F8-4AB3-4F33-A55A-D6827E1FFA68},2"` |
| 7 | نصُّ الشروط الإنجليزيّ في الأسطر `715`–`723` | **ثابت** | `715` «Zakat, Tax…» · `716` «When using…» · `717`–`719` البنود A·B·C · `723` «I accept…». (في المصدر مسافاتٌ صفريّةُ العرض داخل «ma​​de» — لا تغيّر النصّ) |
| 8 | متغيّراتُ الروابط الأربعة في إعداد الصفحة | **ثابت** (بنقصٍ لا يغيّر الحكم) | الملفّ `/env-config.js` (Last-Modified `08 Sep 2026`) يعرّفها بـ`window._env_`؛ **وفيه ثلاثةٌ أخرى لم تُذكر**: `SIM_JAVA` = رابطُ الجافا نفسُه، و`SIM_DOT_NET` (مكرَّرٌ مرّتين) = رابطُ .NET، و`SIM_SDK_LINK` = رابطُ 3.3.8 |
| 9 | الزرُّ يربط `href:a.sdkJava` و`href:a.sdkDotNet`، و`DOWNLOAD_SDK_LINK` غيرُ مستعمل | **ثابت** | في `index-CqfbJeRB.js`: `href:a.sdkJava` ×2 و`href:a.sdkDotNet` ×2؛ `a.sdkLink` و`simSdkLink` ×0. **ومقيسٌ فوقه**: `disabled:!n` و`[n,i]=H.useState(!1)` — الزرُّ معطَّلٌ افتراضياً حتى يُعلَّم المربّع |
| 10 | مدخلُ «SDK Version 3.4.8» بنصّه، و3.4.8 آخرُ إصدار | **ثابت** | النصُّ حرفاً (`key:348`)؛ وعناوينُ السجلّ **72**، آخرُها «SDK Version 3.4.8» ثم «Simulation SDK Version 3.4.8» (`key:3481`، الملفّان أنفسُهما) |
| 11 | جدولُ `HEAD` للروابط الأربعة (الأسماء · الأحجام · التواريخ · `ETag`) | **ثابت بشرطٍ لم يُذكر** | القيمُ الستّ عشرة كلُّها طابقت **حين أُلحق `&download=1` بالرابط** (Date `21:40:41` للجافا). انظر البند 12 |
| 12 | «الرابطُ الرسميّ» في جدول الإعلان (بلا `&download=1`) هو ما يُنزَّل منه في السير بجرّة ملفّات | **مردودٌ جزئياً** | الرابطُ كما نشرته البوّابة، **مع جرّة ملفّات**، يُحوَّل إلى `…/ZatcaSDK/Forms/AllItems.aspx?id=…` — صفحةُ عارض SharePoint: `GET` ⟵ `200 · text/html · 440,109 بايتاً` لا الملفّ. **فالجرّةُ وحدها لا تكفي**؛ الملفُّ لا يُعطى إلا بـ`…?e=pn3riq&download=1` (`302` ⟵ `/sites/EXTERNALZATCA/ZatcaSDK/SDK/3.4.8/…zip?ga=1` ⟵ `200` بالحجم والاسم). **وسابقةٌ من الهيئة نفسِها**: رابطُ صفحتها العامّة (السطر `725`) يحمل `&download=1` |
| 13 | «SDK version 4.0.0 (Beta) … intended for testing and feedback.» | **ثابتٌ نصّاً، ناقصٌ معنىً** | الجملةُ التالية في المصدر نفسِه حُذفت: «**After two additional releases, we will exclusively use this version.**» — إعلانٌ من الهيئة بنيّة الانتقال **حصراً** إلى Java 21. وموضعُه في السجلّ (المدخل 48 من 72، بين 3.3.6 و3.3.7) **دليلٌ أقوى** على سبقه لسلسلة 3.4.x من التواريخ. ورابطُ 4.0.0 في السجلّ عنصرٌ آخر (`EcSY7gE…`) بالاسم والحجم نفسَيهما (67,203,981) و`Last-Modified: Sun, 16 Mar 2025` |
| 14 | مسابيرُ البصمة على سجلّ الإصدارات = 0، والضوابطُ `BR-KSA-81`=4 · `SDK Version`=72 · `hash`=3 | **الحكمُ ثابت، وجزءٌ من الأرقام مردود** | مقطعي من «SDK Version 1.0.0» إلى `key:3481` = **112,471** حرفاً (لا 117,463): `sha(1\|256\|512)`·`checksum`·`md5`·ستّ‑عشريٌّ بطول 64/40/32·`بصمة`·`تجزئة` كلُّها **0**؛ `BR-KSA-81`=4 · `SDK Version`=72 ✓؛ لكن `hash`=**4** لا 3، وأحدُها ليس «invoice hash» بل «hash validation to enforce C14N11 canonicalization … prior to hashing». **وأوسعُ من المؤلّف**: على الحزمة كاملةً `checksum`=0 · `sha256sum\|sha256:`=0 · `بصمة`=0 · `تجزئة`=0 · اسمُ الملفّ `R3.4.8`=0؛ **ضابطٌ موجب**: `downloadSDKPar`=8 |
| 15 | اقتباساتُ «schematrons» و«schema files» و«XSD validation» ووصفُ «An offline downloadable tool…» | **ثابت** | الأربعةُ حرفاً في الحزمة |
| 16 | نصُّ الشروط العربيّ في البوّابة | **ثابت** | المقاطعُ الستّة موجودةٌ حرفاً (`sdkDescriptionPar1`… و«أوافق على الشروط والأحكام المذكورة أعلاه») |
| 17 | مسبارُ الترخيص = 0 وضوابطُه | **ثابت** | `licen`·`third.party`·`open.source`·`apache`·`gpl`·`مفتوح`·`ترخيص`·`رخص`·`حقوق` = 0 في السجلّ؛ الضوابط `schematron`=2 · `Readme`=4 · `log4j`=2 · `Chilkat`=2. وعلى الحزمة كاملةً `redistribut`=0 و`حقوق النشر`=0 (ضابط: تعليقاتُ ترخيص React «Copyright» = 21) |
| 18 | شروطُ `Terms.aspx` بالعربية والإنجليزية بنصّها، وتاريخا التحديث | **ثابت** | المقاطعُ الأربعة العربية والمقطعُ الإنجليزيّ حرفاً؛ «آخر تحديث: 09 يونيو 2026 11:05 م» و«Last Update: 26 Aug 2026 01:34 PM» |
| 19 | الفرق: العربيُّ يذكر «والبرمجيات»، والإنجليزيُّ «with information and graphics included» | **ثابت** | والإصاباتُ الأربعُ لـ`software` في الإنجليزيّ كلُّها في «Usage Restrictions» لا في «Property Rights» |
| 20 | تذييلُ البوّابة يحيل إلى `Terms.aspx` | **ثابت** | `href:\`https://zatca.gov.sa/${e.language}/Pages/Terms.aspx\``؛ وروابطُ التذييل كلُّها: Terms · `PrivacyPolicy.aspx` · SiteMap · sdaia · vision2030 |
| 21 | متطلّبُ JDK «>=11 and <15» | **ثابت** | أربعةُ مواضع بالإنجليزية (`downloadSDKPar2`·`prerequisite`·`sdkA11`·`sdkA12`) وبالعربية «ما بين 11 و15» |
| 22 | بلا جرّة ملفّات ⟵ صفحةُ دخولٍ `200` | **ثابت** | مع `&download=1` وبدونه: السلسلةُ تنتهي بـ`login.microsoftonline.com/63996317-3453-4be2-b104-0eee31c91811/…` ثم `200 text/html`. ⚠️ **الحجمُ يتغيّر بين الطلبات** (قستُ 59,010 و58,821 مقابل 58,797) — فلا يُتّخذ رقماً ثابتاً |
| 23 | اقتباساتُ log4j وChilkat و«Readme» | **ثابتٌ نصّاً** | الثلاثةُ حرفاً (المصدرُ بعلامتي «“Readme”» المنحنيتين) |
| 24 | «نسخةُ الجافا تضمّ log4j» و«Chilkat مكتبةٌ تجارية» | **لم يُتحقَّق** | الأوّلُ استدلالٌ من مدخل 2.0.0 (الثاني من 72) — لا يثبت أن 3.4.8 يحملها؛ والثاني **لا مصدرَ له** في أيّ صفحةٍ قُرئت |
| 25 | `ETag` بـ`,2` = رقمُ نسخة العنصر، فالملفّ «قد يُستبدل» | **لم يُتحقَّق تفسيراً** | مقيس: **العناصرُ الستّة كلُّها** تنتهي بـ`,2` — ومنها ملفُّ 2022 ونسخةُ 4.0.0 في السجلّ — فاللاحقةُ موحَّدةٌ لا تدلّ على استبدال. والتوصيةُ بالتثبيت بالبصمة **قائمةٌ على أسسٍ عامّة** لا على هذه اللاحقة |
| 26 | `Disclaimer.aspx` و`Privacy.aspx` «أعادا القالبَ نفسَه بلا نصٍّ ذي صلة» | **مردودٌ في الوصف** | كلاهما `302` إلى `/en/Pages/PageNotFound.aspx` (261,328 بايتاً) — **ليستا صفحتين للهيئة أصلاً**. وسياسةُ الخصوصية الصحيحة `PrivacyPolicy.aspx` (`200`، 325,136 بايتاً)، ولا رابطَ «إخلاء مسؤولية» في تذييل البوّابة |

### ج) veraPDF (`ق-١٤٨٨`)

| # | الادّعاء | الحكم | الدليل |
|---|---|---|---|
| 27 | `get-latest-version.php` ⟵ 1.30 · `verapdf-greenfield-1.30.2-installer.zip` · `has_signature: true` | **ثابت** | النصُّ حرفاً (Date `21:53:38`)؛ والتطوير 1.31.99 |
| 28 | `HEAD` المُثبِّت: 32,923,960 · `03 Jun 2026 10:56:26` · `ETag "6a20085a-1f66138"` · `inline` | **ثابت** | حرفاً (Date `21:54:09`)؛ والمسارُ البديل `/releases/1.30/…` يعطي الملفّ نفسَه |
| 29 | الرابطُ الثابت «الأحدث» هو «الملفُّ نفسُه اليوم: `ETag` مطابق» | **ثابتٌ بحدٍّ لم يُذكر** | `ETag` في هذا الخادم = `hex(mtime)-hex(size)`: `0x6a20085a` = `2026-06-03T10:56:26Z` و`0x1f66138` = 32,923,960. فالتطابقُ تطابقُ **وقتٍ وحجم** لا **محتوى** |
| 30 | `.asc` 659 بايتاً · `KEY` 5,613 بايتاً · `KEY` Last-Modified `28 Jul 2026` | **ثابت** | حرفاً |
| 31 | صفحةُ `/rel/1.30/` تعرض «2026-06-03 10:56 … 31.40 MB» | **ثابت** | وتعرض كذلك 1.30.1 (31.39 MB، 2026-04-17) |
| 32 | مسابيرُ `/rel/1.30/`: `sha256`·`sha1`·`md5`·`checksum`=0، و`\.asc`=15، واسمُ الملفّ=6 | **ثابت** | الأرقامُ نفسُها؛ و`sha512`=0 أيضاً |
| 33 | «إصدارُ التطوير — الحجم لم يُقَس» | **قِيس الآن** | `/dev/verapdf-installer.zip`: 32,993,584 بايتاً · `Last-Modified: Fri, 25 Sep 2026 13:44:03 GMT` |
| 34 | اقتباسُ «development prototypes…» و«official releases with even numbered minor versions» | **ثابت** | في `verapdf.org/software/` (Date `21:58:54`) حرفاً |
| 35 | اقتباسُ وثائق التثبيت وبصمةُ المفتاح `13DD 102B … 78B1 7FE7` | **ثابت** | حرفاً (المصدرُ «You’ll» بعلامةٍ منحنية)؛ `fingerprint`=1 · `78B17FE7`=1 · `sha256`=0 · `checksum`=0 · `SHA`=0 |
| 36 | فكُّ رأس `.asc`: v4 · RSA · SHA-512 · بصمةُ المُصدِر `13DD…7FE7` · `2026-06-03T10:56:20Z` · المعرّف `3184863278B17FE7` | **ثابت** | فككتُ الحزمة بنفسي: القيمُ الستّ حرفاً |
| 37 | توقيعُ Maven بالمفتاح نفسِه | **ثابت** | فكٌّ كامل (لا بادئةُ Base64 وحدها): بصمةُ المُصدِر نفسُها، ووقتُ التوقيع `10:54:31Z` — توقيعٌ آخر لملفٍّ آخر |
| 38 | Maven المُثبِّت 32,923,959 وبصماتُه منشورة | **ثابت** | `Content-Length: 32923959`؛ `.sha256`·`.sha512`·`.sha1`·`.md5`·`.asc` كلُّها `200`؛ و`maven-metadata.xml` ⟵ `<release>1.30.2` |
| 39 | Maven `cli-1.30.2.jar` بحجم 16,038,834 و`sha256: 287cc9c9…a332` | **ثابت** | حرفاً |
| 40 | «هل `cli` قابلٌ للتشغيل وحدَه؟ لم يُقَس» | **مرجَّحٌ الآن من المصدر، والتشغيلُ لم يُقَس** | `cli-1.30.2.pom` يضبط `maven-assembly-plugin` بـ`jar-with-dependencies` و`mainClass` = `org.verapdf.apps.GreenfieldCliWrapper` و`appendAssemblyId=false` — أي أن الملفّ المنشور مبنيٌّ جرّةً مستقلّة لتطبيق Greenfield |
| 41 | `ghcr.io/verapdf/cli`: وسومُ تطويرٍ فقط، ومُلخَّصُ `latest` | **ثابت** | عشرةُ وسوم: `latest` و`v1.31.170`…`v1.31.178`؛ `docker-content-digest: sha256:1c8870ff…4e059` |
| 42 | صفُّ «صورة Docker … **مرفوض** — لا وسمَ لإصدار 1.30.x» | **مردود** | صحيحٌ على ghcr وحدَه. **على Docker Hub**: `verapdf/cli` («veraPDF CLI tool») يحمل `latest` و**`v1.30.2`** (`2026-06-03T10:57:00Z`، `sha256:d5ee329657cf9bc4b2400392dd54c7d0a0ce9980ff6fa2da5590eebeec007cdb`، amd64 بـ53,742,702 بايتاً) و`v1.30.1` و`v1.28.2` و`v1.28.1`. **ومصدرُه المشروعُ نفسُه**: `veraPDF/veraPDF-apps/.github/workflows/push-dockerhub.yml` يدفع `images: verapdf/cli` إلى Docker Hub |
| 43 | «`verapdf/rest` — لم يُقَس» | **قِيس** | وسومٌ منها `v1.30.2` (2026-06-07)؛ ويصفها README مستودعها بأنها «"official" docker image». خارجُ الحاجة كما قال المؤلّف |
| 44 | اقتباساتُ الترخيص (`verapdf.org/home` · `docs.verapdf.org/develop` · README الأسطر 15–20) | **ثابت** | الثلاثةُ حرفاً |
| 45 | «veraPDF يشترط Java 8, 11, 17 or 21 (README الأسطر 32 و77)» | **ثابتٌ بتدقيق** | السطر `32` متطلّبُ **التثبيت** («The current installation process requires Java 8, 11, 17 or 21 to be pre-installed.»)؛ والسطر `77` متطلّبُ **البناء من المصدر**. فدليلُ التشغيل هو `32` وحدَه |
| 46 | IzPack و`./verapdf-install ./auto-install.xml`، و«العملُ بلا واجهة لم يُقَس» | **ثابت، ومعه دليلٌ لم يُذكر** | `Dockerfile` الرسميّ للأداة يثبّت بلا واجهة: `FROM eclipse-temurin:11-jdk-alpine` (السطر 24) ثم `java -jar ./verapdf-greenfield-…/verapdf-izpack-installer-….jar docker-install.xml` (السطر 35)، وملفُّ `docker-install.xml` في المستودع (مسارُ التثبيت `/opt/verapdf`). **فالتثبيتُ غيرُ التفاعليّ على JDK 11 يُمارسه المشروعُ نفسُه** — على Alpine لا على `ubuntu-latest`، **وتشغيلُه على المشغّل لم يُقَس**. ⚠️ والسطر 34 ينزّل المُثبِّت بـ`wget` **بلا تحقّقٍ من توقيع** — فلا يُنسخ نمطُه |
| 47 | «لا `sha256` منشورة» | **ثابت، وأوسع** | `api.github.com/repos/veraPDF/veraPDF-apps/releases` ⟵ **0** إصدارات (ضابطٌ موجب: `…/tags` ⟵ `v1.31.178`…) — فلا بصمةَ على GitHub أيضاً |

### د) ما حسمه القياسُ ممّا تركه المؤلّف «لم يُقَس» — JDK على المشغّل

| # | الادّعاء | الحكم | الدليل (وثائقُ GitHub الرسميّة — `actions/runner-images`) |
|---|---|---|---|
| 48 | «وجودُ JDK 11 في `ubuntu-latest` لم يُقَس، فقد يلزم إذنٌ ثالث» | **حُسم بالوثيقة (لا بالتشغيل)** | `README.md:25`: `ubuntu-latest` = Ubuntu 24.04. و`Ubuntu2404-Readme.md` (Image Version `20260920.314.1`)، الأسطر 115–122: `8.0.504+1` · **`11.0.32+1` ⟵ `JAVA_HOME_11_X64`** · `17.0.20+1 (default)` · `21.0.12+1` · `25.0.4+1`. **فـJDK 11 مثبَّتٌ مسبقاً — ولا تنزيلَ ثالثاً إن استُدعي `$JAVA_HOME_11_X64` صراحةً** (لا `actions/setup-java` الذي ينزّل) |
| 49 | (لم يُذكر) | **خطرٌ مقيس** | رأسُ الوثيقة نفسِها: «[Ubuntu] `ubuntu-latest` label will use Ubuntu 26.04 in November 2026»، والإعلانُ `#14748` (أُنشئ 2026-09-17): «This change will be rolled out over a period of several weeks beginning October 19, 2026. We plan to complete the migration by November 19, 2026.» و`Ubuntu2604-Readme.md` (الأسطر 103–109): `11.0.32+1` باقٍ (`JAVA_HOME_11_X64`) **والافتراضيّ `25.0.4+1`**، ولا Java 8. ⟵ **Java 25 خارجُ شرط الهيئة (>=11 <15) وخارجُ قائمة veraPDF المعلنة (8/11/17/21)**: خطوةٌ تستدعي `java` بلا تحديدٍ ستعمل اليوم على 17 (مخالفٌ للهيئة أصلاً) وعلى 25 بعد الانتقال |
| 50 | (لم يُذكر) | **مقيس** | خطواتُ لينكس للحزمة في البوّابة: «قم بتثبيت [jq]» ثم «source install.sh» في مجلّدَي التطبيقات والتكوين؛ و`jq` موجودٌ في الصورتين (`jq 1.7` · `jq 1.8.1`) |

### هـ) ما فات المؤلّف — مرتَّباً بالأثر

1. **`&download=1` شرطٌ للحصول على الملفّ** (البند 12): الرابطُ المنشور وحده، ولو بجرّة ملفّات، يعطي صفحةَ عارضٍ HTML بـ`200`. ⟵ رابطُ السير = الرابطُ الرسميّ **مضافاً إليه** `&download=1` — تعديلٌ على الرابط **له سابقةٌ في صفحة الهيئة العامّة نفسِها**، ويُعلَن للمالك تعديلاً لا يُمرَّر صامتاً. وفحصُ الحجم والبصمة في خطوة السير (كما أوصى المؤلّف) هو ما يمسك الحالات الثلاث: صفحةُ دخول · صفحةُ عارض · ملفٌّ مُستبدَل.
2. **اختيارُ Java صراحةً في السير** (البندان 48–49): `$JAVA_HOME_11_X64` لا `java` الافتراضيّ — وإلا انكسر السيرُ أو عمل بإصدارٍ غير مدعوم بين 19 أكتوبر و19 نوفمبر 2026.
3. **صورةُ Docker Hub الرسميّة `verapdf/cli:v1.30.2`** (البند 42): بديلٌ مثبَّتٌ بمُلخَّصه بلا تثبيت Java لـveraPDF. **حدودُه**: Docker Hub ليس «الموقعَ الرسميَّ للأداة» بحرف شرط `ق-١٤٨٨`؛ والمُلخَّصُ من السجلّ لا منشورٌ على موقع الأداة؛ والصورةُ مبنيّةٌ بـ`Dockerfile` لا يتحقّق من التوقيع. **قرارُ المالك**، ويُعرض خياراً لا توصية.
4. **الجملةُ المحذوفة من وصف 4.0.0** (البند 13): الهيئةُ أعلنت نيّةَ الانتقال حصراً إلى Java 21. فشرطُ «>=11 <15» قد يتغيّر مع إصدارٍ قادم — والتثبيتُ بالبصمة مع الفشل الصاخب يمسك التغيير، **لكن الترقيةَ حينها تحتاج JDK 21** (موجودٌ في الصورتين: `JAVA_HOME_21_X64`).
5. **صلاحيةُ مفتاح veraPDF** (مقيسٌ بفكّ `KEY`): بصمةُ المفتاح الرئيسيّ **محسوبةً** (SHA-1 على حزمة المفتاح) = `13DD102B4DD69354D12DE5A83184863278B17FE7` — تطابق المنشورة، فملفُّ `KEY` من الموقع هو المفتاحُ الصحيح؛ والهويّة «Carl Wilson <techlead@verapdf.org>». وانتهاءُ المفتاح بآخر توقيعٍ ذاتيّ (أُنشئ 2026-07-20) = **`2027-07-20T11:42:06Z`**؛ والتوقيعُ الذاتيّ السابق (2023-08-02) كان يُنهيه في `2024-08-01` — **أي أن توقيعَ 2026-06-03 وقع والمفتاحُ منتهٍ بحسب التوقيعات الذاتيّة المنشورة يومها، ومُدّد بعده** (ومن هنا `KEY` Last-Modified = 2026-07-28)؛ والمفتاحُ الفرعيّ انتهى `2026-07-11` (لم يُستعمل: المُوقِّعُ هو الرئيسيّ). **أثرُ ذلك على `gpg --verify`: لم يُقَس** (لا gpg ولا الملفّ). ⟵ يُثبّت هذا توصيةَ المؤلّف: التحقّقُ بالتوقيع **مرّةً** عند التنزيل المعلَن، ثم `sha256` في السير — **لا `gpg --verify` خطوةً دائمة** تنكسر بعد 2027-07-20. ويُتجنَّب `--recv 78B17FE7` (معرّفٌ قصيرٌ بـ32 بتّاً) لصالح `KEY` من الموقع مقارَناً بالبصمة الكاملة.
6. **سلسلةُ الرسميّة من `zatca.gov.sa` إلى البوّابة**: `https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx` السطر `775` يحيل «E-Invoicing Developer Portal» إلى `https://sandbox.zatca.gov.sa/` — فالبوّابةُ رسميّةٌ بإحالةٍ مقيسة من الموقع الرئيسيّ، لا بنطاقها وحده.
7. **الصفحةُ العامّة العربية**: `…/ar/…/DownloadSDK.aspx` (257,973 بايتاً) تحمل في سطرها `725` **رابطَ 2022 نفسَه** — فحكمُ التقادم ثابتٌ بالنسختين.
8. **شرطُ «من موقع الهيئة الرسميّ وحده» غائبٌ عن §٣**: المؤلّف نبّه في §١-١ إلى أن المضيف `sadzit.sharepoint.com` لا `*.gov.sa`، **ولم يرفعه إلى قائمة «ما يلزم قبل التنفيذ»**. ونصُّ الإذن حرفيّ؛ فكونُ «الإحالة من الموقع الرسميّ تكفي» **حكمٌ يُعرض على المالك** لا يُفترض. (ملكيّةُ مستأجر SharePoint لم تُستقصَ: تتطلّب سؤالَ Microsoft عن نطاق الهيئة، ولم يُفعل.)
9. **ذاكرةُ السير المؤقّتة نسخة**: إن خُزّن الملفّ في `actions/cache` تجنّباً لتكرار التنزيل، فهي نسخةٌ محفوظةٌ خارج المستودع — وحكمُ شروط البوّابة («نسخ … تحميل … لأغراض تجارية») يمسّها كما يمسّ المستودع. **قرارُ المالك**، ولم يُقَس أيُّ شيءٍ فيه.

### و) ما بقي لم يُتحقَّق بعد هذه المراجعة

- حالةُ مربّع الموافقة في جلسة المؤلّف (`checked:false`): لا أرى متصفّحه؛ **المقيسُ أن الافتراضيّ في الشيفرة `useState(!1)`**.
- صحّةُ التوقيع على الملفّ (`gpg --verify`)، ومحتوى حزمة الهيئة وتراخيصُ مكوّناتها، وتشغيلُ `cli-1.30.2.jar`، والتثبيتُ على مشغّل السير فعلاً — كلُّها تحتاج تنزيلاً أو تشغيلاً لم يؤذَن به هنا.
- ملفّاتٌ أخرى في مجلّد SharePoint `…/ZatcaSDK/SDK/3.4.8/` (كملفّ بصمة): صفحةُ العارض (440,109 بايتاً) لا تحمل قائمةَ ملفّات — `FileLeafRef`=0 و`sha256\|checksum`=0 (ضابط: `R3.4.8.zip`=8) — ولم يُستعلَم عن المجلّد بواجهةٍ أخرى.
- ترخيصُ Chilkat، ومعنى `,2` في `ETag` عند Microsoft.

### ز) الملخّصُ المصحَّح

- **حزمةُ الهيئة**: الاسمُ `zatca-einvoicing-sdk-Java-238-R3.4.8.zip` · الإصدار 3.4.8 (آخرُ 72 مدخلاً) · **49,169,499 بايتاً** · `Sun, 21 Dec 2025 11:36:07 GMT` — **ثابتة**. **ولا بصمةَ منشورة** — ثابت بمسابير أوسع. **ويُصحَّح الرابطُ المُعلَن**: التنزيلُ يلزمه `…?e=pn3riq&download=1` مع جرّة ملفّات، ويُعلَن هذا الإلحاقُ للمالك. **وقراءةُ الشروط** (لا حفظَ في المستودع) ثابتةٌ نصّاً. **وJDK 11 موجودٌ** في `ubuntu-latest` اليوم وبعد انتقاله إلى 26.04 — بشرط استدعائه صراحةً بـ`$JAVA_HOME_11_X64`؛ فلا إذنَ ثالثاً للتنزيل.
- **veraPDF**: الاسمُ `verapdf-greenfield-1.30.2-installer.zip` · 1.30.2 · **32,923,960 بايتاً** · توقيعٌ بمفتاحٍ بصمتُه مطابقةٌ للمنشورة (ومحسوبةٌ من `KEY` نفسِه) — **ثابتة**، والتوصيةُ بالحفظ في المستودع بعد التحقّق **ثابتة**. **ويُضاف**: المفتاحُ ينتهي `2027-07-20` فلا يكون `gpg --verify` خطوةً دائمة؛ **ويُصحَّح** رفضُ Docker: `verapdf/cli:v1.30.2` منشورةٌ رسمياً على Docker Hub بمُلخَّص `sha256:d5ee3296…7cdb` — خيارٌ يُعرض على المالك بحدوده.
- **قراراتٌ للمالك تزيد على §٣**: إلحاقُ `&download=1` · كفايةُ «الإحالة من الموقع الرسميّ» لمضيفٍ ليس `*.gov.sa` · حكمُ ذاكرة السير المؤقّتة · وخيارُ Docker Hub لـveraPDF.
