#!/usr/bin/env bash
# النسخةُ الشهرية على D (القاعدة الدائمة ٢٢ · `ق-١٥٥٩` · `ق-١٥٦٢` · `ق-١٦٠٨`).
#
# أربعُ خطوات، وكلٌّ تُشغَّل وحدَها باسمها أو كلُّها بلا اسم:
#   bundle  حزمةُ git بكلِّ المراجع، وتُتحقَّق.
#   db      مقلبُ قاعدة التطوير وأدوارُها، ثم إثباتُ الاستعادة على قاعدةٍ فارغة (القاعدة ٣٤).
#   minio   حجمُ مخزن الملفّات المحلّيّ (الحجمُ خارج المقلب).
#   raw     المصادرُ الخامّ التي تبقى خارج المستودع (`ق-١٦٠٨`): مجلّدُ المسوّدة كلُّه، والعدُّ يُطابَق قبل وبعد.
#
# الموضعُ `D:/mad-app-backups/<السنة-الشهر>` ويُعلَن في التقرير، وينقله صاحبُ المشروع لوسيطٍ خارجيّ.
# لا يكتب فوق ملفٍّ قائم: اسمُ كلِّ ملفٍّ بيومه، وإن وُجد خرج بخطأ.
set -euo pipefail
export LC_ALL=C.UTF-8 MSYS_NO_PATHCONV=1

MONTH=$(date +%Y-%m)
DAY=$(date +%F)
OUT="D:/mad-app-backups/$MONTH"
REPO=/d/mad-app
SCRATCH=/d/mad-app-scratch
C=mad-app-postgres-1
RT=mad_app_restore_check_monthly
case "$OUT" in D:/mad-app-backups/20[0-9][0-9]-[01][0-9]) : ;; *) echo "✖ الموضعُ خاطئ: $OUT"; exit 1 ;; esac
case "$RT" in mad_app_restore_check_monthly) : ;; *) echo "✖ قاعدةُ الإثبات خاطئة: $RT"; exit 1 ;; esac
mkdir -p "$OUT"

STEPS=${*:-bundle db minio raw}

refuse_existing() {
  for f in "$@"; do
    if [ -e "$f" ]; then echo "✖ قائمٌ فلا يُكتب فوقه: $f"; exit 1; fi
  done
}

step_bundle() {
  local B="$OUT/mad-app-all-refs-$DAY.bundle"
  refuse_existing "$B"
  echo "== git bundle"
  git -C "$REPO" bundle create "$B" --all 2>&1 | tail -2
  git -C "$REPO" bundle verify "$B" 2>&1 | tail -1
  echo "heads in bundle: $(git -C "$REPO" bundle list-heads "$B" | wc -l)"
  echo "refs in repo:    $(git -C "$REPO" for-each-ref | wc -l)"
  echo "sha256: $(sha256sum "$B" | cut -c1-64)"
  # The operations records live in their own repository (rikzapp/rikz-ops) and
  # are part of the monthly copy too.
  local OPS=/d/rikz-ops
  local OB="$OUT/rikz-ops-all-refs-$DAY.bundle"
  refuse_existing "$OB"
  if [ ! -d "$OPS/.git" ]; then echo "x ops repository missing: $OPS"; exit 1; fi
  echo "== git bundle (rikz-ops)"
  git -C "$OPS" fetch -q origin
  git -C "$OPS" bundle create "$OB" --all 2>&1 | tail -2
  git -C "$OPS" bundle verify "$OB" 2>&1 | tail -1
  echo "sha256: $(sha256sum "$OB" | cut -c1-64)"
}

