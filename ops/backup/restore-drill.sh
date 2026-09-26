#!/bin/sh
# ═══ الاستعادةُ مُثبَتةٌ لا مفترَضة — شرطُ قبولٍ لا حاشية (ق-٥٧٦) ═══
#
# ⭐ **على قاعدةٍ فارغةٍ جديدة** — وهو مسارُ يوم الكارثة بعينه، **وهو وحده الذي يكشف
#    نقصَ الأدوار**: `pg_dump` لا يصدّرها، فاستعادةٌ على قاعدةٍ قائمةٍ تنجح كذباً
#    لأن الدورَ موجودٌ أصلاً، وعلى قاعدةٍ فارغةٍ تسقط.
#
# يُثبِت خمسةً — **وكلُّها تُقارَن ببيان النسخة لا بالذاكرة**:
#   ① الأدوارُ تُنشأ · ② المقلبُ يُستعاد · ③ الجداولُ والهجراتُ بعددها
#   ④ المستنداتُ بعددها (فواتيرُ وقيود) · ⑤ **والمفتاحُ يفكّ** — بشيفرة التطبيق
#      نفسِها لا بنسخةٍ منها (`ق-٣٧٥`: الحارسُ يقرأ المصدر لا نظيرَه).
#   **ويقيس واحداً**: المخزَّنَ في المستودع مقابل حدّ المراجعة (`ق-٧٤٣` · `ق-٧٥١`) —
#      فالقياسُ الشهريُّ يعيش هنا لا في وثيقة.
#
# ⚠️ **ولا تخطٍّ صامت**: كلُّ توكيدٍ يتعذّر **يُسقط التجربة** ويُطبع سببُه.
#
# الاستعمال: RESTIC_REPOSITORY=… RESTIC_PASSWORD=… ./restore-drill.sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY غير مضبوط}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD غير مضبوط}"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.17.3}"   # الوسمُ نفسُه الذي تُبنى عليه الخدمة (Dockerfile)
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
API_IMAGE="${API_IMAGE:-mad-app-api}"
# مضيفُ لقطات الخدمة كما يضبطه ملفُّ التركيب (`BACKUP_HOST: mad-app-prod`) — قِيس 2026-09-14: افتراضٌ آخر لا يجد لقطة.
BACKUP_HOST="${BACKUP_HOST:-mad-app-prod}"
# منطقةُ التوقيع كما تُمرَّر للخدمة (`AWS_DEFAULT_REGION`) — تُمرَّر لحاويات التجربة أيضاً (فارغةً لا تضرّ).
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-}"; export AWS_DEFAULT_REGION
DRILL_DIR="${DRILL_DIR:-$(mktemp -d)}"
DRILL_DB="${DRILL_DB:-mad_app}"
DRILL_USER="${DRILL_USER:-mad_app}"
DRILL_PASS="${DRILL_PASS:-drill-$(date +%s)}"
CONTAINER="restore-drill-$(date +%s)"
DOCKER_NET="${DOCKER_NET:-}"
REPORT="${REPORT:-$DRILL_DIR/drill-report.json}"

fail() { echo "restore-drill FAILED: $1" >&2; cleanup; exit 1; }
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ⛔ **لا قيمةَ سرّيةَ في سطر أمر** (`ق-١٤٧٥` · التوجيه ٢٦٦ §٧ب): سطرُ الأمر يُقرأ من قائمة العمليات.
#    فكلُّ سرٍّ يصل الحاويةَ **بالاسم** (`-e NAME`) وقيمتُه في بيئة عميل `docker` وحده — بإسنادٍ يسبق
#    الأمرَ على سطره (`NAME=… docker run`) فلا يسري إلى ما بعده. وهو نمطُ حاويتَي `restic` هنا نفسِه.
#    والشبكةُ تُمرَّر كلمتين مقتبستين حين تُضبط — لا متغيّراً يُقسَّم بلا اقتباس.
# ① تُستعاد أحدثُ لقطةٍ **للخدمة** من المستودع — **بلا مساسٍ بالقاعدة الحيّة**. وتُقيَّد بمضيف الخدمة
#    (`BACKUP_HOST` — كما يُوسم في `offsite-backup.sh`) لئلّا تُلتقط لقطةُ إثبات السياسة الرميّة
#    (`--host policy-proof` — `ق-٧٦٠`) بوصفها «الأحدث» فتسقط التجربةُ كذباً على لقطةٍ بلا مقلب.
docker run --rm ${DOCKER_NET:+--network "$DOCKER_NET"} -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  -v "$DRILL_DIR:/out" "$RESTIC_IMAGE" restore latest --host "$BACKUP_HOST" --target /out >/dev/null \
  || fail "تعذّرت الاستعادةُ من المستودع"

