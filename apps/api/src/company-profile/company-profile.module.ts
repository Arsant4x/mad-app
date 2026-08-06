import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';

@Module({
  // FilesModule supplies FilesService, used to delete a replaced logo.
  imports: [FilesModule],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
})
export class CompanyProfileModule {}
