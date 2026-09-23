import { createHmac, randomBytes } from 'node:crypto';

/**
 * ③ (`ق-١٣٣١`) — **حدثُ خطأٍ يُبنى بقائمة سماحٍ لا بقائمة حجب.**
 *
 * بنصّ المالك: «ويُحجب قبل الإرسال: **أجسامُ الطلبات كلُّها · وترويساتُ المصادقة والكوكي · وكلُّ حقلٍ شخصيّ**
 * ⇒ ويُرسَل: **المسارُ والخطأُ والتتبّعُ ومعرّفُ الطلب ومعرّفُ المستخدم مُبصَّماً**».
 *
 * ⚠️ **ولماذا سماحٌ لا حجب**: قائمةُ الحجب تحجب ما سمّته وتُرسل ما لم تعرفه — فترويسةٌ أو حقلٌ يُضاف غداً يخرج
 * بصمت. **وهذه لا ترى الطلبَ إلا من أبوابٍ مسمّاة** (`ErrorSource`): الفعلُ وقالبُ المسار ومعرّفُ الطلب ومعرّفُ
 * الهويّة — فلا جسمَ ولا ترويسةَ ولا كوكي ولا استعلامَ يصل هذه الدالّة أصلاً، ولو أُضيف بعد سنة.
 *
 * **والنصُّ الحرّ الوحيد الذي يخرج رسالةُ الخطأ** — فتُقصّ إلى سطرها الأوّل (ما بعده في أخطاء `Prisma` نسخةٌ من
 * الاستدعاء بقيمه) وتُعمّى بالأنماط. ⚠️ **وحدُّها معلَن**: اسمٌ حرٌّ بلا علامةٍ في رسالةٍ كتبتها الشيفرةُ لا يُكشف
 * بنمط — فالقاعدةُ على من يكتب رسالةَ خطأٍ داخلية: لا بيانَ شخصيّاً فيها.
 */

/** ما يُقرأ من الطلب — وحدَه، ولا شيءَ غيرُه. */
export interface ErrorSource {
  method: string;
  /** قالبُ المسار كما عرّفه الموجِّه (`/invoices/:id`) — أو المسارُ بلا استعلامٍ ومعرّفاته مستبدَلة. */
  route: string;
  status: number;
  requestId?: string;
  /** معرّفُ الهويّة الخام — **لا يخرج كما هو**، يُبصَّم قبل أن يُوضع في الحدث. */
  userId?: string;
}

export interface ErrorEventOptions {
  environment?: string;
  /** مفتاحُ بصمة المستخدم — بلاه لا يُرسَل معرّفُ مستخدمٍ أصلاً (لا بصمةَ بلا سرّ). */
  userKey?: Buffer;
  now?: Date;
  eventId?: string;
}

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** الحدثُ بصيغة `store` في Sentry/GlitchTip — **كلُّ مفتاحٍ هنا مختارٌ باسمه**. */
export interface ErrorEvent {
  event_id: string;
  timestamp: string;
  platform: 'node';
  level: 'error';
  logger: 'mad-app.api';
  environment?: string;
  transaction: string;
  tags: { http_method: string; status_code: string; request_id?: string };
  user?: { id: string };
  exception: { values: Array<{ type: string; value: string; stacktrace?: { frames: StackFrame[] } }> };
}

/** المفاتيحُ العليا المسموحة — والحارسُ يوكّد أن الحدثَ لا يحمل غيرَها. */
export const ALLOWED_EVENT_KEYS = ['event_id', 'timestamp', 'platform', 'level', 'logger', 'environment', 'transaction', 'tags', 'user', 'exception'] as const;

const MESSAGE_MAX = 300;
const FRAMES_MAX = 50;

/**
 * **تعميةُ نصّ الرسالة** — بالترتيب: الرموزُ قبل الأرقام، والمعرّفاتُ قبل الأرقام الطويلة، فلا يأكل نمطٌ عامٌّ
 * نمطاً أخصّ منه.
 */
export function scrubText(text: string): string {
  return (
    text
      // رمزُ جلسة (JWT) — ثلاثةُ مقاطعَ بنقاط، أوّلُها رأسٌ مرمَّز.
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
      .replace(/\b(?:bearer|basic)\s+[\w.~+/=-]+/gi, '<token>')
      .replace(/[^\s@<>()"'`,;]+@[^\s@<>()"'`,;]+\.[a-z]{2,}/gi, '<email>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
      // الآيبان السعوديّ: SA ثم رقمان ثم ثمانيةَ عشرَ إلى اثنين وعشرين.
      .replace(/\bSA\d{2}[0-9A-Z]{18,22}\b/gi, '<iban>')
      // هاتفٌ دوليّ أو محلّيّ (05xxxxxxxx).
      .replace(/(?:\+|\b00)\d{8,15}\b/g, '<phone>')
      .replace(/\b05\d{8}\b/g, '<phone>')
      // كلُّ تتابعٍ من ستّة أرقامٍ فأكثر — هويةٌ وطنية · سجلٌّ تجاريّ · رقمٌ ضريبيّ · بطاقة — لاتينيّةً أو عربية.
      .replace(/\d{6,}/g, '<n>')
      .replace(/[٠-٩]{6,}/g, '<n>')
      // ما بين علامتَي تنصيص ولا يشبه اسمَ جدولٍ أو عمود — قيمةٌ جاءت من مدخل.
      .replace(/"([^"]*)"/g, (m, inner: string) => (/^[A-Za-z_][\w.]*$/.test(inner) ? m : '"<v>"'))
      .replace(/'([^']*)'/g, (m, inner: string) => (/^[A-Za-z_][\w.]*$/.test(inner) ? m : "'<v>'"))
  );
}

