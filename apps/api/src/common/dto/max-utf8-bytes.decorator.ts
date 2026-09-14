import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * **حدٌّ بالبايتات لا بالحروف** — `@MaxLength` يعدّ الحروفَ، ومواصفةُ `TLV` الهيئة تعدّ **بايتات `UTF-8`**:
 * الحرفُ العربيُّ بايتان، فاسمٌ من `130` حرفاً عربياً يمرّ `@MaxLength(255)` ويكسر رمزَ الاستجابة (`ق-٧٣٥`).
 * يُقاس هنا ما يُقاس هناك — بالدالّة نفسِها (`Buffer.byteLength`).
 */
export function MaxUtf8Bytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxUtf8Bytes',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options,
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= max,
      },
    });
  };
}
