import { PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * بوابة الموجة L0-4 — **إثباتٌ حيّ** أن الكمية تُخزَّن بثلاث خانات.
 *
 * ## لماذا حيّاً ولا يكفي فحص المخطَّط
 *
 * `rounding.spec.ts` يثبت أن `schema.prisma` يعلن `Decimal(18,3)`. **والإعلان
 * ليس التنفيذ**: عمودٌ مُعلَن ولم يُرحَّل يترك القاعدة على `numeric(14,2)`،
 * فيقرّب الرقم بصمت والاختبار البنيوي أخضر. وهذه هي الحالة التي وقعت فعلاً
 * قبل هذه الموجة: أُرسلت `100.125` فخُزّنت `100.13`.
 *
 * ## ولماذا معاملة تُلغى
 *
 * المجسّ ينشئ صنفاً ومستودعاً وحركة، ثم **يرمي عمداً** فتُلغى المعاملة. فلا
 * صفَّ يبقى في قاعدة مشتركة — والبديل (الحذف بعد الفحص) يترك بقايا كلما سقط
 * توكيدٌ في المنتصف.
 *
 * ⚠️ **والسياق المستأجِر لازم**: الجداول الثلاثة محميّة بـRLS، وقراءةٌ خارجه
 * تعود **فارغةً بنجاح** — أي أن المجسّ سيقرأ «لا شيء» ويظنّه نتيجة.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

/** إشارة إلغاء — صنفٌ خاص كي لا يبتلع `rejects.toThrow` خطأً حقيقياً. */
class RollbackSignal extends Error {}

d('L0-4 — دقّة الكمية على قاعدة حيّة', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    // منشأة قائمة من البذرة — لا تُركَّب واحدة هنا: تركيبها يعيد بناء مسار
    // التسجيل داخل اختبار، فيصير المجسّ يحرس نسخته من المسار لا المسار.
    const company = await prisma.company.findFirstOrThrow({ select: { id: true } });
    companyId = company.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** ينشئ الثلاثة داخل معاملة ثم يُلغيها، ويعيد ما قرأه قبل الإلغاء. */
  const roundTrip = async (qty: string): Promise<string> => {
    let stored = '';
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        const warehouse = await tx.warehouse.create({ data: { companyId, name: 'مستودع مجسّ الدقة' } });
        const product = await tx.product.create({ data: { companyId, name: 'صنف مجسّ الدقة' } });
        const movement = await tx.stockMovement.create({
          data: { companyId, productId: product.id, warehouseId: warehouse.id, type: 'IN', qty, date: new Date() },
        });
        const read = await tx.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, select: { qty: true } });
        stored = read.qty.toString();
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);
    return stored;
  };

  it('⭐ 100.125 تُخزَّن كما هي — لا 100.13', async () => {
    expect(await roundTrip('100.125')).toBe('100.125');
  });

  it('⭐ والحدّ عند ثلاث خانات فعلاً — لا «أي دقّة تمرّ»', async () => {
    /**
     * الوجه الثاني للتوكيد الأول: لو صار العمود `Decimal(18,6)` سهواً لمرّ
     * الأول ومرّ هذا كذلك بقيمة `100.1234`. فيُفحص **موضع الحدّ** لا وجوده:
     * الخانة الرابعة تُقرَّب، وهو ما يثبت أن المقياس ثلاثة بالضبط.
     */
    expect(await roundTrip('100.1234')).toBe('100.123');
  });

  it('⭐ ولا يبقى صفٌّ بعد المجسّ — الإلغاء وقع فعلاً', async () => {
    // §8.8: يُفحص وقوع الإلغاء قبل الوثوق بنتيجة ما قبله.
    const left = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return tx.product.count({ where: { name: 'صنف مجسّ الدقة' } });
    });
    expect(left).toBe(0);
  });
});
