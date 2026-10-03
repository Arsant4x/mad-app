# فجوة ٧ب — مفتاحٌ في سطر الأمر: `restore-drill.sh` · `check-repo-object.sh` — ثم `shellcheck` في السير

> **ما قُرئ**: `D:\worktrees\outbox-266` على الالتزام `eda979a214df0afab4a831151c8cdeea5e59861b` (مقروءٌ من `git log -1`) — قراءةٌ وحدها.
> لم يُشغَّل اختبارٌ ولا `docker` ولا `prisma` ولا بناء، ولم يُتّصل بجهةٍ خارجية. **القياسان الوحيدان المُشغَّلان محلّيّان وللقراءة**:
> `openssl dgst -help` · `openssl mac -help` (OpenSSL 3.5.7) و`curl --manual` (curl 8.21.0) على جهاز التطوير — لقراءة الطريقة الموثَّقة لكلِّ أداة.
> التاريخ: 2026-09-26.

---

## (1) الدعوى بنصّها

> «فجوة ٧ب: السكربتان اللذان يمرّران مفتاحاً في سطر الأمر (`restore-drill.sh` · `check-repo-object.sh`) —
> **يُصلحان الآن، فسطرُ الأمر يُقرأ من قائمة العمليات. ثم `shellcheck` في السير.**»

شقّان: **(أ)** سرٌّ في `argv` لعمليةٍ فرعية في السكربتين · **(ب)** لا `shellcheck` في السير.

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### 2.1 السكربتان موجودان ومتتبَّعان

`git ls-files` أعاد أربعة عشر ملفَّ صدفة، منها `ops/backup/restore-drill.sh` و`ops/backup/check-repo-object.sh`
(القائمة كاملة في 5.4). وكلاهما `#!/bin/sh` بـ`set -eu` (`restore-drill.sh:1,18` · `check-repo-object.sh:1,21`)، **ولا `set -x` في أيٍّ منهما**
(بحثٌ `^\s*set -[a-z]*x` على `ops/backup/*.sh` و`deploy.sh` و`ops/deploy/*.sh` و`ops/mail/*.sh` و`.githooks/*` ⇒ صفر؛ **والمسبارُ يرى**: `^\s*set -e` على الملفّين نفسيهما وجد `restore-drill.sh:18` و`check-repo-object.sh:21`).

### 2.2 `restore-drill.sh` — ثلاثةُ أسطرٍ تضع قيمةً في `argv` عملية `docker`

| السطر | النصّ (مختصراً) | ما في `argv` | حساسيّتُه |
|---|---|---|---|
| `:68` | `docker run -d --name "$CONTAINER" $net_arg -e POSTGRES_PASSWORD="$DRILL_PASS" …` | كلمةُ قاعدة التجربة | قاعدةُ التجربة تحمل **نسخةً كاملةً من بيانات الإنتاج المستعادة** (`:80`)، وتُقلع على شبكة `docker` الافتراضية أو `DOCKER_NET` (`:34` · `:41-42`) بلا `-p`. القيمةُ الافتراضية `drill-$(date +%s)` (`:32`) — قابلةٌ للتخمين أصلاً |
| `:101` | `docker run --rm -e SECRETS_ENCRYPTION_KEY="$key" -e CIPHER="$cipher" "$API_IMAGE" node -e '…decryptSecret…'` | **المفتاحُ الرئيسُ للتشفير** + نصٌّ مشفَّرٌ من `zatca_credentials."privateKeyEnc"` (`:99`) | **الأعلى**: المفتاحُ والنصُّ المشفَّر في سطرٍ واحد ⇒ من يقرأ السطرَ يفكّ مفتاحَ الختم الخاصّ للتاجر |
| `:108` | `docker run --rm -e SECRETS_ENCRYPTION_KEY="$key" "$API_IMAGE" node -e '…canary…'` | المفتاحُ الرئيس | الفرعُ الذي يعمل حين لا سرَّ مخزَّناً |

- **مصدرُ `$key`**: `env.production` المستعاد من اللقطة (`:54` · `:58` · `:97`) — أي **مفتاحُ الإنتاج الحقيقي**.
- **ما يفكّه هذا المفتاح** (`secret.util.ts:21-29` يقرؤه من `process.env` لحظةَ كلِّ نداء): خمسةُ أعمدةٍ في `zatca_credentials`
  (`privateKeyEnc` · `complianceCsidEnc` · `complianceSecretEnc` · `productionCsidEnc` · `productionSecretEnc` —
  `schema.prisma:933,939-940,950-951` · والتشفيرُ في `zatca-onboarding.service.ts:235,242,302-303,518-519`)
  و`login_identities."mfaSecret"` (`schema.prisma:139` · `mfa.service.ts:57`).
- **والشكلُ الصحيح موجودٌ في السكربت نفسه**: `:47` و`:120` يمرّران `-e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION` **بالاسم بلا قيمة** — فعميلُ `docker` يقرأ القيمةَ من بيئته. أي أن الخرقَ في `:68/:101/:108` **خروجٌ عن نمط الملفّ نفسِه لا غيابُ نمط**.
- **وقد نُفِّذ فعلاً على بيانات الإنتاج**: سجلُّ `ق-٧٧٩` (`docs/decisions.md:2155`) يذكر تشغيلَ `restore-drill.sh` بـ`BACKUP_HOST=mad-app-prod` على قاعدةٍ فارغة، و«المفتاحُ يفكّ (`canary` — لا سرَّ مخزَّناً بعد)» ⇒ **الفرعُ `:108` هو الذي جرى، أي أن `SECRETS_ENCRYPTION_KEY` الحقيقيَّ كان في `argv` عملية `docker` مدّةَ تشغيل تلك الحاوية**. (موضعُ التشغيل لا يُذكر صراحةً في ما قرأتُه من السطر؛ المرجَّحُ الخادم لأن التجربة تحتاج صورة `mad-app-api` — `:24`.)

### 2.3 `check-repo-object.sh` — السرُّ في `argv` عملية `openssl`

| السطر | النصّ | ما في `argv` |
|---|---|---|
| `:50` | `hmac_key() { openssl dgst -sha256 -mac HMAC -macopt "key:$1" … }` | المفتاحُ الممرَّر |
| `:77` | `k=$(printf '%s' "$datestamp" \| hmac_key "AWS4$AWS_SECRET_ACCESS_KEY")` | **`AWS_SECRET_ACCESS_KEY` نفسُه** بعد البادئة `AWS4` |
| `:49` · `:78-81` | `hmac_hex … -macopt "hexkey:$1"` بمفاتيح مشتقّة | **مفتاحُ التوقيع المشتقّ** (مقيَّدٌ باليوم والمنطقة والخدمة — يوقّع أيَّ طلبٍ على `s3` في المنطقة ذلك اليوم) |
| `:87` | `curl … -H "Authorization: AWS4-HMAC-SHA256 Credential=$AWS_ACCESS_KEY_ID/…, Signature=$signature"` | معرّفُ المفتاح (ليس سرّاً) والتوقيع (مربوطٌ بهذا الطلب بعينه وبـ`x-amz-date`) — **ليس هو الدعوى** |

- **حساسيّةُ هذا الاعتماد أدنى من الأوّل بالتصميم**: هو «اعتمادُ قراءةٍ فقط» (`README.md:100,136-150`)، وسياسةُ مجموعته
  `rikz-backup-readers` تمنح `OBJECT_INSPECT` **و`OBJECT_READ`** (`README.md:77-79`) ⇒ **تسريبُه يسمح بتنزيل كتل `restic` المشفّرة**
  (لا فكّها بلا `RESTIC_PASSWORD`) — أي هجومٌ غيرُ متّصلٍ على كلمة المستودع، لا فتحٌ مباشر.
- **ومواضعُ تشغيله ثلاثة**: داخل صورة خدمة النسخ (`ops/backup/Dockerfile:13-16` يثبّت `openssl curl` وينسخ السكربت) ·
  «من خارج المضيف» عند طرفٍ ثالث (`README.md:126-127` · `:110`) — والمقترحُ المسجَّل سيرُ GitHub مجدول (`docs/decisions.md:2091`، `ق-٧٦٠`) ·
  وجهازُ المالك. **وقد جرى على الدلو الحقيقي** (`docs/decisions.md:2155` — «الوجودُ من الدلو بالمعرّف الكامل … `check-repo-object.sh`»).

### 2.4 القاعدةُ مكتوبةٌ ومحروسة — على ملفٍّ واحد وسرٍّ واحد

- `policy-proof.sh:5-6` و`:45-48`: القيمُ تُقرأ إلى البيئة ثم `export` ثم `-e VAR` بلا قيمة — «لا قيمةَ في سطر الأمر».
- والحارس: `offsite-backup.spec.ts:224` (النصّ) و`:228-235` — **يقرأ `PROOF` وحده** ويمنع `-e RESTIC_PASSWORD=` وحده (`:235`).
  ⇒ **بحثٌ غير متناظر (`§8.7`)**: القاعدةُ طُبّقت على سكربتٍ وسرٍّ، وبقي `DRILL`/`OBJECT` — اللذان يقرؤهما الملفُّ نفسُه (`:27,29`) — خارجها.

### 2.5 مسحٌ للمستودع كلِّه — هل غيرُهما؟

