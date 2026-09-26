import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): سكربتاتُ صدفةٍ متتبَّعة — ولا شيفرةَ `TypeScript` يبحث فيها.
readsDeclaredStrings();

/**
 * `ق-١٤٧٥` — **لا قيمةَ سرّيةَ في سطر أمرٍ في أيِّ سكربت صدفة** (التوجيه ٢٦٦ §٧ب).
 *
 * سطرُ الأمر يُقرأ من قائمة العمليات (`/proc/<pid>/cmdline`) لكلِّ من يرى العمليات — بخلاف البيئة
 * التي لا تُقرأ إلا لمالك العملية. **وكانت القاعدةُ محروسةً على سكربتٍ واحدٍ وسرٍّ واحد**
 * (`offsite-backup.spec.ts`: `PROOF` و`-e RESTIC_PASSWORD=`) — بحثٌ غير متناظر (`§8.7`)، وبقي خارجها
 * سكربتان: `restore-drill.sh` مرّر **المفتاحَ الرئيس للتشفير** وكلمةَ قاعدة التجربة في `argv` عملية
 * `docker`، و`check-repo-object.sh` مرّر سرَّ الدلو في `argv` عملية `openssl`. أُصلحا (مقيسان بشِمٍّ
 * يسجّل سطرَ الأمر: القيمةُ تصل ولا تُرى)، **وهذا الحارسُ يمنع العودةَ في كلِّ سكربتٍ قادم**.
 *
 * ⭐ **السطحُ مشتقٌّ لا مسرود**: كلُّ ملفٍّ متتبَّع **سطرُه الأوّل** `#!…sh|bash|dash` — لا امتدادُه، فالخطّافاتُ
 * بلا امتداد (`§8.15`). وتُسقط الحزمةُ إن لم يُرَ خطّافٌ معلوم (المسبارُ يرى) أو رُئيَ ما ليس صدفة.
 *
 * ⚠️ **وحدُّه معلَن**: يقرأ النصَّ لا يشغّله — فسرٌّ يُبنى في متغيّرٍ ثم يُمرَّر بلا اسمه (`$args`) يمرّ.
 * والإثباتُ السلوكيّ للسكربتَين المُصلَحَين مسجَّلٌ في `ق-١٤٧٥` لا هنا. **ولا يرى الصدفةَ المضمَّنة** في
 * ملفّ التركيب ولا خطواتِ السير.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** السكربتاتُ المتتبَّعة بسطرها الأوّل — من `git` لا من القرص، فالمسوّداتُ غيرُ المتتبَّعة خارجه. */
