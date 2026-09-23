import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): سكربتَ صدفةٍ و`deploy.sh` — ولا شيفرةَ `TypeScript`.
readsDeclaredStrings();

/**
 * `ق-١٣٣٣` · ⑬A1 — **لا يُقبل `SMTP_HOST` بلا سجلّات مصادقة النطاق الثلاثة** (SPF · DKIM · DMARC).
 *
 * البابُ ⑬ (`docs/domain-scan/13-النطاقات-والبريد.md`) · البندُ A1 من العمود الأوّل: **أوّلُ دفعةِ بريدٍ بلا
 * مصادقة تُصنّف النطاقَ مزعجاً وسمعتُه لا تُستردّ بسطر**؛ والضابطُ الوطنيّ `ECC-2:2024 2-4-3-5` يسمّي الثلاثة.
 *
 * **ما يُحرَس** — وسكربتاتُ التشغيل لا تعمل في السير، فتُشغَّل دالّتُها على `dig` مزيَّفٍ يجيب من جدول:
 *   ① بلا `SMTP_HOST` لا فحصَ ولا رفض (الحارسُ على تفعيل البريد لا على كلِّ نشر).
 *   ② الثلاثةُ حاضرة ⟸ يمرّ ويسمّي كلَّ سجلّ.
 *   ③ غيابُ أيٍّ منها ⟸ يُسقط — **ويُبلّغ عن الثلاثة كلِّها** لا عن أوّل غائب.
 *   ④ **غيابُ الأداة نفسِها ليس فحصاً ناجحاً** (`§8.8`) ⟸ يُسقط ويسمّي الحزمة.
 *   ⑤ `deploy.sh` يستدعيها **في شرط** — فـ`set -e` لا يقطعها عند أوّل غياب.
 *   ⑥ **وتُشغَّل مباشرةً بيدٍ** بالرمز نفسِه — لأوّل نشرٍ يحمل الملفّ (ينفّذ نسخةَ `deploy.sh` القديمة).
 *
 * حدُّه المعلَن: `dig` مزيَّف — فالإثباتُ إثباتُ منطق الفحص لا إثباتُ DNS؛ والنشرُ الأوّلُ بالبريد هو ما يُثبت الوصل.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const DEPLOY = readFileSync(join(REPO_ROOT, 'deploy.sh'), 'utf8');

/** جدولُ إجابات `dig` المزيَّف — سطرٌ لكلِّ «نوع|اسم|قيمة» (يُبنى بدالّةٍ لا حرفياً — §8.7). */
type Answer = [type: 'TXT' | 'CNAME', name: string, value: string];
const SPF: Answer = ['TXT', 'rikzapp.com', '"v=spf1 include:rp.oracleemaildelivery.com ~all"'];
const DKIM: Answer = ['CNAME', 'ruh-20260923._domainkey.rikzapp.com', 'ruh-20260923.rikzapp.com.dkim.ruh.oracleemaildelivery.com.'];
const DMARC: Answer = ['TXT', '_dmarc.rikzapp.com', '"v=DMARC1; p=none; rua=mailto:dmarc@rikzapp.com"'];

// مجلدٌ واحدٌ للملفّ و`dig` مزيَّفٌ يُكتب مرّةً — لا ملفَّ تنفيذيّاً جديداً لكلِّ حالة.
let dir = '';
let fakeDig = '';
let runs = 0;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mail-dns-'));
  // `dig` مزيَّف: `+short النوع الاسم` ⟵ ما في الجدول لذلك الزوج، ولا شيءَ غيرَه.
  fakeDig = join(dir, 'fake-dig');
  writeFileSync(
    fakeDig,
    ['#!/usr/bin/env bash', 't="$2"; n="$3"', 'while IFS="|" read -r a b c; do [[ "$a" == "$t" && "$b" == "$n" ]] && printf "%s\\n" "$c"; done < "$FAKE_DIG_TABLE"', 'exit 0', ''].join('\n'),
    { mode: 0o755 },
  );
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function run(env: Record<string, string>, answers: Answer[], opts: { noDig?: boolean; direct?: boolean } = {}): { code: number; out: string } {
  const n = ++runs;
  const envFile = join(dir, `env-${n}`);
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  const table = join(dir, `answers-${n}`);
  writeFileSync(table, answers.map((a) => a.join('|')).join('\n') + '\n');
  const dig = opts.noDig ? join(dir, 'no-such-dig') : fakeDig;
  const envPath = envFile.replace(/\\/g, '/');
  // `source` كما يفعل deploy.sh، أو تشغيلٌ مباشر كما يفعل المشغِّلُ بيده قبل أوّل نشر.
  const args = opts.direct ? ['ops/mail/mail-dns-check.sh', envPath] : ['-c', `source ops/mail/mail-dns-check.sh && mail_dns_check '${envPath}'`];
  const r = spawnSync('bash', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, MAIL_DNS_DIG: dig.replace(/\\/g, '/'), FAKE_DIG_TABLE: table.replace(/\\/g, '/') },
  });
  if (r.error) throw r.error;
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