المسحُ على **الملفات الـ21 المتتبَّعة** من صنف (سكربت · `yml/yaml` · `Dockerfile` · `.githooks/*`) خارج `apps/*/src|test` و`docs`، بنمط:
`-e [A-Z_]+="?\$ | --env [A-Z_]+= | -macopt | -hmac  | PGPASSWORD= | -u "?\$ | --user  | --password[= ] | -p"\$ | POSTGRES_PASSWORD= | SECRET[A-Z_]*=\$ | KEY=\${?[a-z]`

النتيجة (والمسبارُ مُصادَقٌ لأنه أصاب المواضع الخمسة المعلومة):
- `restore-drill.sh:68,101,108` · `check-repo-object.sh:49,50` — **وحدها**.
- `policy-proof.sh:38` — إسنادٌ داخل الصدفة لا `argv` (إيجابيٌّ كاذب مقروء).
- `.github/workflows/web-tests.yml:238` — `echo "$GHCR_TOKEN" | docker login … --password-stdin` — **الطريقةُ الصحيحة** (عبر المدخل القياسي؛ و`echo` مدمجةٌ في `bash` فلا `argv`).
- `docker/postgres-init-prod/01-create-app-role.sh:10-14` يمرّر كلمة `app_user` داخل `heredoc` إلى `psql` — **ليس `argv`** (مقروء).
- `offsite-backup.sh` و`check-freshness.sh`: `restic` يقرأ `RESTIC_PASSWORD` من البيئة (`offsite-backup.sh:31,102-118` · `check-freshness.sh:18,21`) — نظيفان.

⇒ **الدعوى تسمّي الملفَّين الصحيحين، ولا ثالثَ لهما** في ما يُتتبَّع.

### 2.6 هل تقبل كلُّ أداةٍ السرَّ بلا `argv`؟ — بالطريقة الموثَّقة أو المقيسة

| الأداة | الطريقةُ بلا `argv` | الدليل |
|---|---|---|
| **`docker run`** | `-e NAME` بلا `=قيمة` ⇒ يُؤخذ من بيئة عميل `docker` | **مُثبَتٌ في المستودع بالتشغيل**: `restore-drill.sh:47` (`-e RESTIC_PASSWORD`) نجح على الدلو الحقيقي (`decisions.md:2155`)، و`policy-proof.sh:48` كذلك. ⚠️ نصُّ وثيقة Docker **لم أقرأه** في هذه الجلسة (لا اتصال خارجي) |
| **`docker login`** | `--password-stdin` | `web-tests.yml:238` (مستعمَلٌ في السير) |
| **`openssl dgst` / `openssl mac`** | **لا طريقة**: المفتاحُ عبر `-hmac val` أو `-macopt key:|hexkey:` وحدهما | **مقيسٌ محلّياً** (OpenSSL 3.5.7): `openssl dgst -help` يسرد `-hmac val` و`-macopt val` ولا غيرهما؛ `openssl dgst -hmac-env X` ⇒ `Unknown option or message digest: hmac-env`؛ `openssl mac -help` لا يعرف إلا `-macopt`. ⇒ **لا يُصلَح `check-repo-object.sh` بتعديل نداء `openssl`، بل بإخراج `HMAC` منه** |
| **`curl`** | ① `-K -` (ملفُّ خيارات من المدخل القياسي) · ② `--variable %NAME` + `--expand-user '{{…}}'` (يستورد من البيئة) · ③ `-H @-` للرؤوس | `curl --manual` المحلّي: `-K, --config` (أسطر `648-680`: «الشرطة `-` تجعله يقرأ من المدخل القياسي»)؛ `--variable` (`6208-6230`، و«أُضيفت المتغيّرات في 8.3.0» — السطر `145`)؛ `--aws-sigv4` (`392-410`، «Added in 7.75.0»)؛ و`-u, --user` (`6149-6165`) يقول صراحةً ما معناه أن curl يُخفي الوسيطَ من قائمة العمليات حيث أمكن **لكنه يبقى مرئياً لحظةً قبل المسح**، وينصح بأخذه من ملفٍّ لا من سطر الأمر — **وهو نصُّ الدعوى من وثيقة الأداة نفسِها** |
| **صورة `postgres`** | `POSTGRES_PASSWORD_FILE` (متغيّرات `_FILE`) | **معرفةٌ لم أقرأها هنا** — ولا تلزم: انظر 5.1 (`--network none` + الاسم بلا قيمة) |
| **`restic`** | `RESTIC_PASSWORD` من البيئة | مستعمَلٌ ومُثبَت (`offsite-backup.sh:102-118`) |

---

## (3) حكمٌ مبدئيّ بالقراءة

### (أ) السرُّ في `argv` — **قائمة**

الآليةُ في الشيفرة بلا لبس: قيمةٌ سرّيةٌ تُبنى في وسيطٍ لعمليةٍ خارجية (`restore-drill.sh:68,101,108` · `check-repo-object.sh:50,77` و`:49,78-81`)،
والفرعُ `:108` **جرى على مفتاح الإنتاج** (`decisions.md:2155`). ووثيقةُ `curl` المحلّية تقرّ بالظاهرة عامّةً (2.6).

**وما يحدّ أثرَها — ولا يُسقطها:**
- **النافذة ثوانٍ**: عميلُ `docker run --rm` يعيش مدّةَ الحاوية (إقلاع + `node`)؛ و`openssl` أجزاءَ ثانية؛ والتجربةُ شهرية.
- **لا مستخدمَ بشريّاً على المضيف** — مقيسٌ ومسجَّل (`offsite-backup.spec.ts:161-163`): القارئون جذر.
- **ويبقى ما لا يُعرف بالقراءة** (7): وكيلُ مراقبةٍ يسجّل أسطرَ أوامر العمليات، أو `auditd` يسجّل `execve`، أو عمليةٌ غيرُ جذريةٍ مخترَقة — **كلُّها تقرأ `/proc/<pid>/cmdline`**، و`environ` لا تُقرأ إلا لمالك العملية.

**وتمييزٌ لازم**: الشكلُ `-e NAME` يُزيل القيمة من `argv` **لكن `docker` يخزّنها في إعداد الحاوية** مدّةَ وجودها (يراه `docker inspect` — أي الجذرُ أو مجموعةُ `docker`، وهما يقرآن `env.production` أصلاً). فالإصلاحُ يُغلق **قناةَ قائمة العمليات** — وهي الدعوى بعينها — لا قناةَ مالك `docker`. والبديلُ الأقوى (المدخلُ القياسي) في 5.1.

### (ب) لا `shellcheck` في السير — **قائمة**، **لكنه ليس حارسَ (أ)**

- `grep -rnic shellcheck .github/workflows/` ⇒ `0` في الملفّين (والمسبارُ يرى: `setup-node` وُجد في `web-tests-light.yml:161,206`).
- في المستودع كلِّه لا ذكرَ إلا توجيهَي `# shellcheck source=` (`deploy.sh:43,47`) — وهما دليلُ أن المسبارَ يرى.
- **لكنّ الأسطرَ المخالفة في (أ) مقتبسةٌ صحيحاً** (`-e SECRETS_ENCRYPTION_KEY="$key"`) — ولا أعرف بالقراءة فحصاً في `shellcheck` يمسك «قيمةً سرّيةً في وسيط». ⇒ **`shellcheck` بوّابةُ صحّةٍ عامّة، لا بوّابةَ هذه الفجوة**؛ وإصلاحُ (أ) يحتاج حارسَه الخاصّ (4) — وإلا عاد الخرقُ في سكربتٍ قادم ومرّ `shellcheck` أخضر. **يُقاس** بتشغيل `shellcheck` على `restore-drill.sh` الحاليّ: المتوقَّع ألّا يذكر `:101` بحرف.

---

## (4) كيف تُقاس حيّاً

السكربتان **لا يعملان في السير** (لا دلوَ ولا صورة — `offsite-backup.spec.ts:16-18`)، فالقياسُ طبقتان كسابقة
`deploy-recreate-guard.spec.ts:16,25-26` («`docker` و`compose` مزيَّفان — فالإثباتُ إثباتُ المنطق لا النشر»):

### 4.1 الطبقةُ الحتمية — اختبارٌ يُشغّل السكربتَ الحقيقيّ على أدواتٍ مزيَّفةٍ تسجّل `argv`

**الملف**: `apps/api/src/common/ops-argv-secrets.spec.ts` — يعمل في `api-unit` (الخفيف، كلَّ دفع؛ `web-tests-light.yml:241-246` بلا قاعدة).
**الآلية**: `spawnSync('sh', ['ops/backup/<script>'], { env: { ...PATH=<shimDir>:$PATH, ...sentinels } })` كما في `deploy-recreate-guard.spec.ts:33-37`،
و`<shimDir>` مجلّدٌ مؤقّت فيه ملفّاتٌ تنفيذيةٌ مزيَّفة **خارجية** (لا دوالّ صدفة — كي يقع عليها `VAR=… cmd` كما يقع على الحقيقية):