function trackedShellScripts(): string[] {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
  const out: string[] = [];
  for (const rel of listed) {
    if (rel.includes('node_modules/')) continue;
    let head: string;
    try {
      head = readFileSync(join(REPO_ROOT, rel), 'utf8').slice(0, 120).split(/\r?\n/)[0];
    } catch {
      continue; // ملفٌّ متتبَّعٌ حُذف من الشجرة ولم يُلتزم حذفُه — ليس سكربتاً يُشغَّل
    }
    if (/^#!\s*\S*\/(?:env\s+)?(?:sh|bash|dash)(?:\s|$)/.test(head)) out.push(rel);
  }
  return out.sort();
}

/** أسطرُ الشيفرة بلا تعليقاتها — **والرقمُ محفوظ** (`§8.24`: الشرحُ ليس مخالفة). */
function codeLines(body: string): { n: number; text: string }[] {
  return body.split(/\r?\n/).map((text, i) => ({ n: i + 1, text: /^\s*#/.test(text) ? '' : text }));
}

/** اسمٌ يدلّ على سرّ. */
const SECRET_NAME = '[A-Z0-9_]*(?:KEY|SECRET|PASS|PASSWORD|TOKEN)[A-Z0-9_]*';

/**
 * أشكالُ السرِّ في سطر أمر — **كلٌّ منها صياغةٌ يكتبها مطوّرٌ فعلاً** (`§8.8` الوجه الثاني):
 *   ① `docker run -e NAME=…` بقيمة (والصحيح `-e NAME` وقيمتُه في بيئة العميل).
 *   ② مفتاحُ `HMAC` لـ`openssl` (`-hmac` · `-macopt key:` · `-macopt hexkey:`) — ولا طريقَ له إلا سطرُ الأمر.
 *   ③ اعتمادُ `curl` بـ`-u`/`--user` من متغيّر (وثيقةُ `curl` نفسُها تنصح بالملفّ لا بالسطر).
 *   ④ `--password` بقيمةٍ من متغيّر — و`--password-stdin` هو الشكلُ الصحيح.
 * ⚠️ **ولا `-p` ولا `-u` مجرّدَين**: `mkdir -p "$DIR"` و`sort -u "$f"` شائعان — وحارسٌ يُنذر بهما يُعطَّل (`§8.11`).
 */
const FORMS: { id: string; re: RegExp }[] = [
  { id: '① -e NAME=value', re: new RegExp(`(?:^|\\s)(?:-e|--env)\\s+${SECRET_NAME}=`) },
  { id: '② openssl HMAC key', re: /(?:^|\s)(?:-hmac\s|-macopt\s+"?(?:hex)?key:)/ },
  { id: '③ curl --user $var', re: /(?:\bcurl\b.*\s-u\s+"?\$|(?:^|\s)--user(?:=|\s+)"?\$)/ },
  { id: '④ --password $var', re: /(?:^|\s)--password(?:=|\s+)"?\$/ },
];

function offenders(rel: string, body: string): string[] {
  const out: string[] = [];
  for (const { n, text } of codeLines(body)) {
    for (const f of FORMS) if (f.re.test(text)) out.push(`${rel}:${n} ${f.id}`);
  }
  return out;
}

describe('لا قيمةَ سرّيةَ في سطر أمرٍ في أيِّ سكربت صدفة متتبَّع (ق-١٤٧٥)', () => {
  const scripts = trackedShellScripts();

  it('⓪ المسبارُ يرى: خطّافٌ بلا امتداد وسكربتا النسخ في السطح، وملفٌّ ليس صدفةً خارجه', () => {
    expect(scripts.length).toBeGreaterThan(10);
    for (const known of ['.githooks/pre-commit', 'deploy.sh', 'ops/backup/restore-drill.sh', 'ops/backup/check-repo-object.sh']) {
      expect({ known, seen: scripts.includes(known) }).toEqual({ known, seen: true });
    }
    expect(scripts.includes('package.json')).toBe(false);
  });

  it('⭐ لا شكلَ من الأربعة في أيِّ سطرِ شيفرة', () => {
    const found = scripts.flatMap((rel) => offenders(rel, readFileSync(join(REPO_ROOT, rel), 'utf8')));
    expect(found).toEqual([]);
  });

  /**
   * **صادِقِ المسبار** بحالاتٍ معلومة — تُبنى بدالّةٍ لا حرفاً، فلا يُدين حارسٌ نصّيٌّ آخرُ هذا الملف.
   * والصياغاتُ هي ما كان في السكربتَين قبل إصلاحهما بعينه.
   */
  it('⭐ ويُمسك ما كان قبل الإصلاح بعينه — ولا يُمسك الشكلَ الصحيح ولا الشرح', () => {
    const k = ['SECRETS', 'ENCRYPTION', 'KEY'].join('_');
    const p = ['POSTGRES', 'PASSWORD'].join('_');
    const was = [
      `docker run --rm -e ${k}="$key" -e CIPHER="$cipher" "$API_IMAGE" \\`,
      `docker run -d --name "$CONTAINER" -e ${p}="$DRILL_PASS" "$PG_IMAGE"`,
      `hmac_key() { openssl dgst -sha256 -mac HMAC -macopt "key:$1"; }`,
      `hmac_hex() { openssl dgst -sha256 -mac HMAC -macopt "hexkey:$1"; }`,
      `curl --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" "$url"`,
      `mysql --password="$DB_PASS" -e 'select 1'`,
    ];
    for (const line of was) expect({ line, caught: offenders('x.sh', line).length }).toEqual({ line, caught: 1 });

    const right = [
      `${k}="$key" docker run --rm -e ${k} -e CIPHER "$API_IMAGE"`,
      `${p}="$DRILL_PASS" docker run -d --name "$CONTAINER" --network none -e ${p} -e POSTGRES_USER="$DRILL_USER" "$PG_IMAGE"`,
      `printf 'user = "%s:%s"\\n' "$A" "$B" | curl -sS -K - --aws-sigv4 "aws:amz:$REGION:s3" "$url"`,
      `echo "$GHCR_TOKEN" | docker login ghcr.io --username bot --password-stdin`,
      `docker exec -u postgres "$C" psql -U "$DRILL_USER"`,
      `mkdir -p "$DRILL_DIR" && sort -u "$LIST"`,
      `# وكان هنا: docker run --rm -e ${k}="$key" — والشرحُ ليس مخالفة (§8.24)`,
    ];
    for (const line of right) expect({ line, caught: offenders('x.sh', line) }).toEqual({ line, caught: [] });
  });
});
