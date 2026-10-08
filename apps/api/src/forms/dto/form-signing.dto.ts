import { ApiProperty } from '@nestjs/swagger';
import { FormInstanceStatus, FormLinkPurpose, FormSignatureChannel, FormSignatureLevel, FormSignerRole } from '@mad-app/db';
import { IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { FormInstanceResponse } from './form-instance-responses.dto';

/** رمزُ التحقّق كما يكتبه العميل. */
export class VerifyFormOtpDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

/** الاعتراض: ملاحظةٌ نصّية (والصورةُ ملفٌّ في الطلب نفسِه). */
export class FormObjectionDto {
  @IsString()
  @MaxLength(2000)
  note!: string;
}

export class FormLinkMethodsResponse {
  otp!: boolean;
  nafath!: boolean;
}

/** فتحُ الرابط: حالُه وطرقُ الدخول وحدَها — لا شيءَ من النموذج قبل الدخول (`ق-١٦٢٠`). */
export class FormLinkOpenResponse {
  @ApiProperty({ enum: ['ACTIVE', 'CLOSED'] })
  state!: 'ACTIVE' | 'CLOSED';
  @ApiProperty({ enum: FormLinkPurpose })
  purpose!: FormLinkPurpose;
  methods!: FormLinkMethodsResponse;
  identityProvider!: string | null;
}

export class FormOtpIssuedResponse {
  challengeId!: string;
  expiresAt!: string;
  mobileMasked!: string;
}

export class FormSessionResponse {
  session!: string;
  expiresAt!: string;
}

export class FormNafathStartResponse {
  displayCode!: string;
}

export class FormNafathPollResponse {
  @ApiProperty({ enum: ['PENDING', 'APPROVED'] })
  state!: 'PENDING' | 'APPROVED';
  session!: FormSessionResponse | null;
}

export class FormPublicItemResponse {
  lineNo!: number;
  label!: string;
  itemType!: string;
  unit!: string | null;
  text!: string | null;
  number!: string | null;
  bool!: boolean | null;
  note!: string | null;
}

export class FormPublicSignatureResponse {
  @ApiProperty({ enum: FormSignerRole })
  role!: FormSignerRole;
  @ApiProperty({ enum: FormSignatureLevel })
  level!: FormSignatureLevel;
  @ApiProperty({ enum: FormSignatureChannel })
  channel!: FormSignatureChannel;
  signerName!: string;
  signedAt!: string;
}

export class FormPublicSealResponse {
  no!: string;
  contentHash!: string;
  sealedAt!: string;
  valid!: boolean | null;
}

/** النموذجُ بعد الدخول: البنودُ والقيمُ والتواقيعُ والمدّة، ولا معرّفاتٍ داخلية ولا مبالغ. */
export class FormPublicViewResponse {
  @ApiProperty({ enum: FormLinkPurpose })
  purpose!: FormLinkPurpose;
  @ApiProperty({ enum: FormInstanceStatus })
  status!: FormInstanceStatus;
  templateName!: string;
  formTypeName!: string;
  formDate!: string;
  revisionNo!: number;
  signDeadline!: string | null;
  nafathRequired!: boolean;
  items!: FormPublicItemResponse[];
  signatures!: FormPublicSignatureResponse[];
  seal!: FormPublicSealResponse | null;
}

export class FormSignedResponse {
  @ApiProperty({ enum: FormInstanceStatus })
  status!: FormInstanceStatus;
  @ApiProperty({ enum: ['SENT', 'FAILED'] })
  finalCopy!: 'SENT' | 'FAILED';
}

export class FormObjectedResponse {
  @ApiProperty({ enum: FormInstanceStatus })
  status!: FormInstanceStatus;
}

/** إرسالُ الموظّف: النموذجُ وحالُ الرسالة. */
export class FormSentResponse {
  form!: FormInstanceResponse;
  @ApiProperty({ enum: ['SENT', 'FAILED'] })
  delivery!: 'SENT' | 'FAILED';
}

export class FormSigningEventResponse {
  kind!: string;
  actor!: string;
  recipientMasked!: string | null;
  note!: string | null;
  at!: string;
  revisionNo!: number;
}