```sh
#!/bin/sh
# docker المزيَّف — يسجّل argv كما وصله، ويسجّل ما «سُلِّم» للحاوية من البيئة أو المدخل.
printf 'docker %s\n' "$*" >> "$ARGV_LOG"
case "$*" in
  *" restore latest "*)   cp "$FIXTURE"/db.dump "$FIXTURE"/globals.sql "$FIXTURE"/manifest.json "$FIXTURE"/env.production "$DRILL_DIR"/ ;;
  *" stats "*)            printf '{"total_size":123456}\n' ;;
  "exec "*"-tAc "*)       case "$*" in *pg_tables*) echo 84;; *_prisma_migrations*) echo 110;; *"from invoices"*) echo 11;;
                                       *journal_entries*) echo 70;; *pg_roles*) echo 1;; *zatca_credentials*) printf '%s\n' "$FAKE_CIPHER";; esac ;;
  *" node -e "*)          # التسليم: من «-e NAME=VAL» في argv، أو من بيئة هذه العملية حين «-e NAME»، أو من المدخل حين «-i»
                          { printf 'env:%s\n' "${SECRETS_ENCRYPTION_KEY-}"; case "$*" in *" -i "*) printf 'stdin:'; cat;; esac; } >> "$SEEN_LOG" ;;
esac
exit 0
```

و`openssl` المزيَّف يسجّل `argv` ثم `exec "$REAL_OPENSSL" "$@"`؛ و`curl` المزيَّف يسجّل `argv` ويحفظ مدخلَه القياسيّ إن وُجد `-K -`
ويطبع `<ListBucketResult><Contents><LastModified>$(date -u +%Y-%m-%dT%H:%M:%S.000Z)</LastModified></Contents></ListBucketResult>`.

**الحراسات** (ولكلٍّ منها حالةٌ معلومةُ الجواب — قاعدة «صادِق المسبار»):
- `restore-drill`: `DRILL_DIR` و`FIXTURE` من الاختبار؛ `env.production` في التثبيت يحمل `SECRETS_ENCRYPTION_KEY=` بقيمةٍ حارسةٍ **تُبنى بدالّة** (`'S7B' + 'K'.repeat(40)` — لئلّا يُدين حارسٌ نصّيٌّ الاختبارَ، `§8.7`/الوجه السادس عشر)؛ `DRILL_PASS` حارسةٌ ثانية؛ وبيانُ `manifest.json` بـ`sha256` المقلب المزيَّف (يحسبه الاختبار) وبالأعداد أعلاه.
- `check-repo-object`: `RESTIC_REPOSITORY=s3:https://example.invalid/b` · `AWS_ACCESS_KEY_ID=S7B-AKID` · `AWS_SECRET_ACCESS_KEY` حارسة · `AWS_REGION=me-riyadh-1`.

**التوكيدات** — بالترتيب، والأوّلُ شرطٌ لقراءة ما بعده:
1. **المسبارُ يرى**: `ARGV_LOG` غيرُ فارغ، ويحوي `restore latest --host` و`node -e` (أو `openssl`/`curl` للثاني) — وإلا فالمزيَّفُ لم يقع على `PATH` وكلُّ «نظيف» بعده عمى.
2. **السكربتُ اكتمل**: الخروج `0` و`restore-drill ok` (أو `🟢`) — فالحارسُ بلغ السطرَ المقصود.
3. **⭐ الدعوى**: `ARGV_LOG` **لا يحوي** أيَّ حارسة (`S7BK…` · `DRILL_PASS` · سرّ `AWS`)، ولا `-macopt "key:` ولا `hexkey:` إطلاقاً.
4. **التسليم** (الحالةُ الموجبة — تمنع أن يمرّ «إصلاحٌ» يُسقط السرَّ كلّياً): `SEEN_LOG` **يحوي** حارسةَ المفتاح (`env:` أو `stdin:`)، ومدخلُ `curl` المحفوظ يحوي سرَّ `AWS` (أو بيئتُه حين `--variable`).
5. **الفرعان**: `restore-drill` مرّتين — `FAKE_CIPHER` غيرُ فارغ (الفرعُ `:101`) وفارغ (الفرعُ `:108`).

**ما يسقط على الشيفرة الحالية** (والدعوى قائمة): التوكيد ③ — `ARGV_LOG` يحوي
`docker run --rm -e SECRETS_ENCRYPTION_KEY=S7BKKK… -e CIPHER=… mad-app-api node -e …` (من `:101`/`:108`)
و`docker run -d --name restore-drill-… -e POSTGRES_PASSWORD=<الحارسة> …` (من `:68`)
و`openssl dgst -sha256 -mac HMAC -macopt key:AWS4<الحارسة>` (من `:50`/`:77`). والتوكيدات ① ② ④ تمرّ عليها — **فالسقوطُ للسبب المقصود وحده**.

⚠️ **البيئة**: على العدّاء `sh` = `dash` (لهجةُ الخادم نفسُها)؛ وعلى ويندوز `sh` = `bash` في وضع `posix` (مقيسٌ محلّياً: `sh --version` ⇒ `GNU bash 5.3.15`) — والسلوكُ المقيس هنا (`VAR=… cmd` · `printf` مدمجة) واحدٌ فيهما، ويُتحقَّق بتشغيله على الاثنين.

### 4.2 الطبقةُ الحيّة — تشغيلٌ واحدٌ بيد المالك بعد الإصلاح (`ق-٥٧٦`)

- `restore-drill.sh` على الخادم كما في `ق-٧٧٩` ⇒ `restore-drill ok` بالأعداد نفسِها (`84 · 110 · 11 · 70` أو ما صار) والفكُّ `canary` أو `stored-secret`.
- `check-repo-object.sh` باعتماد القراءة **بثلاث حالات** كما صودق فحصُ الطزاجة (`README.md:173`): لقطةٌ حديثة ⇒ `0` · `MAX_AGE_HOURS=0` ⇒ `1` · **سرٌّ خاطئٌ عمداً ⇒ `2`** (يُثبت أن التوقيعَ يُفحص فعلاً بعد نقله إلى `curl`).
- واختياريّاً على الخادم، مجسٌّ يقرأ `/proc/*/cmdline` كلَّ `10 ms` مدّةَ التجربة ويعدّ **بلا طباعة** (`grep -c -F -f <ملفٍّ 0600 فيه المفتاح>` — فالنمطُ من ملفٍّ لا من سطر الأمر، وإلا وقع المجسُّ في ما يقيس): المتوقَّع `0`؛ ويُصادَق قبلها على حالةٍ موجبة معلومة (عمليةُ `sleep` رميّة تحمل حارسةً في `argv` ⇒ `≥1`).

---

## (5) الإصلاح — بالمواضع

### 5.1 `restore-drill.sh`

```sh
# :68 — القاعدةُ لا تحتاج شبكةً أصلاً: كلُّ ما بعدها `docker exec` على المقبس المحلّي (:71 · :78 · :80 · :83).
POSTGRES_PASSWORD="$DRILL_PASS" docker run -d --name "$CONTAINER" --network none \
  -e POSTGRES_PASSWORD -e POSTGRES_USER="$DRILL_USER" -e POSTGRES_DB="$DRILL_DB" "$PG_IMAGE" >/dev/null \
  || fail "تعذّر إقلاعُ قاعدة التجربة"

# :101 و:108 — القيمةُ في بيئة عميل docker لا في argv؛ والحاويةُ تأخذها بالاسم (نمطُ :47 و policy-proof.sh:48).
SECRETS_ENCRYPTION_KEY="$key" CIPHER="$cipher" docker run --rm -e SECRETS_ENCRYPTION_KEY -e CIPHER "$API_IMAGE" \
  node -e '…كما هو…' || fail "…"
SECRETS_ENCRYPTION_KEY="$key" docker run --rm -e SECRETS_ENCRYPTION_KEY "$API_IMAGE" \
  node -e '…كما هو…' || fail "…"
```

- **لماذا الإسنادُ السابق للأمر لا `export`**: `VAR=… cmd` يضع القيمةَ في بيئة **تلك العملية وحدها** (لا تسري إلى `docker exec` وما بعده)، ولا يمرّ بـ`argv`. وشيفرةُ `node` لا تتغيّر لأن `key()` تقرأ `process.env` لحظةَ النداء (`secret.util.ts:21-22`).
- **والبديلُ الأقوى** (يُغلق قناةَ `docker inspect` أيضاً): `printf '%s' "$key" | docker run -i --rm "$API_IMAGE" node -e '…يقرأ المدخل ثم process.env.SECRETS_ENCRYPTION_KEY=… ثم require…'` — `printf` مدمجةٌ في `dash`؛ ويغيّر نصَّ `node`. **والقرارُ للمالك**؛ وأرجّح الأوّل لاتّساقه مع `ق-٧٦٠` ولأن قارئ `docker inspect` يقرأ `env.production` أصلاً.
- **`--network none`** يجعل كلمةَ قاعدة التجربة بلا قيمة أصلاً (لا منفذَ يُطرق). ويُترك `$net_arg` لحاويتَي `restic` (`:47` · `:120`) — تحتاجان الشبكة للدلو، ومنه جرت التجربةُ المحلّية على `MinIO` (`README.md:165`).
- **وخلّةٌ قريبة** (`SC2086` على `$net_arg` — 5.4): يُستبدل `net_arg` بـ`${DOCKER_NET:+--network "$DOCKER_NET"}` في `:47` و`:120` — **مع إبقاء `-e AWS_DEFAULT_REGION` في السطر السابق لـ`restore latest`** لأن الحارس يقرؤه بموضعه (`offsite-backup.spec.ts:110-113`).

**ما يجب ألّا ينكسر** (الحارسُ القائم يقرأ النصّ): `docker run -d --name "$CONTAINER"` (`offsite-backup.spec.ts:94` — محفوظٌ لأن الإسنادَ يسبقه على السطر نفسه) · `secret.util` و`$API_IMAGE` و`fail "المفتاحُ المستعاد لا يفكّ` (`:98-101`) · سطرُ الاستعادة وما قبله (`:105-113`) · `stats --mode raw-data --no-lock --json` (`:207`).

