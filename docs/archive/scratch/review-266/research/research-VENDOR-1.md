# بحثُ المجموعة VENDOR-1 — خمسةُ بنودٍ عند المزوّدين

> **النموذج**: Opus 5.5 (`claude-opus-5-5`).
> **تاريخُ القراءة**: **2026-09-27** بساعة الجهاز (05:00–05:55 بتوقيت الرياض) — لا 2026-09-26 كما افترض الموجز؛ يُكتب ما وقع.
> **لا شرطَ إطلاقٍ في المجموعة**: البنودُ الخمسة `launchGating: false` — فلا ترتيبَ أولويةٍ بينها غيرُ ترتيب الجدول.
> **لم يُرسَل شيء، ولم يُملأ نموذج، ولم يُدخَل إلى حساب.** الخطاباتُ في `letters/` جاهزةٌ غيرُ مرسلة.

## الخلاصة

| # | البند | الحكم | الملفّ |
|---|---|---|---|
| R209 | الاستعلامُ بالمرجع في وثائق Geidea للأجهزة | **letter** — الوثائقُ العامّة كلُّها للدفع الإلكترونيّ، ولا وثيقةَ منشورةً للأجهزة | `letters/VENDOR-1-Geidea.md` |
| R210 | قائمةُ طابعات Epson ePOS الشبكية | **open** — القائمةُ منشورةٌ في ملفٍّ لا يُقرأ إلا بتنزيله، والتنزيلُ يحتاج إذنَ المالك | — |
| R211 | بروتوكولاتُ متحكّمات الساحة | **letter** — المعيارُ المفتوح معروفٌ ونصُّه للأعضاء، والسائدُ محلياً لا ينشره أحد | `letters/VENDOR-1-Gilbarco.md` |
| R212 | واجهاتُ جاهز وهنقرستيشن ومرسول | **letter** لجاهز ومرسول · **هنقرستيشن مُجاب** من النصّ | `letters/VENDOR-1-Jahez.md` · `letters/VENDOR-1-Mrsool.md` |
| R213 | OpenAPI 3.1 وRFC 7807 | **answered** — ومعه كشفان: RFC 7807 **منسوخٌ** بـRFC 9457، ووثيقتُنا المولَّدة **3.0.0** | — |

---

## R213 — OpenAPI 3.1 وRFC 7807 — **answered**

**المصدر ١: RFC 9457** — https://www.rfc-editor.org/rfc/rfc9457.txt (قُرئ النصُّ كاملاً ومحفوظٌ في `vendor1-raw/rfc9457.txt`، 2026-09-27)
- رأسُ الوثيقة: `Obsoletes: 7807` · `Category: Standards Track` · `July 2023`.
- **فـRFC 7807 منسوخٌ منذ يوليو ٢٠٢٣** — والإحالةُ إليه في المسح `12` (`docs/domain-scan/12-…:45`) تُصحَّح إلى **RFC 9457**.
- نوعُ الوسيط، القسم 3: «that format is identified with the "application/problem+json" media type».
- القسم 3.1.1 (`type`): «When this member is not present, its value is assumed to be "about:blank".»
- الأعضاءُ الخمسة: `type` · `status` · `title` · `detail` · `instance` (القسم 3.1).
- الملحق D، الفروقُ عن 7807 ثلاثة: سجلٌّ لأنواع المشكلات الشائعة (4.2) · بيانُ معاملة المشكلات المتعدّدة (3) · إرشادٌ لعناوين `type` غير القابلة للجلب (3.1.1).

**المصدر ٢: مواصفة OpenAPI** — https://spec.openapis.org/oas/ · https://spec.openapis.org/oas/v3.1.2.html · https://spec.openapis.org/oas/v3.2.1.html (2026-09-27)
- جدولُ الإصدارات في الملحق: `3.1.0 2021-02-15` · `3.1.1 2024-10-24` · **`3.1.2 2025-09-19 Patch release`** · **`3.2.0 2025-09-19 Release`** · **`3.2.1 2026-09-10 Patch release`**.
- فـ«3.1» اليومَ = **3.1.2**، وفوقه خطٌّ أحدث **3.2** (آخرُه 3.2.1 قبل أسبوعين).
- كائنُ المخطَّط في 3.1: «a superset of the JSON Schema Specification Draft 2020-12».
- حقلُ `webhooks` في الجذر (3.1): «The incoming webhooks that MAY be received as part of this API» — **وهو ما يلزم `S4` (الإشعارات للخارج) في المسح `12`**.
- `jsonSchemaDialect`: «The default value for the $schema keyword within Schema Objects».

