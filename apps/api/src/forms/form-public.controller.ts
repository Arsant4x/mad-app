import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { MAX_FILE_BYTES } from '../files/files.service';
import {
  FormLinkOpenResponse,
  FormNafathPollResponse,
  FormNafathStartResponse,
  FormObjectedResponse,
  FormObjectionDto,
  FormOtpIssuedResponse,
  FormPublicViewResponse,
  FormSessionResponse,
  FormSignedResponse,
  VerifyFormOtpDto,
} from './dto/form-signing.dto';
import { FormPublicService } from './form-public.service';
import type { RequestMeta } from './form-signing.service';

/** الشبكةُ والمتصفّح كما يحفظهما سجلُّ التدقيق — ووصفُ المتصفّح مقصوص. */
export function metaOf(req: Request): RequestMeta {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null };
}

/** رأسُ الجلسة بعد الدخول — لا كعكةَ ولا حسابَ، ولا يُكتب في سجلّ. */
const SESSION_HEADER = 'x-form-session';

/**
 * ⚖️ **صفحةُ الرابط العامّة — بلا حساب** (توجيه ٢٨٧ ① إلى ③ و⑪ · السطحُ الخامس في الخطّة §٥).
 *
 * **لا حارسَ مصادقة** (العميلُ بلا حساب) **والحمايةُ في الخدمة**: الرمزُ بصمةٌ لا يُخمَّن، وكلُّ ما بعد الفتح بجلسةٍ قصيرة لنسخةٍ واحدة.
 * **وحدٌّ للطلبات على الرابط والرمز** (توجيه ٢٨٧ ⑪) فوق حدود التحدّي نفسِه: الحدُّ يُعدّ بعنوان الشبكة لمن لا جلسةَ له (`tenantTracker`)،
 * وأضيقُه على طلب الرمز وتحقيقه.
 */
@Controller('public/forms/:token')
export class FormPublicController {
  constructor(private readonly service: FormPublicService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: FormLinkOpenResponse })
  open(@Param('token') token: string, @Req() req: Request) {
    return this.service.open(token, metaOf(req));
  }

  @Post('otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCreatedResponse({ type: FormOtpIssuedResponse })
  requestOtp(@Param('token') token: string, @Req() req: Request) {
    return this.service.requestOtp(token, metaOf(req));
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: FormSessionResponse })
  verifyOtp(@Param('token') token: string, @Body() dto: VerifyFormOtpDto, @Req() req: Request) {
    return this.service.verifyOtp(token, dto, metaOf(req));
  }

  @Post('nafath')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCreatedResponse({ type: FormNafathStartResponse })
  startNafath(@Param('token') token: string, @Req() req: Request) {
    return this.service.startNafath(token, metaOf(req));
  }

  @Get('nafath')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: FormNafathPollResponse })
  pollNafath(@Param('token') token: string, @Req() req: Request) {
    return this.service.pollNafath(token, metaOf(req));
  }

  @Get('form')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: FormPublicViewResponse })
  view(@Param('token') token: string, @Headers(SESSION_HEADER) session: string | undefined, @Req() req: Request) {
    return this.service.view(token, session, metaOf(req));
  }

  @Post('sign')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('drawing', { limits: { fileSize: MAX_FILE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: FormSignedResponse })
  sign(
    @Param('token') token: string,
    @Headers(SESSION_HEADER) session: string | undefined,
    @UploadedFile() drawing: Express.Multer.File | undefined,
    @Body('acknowledged') acknowledged: string | undefined,
    @Req() req: Request,
  ) {
    return this.service.sign(token, session, drawing, acknowledged === 'true', metaOf(req));
  }

  @Post('objection')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: FormObjectedResponse })
  object(
    @Param('token') token: string,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Body() dto: FormObjectionDto,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.service.object(token, session, dto.note, photo, metaOf(req));
  }
}