### 5.2 `check-repo-object.sh`

`openssl` لا يأخذ مفتاحَ `HMAC` إلا من `argv` (2.6، مقيس) ⇒ **يُنقل التوقيعُ كلُّه إلى `curl --aws-sigv4`** ويُحذف `:48-81` (`hex_sha256` · `hmac_*` · اشتقاقُ المفتاح):

```sh
# الاعتمادُ يصل curl من مدخله القياسيّ (`-K -`) — سطرُ الأمر يُقرأ من قائمة العمليات.
case "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" in *[\"\\]*) echo "⛔ اعتمادٌ بحرفٍ لا يُكتب في ملفّ خيارات curl" >&2; exit 2;; esac
body=$(printf 'user = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" \
  | curl -sS -f --max-time 30 -K - --aws-sigv4 "aws:amz:$REGION:s3" \
      -H "x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
      "$scheme://$host/$bucket?$query" 2>/dev/null) || { echo "⛔ تعذّر سؤالُ الدلو ($host/$bucket) — ولا حكمَ بالصمت." >&2; exit 2; }
```

- **البديل** حين يثبت أن `curl ≥ 8.3.0` في **كلِّ** موضع تشغيل: `--variable %AWS_ACCESS_KEY_ID --variable %AWS_SECRET_ACCESS_KEY --expand-user '{{AWS_ACCESS_KEY_ID}}:{{AWS_SECRET_ACCESS_KEY}}'` — `argv` يحمل الأسماءَ وحدها، بلا قيودِ الاقتباس.
- `printf` مدمجةٌ في `dash` و`bash`؛ **وفي `ash` صورة `alpine` يُتحقَّق** (`type printf` في صورة الخدمة) — فإن كانت خارجيةً عاد السرُّ إلى `argv`.
- ثابتُ `x-amz-content-sha256` هو تجزئةُ الجسم الفارغ (كان يُحسب في `:54`) — ليس سرّاً.

**ما ينكسر أو يُخاطَر به** — وكلُّه يُقاس في 4.2 لا يُفترض:
- **مسارٌ مُثبَتٌ على أوراكل يُستبدل** (`decisions.md:2155`): لا أعرف بالقراءة أن `curl` يضيف `x-amz-content-sha256` لخدمة `s3` أو يوقّع الرأسَ الممرَّر، ولا كيف يُطبِّع `prefix=snapshots%2F` (خطرُ ترميزٍ مزدوج `%252F`) — **فالحالاتُ الثلاث في 4.2 شرطُ دمج**.
- **إصدارُ `curl`**: `--aws-sigv4` منذ `7.75.0` و`--variable` منذ `8.3.0` (الدليلُ المحلّي) — وإصدارُ `curl` في صورة `postgres:16-alpine` (`apk add` بلا تثبيت إصدار — `Dockerfile:14`) وفي موضع الطرف الثالث **غيرُ مقروء**.
- **الحارسُ القائم** `⑤ب` (`offsite-backup.spec.ts:136-149`) يبقى أخضر: لا `RESTIC_PASSWORD`، `AWS_ACCESS_KEY_ID` و`${RESTIC_REPOSITORY:?` و`exit 1/2` و`وجودٌ لا سلامة` و`MAX_AGE_HOURS:-26` كلُّها باقية.
- **`ops/backup/Dockerfile:13-14`**: تعليقُه («`openssl`+`curl` لأجل SigV4») يُصحَّح؛ و`openssl` يمكن حذفُه من `apk add` — تغييرٌ في صورة الخدمة يُبنى في النشر التالي.
- **`README.md:136-146`**: الاستعمالُ بالبيئة لا يتغيّر.

### 5.3 الحارسُ الذي يمنع العودة — وإثباتُه بالعكس

- **السلوكيّ**: 4.1 نفسُه — وهو الأصل.
- **وتوسيعُ النصّيّ القائم** (`offsite-backup.spec.ts:228-235`) من `PROOF`/`RESTIC_PASSWORD` إلى **كلِّ سكربتٍ مشتقٍّ بالـ`shebang`** (القائمة كما في 5.4) بنمطٍ مجرَّدِ التعليقات (`§8.24`): لا `-e <NAME>=` حيث `NAME` يطابق `KEY|SECRET|PASS|TOKEN`، ولا `-macopt "?(hex)?key:`، ولا `-u|--user` بقيمةٍ من `$` — **بحالتين معلومتين تُبنيان بدالّة**. وهو ما يلتقط السكربتَ **القادم** الذي لا يعرفه 4.1.

**الإثباتُ بالعكس** — بصياغاتٍ محتملة لا مفصَّلة (`§8.8` الوجه الثاني)، ويُتحقَّق من وقوع كلِّ كسرٍ (`grep -c`) قبل قراءة نتيجته، والتزامٌ قبل الكسر وبوّابةُ `git diff --quiet` على الهدف (`§8.8` الوجه الخامس):
1. إعادةُ `:101` حرفياً (`-e SECRETS_ENCRYPTION_KEY="$key"`) ⇒ ③ يسقط مسمّياً سطرَ `docker`.
2. في `check-repo-object`: `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"` بدل `-K -` — **وهي صيغةُ مثال وثيقة `curl` نفسِها** (`--manual` `392-410`) ⇒ ③ يسقط.
3. **كسرُ الإسقاط**: حذفُ `-e SECRETS_ENCRYPTION_KEY` كلّياً ⇒ ③ يمرّ و**④ يسقط** — يُثبت أن الاختبارَ لا يُرضيه غيابُ السرّ.
4. **كسرُ العمى**: الاختبارُ بلا `shimDir` في `PATH` ⇒ ① يسقط قبل أن يُقرأ ③.

### 5.4 `shellcheck` في السير

**أ. السطحُ — أربعةَ عشرَ ملفّاً** (مقيسٌ بطريقين: `git ls-files` بالامتداد والمجلّد، و`Grep` متعدّد الأسطر على أوّل سطرٍ `#!…sh` في الشجرة — **تطابقا**؛ وملفّاتُ `.claude/hooks/*` المتتبَّعة `.mjs` لا صدفة، ولا `.bash/.zsh/.ksh`):
`.githooks/post-checkout` · `.githooks/pre-commit` · `.githooks/pre-push` (بلا امتداد — `§8.15`) · `deploy.sh` ·
`docker/postgres-init-prod/01-create-app-role.sh` · `ops/backup/{check-freshness,check-repo-object,offsite-backup,policy-proof,pre-deploy-dump,restore-drill}.sh` ·
`ops/deploy/recreate-guard.sh` · `ops/deploy/recreate-guard.selftest.sh` · `ops/mail/mail-dns-check.sh`.
⚠️ **خارج سطح `shellcheck`**: الصدفةُ المضمَّنة في `docker-compose.prod.yml` (`entrypoint:` في `:169` و`:266`) وفي خطوات `run:` في السير — لا يقرؤها `shellcheck` مباشرةً.

**ب. ما يُتوقَّع أن يرفعه — بالقراءة لا بالتشغيل** (`shellcheck` غيرُ مثبَّتٍ محلّياً: `command -v shellcheck` ⇒ لا شيء):

| الملف | التحذير المتوقَّع | الشدّة | الموضع | الحكم |
|---|---|---|---|---|
| `ops/deploy/recreate-guard.selftest.sh` | `SC2034` متغيّرٌ غيرُ مستعمَل — **نحو خمسةَ عشرَ**: `RED GRN YLW DIM RST` · `COMPOSE_FILE` · `MUST_RECREATE` · `before_commit` · `after_commit` · `code_changed` · `deploy_start` · `before_id` · `before_img` · `img_name` · `changed_files` — كلُّها تُقرأ داخل `eval "$block"` الذي لا يراه `shellcheck` | warning | `:21,25-26,29-35,40-42` (و`:65`) | **مانعٌ عند `-S warning`** — توجيهُ `# shellcheck disable=SC2034` على الملفّ **بسببٍ مكتوب** («تُقرأ في الكتلة المقتطَعة من `deploy.sh`») |
| `ops/deploy/recreate-guard.selftest.sh` | `SC2164` — `cd` بلا `|| exit` (الملفُّ `set -uo pipefail` بلا `-e`) | warning | `:14` (والملفُّ بلا `-e` — `:11`) | مانع — `cd "$ROOT" \|\| exit 2` |
| `deploy.sh` | `SC2034` — `code_changed` يُسنَد ولا يُقرأ (بحثٌ: يرد في `:114,117` وحدهما، وفي الاختبار الذاتي `:31`) | warning | `:114` · `:117` | مانع — **بقايا ما قبل `ق-٧١٧`؛ يُحذف** |
| `ops/backup/policy-proof.sh` | `SC2154` — `val` يُقرأ ولا يُسنَد (الإسنادُ داخل `eval`) | warning | `:41-42` | مانع — توجيهٌ بسبب، أو `val=$(eval "printf '%s' \"\$$k\"")` |
| `deploy.sh` | `SC1091` — لا يتبع `source` بلا `-x` | info | `:44` · `:48` | يُزال بـ`-x` من جذر المستودع (التوجيهان `source=` في `:43,47` نسبيّان إلى مجلّد العمل) |
| `ops/backup/restore-drill.sh` | `SC2086` — `$net_arg` بلا اقتباس (تقسيمٌ مقصود) | info | `:47` · `:68` · `:120` | يُزال بـ5.1 (`${DOCKER_NET:+…}` و`--network none`) |
| `ops/backup/check-repo-object.sh` | `SC2015` — `A && B \|\| C` حيث `C` ليس `exit/echo/printf` | info | `:42` · `:46` | لا يمنع عند `-S warning`؛ ويُكتب `if … fi` إن أُريد الصفر |
| `ops/backup/pre-deploy-dump.sh` | `SC2086` — `$COMPOSE` بلا اقتباس (مقصود) | info | `:32` | يُترك أو مصفوفة |
| `.githooks/pre-push` | `SC2086` — `$registry` · `$code` بلا اقتباس (مقصود) | info | `:41` · `:43` | يُترك |
| `ops/mail/mail-dns-check.sh` · `ops/deploy/recreate-guard.sh` | `SC2086` محتمل على `return $fail` / `return $hit` | info | `:66` / `:36` | يُترك |
| `ops/deploy/recreate-guard.selftest.sh` | `SC2317` محتمل — أجسامُ دوالّ لا تُنادى إلا من `eval` | info | `:22-24,46-63` | يُترك |
| `check-freshness.sh` · `offsite-backup.sh` · `01-create-app-role.sh` · `pre-commit` · `post-checkout` | لا شيءَ متوقَّع (`offsite-backup.sh:55` صيغةُ `&& echo \|\| echo` مستثناةٌ من `SC2015`؛ والمتغيّراتُ الكبيرة في `01-create-app-role.sh` تُعدّ بيئةً فلا `SC2154`) | — | — | — |

