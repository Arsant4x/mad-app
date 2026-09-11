#!/bin/sh
# ═══ النسخةُ خارج المضيف — الوظيفةُ اليومية (ق-٥٧٣ … ق-٥٧٧) ═══
#
# ⚠️ **ولا تُعدَّل بمعزلٍ عن `restore-drill.sh`**: ما يُكتب هنا هو ما يُستعاد هناك،
#    وبيانُ هذه الوظيفة (`manifest.json`) هو ما تُوكّده تلك.
#
# ① **الوجهة** (`ق-٥٧٣`) تأتي من البيئة (`RESTIC_REPOSITORY`) — **فالآليةُ لا تعرف مزوّداً
#    بعينه**: أيُّ مستودعٍ يتكلّم `S3` يصلح، وتبديلُ الوجهة سطرُ بيئةٍ لا إعادةُ بناء.
#
# ⚠️ **وتأخذ مقلبَها بنفسها ولا تشحن مقلبَ الوظيفة المحلّية** — لسببين مقيسين:
#    **أوّلُهما** أن بيانَ النسخة يُقرأ من القاعدة الحيّة، فمقلبٌ عمرُه ساعاتٌ يُقارَن
#    بأرقامٍ أحدثَ منه **فتسقط التجربةُ الشهرية كذباً**؛ **وثانيهما** أن نسخةً خارج
#    المضيف تتبع مقلباً محلّياً تسقط بسقوطه — والغرضُ استقلالُها عنه.
#
# ② **والمنسوخُ ثلاثةٌ لا اثنان** (`ق-٥٧٤`):
#      · القاعدةُ **بأدوارها** — `pg_dump` لا يصدّر الأدوار، فيُؤخذ `pg_dumpall --globals-only`
#        معه؛ واستعادةٌ بلا الدور تسقط (وقع في تسليم أغسطس).
#      · **مخزنُ الملفّات** — فيه الفواتيرُ المختومة ونسخُ الإغلاق (`ق-٥٥٤`).
#      · **أسرارُ التشغيل** — وفيها `SECRETS_ENCRYPTION_KEY` و`INTEGRATIONS_ENC_KEY`:
#        **مقلبٌ بلا مفتاحه يُستعاد ولا يُقرأ**.
#
# ③ **والتشفيرُ قبل المغادرة**: `restic` يشفّر محلّياً، **ومفتاحُه (`RESTIC_PASSWORD`) عند
#    صاحب المشروع لا على المضيف** (`ق-٥٧٥`) — يُمرَّر بيئةً ولا يُكتب في صورةٍ ولا ملفّ.
#
# ⑤ **والفشلُ يُعلَن ولا يصمت** (`ق-٥٧٧`): كلُّ خروجٍ — نجح أو سقط — يكتب `STATUS_FILE`
#    ويطبع سطراً؛ **والحكمُ الحقيقيُّ يُقرأ من المستودع نفسِه** (`check-freshness.sh`)
#    لأن هذا الملفَّ يموت مع المضيف الذي يحرسه.
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY غير مضبوط — الوجهة تأتي من البيئة (ق-٥٧٣)}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD غير مضبوط — مفتاحُ النسخة عند صاحب المشروع (ق-٥٧٥)}"
: "${PGHOST:=postgres}"
: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"
MINIO_DATA="${MINIO_DATA:-/minio-data}"
ENV_FILE="${ENV_FILE:-/secrets/.env.production}"
STATUS_FILE="${STATUS_FILE:-/backups/offsite-status.json}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
MIN_TABLES="${MIN_TABLES:-50}"
MIN_BYTES="${MIN_BYTES:-51200}"

stage=$(mktemp -d)
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)

status() {
  # $1 = ok|fail · $2 = رسالة · $3 = لقطة (اختياري)
  printf '{"ok":%s,"at":"%s","startedAt":"%s","message":"%s","snapshot":"%s","repository":"%s"}\n' \
    "$( [ "$1" = ok ] && echo true || echo false )" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$started" "$2" "${3:-}" "$RESTIC_REPOSITORY" > "$STATUS_FILE" 2>/dev/null || true
}

fail() {
  # ⚠️ لا صمت: السببُ يُكتب في الحال ويُطبع على `stderr` ثم يسقط الخروج.
  echo "offsite-backup FAILED: $1" >&2
  status fail "$1"
  rm -rf "$stage"
  exit 1
}