dump=$(find "$DRILL_DIR" -name db.dump | head -1)
globals=$(find "$DRILL_DIR" -name globals.sql | head -1)
manifest=$(find "$DRILL_DIR" -name manifest.json | head -1)
envfile=$(find "$DRILL_DIR" -name env.production | head -1)
[ -n "$dump" ] || fail "اللقطةُ بلا db.dump"
[ -n "$globals" ] || fail "اللقطةُ بلا globals.sql — والأدوارُ لا يصدّرها pg_dump"
[ -n "$manifest" ] || fail "اللقطةُ بلا manifest.json — فلا رقمَ يُقارَن به"
[ -n "$envfile" ] || fail "اللقطةُ بلا env.production — ونسخةٌ بلا ما يفكّها ليست نسخة (ق-٥٧٤)"

want() { sed -n 's/.*"'"$1"'":\([0-9]*\).*/\1/p' "$manifest" | head -1; }
want_s() { sed -n 's/.*"'"$1"'":"\([^"]*\)".*/\1/p' "$manifest" | head -1; }

# ⓪ بصمةُ المقلب — **قبل الاستعادة**: بايتٌ تبدّل في الطريق يُكتشف هنا لا بعد ساعتين.
got_sha=$(sha256sum "$dump" | cut -d' ' -f1)
[ "$got_sha" = "$(want_s sha256)" ] || fail "بصمةُ المقلب لا تطابق البيان ($got_sha)"

# ② قاعدةٌ **فارغةٌ جديدة** — لا القائمة. **وبلا شبكة**: كلُّ ما بعدها `docker exec` على المقبس
#    المحلّي، فلا منفذَ يُطرق — وهي تحمل نسخةً كاملةً من بيانات الإنتاج المستعادة.
POSTGRES_PASSWORD="$DRILL_PASS" docker run -d --name "$CONTAINER" --network none -e POSTGRES_PASSWORD -e POSTGRES_USER="$DRILL_USER" -e POSTGRES_DB="$DRILL_DB" "$PG_IMAGE" >/dev/null \
  || fail "تعذّر إقلاعُ قاعدة التجربة"
i=0
until docker exec "$CONTAINER" pg_isready -U "$DRILL_USER" -d "$DRILL_DB" >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -gt 60 ] && fail "قاعدةُ التجربة لم تجهز خلال ٦٠ ثانية"; sleep 1
done

docker cp "$globals" "$CONTAINER:/tmp/globals.sql" >/dev/null || fail "تعذّر نقلُ ملفّ الأدوار"
docker cp "$dump" "$CONTAINER:/tmp/db.dump" >/dev/null || fail "تعذّر نقلُ المقلب"
# ③ الأدوارُ أولاً — وبدونها يسقط ما بعدها، وهو المقصودُ إظهارُه.
docker exec "$CONTAINER" psql -U "$DRILL_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=0 -f /tmp/globals.sql >/dev/null 2>&1 \
  || fail "تعذّر تطبيقُ الأدوار"
docker exec "$CONTAINER" pg_restore -U "$DRILL_USER" -d "$DRILL_DB" --no-owner /tmp/db.dump >/dev/null 2>&1 || true
# `pg_restore` يُنذر على امتيازاتٍ لا تخصّ التجربة — فالحكمُ من محتوى القاعدة لا من خروجه.

sql() { docker exec "$CONTAINER" psql -U "$DRILL_USER" -d "$DRILL_DB" -tAc "$1" 2>/dev/null | tr -d ' \r'; }
tables=$(sql "select count(*) from pg_tables where schemaname='public'")
migrations=$(sql 'select count(*) from _prisma_migrations')
invoices=$(sql 'select count(*) from invoices')
entries=$(sql 'select count(*) from journal_entries')
roles=$(sql "select count(*) from pg_roles where rolname='app_user'")

[ "${tables:-0}" = "$(want publicTables)" ] || fail "الجداولُ ${tables:-0} والبيانُ يقول $(want publicTables)"
[ "${migrations:-0}" = "$(want migrations)" ] || fail "الهجراتُ ${migrations:-0} والبيانُ يقول $(want migrations)"
[ "${invoices:-0}" = "$(want invoices)" ] || fail "الفواتيرُ ${invoices:-0} والبيانُ يقول $(want invoices)"
[ "${entries:-0}" = "$(want journalEntries)" ] || fail "القيودُ ${entries:-0} والبيانُ يقول $(want journalEntries)"
[ "${roles:-0}" != "0" ] || fail "دورُ app_user غائبٌ بعد الاستعادة — وهذا ما تكشفه القاعدةُ الفارغة وحدَها"