⚠️ **الجدولُ تنبّؤٌ من القراءة** — لا يُبنى عليه نفيٌ («لا شيء متوقَّع» ليس «نظيف») حتى يُشغَّل مرّةً (`§8.7` الوجه الحادي عشر). **وأهمُّ ما فيه**: عند `-S warning` **ثلاثةُ ملفّاتٍ تُسقط البوّابة من يومها الأوّل** — فتُصلَح في الطلب نفسه، لا تُفتح البوّابةُ «للإبلاغ» (`continue-on-error` ممنوعٌ نصّاً: `web-tests-light.yml:17-18`).

**ج. الموضع — خطوةٌ في وظيفة `vitest` الخفيفة، لا وظيفةٌ جديدة:**
- `ci-split.spec.ts:147-150` يشترط أن وظائفَ الخفيف **بالضبط** `['api-unit','vitest']` ⇒ وظيفةٌ ثالثة تُسقطه ويلزم تعديلُه؛ والخطوةُ داخل وظيفةٍ قائمة لا تمسّه.
- ولا تجعل الخطوةُ `vitest` «ثقيلة»: `isHeavy` (`ci-split.spec.ts:64`) يبحث عن `services:` أو `docker build` أو `playwright` في جسم الوظيفة — **فلا تُكتب هذه الكلماتُ في `run:`** (التعليقاتُ تُنزع قبل القراءة: `:49-52`).
- والكلفة: حصّةُ السير «نفدت في أسبوعين» (`ci-split.spec.ts:13-14`) — ووظيفةٌ جديدة تدفع إقلاعَ عدّاءٍ كاملاً؛ وخطوةٌ تدفع ثوانيَ.
- و**السابقة**: وظيفةُ `vitest` تحمل أصلاً حارسين ليسا من الواجهة (إصدارُ Node `:113-132` · نهاياتُ أسطر الخطّافات `:134-159`) — فالخطوةُ الثالثة تُوضع بعد `:159`.
- **والمساراتُ مغطّاة**: `ops/**` `:61` · `deploy.sh` `:57` · `.githooks/**` `:49` · `docker/**` `:34` · `.github/workflows/**` `:35` — كلُّ سكربتٍ يمسّه طلبٌ يُشغّل الخفيف.

```yaml
      # ⛔ shellcheck — كلُّ سكربتِ صدفةٍ متتبَّع، مشتقّاً من السطر الأوّل لا من الامتداد (§8.15: الخطّافات بلا امتداد).
      - name: shellcheck — سكربتات الصدفة المتتبَّعة (blocking)
        shell: bash
        run: |
          set -o pipefail
          command -v shellcheck >/dev/null || { echo "::error::shellcheck غير موجود على العدّاء — لا فحصَ بلا أداته"; exit 1; }
          shellcheck --version | sed -n '2p'
          files=()
          while IFS= read -r -d '' f; do
            [ -f "$f" ] || continue
            IFS= read -r first < "$f" 2>/dev/null || true
            case "$first" in
              '#!'*/sh|'#!'*/sh' '*|'#!'*/bash|'#!'*/bash' '*|'#!'*/dash|'#!'*'env sh'|'#!'*'env bash') files+=("$f") ;;
            esac
          done < <(git ls-files -z)
          printf '  %s\n' "${files[@]}"
          # المسبارُ مُصادَقٌ بحالتين معلومتين: خطّافٌ بلا امتداد يجب أن يُرى، وملفُّ JSON يجب ألّا يُرى.
          printf '%s\n' "${files[@]}" | grep -qx '.githooks/pre-commit' || { echo "::error::المسبارُ أعمى: .githooks/pre-commit غائب"; exit 1; }
          printf '%s\n' "${files[@]}" | grep -qx 'deploy.sh'             || { echo "::error::المسبارُ أعمى: deploy.sh غائب"; exit 1; }
          ! printf '%s\n' "${files[@]}" | grep -qx 'package.json'        || { echo "::error::المسبارُ واسع: package.json التُقط"; exit 1; }
          echo "سكربتاتُ الصدفة: ${#files[@]}"
          shellcheck -x -S warning "${files[@]}"
```

- **`-x` من جذر المستودع**: لأن توجيهَي `deploy.sh:43,47` ومسارَ `recreate-guard.selftest.sh:27` نسبيّةٌ إلى مجلّد العمل.
- **`LC_ALL: C.UTF-8`** مضبوطةٌ على مستوى الملف (`web-tests-light.yml:71-73`) — ولها هنا أثرٌ ثانٍ: `shellcheck` يقرأ تعليقاتٍ عربية، وأدواتٌ تفكّ النصّ بلغة البيئة تسقط أو تصمت على بايتاتٍ لا تعرفها. **يُقاس في أوّل تشغيل** (الحارسُ `locale-gate.spec.ts:122` يُلزم الضبطَ على مستوى الملف أصلاً).
- **الإصدار**: يُطبع ليكون مقروءاً؛ وتحديثُ صورة العدّاء قد يُدخل فحوصاً جديدة فيحمرّ `main` بلا تغيير شيفرة — **يُقرّر المالك**: قبولُه، أو تثبيتُ إصدارٍ بتنزيلٍ ببصمة.
- **هل هو مثبَّتٌ مسبقاً على `ubuntu-latest`؟ — لا أستطيع الاستشهاد** (لا اتصال خارجي، ولا ذكرَ في المستودع). **يُتحقَّق في أوّل تشغيل**: الخطوةُ مغلقةٌ عند الغياب (`exit 1` مسمّى) لا صامتة؛ فإن غاب أُضيف `sudo apt-get install -y shellcheck` قبلها صراحةً.
- **وحدُّه المعلَن**: لا يرى صدفةَ `compose` ولا `run:` في السير (5.4-أ)، **ولا يرى سرّاً في `argv`** (3-ب) — فحارسُ 5.3 لازمٌ معه لا بديلٌ عنه.

### 5.5 ملاحظتان مجاورتان — خارج الدعوى، ومن جنسها

1. **`restore-drill.sh` لا يُزيل مجلّدَ الاستعادة**: `DRILL_DIR` من `mktemp -d` (`:29`) و`cleanup` تحذف الحاويةَ وحدها (`:38`) ⇒ **`env.production` المستعاد (أسرارُ الإنتاج كلُّها) و`db.dump` يبقيان على قرص المضيف** بعد كلِّ تجربة، والتقريرُ نفسُه يُكتب داخله (`:35`). يُقترح حذفُ `env.production` و`db.dump` في `cleanup` وإبقاءُ التقرير — **قرارُ المالك** (التقريرُ يُقرأ شهراً بعد شهر).
2. **تاريخُ الصدفة**: الاستعمالُ الموثَّق يضع الكلمةَ في سطرٍ يُكتب بيد (`restore-drill.sh:17` · `README.md:45,130-131,143-145`) ⇒ **`~/.bash_history`** لا قائمةُ العمليات. العلاج توثيقيّ: `read -rs RESTIC_PASSWORD; export RESTIC_PASSWORD` أو مسافةٌ بادئة مع `HISTCONTROL=ignorespace`.

---

## (6) أرقامٌ تُقاس قبل التغيير

الإصلاحُ لا يمسّ القاعدة؛ **والأرقامُ هنا تقيس أثرَ التسريب لو وقع وأيَّ فرعٍ تسلكه التجربة** — وكلُّها قراءة.

⚠️ **`zatca_credentials` تحت `ENABLE` + `FORCE`** (`migrations/20260803210000_zatca_saas_credentials/migration.sql:51-52` · `20260905030000_egs_units/migration.sql:89`) ⇒ عدٌّ بـ`app_user` بلا سياقٍ يعود **صفراً بنجاح** (`§4` «عدٌّ خارج سياق المستأجر يرى الغياب»). و`login_identities` و`companies` **بلا RLS** (بحثُ `ALTER TABLE … (ENABLE|FORCE) ROW` عليهما ⇒ صفر؛ والمسبارُ يرى: النمطُ نفسُه على `invoices` وجد ثلاثة مواضع).

