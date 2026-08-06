import { IsInt, Max, Min } from 'class-validator';

export class RenewSubscriptionDto {
  /// How many months to add. Bounded so a stray value can't push the end date
  /// centuries out. Payment is a separate (deferred) step — this only extends.
  @IsInt()
  @Min(1)
  @Max(36)
  months!: number;
}
