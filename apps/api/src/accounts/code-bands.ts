import { Prisma } from '@mad-app/db';

/**
 * **نطاقاتُ الترقيم المشتقّ — ومعها سقفُها** (`ق-٢٩٥`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * `MAX+1` (`ق-١٩٨`) **يستهلك النطاق بأعلى رمزٍ صدر لا بعدد الأحياء**: الفجوةُ
 * لا تُعاد تعبئتُها، وحسابٌ حُذف كيانُه **يبقى رمزُه مشغولاً** — بل **حسابٌ له
 * أسطرُ قيدٍ لا يُحذف أصلاً**. ⟵ **فتحريرُ فجوةٍ لا يُنزل السقف**، وكلُّ نطاقٍ
 * في النظام يمشي في اتجاهٍ واحد نحو جداره.
 *
 * **والمقيس** (2026-09-08): نطاقُ البنوك `1100–1199` **نفد** عند `1199` في
 * منشأةٍ واحدة، **والأدراج عند `1082` — تسعَ عشرةَ خانة**. **واصطدامٌ صامتٌ
 * دائم** — لا مخرجَ منه في المنتج.
 *
 * ── الحلّ: نطاقٌ ثانٍ، وإنذارٌ قبل الجدار ─────────────────────────────────
 *
 * **① نطاقٌ ثانٍ للبنوك `1601–1999`** (حكمُ المالك): التوسيعُ في مكانه مستحيل
 * — `1200` (الذمم المدينة) فوقه مباشرةً وهو في كل تقريرٍ ودليلٍ افتراضيّ،
 * و`1010–1099` (الأدراج) تحته. **والنطاقُ الثاني لا يُغيّر رمزاً قائماً.**
 *
 * **② وإنذارٌ قبل الاصطدام لا عنده**: «تاجرٌ يصطدم بجدارٍ صامت أسوأ من تاجرٍ
 * يُنذَر قبله بعشر خانات» (نصّ المالك). **والمعيار مُعلَن**: يُنذَر عند بقاء
 * **عشر خانات** — ولنطاقٍ صغيرٍ (سعتُه دون عشرين) عند **نصف سعته**، فإنذارٌ
 * يبدأ فوق نصف السعة إنذارٌ دائم، والدائمُ يُهجَر.
 *
 * ⚠️ **والترتيبُ داخل المجموعة معنويّ**: يُملأ النطاق الأول ثم الذي يليه —
 * فرموزُ البنوك القديمة تبقى متجاورةً كما كانت.
 */
export interface CodeBand {
  min: number;
  max: number;
  /** Fixed codes inside the band: never issued and never counted as used, capacity or remaining. */
  reserved?: number[];
}

/**
 * Cash in transit: a fixed code that already sits inside the first bank band, so the band reserves it.
 * Defined here, not in the journal utilities, so this file keeps no imports that could form a cycle.
 */
export const CASH_IN_TRANSIT_CODE = '1190';

export interface CodeBandGroup {
  /** مفتاحٌ ثابت تقرؤه الواجهة. */
  key: string;
  /** اسمٌ يُعرض للتاجر. */
  name: string;
  bands: CodeBand[];
}

export const BANK_BANDS: CodeBand[] = [
  { min: 1100, max: 1199, reserved: [Number(CASH_IN_TRANSIT_CODE)] },
  // النطاق الثاني (ق-٢٩٥) — يبدأ بعد `1600` (تقبيل وحقوق انتفاع) وينتهي دون
  // `2000` (بداية الخصوم في الدليل الافتراضي).
  { min: 1601, max: 1999 },
];

export const DRAWER_BANDS: CodeBand[] = [
  { min: 1010, max: 1099 },
  /**
   * **النطاق الثاني للأدراج** (`ق-٤٨٢`) — **والأوّلُ نفد فعلاً**: مقيسٌ
   * (2026-09-10) **`1099` في منشأة العرض، وهو سقفُه بالضبط** ⇒ `409` لا مخرجَ
   * منه. **وهو جدارُ `ق-٢٩٥` نفسُه بعد أن كان عند `1082`.**
   *
   * ## ولماذا `1500–1599` دون غيره — مقيساً على ١٤٧ دليلاً
   *
   * **الفارغُ تماماً بين ١٠٠٠ و١٩٩٩ خمسُ مئات**: `1400` · `1500` · `1700` ·
   * `1800` · `1900`. **وثلاثٌ منها داخل نطاق البنوك الثاني** (`1601–1999`)
   * **فليست حرّة**.
   *
   * ⭐ **و`1400` حرٌّ في البيانات لا في المعنى**: **تقريرُ التدفقات يطلبه
   * بالرمز** («الأصول الثابتة») **ويُبلّغ عن غيابه**، **وتاجرٌ يفصّل أصولَه
   * الثابتة يمدّ يدَه إلى `1401` وما بعده**. ⇒ **فحرّيّةُ الرمز تُقاس بمعناه
   * لا بخلوّ الصفّ** (حكمُ المالك). **ورُفض `1401–1599` لهذا** — وإن كان أوسع.
   *
   * ⚠️ **وحدُّه معلَن** (`ق-٤٨٤`): **مئةُ خانةٍ تساوي — بمعدّل الهدر المقيس
   * (٦٧٪) — نحوَ ثلاثين درجاً حقيقياً**. **فالنطاقُ الثاني يؤجّل العلّة لا
   * يحلّها**، **ومعدّلُ الاستهلاك اليومَ صنعتْه تشغيلاتُ اختباراتنا لا تجّار**
   * — **فيُقاس عند أوّل تاجرٍ حقيقيّ قبل أن يُعاد النظر في الآليّة**.
   */
  { min: 1500, max: 1599 },
];

