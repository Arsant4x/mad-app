# بحثُ المجموعة INFRA-1 — البنيةُ التحتية: تشفيرُ القرص · الاستضافةُ داخل المملكة · بريدُ أوراكل في الرياض · أدواتُ المراقبة

> **قُرئ يوم 2026-09-26.** قراءةٌ لصفحاتٍ عامّة فقط: لا نموذجَ أُرسل، ولا دخولَ لأيّ حساب، ولا تواصلَ مع أيّ جهة.
> الشجرةُ `D:\worktrees\outbox-266` قُرئت ولم تُمسّ. كلُّ ملفٍّ خامٍ قُرئ محفوظٌ في
> `D:\mad-app-scratch\review-266\research\raw\infra1\` (صفحاتُ HTML · ملفّاتُ PDF · صورُ صفحاتٍ صُيّرت · ردودُ JSON).
>
> ⚠️ **حدٌّ معلَن**: نفدت ميزانيةُ البحث في محرّك البحث (`200/200` للجلسة كلّها) في منتصف العمل —
> فما بعدها قُرئ بعناوين معروفة مباشرةً (`curl` بترويسة متصفّح · وChromium يصيّر الصفحات الديناميكية)، لا ببحثٍ جديد.
> ⚠️ **وحدٌّ ثانٍ**: أداةُ `WebFetch` ردّت `403` على `oracle.com` — **وهو رفضٌ للأداة لا للصفحة**: الصفحةُ نفسُها
> ردّت `200` بـ`curl` بترويسة متصفّح. فـ«ثلاثُ صفحاتِ أوراكل ردّت 403» في `docs/بحث-مزوّد-البريد.md` كانت عمى الأداة.

## الأحكام بسطر

| # | البند | الحكم | بسطر |
|---|---|---|---|
| **R45** | تشفيرُ قرص المزوّد | ✅ **answered** | أوراكل (OCI): **كلُّ قرصٍ مشفَّرٌ دائماً بـ AES-256 ولا خيارَ لقرصٍ غير مشفَّر** — فلا يلزم `LUKS` إن كان المضيفُ OCI الرياض. علي بابا/SCCC: **التشفيرُ اختيارٌ عند الإنشاء ولا يُضاف لقرصٍ قائم**. ولا نصَّ نظاميّاً يوجب تشفيرَ القرص بعينه: م١٩ تدابير عامّة، واللائحة م٢٣ تُحيل إلى ضوابط الهيئة الوطنية للأمن السيبراني **أو أفضل الممارسات لغير الملزَم**، والضوابطُ الأساسية لا تُلزم منشأةً خاصّةً ليست بنيةً وطنيةً حسّاسة، وضابطُها ٢‑٨‑٣‑٣ يطلب التشفيرَ «أثناء النقل والتخزين» |
| **R46** | الاستضافةُ داخل المملكة وSCCC | ✉️ **letter** | **الإطلاقُ لا يتوقّف على SCCC**: سجلُّ هيئة الاتصالات الرسميّ يُدرج **Oracle من الفئة (ج)** (ومعها SCCC نفسُها وGoogle وSTC وغيرها — ٢٩ مقدّماً)، ومنطقةُ **`me-riyadh-1`** منطقةٌ تجارية عامّة، **وللمالك حسابٌ قائم فيها**. أمّا شروطُ SCCC (الرقم «٧٠٠» وتطابقُ الاسم) **فغيرُ منشورة** في وثائقها العامّة ⇐ خطابٌ جاهز. والاسمُ التجاري **يجوز تعديلُه وأن يكون بغير العربية** (نظامُ الأسماء التجارية م٤ وم٩) |
| **R66** | Email Delivery في الرياض | ✅ **answered** | نصُّ أوراكل: «**Email Delivery is available in all OCI regions and realms.**» — ونقطةُ `smtp.email.me-riyadh-1.oci.oraclecloud.com` **تُحلّ** (والمسبارُ مُصادَقٌ بحالتين) |
| **R67** | أدواتُ المراقبة لدى مزوّدي السحابة في المملكة | ✅ **answered** (بحدود) | OCI: Monitoring «**available in all … commercial regions**» وAPM (تتبّعٌ موزَّع بمعدّل الأخطاء · مراقبةُ توفّر · مراقبةُ المستخدم الحقيقي) وLogging — نقاطُها في الرياض تُحلّ. Google: سجلّاتٌ إقليمية في `me-central2` الدمّام، **لكن Monitoring وError Reporting «global»**. علي بابا/SCCC: SLS في `me-central-1` الرياض؛ ARMS وCloudMonitor **لم تُقرآ** |

---

## R45 — تشفيرُ قرص مزوّد الاستضافة (launch-gating)

**السؤال من المصدر** (`docs/licensing-and-operations.md:36` · `docs/decisions.md:2004` — `ق-٧٢٩`): لا `dm-crypt` على الضيف
وتشفيرُ قرص المزوّد مجهول — «يُحسم بشهادةٍ من المزوّد أو `LUKS` قبل أوّل بياناتِ تاجرٍ حقيقيّ».

### ① ما يوجبه النصّ النظاميّ — ولا يوجب أكثر منه

| النصّ | المادة | الاقتباس (جملةٌ واحدة) | المصدر |
|---|---|---|---|
| نظامُ حماية البيانات الشخصية | **م١٩** (لم تُعدَّل — لا «تعديلات المادة» تحتها) | «على جهة التحكم اتخاذ ما يلزم من إجراءات ووسائل تنظيمية وإدارية وتقنية تضمن المحافظة على البيانات الشخصية، بما في ذلك عند نقلها؛ وذلك وفقاً للأحكام والضوابط التي تحددها اللوائح.» | https://laws.boe.gov.sa/boelaws/laws/lawdetails/b7cfae89-828e-4994-b167-adaa00e37188/1 |
| اللائحةُ التنفيذية للنظام | **م٢٣ «أمن المعلومات»** | «الالتزام بالضوابط والمعايير والقواعد ذوات الصلة الصادرة عن الهيئة الوطنية للأمن السيبراني، أو أفضل ممارسات ومعايير الأمن السيبراني المتعارف عليها في حال كانت جهة التحكم غير ملزمة بتطبيق الضوابط والمعايير والقواعد الصادرة عن الهيئة الوطنية للأمن السيبراني.» | https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2 |
| الضوابطُ الأساسية للأمن السيبراني `ECC-2:2024` (النسخةُ العربية — **الملزِمة بنصّ إخلاء المسؤولية في الإنجليزية**) | **«نطاق عمل الضوابط»** (ص ٩ المطبوعة) | «تُطبّق هذه الضوابط على الجهات الحكومية في المملكة العربية السعودية (…)، وجهات القطاع الخاص التي تمتلك بنى تحتية وطنية حساسة (…) أو تقوم بتشغيلها أو استضافتها» | https://cdn.nca.gov.sa/api/public/cms/files/e4c81aa9-a609-4823-abab-347283e29731_ECC-2-2024-AR-19092024-.pdf |
| الضوابطُ نفسُها | **٢‑٨‑٣‑٣** (ص ٢١ المطبوعة) | «تشفير البيانات أثناء النقل والتخزين بناءً على تصنيفها وحسب المتطلبات التشريعية والتنظيمية ذات العلاقة.» | المصدر نفسُه |

⚠️ **حدُّ القراءة**: الـPDF العربيّ **بلا طبقة نصّ** (`pdftotext` أخرج ٥٬٦٤٧ حرفاً من ٤١ صفحة، رموزاً فارغة) — فصُيّرت الصفحات
١٠ و٢٢ و٢٤ و٢٥ صوراً (`raw/infra1/ecc-ar-png/`) **وقُرئت بالعين**؛ والاقتباسُ من الصورة لا من استخراجٍ آليّ.
والإنجليزيةُ (https://cdn.nca.gov.sa/api/files/public/upload/86e09090-44e4-481f-bc28-355673607654_ECC--2024-EN.pdf) طابقت
المعنى («2.8.3.3 Encryption of data in-transit and at-rest, as per their classification…») وتنصّ في رأسها أن «the Arabic version will be the binding language».

**الخلاصةُ النظامية**: رِكز منشأةٌ خاصّة ليست مالكةً ولا مشغّلةً لبنيةٍ وطنيةٍ حسّاسة ⇐ **خارج نطاق الإلزام** بالضوابط الأساسية
(والهيئةُ «تُشجّع … وبشدة» غيرَها)، فيسري عليها شقُّ اللائحة الثاني: **أفضلُ الممارسات**. **ولا نصَّ في م١٩ ولا م٢٣ يسمّي «تشفير القرص»**.
فتشفيرُ القرص **قرارُ أفضل ممارسة يتّسق مع ٢‑٨‑٣‑٣** — لا التزامٌ منصوصٌ بعينه. (⚠️ وتدخل رِكز نطاقَ الضوابط بأوّل عقدٍ حكوميّ —
مسجَّلٌ في `docs/domain-scan/28` D4.)

### ② ما يقوله المزوّد نفسُه — الوثيقةُ الرسمية بدل «الشهادة»

| المزوّد | الاقتباس (جملةٌ واحدة) | المصدر |
|---|---|---|
| **Oracle OCI** (Block Volume — ويشمل قرصَ الإقلاع) | «The Block Volume service always encrypts all block volumes, boot volumes, and volume backups at rest by using the Advanced Encryption Standard (AES) algorithm with 256-bit encryption.» — ومعها في الصفحة نفسِها: «No option exists for unencrypted volumes at-rest.» | https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/blockvolumeencryption.htm |
| **Alibaba Cloud ECS** (والمنصّةُ نفسُها التي تشغّلها SCCC) | «You cannot directly encrypt an existing unencrypted disk.» — والتشفيرُ في غير الحالات الخاصّة: «Select the Encryption checkbox and select a KMS key.» (آخرُ تحديث للصفحة: Jun 20, 2026) | https://www.alibabacloud.com/help/en/ecs/user-guide/encryption-overview |
| **SCCC** (صفحةُ البنية التحتية) | **لا ذكرَ للتشفير** — بحثتُ في نصّها المستخرَج عن `encrypt` و`Encrypt` و`AES` و`default` ⇒ **صفر**؛ ومسبارُ التحكّم على الصفحة نفسِها: «sovereignty» ⇒ **موجود** («complete data sovereignty across dual riyadh availability zones») | https://www.sccc.sa/capabilities/robust-cloud-infrastructure |

⚠️ **ونفيٌ مسجَّلٌ حتى لا يُعاد**: ملخّصُ محرّك البحث ادّعى أن «encryption is on by default at SCCC» — **ولا أصلَ له في صفحة SCCC** (المسبارُ أعلاه). لا يُبنى عليه.

### ③ الحكم — answered

- **إن كان مضيفُ الرياض OCI** (`me-riyadh-1`): القرصُ **مشفَّرٌ بالبناء** بـ AES-256 ولا يمكن غيرُ ذلك — **يُغلق الفراغُ بوثيقة المزوّد**، ولا يلزم `LUKS`.
  والمفتاحُ «Oracle-provided» افتراضاً، أو مفتاحٌ من Vault إن اختير (الوثيقةُ نفسُها). ⚠️ **ولم يُقرأ مسارُ الشاشة التي يظهر فيها ذلك** — فالتحقّقُ من قرصٍ بعينه نظرةٌ في وحدة التحكّم بيد المالك.
- **إن كان SCCC/علي بابا**: **يجب اختيارُ التشفير عند إنشاء القرص** — فالقرصُ غيرُ المشفَّر لا يُشفَّر بعده إلا بنسخه (لقطةٌ أو صورةٌ مشفّرة ثم إبدال).
  ⇐ قيدٌ على لحظة الإنشاء لا يُستدرك. (والسؤالُ الخامس في الخطاب يطلب إفادةَ SCCC مكتوبةً.)
- **مضيفُ سنغافورة الحاليّ (Alibaba ECS)**: حالُ قرصه **لا تُعرف من داخل الضيف**؛ تُقرأ من وحدة التحكّم أو من حقل `Encrypted` في `DescribeDisks` (الوثيقةُ تذكر ضبطَ «the Encrypted and KMSKeyId parameters» عند الإنشاء).
  **ولا أثرَ عملياً**: لا بياناتِ تاجرٍ حقيقيٍّ عليه قبل الانتقال (`R46`).
- **ما لا يغطّيه تشفيرُ القرص** (مسجَّلٌ في `ق-٧٢٩` ويبقى): المقالبُ على المضيف (مخرجُها `restic` المشفَّر) و`ssl = off` داخل شبكة `docker`.

---

## R46 — الاستضافةُ داخل المملكة وتفعيلُ SCCC (launch-gating)

**السؤال من المصدر** (`docs/licensing-and-operations.md:38` و`:30` · `docs/decisions.md:412` — `ق-٢٢٦`): المضيفُ في سنغافورة، وقرارُ «الرياض» معلَّقٌ بتفعيل
SCCC الذي رُفض مرتين (رقمٌ موحّد «٧٠٠» وتطابقُ الاسم التجاري مع اسم المنتج، و`rikz.sa` لم يُسجَّل)؛ ولا يُفتح التسجيلُ الحقيقيّ قبل مضيفٍ داخل المملكة.

### ① نصُّ النقل من النظام نفسِه — يسدّ «حدَّ القراءة» المعلَن في الوثيقة

`docs/licensing-and-operations.md:38` يقول: «لم يُقرأ نصُّ مادة النقل من **النظام** نفسِه». **قُرئ اليوم** من هيئة الخبراء — **م٢٩ بعد تعديلها**
بالمرسوم الملكي (م/148) وتاريخ 1444/9/5هـ:

- الفقرة (٢/ب) — الشرطُ الحاكم: «أن يتوافر مستوى مناسب لحماية البيانات الشخصية في خارج المملكة؛ بما لا يقل عن مستوى الحماية المقرر في النظام واللوائح، وفقاً لنتائج تقويم تجريه الجهة المختصة في هذا الشأن بالتنسيق مع من تراه من الجهات المعنية.»
- المصدر: https://laws.boe.gov.sa/boelaws/laws/lawdetails/b7cfae89-828e-4994-b167-adaa00e37188/1 (قُرئ 2026-09-26)

⇐ **النقلُ خارج المملكة ليس محظوراً بإطلاق** بل مشروطٌ (والتفصيلُ في لائحة النقل المقروءة سابقاً: م٣ لا دولةَ «كافية» بعد ⇒ ضماناتُ م٤ وتقييمُ م٧).
**فقرارُ «الرياض» قرارُ المالك** (ويسنده التزامُ «إيجار» وسقوطُ البنود القياسية بشرطه — `ق-١٣٤٧`) **لا حظرٌ نصّيٌّ بعينه** — والحاجزُ المعلَن يبقى كما هو.

### ② الإطلاقُ لا يتوقّف على SCCC — سجلُّ الهيئة الرسميّ

**سجلُّ «مقدّمي خدمات الحوسبة السحابية المسجّلين» لدى هيئة الاتصالات والفضاء والتقنية** — قُرئ كاملاً من واجهة الصفحة نفسِها
(الصفحةُ تجلب بياناتها بطلب `POST` إلى `/api/feature/Enterprise/EnterpriseResult`؛ أعدتُ الطلبَ نفسَه بحجم صفحة ٥٠ للغتين — قراءةٌ لا إدخال):
https://www.cst.gov.sa/en/knowledge-center/digital-knowledge/cloud-computing/cloud-computing-providers

- **العدد: ٢٩** (مطابقٌ لعدّاد الصفحة «Showing 1 - 6 of 29»).
- **Oracle — «Class C»** (بالعربية: «شركة اوراكل سيستمز ليمتد (Oracle) — الفئة ج»).
- **Saudi Cloud Computing Company — «Class C»** (بالعربية: «شركة الحوسبة السحابية العامة لتقنية المعلومات»؛ وشعارُ السجلّ `alibaba.ashx` — فهي SCCC).
- ومعهما من الفئة (ج): Google Cloud · STC · Mobily · Zain · SITE · Sparkoo … (القائمةُ كاملةً في `raw/infra1/cstjson/cst-all-en.json` و`cst-all-ar.json`).
- **مسبارٌ مُصادَق**: `Amazon`/`AWS`/`Microsoft`/`Azure` ⇒ **صفر** في القائمة؛ والتحكّمُ على الملفّ نفسِه: `Oracle` ⇒ ٢ و`Google` ⇒ ٢. (خلافاً لملخّص محرّك البحث الذي أدرجهما — لا يُبنى عليه.)
- ⚠️ **حدّ**: القائمةُ لا تسمّي المنطقة؛ ولم تُقرأ تعريفاتُ الفئات (أ/ب/ج) من «تنظيمات تقديم خدمات الحوسبة السحابية» في هذا البحث (مقروءةٌ جزئياً في `docs/domain-scan/28` §ج).

**ومنطقةُ أوراكل في الرياض تجاريةٌ عامّة** — وثيقةُ المناطق:
«Saudi Arabia Central (Riyadh) me-riyadh-1 Riyadh, Saudi Arabia RUH OC1» —
https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm (قُرئت 2026-09-26)

**وللمالك حسابٌ قائم فيها** — مقروءٌ من المستودع لا مفترَض: `docs/بحث-مزوّد-البريد.md` ① «لأن حساب المالك هناك قائم، ودلوُ النسخ الاحتياطي عليه».

⇐ **شرطُ الإطلاق («مضيفٌ داخل المملكة») قابلٌ للاستيفاء اليوم بلا SCCC**: خادمٌ في `me-riyadh-1` على الحساب القائم، لدى مقدّمٍ مسجّلٍ من الفئة (ج).
والمفاضلةُ بين المزوّدين **قرارُ المالك** لا يحسمه هذا البحث.

### ③ شروطُ SCCC — غيرُ منشورة ⇐ خطاب

- **ما بحثتُ فيه**: سياسةُ الخصوصية (https://sccc.sa/privacy) · شروطُ الاستخدام (https://sccc.sa/terms) · اتفاقيةُ الاشتراك (https://sccc.sa/subscription-agreement) —
  نصوصُها مصيَّرةً، بحثاً عن: `real-name|verification|commercial registration|unified|700|trade name|KYC` ⇒ **لا شرطَ تفعيل** (الإصاباتُ الوحيدة عن التحقّق من الهويّة في اتصالات الدعم وطلبات الخصوصية).
  **التحكّم**: الملفُّ نفسُه يُصيب `legal@sccc.sa` وعبارةَ «verify your identity» (سطر ٦٨) — فالمسبارُ يرى.
- **فشروطُ «٧٠٠» و«تطابق الاسم» سياسةٌ داخلية للشركة غيرُ منشورة** ⇐ لا يجيب عنها إلا ردٌّ مكتوب منها:
  **الخطاب**: `D:\mad-app-scratch\review-266\research\letters\INFRA-1-SCCC.md`.
- **القناة**: SCCC لا تنشر بريداً للاستفسار التجاريّ — صفحةُ التواصل (https://sccc.sa/en/contact) نموذجٌ فقط وبريدُها الوحيد `careers@sccc.sa`؛
  و`legal@sccc.sa` منشورٌ في سياسة الخصوصية **لمسائل البيانات الشخصية** ⇐ الأنسبُ تذكرةٌ من داخل الحساب القائم أو نموذجُ «contact sales».

### ④ ما يخصّ الاسم التجاريّ والرقمَ الموحّد — بنصّه أو بإعلان ما لم يُقرأ

- **الاسمُ التجاريّ يجوز أن يكون بغير العربية ويجوز تعديلُه** — نظامُ الأسماء التجارية (م/83 · 1446هـ · **ساري**):
  - **م٤**: «يجوز أن يتكون الاسم التجاري من ألفاظ أو حروف أو أرقام أو من واحد أو أكثر منها بلغة غير العربية.»
  - **م٩**: «للتاجر المقيد في السجل التجاري تعديل اسمه التجاري بعد استيفاء الشروط والإجراءات الواردة في النظام واللائحة»
  - المصدر: https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/d4801a45-7f76-4414-bdca-b20900db6fc4/1
  - ⇐ **مسارٌ لتطابق الاسم إن أصرّت SCCC عليه** — مع قيد م٦/م٧ (حظرُ المتشابه) الذي لا يُحسم إلا عند الحجز. ⚠️ **لم يُقرأ** نصُّ اللائحة التنفيذية للأسماء التجارية.
- **«الرقم الموحّد ٧٠٠» — لم يُقرأ من نصٍّ رسميّ**:
  - نصُّ **نظام السجل التجاري** (م/83) من هيئة الخبراء **لا يذكر «الرقم الوطني الموحد»** — بحثتُ عنه و«رقم السجل» في النصّ المستخرَج ⇒ صفر؛
    والتحكّمُ على الملفّ نفسِه: «الاسم التجاري» ⇒ موجودٌ في مادة بيانات طلب القيد. (https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/98ee4b51-d398-4323-ae69-b2b8009f3156/1)
  - فالرقمُ موضعُه **اللائحةُ التنفيذية لنظام السجل التجاري** — **لم تُقرأ**: صفحةُ الوزارة `https://mc.gov.sa/7` ⇒ تحويلٌ إلى `404`؛ ونسخةُ المركز الوطني للوثائق (ncar.gov.sa) ديناميكيةٌ عادت بـ٣٨ حرفاً؛ ومنشورُ حساب الوزارة على X ردّ `402`.
  - ⇐ **والمالكُ أعلمُ برقمه**: الرقمُ الوطنيّ الموحّد يظهر في شهادة سجلّه. والسؤالُ الأوّل في الخطاب يطلب من SCCC الصيغةَ التي تقبلها.

