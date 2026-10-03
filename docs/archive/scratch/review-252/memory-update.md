# تحديثُ ذاكرة `timeout-figures-are-the-cap` بعد ٢٥٢

يُضاف إلى الملفّ (لا يُنشأ ملفٌّ جديد — القاعدةُ نفسُها بحلٍّ بنيويٍّ الآن):

2026-09-22 (ق-١٢٨٥): المهلةُ لم تعد افتراضاً. كلُّ حزمةٍ في `apps/api/test/*.e2e-spec.ts`
تُعلن `jest.setTimeout(3× المقيس)` وحارسٌ في `src/common/test-budget-declared.spec.ts`
يمنع حزمةً جديدةً بلا إعلان. فأيُّ سقوطٍ عند `5,0xx ms` بعد اليوم **ليس مهلةَ jest** بل
**مهلةَ معاملة Prisma** (`Transaction already closed` · `Transaction not found`) — وعلاجُها
عملٌ أقلُّ في المعاملة لا ميزانية.

وأداةُ القياس: `jest --json` **لا يحمل `perfStats`** (الحقلان `startTime`/`endTime`)،
**ويعطي صفراً لحزمةٍ يسقط خطّافُها**؛ وسطرُ `PASS/FAIL … (N s)` المطبوع **لا يُطبع
للحزمة السريعة** (تحت ~٣ ث). ⇒ القياسُ `max(الاثنين)` — وكلُّ مصدرٍ وحدَه أعمى عن صنف.
والسكربتات: `D:\mad-app-scratch\review-252\{measure-chunked.sh, merge-times.mjs,
apply-budgets2.mjs, verify-budgets.mjs}`.
