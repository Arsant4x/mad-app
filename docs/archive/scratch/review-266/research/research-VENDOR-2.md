# بحث المجموعة VENDOR-2 — البنود R214 · R215 · R216 · R217

**تاريخ القراءة:** 2026-09-27 (ساعة الجهاز: `Sun Sep 27 02:13 UTC 2026`). الموجز افترض 2026-09-26؛ والمكتوب هنا هو التاريخ الفعليّ المقيس لا المفترض.
**القيود:** لا تواصل ولا إرسال ولا دخول ولا نماذج. قراءة صفحاتٍ عامة فقط. المستودع `D:\worktrees\outbox-266` قُرئ ولم يُمسّ.
**الأدوات:** `WebFetch` · `curl` بترويسة متصفّح · لوحة المتصفّح للصفحات التي لا تُرسم إلا بـJavaScript (Xero · الراجحي) · واجهة Apple العامة للبحث (`itunes.apple.com/lookup`). ⚠️ **ميزانية `WebSearch` كانت نافدة** في هذه الجلسة (200 من 200)، فكلّ مصدرٍ وُصل إليه بعنوانه المباشر أو بخريطة موقع الجهة نفسها (`sitemap.xml`) لا بمحرّك بحث.
**النصوص الخام** المستعمَلة في المطابقة: `D:\mad-app-scratch\review-266\research\vendor2-raw\` (HTML وتحويلُه نصّاً، وJSON واجهة Apple).

| البند | الحكم | الخلاصة في سطر |
|---|---|---|
| R214 | **letter** (جزئياً مجاب) | SNB والإنماء ينشران إتاحة **MT940** (وSNB معه MT942)؛ الراجحي لا يسمّي صيغةً ويُعلن رسوم ربط؛ **لا ذكر لـcamt.053** عند أيّ بنكٍ قُرئ؛ ومواصفات الحقول غير منشورة؛ وإطار المصرفية المفتوحة مغلق خلف بريد `ob@sama.gov.sa` ⟵ خطاب |
| R215 | **answered** | سياسة واتساب للأعمال (تحديث 2026-09-23): موافقةٌ مسبقة · قوالب خارج نافذة ٢٤ ساعة · احترام الانسحاب · مسار تصعيدٍ بشريّ للأتمتة · حظر مزوّدي الذكاء الاصطناعي حين يكون وظيفةً أساسية (البند 4.7) · المنصّة تعمل «موفّر حلول/Tech Provider» بتحقّقٍ ومراجعة |
| R216 | **answered** | الأربعة قُرئت اليوم: ERPNext (انتقل إلى `docs.frappe.io`) · Zoho Books (صفحة `/features` ما زالت `403`، وقُرئ البديل) · Xero (بالرسم في المتصفّح) · قيود (`/features` غير موجودة أصلاً، والصفحة `/accounting-software/`) |
| R217 | **answered** | السابقتان **قائمتان وأكبر مما قيل** (ORDER LLC ≥ 200 تطبيق على App Store السعودي؛ Maxsys ≥ 20 على Google Play)؛ **لكن القاعدة الحاكمة عند Apple هي 4.2.6 لا 4.3، ونصّها يمنع ما يفعلانه** — فالسابقة تسامحٌ عمليّ لا إذن |

---

## R214 — مواصفات كشوف البنوك السعودية (MT940/CAMT.053) مع تغذية البنوك

**المصدر في المستودع:** `docs/domain-scan/20-نقل-البيانات-استيراد-وتصدير-وهجرة.md:41`. غير حاجبٍ للإطلاق.

### ما قُرئ من المصدر الأصليّ (مواقع البنوك نفسها)

| البنك | الصفحة | النصّ (حرفياً) | ما يعنيه |
|---|---|---|---|
| **البنك الأهلي السعودي SNB** — eCorp | https://www.alahli.com/en/pages/corporate-banking/ways-of-banking/ecorp | «Account Statements (MT940/MT942 included)» | كشوف **MT940** و**MT942** ضمن خدمات المنصة الإلكترونية للشركات eCorp — أي قناةٌ يصل إليها التاجر بنفسه، لا ربطٌ مباشر فقط |
| SNB — SwiftNet | https://www.alahli.com/en/pages/corporate-banking/ways-of-banking/swiftnet-solution | «Connect to perform daily payment transactions directly through your ERP system, adhering to SWIFT international messages» | ربطُ نظام ERP برسائل SWIFT (لا تُسمّى رسالةُ الكشف في الصفحة) |
| **مصرف الإنماء** — B2B Direct | https://alinma.com/en/Corporate/Cash-Management/B2B-Direct | «Account statements in MT940 format.» | **MT940**؛ وشرطه: «Complete the B2B Direct Connection Service Agreement via the link» ⟵ المواصفة تأتي مع الاتفاقية |
| **مصرف الراجحي** — Business 2 Business | https://www.alrajhibank.com.sa/en/Business/Cash-Management/Business-2-Business (قُرئت بالرسم في المتصفّح؛ `curl` يعيد بوّابة «Please enable JavaScript») | «Company Account Statements.» | **لا صيغة مسمّاة**. والجدول نفسه: «One-time Subscription Fee for Integration 50,000» و«Annual Fees 10,000» — **بلا عملةٍ مكتوبة في الجدول** |

**المسبار على «camt»** (`camt` · `CAMT` · `ISO 20022`) في نصوص صفحات SNB eCorp وSNB SwiftNet والإنماء B2B: **صفر** في الثلاث؛ ونصّ صفحة الراجحي كاملاً (مقروءاً من المتصفّح) بلا صيغةٍ أصلاً. **والمصادقة:** المسبار نفسه يجد `MT940` = `1` في صفحة SNB eCorp و`1` في صفحة الإنماء. فالصفر على camt **نفيٌ مُصادَق على هذه الصفحات وحدها** — لا على البنوك.

**ما لم يُقرأ (بسببه):** بنك الرياض (خريطة موقعه فهرسٌ لخرائط فرعية بمعرّفات Liferay بلا مسارات مقروءة، ولم يُعثر على صفحة ربطٍ مباشر) · ساب (`Request Rejected` من جدار الحماية) · العربي الوطني (خريطة الموقع تعيد مستند Word لا خريطة) · السعودي الفرنسي (`Permission Denied`) · الجزيرة (`404`) · السعودي للاستثمار (`404`) · البلاد (خريطةٌ من 2022 تشير إلى منفذ 80) · الخليج الدولي (`404`). **لم يُقرأ** شيءٌ عن صيغ كشوفها.

**المواصفة التفصيلية للحقول:** لم تُنشر عند أيّ بنكٍ قُرئ؛ والإنماء يربطها صراحةً باتفاقية خدمة الربط المباشر. فهي **تُسلَّم لصاحب الحساب (التاجر) عند التعاقد**، لا لمنصّتنا ولا للعموم.

### المسار المنظَّم: المصرفية المفتوحة (ساما)

- **البوابة الرسمية** https://openbanking.sama.gov.sa/ : «يشتمل إطار المصرفية المفتوحة على مجموعة من حالات الإستخدام وقواعد الأعمال والمعايير الفنية وفق أفضل الممارسات العالمية»، والوصول إليه: «للاطلاع على إطار المصرفية المفتوحة والدخول إلى معمل المصرفية المفتوحة، يرجى التواصل مع فريق المصرفية المفتوحة على البريد الإلكتروني» — **والبريد صورةٌ** (`email.jpg`، قُرئت): `ob@sama.gov.sa`.
- **الإطار نفسه مغلق:** `ksaob.atlassian.net/wiki/spaces/OBF/overview` يعرض «Log in»؛ واجهة Confluence لمجهولٍ تعيد **صفر مساحات** (`/wiki/rest/api/space` ⟵ `"size":0`) و`space/OBF` ⟵ «No space found». **المصادقة:** الواجهة نفسها تعمل (ترد JSON صحيحاً)، والصفحة تعرض عنوان «KSA Open Banking» — فالغياب حجبٌ لا عطل.
- وثيقة `https://www.sama.gov.sa/en-US/Documents/Open_Banking_Policy-EN.pdf` (6 صفحات بعدّ `/Count 6`) **سياسةٌ تمهيدية قديمة**: «SAMA plans to go live with Open Banking during the first half of 2022.» — ليست الإطار ولا المعايير.
- ⚠️ **ما يقوله المستودع ولم أتحقّق منه:** `docs/plans/gov-integrations-master-plan.md:153` ينصّ على أن ساما «في 26 مارس 2026 نقل … الخدمات المصرفية المفتوحة إلى نشاط خاضع للترخيص». **لم يُقرأ**: صفحة أخبار ساما (`/en-US/MediaCenter/News/Pages/AllNews.aspx`) تُملأ بـJavaScript، وواجهة SharePoint تعيد صفحة حجب (ضابط: الصفحة الرئيسية لساما `200`). وخطابا المجموعتين SAMA 2 وSAMA 3 يقرآن المادة ٦(١٠) من اللائحة التنفيذية لنظام المدفوعات («خدمات معلومات حساب المدفوعات» خدمةٌ مرخّصة) ويسألان عن انطباقها — فلم أكرّر السؤال.

