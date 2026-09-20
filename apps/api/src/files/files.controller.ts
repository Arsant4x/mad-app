import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { FileKeyDto } from './dto/file-key.dto';
import { FilesService, MAX_FILE_BYTES } from './files.service';

/** No @RequiresScreen: this is shared infrastructure, not a screen. Any
 * authenticated tenant actor can store its own company's files; which
 * *feature* may attach them is enforced by that feature's own screen guard
 * — declared as such (`ق-١١٩٨`/①).
 *
 * ⛔ **ولا حذفَ هنا** (`ق-١٢٣٤`): كان `DELETE /files?key=` مفتوحاً لكلّ فاعلٍ في المنشأة —
 * يحذف الكائنَ من المخزن بمعرفة مفتاحه، ومفاتيحُ المرفقات تصل كلَّ من **يطّلع** على
 * المستند، فموظّفٌ بصلاحية اطّلاعٍ كان يحذف كائنَ مرفقٍ رآه ويبقى صفُّه يتيماً؛
 * **وصفرُ مستدعٍ له في الواجهة**. الحذفُ يمرّ بمسار الميزة التي تملك المرفق (تحذف
 * الصفَّ والكائنَ معاً تحت حارس شاشتها)، و`FilesService.remove` يبقى لها لا لمسار عامّ. */
@Controller('files')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('بنيةُ ملفّاتٍ مشتركة لا شاشة: كلُّ فاعلٍ يخزّن ملفّاتِ منشأته، ومن يربطها بمستندٍ يحرسه حارسُ شاشةِ ذلك المستند')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(@CurrentTenant() tenant: TenantContext, @UploadedFile() file: Express.Multer.File) {
    return this.filesService.upload(tenant.companyId, file);
  }

  @Get('download-url')
  downloadUrl(@CurrentTenant() tenant: TenantContext, @Query() dto: FileKeyDto) {
    return this.filesService.downloadUrl(tenant.companyId, dto.key);
  }
}
