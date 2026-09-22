import { storableText } from '../common/i18n/storable-text';

/**
 * تحذيراتُ الهيئة على مستندٍ **مقبول** — تُقرأ من الجواب وتُحفظ (`ق-١٢٧٩` · ز/⑤A2).
 *
 * **ما كان**: جوابُ `2xx` يُقرأ منه `message` وحدَه، و`detail` يصير `null` عند القبول —
 * فكلُّ ما في `validationResults` **يُهدَر**. ولا نقطةَ استعلامٍ لاحقة لدى الهيئة (مؤكَّدٌ
 * بفحص البوّابة حيّاً 2026-08-15)، فـ**ما لا يُخزَّن لحظةَ الجواب لا يُستعاد أبداً**.
 *
 * ⚖️ **ولا يتغيّر الحكم** (`ق-٩٧١`): `2xx` قبولٌ و`400` ردّ — والتحذيرُ يُرى ولا يَحكم.
 * وتحذيرُ «PIH mismatch» مثالُه: كان يُدفن في نصٍّ مقصوصٍ عند ٥٠٠ حرفٍ أو يُهمل تماماً.
 */

export interface AuthorityMessage {
  /** رمزُ الهيئة إن وُجد (`BR-KSA-…`) — وإلا نصٌّ فارغ. */
  code: string;
  /** نصُّ الرسالة كما جاءت — مقصوصاً بحدِّ التخزين، مُصفّىً من البايت الصفريّ (`ق-٩٨٢`). */
  message: string;
  /** `WARNING` أو `ERROR` كما صنّفتها الهيئة. */
  severity: 'WARNING' | 'ERROR';
}

const MAX_MESSAGES = 50;
const MAX_LEN = 500;

function normalize(entry: unknown, severity: 'WARNING' | 'ERROR'): AuthorityMessage | null {
  if (typeof entry === 'string') {
    const message = storableText(entry.slice(0, MAX_LEN));
    return message ? { code: '', message, severity } : null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const o = entry as Record<string, unknown>;
  // أسماءُ الحقول كما في وثيقة الهيئة، **وما لم يُعرف يُسلسَل** — فلا يضيع جوابٌ بشكلٍ لم نتوقّعه.
  const code = [o.code, o.category, o.type].find((v) => typeof v === 'string' && v) as string | undefined;
  const text = [o.message, o.messageText, o.description].find((v) => typeof v === 'string' && v) as string | undefined;
  const message = storableText((text ?? JSON.stringify(o)).slice(0, MAX_LEN));
  return message ? { code: code ?? '', message, severity } : null;
}

/**
 * يقرأ `validationResults` من جسم الجواب — بالشكلين المعروفين (`warningMessages` و
 * `errorMessages`)، وما ليس مصفوفةً يُتجاهَل بلا رمي: **مراقبةٌ لا تُسقط إرسالاً**.
 *
 * و`null` تعني «هذا الجوابُ بلا ملاحظات» — فيُكتب `NULL` على المستند، لأن الحقل يصف
 * **الجوابَ الأخير** لا اتحادَ الأجوبة (كما `zatcaMessage`).
 */
export function zatcaWarningsOf(body: Record<string, unknown>): AuthorityMessage[] | null {
  const results = body.validationResults;
  if (!results || typeof results !== 'object') return null;
  const r = results as Record<string, unknown>;
  const out: AuthorityMessage[] = [];
  for (const [key, severity] of [
    ['warningMessages', 'WARNING'],
    ['errorMessages', 'ERROR'],
  ] as const) {
    const list = r[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const normalized = normalize(entry, severity);
      if (normalized) out.push(normalized);
      if (out.length >= MAX_MESSAGES) return out;
    }
  }
  return out.length ? out : null;
}
