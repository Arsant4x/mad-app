import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  // Exported so the features waiting on storage (contract attachments,
  // company logo, claim photos, handover forms) can reuse this service
  // instead of each talking to S3 directly.
  exports: [FilesService],
})
export class FilesModule {}
