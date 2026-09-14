import 'reflect-metadata'; // `@Type` في شكل الدفعات يحتاجه خارج `Nest`
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReversePaymentDto } from '../payments/dto/payment.dto';
import { CloseShiftDto } from './dto/pos.dto';
import { settlementDate } from './pos.service';

/**
 * `ق-٧٣٦` — **المساران المؤرَّخان بيوم الخادم صارا بيوم التاجر**: تسويةُ المناوبة بانحراف الطرفية، وعكسُ الدفعة
 * بتاريخٍ من الطلب.
 *
 * الواقعة: بين `00:00` و`03:00` بتوقيت المملكة كان القيدُ يقع في اليوم السابق (`UTC`) — وإن كان شهرُه مقفلاً
 * رُفض («الفترةُ مقفلة») على فعلٍ في أوّل يومٍ من الشهر التالي: إزعاجٌ لا فساد، لكنه ثلاثُ ساعاتٍ كلَّ يوم.
 * **يُثبَت على لحظةٍ ثابتة** لا على ساعة الجهاز — فاختبارٌ يمرّ في النهار ويسقط في الفجر ليس اختباراً.
 */
describe('يومُ التسوية بتقويم الكاشير — لحظةٌ واحدة على طرفَي منتصف الليل (ق-٧٣٦)', () => {
  // 2026-06-30 22:30 UTC = 2026-07-01 01:30 بتوقيت المملكة (+180)
  const instant = new Date('2026-06-30T22:30:00.000Z');

  it('⭐ بانحراف المملكة (+180) يقع الإقفالُ في 1 يوليو — لا في 30 يونيو', () => {
    expect(settlementDate(180, instant).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('وبلا انحرافٍ (طرفيةٌ أقدم) يبقى يومُ UTC صراحةً — 30 يونيو — لا تخميناً', () => {
    expect(settlementDate(undefined, instant).toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(settlementDate(0, instant).toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('وانحرافٌ سالب (غرب غرينتش −300) يقع قبلَ يوم UTC — فالدالّةُ تتبع الطرفيةَ في الاتجاهين', () => {
    const early = new Date('2026-07-01T02:00:00.000Z'); // 2026-06-30 21:00 بتوقيت −300
    expect(settlementDate(-300, early).toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('الشكلان يقبلان الحقلَ الجديد ويرفضان انحرافاً مستحيلاً وتاريخاً غيرَ تاريخ', async () => {
    expect(await validate(plainToInstance(CloseShiftDto, { declaredClosing: 0, closedOffsetMin: 180 }))).toEqual([]);
    expect((await validate(plainToInstance(CloseShiftDto, { declaredClosing: 0, closedOffsetMin: 900 }))).map((e) => e.property)).toEqual(['closedOffsetMin']);
    expect(await validate(plainToInstance(ReversePaymentDto, { date: '2026-07-01' }))).toEqual([]);
    expect((await validate(plainToInstance(ReversePaymentDto, { date: 'tomorrow' }))).map((e) => e.property)).toEqual(['date']);
  });
});
