import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { resolveLanguage } from './language.util';
import { Language, MSG, resolveMessage } from './messages';

interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
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
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const language = resolveLanguage(request.headers['accept-language']);

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: resolveMessage(MSG.internal_error, language),
        error: 'Internal Server Error',
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    response.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: resolveMessage(body, language) }
        : this.translateBody(body as NestErrorBody, language),
    );
  }

  /** ValidationPipe returns `message` as an array (one entry per failed rule),
   * so both shapes have to be handled. */
  private translateBody(body: NestErrorBody, language: Language): NestErrorBody {
    const { message } = body;
    return {
      ...body,
      message: Array.isArray(message)
        ? message.map((m) => resolveMessage(m, language))
        : resolveMessage(message, language),
    };
  }
}