### الحكم: **letter** — والخطاب `letters\VENDOR-2-SAMA.md`

الخطاب يسأل عمّا لا يُجاب إلا كتابةً ولم يسأله خطابا SAMA 2/3: ① هل تُلزم ساما البنوك بصيغةٍ موحّدة لكشوف المنشآت (MT940/camt.053) أم الصيغة اتفاقية ثنائية · ② هل يشمل التحوّل إلى ISO 20022 رسائل البنك مع عميله · ③ هل تشمل خدمات معلومات الحساب حسابات المنشآت · ④ حقول الحركة ومدّتها في المعايير الفنية.

**ما يمكن البناء عليه اليوم بلا خطاب (استنتاجٌ من المقروء لا قرار):** استيراد ملفٍّ يرفعه التاجر بصيغة **MT940** أولاً (منشورٌ عند SNB في قناته الإلكترونية وعند الإنماء)، ثم CSV/Excel؛ **ولا دليل سعودياً مقروءاً على camt.053**. والربط المباشر مكلف لكل منشأة عند الراجحي (الرقمان أعلاه بلا عملة) ويُتعاقد عليه باسم التاجر.

---

## R215 — سياسة واتساب للأعمال

**المصدر في المستودع:** `docs/domain-scan/17-الإشعارات-والرسائل.md:43`. غير حاجب.

### النصوص الأصلية

**① WhatsApp Business Messaging Policy** — https://whatsappbusiness.com/policy/ (تحويل `301` من `business.whatsapp.com/policy`) — «Last updated: September 23, 2026». قُرئ النصّ الخام (`curl` ثم تحويل) لا ملخّصاً.

