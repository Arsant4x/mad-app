import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto';

export class CreateCreditNoteDto {
  /** Mandatory, not a nicety: ZATCA rejects a 381 without its reason
   * (BR-KSA-17), so an empty one must never reach the database. */
  @IsString()
  @IsNotEmpty()
  reason!: string;

  /** The client's local calendar date. Server time is UTC and the column is a
   * DATE — a note issued at 1 AM Riyadh time would otherwise be stamped with
   * yesterday. Falls back to the server date when omitted. */
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /**
   * **تاريخ الواقعة** — يوم قبول الإعادة، لا يوم كتابة المستند.
   *
   * والمهلة النظامية تُحسب منه (١٥ يوماً من نهاية شهره، م٥٤). فمن يسجّل إعادةً
   * وقعت الشهر الماضي يظهر إشعارُه **متأخّراً** كما هو في الواقع، لا «في الموعد»
   * لأن المستند كُتب اليوم. وحين يُهمَل فالواقعة يوم الإصدار.
   */
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  /** Omitted = full credit, copying the original invoice's lines verbatim.
   * Provided = partial credit (e.g. one returned item of three). */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines?: InvoiceLineDto[];
}
