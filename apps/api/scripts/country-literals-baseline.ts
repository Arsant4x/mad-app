import { writeFileSync } from 'fs';
import { join } from 'path';
import { DEBT_FILE, REPO_ROOT, scanCountryLiterals } from '../src/common/country-literals.util';

/**
 * يكتب دَينَ العلامات السعودية الحرفية خارج وحدتها (`ق-١٣٥٠`) **من المسح نفسِه الذي يقرؤه الحارس** — فلا قائمتان تفترقان.
 *
 * **يُشغَّل مرّةً عند بناء الحارس**، ثم **لا يُشغَّل لإسكاته**: ملفٌّ زادت علاماتُه يُعلَن بيدٍ بحجّته، وملفٌّ نقصت يُنقص عددُه —
 * وإعادةُ الكتابة الشاملة تُخفي الزيادةَ في جملة النقص. (الاستعمال من `apps/api`: `npx ts-node scripts/country-literals-baseline.ts`)
 */
const scan = scanCountryLiterals();
const REASON = 'قائمٌ قبل القاعدة الملزمة (ق-١٣٥٠) — معدودٌ في مسح التوطين (docs/domain-scan/25)، وينقص ولا يزيد';
const files = Object.fromEntries(
  Object.entries(scan.outside)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => [file, { count, reason: REASON }]),
);
const total = Object.values(scan.outside).reduce((t, n) => t + n, 0);
writeFileSync(
  join(REPO_ROOT, DEBT_FILE),
  JSON.stringify(
    {
      rule: 'ق-١٣٥٠',
      note: 'العلاماتُ السعودية الحرفية في شيفرة الإنتاج خارج حدود الوحدة السعودية كما هي اليوم — دَينٌ معلَنٌ ينقص ولا يزيد. الحارس: apps/api/src/common/country-literals.spec.ts',
      measured: { filesScanned: scan.filesScanned, outsideFiles: Object.keys(files).length, outsideLines: total, insideLines: scan.insideLines },
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(`files=${scan.filesScanned} outsideFiles=${Object.keys(files).length} outsideLines=${total} insideLines=${scan.insideLines}`);
