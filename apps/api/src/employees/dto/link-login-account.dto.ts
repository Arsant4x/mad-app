import { IsUUID, ValidateIf } from 'class-validator';

/**
 * ⚖️ **ربطُ الموظّف بحساب دخوله — صراحةً من المالك** (`ق-١٤٤٥`): معرّفُ الحساب يربط، و`null` يفكّ. **ولا يُترك** (غيابُه ليس
 * `null`) — فالطلبُ يقول ما يريد. والحسابُ لموظّفٍ واحد، **ولا ربطَ بالاسم**.
 */
export class LinkLoginAccountDto {
  @ValidateIf((o: LinkLoginAccountDto) => o.companyUserId !== null)
  @IsUUID()
  companyUserId!: string | null;
}