/**
 * ٢٥ **وسيطُ الاستلام** (بضاعةٌ مستلَمة غيرُ مفوترة — `ق-١١٢١`): حسابٌ واحد لكل منشأة يُنشأ عند أوّل
 * شراءٍ مخزنيّ **برمزٍ مشتقٍّ `MAX+1`** كالأدراج والبنوك (حكمُ المالك) — أوّلُ رمزٍ حرٍّ بعد `2100`
 * (الذمم الدائنة) ودون `2200` (ضريبة المخرجات)؛ فتاجرٌ رقّم حساباً يدوياً `2101` يدفع الوسيطَ إلى `2102`.
 *
 * ⚠️ ليس في `CODE_BAND_GROUPS`: النطاقُ لحسابٍ واحد، فإنذارُ «بقي عشرُ خانات» لا معنى له عليه —
 * والمنشأةُ تشير إلى حسابها بالمعرّف (`Company.receiptClearingAccountId`) لا بهذا النطاق.
 */
export const RECEIPT_CLEARING_BANDS: CodeBand[] = [{ min: 2101, max: 2199 }];

export const CODE_BAND_GROUPS: CodeBandGroup[] = [
  { key: 'bank', name: 'حسابات البنوك', bands: BANK_BANDS },
  { key: 'drawer', name: 'حسابات الأدراج', bands: DRAWER_BANDS },
];

const isReserved = (n: number, b: CodeBand) => (b.reserved ?? []).includes(n);

/** Reserved codes of the band that lie strictly above `after`. */
const reservedAbove = (b: CodeBand, after: number) => (b.reserved ?? []).filter((r) => r > after && r <= b.max).length;

/** Integer codes inside one of the group's bands, without the bands' reserved codes. */
function numericCodes(codes: string[], bands: CodeBand[]): number[] {
  return codes
    .map((c) => Number(c))
    .filter((n) => Number.isInteger(n) && bands.some((b) => n >= b.min && n <= b.max && !isReserved(n, b)));
}

/**
 * The next code: `MAX+1` inside a band, skipping its reserved codes, then on to the next band.
 * Returns `null` when every band is full.
 */
export function nextCodeInBands(codes: string[], bands: CodeBand[]): number | null {
  const used = numericCodes(codes, bands);
  for (const band of bands) {
    const inBand = used.filter((n) => n >= band.min && n <= band.max);
    let candidate = (inBand.length ? Math.max(...inBand) : band.min - 1) + 1;
    while (candidate <= band.max && isReserved(candidate, band)) candidate += 1;
    if (candidate <= band.max) return candidate;
  }
  return null;
}

/** Total issuable slots of the group: the bands' widths without their reserved codes. */
export function bandCapacity(bands: CodeBand[]): number {
  return bands.reduce((sum, b) => sum + (b.max - b.min + 1) - reservedAbove(b, b.min - 1), 0);
}

/**
 * **ما تبقّى فعلاً تحت `MAX+1`** — لا عددُ الخانات الفارغة.
 *
 * لكلِّ نطاق: `max − أعلى ما صدر فيه` (أو سعتُه كاملةً إن لم يصدر منه شيء).
 * **فالفجواتُ لا تُحسب**، لأن المولّد لا يعود إليها — وهذا هو الفرقُ الذي
 * جعل الجدارَ يقترب بلا أن يشعر أحد.
 */
export function bandRemaining(codes: string[], bands: CodeBand[]): number {
  const used = numericCodes(codes, bands);
  return bands.reduce((sum, b) => {
    const inBand = used.filter((n) => n >= b.min && n <= b.max);
    const highest = inBand.length ? Math.max(...inBand) : b.min - 1;
    return sum + (b.max - highest) - reservedAbove(b, highest);
  }, 0);
}

/** عتبةُ الإنذار: عشرُ خانات — أو نصفُ السعة لنطاقٍ سعتُه دون عشرين. */
export function warnThreshold(capacity: number): number {
  return Math.min(10, Math.floor(capacity / 2));
}

export interface BandStatus {
  key: string;
  name: string;
  capacity: number;
  remaining: number;
  /** الرمزُ الذي سيصدر تالياً — `null` حين نفدت النطاقات. */
  next: string | null;
  warnThreshold: number;
  warn: boolean;
}

export function bandStatus(codes: string[], group: CodeBandGroup): BandStatus {
  const capacity = bandCapacity(group.bands);
  const remaining = bandRemaining(codes, group.bands);
  const next = nextCodeInBands(codes, group.bands);
  const threshold = warnThreshold(capacity);
  return {
    key: group.key,
    name: group.name,
    capacity,
    remaining,
    next: next === null ? null : String(next),
    warnThreshold: threshold,
    warn: remaining <= threshold,
  };
}

/** حالةُ كل مجموعةٍ لمنشأةٍ واحدة — تُقرأ من دليلها لحظةَ السؤال. */
export async function codeBandStatuses(tx: Prisma.TransactionClient): Promise<BandStatus[]> {
  const accounts = await tx.account.findMany({ select: { code: true } });
  const codes = accounts.map((a) => a.code);
  return CODE_BAND_GROUPS.map((g) => bandStatus(codes, g));
}

/** مجموعةٌ بمفتاحها — **يسقط صراحةً** لمفتاحٍ لا وجودَ له، فلا إنذارٌ صامت. */
export function bandGroup(key: string): CodeBandGroup {
  const group = CODE_BAND_GROUPS.find((g) => g.key === key);
  if (!group) throw new Error(`مجموعةُ نطاقٍ غير مسجَّلة: ${key}`);
  return group;
}