**① نصفُ القطر — بدور `mad_app` (خارقٌ يتجاوز RLS حتى تحت `FORCE` — `§6.1`)، على `mad_app`:**
```sql
SELECT count(*)                                           AS rows,
       count(*) FILTER (WHERE "privateKeyEnc"       IS NOT NULL) AS private_keys,
       count(*) FILTER (WHERE "complianceCsidEnc"   IS NOT NULL) AS compliance_csids,
       count(*) FILTER (WHERE "complianceSecretEnc" IS NOT NULL) AS compliance_secrets,
       count(*) FILTER (WHERE "productionCsidEnc"   IS NOT NULL) AS production_csids,
       count(*) FILTER (WHERE "productionSecretEnc" IS NOT NULL) AS production_secrets,
       count(DISTINCT "companyId")                        AS companies
FROM zatca_credentials;

SELECT count(*) AS mfa_secrets FROM login_identities WHERE "mfaSecret" IS NOT NULL;
```

**② مصادقةُ المسبار — الحالةُ التي يجب أن تُعمي** (تُثبت أن الصفرَ بلا سياقٍ عمى لا نفي):
```sql
BEGIN;
SET LOCAL ROLE app_user;
SELECT current_setting('app.company_id', true) AS ctx;   -- المتوقَّع: فارغ/NULL
SELECT count(*) FROM zatca_credentials;                  -- المتوقَّع: 0 مهما كان في الجدول
ROLLBACK;
```

**③ البديلُ داخل السياق بدور `app_user`** (إن لم يُستعمل `mad_app`) — بقراءة السياق قبل الثقة بالعدّ:
```sql
DO $$
DECLARE c text; n bigint; total bigint := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', c, true);
    IF current_setting('app.company_id', true) IS DISTINCT FROM c THEN RAISE EXCEPTION 'السياقُ لم يُضبط لـ %', c; END IF;
    SELECT count(*) INTO n FROM zatca_credentials WHERE "privateKeyEnc" IS NOT NULL;
    total := total + n;
  END LOOP;
  RAISE WARNING 'private_keys=% (مجموعُ المنشآت)', total;
END $$;
```

**④ أيُّ فرعٍ تسلكه التجربةُ على الإنتاج** (`:101` أم `:108`) — الاستعلامُ ① على قاعدة المنشور، **بأمر المالك**: آخرُ قراءةٍ مسجَّلة `canary` في `ق-٧٧٩` (`decisions.md:2155`).

**⑤ قياساتٌ على المضيف لا في القاعدة — بأمر المالك، للقراءة** (هي التي تحسم «هل قُرئ فعلاً»، لا القاعدة):
- `findmnt -no OPTIONS /proc` — هل `hidepid=2`؟ (إن كان، فقائمةُ العمليات لا تُقرأ لغير المالك أصلاً.)
- `getent passwd | awk -F: '$3>=1000 && $7!~/nologin|false/'` — تأكيدُ «لا مستخدمَ بشريّاً» (`offsite-backup.spec.ts:161-163`) اليوم.
- `systemctl is-active auditd; auditctl -l 2>/dev/null | grep -c execve` — هل تُسجَّل أسطرُ الأوامر؟
- `ps -eo user,comm | sort -u` — وكلاءُ مراقبةٍ للمزوّد يجمعون قائمةَ العمليات (وإن وُجد فهل يحفظ `cmdline`؟).
- `docker --version` و`docker compose run --rm --entrypoint sh backup-offsite -c 'curl --version | head -1; type printf'` — إصدارُ `curl` في صورة الخدمة، و`printf` مدمجةٌ في `ash` أم لا (شرطُ 5.2).

---

## (7) ما لا أعرفه

1. **هل قُرئ المفتاحُ فعلاً في `2026-09-14`؟** — يتوقّف على (6-⑤): وكيلُ مراقبة · `auditd` · `hidepid`. فإن وُجد ما يحفظ `cmdline`، **فتدويرُ `SECRETS_ENCRYPTION_KEY` سؤالٌ للمالك** (ويكلّف إعادةَ تشفير الأعمدة الستّة في 2.2). لا أرجّح هنا.
2. **نصُّ وثيقة Docker لـ`-e NAME`** و**`POSTGRES_PASSWORD_FILE`** لصورة `postgres` — لم أقرأهما (لا اتصال خارجي). الأوّلُ مُثبَتٌ بالتشغيل في المستودع (2.6)؛ والثاني لا يلزم الإصلاح.
3. **سلوكُ `curl --aws-sigv4` مع خدمة `s3` على أوراكل**: إضافةُ `x-amz-content-sha256` وتوقيعُه، وتطبيعُ `%2F` في الاستعلام — **غيرُ موثَّقٍ في الدليل المحلّي** (بحثُ `content-sha256|UNSIGNED|s3` في `curl --manual` ⇒ لا شيء متّصل؛ والمسبارُ يرى: `--aws-sigv4` نفسُه وُجد في `392`). **يُحسم بالحالات الثلاث في 4.2 فقط.**
4. **إصدارُ `curl`** في صورة `postgres:16-alpine` (غيرُ مثبَّت — `Dockerfile:14`) وعند الطرف الثالث المقترح (سيرُ GitHub — `decisions.md:2091`) — يحدّد `-K -` أم `--variable`.
5. **`printf` مدمجةٌ في `ash` صورة `alpine`؟** — أرجّح نعم ولا أجزم؛ وإن لم تكن فـ5.2 يعود بالسرّ إلى `argv` عبر `printf` نفسِها.
6. **`shellcheck` على `ubuntu-latest`** — مثبَّتٌ مسبقاً أم لا، وبأيّ إصدار: غيرُ مستشهَد (5.4-ج). **وجدولُ 5.4-ب كلُّه تنبّؤٌ من القراءة** — خصوصاً: هل يُسقط `SC2015` حين `C` كتلةُ `{ …; exit 2; }` (`check-repo-object.sh:42`)، وهل يُطلق `SC2086` على `for f in $staged` (`pre-commit:26,48`) — لا أجزم في أيٍّ منهما.
7. **مفاتيحُ `shellcheck` على العربية**: هل يفكّ التعليقاتِ العربية بلا خطأ تحت `C.UTF-8` — لم يُقَس.
8. **هل يلزم تسجيلُ الاختبار الجديد عند `source-scan.util`** (`readsDeclaredStrings()` في الحرّاس المجاورة) — لم أقرأ شرطَه؛ يُقرأ عند البناء.
9. **موضعُ تشغيل التجربة في `ق-٧٧٩`** (الخادم أم غيره) — مرجَّحٌ لا مقروء.

---

### خلاصة
- **الحكم: قائمة** — `restore-drill.sh:68,101,108` يضع كلمةَ قاعدة التجربة و**`SECRETS_ENCRYPTION_KEY` الإنتاجيَّ** (ومعه نصُّ `privateKeyEnc` في `:101`) في `argv` عميل `docker`، والفرعُ `:108` **جرى فعلاً** (`ق-٧٧٩`)؛ و`check-repo-object.sh:50,77` يضع سرَّ `AWS` (اعتمادَ القراءة) في `argv` `openssl`، و`:49,78-81` مفاتيحَ التوقيع المشتقّة. ولا ثالثَ في المستودع.
- **الإصلاح**: `VAR=… docker run -e VAR` + `--network none` لقاعدة التجربة؛ و**إخراجُ `HMAC` من `openssl`** (لا يقبل المفتاحَ إلا من `argv` — مقيسٌ على 3.5.7) إلى `curl --aws-sigv4` بالاعتماد من `-K -` أو `--variable` — **ويُعاد إثباتُه على أوراكل بثلاث حالات**.
- **`shellcheck` غائبٌ عن السير (قائمة) لكنه لا يمسك هذه الفجوة**: الحارسُ الحقيقيُّ اختبارٌ يُشغّل السكربتَ على `docker/openssl/curl` مزيَّفةٍ تسجّل `argv` — يسقط اليوم على ③ وحده، ومعه توكيدُ التسليم كي لا يُرضيه إسقاطُ السرّ.
- **`shellcheck` خطوةً في وظيفة `vitest` الخفيفة** (لا وظيفةٌ ثالثة — `ci-split.spec.ts:147-150` يشترط وظيفتين بالضبط)، بقائمةٍ مشتقّةٍ من الـ`shebang` ومسبارٍ مُصادَق، و`-x -S warning` — **وثلاثةُ ملفّاتٍ متوقَّعٌ أن تُسقطها يومَ فتحها** (`recreate-guard.selftest.sh` · `deploy.sh:114,117` · `policy-proof.sh:41-42`) فتُصلَح في الطلب نفسه.

---

## مراجعةٌ عدائية

> **ما قُرئ**: `D:\worktrees\outbox-266` على `eda979a2` (مقروءٌ من `git log -1` — يطابق رأسَ التقرير). قراءةٌ وحدها؛
> المُشغَّلُ الوحيد محلّيٌّ للقراءة: `openssl version` و`openssl dgst -help` (OpenSSL 3.5.7).
> **الحكم: يبقى «قائمة»** — كلُّ موضعٍ في 2.2 و2.3 مطابقٌ حرفاً (`restore-drill.sh:68,101,108` · `check-repo-object.sh:49,50,77-81`)؛
> والتصحيحاتُ أدناه في **الشدّة** و**تصميم القياس**، لا في الحكم.

