import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { FormInstanceResponse, FormVerificationResponse } from '../forms/dto/form-instance-responses.dto';
import { CreateFormInstanceDto, SetFormValuesDto } from '../forms/dto/form-instance.dto';
import type { FormActor } from '../forms/form-instances.service';
import { ContractFormsService } from './contract-forms.service';

/** الفاعلُ كما يُختم على السجلّ: معرّفُ ملفّه واسمُ دخوله. */
function actorOf(tenant: TenantContext, req: Request): FormActor {
  return { id: tenant.profileId, name: (req.user as JwtPayload).username };
}

/**
 * ⚖️ **نماذجُ العقد في شاشة العقود** (توجيه ٢٧٨ · `ق-١٦٣٦`). الفاعلُ موظّفُ المنشأة بما منحه المالك: **التعبئةُ «تسجيل»**،
 * **والختمُ «مراجعة»** (`ق-١٦٣٥` ⑩: «المراجعة» لطلب البديل وللختم)، والقراءةُ «اطّلاع».
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

  @Post(':formId/seal')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormInstanceResponse })
  seal(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string, @Param('formId') formId: string) {
    return this.service.seal(tenant.companyId, id, formId, actorOf(tenant, req));
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
