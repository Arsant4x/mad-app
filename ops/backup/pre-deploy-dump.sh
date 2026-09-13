#!/usr/bin/env bash
# اللغة تُضبط أولاً — §8.7 الوجه السادس. ويحرسه `locale-gate.spec.ts`.
export LC_ALL=C.UTF-8
# ═══ مقلبٌ قبل الهجرات — يسبق البناءَ ولا يمرّ إن فشل (ق-٦٨٧) ═════════════════════
#
# لماذا: ما يُفعل بيدٍ يُنسى مرّةً — ومرّةٌ واحدة بعد أن توجد بياناتٌ حقيقية تكفي.
# الحاويةُ تُطبّق الهجراتِ عند كلّ إقلاع (`Dockerfile`: `migrate deploy && node …`)،
# فالمقلبُ الذي يسبق إعادةَ الإنشاء هو **الحالُ الذي يُرجَع إليه** إن سقطت هجرةٌ في المنتصف.
#
# الشرطان (قرار المالك 2026-09-13):
#   ① الاسمُ يحمل التزامَ النشر: `pre-deploy-<sha7>-<UTC>.dump` — فيُعرف أيُّ مقلبٍ يسبق أيَّ شيفرة.
#   ② الفشلُ يُوقف النشر: تعذّرُ `pg_dump`، أو مقلبٌ دون حدّ الجداول أو الحجم ⇒ خروجٌ غيرُ صفريّ
#      **قبل** أن يبني `deploy.sh` شيئاً — لا إعلانٌ يمرّ.
#
# الفحصُ فحصُ خدمة النسخ نفسُه (`docker-compose.prod.yml`): عددُ الجداول من `pg_restore -l`
# والحجمُ — لا وجودُ الملف؛ فمقلبٌ فارغ أسوأ من غياب مقلب لأنه يُطمئن كذباً.
#
# الاستعمال (من `deploy.sh`): COMPOSE="docker compose -f … --env-file …" pre-deploy-dump.sh <sha7>
#   المتغيّرات: BACKUP_DIR (افتراضياً ./backups) · PG_SERVICE (postgres) · MIN_TABLES (50) · MIN_BYTES (51200)
#   وPOSTGRES_USER/POSTGRES_DB تُقرأ من بيئة حاوية القاعدة نفسِها — لا من صدفة المستدعي.
set -euo pipefail

sha="${1:?الاستعمال: pre-deploy-dump.sh <التزامُ النشر>}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_SERVICE="${PG_SERVICE:-postgres}"
MIN_TABLES="${MIN_TABLES:-50}"
MIN_BYTES="${MIN_BYTES:-51200}"

die() { printf '\n✖ pre-deploy-dump: %s\n' "$*" >&2; exit 1; }

cid="$($COMPOSE ps -q "$PG_SERVICE" 2>/dev/null || true)"
[[ -n "$cid" ]] || die "لا حاويةَ قاعدةٍ عاملة (${PG_SERVICE}) — لا نشرَ بلا مقلب."

# الدورُ واسمُ القاعدة من بيئة الحاوية — المصدرُ نفسُه الذي تعمل به القاعدة.
pg_user="$(docker exec "$cid" sh -c 'printf %s "$POSTGRES_USER"')"
pg_db="$(docker exec "$cid" sh -c 'printf %s "$POSTGRES_DB"')"
[[ -n "$pg_user" && -n "$pg_db" ]] || die "POSTGRES_USER/POSTGRES_DB غيرُ مضبوطين في حاوية القاعدة."

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="pre-deploy-${sha:0:7}-${stamp}.dump"
tmp="$BACKUP_DIR/$name.tmp"
final="$BACKUP_DIR/$name"

# `-F c` كخدمة النسخ: يُستعاد بـ`pg_restore`، ويُفحص بـ`pg_restore -l` بلا استعادة.
if ! docker exec "$cid" pg_dump -U "$pg_user" -d "$pg_db" -F c > "$tmp"; then
  rm -f "$tmp"
  die "فشل pg_dump — النشرُ يقف."
fi

tables="$(docker exec -i "$cid" pg_restore -l < "$tmp" 2>/dev/null | grep -c 'TABLE ' || true)"
bytes="$(wc -c < "$tmp" | tr -d ' ')"
if [[ "$tables" -lt "$MIN_TABLES" || "$bytes" -lt "$MIN_BYTES" ]]; then
  rm -f "$tmp"
  die "المقلبُ مرفوض: ${tables} جدولاً و${bytes} بايت — دون الحدّ (${MIN_TABLES}/${MIN_BYTES}). النشرُ يقف."
fi

mv "$tmp" "$final"
printf '✔ مقلبٌ قبل الهجرات: %s (%s جدولاً · %s بايت)\n' "$final" "$tables" "$bytes"