step_db() {
  local D="$OUT/mad_app-$DAY.dump" G="$OUT/globals-$DAY.sql"
  refuse_existing "$D" "$G"
  echo "== pg_dump"
  docker exec "$C" pg_dump -U mad_app -Fc -f "/tmp/mad_app-$DAY.dump" mad_app
  docker exec "$C" sh -c "pg_dumpall -U mad_app --globals-only > /tmp/globals-$DAY.sql"
  docker cp "$C:/tmp/mad_app-$DAY.dump" "$D"
  docker cp "$C:/tmp/globals-$DAY.sql" "$G"
  echo "sha in container: $(docker exec "$C" sha256sum "/tmp/mad_app-$DAY.dump" | cut -c1-64)"
  echo "sha on D:         $(sha256sum "$D" | cut -c1-64)"
  echo "toc entries: $(docker exec "$C" pg_restore -l "/tmp/mad_app-$DAY.dump" | grep -vc '^;') table-data: $(docker exec "$C" pg_restore -l "/tmp/mad_app-$DAY.dump" | grep -c 'TABLE DATA')"

  echo "== restore proof on an empty database"
  docker exec "$C" psql -U mad_app -d postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $RT" -c "CREATE DATABASE $RT"
  set +e
  docker exec "$C" pg_restore -U mad_app -d "$RT" --no-owner "/tmp/mad_app-$DAY.dump" > /dev/null 2>&1
  echo "restore-exit=$?"
  set -e
  local Q="select (select count(*) from pg_tables where schemaname='public')||'|'||(select count(*) from pg_policies)||'|'||(select count(*) from _prisma_migrations)||'|'||(select count(*) from companies)||'|'||(select count(*) from invoices)||'|'||(select count(*) from journal_entries)||'|'||(select count(*) from journal_lines)||'|'||(select count(*) from contracts)"
  local LIVE REST
  LIVE=$(docker exec "$C" psql -U mad_app -d mad_app -Atc "SET row_security=off; $Q" | tail -1)
  REST=$(docker exec "$C" psql -U mad_app -d "$RT" -Atc "SET row_security=off; $Q" | tail -1)
  echo "tables|policies|migrations|companies|invoices|entries|lines|contracts"
  echo "live:     $LIVE"
  echo "restored: $REST"
  if [ "$LIVE" = "$REST" ]; then echo "MATCH"; else echo "MISMATCH"; fi
  docker exec "$C" psql -U mad_app -d postgres -qc "DROP DATABASE $RT"
  echo "restore db left: $(docker exec "$C" psql -U mad_app -d postgres -Atc "select count(*) from pg_database where datname='$RT'")"
  docker exec "$C" rm -f "/tmp/mad_app-$DAY.dump" "/tmp/globals-$DAY.sql"
  [ "$LIVE" = "$REST" ] || { echo "✖ الاستعادةُ لم تطابق"; exit 1; }
}

step_minio() {
  local M="$OUT/minio_data-$DAY.tar.gz"
  refuse_existing "$M"
  echo "== minio volume"
  local V
  V=$(docker volume ls -q | grep -E '(^|_)minio_data$' | head -1)
  [ -n "$V" ] || { echo "✖ لا حجمَ لمخزن الملفّات"; exit 1; }
  docker run --rm -v "$V:/data:ro" -v "$OUT:/out" alpine tar -czf "/out/minio_data-$DAY.tar.gz" -C /data .
  echo "volume: $V · sha256: $(sha256sum "$M" | cut -c1-64)"
}

step_raw() {
  # الأصنافُ التي سمّاها فهرسُ الأرشيف (`docs/archive/scratch/README.md` · «ما لم يُنقل»): `pdf` · `html` · صورُ الصفحات
  # · نصوصُها المستخرجة `txt` · ومخرجاتُ الأدوات `json`. لا مخابئَ jest ولا أدواتِ الجلسات، ولا اسمَ يدلّ على سرّ (القاعدة ١٧):
  # تلك تُستثنى بأسمائها ولا تُفتح.
  # القائمةُ بفاصلٍ صفريّ إلى tar مباشرة، بلا xargs (المساراتُ العربية فقدت ملفّاتٍ بـ`xargs -I{}` من قبل)، والعدُّ قبل وبعد هو الحكم.
  # GNU tar يقرأ «D:» اسمَ مضيفٍ بعيد ما لم يُعطَ `--force-local`، فيخرج بـ«Cannot connect to D: resolve failed».
  local R="$OUT/raw-sources-$DAY.tar"
  refuse_existing "$R"
  echo "== raw sources (from $SCRATCH)"
  LIST=$(mktemp)
  trap 'rm -f "$LIST"' EXIT
  ( cd "$SCRATCH" && find . -type d \( -name jest-cache -o -name 'jest-*' -o -name node_modules -o -name tmp -o -name .git \) -prune -o \
      -type f \( -iname '*.pdf' -o -iname '*.html' -o -iname '*.htm' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \
      -o -iname '*.webp' -o -iname '*.txt' -o -iname '*.json' \) \
      ! -iname '*secret*' ! -iname '*password*' ! -iname '*token*' ! -iname '*credential*' ! -iname '*apikey*' ! -iname '.env*' \
      -print0 ) > "$LIST"
  local BEFORE AFTER
  BEFORE=$(tr -cd '\0' < "$LIST" | wc -c)
  tar --force-local -cf "$R" -C "$SCRATCH" --null -T "$LIST"
  AFTER=$(tar --force-local -tf "$R" | grep -vc '/$')
  echo "files listed: $BEFORE · entries in archive: $AFTER · bytes: $(stat -c %s "$R") · sha256: $(sha256sum "$R" | cut -c1-64)"
  [ "$BEFORE" = "$AFTER" ] || { echo "✖ العدُّ لم يطابق"; exit 1; }
}

for s in $STEPS; do
  case "$s" in
    bundle|db|minio|raw) "step_$s" ;;
    *) echo "✖ خطوةٌ غيرُ معروفة: $s"; exit 1 ;;
  esac
done
ls -la "$OUT"
