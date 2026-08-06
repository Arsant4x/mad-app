import { IsNotEmpty, IsString } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

export class FileKeyDto {
  @IsString()
  @IsNotEmpty({ message: MSG.file_key_required })
  key!: string;
}