**قياسٌ في المستودع (قراءةً فقط)**: الوثيقةُ التي يولّدها الخادم **OpenAPI 3.0.0** لا 3.1:
- `@nestjs/swagger` بإصدار `7.4.2` (`apps/api/package.json:35` يطلب `^7.4.2`) · والافتراضيُّ في `node_modules/@nestjs/swagger/dist/fixtures/document.base.js:5` هو `openapi: '3.0.0'`.
- واختبارا العقد يبنيان عيّناتهما على `'3.0.0'`: `apps/api/src/common/openapi-contract.spec.ts:20,82` · `apps/api/src/common/response-schema.util.spec.ts:90`.
- المسبارُ مُصادَق: النمطُ نفسُه أصاب `problem+json` في `docs/domain-scan/12-…:45` (حالةٌ معلومة)، ولم يجد ملفَّ `openapi*.json` في `apps` (اللقطةُ `docs/openapi.snapshot.json` ملخّصُ عقدٍ بلا حقل `openapi`).
- **الأثر حين يُبنى الباب**: `webhooks` في الجذر ومخطَّطاتُ JSON Schema 2020-12 **غيرُ متاحة في 3.0** — فالانتقالُ إلى 3.1 قرارٌ يُتّخذ حين يُبنى باب الواجهة البرمجية، لا أثرَ له اليوم.

---

## R209 — الاستعلامُ بالمرجع في وثائق Geidea — **letter**

**ما قُرئ (2026-09-27):**
1. **مركزُ مطوّري Geidea** https://docs.geidea.net/docs/overview (يُحوَّل إليه `docs.geidea.net`) و**مرجعُ الواجهة** https://docs.geidea.net/reference — قُرئت **شجرةُ التنقّل كاملةً** (كلُّ عناوين الصفحات وأسمائها المختصرة في الصفحتين): **كلُّها دفعٌ إلكترونيّ** (Checkout · Direct API · روابطُ الدفع · الاشتراكات · المحافظ · إضافاتُ المتاجر · SDK الجوال).
2. صفحةُ الاستعلام بالمرجع https://docs.geidea.net/docs/fetch-transaction-or-order-details-by-merchant-reference :
   `GET https://api.merchant.geidea.net/pgw/api/v1/direct/order?MerchantReferenceId={MerchantReferenceId}` — والمعاملُ إلزاميّ: «a unique identifier for this order to discern it from other orders». **وهذا للدفع الإلكترونيّ** — وهو المقروءُ سابقاً في `#596`.
3. صفحةُ الجهاز https://geidea.net/ksa/en/solutions/hardware/payment-terminal — الطرازُ المسمّى **Palm** وحده، والعبارة: «Seamlessly connects with your cash register, inventory, or CRM applications» — **بلا إحالةٍ إلى أيّ وثيقة**.
4. صفحةُ SoftPOS https://geidea.net/ksa/en/solutions/payments/softpos — «Integrates with merchant software» — **بلا وثيقة**.
5. خريطةُ الموقع https://www.geidea.net/sitemap.xml — لا صفحةَ مطوّرين ولا تكاملٍ للأجهزة في قسم `ksa/en` (٣٠ رابطاً قُرئت كلُّها).
6. مستودعاتُ GitHub باسم `GeideaSolutions`: `404` — فلا مصدرَ مفتوحاً رسمياً معروفاً للأجهزة.

**بحثُ النفي ومصادقتُه:** على صفحتَي مركز المطوّرين (`overview` و`reference`) نمطُ `terminal|softpos|in-store|ecr|point of sale|tap to phone|tap on phone` ⟵ **صفرُ نتيجةٍ ذاتِ معنى** (إصابةٌ واحدة كاذبة: `ecr` داخل `secret`/`recaptcha`). **والضابط على الموقع نفسِه**: `merchant-reference` ⟵ **أُصيب** (الصفحةُ `fetch-transaction-or-order-details-by-merchant-reference`، ومرّتان في المرجع). فالمسبارُ يرى، والغيابُ غيابٌ في **المنشور** لا في الواقع.

