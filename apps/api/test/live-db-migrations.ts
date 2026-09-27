import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@mad-app/db';

/**
 * `ق-٢٠٨` — **الحارسُ الحيّ يتحقّق أن القاعدة على آخر هجرة قبل أن يحكم.**
 *
 * الواقعة (2026-09-05): حارسُ تغطية RLS سقط على قاعدة التطوير وسببُه **إحدى عشرة
 * هجرةً لم تُطبَّق** — لا عزلٌ مثقوب. «أداةٌ تقيس على حالةٍ متقادمة تُنتج نتيجةً
 * صحيحة لسؤالٍ آخر» (عائلة §8.7 بوجهٍ ثالث). فقبل أي حكمٍ يُقارَن جدولُ
 * `_prisma_migrations` بمجلّدات `prisma/migrations` **في الاتجاهَين**:
 *   · على القرص ولم تُطبَّق  ⇒ القاعدة **متأخّرة**؛
 *   · في القاعدة ولا يعرفها المصدر ⇒ القاعدة **على مخطَّطٍ غير مخطَّطنا**.
 * وكلاهما يُسقط الحارس **برسالةٍ تسمّي الهجرات** — فلا سقوطَ غامضاً بعد اليوم.
 */
export const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

export interface MigrationDrift {
  /** على القرص ولم تُطبَّق على القاعدة. */
  behind: string[];
  /** مطبَّقةٌ على القاعدة ولا مجلّدَ لها على القرص. */
  unknown: string[];
}

/** مجلّدات الهجرات على القرص — مرتّبةً؛ `migration_lock.toml` ملفٌ لا مجلّد فلا يُحتسب. */
export function migrationsOnDisk(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

export function migrationDrift(onDisk: string[], applied: string[]): MigrationDrift {
  const disk = new Set(onDisk);
  const db = new Set(applied);
  return {
    behind: onDisk.filter((m) => !db.has(m)).sort(),
    unknown: applied.filter((m) => !disk.has(m)).sort(),
  };
}

/** رسالةُ السقوط — أو `null` إن تطابقت القاعدةُ والمصدر. */
export function driftMessage(drift: MigrationDrift): string | null {
  if (drift.behind.length === 0 && drift.unknown.length === 0) return null;
  const lines = ['⛔ الحارسُ الحيّ لا يحكم على قاعدةٍ ليست على آخر هجرة (ق-٢٠٨):'];
  if (drift.behind.length > 0) lines.push(`  · القاعدة متأخّرة بـ${drift.behind.length} هجرة: ${drift.behind.join(' · ')}`);
  if (drift.unknown.length > 0) lines.push(`  · وتحمل ${drift.unknown.length} هجرةً لا يعرفها المصدر: ${drift.unknown.join(' · ')}`);
  lines.push('  طبّق `prisma migrate deploy` على هذه القاعدة (أو أصلح صفوفَها اليتيمة) ثم أعد التشغيل — فسقوطُ الحارس على قاعدةٍ متقادمة يقيس تقادمَها لا ما بُني ليقيسه.');
  return lines.join('\n');
}

/** الهجرات المطبَّقة فعلاً — المنتهية وغير المرتجَعة. */
export async function appliedMigrations(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return rows.map((r) => r.migration_name).sort();
}

/** يرمي برسالةٍ تسمّي الهجرات إن لم تكن القاعدة على مخطَّط المصدر تماماً. */
export async function assertDbAtLatestMigration(prisma?: PrismaClient): Promise<void> {
  const own = !prisma;
  const client = prisma ?? new PrismaClient();
  try {
    const message = driftMessage(migrationDrift(migrationsOnDisk(), await appliedMigrations(client)));
    if (message) throw new Error(message);
  } finally {
    if (own) await client.$disconnect();
  }
}
