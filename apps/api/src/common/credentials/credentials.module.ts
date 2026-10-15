import { Global, Module } from '@nestjs/common';
import { CredentialChangeService } from './credential-change.service';

/** Global, because credentials change in several modules (auth, second factor, companies, company users) and all must go through one path. */
@Global()
@Module({
  providers: [CredentialChangeService],
  exports: [CredentialChangeService],
})
export class CredentialsModule {}
