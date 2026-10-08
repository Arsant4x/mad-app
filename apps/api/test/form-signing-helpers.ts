import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MockSmsChannel } from '../src/verification/providers';
import { VerificationGateway } from '../src/verification/verification-gateway.service';

/**
 * ⚖️ **أدواتُ اختبار مسار التوقيع** (توجيه ٢٨٧): صورةُ رسمٍ صغيرة، وجوالٌ فريدٌ لكلِّ حالة، وقراءةُ ما «أرسله» المزوّدُ التجريبيّ — فالحزمةُ
 * تقرأ الرابطَ والرمزَ من الرسالة نفسِها كما يقرؤهما المستأجر، لا من القاعدة.
 */

/** صورةُ `PNG` حقيقيةٌ بنقطةٍ واحدة — توقيعٌ مرسومٌ صغير. */
export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** جوالٌ سعوديٌّ فريدٌ للحالة: كما يكتبه الموظّفُ في البطاقة، وبصيغته الدولية كما يصله الرمز. */
export function uniqueMobile(): { local: string; e164: string } {
  const rest = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return { local: `05${rest}`, e164: `+9665${rest}` };
}

export const mockSms = (app: INestApplication): MockSmsChannel => app.get(VerificationGateway).sms() as MockSmsChannel;

export function linkTokenFrom(text: string | undefined): string {
  const m = /\/f\/([A-Za-z0-9_-]{43})/.exec(text ?? '');
  if (!m) throw new Error(`لا رابطَ في الرسالة: ${text}`);
  return m[1];
}

export function codeFrom(text: string | undefined): string {
  const m = /(\d{6})/.exec(text ?? '');
  if (!m) throw new Error(`لا رمزَ في الرسالة: ${text}`);
  return m[1];
}

/** الموظّفُ يوقّع ويرسل — ويُعاد الردّ ليفحصه المستدعي. */
export function sendForm(app: INestApplication, token: string, contractId: string, formId: string) {
  return request(app.getHttpServer())
    .post(`/contracts/${contractId}/forms/${formId}/send`)
    .set('Authorization', `Bearer ${token}`)
    .attach('drawing', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' });
}

/** المستأجرُ يدخل الرابطَ برمز جواله ويُعيد الجلسة. */
export async function loginByOtp(app: INestApplication, linkToken: string, mobileE164: string): Promise<string> {
  const http = () => request(app.getHttpServer());
  const issued = await http().post(`/public/forms/${linkToken}/otp`).expect(201);
  const code = codeFrom(mockSms(app).lastTo(mobileE164)?.text);
  const session = await http().post(`/public/forms/${linkToken}/otp/verify`).send({ challengeId: issued.body.challengeId, code }).expect(200);
  return session.body.session as string;
}

/** المستأجرُ يقرّ ويوقّع برسمه. */
export function signAsTenant(app: INestApplication, linkToken: string, session: string) {
  return request(app.getHttpServer())
    .post(`/public/forms/${linkToken}/sign`)
    .set('x-form-session', session)
    .field('acknowledged', 'true')
    .attach('drawing', TINY_PNG, { filename: 'tenant.png', contentType: 'image/png' });
}

/** المسارُ كاملاً حتى الختم: إرسالٌ فدخولٌ برمزٍ فتوقيع. */
export async function sendAndSeal(app: INestApplication, token: string, contractId: string, formId: string, mobileE164: string) {
  await sendForm(app, token, contractId, formId).expect(201);
  const link = linkTokenFrom(mockSms(app).lastTo(mobileE164)?.text);
  const session = await loginByOtp(app, link, mobileE164);
  await signAsTenant(app, link, session).expect(201);
  const form = await request(app.getHttpServer()).get(`/contracts/${contractId}/forms/${formId}`).set('Authorization', `Bearer ${token}`).expect(200);
  return form.body as { status: string; no: string; sealSeq: number; prevHash: string | null; contentHash: string; sealedByName: string; sealFormat: number };
}
