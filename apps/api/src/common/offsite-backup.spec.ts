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
const OBJECT = read('ops', 'backup', 'check-repo-object.sh');
const PROOF = read('ops', 'backup', 'policy-proof.sh');
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

  it('⓪ حارسٌ على المجسّ: الملفّاتُ الخمسةُ قُرئت فعلاً وليست فارغة', () => {
    for (const [name, body] of [['offsite-backup.sh', BACKUP], ['restore-drill.sh', DRILL], ['check-freshness.sh', FRESH], ['check-repo-object.sh', OBJECT]] as const) {
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
    // وتُستعاد لقطةُ الخدمة لا أحدثُ لقطةٍ أيّاً كانت — فلقطةُ إثبات السياسة الرميّة (`ق-٧٦٠`) لا تُلتقط؛
    // ومضيفُ الخدمة يُقرأ من ملفّ التركيب لا من الذاكرة (قِيس 2026-09-14: افتراضٌ آخر لا يجد لقطة).
    const composeHost = /BACKUP_HOST:\s*([a-z0-9-]+)/.exec(service);
    expect(composeHost).not.toBeNull();
    expect(DRILL).toContain(`BACKUP_HOST="\${BACKUP_HOST:-${composeHost![1]}}"`);
    expect(DRILL).toMatch(/restore latest --host "\$BACKUP_HOST"/);
    // ومنطقةُ التوقيع تصل حاويات التجربة كما تصل الخدمة (أمرُ الاستعادة على سطرين: البيئةُ ثم الأمر)
    const lines = DRILL.split('\n');
    const restoreAt = lines.findIndex((l) => l.includes('restore latest --host'));
    expect(restoreAt).toBeGreaterThan(0);
    expect(lines[restoreAt - 1]).toContain('-e AWS_DEFAULT_REGION');
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

  /**
   * ⑤ب **وفحصُ الجدولة لا يُسلّم المفتاح** (`ق-٥٨٠`): يسأل الدلوَ عن **وجود** أحدثِ كائن،
   * ولا يذكر كلمةَ المستودع أصلاً — **فاعتمادُ قراءةٍ فقط لا يفتح النسخة ولو سُرّب**.
   * **وحدُّه مكتوبٌ فيه**: وجودٌ لا سلامة.
   */
  it('⑤ب فحصُ الجدولة يسأل الدلوَ بلا كلمة المستودع، ويعلن حدَّه، ويشتقّ الوجهةَ من مصدرٍ واحد', () => {
    expect(OBJECT).not.toContain('RESTIC_PASSWORD');
    expect(OBJECT).toContain('AWS_ACCESS_KEY_ID');
    // الوجهةُ تُشتقّ من `RESTIC_REPOSITORY` — فلا يفترق ما يُفحص عمّا يُكتب.
    expect(OBJECT).toContain('${RESTIC_REPOSITORY:?');
    // ثلاثةُ مخارجَ متمايزة: وُجد · لم يُوجد أو تقادم · تعذّر السؤال.
    expect(OBJECT).toContain('exit 1');
    expect(OBJECT).toContain('exit 2');
    // والحدُّ معلَنٌ في مخرَجه لا في وثيقةٍ بعيدة.
    expect(OBJECT).toContain('وجودٌ لا سلامة');
    const fallback = /MAX_AGE_HOURS:-(\d+)/.exec(OBJECT);
    expect(fallback).not.toBeNull();
    expect(Number(fallback![1])).toBeLessThanOrEqual(48);
  });

  /** ⑥ وغيرُ المهيّأة **تُعلن نفسَها** ولا تنهار ولا تصمت (`ق-٥٧٧`). */
  it('⑥ الخدمةُ غيرُ المهيّأة تُعلن حالَها دورياً', () => {
    expect(service).toContain('UNCONFIGURED');
    expect(service).toContain('offsite-status.json');
  });
});

/**
 * `ق-٧٢٩` — **مجلّدُ المقالب لا يقرؤه غيرُ الجذر: `700` كلَّ دورةٍ لا مرّةً بيد.**
 *
 * الواقعة (2026-09-14): `backups/` على المنشور `755` — فأيُّ مستخدمٍ على المضيف يقرأ `15` مقلباً
 * للقاعدة كاملةً. وقِيس قبل التضييق: لا مستخدمَ بشرياً على المضيف، والقارئان الوحيدان (حاويةُ
 * النسخ والخارجيّة) جذرٌ، ولا فتحاتٍ ولا `cron` — فلا شيءَ ينكسر. **والتضييقُ يعيش في خدمة
 * النسخ نفسِها** (تُطبّقه كلَّ دورة) لا في يدٍ على الخادم — فربطٌ يُعاد تركيبُه يُنشئ المجلّدَ `755` من جديد.
 */
/**
 * `ق-٧٣٤` — **«يكتب ولا يحذف»: مفتاحُ الرفع لا يحذف إلا أقفالَ `restic` — فالتقليمُ لا يعيش في الوظيفة اليومية.**
 *
 * أوراكل لا تفصل الكتابةَ عن الحذف في مفتاح `S3`، لكن سياسةَ `IAM` تفصلهما على المستخدم. و`forget --prune`
 * يحذف حزمَ بياناتٍ ⇒ يسقط بمفتاح الرفع **ويُسقط الوظيفةَ كلَّها** (`fail`) لو بقي فيها. فـ`OFFSITE_APPEND_ONLY=1`
 * يُسقطه **ويُعلن** في السطر والحال — والافتراضُ يبقي السلوكَ القديم. ويُمرَّر مع منطقة التوقيع من ملفّ التركيب.
 */
describe('append-only — لا تقليمَ بمفتاحٍ لا يحذف، ويُعلَن (ق-٧٣٤)', () => {
  const offsite = composeService('backup-offsite');
  const EXAMPLE = read('.env.production.example');

  it('السكربتُ يُسقط forget --prune تحت OFFSITE_APPEND_ONLY=1 ويُعلن ذلك — والافتراضُ 0', () => {
    expect(BACKUP).toMatch(/OFFSITE_APPEND_ONLY="\$\{OFFSITE_APPEND_ONLY:-0\}"/);
    expect(BACKUP).toMatch(/if \[ "\$OFFSITE_APPEND_ONLY" = "1" \]; then[\s\S]*append-only[\s\S]*else[\s\S]*restic forget --keep-daily/);
    // الإعلانُ يصل ملفَّ الحال لا السطرَ وحده
    expect(BACKUP).toContain('prune_note');
    expect(BACKUP).toMatch(/status ok "[^"]*\$prune_note"/);
  });

  it('ملفُّ التركيب يمرّر الرايةَ ومنطقةَ التوقيع، ومثالُ البيئة يوثّق المفاتيح', () => {
    expect(offsite).toContain('OFFSITE_APPEND_ONLY: ${OFFSITE_APPEND_ONLY:-0}');
    expect(offsite).toContain('AWS_DEFAULT_REGION: ${OFFSITE_REGION:-us-east-1}');
    for (const k of ['RESTIC_REPOSITORY=', 'RESTIC_PASSWORD=', 'OFFSITE_ACCESS_KEY=', 'OFFSITE_SECRET_KEY=', 'OFFSITE_REGION=', 'OFFSITE_APPEND_ONLY=']) {
      expect(EXAMPLE).toContain(k);
    }
    // ولا قيمةَ سرّيةً في المثال — القيمُ من صاحب المشروع مباشرةً
    expect(EXAMPLE).toMatch(/^RESTIC_PASSWORD=$/m);
    expect(EXAMPLE).toMatch(/^OFFSITE_SECRET_KEY=$/m);
  });
});

/**
 * `ق-٧٤٣` · `ق-٧٥١` — **المخزَّنُ يُقاس شهرياً داخل التجربة لا في وثيقة.**
 *
 * «يكتب ولا يحذف» يُراكم بلا تقليمٍ يوميّ، والحدُّ `10 GB` حيث تنتهي حصّةُ أوراكل المجّانية وتبدأ الكلفة —
 * **وبندُ متابعةٍ بلا قياسٍ دوريٍّ يُقرأ عند بلوغه لا قبله**. فالتجربةُ الشهرية تقرأ المخزَّنَ من المستودع
 * نفسِه (`restic stats`)، وتقارنه بالحدّ، وتكتبه في تقريرها — وتعذُّرُ القياس يُسقطها ولا يصمت.
 */
describe('المخزَّنُ يُقاس شهرياً في تجربة الاستعادة مقابل حدّ المراجعة (ق-٧٤٣ · ق-٧٥١)', () => {
  it('التجربةُ تقرأ المخزَّنَ بـ restic stats وتقارنه بحدٍّ افتراضيُّه 10 GB وتكتبه في التقرير', () => {
    expect(DRILL).toMatch(/OFFSITE_VOLUME_THRESHOLD_GB:-10\}/);
    expect(DRILL).toMatch(/"\$RESTIC_IMAGE" stats --mode raw-data --no-lock --json/);
    expect(DRILL).toContain('"total_size"');
    // تعذُّرُ القياس يُسقط التجربة — لا شهرَ بلا رقم
    expect(DRILL).toMatch(/\|\| fail "تعذّر قياسُ المخزَّن/);
    // والرقمُ والحدُّ يصلان التقرير — فيُقرأ الاتجاهُ شهراً بعد شهر
    expect(DRILL).toContain('"storedBytes":%s,"volumeThresholdGb":%s');
    // وبلوغُ الحدّ إنذارٌ مسمّىً بقراره لا سقوط
    expect(DRILL).toContain('بلغ المخزَّنُ حدَّ المراجعة');
    expect(DRILL.indexOf('بلغ المخزَّنُ حدَّ المراجعة')).toBeGreaterThan(DRILL.indexOf('stats --mode raw-data'));
  });
});

/**
 * `ق-٧٦٠` — **«يكتب ولا يحذف» مُثبَتاً لا مُدَّعىً — بـ`restic` نفسِه.**
 *
 * الكتابةُ = `backup` رميٌّ ينجح (ومعه إنشاءُ القفل وإزالتُه)، والحذفُ = `forget` لتلك اللقطة يُرفض
 * باسمه (`AccessDenied`) وتبقى مسرودة. **ولا سرَّ يُطبع**: القيمُ تُقرأ من ملفّ البيئة بلا `source`
 * (فقيمةٌ فيها `(` أو `!` تُسقط الصدفةَ أو تُنفَّذ)، وتصل الحاويةَ بـ`-e` بلا قيمةٍ في سطر الأمر.
 * وثلاثةُ مخارجَ متمايزة: الكتابةُ سقطت · الحذفُ نجح · تعذّر السؤال — ولا حكمَ بالصمت.
 */
describe('إثباتُ السياسة: الكتابةُ تنجح والحذفُ يُرفض — بلا طباعة سرّ (ق-٧٦٠)', () => {
  it('السكربتُ يقرأ البيئةَ بلا source ولا set -x، ولا يضع قيمةً في سطر أمر', () => {
    expect(PROOF.length).toBeGreaterThan(400);
    expect(PROOF).not.toMatch(/^\s*(\.|source)\s+"?\$ENV_FILE/m);
    expect(PROOF).not.toContain('set -x');
    expect(PROOF).not.toMatch(/echo[^\n]*\$(RESTIC_PASSWORD|AWS_SECRET_ACCESS_KEY|OFFSITE_SECRET_KEY)/);
    // القيمُ تصل الحاويةَ من البيئة: `-e VAR` بلا `=قيمة`
    expect(PROOF).toMatch(/docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION/);
    expect(PROOF).not.toMatch(/-e RESTIC_PASSWORD=/);
    // والمفاتيحُ الستّةُ تُقرأ بأسمائها كما في المثال
    for (const k of ['RESTIC_REPOSITORY', 'RESTIC_PASSWORD', 'OFFSITE_ACCESS_KEY', 'OFFSITE_SECRET_KEY', 'OFFSITE_REGION']) {
      expect(PROOF).toContain(`envval ${k}`);
    }
  });

  it('الحالتان بـ restic نفسِه: backup رميٌّ بمضيفٍ مميَّز ينجح، وforget له يُرفض باسمه وتبقى اللقطة', () => {
    expect(PROOF).toMatch(/backup --tag policy-proof --host policy-proof/);
    expect(PROOF).toMatch(/forget "\$snap"/);
    // رسالةُ الرفض بلغة المزوّدَين: AWS وأوراكل («not authorized» — مقيسةٌ على الدلو 2026-09-14)
    expect(PROOF).toContain('AccessDenied');
    expect(PROOF).toContain('not authorized');
    // بعد الرفض تُسرد اللقطةُ ثانيةً — فالحكمُ من المستودع لا من رسالة الخطأ وحدها
    expect(PROOF.indexOf('snapshots --no-lock "$snap"')).toBeGreaterThan(PROOF.indexOf('forget "$snap"'));
    // والصورةُ بالوسم نفسِه الذي تُبنى عليه الخدمة
    const pinned = /FROM restic\/restic:([0-9.]+)/.exec(read('ops', 'backup', 'Dockerfile'));
    expect(pinned).not.toBeNull();
    expect(PROOF).toContain(`restic/restic:${pinned![1]}`);
    // أربعةُ مخارجَ متمايزة
    for (const code of ['exit 1', 'exit 2', 'exit 3', 'exit 4']) expect(PROOF).toContain(code);
  });

  /**
   * ما كشفه أوّلُ تشغيلٍ حقيقيّ (2026-09-14 · `ق-٧٧٩`): `backup` يعود `0` ولو عجز عن إزالة قفله — فالقفلُ يُقرأ من
   * سجلّه لا من خروجه؛ والقراءاتُ بلا `--no-lock` تترك أقفالاً عالقةً تمنع `forget` قبل أن يُحاوَل الحذف — فيُقال «لا حكم»
   * لا «مرفوض»؛ والسببُ يُكتب في المخرَج محجوباً — لا يُرمى.
   */
  it('القفلُ يُقرأ من سجلّ backup، والقراءاتُ بلا قفل، والأقفالُ العالقة «لا حكم» لا «مرفوض»، والسببُ في المخرَج محجوباً', () => {
    expect(PROOF).toContain("grep -q 'Remove(<lock/' \"$probe/backup.out\"");
    expect(PROOF).toMatch(/cat config --no-lock/);
    expect(PROOF).toMatch(/snapshots --no-lock --host policy-proof/);
    expect(PROOF).toMatch(/grep -qi 'already locked' "\$probe\/forget\.out"/);
    // أقفالٌ عالقة بلا شاهدٍ على الرفض ⇒ لا حكم (3)، ومعه شاهدٌ من إزالة القفل ⇒ مرفوضٌ مشهود
    expect(PROOF).toMatch(/already locked[\s\S]*\[ "\$lock" = denied \][\s\S]*exit 3/);
    // السببُ يصل المخرَج محجوباً من أيّ رمزٍ يشبه مفتاحاً
    expect(PROOF).toContain('"reason":"%s"');
    expect(PROOF).toMatch(/reason\(\) \{[^\n]*\[masked\]/);
    // وقفلٌ لا يُزال حكمٌ باسمه (4) لا نجاحٌ صامت
    expect(PROOF).toMatch(/\[ "\$lock" = denied \]; then[\s\S]*exit 4/);
  });
});

describe('مجلّدُ المقالب 700 — تُطبّقه خدمةُ النسخ كلَّ دورة (ق-٧٢٩)', () => {
  const backup = composeService('backup');

  it('خدمةُ النسخ تُضيّق /backups إلى 700 قبل أوّل مقلب', () => {
    expect(backup.length).toBeGreaterThan(200);
    expect(backup).toContain('chmod 700 /backups');
    // قبل حلقة المقالب لا بعدها — فالمقلبُ الأوّل يُكتب في مجلّدٍ مُضيَّق
    expect(backup.indexOf('chmod 700 /backups')).toBeLessThan(backup.indexOf('while true; do'));
  });
});
