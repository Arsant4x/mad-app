# مسحُ باب أجهزة نقاط البيع — خام (review-260)

> **Read on:** 2026-09-24 · **Repo tree read:** `origin/main` = `0d05b663e013a0e3e6b97ffa620e078e33ce077e`
> (2026-09-24 02:30 +0300), through `git show` / `git grep` only — the working tree (branch `feat/non-deductible-vat`)
> was not used and nothing under `D:\mad-app` or `D:\worktrees` was modified. No build, no npm, no tests.
> ⚠️ **`origin/main` moved during the scan** (another session's fetch): to `a036c4777fc7435026ed1803bd1ea652e0195fc4`
> (2026-09-24 03:03 +0300; 3 commits, 38 files — employees, purchases, country literals, scan doors 25/26). **None of the
> files cited below changed** (intersection of the diff with every cited path = empty), and every code/doc grep in Part 1 was
> re-run pinned to **both** SHAs: identical, except `weigh` (94 lines/14 files → 100/15; the 6 new hits are allocation
> weights in `purchases/non-deductible-vat.util.ts`, not weighing).
> **Method:** Part 1 = reading the repo (every negative backed by a validated probe). Part 2 = primary sources
> (vendor developer docs, W3C/WICG specs, MDN browser-compat-data, Chrome/Microsoft/Android docs, Unicode mapping
> files, GS1, PCI SSC). Each claim carries a source ID (`W..` = web, `P..` = project) resolved in the Sources table.
> **Quoting rule used here:** third-party sources are paraphrased; one short verbatim quote only (session copyright
> rule). Project documents (the owner's own) are quoted exactly with line numbers.

---

## الخلاصة (عربي — للمالك)

1. **لا، لم يشمله إلا سطراً.** الباب ⑭ ذكر العتاد في **بندٍ واحد** (`S9`: «طابعةٌ · درجٌ يُفتح · ماسحٌ · شاشةُ عميل — عبر متصفّحٍ أو وكيلٍ محلّيّ»)،
   وصفِّ غيابٍ واحد (`escpos|WebUSB|cashDrawerKick` = ٠)، وتأجيلٍ واحد (`B2`: «وكيلٌ محلّيّ أو WebUSB»). **الميزانُ وطابعةُ الملصقات لم يُذكرا بحرف.**
   وجهازُ مدى حضر بحالة المحوّل (تجريبيٌّ وحده) وقيد ساما فقط، **لا بنماذج الربط**. وأعلن الباب نفسُه أنه لم يقرأ ESC/POS ولا GS1 ولا نظامَ أجهزة «المدفوعات السعودية» (سطر ٤٣).
2. **قائمةُ الأجهزة الستة موجودةٌ في وثيقةٍ أخرى لم يستشهد بها الباب**: `docs/plans/retail-full-spec.md §9.3` (أولويةٌ لكلٍّ منها) و`§6.3` (الباركود الموزون ببادئة ٢ ومحرّرُ قوالبه).
   و`SPEC 27.1` يقول صراحةً: «يبقى خارج النطاق: المرتجعات · العتاد».
3. **اكتشافان من قراءة الشيفرة (لم يُشغَّلا):** ① واجهةُ الكاشير **لا تصل محوّلَ جهاز الدفع أبداً** — كلُّ بيعٍ يمرّ بمسار المزامنة
   (`viaSync: true`) الذي يتخطّى الشحن، والمسارُ الحيّ `createPosSale` معرَّفٌ بلا مستدعٍ. ② الشحنُ مُنتظَرٌ **داخل معاملة المستأجر** (مهلتها ٥ ث مقيسةً في المشروع) — ودفعٌ بحضور البطاقة أبطأ من ذلك بطبيعته.
4. **المتصفّح وحده لا يكفي على ويندوز للطابعة USB**: WebUSB لا يأخذ طابعةً يمسكها تعريفُ النظام إلا بتبديل التعريف إلى WinUSB (Zadig) — وهذا تثبيتٌ يخالف قاعدة SaaS.
   وWebUSB/WebHID/Web Bluetooth غائبةٌ عن Safari/iOS وFirefox وWebView؛ وWeb Serial في Chromium (وFirefox 151 بإضافة إذن).
5. **ما لا يحتاج تثبيتاً على جهاز الكاشير**: القارئُ كلوحة مفاتيح (يعمل اليوم) · `window.print` عبر تعريف الطابعة · الطابعاتُ الشبكية بواجهة HTTP (Epson ePOS / Star WebPRNT) — ومنذ Chrome 142 يكفي إذنُ «الشبكة المحلية» بلا شهادات ·
   والطابعاتُ السحابية (Star CloudPRNT / Epson Server Direct Print / Zebra Cloud Connect) — **لكنها تسقط عند انقطاع الإنترنت**، ونقطةُ البيع عندنا مبنيّةٌ لتعمل دون اتصال.
6. **العربية على الحرارية**: صفحاتُ الترميز العربية موجودة (PC720=32 · PC864=37 · WPC1256=50) لكن PC864 **أشكالٌ مُشكَّلةٌ سلفاً** — فالتشكيلُ وقلبُ الاتجاه على برنامجنا؛
   والطريقُ المتين رسمُ الإيصال صورةً (يدعمه SDK إبسون وستار من Canvas). وإبسون تَسِمُ `GS v 0` «متقادماً» وتوصي بـ`GS ( L`. وZebra تشكّل العربية داخل الطابعة (`^PA`، برنامجٌ ثابتٌ حديث).
7. **مدى عبر مرخَّص — أربعة نماذج**: مستقلٌّ بلا ربط · ECR محلّيٌّ غيرُ منشور (قرار `ق-٣٣٧`) · **ربطٌ سحابيٌّ منشورُ التوثيق** (NearPay: `RemotePos` وعمليات HTTP عبر وسيطٍ سحابي) يوافق شكلَ محوّلنا الخادميّ ·
   وSoftPOS على أندرويد (تطبيقٌ أصليّ). و«Tap to Pay on iPhone» **ليس متاحاً في السعودية** على قائمة Apple اليوم. وترخيصُ المزوّدين لم يُتحقَّق منه من ساما (صفحتها أعادت خطأ).
8. **قرارُ الجسر المحلي معروضٌ بخياراته في §G** — سبعةُ خيارات: أربعةٌ تحترم القاعدة (G0 المتصفّحُ وحده — برماديّةٍ في تعريف الطابعة ·
   G2 طابعاتُ الشبكة · G3 الطابعاتُ السحابية · G6 الدفعُ السحابيّ)، وواحدٌ يخالفها صراحةً (G4 الوكيلُ المثبَّت)، وG1 (واجهاتُ المتصفّح للأجهزة)
   يحترمها لأجهزة Serial/HID ويخالفها لطابعة USB على ويندوز، وG5 (جهازُ أندرويد مخصَّص بتطبيقنا) رماديٌّ يحتاج حكمك.
9. ⚠️ **حادثةٌ أثناء المسح**: فتحُ رابط PDF من GS1 في لوحة المتصفّح أظهر لك **نافذةَ حفظ ملف** — لم أُعِد المحاولة؛ يمكنك إلغاؤها.

---

## Part 1 — Did door ⑭ scan the hardware?

### 1.1 Every hardware sentence in `docs/domain-scan/14-نقاط-البيع-والورديات.md` (P1)

The file on `origin/main` is 129 lines / 14,217 bytes; it was **read in full** (so absences below are from a complete read,
not only from grep). It was itself measured on tree `607dabb` (2026-09-22) per its line 3. Exact lines, `L<n>: <text>`:

```
L1: # المسحُ الشامل — البابُ ⑭: نقاطُ البيع والورديات والأدراج (الكاشير · العتاد · المرتجع · العمل دون اتصال)
L18: | يجب ألّا يُصاب | `QZX_NO_SUCH_SYMBOL_1267` | `0` | **٠** ✅ |
L26: (`incidents`) · `integrations/payment-terminal.adapter.ts` · `cash-drawers/*` · `banks/network-settlements.service.ts` ·
L40: | م٥ | **تعميمُ ساما 46004436** (`docs/بحث-خدمات-الدفع.md`) | — | مسجَّل | جهازُ البطاقة عبر مرخَّص؛ **لا حقولَ بطاقة على صفحتنا** |
L43: **تعذُّرٌ معلَن**: لم تُقرأ مواصفةُ ESC/POS ولا معيارُ GS1 للباركود نصّاً؛ ولم يُقرأ نظامُ الأجهزة الطرفية لدى «المدفوعات السعودية».
L51: | S3 | **البيعُ**: بحثٌ بالباركود/الاسم · كمّياتٌ · خصمٌ على السطر · إجماليٌّ بالدالّة الواحدة · فاتورةٌ مبسّطة مختومة | م٢ · م٦ |
L52: | S4 | **الدفعُ المقسّم** (نقدٌ + بطاقة + …) وجهازُ البطاقة عبر مرخَّص | م٥ · م٦ |
L53: | S5 | **الإيصالُ المطبوع** (حراريّ ٨٠/٥٨ مم) بالبيانات الإلزامية ورمز QR | م٢ · م٣ |
L57: | S9 | **العتادُ**: طابعةٌ · درجٌ يُفتح · ماسحٌ · شاشةُ عميل — عبر متصفّحٍ أو وكيلٍ محلّيّ | م١ |
L77: | S4 | الدفعُ المقسّم والجهاز | `PosPaymentPartDto` · `TERMINAL_ADAPTERS` | ✅ | ✅ 🟨 | أجزاءُ دفعٍ متعدّدة؛ الجهازُ بمحوّل — **والمحوّلُ الوحيد تجريبيّ** (`MockTerminalAdapter`) محجوبٌ على الإنتاج |
L78: | S5 | الإيصالُ المطبوع | `.print-receipt` · `ZatcaQr` | ✅ | 🟨 | طباعةُ المتصفّح مقصورةٌ على الإيصال؛ **لا قالبَ حراريّ ٨٠/٥٨ مم** ولا طابعةَ مباشرة (`escpos` = ٠) |
L82: | S9 | العتاد | `escpos\|WebUSB\|cashDrawerKick` | **٠** | ⬜ | لا فتحَ درجٍ ولا طابعةَ مباشرة ولا شاشةَ عميل (`kiosk` = ٠) |
L109: | B1 | تقريرُ X/Z وقالبٌ حراريّ (S1 · S5) | قراءةٌ من الوردية القائمة + CSS طباعةٍ لعرض ٨٠ مم | أوّلُ تاجرِ تجزئة |
L110: | B2 | العتادُ (S9) | وكيلٌ محلّيّ أو WebUSB — `L4-5` | جهازٌ حقيقيّ عند تاجر |
L122: | C1 | جهازُ البطاقة | محوّلٌ تجريبيّ وحدَه؛ الحقيقيُّ بمفاتيح مزوّدٍ مرخَّص وخطابِ عدم ممانعة (ساما) | `payment-terminal.adapter.ts:36` · `بحث-خدمات-الدفع.md` |
L124: | C3 | الإيصال | طباعةُ متصفّح؛ بلا عرضٍ حراريّ | `index.css:925–933` |
```

Notes on reading them:
- L18 is a **negative probe symbol** (`QZX_…`), not a QZ Tray analysis. A `QZ…` control symbol appears in each of
  doors 01–24 (once each; twice in 04 — `git grep -c -F QZ`), so it carries no hardware content.
- The word «درج» in ⑭ outside L57/L82 (S2, L75) means the **accounting cash-drawer account** (`CashDrawer`, range
  `1010–1099`), not the physical drawer.
- The only place ⑭ discusses *how* hardware would be reached is the seven words of L57 («عبر متصفّحٍ أو وكيلٍ محلّيّ»)
  and L110 («وكيلٌ محلّيّ أو WebUSB»). No option analysis, no browser support, no driver issue, no Arabic, no mada model.

### 1.2 Coverage per device class (door ⑭ only)

| Device class (owner's list) | Where ⑭ mentions it | Probe ⑭ used | ⑭ verdict | Not covered by ⑭ |
|---|---|---|---|---|
| Thermal receipt printer 58/80 | L53 (S5), L57 (S9), L78, L109 (B1), L124 (C3) | `escpos` = 0 | 🟨 browser print only | connection method; ESC/POS; Arabic on thermal; QR on thermal; silent printing; paper width mechanics |
| Barcode scanner («القارئ») | L51 (S3 «بحثٌ بالباركود»), L57 («ماسحٌ») | none specific | S3 ✅ search; S9 ⬜ | keyboard-wedge behavior; OS keyboard layout; weighed (prefix 2x) codes; HID-POS/CDC modes |
| Cash drawer (physical) | L57 («درجٌ يُفتح»), L82 | `cashDrawerKick` = 0 | ⬜ | kick through printer (`ESC p`); USB/serial drawers |
| Weighing scale («الميزان») | **none** (0 occurrences of ميزان/scale/weigh in the full read) | — | — | everything |
| mada payment terminal | L40 (م٥), L52 (S4), L77, L122 (C1) | `TERMINAL_ADAPTERS` | ✅ 🟨 (adapter, mock only) | integration models (ECR / cloud / SoftPOS); provider docs; async flow; Saudi Payments terminal rules (L43: not read) |
| Label printer («طابعة الملصقات») | **none** (0 occurrences of ملصق/label in the full read) | — | — | everything |
| (customer display — in S9, not in owner's list) | L57, L82 (`kiosk` = 0) | `kiosk` = 0 | ⬜ | — |

Validated probe for the cross-door counts (docs/domain-scan/*, `git grep -c -F`, `LC_ALL=C.UTF-8`): positive controls
`طابعة` → 3 hits in ⑭, `ESC/POS` → 1 in ⑭; `ملصق` → **0 in every file** (27 files at `0d05b663`, 29 at `a036c477`);
`ميزان` → hits only in doors 01/06/08/10/20 (accounting: «ميزان المراجعة»), 0 in ⑭.

### 1.3 What other project documents already say about hardware (none of these is cited by ⑭)

| Document (origin/main) | Line(s) | Content (paraphrase unless quoted) |
|---|---|---|
| `docs/plans/retail-full-spec.md` §9.3 «الأجهزة» (P3) | L647–L659 | A priority table of exactly the owner's six + customer display: thermal printer (ESC/POS) **mandatory**; USB barcode reader **mandatory**; cash drawer **mandatory**; mada terminal **phase 2** («الربط الفعلي يحتاج اتفاقية مع المزود»); connected scale **ن١ · ن٥**; customer display optional; label printer «مهم للرفوف». L659: v20's payment-device screen is design-only; a real mada link needs the device vendor's SDK and a commercial agreement. |
| same, §9.2 | L639, L644–L645 | «مسح باركود (قارئ USB يعمل كلوحة مفاتيح + كاميرا للجوال)»; print/send receipt (thermal · WhatsApp · email); open drawer · reprint · cashier copy. |
| same, §6.3 | L114, L532–L542, L549 | Weighed barcode prefix `2` carrying item code + weight or price; «**متطلب:** محرّر قوالب باركود موزون في الإعدادات — لا قالب واحد مشفَّر»; weighed items = decimal quantity (3 places). |
| same, risks | L825, L934 | ح١١ scale down → manual weight entry with a permission; خ٧ «عتاد نقاط البيع (طابعة/درج) يختلف بين العملاء» → «طبقة تجريد ESC/POS + قائمة أجهزة مدعومة معلنة». |
| `SPEC.md` (P4) | L630 (27.1) | row ends with «يبقى خارج النطاق: المرتجعات · العتاد». |
| `SPEC.md` | L531 (19.5), L187 (8.13), L659 (28.8) | 19.5 barcode 🟨 «توليد/طباعة باركود فقط، لا مسح بالكاميرا»; 8.13 GS1 link ⬜; 28.8 GS1 Saudi (prefix 628) ⬜. |
| `docs/engines.md` (P5) | L156, L157, L159 | `L4-2` multi-standard barcode scanning; `L4-3` offline POS; `L4-5` «طبقة تكامل الأجهزة الفيزيائية». |
| `docs/plans/unified-build-plan.md` (P5) | L209, L210, L212 | L4-5 = ATG · forecourt controller · **scales** · analyzers — «مسارها الحرج ليس الكود بل تأمين عتاد تجريبي». |
| scan door ⑲ (printed documents) | L47, L66, L94, L106 | thermal receipt 80/58 is its S2; probe `80mm\|58mm\|thermal` = 0; deferred to ⑭ B1. |
| scan door ㉑ (government integrations) | L61, L84 | GS1 prefix 628; probe `GTIN\|GS1` = 0. |
| scan `00-ب` (broken today) | L38 | «إيصالٌ بلا حراريّ» listed as declared-absent. |
| `docs/بحث-خدمات-الدفع.md` (payment research, 278 lines) | — | **0 hits** for `ECR`, `SoftPOS`, `جهاز`, `نقاط البيع` (positive controls in the same run: `PCI` = 6, `مدى` = 1) — terminal research lives only in decisions `ق-٣١٣…ق-٣٣٧`. |

### 1.4 What exists in code today — validated greps on `origin/main` (`apps/web/src`, `apps/api/src`)

Probe validation first: positive control `print-receipt` → **8 lines / 3 files**; negative control
`QZX_NO_SUCH_SYMBOL_260` → **0**. Second batch (`git grep -P`) re-ran the same positive control → 8 lines.

| Pattern (case-insensitive) | Lines | Files | What the hits are | Two examples |
|---|---|---|---|---|
| `print-receipt` (control) | 8 | 3 | receipt print scoping | `index.css:933` `.print-receipt,` · `PosPage.tsx:559` `className="print-receipt"` |
| `window\.print` | 3 | 2 | receipt print buttons | `PosPage.tsx:543` · `PosPage.tsx:631` |
| `barcode` | 16 | 7 | product barcode field + search | `products/products.service.ts:13` `PRODUCT_SEARCH_FIELDS` · `pages/pos/PosPage.tsx:125` filter `includes(q)` |
| `cashDrawer` | 90 | 18 | **all** = accounting drawer entity/module — no hardware | `app.module.ts:37` import `CashDrawersModule` · `banks/cash-deposits.service.ts:68` `tx.cashDrawer.findUnique` |
| `scale` | 42 | 13 | **all** = money-rounding `SCALE`, "at scale" comments, CSS `--font-scale` — no weighing | `common/money/rounding.ts:32` · `pages/units/ReservationModal.tsx:54` |
| `weigh` | 94 (→ 100 at `a036c477`) | 14 (→ 15) | **all** = `weightedAverageCost`, landed-cost / VAT allocation weights, CSS `font-weight`/`fontWeight` — no weighing | `inventory/costing.util.ts:477` · `purchases/landed-costs.service.ts:113` |
| `TerminalAdapter\|TERMINAL_ADAPTERS` | 10 | 3 | payment adapter registry | `integrations/integrations.service.ts:11` · `:139` |
| `onKeyDown\|keydown` | 1 | 1 | scanner Enter handling | `PosPage.tsx:381` `e.key === 'Enter' && handleSearchEnter()` |
| `escpos` · `webusb` · `navigator\.usb` · `navigator\.serial` · `navigator\.hid` · `bluetooth` · `drawer kick` · `kiosk` · `zpl` · `label print` | **0 each** | 0 | — | — |
| `requestDevice\|requestPort\|SerialPort\|USBDevice\|HIDDevice` · `qz-tray\|qztray\|\bqz\.` · `printnode` · `webprnt\|cloudprnt\|starprnt` · `epos-?print\|epos2\|eposdevice\|epson` · `zebra\|browserprint` · `@page` · `80mm\|58mm` · `customer.?display\|second.?screen` | **0 each** | 0 | — | — |

Also read directly:
- `apps/web/src/index.css:929–956` — `@media print` hides everything except `.print-receipt`, positions it at the top,
  `width: 100%`; **no `@page` size, no 80/58 mm width** (so paper width is left to the printer driver).
- `docker/web-nginx.conf` — only `add_header Cache-Control` (L11, L30); **no `Permissions-Policy`** that would block
  `usb`/`serial`/`hid` (validated: the probe found the `add_header` lines). The production Caddy config is not in the repo.
- `apps/api/src/integrations/payment-terminal.adapter.ts` — contract `charge(credentials, request)` "starts the operation on
  the device/gateway and waits for the result" (L26–29); `MockTerminalAdapter` approves unless halalas end in 13 (L36–45);
  registry `TERMINAL_ADAPTERS = { MOCK }` (L48–50). `integrations.service.ts` — `KNOWN_PROVIDERS` all `['MOCK']` (L13–17),
  `TEST_ONLY_PROVIDERS` (L31), production guard at create (L76–77) and at charge (L135–136), credentials decrypted only
  inside `chargeCardIfConfigured` (L141–142).

### 1.5 What is already decided about the payment terminal (P2, `docs/decisions.md` on origin/main)

- **`ق-٣١٣` ✅ (L687)** — owner decisions: ① the amount is sent from the system to the network terminal and returns with its
  result — «فلا فاتورة بلا دفعة ولا دفعة بلا فاتورة»; ② split payment is a three-party entry: `1251` card share · shift drawer
  cash share · against `1200`; ③ «الربطُ ميزةٌ اختيارية لا إجبار» — whoever does not connect works as today; ④ one layer for all:
  a unified interface with one adapter per acquirer; the cashier knows "send amount, wait for result", not which bank;
  ⑤ licensing does not block building (§3.7). Rejected alternatives: single provider; mandatory integration. Status column: «مع الجلسة الميدانية».
- **`ق-٣١٤` 🔬 (L688)** — a three-part regulatory research before any integration: do Saudi acquirers publish terminal APIs
  and on what terms; is "POS sends an amount to the merchant's terminal" a SAMA-licensed activity (by text); what PCI DSS
  requires of whoever passes the amount. Gaps are declared, never filled by guessing.
- **`ق-٣١٥` ⏸️ (L689)** — payment-cycle detail waits for a field session. Open questions verbatim: «من يبدأ الدفع؟ · وماذا لو
  انقطع الردُّ والدفعةُ نجحت في البنك؟ · ومن يستعلم؟ · وماذا لو رُدَّت الدفعة — أيُلغى البيع؟».
- **`ق-٣٢٠` ✅ (L694)** — `CARD` added to payment methods as «شبكة», posted to `1251` only.
- **`ق-٣٣٧` 🔬 (L720)** — results of ق-٣١٤: ① integration exists but is not published — acquirers run a local `ECR` service that
  POS software talks to, their public gateways document only e-payment; the document is obtained by agreement, its terms are
  a declared gap. ② SAMA: the exemption applies (Art. 6 lists twelve licensed activities incl. initiating a payment; Art. 7(9)
  exempts technical service providers that never hold or control the beneficiary's funds) — read from the English summary,
  not the official Arabic, so no compliance claim yet. ③ PCI: the card-data environment scope does not change with an approved
  device; any interaction of the terminal with the merchant environment is in scope ⇒ integration pulls **the merchant** into
  compliance scope; approved wording: a compliance obligation on the merchant, shown with its limit, not sold as convenience.
  Not built before three: reading the Arabic text · settling the vendor's obligation under the PCI Secure Software Standard
  (declared gap) · the field session. Status: «معلَّق بثلاثة شروط».

### 1.6 Three code-reading findings door ⑭ did not record (read, **not executed**)

**F1 — The cashier UI never reaches the terminal adapter.**
`PosPage.tsx:168–169` states every sale (online or offline) takes one path (sync) → `PosPage.tsx:181` `syncPosSale(sale)` →
`apps/web/src/api/pos.ts:85–86` `POST /pos/sales/sync` → `pos.controller.ts:55–58` → `pos.service.ts:298–310` `syncSale`
calls `ring(..., { viaSync: true })` → `pos.service.ts:523` `if (cardAmount > 0 && !opts.viaSync)` **skips**
`chargeCardIfConfigured`. The server comment at `pos.service.ts:307–308` assumes "the gateway is consulted only in the live
sale", but the live path `POST /pos/sales` (`pos.controller.ts:61` → `createSale`, `pos.service.ts:287–289`) is reached only
by `createPosSale` (`apps/web/src/api/pos.ts:73`), which has **zero call sites** in `apps/web/src` (validated: the same
probe finds `syncPosSale` at `PosPage.tsx:98` and `:181`). ⇒ Today a «شبكة» sale from the UI records a card payment with no
device interaction. Harmless while no real adapter exists; but ق-٣١٣ ① («لا فاتورة بلا دفعة») cannot hold on this path, and any
terminal integration must first choose the flow. Proof would be a failing test (UI-path CARD sale with a MOCK connection in a
non-production env, asserting the adapter was called) — not run (read-only scan).

**F2 — The charge is awaited inside the tenant DB transaction.**
`pos.service.ts:431` opens `runInTenantContext(...)` with no options (closes at L550); L524 awaits
`chargeCardIfConfigured(tx, …)` inside it; that awaits `adapter.charge(...)` whose contract is "start on the device and wait
for the result". The project runs Prisma 5.22 (`apps/api/package.json:38`) and has already hit
"Transaction already closed … 5000 ms" on this helper (CLAUDE.md record, L3515). A card-present flow (tap/insert, PIN) is
human-paced; waiting for it inside the transaction both risks the timeout and holds a DB transaction open on a third party.
This is the technical face of ق-٣١٥'s open questions (who initiates, lost response, who queries, reversal).

**F3 — Keyboard-wedge scanning already works in principle, with three caveats.**
Search input has `autoFocus` (L377) and Enter → `handleSearchEnter` (L381, L155–162), which adds the product **only when exactly
one product matches**. Caveats: (a) matching is a substring over name/SKU/barcode (L125) with no exact-barcode priority, so a
code that is also a substring elsewhere yields >1 match and nothing is added; (b) GS1 variable-measure codes (prefix 20–29,
weight/price embedded) never equal a stored barcode and are not parsed; (c) what a HID-keyboard scanner "types" depends on the
OS keyboard layout (Zebra documents per-country keyboard types and a keypad-emulation fallback, W36) — untested with an
Arabic layout.

### 1.7 Verdict for Part 1

**One line only (partial).** Door ⑭ names hardware in a single scope row (S9, L57), one absence row (L82) and one deferral (B2,
L110). Four of the six classes appear by name only (printer, reader, drawer, card terminal); **the scale and the label printer
are absent**; the card terminal is covered as adapter status + licensing constraint, not as integration models. No analysis of
browser-to-device methods, the local-bridge question, Arabic on thermal, or mada integration exists, and ⑭ itself declares
ESC/POS, GS1 and the Saudi Payments terminal system unread (L43). ⇒ Per the owner's instruction, the hardware door is scanned
in full below.

---

## Part 2 — The hardware door from primary sources

### 2.0 The six device classes at a glance

(Interface prevalence *in Saudi retail specifically* was not measured — no market source read; the lists below are what the
vendor documents describe. See Limits.)

| Device | Interfaces described by vendors | Command language / protocol | Ways a browser web app can reach it |
|---|---|---|---|
| Thermal receipt printer 58/80 mm | USB, Ethernet/LAN, Wi-Fi, Bluetooth, serial (Epson SDK page lists Wi-Fi/Ethernet/Bluetooth/USB for its native SDKs, W16); built-in on Android POS (W37) | ESC/POS (Epson; W18–W21); Star: native StarPRNT/Star Line (named by the owner — not read) + Star Document Markup for CloudPRNT (W24–W25) | A6 `window.print` · A3 WebUSB · A4 Web Serial · A5 Web Bluetooth (BLE only) · A7 vendor LAN HTTP · A8 cloud-pull · A9 local agent · A10 Android POS |
| Barcode reader | USB (default HID keyboard; also HID POS, USB CDC virtual COM, IBM/OPOS, SNAPI), Bluetooth HID keyboard (W34–W35); built-in on Android POS (W38) | none in keyboard mode; HID POS reports; vendor SNAPI/SSI | A1 keyboard wedge · A2 WebHID (HID POS mode) · A4 Web Serial (CDC mode) · A10 Android SDK |
| Cash drawer | printer-driven via RJ cable from the receipt printer; USB (HID-compliant interface); serial (W48) | `ESC p` pulse from the printer (W19) | whatever reaches the printer (C) · A2 WebHID for USB-HID drawers (untested) · A4 for serial drawers |
| Weighing scale | RS-232 or USB virtual COM (MT quick guide, ✘); label-printing scales print barcodes | vendor serial protocols (Toledo/8217, Dialog-06, CAS ECR types — ✘ search only); printed labels use GS1 restricted-circulation prefixes 020–029, whose use is defined by the national GS1 office (W44; the variable-measure use is stated only in a GS1 search result ✘) | scanner reads the printed label (no scale link) · A4 Web Serial (live weight) · A10 Android scale SDK · A9 local agent |
| mada terminal | acquirer-owned device: standalone; ECR via acquirer local service (non-public, ق-٣٣٧); cloud-paired (W54–W55); SoftPOS on Android (W52) | provider APIs; ECR protocols not public | server→provider cloud (fits current adapter) · browser→local ECR service on localhost (A7 permission applies) · native SDK |
| Label printer | USB, Ethernet, Bluetooth, Wi-Fi | ZPL (Zebra, W33); EPL (older Zebra, not read); TSPL/TSPL2 (TSC, ✘) | A6 OS driver + print · Zebra Browser Print (install, W31) · Zebra Cloud Connect (W32) · A3/A4 raw · A9 agent |

### A. Browser-to-device connection methods

Browser support below is from MDN **browser-compat-data** JSON (the data behind MDN's tables), read 2026-09-24
(W4, W6, W10, W12). "Edge" mirrors Chrome in all four files.

| API | Chrome desktop | Edge | Chrome Android | Firefox | Safari / iOS | Android WebView |
|---|---|---|---|---|---|---|
| WebUSB | 61 | yes | yes | no | no | **no** (exposes the interface but does not support WebUSB) |
| Web Serial | 89 | yes | **148** (138–147: Bluetooth-RFCOMM serial only) | **151** desktop, via a generated site-permission add-on (W7) | no | **no** |
| WebHID | 89 | yes | **no** | no | no | no |
| Web Bluetooth | 70 (partial; Linux off by default) | yes | 56 | no | no | no |

#### A1. Keyboard-wedge scanners (no API)
- **What:** the scanner enumerates as a USB or Bluetooth HID keyboard and "types" the code followed by Enter. Zebra's USB
  device-type table marks *USB HID Keyboard* as the default (W34); Bluetooth models offer a keyboard-emulation host type for
  PCs/tablets/phones (W35).
- **Support:** every browser and OS, including iPad — it is ordinary keyboard input.
- **Requirements/blockers:** the input must have focus; the result depends on the OS keyboard layout — Zebra provides country
  keyboard types and says to use keypad emulation when a layout is not listed (W36); no device identity (cannot tell scan from
  typing except by timing).
- **Serves:** reader only. **Already used** by `PosPage.tsx` (F3).

#### A2. WebHID
- **What:** raw HID input/output reports from non-keyboard HID devices.
- **Support:** Chromium desktop only (table). (Chrome's page as fetched did not state the prompt/secure-context rules — not
  claimed here; see Limits.)
- **Blockers:** Chrome blocks reports in top-level collections with protected usages such as generic keyboard/mouse, and blocks
  FIDO security keys (W9) ⇒ a scanner in keyboard mode is **not** readable via WebHID; it must be switched to a HID-POS mode
  (Zebra lists *USB HID POS* and marks it as limited to Windows 10 devices, W34). Whether WebHID can open that mode is untested.
- **Serves:** readers in HID-POS mode; HID-compliant USB drawer interfaces (APG 554B exists, W48 — untested with WebHID).

#### A3. WebUSB
- **What:** raw USB transfers after claiming an interface.
- **Support:** Chrome/Edge desktop, Chrome Android; not Firefox/Safari/iOS/WebView (table). Secure context only (W1);
  `requestDevice()` only from a user gesture (W2).
- **Protected classes:** the spec forbids Audio, HID, Mass Storage, Hub, Smart Card, Video, Audio/Video and Wireless Controller
  interfaces; **Printer (0x07) is not protected** (W3, spec status CG-DRAFT).
- **Windows blocker:** Chrome's guide says Windows needs either Microsoft OS 2.0 descriptors in the device (Windows 8.1+) or a
  manually installed INF (W2); Microsoft defines a "WinUSB device" as one whose firmware reports `WINUSB` as its compatible ID
  (W50). Commodity receipt printers ship with a printer-class/vendor driver, so claiming fails until the driver is replaced —
  the usual tool is Zadig, a Windows program that swaps a device's driver for a generic one such as WinUSB (W51). Replacing the driver is a program + driver
  install on the cashier PC, and (inference, not sourced) takes the printer away from normal OS printing.
- **Linux:** needs a udev rule (W2). **Android:** supported by Chrome (table); behavior with USB printers untested.
- **Serves:** USB receipt/label printers (after the driver wall), some readers/scales in vendor modes.

#### A4. Web Serial
- **What:** serial ports, including USB-serial adapters and Bluetooth serial emulation (W5, W8).
- **Support:** table above. Secure context; Permissions-Policy directive `serial`; `requestPort()` needs user activation (W8).
  Chrome's own guide still says Android serial is possible via WebUSB + a polyfill (W5) — older than BCD's native 148 entry.
- **Driver:** CDC-ACM devices load Windows' in-box `Usbser.sys` automatically (W49); other USB-serial chips need their vendor
  drivers (not verified).
- **Serves:** scales (live weight), serial/virtual-COM receipt printers (raw ESC/POS incl. drawer kick), serial drawers,
  readers in USB-CDC mode (Zebra lists *USB CDC Host*, W34), serial label printers.

#### A5. Web Bluetooth
- **What:** BLE GATT (GATT may also run over BR/EDR) — the spec is GATT-only, no RFCOMM/SPP (W11, CG-DRAFT).
- **Support:** table above.
- **Blocker:** Bluetooth receipt printers and scanners that use classic SPP/HID are not reachable; only models exposing a BLE GATT
  write characteristic could be (model-specific, not verified). Bluetooth scanners should be used as keyboards (A1).

#### A6. `window.print()` through the OS driver (+ silent printing)
- **What:** the browser renders the page (so Arabic shaping and the QR image are done by the browser engine) and hands it to the
  OS print queue; the method opens the print dialog and blocks while it is open (W13).
- **Support:** all browsers. **Requirement:** an OS print queue/driver for the printer.
- **Silent printing:** Chromium's `--kiosk-printing` launch flag auto-presses print (Chromium bug 169004 reports a ~1 s dialog
  flash, W14). Microsoft's Edge kiosk-mode page lists other flags (`--kiosk`, `--edge-kiosk-type`, `--no-first-run`,
  `--kiosk-idle-timeout-minutes`) but not this one (W15 — page read in full; absence only for that page).
- **Blockers:** a dialog per print unless the flag is set; no printer status or error feedback; drawer opening only through a
  driver option (Epson APD6 has a "Peripherals" tab for the drawer — ✘ search result only, W65); paper width via driver or CSS
  `@page` (the repo has no `@page` today, §1.4).
- **Serves:** receipts, labels (through label-printer drivers), drawer (driver option). Works offline.

#### A7. Printer-vendor HTTP APIs on the LAN (Epson ePOS SDK for JavaScript · Star WebPRNT)
- **Epson:** a JavaScript library for HTML5 web apps that prints directly to ePOS-Print-capable TM printers from PC/tablet/phone
  browsers, can print images rendered in an HTML5 Canvas, and needs no printer driver on each device (W16).
- **Star WebPRNT:** browser → printer over HTTP; the app must know the printer's IP and be on the same LAN (W22). For HTTPS the
  manual says certificates must be set on the printer **and** in the browser; sites without HTTPS cannot print from some browsers
  (W23). Models: mC-Print2/3, TSP654II, TSP743II, TSP847II, SP742 (W22).
- **Mixed content from our HTTPS SaaS page:** Chrome 142 gates requests from a public site to local IPs/loopback behind a
  permission prompt (W27; opt-in testing began in 138, W26). The prompt is secure-context only, and after it is granted
  "the permission-gated local network requests will now be exempted from mixed content checks" (W26) — when the host is a private
  IP literal, a `.local` name, or `fetch()` carries `targetAddressSpace: "local"`. Chrome says an enterprise policy to pre-grant/deny
  is coming (W26, name not given). Safari/Firefox mixed-content behavior toward LAN printers: not re-read (limit).
- **Serves:** receipt printer + printer-driven drawer (Star has a peripheral element in its builder, W23). Works offline on the LAN.
- **Merchant must:** buy an ePOS/WebPRNT-capable network printer, give it a fixed IP, grant the one-time Chrome prompt.

#### A8. Cloud-pull printing (printer polls our server)
- **Star CloudPRNT:** the printer connects to a server application and issues REST/JSON HTTP requests; MQTT-variant printers
  have lower latency; supports Star Document Markup (W24). Unlike WebPRNT, no SSL certificate management on the printer (W22).
  Models: mC-Print3, mC-Print2, TSP654II, SP742, TSP743II, TSP847II (W22). Default poll interval 5 s: ✘ search only (W69).
- **Epson Server Direct Print:** a TM-intelligent printer periodically sends an HTTP request to the web server (example: every
  60 s), receives ePOS-Print XML, and can forward jobs to other LAN TM printers (W17).
- **Zebra Cloud Connect (Weblink)** for labels: firmware feature using WebSocket and HTTPS, no intermediate systems or software,
  on all Link-OS printers except Link-OS Basic (W32). A Zebra-signed server certificate requirement: ✘ search only (W67).
- **Merchant must:** buy a supported model and enter our server URL in the printer's web config once. **Nothing installed on the
  cashier device; any client works (iPad included).**
- **Blockers:** needs internet at print time — **conflicts with the platform's offline POS** (`S7`, offline receipts with QR built
  on the device); latency = poll interval unless MQTT; our server must authenticate printers and map each to a tenant.

#### A9. Local bridge agents (QZ Tray · PrintNode · Zebra Browser Print · a custom agent)
- **QZ Tray:** a cross-browser, cross-platform program installed on Windows/macOS/Linux, reached over a websocket; raw ESC/POS,
  ZPL, EPL, plus HTML/PDF/image printing, serial and USB devices (W28). Silent printing (no pop-ups) requires signing every
  message with a certificate/private key; QZ issues these to paid support tiers, renewed every 1–5 years (W29).
- **PrintNode:** a hosted remote-printing service; the PrintNode Client is installed on computers attached to printers; jobs are
  sent by API; PDF and raw (W30).
- **Zebra Browser Print:** scripts + an end-user application; Windows 7/10 and macOS; IE11/Chrome/Safari; USB and network;
  obtained on request (W31). Android network/Bluetooth support: ✘ search only.
- **Custom agent (Electron/Go):** no source — a design option.
- **All require an install per cashier machine.** A public site talking to `localhost` also triggers Chrome 142's local-network
  prompt (loopback is in scope, W26/W27).
- **Serves:** all six (printer raw or driver, drawer, scale/reader over serial, label raw ZPL/TSPL, and a card terminal if an
  acquirer ECR protocol is obtained).

#### A10. Android POS devices with built-in hardware (SUNMI read; PAX/Landi not read)
- **SUNMI:** inbuilt 58/80 mm thermal printers, cutter, cash drawer and customer display on some models; third-party apps connect
  via a remote dependency library, a Bluetooth device named "InnerPrinter", or AIDL (W37). The developer docs have sections for
  printer, scanning, customer display, **electronic scale**, card reader, cash drawer and a payment SDK (W38, navigation). A demo
  page shows a JS SDK controlling SUNMI printing (W39; mechanism not stated). "JS bridge" as a connection mode: ✘ (old page 404).
- **Running our web app there:** Android WebView lacks WebUSB/Serial/HID/Bluetooth (table) ⇒ device access needs a bridge
  (`addJavascriptInterface`) in a platform-built wrapper app; Android warns this lets JavaScript control the app and must only be
  used for HTML/JS we wrote (W40). A Trusted Web Activity opens a PWA through Custom Tabs (Chrome runtime, W41) — Chrome's device
  APIs then apply, but vendor AIDL services still need native code (inference).
- **Merchant must:** buy the specific device and install the platform's app (or get it pre-provisioned).

### B. Arabic on thermal printers (+ the ZATCA QR)

- **Code pages exist:** Epson `ESC t n` selects PC720 Arabic (n = 32), PC864 Arabic (37), PC1098 Farsi (41), WPC1256 Arabic (50);
  the valid range differs by printer model (W18).
- **But PC864 is pre-shaped:** Unicode's CP864 mapping sends its Arabic bytes to *Arabic Presentation Forms-B* (U+FE70–FEFF:
  isolated/final/initial/medial; 57 "FORM" entries), whereas CP1256 maps to base letters U+0621–064A (W42, W43). ⇒ With PC864 our
  code must pick each letter's contextual form (incl. lam-alef) and emit bytes in visual (right-to-left reversed) order. With 1256
  the printer itself would have to shape — no document read says any given model does (limit).
- **Raster is the robust path:** render the receipt as an image in the browser (correct shaping for free) and send bitmaps —
  Epson's JS SDK prints Canvas images (W16) and Star WebPRNT has a canvas/bit-image element (W23). In raw ESC/POS, Epson now marks
  `GS v 0` (print raster bit image) **obsolete** — supported by only some models, not by future ones — and recommends its graphics
  functions instead: `GS ( L` fn 50 and `GS ( L / GS 8 L` fn 112 (W20; those two pages not read). Clone printers: not verified.
- **Star Document Markup** is Unicode-based and the renderer converts for devices with native Unicode; the word "Arabic" does not
  appear in its specification page (validated: "Unicode" found on the same page) (W25) ⇒ Arabic support there is unverified.
- **Zebra labels shape in firmware:** ZPL `^PA` turns on bidirectional layout, character shaping and OpenType support, on firmware
  V60.14.x / V50.14.x or later (W33).
- **`window.print` path:** shaping is done by the browser's text engine and the driver rasterizes, so code pages never arise
  (reasoning from how the path works; no vendor source).
- **ZATCA QR on thermal:** native `GS ( k` fn 180 stores QR symbol data (numeric, alphanumeric, Kanji or 8-bit byte) in the
  symbol storage area, which functions 181/182 then act on (W21; 181/182 pages not read) — or draw the QR as part of the raster image. Not measured here: the phase-2 QR payload length vs. each printer's QR capacity,
  and ZATCA's minimum printed QR size (limit). Existing code builds the offline receipt QR on the device (`PosPage.tsx:208`).

### C. Cash drawer

- **Kick pulse through the printer:** `ESC p m t1 t2` outputs a pulse to drawer-kick connector pin 2 (m = 0/48) or pin 5
  (m = 1/49); ON = t1 × 2 ms, OFF = t2 × 2 ms; the two pins cannot be pulsed together (W19).
- **Printer-driven drawers have no driver** — they are connected to and controlled by the receipt printer or POS terminal (APG,
  W48). ⇒ **The drawer path = the printer path**: raw ESC/POS (A3/A4/A9), vendor LAN API peripheral commands (A7), cloud job
  (A8), or a driver option in the `window.print` path (A6, ✘ APD).
- **USB/serial drawers exist:** APG sells an HID-compliant USB interface (554B, OPOS/UPOS) and serial interfaces (W48); reachable
  in principle through WebHID/Web Serial — untested.
- **Android POS:** SUNMI exposes drawer-control APIs on models that have a drawer port (W37–W38).

### D. Weighing scale

- **Two different needs:**
  1. **Pre-packed / deli goods** — a label-printing scale prints a barcode carrying price or weight. GS1's prefix table reserves
     020–029 for restricted circulation numbers within a geographic region, defined by the national GS1 office, and lists 628 =
     GS1 Saudi Arabia (W44). That these prefixes carry variable-measure items is stated in a GS1 document seen only as a search
     result (✘). The digit structure is therefore GS1 Saudi Arabia's to define — **not read** (its site returned 403). The project's retail
     plan already requires a configurable template editor (`retail-full-spec.md` L535–L542). **Needs only the reader + parsing —
     no live scale link, no bridge.**
  2. **Live weighing at checkout** — a checkout scale sends weight to the POS over RS-232 or USB virtual COM; Mettler Toledo's
     quick guides name the Toledo/8217 and Dialog-06 protocols and CAS documents ECR "types" at 9600 7-E-1 (both ✘ search only,
     W46–W47). MT's product page only says the Ariva-S connects to most POS systems (W45). Browser reach: A4 Web Serial
     (Chromium), A10 SUNMI scale SDK, or A9 agent.
- **Not researched:** whether Saudi legal metrology (SASO) regulates the scale–POS link (MT describes Dialog-06 as mainly for the
  European market — ✘ search only) — limit.

### E. Label printers

- **Languages:** ZPL (Zebra; W33 is a ZPL command page); EPL (older Zebra; not read); TSPL/TSPL2 (TSC; ✘ search only, W66).
- **Browser paths:** OS driver + print (A6; Zebra's Windows driver page not read); Zebra Browser Print (install, W31); Zebra Cloud
  Connect (printer → our server, W32); raw ZPL through WebUSB/Web Serial (A3/A4 caveats) or a local agent (QZ raw ZPL, W28).
- **Arabic on labels:** ZPL `^PA` shaping/bidi on recent firmware (W33); raster otherwise.
- **Business rule already in the plan:** shelf price includes VAT (`retail-full-spec.md` L591).

### F. mada payment terminal through a licensed provider

**What the project already fixed** is in §1.5 (ق-٣١٣ design, ق-٣١٥ open cycle questions, ق-٣٣٧ compliance and gaps) and the owner's
payment constraints in CLAUDE.md 💳 (no card fields on our pages; merchant onboarding stays with the licensed party; the NOC letter
if the arrangement is an agency). Integration models found in sources read today:

| Model | What it is | Public documentation found (2026-09-24) | Fit with our code | SaaS rule |
|---|---|---|---|---|
| **M1 Standalone** | cashier keys the amount on the acquirer's terminal; POS records «شبكة» | n/a | this is effectively today's behavior (F1) | respects |
| **M2 Local ECR** | POS ↔ terminal over LAN/USB/serial through an acquirer local service/protocol | per ق-٣٣٧ ① not published. Checked overview pages: **Geidea** developer docs list only online products — Checkout, Pay by Link, Direct API (W56); **Moyasar** docs: card/Apple Pay/STC Pay/Google Pay, SDKs, plugins, APIs — no in-person (W57); **Tap** developers home: API reference, guides, payment methods — no in-person (W58). HyperPay and Surepay: nothing found in search (✘). Third-party (non-primary, not relied upon) Odoo listings describe a Geidea "Web ECR" service on `localhost:5000`, Windows only (W68 ✘) | a browser call to `localhost` needs Chrome's local-network prompt (A7) and the acquirer's program on the cashier PC | **violates** unless the acquirer installs and owns its program (owner decision) |
| **M3 Cloud remote terminal** | our server (or web page) sends the request to the provider's cloud, which drives a paired terminal | **NearPay** documents a Web SDK that connects a web application to the POS device in two ways, `RemotePos` (cloud, pairing code) and `USBPos` (direct USB) (W54), and HTTP "Remote Operations" through a cloud proxy authenticated by a JWT signed with the POS's private key — purchase, refund, reverse, cancel (W55) | matches the existing server-side adapter shape (per-tenant encrypted credentials, server calls provider) — but needs an async flow (F2) and answers to ق-٣١٥ | respects |
| **M4 SoftPOS on the same device** | tap-to-pay inside an Android app | NearPay Tap-to-Pay SDK for Android 9+ (W52); TerminalSDK for Android, iOS, React Native (W53); PCI **MPoC** covers PIN + contactless on COTS devices (W60). **Tap to Pay on iPhone: Saudi Arabia is not in Apple's regions list** (W59 — validated: US/UK present, list runs Romania → Singapore) | requires a native app (A10) | gray (app install) |
| **M5 All-in-one Android POS** | device with printer/scanner/drawer and a card reader + payment SDK | SUNMI lists "Payment SDK Development" and "Card Reader Development" (W38); per-device acquirer certification not read | native wrapper (A10) | gray |

- **Licensing verification:** SAMA's licensed-companies page returned an error page to both WebFetch and a real browser (W61 ✘);
  NearPay's homepage shows mada and PCI logos but no licensing text (W70); press items saying Geidea/NearPay are licensed were seen
  only in search results (✘). ⇒ provider licensing must be read from SAMA's own list before any contract.
- **Saudi Payments (mada) terminal / SoftPOS certification rules:** not read (same gap ⑭ declared at L43). SNB and stc SoftPOS pages
  could not be read (TLS error / page hung, W62–W63).

### G. The local-bridge decision — presented as options, not a recommendation

The owner's rule (CLAUDE.md §1): the merchant is never asked to run a server, install a program, hire a developer, or run any
infrastructure. Each option below states what it forces on the merchant and what cannot be undone later.

| # | Option | Merchant must | Serves (of the six) | Browser / OS limits | Security / certificates | Platform support burden | Hard to undo later | SaaS rule |
|---|---|---|---|---|---|---|---|---|
| **G0** | **Browser-native only**: `window.print` + keyboard-wedge reader + printer-driven drawer via driver option + label scale barcodes + standalone terminal | plug devices; OS printer driver/queue (standard peripheral setup — vendor driver packages may be needed); optional `--kiosk-printing` shortcut for silent print | printer ✔ (driver) · reader ✔ · drawer ◐ only via a driver option (✘ W65) · scale ✔ pre-packed only · labels ✔ via driver · terminal ✗ (M1) | all browsers; iPad only with AirPrint-capable printers (not verified per model) | none | low code; recurring "print dialog / paper size" support | nothing | **respects** (gray only if a vendor driver package counts as "a program") |
| **G1** | **Browser device APIs** (WebUSB · Web Serial · WebHID · Web Bluetooth) sending raw ESC/POS/ZPL from our page | Chrome/Edge desktop (or Chrome Android 138/148+ for Serial); one permission prompt per device; **on Windows, a WinUSB driver swap for USB-class printers** | printer ✔ (serial/CDC; USB after swap) · drawer ✔ via printer · scale ✔ live (Serial) · reader ✔ (CDC via Serial; HID-POS via WebHID untested; or A1) · labels ✔ raw · terminal ✗ | Chromium only; no Safari/iOS; no WebView; Firefox Serial only via add-on | secure context + user gesture; permissions per origin | high: ESC/POS encoder, Arabic raster, QR, per-model quirks, a device test matrix | cashier locked to Chromium desktop; merchants who bought USB-only printers hit the Windows driver wall | **respects for serial/CDC/HID devices; violates for USB printers on Windows** |
| **G2** | **LAN printers with vendor HTTP API** (Epson ePOS / Star WebPRNT) | buy an ePOS/WebPRNT network printer; fixed IP; grant Chrome's local-network prompt once (Chrome 142+) — other browsers: certificates on printer and browser | printer ✔ · drawer ✔ via printer · (customer display on Epson TM-i — not verified) · scale ✗ · reader ✗ (A1 instead) · labels ✗ · terminal ✗ | Chromium path described by W26/W27 (not tested with these SDKs); Safari/Firefox not re-read | none with LNA; else self-signed certs to install | medium: two vendor SDKs behind one abstraction; Arabic via canvas raster | brand/model lock (sunk hardware cost) | **respects** |
| **G3** | **Cloud-pull printers** (Star CloudPRNT · Epson Server Direct Print · Zebra Cloud Connect) | buy a supported model; enter our server URL in the printer once | printer ✔ · drawer ✔ via printer · labels ✔ (Zebra) · scale ✗ · reader ✗ (A1) · terminal ✗ | any client device incl. iPad | printers authenticate to our server; tenant mapping; Zebra-signed cert (✘) | medium-high: job queues per printer, polling/MQTT endpoints, server-side rendering | our endpoints become a public contract called by printers in the field; brand lock | **respects** — but **fails offline**, against the offline POS design |
| **G4** | **Local bridge agent** (QZ Tray · PrintNode · custom Electron/Go) | **install and keep updated a program on every cashier PC**; QZ silent mode needs paid signing certs | all six (incl. terminal if an acquirer ECR protocol is obtained) | any browser (localhost prompt in Chrome 142+) | local websocket attack surface; code signing; message signing | highest: installers per OS, auto-update, support calls | installed base must be supported indefinitely; the page↔agent protocol becomes a contract | **violates** |
| **G5** | **Android POS devices** (SUNMI …) running a platform-built wrapper app (WebView + JS bridge, or TWA + native module) | buy a specific device; install the platform's app (or pre-provisioned) | printer ✔ · reader ✔ · drawer ✔ (some models) · scale ✔ (SUNMI SDK) · labels (some models) · terminal ✔ with a certified payment app/SDK (M4/M5) | our app only; vendor SDK per brand | bridge must only load our own content (W40) | high: native wrapper, per-vendor SDKs, store publishing | vendor SDK lock; device purchases | **gray** — an app install on a dedicated device; owner to decide |
| **G6** | **Payment only — cloud remote terminal** (M3) | contract with a licensed provider; pair the terminal (code) | terminal ✔ | none on our side (server-to-cloud) | provider credentials per tenant (existing encrypted store); PCI scope falls on merchant (ق-٣٣٧ ③) | medium: async charge flow outside the tenant transaction; ق-٣١٥ answers | per-provider adapters; merchant's acquirer contract | **respects** |

**Coverage matrix — which option can serve which device (✔ yes · ◐ partial/conditional · ✗ no):**

| Device \ Option | G0 | G1 | G2 | G3 | G4 | G5 | G6 |
|---|---|---|---|---|---|---|---|
| Thermal printer | ✔ | ◐ (Windows USB wall) | ✔ | ✔ (online only) | ✔ | ✔ | ✗ |
| Reader | ✔ (A1) | ✔ | ✔ (A1) | ✔ (A1) | ✔ | ✔ | ✗ |
| Cash drawer | ◐ (driver option) | ✔ | ✔ | ✔ | ✔ | ◐ (model) | ✗ |
| Scale | ◐ (labels only) | ✔ (live, Serial) | ◐ (labels only) | ◐ (labels only) | ✔ | ✔ (SDK) | ✗ |
| mada terminal | ✗ (M1) | ✗ | ✗ | ✗ | ◐ (if ECR obtained) | ◐ (certified app) | ✔ (M3) |
| Label printer | ✔ (driver) | ✔ (raw) | ✗ | ✔ (Zebra) | ✔ | ◐ (model) | ✗ |

**What the options have in common, and what the decision actually is:**
- The reader needs no bridge in any option (A1), and pre-packed weighed goods need only reader + template parsing (D1).
- The drawer always follows the printer; the terminal is a separate axis (G6 vs M2/M4/M5), decided by ق-٣١٣/٣١٥/٣٣٧ conditions.
- So the bridge question reduces to **how the printer (and live scale) are reached**: G0 (driver) vs G1 (browser APIs) vs G2 (LAN
  HTTP) vs G3 (cloud) vs G4 (agent) vs G5 (dedicated device). Options are combinable (e.g., G0 baseline + G2/G3 for a declared
  supported-printer list + G6), which is also what the retail plan's risk خ٧ anticipated («طبقة تجريد ESC/POS + قائمة أجهزة
  مدعومة معلنة», L934) — the plan did not choose a transport.
- Choices with **irreversible** effects: requiring specific printer brands/models (G2/G3/G5 — merchants' purchases), publishing
  printer-facing server endpoints (G3), shipping an agent (G4), committing the cashier to Chromium (G1).
- The offline requirement (`S7`, `L4-3`) splits the options: G0/G1/G2/G4/G5 print without internet; G3 does not.

---

## Sources

✔ = fetched and read (WebFetch, or the Browser pane where noted) · ✘ = seen only in a search result / not readable.
All web sources dated 2026-09-24.

| ID | Source (URL) | Used for | Read |
|---|---|---|---|
| P1 | `docs/domain-scan/14-نقاط-البيع-والورديات.md` (origin/main) | Part 1 quotes | ✔ full |
| P2 | `docs/decisions.md` L687, L688, L689, L694, L720 | ق-٣١٣/٣١٤/٣١٥/٣٢٠/٣٣٧ | ✔ |
| P3 | `docs/plans/retail-full-spec.md` L114, L532–L549, L591, L639–L659, L825, L934, L971 | device list, weighed barcode | ✔ |
| P4 | `SPEC.md` L187, L531, L630, L659 | scope statements | ✔ |
| P5 | `docs/engines.md` L156–L159 · `docs/plans/unified-build-plan.md` L209–L212 | L4-2/L4-3/L4-5 | ✔ |
| P6 | code: `apps/web/src/pages/pos/PosPage.tsx`, `apps/web/src/api/pos.ts`, `apps/web/src/index.css`, `apps/api/src/pos/pos.service.ts`, `pos.controller.ts`, `integrations/*`, `common/tenant/tenant-prisma.service.ts`, `docker/web-nginx.conf`, `apps/api/package.json` | §1.4, §1.6 | ✔ |
| P7 | `CLAUDE.md` L3515 (5000 ms transaction record) · §1 SaaS rule · 💳 payment constraints | F2, G | ✔ |
| W1 | https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API | WebUSB secure context, limited availability | ✔ |
| W2 | https://developer.chrome.com/docs/capabilities/usb | secure context, user gesture, Windows descriptors/INF, Linux udev | ✔ |
| W3 | https://raw.githubusercontent.com/WICG/webusb/main/index.bs (rendered spec page returned empty) | protected interface classes; printer not protected; CG-DRAFT | ✔ |
| W4 | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/USB.json | support table | ✔ |
| W5 | https://developer.chrome.com/docs/capabilities/serial | desktop Chrome 89; Android note; serial device types | ✔ |
| W6 | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Serial.json | support table (Android 148/138, Firefox 151) | ✔ |
| W7 | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/151 | Firefox Web Serial via site-permission add-on | ✔ |
| W8 | https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API | secure context, `serial` policy, user activation | ✔ |
| W9 | https://developer.chrome.com/docs/capabilities/hid | protected usages (keyboard/mouse), FIDO blocked | ✔ |
| W10 | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HID.json | support table | ✔ |
| W11 | https://raw.githubusercontent.com/WebBluetoothCG/web-bluetooth/main/index.bs (rendered page returned empty) | GATT-only abstract; CG-DRAFT | ✔ |
| W12 | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Bluetooth.json | support table | ✔ |
| W13 | https://developer.mozilla.org/en-US/docs/Web/API/Window/print | print dialog, blocking | ✔ |
| W14 | https://groups.google.com/a/chromium.org/g/chromium-bugs/c/_g8hIstpN8E (Chromium issue 169004) | `--kiosk-printing` silent printing, dialog flash | ✔ |
| W15 | https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode | Edge kiosk flags (no kiosk-printing listed) | ✔ full |
| W16 | https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html (Browser pane) | ePOS SDK for JS: no driver, canvas images; native SDK interfaces | ✔ |
| W17 | https://download4.epson.biz/sec_pubs/pos/reference_en/technology/server_direct_print.html (Browser pane) | Server Direct Print polling | ✔ |
| W18 | https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lt.html (Browser pane) | `ESC t` Arabic code pages | ✔ |
| W19 | https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html (Browser pane) | `ESC p` drawer pulse | ✔ |
| W20 | https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html (Browser pane) | `GS v 0` obsolete → `GS ( L` | ✔ |
| W21 | https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lparen_lk_fn180.html (Browser pane) | QR store (fn 180/181) | ✔ |
| W22 | https://starmicronics.com/blog/webprnt-cloudprnt-comparison/ | WebPRNT vs CloudPRNT, models, certificates | ✔ |
| W23 | https://www.star-m.jp/products/s_print/sdk/webprnt/manual/en/_sampleProgram.htm | WebPRNT certificates, canvas, peripheral element | ✔ |
| W24 | https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/about.html | CloudPRNT server printing, MQTT, Markup | ✔ |
| W25 | https://star-m.jp/products/s_print/sdk/StarDocumentMarkup/manual/en/spec.html | Unicode-based; "Arabic" absent | ✔ |
| W26 | https://developer.chrome.com/blog/local-network-access | LNA prompt, mixed-content exemption (the one verbatim quote) | ✔ |
| W27 | https://developer.chrome.com/release-notes/142 | LNA ships in Chrome 142 | ✔ |
| W28 | https://qz.io/docs/ | QZ Tray install, websocket, raw formats, serial/USB | ✔ |
| W29 | https://qz.io/docs/signing | signing for silent printing; paid tiers | ✔ |
| W30 | https://www.printnode.com/en/docs/introduction | PrintNode client install, API | ✔ |
| W31 | https://developer.zebra.com/products/printers/browser-print | Browser Print app, OS/browser, request basis | ✔ |
| W32 | https://www.zebra.com/us/en/software/printer-software/cloud-connect.html | Cloud Connect firmware WebSocket/HTTPS | ✔ |
| W33 | https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-pa.html (Browser pane) | `^PA` shaping/bidi, firmware | ✔ |
| W34 | https://docs.zebra.com/us/en/scanners/general/sm72-ig/usb-interface/usb-parameter-defaults/usb-device-type-.html (Browser pane) | USB device types, HID keyboard default, HID POS, CDC | ✔ |
| W35 | https://docs.zebra.com/us/en/scanners/general/ds4-series/ds4678-prg/radio-communications/radio-communications-host-types/keyboard-emulation-(hid).html (Browser pane) | BT keyboard emulation | ✔ |
| W36 | https://docs.zebra.com/us/en/scanners/general/ds4-series/ds4678-prg/country-codes/usb-and-keyboard-wedge-country-keyboard-types-(country-codes).html (Browser pane) | country keyboard types; keypad emulation fallback | ✔ |
| W37 | https://docs.sunmi.com/en-US/cdixeghjk491/xdideghjk524 (Browser pane) | inbuilt printers, connection modes | ✔ |
| W38 | https://docs.sunmi.com/en-US/cdixeghjk491/xdzceghjk502 (Browser pane; navigation only) | SDK sections incl. scale, drawer, payment | ✔ (nav) |
| W39 | https://h5.sunmi.com/printer-sdk/demo.html | JS SDK printing demo | ✔ |
| W40 | https://developer.android.com/develop/ui/views/layout/webapps/webview | `addJavascriptInterface` + warning | ✔ |
| W41 | https://developer.chrome.com/docs/android/trusted-web-activity | TWA definition | ✔ |
| W42 | https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP864.TXT | CP864 → presentation forms | ✔ |
| W43 | https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1256.TXT | CP1256 → base letters | ✔ |
| W44 | https://www.gs1.org/standards/id-keys/company-prefix (Browser pane; WebFetch got 403) | 020–029 RCN (MO defined); 628 GS1 Saudi Arabia | ✔ |
| W45 | https://www.mt.com/us/en/home/products/retail-weighing-scales/checkout-scales/ariva_family/Ariva_S.html (Browser pane) | Ariva-S connects to most POS | ✔ |
| W46 | MT Ariva quick guides (mt.com PDFs, e.g. `30353727_QuickGuide_Ariva_EE_05-2021.pdf`) | RS-232/USB; 8217, Dialog-06 | ✘ search |
| W47 | CAS PD-II manual / ECR protocol sheet (cas-usa.com PDFs) | RS-232 9600 7E1; ECR types | ✘ search |
| W48 | https://apgsolutions.com/support/faqs/interface-drivers/ | printer-driven drawers; HID USB interface; serial | ✔ |
| W49 | https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/usb-driver-installation-based-on-compatible-ids | Usbser.sys auto-load for CDC | ✔ |
| W50 | https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/automatic-installation-of-winusb | WinUSB device definition | ✔ |
| W51 | https://zadig.akeo.ie/ | Zadig installs generic USB drivers (WinUSB) | ✔ |
| W52 | https://docs.nearpay.io/us/en/guides/introduction | Tap-to-Pay SDK, Android 9+ | ✔ |
| W53 | https://docs.nearpay.io/us/en/guides/terminal-sdk | TerminalSDK platforms, onboarding | ✔ |
| W54 | https://docs.nearpay.io/sa/en/remote-integration/web-sdk (also verified in Browser pane) | `RemotePos` / `USBPos` | ✔ |
| W55 | https://docs.nearpay.io/sa/en/remote-integration/proxy-with-http | cloud proxy HTTP operations, JWT | ✔ |
| W56 | https://docs.geidea.net/docs/overview | online products only (overview page) | ✔ |
| W57 | https://docs.moyasar.com/ | online products only (overview page) | ✔ |
| W58 | https://developers.tap.company/ | online products only (home page) | ✔ |
| W59 | https://developer.apple.com/tap-to-pay/regions/ | Saudi Arabia not listed | ✔ (validated) |
| W60 | https://www.pcisecuritystandards.org/standards/mobile-payments-on-cots/ | MPoC scope | ✔ |
| W61 | https://www.sama.gov.sa/en-US/payment/pages/licensed_payment_service_providers_companies.aspx | licensed PSP list | ✘ error page (WebFetch and Browser pane) |
| W62 | https://www.alahli.com/en/pages/business/cash-management/point-of-sales/soft-pos | SNB SoftPOS | ✘ TLS error |
| W63 | https://www.stc.com.sa/content/stc/sa/en/business/integrate/digital-and-iot/financial-and-retail-solutions/soft-pos.html | stc SoftPOS | ✘ page hung |
| W64 | HyperPay / Surepay terminal docs | — | ✘ nothing found |
| W65 | Epson APD6 printer manual (files.support.epson.com PDF) | drawer via driver "Peripherals" tab | ✘ search |
| W66 | TSC TSPL/TSPL2 programming manual (tscprinters.com PDF) | label language | ✘ search |
| W67 | Zebra Weblink/Cloud Connect certificate requirement | Zebra-signed cert | ✘ search |
| W68 | Odoo App Store listings for Geidea terminal modules (third party) | "Web ECR" on localhost:5000, Windows only | ✘ third party, not relied upon |
| W69 | Star CloudPRNT polling-time page | default 5 s | ✘ search |
| W70 | https://nearpay.io/ | no licensing text (logos only) | ✔ |

---

## Limits of this scan (declared)

1. **Primary-source gaps:** SAMA's licensed-company list (error page); Saudi Payments (mada) terminal/SoftPOS certification rules;
   GS1 Saudi Arabia's definition of the 020–029 variable-measure structure (403); Epson ePOS SDK method pages such as `addTextLang`
   (moved/404); PAX and Landi docs; Zebra/TSC driver and TSPL manuals; MT/CAS scale protocol documents (PDF, search results only);
   Epson APD6; any acquirer ECR specification (non-public by ق-٣٣٧).
2. **Not measured or tested on hardware:** WebUSB behavior with USB printers on Android/macOS; WebHID with HID-POS scanners or HID
   drawers; keyboard-wedge output under an Arabic Windows/macOS layout; whether any printer shapes Arabic in WPC1256; QR payload
   size vs. printer capacity; ZATCA minimum QR print size; Safari/Firefox mixed-content behavior toward LAN printers.
3. **Regulatory not researched:** Saudi legal metrology (SASO) for POS-connected scales; the Arabic official text behind ق-٣٣٧ ②.
4. **Market prevalence:** which interfaces and brands dominate Saudi retail was not measured (no market source read) — this is the
   field-session question (§3.6 ②), not a desk one.
5. **Code findings F1–F3 are read, not executed** (no test runs by instruction); each names the test that would prove it.
6. **Quoting:** per the session's copyright rule, third-party sources are paraphrased with precise pointers; only one verbatim
   quote (W26). Project documents are quoted exactly.
7. **Staleness:** browser-compat data and vendor pages change; everything is dated 2026-09-24. I ran no `git fetch` (so as not to
   write under `D:\mad-app`); `origin/main` moved from `0d05b663` to `a036c477` during the scan through another session — no cited
   file changed and all Part 1 greps were re-run on both SHAs (see the header note).
8. **WebHID prompt/secure-context rules** were not captured from Chrome's page as fetched (W9); only its protected-usage rule is cited.
9. **Scope of negatives:** "online products only" for Geidea/Moyasar/Tap is about their overview/home pages, not the whole sites;
   "Arabic absent" for Star Markup is about its specification page only.

## Incidents during the scan

- **Browser pane download prompt:** navigating the Browser pane to `https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf`
  returned a file download, so a **save dialog was shown to the user**. It was not retried. If it was accepted, the file is that GS1
  PDF; otherwise the dialog can simply be cancelled.
- **Epson Tech.Reference Terms-of-Use gate:** those pages display an Accept/Reject overlay; it was **not accepted**. Only command
  facts from the delivered page text are cited (W16–W21).
- **Automatic cache by the fetch tool:** WebFetch stored a 4.3 MB Epson PDF (`tm-i_epos-print_um_en_revk.pdf`) at
  `C:\Users\mnqad\.claude\projects\D--mad-app\e226e196-3c27-44af-a820-03530ffbef49\tool-results\webfetch-1790206984114-3q1ew7.pdf`;
  its binary could not be parsed and it is not used as a source.
- **Cookie banners** (SUNMI docs) were left unanswered.