### ⑤ الحكم — letter

- **الجزءُ الحاكم للإطلاق مُجاب**: الاستضافةُ داخل المملكة **لا تتوقّف على SCCC** (Oracle فئة ج · `me-riyadh-1` · حسابٌ قائم).
- **الجزءُ الذي لا يُجاب إلا كتابةً**: شروطُ تفعيل SCCC ⇒ الخطاب.
- ⛔ **ويبقى الحاجزُ كما هو**: لا تسجيلَ حقيقيّ قبل قيام المضيف داخل المملكة — هذا البحث يُسقط «معلَّقٌ بـSCCC» لا «معلَّقٌ بالانتقال».

---

## R66 — Email Delivery في `me-riyadh-1`

**السؤال من المصدر** (`docs/بحث-مزوّد-البريد.md:89` ⑤): توفّرُ `Email Delivery` في `me-riyadh-1` بعينها — «ثلاثُ صفحاتِ أوراكل ردّت 403».

### النصّ

| الوثيقة | الاقتباس | المصدر |
|---|---|---|
| **أسئلةُ Email Delivery الشائعة** — سؤال «What region(s) support Email Delivery?» | «Email Delivery is available in all OCI regions and realms.» | https://www.oracle.com/application-development/email-delivery/faq/ (قُرئت بـ`curl` بترويسة متصفّح ⇒ `200`) |
| **توفّرُ خدمات OCI** — الجدولُ الوحيد للخدمات المقصورة على مناطق | «Emerging services» يُدرج **Blockchain Platform وحدها** (وفي الشرق الأوسط: «Dubai, Jeddah»)؛ وفي رأس الصفحة: «Each Oracle Cloud region supports our 200-plus cloud services.» | https://www.oracle.com/cloud/distributed-cloud/service-availability/ |
| **وثيقةُ المناطق** | «OCI offers its cloud services in all of its public cloud regions and dedicated cloud regions. However, certain specialized or emerging services are available only in select regions.» | https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm |

