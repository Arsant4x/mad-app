import { IsOptional, IsString } from 'class-validator';

/**
 * The optional branch a document belongs to. Omitting it means company-wide,
 * which is what a single-location business always wants — so no existing
 * caller has to change, and rows created before branches existed stay valid.
 */
export class BranchFieldDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
