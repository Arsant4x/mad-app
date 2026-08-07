import { IsBoolean } from 'class-validator';

/** Shared by every archivable master record: one boolean, both directions. */
export class SetArchivedDto {
  @IsBoolean()
  archived!: boolean;
}
