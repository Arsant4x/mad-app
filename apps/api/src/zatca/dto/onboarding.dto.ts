import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

const ENVIRONMENTS = ['SANDBOX', 'SIMULATION', 'PRODUCTION'] as const;

export class StartOnboardingDto {
  /// Defaults to SANDBOX so a merchant experimenting can never accidentally
  /// request a production certificate.
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: (typeof ENVIRONMENTS)[number];

  /// All optional: sensible values are derived from the company profile when
  /// omitted, so a merchant can onboard without answering technical questions.
  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  /// Four flags for the invoice types this unit issues; "1100" = standard and
  /// simplified, which is what a general-purpose accounting platform needs.
  @IsOptional()
  @IsString()
  @Length(4, 4)
  invoiceType?: string;
}

export class SubmitOtpDto {
  /// From the merchant's Fatoora portal. Short-lived and single-use, so it is
  /// passed straight to the authority and never stored.
  @IsString()
  @IsNotEmpty()
  otp!: string;
}
