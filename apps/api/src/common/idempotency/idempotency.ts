import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { Request } from 'express';
import { MSG } from '../i18n/messages';

/**
 * ⚖️ **الإرسالُ المكرّر لا يُنشئ مستندين** (توجيه ٢٧٦ · `ق-١٦٠٩`/ب، بالقاعدة ٣٧ — مقياسُ م٥ في المسح ٣٤).
 *
 * ## العطل
 *
 * سندُ القبض وسندُ الصرف وقبضُ الإيجار وبيعُ الكاشير المتّصل: طلبٌ واحدٌ يُرسل مرّتين (نقرةٌ مزدوجة، أو إعادةُ شبكةٍ بعد مهلة
 * لم يصل جوابُها) **يُنشئ مستندين** بقيدين وحركتَي صندوق — والخادمُ لا يميّز التكرارَ من دفعةٍ ثانيةٍ مشروعةٍ بالمبلغ نفسِه.
 * فالمميِّزُ لا يكون إلا من العميل: **مفتاحٌ يولّده للطلب الواحد** ويعيده كما هو إن أعاد الطلب. وهو ما يحمي البيعَ بلا اتصال
 * ومحاولةَ البطاقة منذ بُنيا (`clientSaleId`)، فعُمّم لا اختُرع.
 *
 * ## لماذا رأسٌ لا حقل
 *
 * `Idempotency-Key` المعيارُ الشائع، **ولا يدخل جسمَ الطلب**: فلا يتغيّر عقدُ الواجهة المولَّد ولا لقطتُها، ولا يرث صنفٌ
 * `@IsOptional` على حقلٍ يُلزمه صنفٌ يرثه (`SyncPosSaleDto` يُلزم `clientSaleId` ويرث `CreatePosSaleDto`).
 *
 * ## السلوك
 *
 * - المفتاحُ نفسُه بالطلب نفسِه ⇒ **المستندُ نفسُه** يُعاد ولا يُكتب ثانٍ.
 * - **طلبان معاً** بالمفتاح نفسِه ⇒ الثاني يصطدم بقيد الفرادة `(companyId, clientRequestId)` في القاعدة، فيقرأ ما كتبه الأوّل.
 * - المفتاحُ نفسُه **بطلبٍ آخر** (مبلغٌ أو طرفٌ غيرُه) ⇒ `409` مسمّى: مفتاحٌ أُعيد لغير طلبه، والصمتُ هنا يُخفي سنداً لم يُكتب.
 * - **بلا مفتاح** ⇒ كما كان: كلُّ طلبٍ مستندٌ — وهذا حدٌّ لا يُتجاوز، فبلا مميِّزٍ لا يُعرف التكرار. والواجهةُ ترسل مفتاحاً لكلِّ نافذة.
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** حروفٌ آمنةٌ للعنوان والسجلّ، من ثمانيةٍ إلى مئة — يتّسع لـUUID ولا لنصٍّ حرّ. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{8,100}$/;

/** يقرأ الرأسَ ويفحص صيغتَه — `undefined` حين لا رأس. */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!KEY_SHAPE.test(value)) throw new BadRequestException(MSG.idempotency_key_invalid);
  return value;
});

/** يُرمى من داخل المعاملة حين يجد المفتاحَ مكتوباً — فتُترك المعاملةُ بلا كتابة ويُقرأ ما كُتب. */
export class IdempotentReplay extends Error {
  constructor() {
    super('idempotent replay');
  }
}

/**
 * **مرّةً لكلِّ مفتاح**: `lookup` يقرأ المستندَ المكتوبَ بالمفتاح (ويرمي `409` إن خالف الطلب)، و`create` يكتبه.
 * يُقرأ أوّلاً؛ ثم يُكتب؛ وإن اصطدم الكتابُ بقيد الفرادة (طلبٌ موازٍ سبقه) أو وجد المعاملةَ المفتاحَ مكتوباً، يُقرأ ما كُتب.
 */
export async function onceForKey<T>(key: string | undefined, lookup: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  if (!key) return create();
  const existing = await lookup();
  if (existing) return existing;
  try {
    return await create();
  } catch (e) {
    const collided = e instanceof IdempotentReplay || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
    if (collided) {
      const winner = await lookup();
      if (winner) return winner;
    }
    throw e;
  }
}
