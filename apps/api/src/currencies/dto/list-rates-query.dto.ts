import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/** `GET /currencies/rates` — ترشيحٌ بالرمزين مع الترقيم بالاختيار (`ق-١٢٣٦`). */
export class ListRatesQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(3)
  fromCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  toCode?: string;
}