# ① الأدوارُ أولاً — فهي ما يسقط الاستعادةَ إن غاب، وأرخصُ ما يُؤخذ.
pg_dumpall -h "$PGHOST" -U "$POSTGRES_USER" --globals-only -f "$stage/globals.sql" \
  || fail "تعذّر أخذُ أدوار القاعدة (pg_dumpall --globals-only)"
grep -q 'CREATE ROLE' "$stage/globals.sql" || fail "ملفُّ الأدوار بلا CREATE ROLE — استعادةٌ ستسقط على قاعدةٍ فارغة"

# ② مقلبٌ خاصٌّ بهذه النسخة — **ويُفحص محتواه لا حجمُه وحده** (نسخةٌ فارغة أسوأ من لا نسخة
#    لأنها تُطمئن كذباً، ولا تنكشف إلا يوم الحاجة).
pg_dump -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f "$stage/db.dump" \
  || fail "تعذّر أخذُ مقلب القاعدة"
tables=$(pg_restore -l "$stage/db.dump" 2>/dev/null | grep -c 'TABLE ' || true)
bytes=$(wc -c < "$stage/db.dump" | tr -d ' ')
[ "$tables" -ge "$MIN_TABLES" ] || fail "المقلبُ يحمل $tables جدولاً — دون الحدّ $MIN_TABLES"
[ "$bytes" -ge "$MIN_BYTES" ] || fail "المقلبُ حجمُه $bytes بايت — دون الحدّ $MIN_BYTES"

# ③ أسرارُ التشغيل — **وبدونها النسخةُ تُستعاد ولا تُقرأ** (`ق-٥٧٤`).
[ -f "$ENV_FILE" ] || fail "ملفُّ الأسرار $ENV_FILE غير موجود — ونسخةٌ بلا ما يفكّها ليست نسخة"
grep -q '^SECRETS_ENCRYPTION_KEY=' "$ENV_FILE" || fail "$ENV_FILE بلا SECRETS_ENCRYPTION_KEY"
grep -q '^INTEGRATIONS_ENC_KEY=' "$ENV_FILE" || fail "$ENV_FILE بلا INTEGRATIONS_ENC_KEY"
cp "$ENV_FILE" "$stage/env.production"
chmod 600 "$stage/env.production"

# ④ بيانُ النسخة — **الأرقامُ التي تُوكّدها التجربةُ الشهرية** (`ق-٥٧٦`)، تُقرأ من القاعدة الحيّة
#    **فورَ انتهاء المقلب**. ⚠️ **وحدُّه معلَن**: كتابةٌ تقع بين المقلب والعدّ تُظهر فرقاً في
#    التجربة — وهو **إنذارٌ يُقرأ لا عطلٌ صامت**، والوظيفةُ تعمل في ساعةٍ ساكنة.
q() { psql -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d ' ' ; }
invoices=$(q 'select count(*) from invoices')
entries=$(q 'select count(*) from journal_entries')
migrations=$(q 'select count(*) from _prisma_migrations')
pubtables=$(q "select count(*) from pg_tables where schemaname='public'")
sha=$(sha256sum "$stage/db.dump" | cut -d' ' -f1)
printf '{"producedAt":"%s","sha256":"%s","bytes":%s,"dumpTables":%s,"publicTables":%s,"migrations":%s,"invoices":%s,"journalEntries":%s}\n' \
  "$started" "$sha" "$bytes" "$tables" "${pubtables:-0}" "${migrations:-0}" "${invoices:-0}" "${entries:-0}" \
  > "$stage/manifest.json"

# ⑤ المستودع — يُهيّأ مرّةً، ويُقرأ وجودُه لا يُفترض.
restic cat config >/dev/null 2>&1 || restic init || fail "تعذّر تهيئةُ المستودع"

restic backup --tag mad-app --tag offsite --host "${BACKUP_HOST:-mad-app}" "$stage" "$MINIO_DATA" \
  || fail "تعذّر رفعُ النسخة إلى المستودع"

snapshot=$(restic snapshots --latest 1 --json 2>/dev/null | sed -n 's/.*"short_id":"\([0-9a-f]*\)".*/\1/p' | head -1 || true)

restic forget --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --keep-monthly "$KEEP_MONTHLY" --prune \
  || fail "تعذّر تطبيقُ سياسة الاحتفاظ"
restic check || fail "المستودعُ لا يجتاز فحصَ سلامته"

rm -rf "$stage"
status ok "نسخةٌ خارج المضيف: $tables جدولاً · $bytes بايت · $invoices فاتورة" "${snapshot:-}"
echo "offsite-backup ok: snapshot ${snapshot:-?} · $tables جدولاً · $bytes بايت"
