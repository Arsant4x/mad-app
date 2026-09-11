import { IsString, MaxLength, MinLength } from 'class-validator';

/** تعليقٌ بلا انتقال (`SPEC 1.11` · `ق-٥٣٢`) — نصٌّ غيرُ فارغ، والحالةُ لا تُمسّ. */
export class CommentTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}