| الموضوع | النصّ (جملة واحدة حرفياً) |
|---|---|
| الموافقة المسبقة | «You may only contact people on WhatsApp if: (a) they have given you their mobile phone number or username; and (b) you have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from you.» |
| من يثبت الموافقة | «You are solely responsible for determining the method of opt-in, that you have obtained opt-in in a manner that complies with laws applicable to your communications, and that…» (الجملة تكمل) |
| بدء المحادثة | «You may only initiate conversations using an approved Message Template (as defined in our documentation).» |
| نافذة ٢٤ ساعة | «Outside the 24-hour customer service window, you may only send messages via approved Message Templates.» |
| الأتمتة | «You may use automation when responding during the 24-hour window, but must also have available prompt, clear, and direct escalation paths.» (والمسارات المعدودة: تحويلٌ لموظف في المحادثة · هاتف · بريد · دعمٌ على موقع المنشأة · زيارة فرع · نموذج دعم) |
| الانسحاب | «You must respect all requests (either on or off WhatsApp) by a person to block, discontinue, or otherwise opt out of communications from you via WhatsApp, including removing that person from your contacts list.» |
| التجارة | «If you use Catalogs, or provide any other commerce experiences to sell goods or services, you must comply with the policies and prohibitions listed in the Meta Commerce Policy as well as all applicable terms, laws and regulations.» |
| القطاعات المنظَّمة | «You are prohibited from messaging about any Regulated Verticals on the WhatsApp Business App.» — ومنها الأدوية بلا وصفة: «WhatsApp Business messaging that promotes over-the-counter drugs must comply with all applicable local laws…» (يمسّ الصيدليات) |
| الجهات الحكومية | «We permit the use of the WhatsApp Business Platform for government entities and require access through a Solution Provider (formerly known as Business Service Provider).» |

**لم يُقرأ:** قائمة الدول المسموح فيها بكل قطاعٍ منظَّم — قوائم منسدلة لا تظهر في النصّ الثابت (المسبار `Saudi` = `0`، والضابط «over-the-counter drugs» = `1` في النصّ نفسه). ولم تُقرأ Meta Commerce Policy نفسها.

**② Meta Terms for WhatsApp Business Platform** — https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform (تحويل `301` من `whatsapp.com/legal/business-solution-terms`). عُرضت بالعربية: «تاريخ آخر تحديث: 23 سبتمبر 2026». ⚠️ `curl` يعيد هيكل JavaScript فارغاً (10 أحرف)، فالقراءة عبر `WebFetch` المُرسِم وحده، ولم تُطابَق بالنسخة الإنجليزية.

- **البند 4.7 (موفرو خدمات الذكاء الاصطناعي):** «يُحظر بشكل صارم على موفري ومطوّري تقنيات الذكاء الاصطناعي أو تعلّم الآلة، بما في ذلك على سبيل المثال لا الحصر نماذج اللغة الكبيرة، أو منصات الذكاء الاصطناعي التوليدي، أو مساعدي الذكاء الاصطناعي للأغراض العامة … الوصول إلى منصة واتساب للأعمال أو استخدامها … عندما تكون هذه التقنيات هي الوظيفة الأساسية (وليس العرضية أو المساعدة) المتوفرة للاستخدام».
- **البند 1.1 (موفّر الحلول):** «… أو من خلال جهة خارجية مصرح لها باستخدام واجهات API هذه نيابةً عن هذا النشاط التجاري ("موفر الحلول")».

**③ وثيقة المطوّرين — Tech Provider** — https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers : «As a Tech Provider, you can independently provide all WhatsApp messaging services to clients who you have onboarded, or you can work with a Solution Partner to jointly offer these services.» والشروط المذكورة: التحقّق من المنشأة لدى Meta · مراجعة التطبيق (App Review) بعرضٍ مصوَّر · صلاحية «Advanced access» على `whatsapp_business_messaging` و`whatsapp_business_management`. **لم يُقرأ نصٌّ صريح** بمن يملك حساب واتساب للأعمال ورقمه عند التسجيل المضمَّن.

**④ التسعير** — https://developers.facebook.com/docs/whatsapp/pricing : «Effective July 1, 2025, Meta charges on a per-message basis.» و«Utility templates delivered within an open customer service window are free.» — **وسعر المملكة في ملف أسعارٍ منفصل لم يُقرأ**.

**سابقة منافس (موقعه):** قيود يرسل تذكيرات الفواتير عبر تطبيق طرفٍ ثالث «WhatsApp Notifications» من خلال Zapier، لا بحسابٍ له على المنصّة: https://www.qoyod.com/marketplace/notifications/whatsapp-notifications/ — «ربط WhatsApp Notifications بقيود عبر Zapier».

### الحكم: **answered**

ما يوجبه على البناء (قراءةٌ للنصّ لا قرار): سجلُّ موافقةٍ لكل رقمٍ لدى كل تاجر بمصدرها وتاريخها · إدارةُ قوالب معتمدة وما خارج نافذة ٢٤ ساعة لا يُرسل إلا بها · الانسحابُ يُحترم من أيّ قناة ويُزال الرقم · أيّ ردٍّ آليّ يقترن بمسار تصعيدٍ بشريّ ظاهر · **المساعد الذكيّ (`ق-٩٩٤`) لا يُقدَّم عبر واتساب وظيفةً أساسية** (البند 4.7) · ومنصّتنا تعمل «موفّر حلول» بصفة Tech Provider: تحقّقُ منشأةٍ ومراجعة تطبيق قبل أول تاجر · والصيدليات مقيَّدة في القطاعات المنظَّمة. **وخارج هذا البند وما زال غير مقروء:** لوائح هيئة الاتصالات والفضاء والتقنية على الرسائل النصية (المذكورة في السطر نفسه من المسح).