# ④ **والمفتاحُ يفكّ** (`ق-٥٧٤`) — بشيفرة التطبيق نفسِها: `decryptSecret` من صورة الخدمة.
key=$(grep '^SECRETS_ENCRYPTION_KEY=' "$envfile" | cut -d= -f2- | tr -d '"')
[ -n "$key" ] || fail "المفتاحُ SECRETS_ENCRYPTION_KEY غائبٌ في النسخة"
cipher=$(sql "select coalesce((select \"privateKeyEnc\" from zatca_credentials where \"privateKeyEnc\" is not null limit 1),'')")
if [ -n "$cipher" ]; then
  SECRETS_ENCRYPTION_KEY="$key" CIPHER="$cipher" docker run --rm -e SECRETS_ENCRYPTION_KEY -e CIPHER "$API_IMAGE" \
    node -e 'const{decryptSecret}=require("./dist/src/common/crypto/secret.util");const v=decryptSecret(process.env.CIPHER);if(!v||v.length<8)throw new Error("فكٌّ فارغ");console.log("decrypted:"+v.length+" حرفاً")' \
    || fail "المفتاحُ المستعاد لا يفكّ سرّاً مخزَّناً — فالنسخةُ تُستعاد ولا تُقرأ (ق-٥٧٤)"
  decrypted='stored-secret'
else
  # ⚠️ لا سرَّ مخزَّنٌ بعد (لا شهادةَ فوترة) — **فيُثبَت المفتاحُ بدورةٍ كاملة بشيفرة التطبيق**،
  #    ويُعلَن في التقرير أن المقارنة كانت على قيمةٍ مصنوعةٍ لا على صفٍّ قائم.
  SECRETS_ENCRYPTION_KEY="$key" docker run --rm -e SECRETS_ENCRYPTION_KEY "$API_IMAGE" \
    node -e 'const{encryptSecret,decryptSecret}=require("./dist/src/common/crypto/secret.util");const s="canary-"+Date.now();if(decryptSecret(encryptSecret(s))!==s)throw new Error("دورةُ التشفير لا تُغلق");console.log("canary ok")' \
    || fail "المفتاحُ المستعاد لا يعمل بشيفرة التطبيق"
  decrypted='canary-no-stored-secret'
fi

# ⑤ **والمخزَّنُ يُقاس شهرياً هنا لا في وثيقة** (`ق-٧٤٣` · `ق-٧٥١`): «يكتب ولا يحذف» يُراكم بلا تقليمٍ
#    يوميّ، **وبندُ متابعةٍ بلا قياسٍ دوريٍّ يُقرأ عند بلوغه لا قبله**. يُقرأ من المستودع نفسِه
#    (`restic stats` — حجمُ الحزم المخزَّنة) ويُقارَن بالحدّ (`10 GB` — حيث تنتهي حصّةُ أوراكل المجّانية
#    وتبدأ الكلفة)، **ويُكتب في التقرير** فيُقرأ الاتجاهُ شهراً بعد شهر. بلوغُ الحدّ **إنذارٌ مسمّىً بقراره
#    لا سقوطٌ للتجربة** — وتعذُّرُ القياس نفسِه يُسقطها، فلا شهرَ بلا رقم.
VOLUME_THRESHOLD_GB="${OFFSITE_VOLUME_THRESHOLD_GB:-10}"
stats=$(docker run --rm ${DOCKER_NET:+--network "$DOCKER_NET"} -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  "$RESTIC_IMAGE" stats --mode raw-data --no-lock --json 2>/dev/null) || fail "تعذّر قياسُ المخزَّن (restic stats) — ولا شهرَ بلا رقم"
stored=$(printf '%s' "$stats" | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' | head -1)
[ -n "$stored" ] || fail "restic stats بلا total_size — فلا رقمَ يُقارَن بالحدّ"
threshold_bytes=$((VOLUME_THRESHOLD_GB * 1000000000))   # جيجابايت عشرية — الأشدُّ حذراً
stored_mb=$((stored / 1000000))
if [ "$stored" -ge "$threshold_bytes" ]; then
  volume_note="⚠️ بلغ المخزَّنُ حدَّ المراجعة (${stored_mb} MB ≥ ${VOLUME_THRESHOLD_GB} GB) — يُعاد النظرُ في «يكتب ولا يحذف» (ق-٧٤٣)"
  echo "restore-drill: $volume_note" >&2
else
  volume_note="المخزَّنُ ${stored_mb} MB من حدّ المراجعة ${VOLUME_THRESHOLD_GB} GB (ق-٧٤٣)"
fi

printf '{"at":"%s","publicTables":%s,"migrations":%s,"invoices":%s,"journalEntries":%s,"appUserRole":%s,"decryption":"%s","sha256":"%s","storedBytes":%s,"volumeThresholdGb":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$tables" "$migrations" "$invoices" "$entries" "$roles" "$decrypted" "$got_sha" "$stored" "$VOLUME_THRESHOLD_GB" > "$REPORT"
echo "restore-drill ok: $tables جدولاً · $migrations هجرة · $invoices فاتورة · $entries قيداً · الأدوار ✔ · الفكّ $decrypted · $volume_note"
echo "التقرير: $REPORT"