### ع١ — الشدّةُ في `check-repo-object.sh` أعلى مما قيل: التشغيلُ المسجَّل الوحيد كان **بمفتاح الرفع** لا بمفتاح القراءة

- التقرير (2.3): «حساسيّةُ هذا الاعتماد أدنى بالتصميم: هو اعتمادُ قراءةٍ فقط». هذا **التصميم**؛ **والواقعُ المسجَّل** في السطر نفسِه الذي يستشهد به
  (`docs/decisions.md:2155`): «④ الفحصُ اليوميّ باعتماد القراءة بلا كلمة المستودع: `🟢` … — **بمفتاح الرفع على الخادم آليّةً؛ ومفتاحُ القراءة عند طرفٍ ثالث ما زال بلا قرار**».
- ومفتاحُ الرفع (`rikz-backup-writers`) يملك `OBJECT_CREATE` و`OBJECT_READ` وحذفَ `locks/*` (`ops/backup/README.md:70-74`)،
  ويصل الخدمةَ باسم `AWS_SECRET_ACCESS_KEY` (`docker-compose.prod.yml:252-253`) — وهو ما يمرّ في `argv` `openssl` عند `:77` حين يُشغَّل الفحصُ داخل الخدمة.
- ⇒ تسريبُه لا يسمح بتنزيل الكتل المشفّرة فحسب، بل **بزرع كائنٍ حديثٍ تحت `snapshots/`** فيقول `check-repo-object.sh` `🟢` (`:93-107` يقرأ `LastModified` وحده)
  بينما النسخُ متوقّف — وهذا الفحصُ هو شرطا القبول ١ و٤ (`README.md:97,100`). **أي أن التسريب يُعمي الإنذارَ نفسَه**، لا يكشف بياناتٍ مشفّرة فقط.

### ع٢ — ما جعله التقريرُ «غيرَ محسوم» محسومٌ جزئياً بالسطر نفسِه (`decisions.md:2155`)

- **موضعُ التشغيل** (7-9): السطرُ يعدّ تحت «**الكتاباتُ على المنشور**»: «سكربتاتُ الجولة ومخرجاتُها في `/root/`»، و④ «على الخادم» ⇒ جرى على الخادم جذراً، لا ترجيحاً.
- **مجلّدُ الاستعادة** (5.5-1): الملاحظةُ صحيحةٌ عن السكربت (`restore-drill.sh:29,35,38` — `cleanup` يحذف الحاويةَ وحدَها)، لكن السطرَ يقول «ومجلّدُ التجربة أُزيل بعدها» ⇒
  **أُزيل بيدٍ في تلك الجولة**؛ فالبندُ «خطوةٌ يدويةٌ تُنسى» لا «أسرارٌ باقيةٌ على القرص الآن» — ويُقاس على المضيف قبل أن يُقال غيرُ ذلك.

### ع٣ — تصميم 4.1: التوكيدُ ④ **يسقط على الشيفرة الحالية أيضاً** — فقولُ «① ② ④ تمرّ عليها — فالسقوطُ للسبب المقصود وحده» (سطر 157) غيرُ صحيح

- `docker` المزيَّف (سطر 135) يكتب `env:${SECRETS_ENCRYPTION_KEY-}` **من بيئته هو** ومن مدخله — ولا يقرأ `-e NAME=VAL` من `argv` رغم أن تعليقَه (سطر 134) يقول ذلك.
  والشيفرةُ الحالية تسلّم المفتاحَ **في `argv`** (`restore-drill.sh:101,108`) لا في البيئة ⇒ `SEEN_LOG` = `env:` فارغ ⇒ ④ يسقط.
- وفي `check-repo-object` الحالي لا يصل سرُّ `AWS` إلى `curl` أصلاً — يصله التوقيعُ وحده (`:83-88`) ⇒ ④ («مدخلُ `curl` يحوي سرَّ `AWS`») يسقط كذلك.
- **العلاج**: ④ يجب أن يكون **محايداً للقناة** — يجمع ما وصل الحاويةَ من `argv` (`-e NAME=VAL`) **ومن** البيئة **ومن** المدخل — فيمرّ على الحالي وعلى الإصلاح ويسقط على «إصلاحٍ» يُسقط السرّ وحده.
  ولـ`check-repo-object` يُصاغ ④ «السرُّ وصل الأداةَ التي توقّع — أيّاً كانت» (`openssl` في الحالي عبر `argv`، `curl` بعد الإصلاح عبر المدخل).

### ع٤ — ③ أعمى عن كلِّ أداةٍ خارجيةٍ غيرِ مزيَّفة: «إصلاحٌ» ينقل السرَّ إلى `argv` أداةٍ ثالثة يمرّ ③ و④ معاً

- المزيَّفُ ثلاثة (`docker` · `openssl` · `curl`). وصياغةٌ محتملةٌ للإصلاح (`§8.8` الوجه الثاني): `env SECRETS_ENCRYPTION_KEY="$key" docker run -e SECRETS_ENCRYPTION_KEY …` —
  `env` **أداةٌ خارجية** فالمفتاحُ في `argv` عمليةِ `env`، و`docker` المزيَّف يجده في بيئته ⇒ ③ نظيف و④ أخضر. وكذلك `sh -c "…$key…"` و`xargs` و`printf` خارجيةٌ في صدفةٍ بلا مدمجة.
- **الأقوى**: `PATH` = مجلّدُ المزيَّف **وحده**، وفيه غلافٌ مولَّدٌ لكلِّ أمرٍ خارجيٍّ يستدعيه السكربتان (`find` · `sed` · `head` · `grep` · `cut` · `tr` · `date` · `sha256sum` · `mktemp` · `env` …)
  يسجّل `argv` ثم يُنفّذ الحقيقيَّ بمساره المطلق ⇒ أمرٌ غيرُ مغلَّف يسقط بـ«not found» صاخباً، فلا قناةَ تفلت. (أو `strace -f -e trace=execve` على لينكس — **وتوفّرُه على العدّاء غيرُ مقروء**.)
- وعلى ويندوز: `PATH` يُبنى بـ`path.delimiter` لا بـ`:` (سطر 122 يكتب `PATH=<shimDir>:$PATH`).
- والسابقةُ المستشهَدُ بها (`deploy-recreate-guard.spec.ts:33-37`) **تُشغّل `bash` بلا بيئةٍ معدَّلة**، ومزيَّفُها **دوالُّ صدفةٍ داخل السكربت** (`recreate-guard.selftest.sh:46-63`) لا ملفّاتٌ على `PATH` — فـ«كما في» تقريبٌ لا نسخ.

### ع٥ — الحارسُ النصّيّ المقترح (5.3) ومسحُ 2.5 يعميان عن ثلاث صياغاتٍ محتملة

- نمطُ 2.5 `-e [A-Z_]+="?\$` ونمطُ 5.3 «`-e <NAME>=`» لا يطابقان: `-e "SECRETS_ENCRYPTION_KEY=$key"` (الاقتباسُ قبل الاسم) · `--env NAME=` · `env NAME=val cmd`.
- **مسحي الأوسع** على الملفات الواحد والعشرين نفسِها (`(-e|--env) +["'][A-Z_]+=` · `\benv +[A-Z_]+=` · `--password[= ]` · `PGPASSWORD=` · عنوانٌ فيه `user:pass@`) لم يجد **مخالفةً في `argv`**؛
  والمسبارُ يرى: أصاب `DATABASE_URL: postgresql://app_user:…@` في `docker-compose.prod.yml:88` و`web-tests.yml:180,576` (بيئةٌ لا `argv`). ⇒ «لا ثالثَ» يصمد، والنمطُ يُوسَّع قبل أن يُحرَس به.
- **ووسّعتُ السطحَ إلى شيفرة التطبيق** (خارج ما مسحه التقرير): `child_process|execFile|spawn(|execSync|spawnSync` في `apps/` بلا ملفّات `.spec.ts` ⇒ لا شيء في `apps/api/src` الإنتاجيّ؛
  والمسبارُ يرى: وجد `apps/api/test/zatca-cert-expiry.e2e-spec.ts:46` و`apps/api/scripts/test-clean.mjs:56` (بلا أسرار). ⇒ لا ثالثَ في شيفرة التطبيق أيضاً.
- ⚠️ إن وُسِّع 5.3 يوماً إلى السير: `web-tests.yml:240` يمرّر `-e MINIO_ROOT_PASSWORD=mad_app_dev_password` في `argv` — **قيمةُ تطويرٍ علنية** (`docker-compose.yml:7`) لا سرّ؛ تلزمها قائمةُ استثناءٍ بالاسم.

### ع٦ — مجسُّ `/proc` الاختياري (4.2) أعمى عن العمليات القصيرة، ومصادقتُه لا تمثّلها

- نداءاتُ `openssl` في `hmac_*` (`check-repo-object.sh:49-50,77-81`) تعيش أجزاءَ من الملّي‑ثانية؛ أخذُ عيّنةٍ كلَّ `10 ms` يفوّتها، **فالصفرُ عليها عمى**.
- والحالةُ الموجبة المقترحة (`sleep` رميّة) **طويلةُ العمر** — تُثبت أن المجسَّ يرى الطويلَ لا القصير. تُصادَق بحالةٍ قصيرةٍ معلومة (`openssl dgst -hmac <حارسة>` رميّ) أو يُستبدل بتتبّع `execve` (`auditd`/`strace`).

