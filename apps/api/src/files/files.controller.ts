import {
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { TenantGuard } from '../common/tenant/tenant.guard';
import { FileKeyDto } from './dto/file-key.dto';
import { FilesService, MAX_FILE_BYTES } from './files.service';

/** No @RequiresScreen: this is shared infrastructure, not a screen. Any
 * authenticated tenant actor can store its own company's files; which
 * *feature* may attach them is enforced by that feature's own screen guard. */
@Controller('files')
@UseGuards(JwtAuthGuard, TenantGuard)
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

  @Delete()
  @HttpCode(204)
  remove(@CurrentTenant() tenant: TenantContext, @Query() dto: FileKeyDto) {
    return this.filesService.remove(tenant.companyId, dto.key);
  }
}
