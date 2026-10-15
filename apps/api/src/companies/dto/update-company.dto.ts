import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * What the platform changes on a company account: its name and its template.
 *
 * The owner's login name and password are not here: only the owner sets them, and the platform can
 * send the owner a reset link instead (POST /companies/:id/password-reset). Nor are subStart and
 * subEnd: the subscription has its own route for the finance role. Sending any of them is refused
 * with 400 by name, because the global pipe forbids unknown fields.
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  orgName?: string;

  @IsOptional()
  @IsString()
  permissionTemplateId?: string;
}