### المسبار — بحالتين معلومتين قبل الوثوق

استعلامُ DNS (قراءةٌ عامّة لا تواصل):

| الاسم | النتيجة | الدور |
|---|---|---|
| `smtp.email.me-riyadh-1.oci.oraclecloud.com` | **يُحلّ** ⇒ `84.8.64.15` | المطلوب |
| `smtp.email.me-jeddah-1.oci.oraclecloud.com` | يُحلّ ⇒ `192.29.227.250` | — |
| `smtp.email.us-ashburn-1.oci.oraclecloud.com` | يُحلّ ⇒ `130.35.96.103` | **تحكّمٌ موجب** (منطقةٌ معروفةُ التوفّر) |
| `smtp.email.me-fakecity-1.oci.oraclecloud.com` | **Non-existent domain** | **تحكّمٌ سالب** (منطقةٌ لا وجود لها) |
| `ctrl.email.me-riyadh-1.oci.oraclecloud.com` (مستوى التحكّم) | يُحلّ ⇒ `84.8.65.168` | — |

### الحكم — answered، بثلاثة حدود

1. **تأكيدُ الحساب نفسِه** (أنّ الحسابَ مشتركٌ في منطقة الرياض وأن الخدمة تظهر فيه) يبقى نظرةً في وحدة التحكّم — **وليس شرطاً للحكم**: نصُّ أوراكل يعمّ المناطقَ كلَّها، والنقطةُ قائمة.
2. **«approved senders are specific to the region»** (الصفحةُ الشائعة نفسُها) ⇐ المرسِلُ المعتمَد يُنشأ في **`me-riyadh-1`** تحديداً، وإلا رُفض الإرسالُ من الرياض.
3. **جدولُ SPF الرسميّ بلا صفٍّ للشرق الأوسط** (Americas · Asia/Pacific · Europe · All Commercial Regions — https://docs.oracle.com/en-us/iaas/Content/Email/Tasks/configurespf.htm):
   فالسجلُّ الآمن هو صفُّ «All Commercial Regions»، أو ما يعرضه حوارُ الإعداد في وحدة التحكّم لمنطقة الرياض.
   ⚠️ **ملاحظةٌ لا استنتاج**: سجلُّ `ap.rp.oracleemaildelivery.com` يضمّ `84.8.68.0/25`، قريباً من عنوان نقطة الرياض — **ولا يُثبت هذا أين تخرج الرسائلُ فعلاً**؛ فمكانُ خوادم الإخراج **لم يُقرأ في نصّ** ويبقى سؤالاً لإقامة البيانات إن أُريد الجزمُ به.

---

## R67 — أدواتُ المراقبة وتتبّع الأخطاء لدى مزوّدي السحابة داخل المملكة (بحثٌ مؤجَّل)

**السؤال من المصدر** (`docs/بحث-تتبع-الأخطاء.md:111`): «لم تُبحث أدواتُ المراقبة من مزوّدي السحابة داخل المملكة».

| المزوّد (منطقةٌ في المملكة) | ما قُرئ | الاقتباس | المصدر |
|---|---|---|---|
| **Oracle** (`me-riyadh-1`) | **Monitoring** (مقاييسُ وإنذارات) | «The Monitoring service is available in all Oracle Cloud Infrastructure commercial regions.» | https://docs.oracle.com/en-us/iaas/Content/Monitoring/Concepts/monitoringoverview.htm |
| | **APM** — تتبّعٌ موزَّع · مراقبةُ توفّر · مراقبةُ المستخدم الحقيقي · مراقبةُ الخوادم | «Distributed Tracing monitors transaction performance, volume, and error rate and notifies you of issues.» | https://docs.oracle.com/en-us/iaas/application-performance-monitoring/doc/application-performance-monitoring.html |
| | **Logging** — سجلّاتٌ مخصَّصة من التطبيق | «Custom logs can be ingested through the API, or by configuring the Unified Monitoring Agent.» | https://docs.oracle.com/en-us/iaas/Content/Logging/Concepts/loggingoverview.htm |
| **Google Cloud** (`me-central2` الدمّام) | Cloud Logging يقبل **حاوياتِ سجلٍّ إقليمية** في الدمّام | جدولُ المناطق: «me-central2 Dammam»؛ ومعه: «Cloud Monitoring is a global product, and its services are available with no dependence on location.» | https://cloud.google.com/logging/docs/region-support |
| | Error Reporting | «Error Reporting is a global service built on Cloud Logging …» | https://cloud.google.com/error-reporting/docs/regionalization |
| **Alibaba/SCCC** (`me-central-1` الرياض) | Simple Log Service | جدولُ المناطق يضمّ «Saudi Arabia (Riyadh) me-central-1» (آخرُ تحديث: Sep 10, 2026) | https://www.alibabacloud.com/help/en/sls/product-overview/supported-regions |

**مسبارُ نقاط OCI في الرياض** (DNS، بتحكّمٍ سالب):
`telemetry-ingestion.me-riyadh-1.oraclecloud.com` ⇒ `84.8.65.188` · `ingestion.logging.me-riyadh-1.oci.oraclecloud.com` ⇒ `84.8.67.129` ·
`apm-trace.me-riyadh-1.oci.oraclecloud.com` و`apm-config.me-riyadh-1…` و`logging.me-riyadh-1…` ⇒ `84.8.65.168` ·
والتحكّمُ `telemetry-ingestion.me-fakecity-1.oraclecloud.com` ⇒ **NXDOMAIN**.

### الحكم — answered، بحدوده

- **لدى المزوّد الذي للمالك فيه حسابٌ في الرياض (OCI)** ثلاثُ أدواتٍ متاحة في المنطقة نفسِها: Monitoring للمقاييس والإنذارات، وLogging للسجلّات المخصَّصة، وAPM للتتبّع ومعدّل الأخطاء.
  ⚠️ **ولم يُقرأ ما يجعل APM بديلاً لـGlitchTip**: وثيقتُه تصف «error rate» في التتبّع، **لا تجميعَ الاستثناءات بمجموعاتٍ وتتبّعَ المكدّس** كما يفعل Sentry/GlitchTip — فلا يُدّعى أنه يغني عن قرار `ق-١٣٣١`.
- **Google**: السجلّاتُ تُحفظ في الدمّام إن اختيرت حاويةٌ إقليمية، **لكن Monitoring وError Reporting عالميّان** — فتتبّعُ الأخطاء عندهم لا يُضمن داخل المملكة بنصّه.
- **Alibaba/SCCC**: SLS في الرياض مقروء؛ **ARMS وCloudMonitor لم يُقرآ** (صفحتا المناطق عادتا بـ٣٬٢٣٥ و٣٬٢٢١ بايتاً بلا جدول).
- ⚠️ **ولم يُقرأ لأيٍّ منهم**: مكانُ **تخزين** بيانات APM/Monitoring (النقاطُ إقليميةُ الاسم وتُحلّ — وهذا دليلُ وجود نقطة، لا دليلُ مكان تخزين)، ولا الأسعار.
- **ولا تغيير مقترَح**: `ق-١٣٣١` (GlitchTip على خادمٍ مستقلٍّ داخل المملكة) قائمٌ؛ هذا البحثُ يسدّ الفراغَ المعلَن فقط.

---

## ملحق — ما قُرئ وكيف

| الملفّ الخام (`raw/infra1/`) | ما هو |
|---|---|
| `boe-pdpl.html` | نظامُ حماية البيانات — م١٩ وم٢٩ بتعديلها |
| `sdaia-pdpl2.html` | اللائحةُ التنفيذية — م٢٣ |
| `ecc-2024-ar.pdf` · `ecc-ar-png/p010.png` · `p022.png` | الضوابطُ الأساسية العربية — النطاق و٢‑٨ (مصيَّرةً صوراً) |
| `ecc-2024-en.pdf` · `ecc-en.txt` | الإنجليزية — للمطابقة وإخلاء المسؤولية |
| `oci-bv-enc.html` · `ali-ecs-enc.html` · `sccc-infra.html` | تشفيرُ الأقراص لدى المزوّدين |
| `cstjson/cst-all-en.json` · `cst-all-ar.json` | سجلُّ مقدّمي الحوسبة السحابية (٢٩) |
| `oci-regions-doc.html` · `oci-dist-svc-avail.html` · `ed-faq.html` · `oci-ed-spf.html` | مناطقُ أوراكل وتوفّرُ الخدمات والبريد |
| `boe-tradenames.html` · `boe-cr-98ee4b51-….html` · `mc-7.html` (404) | الأسماءُ التجارية والسجلُّ التجاري |
| `sccc-contact-en.txt` · `sccc-privacy.txt` · `sccc-terms.txt` · `sccc-subscription-agreement.txt` | قنواتُ SCCC وشروطُها |
| `oci-monitoringoverview.html` · `oci-application-performance-monitoring.html` · `oci-loggingoverview.html` · `gcp-*.html` · `ali-sls-regions.html` | أدواتُ المراقبة |
| `render-text.mjs` · `capture-json.mjs` · `cap-req.mjs` · `links-and-emails.mjs` · `txt.js` | أدواتُ القراءة (Chromium بلا نقرٍ ولا إدخال) |

---

## مراجعةٌ عدائية (2026-09-27)

> **ما فُعل**: فُتح كلُّ رابطٍ أوّليٍّ استُشهد به من جديد (لا من النسخ الخامّ السابقة)، وحُفظ ما قُرئ في
> `D:\mad-app-scratch\review-266\research\infra1-adv\` (HTML ونصُّه المستخرَج · ملفّا الضوابط PDF · صورُ صفحاتٍ مصيَّرة · ردودُ JSON).
> **تاريخُ القراءة الفعليّ 2026-09-27** لا 26 (يومٌ بعد البحث). قراءةٌ عامّة فقط: لا نموذجَ أُرسل ولا دخولَ ولا تواصل.
> والطلبُ الوحيد غير `GET` هو طلبُ `POST` نفسُه الذي تُرسله صفحةُ سجلّ هيئة الاتصالات لتقليب صفحاتها (`pageSize: 6`، الصفحات ١ إلى ٥) — قراءةٌ لا إدخال.
> وملفّا الضوابط PDF المنزَّلان اليوم **مطابقان بايتاً ببايت** للنسختين في `raw/infra1/` (`cmp`).

### الأحكام بعد المراجعة

| # | الحكم الأصليّ | بعد المراجعة | بسطر |
|---|---|---|---|
| **R45** | answered | **يصمد، بتصحيح اقتباسٍ وتضييقِ نفيٍ** | وثيقةُ أوراكل مطابقةٌ حرفاً (التشفيرُ دائمٌ بـ AES‑256 ولا خيارَ لغير المشفَّر)؛ لكن اقتباسَ الضابط ٢‑٨‑٣‑٣ **ناقصٌ كلمة**، والنفيُ العامّ أوسعُ ممّا قُرئ |
| **R46** | letter | **يصمد** | المادة ٢٩ بعد تعديلها · سجلُّ الهيئة (٢٩ · Oracle ج · SCCC ج · لا AWS ولا Azure) · منطقةُ الرياض · الأسماءُ التجارية م٤ وم٩ · خلوُّ نظام السجلّ من «الرقم الوطني الموحد»: كلُّها مطابقة |
| **R66** | answered | **يصمد** | نصُّ الأسئلة الشائعة وجدولُ SPF ووثيقةُ المناطق مطابقة، والمسبارُ أعيد بحالتيه |
| **R67** | answered بحدود | **يصمد، بتصحيح ثلاثة روابط** | الاقتباساتُ كلُّها موجودة؛ ثلاثةُ روابط تُحوَّل اليوم إلى عناوين أخرى، أحدُها إلى صفحةٍ مختلفة |

**لم ينقلب حكمٌ.** وما لا يصمد **جزئيّاتٌ داخل الأحكام**، هذه هي:

### ① ما لا يصمد

**١. اقتباسُ الضابط ٢‑٨‑٣‑٣ ناقصٌ كلمةً، والنصُّ العربيُّ الملزِم أوسعُ من الإنجليزيّ.**
صُيّرت الصفحةُ ٢٢ من `ECC-2-2024-AR` (المطبوعة ٢١ — صحيح) بمقياس ٣٫٥ وقُصّ الصفّ (`infra1-adv/ecc-2833-crop.png`) وقُرئ بالعين. نصُّه:
«تشفير البيانات أثناء النقل والتخزين **والمعالجة** بناءً على تصنيفها وحسب المتطلبات التشريعية والتنظيمية ذات العلاقة.»
المصدر: https://cdn.nca.gov.sa/api/public/cms/files/e4c81aa9-a609-4823-abab-347283e29731_ECC-2-2024-AR-19092024-.pdf (قُرئ 2026-09-27).
والبحثُ نقلها «أثناء النقل والتخزين» **بلا «والمعالجة»**، وقال إن الإنجليزية «طابقت المعنى» — **وهي لا تطابق**: الإنجليزيةُ «in-transit and at-rest» وحدها، والعربيةُ (الملزِمة بنصّ إخلاء المسؤولية في الإنجليزية نفسِها: «the Arabic version will be the binding language») تضيف المعالجة.
⇐ **أثرُه على الحكم: لا شيء** (تشفيرُ القرص تشفيرٌ في التخزين، ورِكز خارج نطاق الإلزام أصلاً). **لكن أيُّ استشهادٍ لاحقٍ بهذا الضابط يُنقل من العربية بكلمتها الثالثة.**

**٢. النفيُ العامّ في سطر الحكم («ولا نصَّ نظاميّاً يوجب تشفيرَ القرص بعينه») أوسعُ ممّا قُرئ.**
ما ثبت بمسبارٍ مُصادَق:
- نصُّ **النظام** (هيئة الخبراء): «تشفير» ⇒ **صفر**؛ والتحكّمُ على الملفّ نفسِه «الإتلاف» ⇒ ٤.
- صفحةُ **اللائحة التنفيذية** (سدايا): «تشفير» ⇒ إصابتان **كلتاهما في شريط الموقع** («HTTPS للتشفير») وصفرٌ في متن اللائحة — والإصابتان نفسُهما تحكّمٌ موجب يُثبت أن المسبار يرى؛ و«التشفير» و«مشفر» ⇒ صفر.
- **الضوابط الأساسية**: نطاقُها (ص ٩ المطبوعة، مقروءةٌ بالعين) لا يشمل منشأةً خاصّةً ليست بنيةً وطنيةً حسّاسة.

وما **لم يُقرأ** لا في البحث ولا هنا: **ضوابطُ الأمن السيبراني للحوسبة السحابية `CCC-2:2024`** (يذكرها `docs/domain-scan/28` D4) · **تنظيماتُ هيئة الاتصالات لتقديم خدمات الحوسبة السحابية**.
⇐ **فالنفيُ يُقرأ: «لا نصَّ في نظام حماية البيانات ولا لائحته التنفيذية يسمّي التشفير، والضوابطُ الأساسية لا تُلزم رِكز»** — لا نفياً عامّاً.

**٣. عبارةُ «وتدخل رِكز نطاقَ الضوابط بأوّل عقدٍ حكوميّ» لم تُقرأ من نصٍّ أوّليّ.**
جملةُ النطاق المقروءة تسمّي: الجهاتِ الحكومية، والجهاتِ والشركاتِ التابعةَ لها، وجهاتِ القطاع الخاص المالكة أو المشغّلة أو المستضيفة لبنىً وطنية حسّاسة — **ولا تسمّي المورّدَ المتعاقدَ مع جهةٍ حكومية**. والعبارةُ منقولةٌ من `docs/domain-scan/28` D4، وهو يتكلّم عن `CCC-2:2024` ⇐ **«لم يُقرأ»** حتى يُقرأ نطاقُ `CCC` نفسُه.

**٤. علي بابا: «يجب اختيارُ التشفير عند إنشاء القرص» ناقصُ حالة.**
الصفحةُ نفسُها (https://www.alibabacloud.com/help/en/ecs/user-guide/encryption-overview، آخرُ تحديث Jun 20, 2026، قُرئت 2026-09-27) تسمّي حالةً ثالثة قبل «Other scenarios»:
«Create a disk in a region where account-level default encryption for Elastic Block Storage is enabled: The disk uses the specified account-level key by default.»
⇐ الصيغةُ الصحيحة: **يُشفَّر القرصُ عند إنشائه، إمّا باختياره أو بتفعيل التشفير الافتراضيّ على مستوى الحساب في المنطقة قبل الإنشاء؛ ولا يُشفَّر قرصٌ قائم إلا بنسخه.** وهل تتيح وحدةُ تحكّم SCCC هذا الخيار: **لم يُقرأ** (السؤالُ الخامس في الخطاب يغطّيه).

**٥. ثلاثةُ روابط في R67 تُحوَّل اليوم:**

| الرابط في البحث | يُحوَّل إلى (قُرئ 2026-09-27) | الأثر |
|---|---|---|
| https://cloud.google.com/error-reporting/docs/regionalization | https://docs.cloud.google.com/error-reporting/docs/troubleshooting (تحويلان) | **صفحةٌ أخرى**: الاقتباسُ فيها جزءُ جملةٍ تشترط: «Error Reporting is a global service built on Cloud Logging and can analyze log entries when all of the following are true:» ثم تعدّ منها تعطيلَ `CMEK` على حاويات السجلّ. يُستشهد بالرابط الجديد |
| https://cloud.google.com/logging/docs/region-support | https://docs.cloud.google.com/logging/docs/region-support | الاقتباسان («me-central2 Dammam» و«Cloud Monitoring is a global product») موجودان |
| https://www.alibabacloud.com/help/en/sls/product-overview/supported-regions | https://www.alibabacloud.com/help/en/sls/sls-supported-regions1 | «Saudi Arabia (Riyadh) me-central-1» و«Last Updated:Sep 10, 2026» موجودان |

**٦. تدقيقٌ في الإحالة لا في المعنى:** اقتباسُ «يجوز أن يتكون الاسم التجاري من ألفاظ … بلغة غير العربية» هو **الفقرةُ الثانية من المادة الرابعة** («المادة الرابعة: تكوين الاسم التجاري») ⇐ يُحال إليه «م٤/٢».

### ② ما صمد بقراءةٍ مستقلّة (موجز)

| الادّعاء | ما طوبق | المصدر |
|---|---|---|
| PDPL م١٩ بلا «تعديلات المادة» | النصُّ حرفاً، وبعده «المادة العشرون» مباشرةً | https://laws.boe.gov.sa/boelaws/laws/lawdetails/b7cfae89-828e-4994-b167-adaa00e37188/1 |
| PDPL م٢٩ (٢/ب) بعد تعديلها بالمرسوم (م/148) وتاريخ 1444/9/5هـ | النصُّ حرفاً، تحت «تعديلات المادة، المادة التاسعة والعشرون» | المصدر نفسُه |
| اللائحة م٢٣ «أمن المعلومات» | الفقرةُ الثانية حرفاً | https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2 |
| نطاقُ الضوابط الأساسية و«تُشجّع … وبشدة» | الصورةُ ص ٩ المطبوعة (`infra1-adv/ecc-ar-png/p010.png`)؛ والإنجليزية «The NCA strongly encourages all other entities» | ملفّا الهيئة أعلاه |
| أوراكل: تشفيرُ الأقراص الدائم | الجملتان حرفاً، ومعهما «By default all volumes and their backups are encrypted using the Oracle-provided encryption keys.» | https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/blockvolumeencryption.htm |
| علي بابا: لا تشفيرَ مباشراً لقرصٍ قائم | الجملةُ حرفاً، وتاريخُ التحديث | الرابطُ في (٤) |
| صفحةُ SCCC بلا ذكرٍ للتشفير | بالإنجليزية: `encrypt`/`Encrypt`/`AES` ⇒ صفر، والتحكّمُ `complete data sovereignty` ⇒ ١؛ وبالعربية: «تشفير»/«مشفر» ⇒ صفر، والتحكّمُ «سيادة كاملة لبياناتك» ⇒ ١. **وتُسند الصفحةُ العربيةُ ادّعاءَ «المنصّة نفسُها»**: «sccc by stc هي بوابتك إلى البنية التحتية العالمية لـ Alibaba Cloud، بسيادة سعودية كاملة.» | https://sccc.sa/en/capabilities/robust-cloud-infrastructure و https://www.sccc.sa/capabilities/robust-cloud-infrastructure |
| سجلُّ هيئة الاتصالات | ٢٩ صفّاً فريداً باللغتين؛ «Oracle — Class C» = «شركة اوراكل سيستمز ليمتد (Oracle) — الفئة ج»؛ «Saudi Cloud Computing Company — Class C» بشعار `alibaba.ashx` = «شركة الحوسبة السحابية العامة لتقنية المعلومات — الفئة ج»؛ لا Amazon ولا Microsoft | https://www.cst.gov.sa/en/knowledge-center/digital-knowledge/cloud-computing/cloud-computing-providers (`infra1-adv/cst-*.json`) |
| منطقةُ `me-riyadh-1` و«OCI offers its cloud services in all of its public cloud regions …» | الصفُّ والجملةُ (مكسورةٌ بسطرين في المصدر) | https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm |
| نظامُ السجلّ التجاريّ ونظامُ الأسماء التجارية | **كلاهما** بالمرسوم الملكي (م/83) وتاريخ 1446/3/19هـ، «ساري» (فلا تناقضَ بين نسبتيهما في البحث والخطاب)؛ م٤/٢ وم٩ حرفاً؛ م٧ (أ) «يشابه اسمًا تجاريًّا محجوزًا أو مُقيدًا» تسند «حظر المتشابه»؛ وفي نظام السجلّ: «الرقم الوطني الموحد» و«الرقم الموحد» و«رقم السجل» ⇒ صفر، والتحكّمُ «الاسم التجاري» ⇒ ١ | https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/d4801a45-7f76-4414-bdca-b20900db6fc4/1 · https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/98ee4b51-d398-4323-ae69-b2b8009f3156/1 |
| Email Delivery | «Email Delivery is available in all OCI regions and realms.» و«Note approved senders are specific to the region.» حرفاً؛ «Emerging services» لا يُدرج إلا Blockchain Platform (والشرق الأوسط «Dubai, Jeddah»)؛ وجدولُ SPF بلا صفٍّ للشرق الأوسط | https://www.oracle.com/application-development/email-delivery/faq/ · https://www.oracle.com/cloud/distributed-cloud/service-availability/ · https://docs.oracle.com/en-us/iaas/Content/Email/Tasks/configurespf.htm |
| مسبارُ DNS | أُعيد اليوم: `smtp.email.me-riyadh-1…` ⇒ `84.8.64.15` · تحكّمٌ موجب `us-ashburn-1` ⇒ `130.35.96.103` · تحكّمٌ سالب `me-fakecity-1` ⇒ Non-existent domain · نقاطُ القياس والسجلّات وAPM في الرياض تُحلّ بالعناوين نفسِها، والتحكّمُ السالب ⇒ Non-existent domain | `nslookup` |
| أدواتُ المراقبة لدى أوراكل | «The Monitoring service is available in all Oracle Cloud Infrastructure commercial regions.» · «Distributed Tracing monitors transaction performance, volume, and error rate …» (ومعها Availability وReal User وServer Monitoring) · «Custom logs can be ingested through the API, or by configuring the Unified Monitoring Agent.» | روابطُ R67 الثلاثة لأوراكل |
| إحالاتُ المستودع | `licensing-and-operations.md:30/36/38` · `decisions.md:412` (ق‑٢٢٦) و`:2004` (ق‑٧٢٩) · `بحث-مزوّد-البريد.md:89` و① («لأن حساب المالك هناك قائم») · `بحث-تتبع-الأخطاء.md:111`: **كلُّها في مواضعها** (قُرئت من `D:\worktrees\outbox-266` دون مساس) | — |

### ③ الخطاب `letters/INFRA-1-SCCC.md` — فُحص وعُدِّل

| الشرط | الحال |
|---|---|
| قناةٌ رسمية برابط مصدر | ✅ صفحةُ التواصل https://sccc.sa/en/contact: نموذج «contact sales» والبريدُ الوحيدُ فيها `careers@sccc.sa` (مطابق)؛ و`legal@sccc.sa` في https://sccc.sa/privacy تحت «Attention: GRC & Legal Department» مع عنوانٍ بريديّ (King Abdullah Financial District, Building 2914) — مطابق، وتنبيهُ الخطاب بأنه لمسائل البيانات الشخصية صحيح |
| الموضوع | ✅ |
| العربيةُ الرسمية | ✅ |
| الشرطات (`-` `–` `—` `‒` `―` ومعها `‐` `‑` `−`) | ✅ **صفر** قبل التعديل وبعده؛ والمسبارُ مُصادَق: على ملفّ البحث نفسِه ⇒ ٤٣٠، وعلى نصٍّ اصطناعيٍّ بشرطتين ⇒ ٢ |

**تعديلاتٌ أُدخلت لأنها تخمينٌ لا نقل** (القاعدة: «لا تخمين»):
1. **«مؤسسة فردية يملكها شخص واحد» و«منشأة فردية»**: المصدرُ (`ق-٢٢٦`) يقول «مالكٌ فردٌ بلا شركاء» ولا يسمّي الشكلَ النظاميّ ⇐ صار «منشأة يملكها شخص واحد، شكلها النظامي [الشكل النظامي كما في شهادة السجل التجاري]»، والموضوعُ «حساب منشأة».
2. **«رقماً موحداً يبدأ بالأرقام سبعمئة»**: تأويلٌ لعبارة المصدر «يطلب رقماً موحّداً ٧٠٠» ⇐ صار «رقماً موحداً 700» بين علامتي تنصيص كما وردت.
3. **أُضيف تنبيهٌ خارج نصّ الخطاب** بأن الاسمَ العربيَّ المسجَّل في سجلّ الهيئة «شركة الحوسبة السحابية العامة لتقنية المعلومات» — ورابطُ السجلّ تُرك هنا لا في الخطاب لأنه يحمل شرطات.
