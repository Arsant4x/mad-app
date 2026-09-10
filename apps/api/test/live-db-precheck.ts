import { assertDbAtLatestMigration } from './live-db-migrations';
import { assertClientMatchesSchema } from './prisma-client-fingerprint';

/**
 * `ق-٢٠٨` — **يُوصَل الشرطُ بكل حارسٍ حيّ من اسمه**، لا بيدٍ في كل ملف: ما يُلصَق في
 * أحد عشر ملفاً يُنسى في الثاني عشر. يعمل من `setupFilesAfterEnv` فيعرف ملفَ الاختبار
 * الجاري (`expect.getState().testPath`)، وإن كان حارساً حيّاً (`*.live.spec.ts`) وثمّة
 * قاعدةٌ مضبوطة سجّل `beforeAll` يتحقّق أن القاعدة على آخر هجرة قبل أي حكم.
 *
 * بلا `DATABASE_URL` لا شيءَ يُسجَّل — فالحرّاسُ الحيّة تتخطّى نفسها أصلاً حين لا قاعدة.
 * والحارسُ الساكن `src/common/live-guard-precheck.spec.ts` يوجب بقاءَ هذا الملف موصولاً
 * في `package.json`، وأن كل اختبارٍ يفتح عميلَ قاعدةٍ يحمل اسماً يمرّ من هنا.
 */
/**
 * ⭐ **وبصمةُ العميل قبل كل شيء** (`ق-٤١٧`): **مصدرٌ واحد يُنادى من هنا**
 * (`ق-٤٢١`) — **فما يُلصَق في كل مُهيِّئ يُنسى في أحدها**.
 *
 * ⚠️ **ولا تُقيَّد بـ`DATABASE_URL`**: العطلُ الذي وقع ثلاثاً **أسقط البذرة**،
 * **وحرّاسٌ نصّيةٌ تستورد `@prisma/client` تسقط برسالةٍ خام** — فالنسبةُ
 * الخاطئة تقع قبل أن تُفتح قاعدة.
 */
assertClientMatchesSchema();

const testPath = (expect.getState().testPath ?? '').split('\\').join('/');
if (/\.live\.spec\.ts$/.test(testPath) && process.env.DATABASE_URL) {
  beforeAll(async () => {
    await assertDbAtLatestMigration();
  }, 30_000);
}