const MAIL_ON = { SMTP_HOST: 'smtp.email.me-riyadh-1.oci.oraclecloud.com', SMTP_FROM: '"ركز" <no-reply@RikzApp.com>', MAIL_DKIM_SELECTOR: 'ruh-20260923' };

describe('⑬A1 — لا يُقبل SMTP_HOST بلا سجلّات مصادقة النطاق الثلاثة (ق-١٣٣٣)', () => {
  it('① بلا SMTP_HOST لا فحصَ ولا رفض — والحارسُ على تفعيل البريد لا على كلِّ نشر', () => {
    const r = run({ SMTP_FROM: 'no-reply@rikzapp.com' }, []);
    expect(r.code).toBe(0);
    expect(r.out).toContain('لا SMTP_HOST');
  });

  it('② الثلاثةُ حاضرة ⟸ يمرّ ويسمّي كلَّ سجلّ — والنطاقُ من SMTP_FROM باسمٍ عرضيٍّ وحروفٍ كبيرة', () => {
    const r = run(MAIL_ON, [SPF, DKIM, DMARC]);
    expect(r.code).toBe(0);
    // مصادقةُ المسبار: الأسطرُ تسمّي ما قرأته من الجدول — فالأداةُ المزيَّفةُ نودِيت فعلاً.
    expect(r.out).toContain('✔ SPF   rikzapp.com: v=spf1 include:rp.oracleemaildelivery.com ~all');
    expect(r.out).toContain('✔ DKIM  ruh-20260923._domainkey.rikzapp.com → ruh-20260923.rikzapp.com.dkim.ruh.oracleemaildelivery.com.');
    expect(r.out).toContain('✔ DMARC _dmarc.rikzapp.com: v=DMARC1; p=none');
    expect(r.out).not.toContain('✖');
    // وحين يُستورد لا يعمل وحدَه (⑥): لو عمل لخرج بفحص «.env.production» قبل نداء الدالّة — فظهر سطرُ
    // «لا SMTP_HOST» ولم تظهر أسطرُ الجدول، أو ظهرت مرّتين.
    expect(r.out).not.toContain('لا SMTP_HOST');
    expect(r.out.match(/✔ SPF/g)).toHaveLength(1);
  });

  it('⭐ ③ غيابُ أيٍّ منها يُسقط — ويُبلّغ عن الثلاثة كلِّها لا عن أوّل غائب', () => {
    const noDkim = run(MAIL_ON, [SPF, DMARC]);
    expect(noDkim.code).toBe(1);
    expect(noDkim.out).toContain('✖ DKIM  ruh-20260923._domainkey.rikzapp.com: لا سجلَّ CNAME');
    expect(noDkim.out).toContain('✔ SPF');
    expect(noDkim.out).toContain('✔ DMARC');

    const noSpfNoDmarc = run(MAIL_ON, [DKIM]);
    expect(noSpfNoDmarc.code).toBe(1);
    expect(noSpfNoDmarc.out).toContain('✖ SPF');
    expect(noSpfNoDmarc.out).toContain('✖ DMARC');
    expect(noSpfNoDmarc.out).toContain('✔ DKIM');

    // والمنتقي غائباً من البيئة — لا يُخمَّن.
    const noSelector = run({ SMTP_HOST: MAIL_ON.SMTP_HOST, SMTP_FROM: 'no-reply@rikzapp.com' }, [SPF, DKIM, DMARC]);
    expect(noSelector.code).toBe(1);
    expect(noSelector.out).toContain('MAIL_DKIM_SELECTOR غير مضبوط');
  });

  it('④ غيابُ الأداة ليس فحصاً ناجحاً — يُسقط ويسمّي الحزمة', () => {
    const r = run(MAIL_ON, [SPF, DKIM, DMARC], { noDig: true });
    expect(r.code).toBe(1);
    expect(r.out).toContain('dig غير مثبَّت');
    expect(r.out).toContain('dnsutils');
  });

  it('⑤ deploy.sh يستورد الدوالَّ ويستدعيها في شرطٍ قبل أيِّ تغيير', () => {
    expect(DEPLOY).toMatch(/source \.\/ops\/mail\/mail-dns-check\.sh/);
    expect(DEPLOY).toMatch(/if ! mail_dns_check "\$ENV_FILE"; then/);
    // وقبل السحب: الفحصُ في «فحوص ما قبل الإقلاع» لا بعد أن يتغيّر شيء.
    expect(DEPLOY.indexOf('mail_dns_check "$ENV_FILE"')).toBeLessThan(DEPLOY.indexOf('git pull --ff-only origin main'));
  });

  it('⑥ يُشغَّل مباشرةً بيدٍ على الخادم — بالرمز نفسِه (وأنّه لا يعمل وحدَه حين يُستورد يوكّده ②)', () => {
    // أوّلُ نشرٍ يحمل الملفَّ ينفّذ نسخةَ deploy.sh القديمة — فهذا المدخلُ هو فحصُه قبله.
    const ok = run(MAIL_ON, [SPF, DKIM, DMARC], { direct: true });
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('✔ DMARC _dmarc.rikzapp.com');
    const missing = run(MAIL_ON, [SPF, DKIM], { direct: true });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain('✖ DMARC');
  });
});
