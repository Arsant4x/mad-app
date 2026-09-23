import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { requestIdOf } from '../request-id/request-id.middleware';
import { buildErrorEvent, deriveUserKey, parseDsn } from './error-event.util';

/**
 * ③ (`ق-١٣٣١`) — **الإرسالُ إلى GlitchTip**، بلا مكتبة: حدثٌ يُبنى بقائمة سماح (`error-event.util.ts`) ويُرسَل
 * `POST` إلى `/api/<project>/store/` برأس `X-Sentry-Auth` — **فلا يجمع شيءٌ ما لم نختره** (مكتبةُ Sentry تجمع
 * افتراضاً الترويساتِ والمسارَ الكامل وأثرَ ما قبل الخطأ، وكلٌّ منها بابُ بياناتٍ لم نَرَه).
 *
 * ⛔ **ولا يُضبط `ERROR_TRACKING_DSN` قبل أن يوجد الخادمُ المستقلّ داخل المملكة** — شرطُ تشغيلٍ لا شرطُ برمجة
 * (`docs/licensing-and-operations.md`). وبلا `DSN` لا يُبنى المُرسِلُ أصلاً: `fromEnv` يعيد `null`.
 *
 * **ولا يكسر طلباً**: الإرسالُ لا يُنتظَر، وبمهلة، وبحدٍّ لما في الطريق — وأيُّ عطلٍ فيه سطرٌ في السجلّ لا خطأٌ
 * في الاستجابة. فخطأٌ واحدٌ لا يصير خطأين، وعاصفةُ أخطاءٍ (قاعدةٌ متوقّفة) لا تصير عاصفةَ اتصالات.
 */
export interface ErrorReporterOptions {
  environment?: string;
  userKey?: Buffer;
  timeoutMs?: number;
  maxInFlight?: number;
  fetchImpl?: typeof fetch;
}

export class ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');
  private inFlight = 0;
  private dropped = 0;

  constructor(
    private readonly target: { endpoint: string; publicKey: string },
    private readonly opts: ErrorReporterOptions = {},
  ) {}

  /** من البيئة — أو `null` بلا `DSN` (لا خادمَ بعد) أو بـ`DSN` غير صالح (يُخطئ السجلُّ باسمٍ ولا يُقلع شيءٌ نصفَ إقلاع). */
  static fromEnv(env: NodeJS.ProcessEnv): ErrorReporter | null {
    const dsn = (env.ERROR_TRACKING_DSN ?? '').trim();
    if (!dsn) return null;
    const target = parseDsn(dsn);
    if (!target) {
      new Logger('ErrorReporter').error('ERROR_TRACKING_DSN غير صالح — تتبّعُ الأخطاء معطَّل (الصيغة: https://<المفتاح>@<الخادم>/<رقم المشروع>).');
      return null;
    }
    const secret = (env.SECRETS_ENCRYPTION_KEY ?? '').trim();
    return new ErrorReporter(target, { environment: env.NODE_ENV, userKey: secret ? deriveUserKey(secret) : undefined });
  }

  /**
   * يُبلّغ عن خطأٍ في طلب — **ولا يُنتظَر ولا يرمي**. ويعيد وعداً بقبول المتتبّع له، يقرؤه الاختبارُ وحدَه.
   */
  report(exception: unknown, req: Request, status: number): Promise<boolean> {
    const max = this.opts.maxInFlight ?? 20;
    if (this.inFlight >= max) {
      // سطرٌ عند أوّل إسقاطٍ في كلِّ عاصفة — لا سطرٌ لكلِّ حدث.
      if (this.dropped++ === 0) this.logger.warn(`تتبّعُ الأخطاء: ${max} حدثاً في الطريق — يُسقط ما بعدها حتى يخفّ الضغط.`);
      return Promise.resolve(false);
    }

    let body: string;
    try {
      const matched = (req.route as { path?: unknown } | undefined)?.path;
      const route = typeof matched === 'string' ? `${req.baseUrl ?? ''}${matched}` : (req.path ?? req.url ?? '');
      const sub = (req as unknown as { user?: { sub?: unknown } }).user?.sub;
      const event = buildErrorEvent(
        exception,
        { method: req.method ?? 'GET', route, status, requestId: requestIdOf(req), userId: typeof sub === 'string' ? sub : undefined },
        { environment: this.opts.environment, userKey: this.opts.userKey },
      );
      body = JSON.stringify(event);
    } catch (err) {
      this.logger.warn(`تعذّر بناءُ حدث الخطأ — لم يُرسَل (${(err as Error)?.name ?? 'Error'}).`);
      return Promise.resolve(false);
    }

    this.inFlight++;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    return fetchImpl(this.target.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=mad-app/1.0, sentry_key=${this.target.publicKey}`,
      },
      body,
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 3000),
    })
      .then((res) => {
        if (!res.ok) {
          this.logger.warn(`المتتبّعُ ردّ ${res.status} — لم يُحفظ الحدث.`);
          return false;
        }
        this.dropped = 0;
        return true;
      })
      .catch((err: Error) => {
        this.logger.warn(`تعذّر إرسالُ الخطأ إلى المتتبّع (${err?.name ?? 'Error'}).`);
        return false;
      })
      .finally(() => {
        this.inFlight--;
      });
  }
}