### ع٧ — أمرُ القياس على المضيف (6-⑤) يلتقط ملفَّ التركيب الخطأ

- `docker compose run --rm --entrypoint sh backup-offsite -c '…'` **بلا `-f docker-compose.prod.yml --env-file .env.production`**: من `/opt/mad-app` يلتقط
  `docker-compose.yml` (التطوير — خدماتُه `postgres` · `redis` · `minio` وحدها: `docker-compose.yml:2,20,33`) ⇒ «لا خدمةَ بهذا الاسم» — **صنفُ حادثة `§8.6` بعينه**.
- ومع الملفّ الصحيح يُقلع `run` ما في `depends_on` (`docker-compose.prod.yml:242-244`) ⇒ `--no-deps`، أو `docker exec` في حاوية `backup-offsite` العاملة.

### ع٨ — SQL ③ قد يعدّ صفراً بلا خطأ

- الحلقةُ على `companies`؛ فإن عادت صفوفاً صفراً (قاعدةٌ فارغة أو دورٌ بلا صلاحية) خرج `private_keys=0` **بلا أن يُضبط سياقٌ واحد** — والفحصُ `IS DISTINCT FROM` داخل الحلقة لا يرى ذلك.
  يُضاف عدُّ التكرارات ويُرمى استثناءٌ إن كان صفراً أو خالف `SELECT count(*) FROM companies` بـ`mad_app`. ويلزم `SET ROLE app_user;` قبل `DO` (غيرُ مكتوب).
- ✅ وما قاله عن RLS صحيح: `zatca_credentials` `ENABLE`+`FORCE` بسياسة `app.company_id` (`20260803210000_zatca_saas_credentials/migration.sql:51-55`)؛
  و`companies`/`login_identities` بلا سياسة (بحثُ `ON "companies"` / `TABLE "…" (ENABLE|FORCE)` ⇒ فهارسُ ومشغِّلاتٌ فقط؛ والمسبارُ يرى: `TABLE "invoices" (ENABLE|FORCE)` ⇒ خمسة مواضع).

### ع٩ — `locale-gate.spec.ts:122` لا يحرس الملفَّ الخفيف

- التقرير (5.4-ج): «الحارس `locale-gate.spec.ts:122` يُلزم الضبطَ على مستوى الملف». الاختبار يقرأ **`web-tests.yml` وحده** (`:123`) — لا `web-tests-light.yml`.
  فـ`LC_ALL` في الخفيف (`web-tests-light.yml:71-73`) قائمٌ **غيرُ محروس**؛ وإن اعتمد عليه `shellcheck` فالشرطُ يُضاف إلى الاختبار أو يُكتب `env:` على الخطوة نفسِها.

### ع١٠ — خطوةُ `shellcheck`: الحالةُ السالبة لا تختبر ما تدّعيه، وسطحُ التشغيل أضيقُ من سطح القراءة

- `package.json` **بلا `shebang`**، فرفضُه لا يُثبت أن التمييزَ بالـ`shebang` يعمل. الحالةُ الصحيحة ملفٌّ **بـ`shebang` غيرِ صدفة يجب ألّا يُلتقط**:
  `.claude/hooks/install-user-hooks.mjs` (`#!/usr/bin/env node` — مقروءٌ بـ`\A#!` مع الأربعة عشر).
- القائمةُ تُشتقّ من المستودع كلِّه، **والمُشغِّلُ يعمل بمساراتٍ مكتوبة** (`web-tests-light.yml:31-66`): الأربعة عشر مغطّاةٌ اليوم (`:34,49,57,61`)،
  لكن سكربتاً في مجلّدٍ جذريٍّ جديد (`scripts/` · `tools/`) لا يُشغّل الخفيفَ على طلبه — و`ci-split.spec.ts:111-119,184-189` لا يراه لأنه يشتقّ من **أسماءٍ يذكرها حارس** لا من الـ`shebang`
  (`§8.7` الوجه الرابع عشر). يُضاف إلى الخطوة أو إلى `ci-split` توكيدُ «كلُّ ملفٍّ مختار تغطّيه مساراتُ الخفيف».
- ⚠️ `printf … | grep -qx` تحت `pipefail`: `grep -q` يخرج عند أول تطابق؛ آمنٌ هنا لأن القائمةَ أصغرُ من مخزن الأنبوب، ويُفضَّل `grep -qxF` أو `[[ " ${files[*]} " == *" deploy.sh "* ]]`.

### ع١١ — الإصلاحان والبوّابةُ الجديدة متشابكان — وهذا يُقرأ ميزةً ويُذكر شرطاً

- إن بقي `net_arg=""` و`[ -n "$DOCKER_NET" ] && net_arg=…` (`restore-drill.sh:41-42`) بعد استبداله بـ`${DOCKER_NET:+…}`، أو بقي من سقالة `SigV4` متغيّرٌ مُسنَدٌ لا يُقرأ
  (`check-repo-object.sh:52-75`) ⇒ `SC2034` (تحذير) يُسقط خطوةَ `shellcheck -S warning` في الطلب نفسِه. فيُحذف كلُّه، أو يُتوقَّع السقوط.
- وقراءتي لجدول 5.4-ب توافق الأحكامَ ذاتَ الشدّة `warning` الثلاثة: `recreate-guard.selftest.sh:14` (`cd` بلا `|| exit`، والملفُّ `set -uo pipefail` بلا `-e` — `:11`)
  و`SC2034` على `:21,25-26,29-35,40-42` · `deploy.sh:114,117` (`code_changed` لا يُقرأ — بحثٌ في المستودع: `deploy.sh:114,117` و`recreate-guard.selftest.sh:31` وحدها؛ ولا حارسَ يشترطه) ·
  `policy-proof.sh:41-42` (`val` يُسنَد داخل `eval`). **ويبقى تنبّؤاً** حتى يُشغَّل مرّة.

### ع١٢ — بدائلُ لم تُوزَن

- **قاعدةُ التجربة بلا كلمة إطلاقاً**: `--network none` + `-e POSTGRES_HOST_AUTH_METHOD=trust` — كلُّ ما بعد الإقلاع `docker exec` على المقبس المحلّي (`restore-drill.sh:71-88`)؛ فلا `DRILL_PASS` يُمرَّر بأيّ قناة.
- **إبقاءُ مسار `SigV4` المُثبَت على أوراكل** بدل نقله إلى `curl --aws-sigv4`: `HMAC` بالتركيب من `openssl dgst -sha256 -binary` **بلا مفتاح** —
  `H((K⊕opad) ∥ H((K⊕ipad) ∥ m))`، والـ`XOR` بحساب الصدفة المدمج، والبايتاتُ بـ`printf` مدمجةٍ بهروبٍ ثُمانيّ (`dash` لا يعرف `\x`). يتجنّب مجهولَي 7-3 و7-4 (إضافةُ `x-amz-content-sha256` وتطبيعُ `%2F` وإصدارُ `curl`)؛
  وكلفتُه تعقيدٌ ونفسُ شرط `printf` المدمجة في `ash` (7-5). **القرارُ للمالك** — والتقرير عرض طريقاً واحداً.
- **نفيُ `openssl` محدودٌ بإصداره**: أكّدتُ محلّياً على 3.5.7 أن `dgst` لا يعرف إلا `-hmac val` و`-macopt val` (والمسبارُ يرى: `-sign` حاضر). إصدارُ `openssl` في صورة `postgres:16-alpine` (`ops/backup/Dockerfile:14` بلا تثبيت) **غيرُ مقروء**،
  وإصداراتٌ أحدث قد تضيف قناةً بلا `argv` — **لم يُتحقَّق**؛ فتُكتب «لا طريقة في 3.5.7» لا «لا طريقة».

### ع١٣ — مجهولٌ حسمتُه بالقراءة (7-8)

- `guard-reads-declared.spec.ts:36-43,50-53`: الإعلانُ يلزم الحارسَ الذي يجمع `readFileSync` ومطابقةً بتعبير (`.test/.match/.exec`) **ويذكر `.ts`** في نصّه.
  فحارسُ 4.1 (يُشغّل ولا يطابق نصّاً) لا يلزمه؛ **وحارسُ 5.3 النصّيّ يلزمه** — `readsDeclaredStrings()` كما في `offsite-backup.spec.ts:7`.

### ع١٤ — مجاورٌ خارج الدعوى (سطرٌ واحد)

- مفاتيحُ `PII_ENCRYPTION_KEYS`/`PII_BLIND_INDEX_KEY` الجديدة (`apps/api/src/common/crypto/field-cipher.util.ts:51-60`) لا تُثبتها التجربةُ ولا تشترطها النسخة (`offsite-backup.sh:83-84` يشترط اثنين)؛
  وأيُّ خطوةٍ تُضاف لإثباتها تتبع قاعدةَ «لا قيمةَ في سطر الأمر» نفسَها من أوّل سطر.

**خلاصة المراجعة**: الحكمُ **قائمة** ويصمد؛ أهمُّ تصحيح — **الاعتمادُ الذي مرّ في `argv` `openssl` في التشغيل المسجَّل هو مفتاحُ الرفع لا القراءة** (`decisions.md:2155`)،
فتسريبُه يزرع كائناً «حديثاً» يُعمي فحصَ الوجود نفسَه (ع١)؛ ويليه أن اختبارَ 4.1 كما صُمِّم يسقط ④ على الشيفرة الحالية ويعمى ③ عن أيّ أداةٍ غيرِ مزيَّفة (ع٣ · ع٤).
