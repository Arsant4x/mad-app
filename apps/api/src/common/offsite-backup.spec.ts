import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): سكربتاتُ صدفةٍ وملفُّ تركيبٍ `YAML` —
// ولا شيفرةَ `TypeScript` يبحث فيها عن نمط.
readsDeclaredStrings();

/**
 * `ق-٥٧٣` … `ق-٥٧٧` — **النسخةُ خارج المضيف بشروطها الخمسة، محروسةً لا موصوفة**.
 *
 * الشروطُ الخمسةُ **مكتوبةٌ في الوثيقة ومبنيّةٌ في السكربتات** — وهذا الحارسُ يمنع أن
 * يفترقا: تعديلٌ يُسقط أحدَ الثلاثة المنسوخة، أو يفكّ ربطَ القراءةِ فقط عن المخزن،
 * أو يُطيل أجلَ الطزاجة حتى يُخفي يوماً ضائعاً — **كلُّه يُسقط الحزمة**.
 *
 * ⚠️ **ولماذا حارسٌ على سكربتات تشغيل**: لأنها **لا تعمل في السير** — لا قاعدةَ ولا
 * مستودعَ في العدّاء. فالوجهُ الذي يُحرَس هو **بنيتُها**، والوجهُ الذي يُثبَت هو
 * **تشغيلُها مرّةً بيدٍ** (`ق-٥٧٦`: أوّلُ إثباتٍ قبل أن يُقال «بُني»).
 *
 * حدُّه المعلَن: يقرأ النصَّ لا يشغّله — فسكربتٌ يستدعي الثلاثةَ بأسماءٍ أخرى يمرّ.
 * ولذلك تُوسَّع الإشاراتُ عند التغيير لا تُحذف.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO_ROOT, ...p), 'utf8');

const BACKUP = read('ops', 'backup', 'offsite-backup.sh');
const DRILL = read('ops', 'backup', 'restore-drill.sh');
const FRESH = read('ops', 'backup', 'check-freshness.sh');
const COMPOSE = read('docker-compose.prod.yml');

/** الخدمةُ في ملفّ التركيب — تُقرأ ككتلةٍ مستقلّة لا بالبحث في الملفّ كلِّه. */
function composeService(name: string): string {
  const start = COMPOSE.indexOf(`\n  ${name}:`);
  if (start < 0) return '';
  const rest = COMPOSE.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n|\nvolumes:/);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('النسخةُ خارج المضيف — خمسةُ شروطٍ محروسة (ق-٥٧٣ … ق-٥٧٧)', () => {
  const service = composeService('backup-offsite');

  it('⓪ حارسٌ على المجسّ: الملفّاتُ الأربعةُ قُرئت فعلاً وليست فارغة', () => {
    for (const [name, body] of [['offsite-backup.sh', BACKUP], ['restore-drill.sh', DRILL], ['check-freshness.sh', FRESH]] as const) {
      expect(`${name}:${body.length > 400}`).toBe(`${name}:true`);
    }
    expect(service.length).toBeGreaterThan(200);
  });

  /**
   * ⭐ **المنسوخُ ثلاثةٌ لا اثنان** (`ق-٥٧٤`) — والثالثُ هو الفرق: مقلبٌ بلا مفتاحه
   * يُستعاد ولا يُقرأ. ويُقرأ كلٌّ من مصدره: القاعدةُ من `pg_dump`، والأدوارُ من
   * `pg_dumpall --globals-only` (فـ`pg_dump` لا يصدّرها)، والمخزنُ والأسرارُ من مسارَيهما.
   */
  it('① المنسوخُ ثلاثةٌ — قاعدةٌ بأدوارها · مخزنُ الملفّات · أسرارُ التشغيل', () => {
    expect(BACKUP).toContain('pg_dump ');
    expect(BACKUP).toContain('pg_dumpall');
    expect(BACKUP).toContain('--globals-only');
    expect(BACKUP).toContain('$MINIO_DATA');
    expect(BACKUP).toContain('$ENV_FILE');
    // والثلاثةُ تصل المستودعَ فعلاً: المرحلةُ (وفيها المقلبُ والأدوارُ والأسرار) والمخزن.
    const backupLine = BACKUP.split('\n').find((l) => l.trim().startsWith('restic backup')) ?? '';
    expect(backupLine).toContain('"$stage"');
    expect(backupLine).toContain('"$MINIO_DATA"');
    // والمفتاحان يُشترطان قبل الرفع — لا بعد الحاجة إليهما بعشر سنوات.
    expect(BACKUP).toContain('SECRETS_ENCRYPTION_KEY');
    expect(BACKUP).toContain('INTEGRATIONS_ENC_KEY');
  });

  /** ② الوجهةُ والمفتاحُ من البيئة — **لا في صورةٍ ولا ملفٍّ على المضيف** (`ق-٥٧٣` · `ق-٥٧٥`). */
  it('② الوجهةُ والمفتاحُ يُقرآن من البيئة، ويُشترط وجودُهما قبل أيّ عمل', () => {
    expect(BACKUP).toContain('${RESTIC_REPOSITORY:?');
    expect(BACKUP).toContain('${RESTIC_PASSWORD:?');
    expect(service).toContain('RESTIC_REPOSITORY: ${RESTIC_REPOSITORY');
    expect(service).toContain('RESTIC_PASSWORD: ${RESTIC_PASSWORD');
    // ولا قيمةَ مكتوبةٌ في ملفّ التركيب — مفتاحٌ في الملفّ مفتاحٌ على المضيف.
    expect(service).not.toMatch(/RESTIC_PASSWORD:\s*["']?[A-Za-z0-9]/);
  });

  /** ③ المخزنُ والأسرارُ **للقراءة فقط** — فوظيفةُ نسخٍ تكتب في مخزنٍ تُتلف ما جاءت تحفظه. */
  it('③ مخزنُ الملفّات وأسرارُ التشغيل مربوطان للقراءة فقط', () => {
    const mounts = service.split('\n').filter((l) => l.includes(':/minio-data') || l.includes(':/secrets/'));
    expect(mounts.length).toBe(2);
    for (const m of mounts) expect(`${m.trim()} → ${m.trim().endsWith(':ro')}`).toContain('→ true');
  });

  /**
   * ④ **التجربةُ على قاعدةٍ فارغةٍ جديدة** (`ق-٥٧٦`) — وهي وحدها التي تكشف نقصَ الأدوار،
   * **ولا تلمس القاعدةَ الحيّة**.
   */
  it('④ تجربةُ الاستعادة تُقلع قاعدةً جديدة وتوكّد الأدوارَ والفكَّ — ولا تتخطّى بصمت', () => {
    expect(DRILL).toContain('docker run -d --name "$CONTAINER"');
    expect(DRILL).toContain('app_user');
    expect(DRILL).toContain('globals.sql');
    // والفكُّ بشيفرة التطبيق نفسِها لا بنسخةٍ منها (`ق-٣٧٥`).
    expect(DRILL).toContain('secret.util');
    expect(DRILL).toContain('$API_IMAGE');
    // وكلُّ توكيدٍ يتعذّر يُسقط التجربة: لا `|| true` على حكمٍ، ولا تخطٍّ صامت.
    expect(DRILL).toContain('fail "المفتاحُ المستعاد لا يفكّ');
    expect(DRILL).not.toContain('skip');
  });

  /**
   * ⑤ **الطزاجةُ تُقرأ من المستودع لا من الخادم** (`ق-٥٧٧`) — فمقياسٌ يسأل الخادمَ
   * يصمت يومَ يموت، وهو العطلُ الذي بُنيت له النسخة. **والأجلُ لا يُطال حتى يُخفي يوماً**.
   */
  it('⑤ فحصُ الطزاجة يقرأ المستودعَ، ويسقط عند الغياب والتقادم، وأجلُه لا يتجاوز يومين', () => {
    expect(FRESH).toContain('restic snapshots');
    expect(FRESH).not.toContain('offsite-status.json');
    const fallback = /MAX_AGE_HOURS:-(\d+)/.exec(FRESH);
    expect(fallback).not.toBeNull();
    expect(Number(fallback![1])).toBeLessThanOrEqual(48);
    // ثلاثةُ مخارجَ متمايزة: حديثةٌ · متقادمةٌ أو معدومة · تعذّر البلوغ — ولا حكمَ بالصمت.
    expect(FRESH).toContain('exit 1');
    expect(FRESH).toContain('exit 2');
  });

  /** ⑥ وغيرُ المهيّأة **تُعلن نفسَها** ولا تنهار ولا تصمت (`ق-٥٧٧`). */
  it('⑥ الخدمةُ غيرُ المهيّأة تُعلن حالَها دورياً', () => {
    expect(service).toContain('UNCONFIGURED');
    expect(service).toContain('offsite-status.json');
  });
});
