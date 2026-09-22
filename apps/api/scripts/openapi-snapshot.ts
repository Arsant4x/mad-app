import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { contractOf } from '../src/common/openapi-contract.util';
import { buildOpenApiDocument } from '../src/common/openapi-document';
import { applyApiVersioning } from '../src/common/versioning';

/**
 * توليدُ لقطة عقد الواجهة (`ق-١٢٩١` · ي/⑫A2) — **تُشغَّل عمداً حين يُقصَد التغيير**.
 *
 *   من `apps/api`:  npx ts-node scripts/openapi-snapshot.ts
 *
 * فيظهر ما حُذف أو تغيّر **في فرق الطلب** بدل أن يمرّ صامتاً — وهو الغرض.
 *
 * ⚠️ **وهذا السكربت يحتاج قاعدةً، والحارسُ لا**: `NestFactory.create` يُقلع التطبيقَ
 * كاملاً (فيتصل `Prisma`)، بينما الحارسُ يبني وحدةَ اختبارٍ بلا `init` — والماسحُ يقرأ
 * الوسومَ لا المسارات المسجَّلة. **والتوليدُ فعلُ مطوّرٍ مقصود، فالقاعدةُ عنده حاضرة.**
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  applyApiVersioning(app);
  const contract = contractOf(buildOpenApiDocument(app));
  const out = join(__dirname, '..', '..', '..', 'docs', 'openapi.snapshot.json');
  writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`عملياتٌ في اللقطة: ${Object.keys(contract).length} · كُتبت ${out}`);
  await app.close();
}

void main();