/** السطرُ الأوّلُ غيرُ الفارغ من الرسالة، مقصوصاً ومعمّى. */
export function errorValue(exception: unknown): string {
  // خطأُ Prisma المعروف: رمزُه وأسماءُ حقوله — لا نصُّه (قد يحمل قيماً).
  const code = (exception as { code?: unknown })?.code;
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
    const meta = (exception as { meta?: { modelName?: unknown; target?: unknown } }).meta;
    const model = typeof meta?.modelName === 'string' ? ` · ${meta.modelName}` : '';
    const target = Array.isArray(meta?.target) ? ` · ${meta.target.filter((t) => typeof t === 'string').join(',')}` : '';
    return scrubText(`Prisma ${code}${model}${target}`).slice(0, MESSAGE_MAX);
  }
  const raw = exception instanceof Error ? exception.message : typeof exception === 'string' ? exception : '';
  const first = raw.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  return scrubText(first.trim()).slice(0, MESSAGE_MAX);
}

export function errorType(exception: unknown): string {
  if (exception instanceof Error) return exception.constructor?.name || exception.name || 'Error';
  return typeof exception;
}

/**
 * إطاراتُ التتبّع من `stack` — **الأقدمُ أوّلاً** كما يطلب البروتوكول، والمسارُ نسبيٌّ لا مطلق (المطلقُ على جهاز
 * مطوّرٍ يحمل اسمَ مستخدمه: `C:\Users\<name>\…`).
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split(/\r?\n/)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = m[2].replace(/\\/g, '/');
    frames.push({
      filename: relativeFile(file),
      function: scrubText(m[1] ?? '<anonymous>'),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !file.includes('node_modules/') && !file.startsWith('node:'),
    });
  }
  return frames.reverse().slice(-FRAMES_MAX);
}

function relativeFile(file: string): string {
  if (file.startsWith('node:')) return file;
  const nm = file.lastIndexOf('node_modules/');
  if (nm >= 0) return file.slice(nm);
  for (const anchor of ['/apps/api/', '/dist/', '/src/']) {
    const at = file.lastIndexOf(anchor);
    if (at >= 0) return file.slice(at + 1);
  }
  return file.slice(file.lastIndexOf('/') + 1);
}

/**
 * **بصمةُ المستخدم** — `HMAC-SHA256` بمفتاحٍ لا يعرفه المتتبّع: تكفي لعدّ المتأثّرين وربط أحداث الواحد منهم،
 * **ولا تُعكس ولو ملك المتتبّعُ قائمةَ المعرّفات** (بلا المفتاح لا يحسب بصمتَها).
 */
export function hashUserId(userId: string, key: Buffer): string {
  return createHmac('sha256', key).update(userId).digest('hex').slice(0, 32);
}

/** مفتاحُ البصمة مشتقٌّ من سرٍّ قائم بوسمٍ خاصّ — فصلُ مفاتيحٍ لا سرٌّ جديد يُدار. */
export function deriveUserKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('mad-app/error-tracking/user/v1').digest();
}

/** قالبُ المسار بلا استعلام — والمعرّفاتُ في المسار الخام (حين لا قالب) مستبدَلة. */
export function routeOf(path: string): string {
  const noQuery = path.split('?')[0].split('#')[0];
  return scrubText(noQuery.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n'));
}

export function buildErrorEvent(exception: unknown, source: ErrorSource, opts: ErrorEventOptions = {}): ErrorEvent {
  const frames = parseStack(exception instanceof Error ? exception.stack : undefined);
  const event: ErrorEvent = {
    event_id: opts.eventId ?? randomBytes(16).toString('hex'),
    timestamp: (opts.now ?? new Date()).toISOString(),
    platform: 'node',
    level: 'error',
    logger: 'mad-app.api',
    transaction: `${source.method.toUpperCase()} ${routeOf(source.route)}`,
    tags: { http_method: source.method.toUpperCase(), status_code: String(source.status) },
    exception: {
      values: [
        {
          type: errorType(exception),
          value: errorValue(exception),
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  };
  if (opts.environment) event.environment = opts.environment;
  if (source.requestId) event.tags.request_id = source.requestId;
  if (source.userId && opts.userKey) event.user = { id: hashUserId(source.userId, opts.userKey) };
  return event;
}

/**
 * **`DSN` ⟵ عنوانُ الاستقبال ومفتاحُه** — `https://<key>@<host>[/<prefix>]/<project>` ⟵ `…/api/<project>/store/`
 * (مقروءٌ من مصدر GlitchTip: `path("api/", api.urls)` و`@router.post("/{project_id}/store/")`).
 * **`https` وحدَه** — إلا `127.0.0.1`/`localhost` للاختبار — فالحدثُ لا يعبر الشبكةَ مكشوفاً.
 */
export function parseDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  const publicKey = decodeURIComponent(url.username);
  const parts = url.pathname.split('/').filter(Boolean);
  const project = parts.pop();
  if (!publicKey || !project || !/^\d+$/.test(project)) return null;
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/store/`, publicKey };
}
