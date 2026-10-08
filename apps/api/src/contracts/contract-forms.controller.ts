import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MAX_FILE_BYTES } from '../files/files.service';
import { FormInstanceResponse, FormVerificationResponse } from '../forms/dto/form-instance-responses.dto';
import { CreateFormInstanceDto, SetFormValuesDto } from '../forms/dto/form-instance.dto';
import {
  FormDeviceLinkResponse,
  FormPaperSignedResponse,
  FormSentResponse,
  FormSigningEventResponse,
  PaperSignFormDto,
  RequestSubstituteDto,
  SendFormDto,
} from '../forms/dto/form-signing.dto';
import { metaOf } from '../forms/form-public.controller';
import type { FormActor } from '../forms/form-instances.service';
import { ContractFormsService } from './contract-forms.service';

/** الفاعلُ كما يُختم على السجلّ: معرّفُ ملفّه واسمُ دخوله. */
function actorOf(tenant: TenantContext, req: Request): FormActor {
  return { id: tenant.profileId, name: (req.user as JwtPayload).username };
}

/**
 * ⚖️ **نماذجُ العقد في شاشة العقود** (توجيه ٢٧٨ · `ق-١٦٣٦`). الفاعلُ موظّفُ المنشأة بما منحه المالك: **التعبئةُ «تسجيل»**،
 * **والتوقيعُ والإرسالُ «مراجعة»** (`ق-١٦٣٥` ⑩: «المراجعة» لطلب البديل وللختم؛ والختمُ صار يقع بتوقيع المستأجر، فالفعلُ الحاكمُ
 * لتوقيع الموظّف وإرساله هو فعلُ الختم نفسُه)، **والنسخةُ المعدّلة «تسجيل»** (تعبئةٌ جديدة)، والقراءةُ «اطّلاع».
 */
@Controller('contracts/:id/forms')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('contracts')
export class ContractFormsController {
  constructor(private readonly service: ContractFormsService) {}

  @Get()
  @RequiresAction('view')
  @ApiOkResponse({ type: FormInstanceResponse, isArray: true })
  list(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.list(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('record')
  @ApiCreatedResponse({ type: FormInstanceResponse })
  create(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Body() dto: CreateFormInstanceDto) {
    return this.service.create(tenant.companyId, id, dto, actorOf(tenant, req));
  }

  @Get(':formId')
  @RequiresAction('view')
  @ApiOkResponse({ type: FormInstanceResponse })
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.get(tenant.companyId, id, formId);
  }

  @Put(':formId/values')
  @RequiresAction('record')
  @ApiOkResponse({ type: FormInstanceResponse })
  setValues(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string, @Body() dto: SetFormValuesDto) {
    return this.service.setValues(tenant.companyId, id, formId, dto.values);
  }

  /** ⚖️ الختمُ باليد سقط (توجيه ٢٨٧ ⑨): يُردّ `409` مسمّىً، والختمُ يقع حين يوقّع المستأجر. */
  @Post(':formId/seal')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormInstanceResponse })
  seal(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.seal(tenant.companyId, id);
  }

  /**
   * الموظّفُ يوقّع (صورةُ رسمٍ ساكنة) ثم يُرسل الرابطُ إلى جوال المستأجر المسجَّل — **والشخصُ الاعتباريّ إلى ممثّله** بحقوله وصورة سنده
   * الاختيارية (توجيه ٢٨٧ ⑥).
   */
  @Post(':formId/send')
  @RequiresAction('review')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'drawing', maxCount: 1 },
        { name: 'authorityDocument', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE_BYTES } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: FormSentResponse })
  send(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Body() dto: SendFormDto,
    @UploadedFiles() files: { drawing?: Express.Multer.File[]; authorityDocument?: Express.Multer.File[] } | undefined,
  ) {
    const representative =
      dto.representativeName || dto.representativeMobile || dto.authorityType || dto.authorityRef
        ? {
            name: dto.representativeName ?? '',
            mobile: dto.representativeMobile ?? '',
            authorityType: dto.authorityType ?? '',
            authorityRef: dto.authorityRef ?? '',
            nationalId: dto.representativeNationalId ?? null,
          }
        : null;
    return this.service.send(tenant.companyId, id, formId, actorOf(tenant, req), files?.drawing?.[0], metaOf(req), representative, files?.authorityDocument?.[0]);
  }

  /**
   * ⚖️ **التوقيعُ الورقيّ** (توجيه ٢٨٧ ⑧): صورةُ الورقة الموقَّعة (`paper`) ويشهد عليها الموظّف، ومعها رسمُ الموظّف (`drawing`) إن لم يوقّع
   * من قبل؛ والختمُ في الطلب نفسِه.
   */
  @Post(':formId/paper')
  @RequiresAction('review')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'paper', maxCount: 1 },
        { name: 'drawing', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE_BYTES } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: FormPaperSignedResponse })
  paper(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Body() dto: PaperSignFormDto,
    @UploadedFiles() files: { paper?: Express.Multer.File[]; drawing?: Express.Multer.File[] } | undefined,
  ) {
    return this.service.paper(tenant.companyId, id, formId, actorOf(tenant, req), files?.paper?.[0], files?.drawing?.[0], dto.signerName ?? null, metaOf(req));
  }

  /** ⚖️ **رابطُ جهاز الموظّف** (توجيه ٢٨٧ ⑤): يعود للموظّف ولا يُرسل، والخطوتان نفسُهما. */
  @Post(':formId/device-link')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormDeviceLinkResponse })
  deviceLink(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.deviceLink(tenant.companyId, id, formId, actorOf(tenant, req));
  }

  /**
   * ⚖️ **طلبُ مستلمٍ بديل** (توجيه ٢٨٧ ⑦ · `ق-١٦٣٥` ⑩: «المراجعة» لطلب البديل): يصل جوالَ المستأجر رابطُ الموافقة، ورمزُه لا يمرّ بالموظّف
   * (`ق-١٦٧٢`).
   */
  @Post(':formId/substitute')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormSentResponse })
  requestSubstitute(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Param('formId') formId: string, @Body() dto: RequestSubstituteDto) {
    return this.service.requestSubstitute(tenant.companyId, id, formId, actorOf(tenant, req), dto);
  }

  @Post(':formId/resend')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormSentResponse })
  resend(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.resend(tenant.companyId, id, formId, actorOf(tenant, req));
  }

  @Post(':formId/revisions')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: FormInstanceResponse })
  revise(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.revise(tenant.companyId, id, formId, actorOf(tenant, req));
  }

  @Get(':formId/events')
  @RequiresAction('view')
  @ApiOkResponse({ type: FormSigningEventResponse, isArray: true })
  events(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.events(tenant.companyId, id, formId);
  }

  @Get(':formId/signatures/:signatureId/image')
  @RequiresAction('view')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async signatureImage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Param('signatureId') signatureId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.evidence(tenant.companyId, id, formId, { signatureId });
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.buffer, { type: file.mime, length: file.buffer.length, disposition: 'inline; filename="signature"' });
  }

  @Get(':formId/objection/photo')
  @RequiresAction('view')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async objectionPhoto(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.service.evidence(tenant.companyId, id, formId, { objection: true });
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.buffer, { type: file.mime, length: file.buffer.length, disposition: 'inline; filename="objection"' });
  }

  @Get(':formId/verify')
  @RequiresAction('view')
  @ApiOkResponse({ type: FormVerificationResponse })
  verify(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.verify(tenant.companyId, id, formId);
  }

  @Delete(':formId')
  @RequiresAction('record')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.remove(tenant.companyId, id, formId);
  }
}