---

## R216 — مراجع منصّاتٍ متعذّرة (ERPNext · Zoho Books · Xero · Qoyod)

**المصادر في المستودع:** `docs/decisions.md:2862` (ERPNext في مراجع المخزون) · `docs/decisions.md:3364` و`docs/domain-scan/00-النواة-المطابقة.md:127` («تعذّر: Zoho Books (`403`) · Xero rate-limits (JS) · … · Qoyod /features (`404`)»).

| المنصّة | سبب التعذّر السابق مقيساً اليوم | ما قُرئ الآن (حرفياً) |
|---|---|---|
| **ERPNext** | `docs.erpnext.com/docs/user/manual/en/batch` يحوِّل اليوم إلى `https://docs.frappe.io/erpnext/batch` (`200`)؛ ومسار `v15` ⟵ `404` | صفحة Batch: «If you set expiry date, the Batch will show 'Not Expired' until the expiry date, after which it'll show 'Expired'.» — وصفحة Stock Settings (https://docs.frappe.io/erpnext/stock-settings): «Allow Negative Stock has removed for Serial / Batch Items from version 15.» **ولا نصّ على منع بيع الدفعة المنتهية** في الصفحتين (المسبار `expired`/`Expired` في Stock Settings = `0`؛ الضابط «Allow Negative Stock» = `4`؛ وفي صفحة Batch الكلمة `Expired` لا ترد إلا في جملة العرض المقتبسة) |
| **Zoho Books** | `https://www.zoho.com/books/features/` ما زالت **`403`** اليوم بترويسة متصفّح (ضابط: `https://www.zoho.com/sa/books/` بالترويسة نفسها `200`) | صفحة المملكة: الوحدات «Receivables · Payables · Inventory · Projects · Reports» و«ZATCA approved Phase 2 e-invoicing». ووثيقة API (https://www.zoho.com/books/api/v3/introduction/): «You can make 100 requests per minute per organization.» · حدٌّ يوميٌّ بالباقة (Free 1000 … Premium/Elite/Ultimate 10000) · «Free Plan - 5 concurrent calls Paid Plans - 10 concurrent calls (soft limit)» · وبين مراكز البيانات: «Saudi Arabia .sa https://www.zohoapis.sa/books/» |
| **Xero** | الصفحة تُرسم بـJavaScript (`curl` يعيد «This app works with JavaScript enabled»)؛ قُرئت بالرسم في لوحة المتصفّح | https://developer.xero.com/documentation/guides/oauth2/limits/ : «Concurrent Limit: 5 calls in progress at one time» · «Minute Limit: 60 calls per minute» · «Daily Limit: 1,000 calls per day for starter, 5,000 calls per day for higher tiers» · «App Minute Limit: 10,000 calls per minute» · وتجاوزها «HTTP 429 (too many requests)» مع `Retry-After`. وحدود النظام: 5,000 فاتورة مبيعات و5,000 مشتريات شهرياً تصميماً · 5,000 حركة بنكية شهرياً · 4,000 صنف متتبَّع · «Contact lists of greater than 10,000 could cause performance issues.» · 500 أصل ثابت |
| **Qoyod (قيود)** | `/features` و`/en/features/` **`404` لأن المسار غير موجود أصلاً** (لا حجب)؛ والموقع يعيد `403` لترويسة `Mozilla/5.0` المجرّدة و`200` لترويسة متصفّح كاملة — وهو الأرجح سبب «التعذّر» الأول | صفحة المنتج https://www.qoyod.com/accounting-software/ (`200`): «برنامج محاسبة سحابي شامل» · «متوافق مع المرحلة الثانية لـZATCA» · «متعدد المستخدمين والصلاحيات» · «نسخ احتياطي وتشفير»؛ وخدمات الإعداد والتنظيف تحت `/pro-services/` |

### الحكم: **answered** — والمسار الصحيح لكلٍّ مسجَّلٌ أعلاه كي لا يتعذّر ثانيةً.

---

## R217 — سوابق تطبيقات المتاجر وسياسة Apple 4.3

**المصدر في المستودع:** `docs/سجل-الخارطة-والقرارات.md:200` («مصدرهما المالك، ولم تُتحقَّق»).

### ① نصّ Apple (الأصل) — https://developer.apple.com/app-store/review/guidelines/ (لا تاريخ تحديثٍ ظاهر في الصفحة)

- **4.2.6 — وهو البند الحاكم على القوالب، لا 4.3:** «These services should not submit apps on behalf of their clients and should offer tools that let their clients create customized, innovative apps that provide unique customer experiences.» — وقبلها: «Apps created from a commercialized template or app generation service will be rejected unless they are submitted directly by the provider of the app's content.» — والبديل المقبول نصّاً: «Another acceptable option for template providers is to create a single binary to host all client content in an aggregated or "picker" model…»
- **4.3(a):** «Don't create multiple Bundle IDs of the same app…»
- **5.1.1(ix)** (يمسّ الصيدليات والعيادات): «Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer.»
- **5.2.1:** «Apps should be submitted by the person or legal entity that owns or has licensed the intellectual property and other relevant rights.»

### ② Google Play (الأصل) — سياسة Spam: https://support.google.com/googleplay/android-developer/answer/9899034

- «Creating multiple apps with highly similar functionality, content, and user experience.» مثالاً على المخالفة، ويتبعها: «If these apps are each small in content volume, developers should consider creating a single app that aggregates all the content.»
- **ولا بند للقوالب ولا لخدمات توليد التطبيقات:** المسبار على النصّ المرئيّ بعد نزع السكربت (`template` · `wizard` · `automated tool`) = **صفر**؛ **والضابط** على الصفحة نفسها: «Repetitive Content» = `1` و«Creating multiple apps with highly similar» = `1`. والعناوين الثلاثة للصفحة: Message Spam · Webviews and Affiliate Spam · Repetitive Content.

### ③ السابقتان — مقيستان اليوم

**ORDER LLC (App Store السعودي)** — من واجهة Apple العامة: `https://itunes.apple.com/lookup?id=1664454406&entity=software&limit=500&country=sa`
- المطوّر «ORDER LLC» — https://apps.apple.com/sa/developer/order-llc/id1664454406 · والبائع في كل تطبيق: «ORDER SYSTEMS FOR COMMUNICATIONS AND INFORMATION TECHNOLOGY CO.»
- **200 تطبيق** أُعيدت، **وهو سقف الواجهة** فالعدد **≥ 200** (بحث `term=ORDER LLC` أعاد 198، كلها للمعرّف نفسه). التصنيف: Food & Drink `196` · Utilities `4`. بادئة المعرّف `com.tryorder.*` في `182` منها.
- الإصدار الأول بالسنة (ضمن المُعاد): 2016: 2 · 2020: 5 · 2021: 13 · 2022: 18 · 2023: 40 · 2024: 70 · 2025: 52. أحدث إصدارٍ أوّل ضمن المُعاد: 2025-12-17، **وآخر تحديث: 2026-09-26**.
- **تصحيحٌ لما قيل:** «١٤+» أقلّ بكثير من الواقع — صفحة المطوّر على الويب تعرض 11 فقط (تحميلٌ متدرّج)، وهو الأرجح مصدر الرقم. و«آخرها مارس ٢٠٢٦» **لم يُتحقَّق**: لا يظهر إصدارٌ أوّل في 2026 ضمن الـ200 المُعادة، والواجهة مقصوصة عند 200.

**Maxsys (Google Play)** — https://play.google.com/store/apps/developer?id=Maxsys
- **20 معرّف حزمة مختلفاً** في صفحة المطوّر: `com.foodtech.*` = 15 · `com.ordertech.*` = 4 · `co.techstation.*` = 1. **«٢٧+» لم يتأكّد** (قد تكون الصفحة مقصوصة؛ لم يُقرأ ما وراءها). وقول «بمعرّفات `com.ordertech.<اسم>`» **جزئيّ**: الأغلب `com.foodtech`.
- عيّنة: `com.ordertech.saf` — «Updated on Jul 21, 2026» · «1K+ Downloads» · وخانة «What's new»: «OrderTech».
- **ملاحظةٌ لا استنتاج:** أسماء مطاعم بعينها تتكرّر على المتجرين (Teller/تيلر · كافتيريا طابور/TABUR · La piuma) تحت ORDER على iOS وMaxsys على Android.

### الحكم: **answered**

- **الشطر الأول من دعوى المالك صحيحٌ وأكبر:** النموذج قائمٌ فعلاً على المتجرين، تحت حساب مزوّدٍ واحد لكلٍّ منهما، وتطبيقاته محدَّثة في سبتمبر 2026.
- **والشطر الثاني يحتاج تصحيحاً:** التحفّظ الذي يمسّ النموذج عند Apple هو **4.2.6** لا 4.3، **ونصّه ينهى صراحةً** عن رفع مزوّد القالب تطبيقاتٍ نيابةً عن عملائه، ويقبل طريقين فقط: أن يرفعها **صاحب المحتوى** (التاجر بحسابه)، أو **تطبيقٌ واحد جامع** («picker»). فالسابقة **دليلُ تسامحٍ عمليّ قابلٍ للسحب لا إذن**. وفي الأنشطة الصحية يضيف 5.1.1(ix) أن يرفعها **الكيان الذي يقدّم الخدمة**.
- **ويمسّ قراراً مسجَّلاً:** «حساب مطوّر واحد باسم المنشأة — لا حساب لكل تاجر» (`سجل-الخارطة-والقرارات.md`) يخالف نصّ 4.2.6 ويطابق السابقة. **والخيار للمالك** بين: (أ) حسابنا الواحد على مخاطرة الرفض، (ب) حساب مطوّرٍ لكل تاجر ونحن أعضاءُ فريقه، (ج) تطبيقٌ جامع واحد. وGoogle Play لا نصّ فيه على القوالب، وقيدُه «المحتوى المكرّر» وحده.

---

## ما لم يُقرأ في المجموعة كلّها (معلَن)

1. صيغ كشوف 8 بنوك (الرياض · ساب · العربي · الفرنسي · الجزيرة · الاستثمار · البلاد · الخليج الدولي) — حجبٌ أو غيابُ صفحة.
2. إطار المصرفية المفتوحة ومعاييره — مغلق، والوصول بالبريد ⟵ خطاب.
3. خبر ساما عن ترخيص المصرفية المفتوحة (26 مارس 2026) — صفحة الأخبار محجوبة/JavaScript.
4. قائمة دول القطاعات المنظَّمة في سياسة واتساب · Meta Commerce Policy · ملف أسعار واتساب للمملكة.
5. تاريخ تحديث إرشادات Apple (لا يظهر في الصفحة).
6. ما وراء أول 20 تطبيقاً لـMaxsys وما وراء أول 200 لـORDER.

---

## مراجعةٌ عدائية

**المراجِع:** فاحصٌ عدائيّ مستقلّ. **تاريخ القراءة:** 2026-09-27 (ساعة الجهاز `Sun Sep 27 10:04 UTC 2026`؛ الموجز افترض 2026-09-26). **الطريقة:** كلّ عنوانٍ أصليّ مذكور أعلاه جُلب من جديد (`curl` بترويسة متصفّح، ولوحة المتصفّح لـXero، و`WebFetch` لشروط Meta وحدها)، وطوبق كلُّ اقتباسٍ حرفياً بعد تطبيعٍ لا يمسّ إلا المسافات والكيانات وعلامات التنصيص المعقوفة، مع مسبارٍ ضابطٍ لا يجب أن يوجد (`zzqqxxnotpresentzz` = صفر في كلّ صفحة). **الخام:** `D:\mad-app-scratch\review-266\research\vendor2-adv\` (`check.mjs` · `quotes.json` · `chk2.mjs` · `q2.json` · `devpage.mjs` · `devpage2.mjs` وملفات `*.html` و`*.norm.txt`). لا إرسال ولا دخول ولا نماذج.

### الخلاصة

| البند | الحكم الأصليّ | بعد المراجعة | ما لا يصمد |
|---|---|---|---|
| R214 | letter | **يصمد** (letter) | عملة رسوم الراجحي مكتوبة؛ و«صراحةً» عن الإنماء أوسع من النصّ؛ وجملةٌ في تنبيهات الخطاب تنسب للإنماء ما لم يقله |
| R215 | answered | **يصمد مع ثلاثة تصحيحات** | «لم يُقرأ» عن قائمة الدول خطأ (القائمة مقروءة والمملكة غائبة عنها) · البند 4.7 نُقل بلا استثنائه · اقتباس التسعير ليس حرفياً ويسقط مضمونه في 2026-10-01 |
| R216 | answered | **يصمد كاملاً** | لا شيء |
| R217 | answered | **يصمد مع تصحيحين** | صفحة Apple تحمل تاريخ تحديث · وعدّ ORDER أكبر، وفيه إصداراتٌ أولى في 2026 |

### ما صمد (مُطابَقٌ حرفياً اليوم)

1. **WhatsApp Business Messaging Policy** (https://whatsappbusiness.com/policy/ ، وتحويل `301` من `business.whatsapp.com/policy` مقيس): «Last updated: September 23, 2026» موجود، **والاقتباسات الأحد عشر كلّها موجودة حرفياً**؛ اثنان منها (بدء المحادثة بقالب · حظر القطاعات المنظَّمة على Business App) لم يطابقا إلا بعد إزالة مسافةٍ يولّدها نزع وسم الرابط قبل «)» وقبل «.»، فالنصّ نفسه صحيح.
2. **Apple** (https://developer.apple.com/app-store/review/guidelines/): الاقتباسات الستّ حرفية، **والأرقام صحيحة بموضعها**: الجملتان الأوليان والبديل «picker» تحت `4.2.6`؛ «Don't create multiple Bundle IDs» تحت `4.3 Spam (a)`؛ «(ix) Apps that provide services in highly regulated fields» داخل `5.1.1` ولا `5.1.2` قبلها؛ جملة صاحب الملكية الفكرية داخل `5.2.1`.
3. **Google Play Spam** (https://support.google.com/googleplay/android-developer/answer/9899034): الجملتان حرفيتان؛ والنفي مُصادَق: `template` = 0 · `wizard` = 0 · `automated tool` = 0 مقابل الضابط «Repetitive Content» = 1.
4. **ERPNext**: `docs.erpnext.com/docs/user/manual/en/batch` يحوّل إلى `https://docs.frappe.io/erpnext/batch` (`200`) مقيساً؛ والجملتان حرفيتان؛ والنفي مُصادَق (`expired`/`Expired` في Stock Settings = 0 مقابل «Allow Negative Stock» = 4).
5. **Zoho Books**: `/books/features/` = `403` اليوم؛ و`/sa/books/` = `200` وفيها «ZATCA approved Phase 2 e-invoicing»؛ ووثيقة API فيها «You can make 100 requests per minute per organization.» وحدود الباقات والحدّ المتزامن و`https://www.zohoapis.sa/books/` حرفياً.
6. **Xero** (لوحة المتصفّح، https://developer.xero.com/documentation/guides/oauth2/limits/): الحدود الأربعة و`429` و`Retry-After` و5,000 فاتورة/فاتورة مشتريات و5,000 حركة بنكية و4,000 صنف و«Contact lists of greater than 10,000 could cause performance issues.» و500 أصل، كلّها موجودة.
7. **قيود**: `/features` = `404` و`/en/features/` = `404`؛ و`/accounting-software/` = `403` لترويسة `Mozilla/5.0` المجرّدة؛ والعبارات الأربع موجودة؛ وصفحة Zapier فيها «ربط WhatsApp Notifications بقيود عبر Zapier».
8. **Tech Provider** (يحوّل اليوم إلى `https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers`): الجملة حرفية، و«Advanced access» على `whatsapp_business_messaging` و`whatsapp_business_management` موجودان.
9. **Maxsys**: 20 معرّف حزمة بالضبط (`com.foodtech` 15 · `com.ordertech` 4 · `co.techstation` 1)؛ و`com.ordertech.saf`: «Updated on Jul 21, 2026» و«1K+ Downloads».
10. **R214**: «Account Statements (MT940/MT942 included)» (SNB eCorp) و«Account statements in MT940 format.» (الإنماء) و«Connect to perform daily payment transactions directly through your ERP system, adhering to SWIFT international messages» (SNB SwiftNet) حرفية؛ والنفي على camt مُصادَق (0 مقابل `MT940` = 1)؛ والعبارتان العربيتان في https://openbanking.sama.gov.sa/ حرفيتان؛ والصورة `email.jpg` جُلبت من جديد وقُرئت: `ob@sama.gov.sa`؛ ووثيقة سياسة المصرفية المفتوحة `/Count 6` وفيها «SAMA plans to go live with Open Banking during the first half of 2022.»؛ وواجهة Confluence لمجهول: `space` ⟵ `"size":0`.

### ما لا يصمد، أو يصمد ناقصاً

**① R214: عملة رسوم الراجحي مكتوبة في الجدول (تصحيح واقعة).**
المكتوب أعلاه: «بلا عملةٍ مكتوبة في الجدول». **والمقروء اليوم من بيانات الصفحة نفسها** (https://www.alrajhibank.com.sa/en/Business/Cash-Management/Business-2-Business ، `curl` بترويسة متصفّح كاملة أعاد `200` بلا بوّابة JavaScript): خلية «One-time Subscription Fee for Integration» قيمتها `"SAR 50,000"`، وخلية «Annual Fees» قيمتها `"SAR 10,000"`. فالرقمان **بالريال** نصّاً. (لوحة المتصفّح رفضت الملاحة إلى الموقع في هذه المراجعة، فالتحقّق من بيانات الصفحة الخام لا من رسمها.)

**② R214: «والإنماء يربطها صراحةً باتفاقية خدمة الربط المباشر» أوسع من النصّ.**
صفحة الإنماء تقول تحت «Requirements to Access the Service»: «Complete the B2B Direct Connection Service Agreement via the link.» **ولا شيء عن المواصفة**: المسبار `specification` · `technical` · `document` = 0 في النصّ كلّه، والضابط «MT940» = 1. فربط **الخدمة** بالاتفاقية منصوص، وربط **المواصفة** بها استنتاجٌ لا نصّ. **ويمسّ الخطاب**: في «تنبيهات قبل الإرسال» في `letters\VENDOR-2-SAMA.md` جملة «وإنما يسلّمها البنك نفسه لعميله عند توقيع اتفاقية الربط المباشر، كما تنص صفحة مصرف الإنماء» — والصفحة لا تنصّ على ذلك. الجملة خارج نصّ الخطاب المرسَل، فلا تُبطله، لكن «كما تنص» يُصحَّح إلى «والأرجح، لأن صفحة مصرف الإنماء تشترط الاتفاقية للخدمة».

**③ R215: «لم يُقرأ: قائمة الدول … قوائم منسدلة لا تظهر في النصّ الثابت» خطأ، والقائمة تغيّر الحكم على الصيدليات.**
القوائم الثلاث (Online Gambling and Gaming · Over-the-Counter Drugs · Alcohol) **موجودة في HTML الصفحة الثابت** تحت «5. Further Guidance on Regulated Verticals»، وتعدّ الدول بأسمائها. **والمملكة غائبة عن الثلاث**: المسبار `Saudi` = 0 و`Arabia` = 0 في النصّ كلّه، **والضابط** على قائمة الأدوية بلا وصفة نفسها: `Brazil` = 1 · `India` = 1 · `Mexico` = 1؛ ولا دولة خليجية ولا عربية فيها (`Emirates` · `Egypt` · `Jordan` · `Kuwait` · `Qatar` · `Bahrain` · `Oman` = 0). والنصّ الحاكم في القسم 4: «We prohibit use of WhatsApp for Business for buying, selling, promoting, or otherwise facilitating the exchange of certain regulated or restricted goods and services listed below, as determined in our sole discretion.» والقائمة تحته تشمل «Drugs, whether prescription, recreational, or otherwise» و«Medical and healthcare products». **فالحكم الصحيح أشدّ من «الصيدليات مقيَّدة»**: الترويج للأدوية بلا وصفة عبر منصّة واتساب للأعمال **غير مسموح لمستلمٍ في المملكة** لأنها ليست من الدول المستثناة. (ما إذا كانت رسالة تأكيد طلبٍ من صيدلية تُعدّ «facilitating the exchange» سؤالُ تفسيرٍ لا يحسمه النصّ، ويُترك لقرار المالك.)

**④ R215: البند 4.7 نُقل بلا استثنائه.**
النصّ الإنجليزيّ للشروط (https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform?locale=en_US ، «Last Modified: September 23, 2026»؛ مقروءٌ عبر `WebFetch` لأن `curl` يعيد هيكل JavaScript) يكمل الجملة المقتبسة بـ«provided, however, that such technologies may be made available to businesses in certain countries as set forth here»، ثم «Notwithstanding the foregoing, you may retain an AI Provider as your Solution Provider.» مع حظر استعمال بيانات المنصّة لتدريب نماذج غير مخصّصة لك. والرابط «here» يقود إلى https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers ، وفيها (مجلوبة بـ`curl`، `200`): «Effective March 11, 2026 , this applies to Brazil (+55).»، ودول المنطقة الاقتصادية الأوروبية «Effective March 11, 2026 until May 12, 2026»؛ **والمملكة غائبة** (`Saudi` = 0، والضابط `Brazil` = 2). **فخلاصة البحث «المساعد الذكيّ لا يُقدَّم عبر واتساب وظيفةً أساسية» تصمد في المملكة**، لكن الاستثناء القُطريّ وجواز الاستعانة بمزوّد ذكاءٍ اصطناعيّ موفّرَ حلول لم يُذكرا. (وبذلك سقط أيضاً قول البحث إن النصّ «لم يُطابَق بالنسخة الإنجليزية»: طوبق الآن، والنسخة العربية تحمل الاستثناء نفسه «شريطة أنه يجوز إتاحة هذه التقنيات للأنشطة التجارية في بلدان معينة على النحو المبين هنا».)

**⑤ R215: اقتباس التسعير ليس حرفياً، ومضمونه ينتهي في 2026-10-01.**
`https://developers.facebook.com/docs/whatsapp/pricing` يحوّل اليوم إلى `https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing`. الاقتباس الأول موجودٌ لكنه مقطوعٌ قبل تمامه: «Effective July 1, 2025, Meta charges on a per-message basis for messages businesses deliver to WhatsApp users». **والثاني «Utility templates delivered within an open customer service window are free.» غير موجود حرفياً** (المطابقة = 0)؛ والموجود «As of July 1, 2025 - Meta does not charge for utility templates in response to users (delivered within an open customer service window).» **والأهمّ أن الصفحة نفسها تعلن تغييره بعد أربعة أيام من تاريخ القراءة**: «Effective October 1, 2026 – Meta will charge on a per-message basis for service messages.» و«Effective October 1, 2026 – Meta will charge for utility messages sent in an open 24-hour customer service window», مع شريحةٍ مجانية «of 1,000 delivered service messages per month» لكلّ رقم. وفيها أيضاً رفعُ أسعار التسويق للمملكة في 2026-10-01، والفوترة بالريال (`SAR (Saudi Arabia)`) ضمن العملات. **فبند «رسائل الخدمة داخل النافذة مجانية» لا يُبنى عليه نموذج تكلفة.**

**⑥ R217: صفحة Apple تحمل تاريخ تحديث.**
المكتوب: «لا تاريخ تحديثٍ ظاهر في الصفحة» (ومكرّر في «ما لم يُقرأ» رقم 5). **والنصّ المستخرج من الصفحة نفسها** يحمل «Last Updated: June 8, 2026» في آخر المحتوى قبل تذييل الموقع.

**⑦ R217: عدد ORDER LLC أكبر، و«لا إصدار أوّل في 2026» أثرٌ لسقف الواجهة.**
صفحة المطوّر على الويب (https://apps.apple.com/sa/developer/order-llc/id1664454406 ، `200`) تحمل اليوم **40** رابط تطبيقٍ مختلفاً لا 11؛ **34 منها ليست بين الـ200** التي أعادتها واجهة `lookup`، وكلّها لـ«ORDER LLC | 1664454406» بسؤال الواجهة عنها بمعرّفاتها. **فالعدد ≥ 234 لا ≥ 200.** ومن هذه الـ34 إصداران أوّلان في 2026 (`2026-08-22 OrderManagerApp` · `2026-08-26 شاي بلبل`). فالقول «لا يظهر إصدارٌ أوّل في 2026» صحيحٌ على الـ200 وحدها وخاطئٌ على المطوّر، **وقول المالك «آخرها مارس ٢٠٢٦» متجاوَز**: آخر إصدارٍ أوّل مقروء 2026-08-26. وتوزيع السنوات ضمن الـ200 اليوم `2024: 71` و`2025: 51` لا `70/52` (فرقٌ طفيف، والواجهة تُعيد عيّنةً مقصوصة عند 200 فلا تُثبت ترتيباً). **والحكم يقوى ولا يسقط**: النموذج قائمٌ ويُضاف إليه.

### الخطابات

`letters\VENDOR-2-SAMA.md` هو الخطاب الوحيد للمجموعة. **يصمد**:
- البريد `ob@sama.gov.sa` منشورٌ رسمياً صورةً في https://openbanking.sama.gov.sa/ (الصورة `email.jpg` جُلبت اليوم وقُرئت، والعبارة الممهِّدة حرفية).
- الموضوع موجود؛ والعربية رسمية؛ والأسئلة الأربعة لا تتداخل مع ما في خطابي SAMA 2/3 بحسب ما يصرّح به الخطاب.
- **الشرطات:** فُحص الملف على `U+002D` `U+2010` `U+2011` `U+2012` `U+2013` `U+2014` `U+2015` `U+2212` `U+FE58` `U+FE63` `U+FF0D` `U+2E3A` `U+2E3B`: **صفر** في كلّ منها (2,975 حرفاً). فلم يُعدَّل سطر.
- ملاحظةٌ واحدة خارج نصّ الخطاب: جملة «كما تنص صفحة مصرف الإنماء» في التنبيهات (انظر ②).
