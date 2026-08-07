import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { AdminDeletionRequestsController, DeletionRequestsController } from './deletion-requests.controller';
import { DeletionRequestsService } from './deletion-requests.service';

@Module({
  // CompaniesModule provides the one existing, cascade-tested company removal
  // path — execution reuses it rather than growing a second delete.
  imports: [CompaniesModule],
  controllers: [DeletionRequestsController, AdminDeletionRequestsController],
  providers: [DeletionRequestsService],
})
export class DeletionRequestsModule {}
