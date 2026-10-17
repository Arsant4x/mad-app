import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { PlatformRole } from '@mad-app/db';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IdempotencyExempt } from '../common/idempotency/idempotency';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { FormTemplateResponse, FormTemplateRowResponse, FormTypeResponse } from './dto/form-responses.dto';
import { CreateFormTemplateDto, CreateFormTypeDto, UpdateFormTemplateDto, UpdateFormTypeDto } from './dto/form-template.dto';
import { FormTemplatesService, type FormScope } from './form-templates.service';

const PLATFORM: FormScope = { companyId: null };

/**
 * ⚖️ **أنواعُ النماذج — كتالوجُ المنصّة في لوحة المطوّر** (توجيه ٢٧٨ · `ق-١٦٣٤` · قرارُ الخطّة ٤٣).
 *
 * ⚖️ **لمالك المنصّة ومعه دورُ «الامتثال»** (`ق-١٦٤١`/١، رابعاً بترتيب `ق-١٦٤٥`/٣): القالبُ العامُّ يحمل نصوصاً نظامية، فيشارك
 * الامتثالُ المالكَ فيه؛ والمالكُ يمرّ كلَّ مسارٍ بتعريف المزخرِف، والأدوارُ الأخرى تُردّ.
 */
@Controller('admin/form-types')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@RequiresPlatformRole(PlatformRole.COMPLIANCE)
@IdempotencyExempt('the platform catalogue of form types: no numbered document and no posting')
export class AdminFormTypesController {
  constructor(private readonly service: FormTemplatesService) {}

  @Get()
  @ApiOkResponse({ type: FormTypeResponse, isArray: true })
  list() {
    return this.service.listTypes();
  }

  @Post()
  @ApiCreatedResponse({ type: FormTypeResponse })
  create(@Body() dto: CreateFormTypeDto) {
    return this.service.createType(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FormTypeResponse })
  update(@Param('id') id: string, @Body() dto: UpdateFormTypeDto) {
    return this.service.updateType(id, dto);
  }
}

/**
 * ⚖️ **القوالبُ العامّة الجاهزة — تملكها المنصّة** (`CLAUDE.md §3.5`: لوحةُ المطوّر «القوالبُ العامّة الجاهزة فقط»).
 * مُصدَّرة: المسوّدةُ تُحرَّر ثم تُنشر، والمنشورُ يُبنى بعده إصدارٌ جديد ولا يُعدَّل. ولمالك المنصّة ودور «الامتثال» كالأنواع.
 */
@Controller('admin/form-templates')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@RequiresPlatformRole(PlatformRole.COMPLIANCE)
@IdempotencyExempt('the platform form templates: no numbered document and no posting')
export class AdminFormTemplatesController {
  constructor(private readonly service: FormTemplatesService) {}

  @Get()
  @ApiOkResponse({ type: FormTemplateRowResponse, isArray: true })
  list() {
    return this.service.list(PLATFORM);
  }

  @Get(':id')
  @ApiOkResponse({ type: FormTemplateResponse })
  get(@Param('id') id: string) {
    return this.service.get(PLATFORM, id);
  }

  @Post()
  @ApiCreatedResponse({ type: FormTemplateResponse })
  create(@Body() dto: CreateFormTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FormTemplateResponse })
  update(@Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.service.update(PLATFORM, id, dto);
  }

  @Post(':id/publish')
  @ApiCreatedResponse({ type: FormTemplateResponse })
  publish(@Param('id') id: string) {
    return this.service.publish(PLATFORM, id);
  }

  @Post(':id/versions')
  @ApiCreatedResponse({ type: FormTemplateResponse })
  newVersion(@Param('id') id: string) {
    return this.service.newVersion(PLATFORM, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(PLATFORM, id);
  }
}
