import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import type { ErrorReporter } from '../error-tracking/error-reporter';
import { requestIdOf } from '../request-id/request-id.middleware';
import { resolveLanguage } from './language.util';
import { Language, MSG, resolveMessage } from './messages';
import { localizeValidation } from './validation.util';

interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** معرِّفُ الطلب (`ق-١٢٣٧`) — كما على الرأس `x-request-id`، فيُبلَّغ به الدعمُ من جسم الخطأ أيضاً. */
  requestId?: string;
}

/**
 * Translates every outgoing error message into the caller's language.
 *
 * This is the single place localization happens: services throw catalog keys
 * (see messages.ts) and stay free of any language concern, which is what keeps
 * the rule "the server enforces, in the user's language" from turning into a
 * translation call in all 29 service files.
 *
 * A non-HttpException becomes a generic 500 — an internal error's raw text
 * (stack traces, driver errors) must never reach a client, in any language.
 *
 * ③ (`ق-١٣٣١`): **وكلُّ خطأٍ من صنف `5xx` يُبلَّغ إلى متتبّع الأخطاء** إن وُجد (`ErrorReporter` — بقائمة سماح،
 * لا يُنتظَر ولا يرمي). و`4xx` لا — رفضٌ مسمّى ليس عطلاً، وإبلاغُه ضجيجٌ يُغرق العطلَ الحقيقيّ.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly reporter: ErrorReporter | null = null) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const language = resolveLanguage(request.headers['accept-language']);
    // المعرِّفُ يُقرأ من الطلب حيث كتبه الوسيط؛ وغيابُه (تطبيقُ اختبارٍ بلا وسيط) لا يُخترَع.
    const requestId = requestIdOf(request);
    const withId = <T extends object>(body: T): T & { requestId?: string } => (requestId ? { ...body, requestId } : body);

    if (!(exception instanceof HttpException)) {
      this.logger.error(`${requestId ? `[${requestId}] ` : ''}${exception instanceof Error ? exception.stack : String(exception)}`);
      void this.reporter?.report(exception, request, HttpStatus.INTERNAL_SERVER_ERROR);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        withId({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: resolveMessage(MSG.internal_error, language),
          error: 'Internal Server Error',
        }),
      );
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    if (status >= 500) void this.reporter?.report(exception, request, status);

    response.status(status).json(
      withId(
        typeof body === 'string'
          ? { statusCode: status, message: resolveMessage(body, language) }
          : this.translateBody(body as NestErrorBody, language),
      ),
    );
  }

  /** ValidationPipe returns `message` as an array (one entry per failed rule),
   * so both shapes have to be handled. */
  private translateBody(body: NestErrorBody, language: Language): NestErrorBody {
    const { message } = body;
    return {
      ...body,
      message: Array.isArray(message)
        ? message.map((m) => this.translateOne(m, language))
        : this.translateOne(message, language),
    };
  }

  /**
   * حمولات التحقّق أولاً، ثم كتالوج الرسائل.
   *
   * الترتيب مقصود: `resolveMessage` يمرّر أي نصٍّ غير معروف كما هو، فلو سبق
   * لخرجت حمولة التحقّق إلى المستخدم بصيغتها الخام (`@v:isNumber|…`) — أي
   * أسوأ من الإنجليزية التي نُصلحها.
   */
  private translateOne(raw: string, language: Language): string {
    return localizeValidation(raw, language) ?? resolveMessage(raw, language);
  }
}