**الحكم:** لا يُجاب عن «الاستعلام بالمرجع للأجهزة» إلا بجوابٍ مكتوب — **خطابٌ جاهز** إلى `contacts@geidea.net` (منشورٌ في تذييل https://geidea.net/ksa/en تحت «Contact Us»)، بسبعة أسئلة: وثائقُ الربط · المرجعُ الفريد والاستعلامُ به · عدمُ التكرار عند الإعادة · المهلةُ وحالُ انقضائها · سحابيٌّ أم محلّيّ · تعاقدُ التاجر مباشرةً (قيدُ ساما: لا تسجيلَ للتاجر لدينا) · بيئةُ الاختبار.
- ⚠️ بريدٌ آخر منشور `geideapay.support@geidea.net` (صفحةُ `pre-requisites` في مركز المطوّرين) **خاصٌّ بدعم بوابة الدفع الإلكترونيّ** — فلم يُعتمد للأجهزة.

---

## R210 — قائمةُ طابعات Epson ePOS الشبكية — **open**

**ما قُرئ (2026-09-27):**
1. المرجعُ الفنيّ القديم (`reference.epson-biz.com`) **مغلق**: «This site has been closed since June 16, 2024» ويحيل إلى `support.epson.net/publist/reference_en/?ref=epos_js`.
2. ذلك العنوانُ يُحوِّل إلى `download4.epson.biz/…/epos_js/` ⟵ **`404`** في المتصفّح (والأداتان `curl`/WebFetch ⟵ `403` من Akamai). **فدليلُ ePOS SDK for JavaScript لم يعد صفحاتٍ منشورة.**
3. صفحةُ التقنية https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html (قُرئت **في لوحة المتصفّح** — الأدواتُ الأخرى `403`):
   - «printing can be directly done on ePOS-Print supported TM printer»
   - «**See Supported Products on the Epson ePOS SDK for JavaScript download page.**» — **فالقائمةُ الرسمية تعيش في صفحة التنزيل، لا في صفحةٍ تُقرأ.**
4. مركزُ التنزيل https://download-center.epson.com/softwares/?device_id=TM-m30III&os=WIN1164&language=en&region=SA — بندُ **«Epson ePOS SDK for JavaScript» `2.27.0i` · `2026-07-01` · `23.82 MB`**، وسجلُّه في واجهة الصفحة نفسِها يحمل **`"eula":"ePOS SDK"`** ⟵ **تنزيلُ الحزمة يستلزم قبولَ اتفاقية ترخيص** (ممنوعٌ عليّ بلا إذن المالك).
5. زرُّ «Description» للبند نفسِه يفتح **ملفَّ PDF**: `ov_ePOS_SDK_JavaScript_2.27.0i.pdf` — `185,873` بايت · `application/pdf` · `Last-Modified: 29 Jun 2026` (قيسَ بطلب `HEAD` بلا جلب المحتوى). **ولا يُعرض صفحةً بل يُنزَّل**.

🔴 **أثرٌ جانبيّ وقع ويُعلَن:** حين فتحتُ عنوانَ ذلك الـPDF في لوحة المتصفّح **عُرض على المالك مربّعُ حفظ ملف** (ردّ الخادم تنزيلاً لا صفحة). **لم أقبله ولم أُعِد المحاولة**، ولم يُحفظ شيءٌ بيدي. إن ظهر المربّعُ للمالك فمصدرُه هذا.

**قراءةٌ مشتقّةٌ لا تُغني عن القائمة** (`vendor1-raw/epson-dc-derived.tsv`): سألتُ واجهةَ مركز التنزيل نفسَها (من داخل الصفحة، `region=SA`) عن **١١٧ طرازاً** من قائمة Epson Setup Navi: **٦٣ طرازاً يُدرج لها المركزُ «ePOS SDK for JavaScript»** و**٤٥ يُدرج لها «ePOS-Print XML»**. المسبارُ مُصادَق: `TM-m30III` ⟵ `1` (معلومٌ من الصفحة) و`TM-C100` (طابعةُ ملصقاتٍ ملوّنة) ⟵ `0`. ⚠️ **لكنها ليست «Supported Products»**: فيها طرازاتُ USB/تسلسليةٌ بلا شبكة (مثل `TM-T20X` و`TM-m10`) — والمرجّح أنها تُبلَغ عبر طابعةٍ ذكيةٍ وسيطة (Forward printing) — **فلا تصلح «قائمةً معلنة» لـG2** التي تشترط الطابعةَ على الشبكة.

**ما حجبه بعينه، وما يفكّه:**
- **يفكّه إذنٌ واحد من المالك**: تنزيلُ `ov_ePOS_SDK_JavaScript_2.27.0i.pdf` (`185,873` بايت، من `download-center.epson.com`، **بلا اتفاقية ترخيص** — يُفتح من زرّ «Description» مباشرةً). **والمرجَّحُ — استنتاجاً لا قراءةً — أنه «صفحةُ التنزيل» التي تحيل إليها Epson بقائمتها.**
- وإن لم تكن فيه: الحزمةُ نفسُها (`24,973,946` بايت) **خلف اتفاقية «ePOS SDK»** — قبولُها قرارُ المالك.
- **لا خطابَ هنا**: الجوابُ منشورٌ من المصنّع، والحاجزُ إجراءٌ عندنا لا جوابٌ عنده.
- **Star WebPRNT** مقروءٌ سلفاً (ستةُ طرازات — المسح `27` `W74`) ولم يُعَد.

---

## R211 — بروتوكولاتُ متحكّمات الساحة — **letter**

**ما قُرئ (2026-09-27، موقعُ IFSF في لوحة المتصفّح — `curl` ⟵ `403`):**
1. فهرسُ المعايير https://ifsf.org/standards-index/ : **«Part 3-27 POS to FDC V1 Application Interface Standard»** و**«Part 3-70 POS to FDC V2 Application Interface Standard»** — **هذا هو المعيارُ المفتوح بين نظام نقاط البيع ومتحكّم الساحة**. ومعايير النقل https://ifsf.org/our-work/ifsf-standards/communication-standards/ : «Part 2-01 Communications over Lonworks» · «Part 2-02 Communications over TCP-IP» · «Part 2-03 Communications over HTTP REST».
2. صفحةُ الجزء 3-27 https://ifsf.org/our-work/ifsf-standards/forecourt-standards/non-api/part-3-27-pos-to-fdc-v1-application-interface-standard/ : «**An active membership is required to view this content.**» — **فالنصُّ لم يُقرأ**، وحاجزُه العضوية.
3. العضوية https://ifsf.org/membership/membership-levels-benefits/ : «Technical Associate Member – £1,000–£5,000/year Typically suppliers and solution providers» (وتتغيّر الشرائح من 1 يوليو 2026 للأعضاء الجدد). والتواصل: `admin.manager@ifsf.org`.
4. الشهاداتُ الفعّالة https://ifsf.org/software/active-certifications/ (١٠٥ أسطرٍ نصّية في الصفحة كلِّها، بعناوينها): المسبارُ `FDC|Controller|POS` أصاب سطرين فقط، **ولا شهادةَ لواجهة POS‑FDC فيها**؛ لمتحكّم الساحة شهادةٌ واحدة (Petrotec، 2008). فالسجلُّ **لا يدلّ على الانتشار**.
5. **المصنّعُ ذو المكتب في الرياض** — Gilbarco Veeder‑Root لمنطقة الشرق الأوسط وأفريقيا، صفحةُ متحكّم DOMS PSS 5000 https://www.gilbarco.com/mea/our-solutions/retail-solutions/doms-pss-5000 :
   - «The DOMS PSS 500 supports more than 100 different protocols, including IFSF.» (كذا بالنصّ: `500`)
   - «Easy POS integration via TCP/IP»
   - وصفحةُ الاتصال تسمّي **مكتباً في الرياض** (مبنى سدى بريميوم ٦٦٧٦، شارع العليا).
6. **Dover Fueling Solutions** (Wayne/Tokheim): `curl` ⟵ `403`، والمتحكّمُ حوّل المتصفّحَ إلى `/la/en` (أمريكا اللاتينية) ثم علق — **لم يُقرأ**.

**الحكم:** «السائدُ محلياً» **لا تنشره جهةٌ ولا مصنّع** — يُعرف بالسؤال. **خطابٌ جاهز** إلى Gilbarco MEA (خمسة أسئلة: الواجهةُ المركّبة في المملكة IFSF أم خاصّة · الشائعُ في المحطات السعودية · السحابيُّ أم الشبكةُ المحلية · شروطُ الوثائق · المحاكاةُ والموزّعون).
- ⚠️ **القناة**: البريدُ المنشور للمنطقة `mea.helpdesk@gilbarco.com` **للأعطال وحدها** («Client Name, Site Name… Description of the fault»)، والصفحةُ نفسُها توصي بنموذج «Request a Quote» لمن يطلب معلومات — **فالخطابُ يُرسَل عبر النموذج** https://www.gilbarco.com/mea/request-a-quote . وفي شيفرة الصفحة بريدٌ ثالث `GVR-Mea-Enquiries@gilbarco.com` **داخل تعليق HTML لا يظهر للزائر** — فلم يُعتمد.
- ⚠️ **في الخطاب عناوينُ بترميز `%2D`** بدل الشَّرطة (`contact%2Dus` · `request%2Da%2Dquote`) التزاماً بقاعدة «لا شَرطة» — **وقيسَ أنها تعمل** (`200` والصفحةُ نفسُها بالبريد نفسِه).
- **وطريقٌ أرخص من الخطاب**: جلسةُ `§3.6` ② مع مشغّل محطة — يُسأل عن متحكّمه وطرازه ومن ركّبه.

---

## R212 — واجهاتُ جاهز وهنقرستيشن ومرسول — **letter** (لاثنتين) · **هنقرستيشن مُجاب**

### هنقرستيشن — **مُجاب من النصّ الأصليّ**
1. بوّابةُ مطوّري هنقرستيشن https://developer.hungerstation.com/ (2026-09-27) — **للتجارة السريعة (بقالة/تجزئة)**: «Partner API» و«SFTP» (الكتالوج · العروض · الطلبات).
   - صفحةُ التكامل https://developer.hungerstation.com/en/documentation/catalog-api-how-to-integrate : «you also must be one of our partners» · و«Request the Client ID and Secret – please contact your Manager to get this information.» · والرمزُ صالحٌ ساعتين.
2. **وللمطاعم** تحيل البوّابةُ نفسُها («Restaurants - you’re in the wrong place») إلى `https://integration.hungerstation.com/en/` — **وهذا النطاقُ لا وجودَ له في DNS** (`Non-existent domain`) — **رابطٌ ميتٌ على صفحة المزوّد**.
3. **فالمرجعُ الحيّ للمطاعم** بوّابةُ الشركة الأمّ https://developers.deliveryhero.com/documentation/pos.html («Restaurant Integration API»):
   - «Supported Platforms» تسمّي **«Hungerstation (Saudi Arabia)»**.
   - نموذجُ المزوّد: «Plugin : Adapter to be created by the POS Clients…» — **أي أن مزوّدَ نظام نقاط البيع يبني محوّلاً واحداً** (يلائم نموذجنا متعدّدَ المستأجرين).
   - الوصول: «After request approval , your local representative will share your Credentials.» — بطلبٍ يحمل مفتاح PGP عامّاً، عبر نموذج «Get Credentials» في الصفحة نفسِها.
   - وصيانةُ المحوّل يُبلَغ عنها `log-vendor-pos@deliveryhero.com` قبل ٢٤ ساعة (بندُ «Post-production agreement»).
   - الواجهتان مرجعهما `integration-middleware.stg.restaurant-partners.com/apidocs/pos-middleware-api` و`…/pos-plugin-api` (أُثبت أن الأولى تردّ `200`).
- **الحكم لهنقرستيشن:** **الوصولُ ممكنٌ ومنشورةٌ شروطُه** — وثائقُ علنية، والمفاتيحُ بعد موافقة الممثّل المحلّي. **ولا خطاب**: الطلبُ نفسُه **نموذجٌ لا يُملأ إلا بإذن المالك** (ويحتاج مفتاح PGP يولّده المالك).

### جاهز — **letter**
- `jahez.net` و`www.jahez.net` و`partners.jahez.net` ⟵ `403` للأدوات، والمتصفّحُ ⟵ صفحةُ «Just a moment...» (**فحصٌ آليّ للزوّار — لم يُتجاوَز**). **فلم يُقرأ الموقعُ أصلاً — وهذا «لم يُقرأ» لا «غير موجود».**
- موقعُ المجموعة الرسميّ https://jahezgroup.com/ (علاقاتُ المستثمرين والحوكمة) — **لا ذكرَ لواجهةٍ أو تكامل**؛ والبريدُ المنشور `info@jahez.net` (مرمَّزٌ في الصفحة بحماية Cloudflare وفُكّ ترميزُه محلياً).
- **خطابٌ جاهز** إلى `info@jahez.net` — خمسة أسئلة: وجودُ الواجهة · شروطُ الوصول · منحُها لمزوّدٍ متعدّد التجّار · الوثائقُ قبل التعاقد وبيئةُ الاختبار · البياناتُ المنقولة ومن يُصدر الفاتورةَ الضريبية.

### مرسول — **letter**
- https://mrsool.co/partnership/ : «When you directly integrate with us we will be able to show your business…» — **ادّعاءُ تكاملٍ بلا وثيقة**؛ والتسجيلُ عبر `business.mrsool.co/public/registration/` (تطبيقٌ بلا نصٍّ مقروء).
- **بحثُ النفي ومصادقتُه (بحثُ الموقع نفسِه `wp-json/wp/v2/search`):** `developer` ⟵ **٠** · `API` ⟵ ٥ لكنها **مطابقاتُ جزءِ كلمة** (صفحةُ «About» فيها صفرُ `\bAPI\b`) · `integration` ⟵ `/partnership/` · **والضابط** `partner` ⟵ **٥** (منها `/partnership/`). و`business.mrsool.co/api-docs` و`/docs` ⟵ `404`.
- **خطابٌ جاهز** إلى `info@mrsool.co` (منشورٌ في «Contact Info» بصفحة الشراكة والرئيسة) — الأسئلةُ الخمسة نفسُها.

---

## حدودُ هذا البحث — معلَنة

1. **ميزانيةُ البحث في الويب نفدت قبل أوّل استعلام** («200 of 200» للجلسة): فكلُّ ما قُرئ **بعناوين رسمية مباشرة وتصفّحِ مواقع الجهات نفسِها** — لا محرّكَ بحث. ولم يُلتفّ على الحدّ بمحرّك بحثٍ عبر `curl`. وموصِّلُ firecrawl يحتاج تفويضاً في الإعدادات فلم يُستعمل.
2. **فحوصٌ آلية لم تُتجاوَز**: `jahez.net` (Cloudflare) · `hungerstation.com` (`403`) · `doverfuelingsolutions.com` (`403` ثم تعليق).
3. **لوحةُ المتصفّح مشتركةٌ مع وكلاء آخرين**: بدأتُ على اللسان `tab-3` فوجدتُه بعدها على `developer.xero.com` — **أي أن وكيلاً آخر يستعمله، وملاحتي الأولى عليه (صفحاتُ Epson) ربما قطعت عمله**. انتقلتُ إلى لسانٍ خاصّ `tab-9` وأُغلق في آخر العمل.
4. **ملفّاتُ الدليل** في `vendor1-raw/` (نُقلت من `raw/` المشترك إلى مجلدٍ خاصّ؛ كلُّها من كتابتي بطوابع 05:03 فما بعد). وكتبتُ مؤقّتاً `extract.mjs` و`tmp.out` في `raw/` المشترك قبل نقلهما — **ولا يُعرف إن كان لوكيلٍ آخر ملفٌّ بالاسمين نفسيهما قبل ذلك** (بحثتُ في تقارير المجموعات عن أيّ إحالةٍ إليهما فلم أجد، والمسبارُ نفسُه أصاب إحالاتٍ أخرى إلى `raw/` في خمسة تقارير).
5. **عمليةُ `grep` يتيمة**: أمرٌ بنمطٍ عريض على نصٍّ طويل علّق حتى أوقفتُه (`TaskStop`) — وبعدها ظهرت `grep.exe` بـ١ GB **ثم زالت**؛ والباقيتان من جلساتٍ أخرى لم تُمسّا (`§8.7` الوجه الثامن عشر بعينه: أُعيدت القراءةُ بـ`node`).

---

## مراجعةٌ عدائية

> **المراجِع**: Opus 5.5 (`claude-opus-5-5`) · **تاريخُ القراءة 2026-09-27** بساعة الجهاز (الموجزُ افترض 26).
> **لم يُرسَل شيء، ولم يُملأ نموذج، ولم يُدخَل إلى حساب.** ولم تُستعمل لوحةُ المتصفّح المشتركة كي لا يُقطع عملُ وكيلٍ آخر: كلُّ قراءةٍ بـ`curl` بترويسة متصفّح، والنسخُ المقروءة محفوظةٌ في `vendor1-adv/`.
> ⚠️ **إعلان**: كتبتُ ملفاً مؤقّتاً `/tmp/jz.html` خارج مجلد البحث لحظةً (لقراءة عنوان صفحة `jahez.net`) ثم حذفتُه — خرقٌ صغيرٌ لقاعدة «الكتابة داخل `research` وحدها» يُعلَن ولا يُخفى.

### ① الحكمان «answered» — كلاهما يصمد

**R213 (OpenAPI 3.1 وRFC 7807) — يصمد كاملاً.** كلُّ اقتباسٍ وُجد في موضعه:

| الدعوى | ما قُرئ | الموضع |
|---|---|---|
| RFC 7807 منسوخ | «Obsoletes: 7807» في الرأس، و«This document obsoletes RFC 7807.» في الملخّص | `rfc9457.txt` السطران 7 و21 |
| نوعُ الوسيط | «that format is identified with the "application/problem+json" media type» | القسم 3 |
| القيمةُ الافتراضية لـ`type` | «When this member is not present, its value is assumed to be "about:blank".» | القسم 3.1.1 (الجملةُ على سطرين 254–255) |
| الأعضاءُ الخمسة | عناوينُ الأقسام 3.1.1 إلى 3.1.5: `type` · `status` · `title` · `detail` · `instance` | القسم 3.1 |
| الفروقُ الثلاثة | سجلُّ الأنواع (4.2) · المشكلاتُ المتعدّدة (3) · عناوينُ `type` غيرُ القابلة للجلب (3.1.1) | الملحق D |
| جدولُ الإصدارات | `3.2.1 2026-09-10` · `3.2.0 2025-09-19` · `3.1.2 2025-09-19` · `3.1.1 2024-10-24` · `3.1.0 2021-02-15` | الملحق A في `v3.2.1.html` (وفي `v3.1.2.html` حتى 3.1.2 وحدَه) |
| المخطَّط | «a superset of the JSON Schema Specification Draft 2020-12» | `v3.1.2.html` و`v3.2.1.html` |
| `webhooks` | «The incoming webhooks that MAY be received as part of this API» | كائنُ OpenAPI |
| `jsonSchemaDialect` | «The default value for the $schema keyword within Schema Objects» | كائنُ OpenAPI |

وقياسُ المستودع (قراءةً على `D:\worktrees\outbox-266`) يصمد **وأقوى مما كُتب**: `@nestjs/swagger` مثبَّتٌ `7.4.2` · `document.base.js:5` ⟵ `openapi: '3.0.0'` · و`document-builder.js:11` يبني منه، و`apps/api/src/common/openapi-document.ts:21–26` **لا يغيّر الإصدار** (ولا `setOpenAPIVersion` في تعريفات 7.4.2 أصلاً) · والسطور `openapi-contract.spec.ts:20,82` و`response-schema.util.spec.ts:90` كما ذُكرت · والمسحُ `12` السطر 45 يحمل الإحالةَ إلى 7807، والسطر 54 يعرّف `S4` بأنه «الإشعاراتُ للخارج (webhooks)» فالربطُ صحيح · و`docs/openapi.snapshot.json` بلا مفتاح `"openapi"` (العدّ صفر).

**R212 / هنقرستيشن «مُجاب» — يصمد، بتدقيقٍ واحد في الموضع:**
- «you also must be one of our partners» و«Request the Client ID and Secret – please contact your Manager to get this information.» و«valid for 2 hours» ⟵ كلُّها في `catalog-api-how-to-integrate`.
- ✏️ **الإحالةُ إلى المطاعم ليست في الصفحة الرئيسة** (صفرُ إصابةٍ فيها لـ`wrong place` و`Restaurant`) **بل في** https://developer.hungerstation.com/en/documentation/introduction : «Restaurants - you’re in the wrong place, but we’re here to help!» ورابطُها `https://integration.hungerstation.com/en/`.
- ذلك النطاقُ **لا وجودَ له**: `Non-existent domain` من موجّه الشبكة **ومن `8.8.8.8`**، و`curl: (6) Could not resolve host`. **والضابط** `developer.hungerstation.com` يُحَلّ من الموضعين. فالحكمُ «رابطٌ ميت» مُثبَت.
- Delivery Hero `pos.html`: «Plugin : Adapter to be created by the POS Clients…» · «After request approval , your local representative will share your Credentials.» · «Hungerstation (Saudi Arabia)» تحت «Middle East/North Africa» · وبريدُ الصيانة محجوبٌ بحماية Cloudflare وفُكّ ⟵ `log-vendor-pos@deliveryhero.com` مع «at least 24 hours in advance» ✓.
- العنوانان `pos-middleware-api` و`pos-plugin-api` **كلاهما** يردّ `200` (التقريرُ أثبت الأوّل وحدَه). ⚠️ **حدّ**: كلاهما على نطاق `stg` (بيئةُ تجهيز) ويردّ صفحةً قصيرة (~800 بايت) — فهو مرجعُ وثائق لا دليلُ نقطةِ إنتاج.

### ② الأحكامُ الأخرى — ما فُحص منها

**R209 Geidea (letter) — الحكمُ يصمد، ودليلٌ واحد لا يصمد:**
- الاقتباساتُ ✓: `MerchantReferenceId` والعنوانُ `api.merchant.geidea.net/pgw/api/v1/direct/order` و«a unique identifier for this order to discern it from other orders» · «Seamlessly connects with your cash register, inventory, or CRM applications» (Palm) · «Integrates with merchant software» (SoftPOS).
- **النفيُ أُعيد على الـHTML الخام** (بما فيه بياناتُ الشريط الجانبي: `61` اسماً مختصراً في `overview` و`42` في `reference`، والفرعُ الوحيد `2.0`): `terminal` · `softpos` · `in-store` · `\becr\b` · `point of sale` · `tap to/on phone` · `\bPOS\b` ⟵ **صفر** في الصفحتين. **والضابط** `merchant-reference` ⟵ `3` في كلٍّ. فالنفيُ صادق.
- ❌ **البندُ 6 لا يصمد**: «مستودعاتُ GitHub باسم `GeideaSolutions`: `404`» **خطأ** — الحسابُ موجود (`https://github.com/GeideaSolutions` ⟵ `200`؛ واجهةُ GitHub: أُنشئ 2021-03-24، **١٢ مستودعاً عامّاً**). **والضابط** `github.com/Geidea-Tech` ⟵ `404`. ومستودعاتُه الاثنا عشر **كلُّها للدفع الإلكترونيّ**: SDK لـAndroid وiOS وFlutter وReact Native (وصفُ أحدها «Geidea online gateway Android mobile SDK solution») وإضافاتُ Magento وOpenCart وPrestaShop وWooCommerce — **ولا شيءَ للأجهزة**. ولم أجد في صفحات `docs.geidea.net` المقروءة (`overview` · `android-sdk` · `flutter-1` · `woocommerce`) رابطاً إليه، فرسميّتُه **غيرُ مُثبَتة** من وثائق الشركة. ⟵ **الخلاصةُ «لا مصدرَ مفتوحاً للأجهزة» تبقى صحيحة، ودليلُها يُقرأ كما هنا لا كما كُتب.**

**R211 (letter) — يصمد:**
- IFSF: الفهرسُ يحمل «Part 3-27 POS to FDC V1 Application Interface Standard» و«Part 3-70 POS to FDC V2 Application Interface Standard» و«Part 2-02 Communications over TCP-IP»، وصفحةُ 3-27 تحمل «An active membership is required to view this content.» ✓. (وقُرئت بـ`curl` بترويسة متصفّح ⟵ `200`؛ الـ`403` في التقرير كان بلا ترويسة على الأرجح.)
- DOMS: «The DOMS PSS 500 supports more than 100 different protocols, including IFSF.» و«Easy POS integration via TCP/IP» ✓.
- القناة: بريدُ `mea.helpdesk@gilbarco.com` تحت «Include the following: Client Name, Site Name, Contact Person, Contact Number and Description of the fault.» ✓ · والتوصية: «If you need sales information about any of our solutions, request a quotation.» ✓ · و`GVR-Mea-Enquiries@gilbarco.com` داخل تعليقَي HTML ✓ · والنموذجُ فيه حقلُ «Comments» نصّيّ (لم يُملأ).
- ✏️ **اسمُ المبنى**: الصفحةُ تقول «SADA premium building 6676, AI Olaya St. Ryadh»، والتقريرُ (السطر 96) والخطابُ كتبا «سدى» — **تعريبٌ مخمَّن**؛ صُحّح في الخطاب إلى النصّ المنشور.

**R212 جاهز ومرسول (letter) — يصمدان:**
- `www.jahez.net` ⟵ `403` بعنوان «Just a moment...» · `partners.jahez.net` ⟵ `403` ✓. و`info@jahez.net` محجوبٌ بـCloudflare وفُكّ من `jahezgroup.com` ومن `jahezgroup.com/contact-us/` ✓، والهاتفُ «966 800 124 1220» ✓، والاسمُ العربيّ «شركة جاهز الدولية لتقنية نظم المعلومات» مقروءٌ في `jahezgroup.com/ar/` ✓.
- مرسول: «When you directly integrate with us we will be able to show your business…» ✓، ودعوى الصور في الخطاب ✓ («With the integration you will be able to show photos of all your products»)، و`info@mrsool.co` في «Contact Info» بـ`/partnership/` و`/home/` ✓. بحثُ الموقع: `developer` ⟵ `[]` · **والضابط** `partner` ⟵ `5` ✓.

**R210 Epson (open) — يصمد بما قُرئ:** `reference.epson-biz.com` ⟵ «closed since June 16, 2024.» ✓. صفحةُ `download4.epson.biz/…/epson_epos_sdk.html` ⟵ `403` لـ`curl` **فلم تُقرأ** في هذه المراجعة (ولم أفتح لوحةَ المتصفّح المشتركة لها)؛ والحكمُ `open` لا يتغيّر.

### ③ الخطابات

| الخطاب | القناةُ ومصدرُها | الموضوع | العربيةُ الرسمية | الشَّرطات | ما عُدّل |
|---|---|---|---|---|---|
| `VENDOR-1-Geidea.md` | `contacts@geidea.net` ✓ في تذييل `geidea.net/ksa/en` | ✓ | ✓ | **٠** | ✏️ المخاطَب «شركة جيديا للتقنية **المالية**» ⟵ «شركة جيديا للتقنية»: الاسمُ المنشور «Geidea Technology Company» وبالعربية «شركة جيديا للتقنية … رقم السجل التجاري: 1010332533» — والأوّلُ مخمَّن |
| `VENDOR-1-Gilbarco.md` | نموذج «Request a Quote» ✓ (والعنوانان بـ`%2D` يردّان `200`) | ✓ | ✓ | **٠** | ✏️ سطرُ المكتب إلى النصّ المنشور |
| `VENDOR-1-Jahez.md` | `info@jahez.net` ✓ | ✓ | ✓ | **٠** | — |
| `VENDOR-1-Mrsool.md` | `info@mrsool.co` ✓ | ✓ | ✓ | **٠** | — |

**مسبارُ الشَّرطات مُصادَق**: النمطُ `[U+002D U+2010…U+2015 U+2212 U+FE58 U+FE63 U+FF0D]` أصاب `2` في عيّنةٍ معلومة («a-b — c»)، وأعطى **صفراً** في الخطابات الأربعة **قبل التعديل وبعده**، ولا بايتَ `NUL` فيها.

### ④ الخلاصةُ المصحَّحة

| # | الحكم بعد المراجعة | ما تغيّر |
|---|---|---|
| R209 | **letter** يصمد | ❌ دليلُ «GitHub `404`» خاطئ: الحسابُ موجودٌ وكلُّه دفعٌ إلكترونيّ · ✏️ اسمُ المخاطَب في الخطاب |
| R210 | **open** يصمد | لا شيء |
| R211 | **letter** يصمد | ✏️ اسمُ المبنى في الخطاب |
| R212 | **letter** لجاهز ومرسول يصمد · **هنقرستيشن answered** يصمد | ✏️ موضعُ الإحالة إلى المطاعم هو صفحةُ `introduction` · والعنوانُ الثاني يردّ `200` أيضاً |
| R213 | **answered** يصمد | لا شيء — وقياسُ المستودع أقوى مما كُتب |

**لا حكمَ سقط.** سقط دليلٌ واحد (GitHub) وتخمينان في نصّ الخطابين صُحّحا.
