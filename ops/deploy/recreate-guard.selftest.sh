#!/usr/bin/env bash
# ops/deploy/recreate-guard.selftest.sh — يُشغّل **كتلةَ الحارس كما هي في deploy.sh** (تُقتطع بين علامتَيها)
# على docker مزيَّف، في ثلاث حالاتٍ معلومة الجواب (ق-٧١٧). يستدعيه apps/api/src/common/deploy-recreate-guard.spec.ts.
#
# لماذا اقتطاعٌ لا نسخ: نسخةٌ من المنطق في الاختبار تفترق عن deploy.sh يوماً — والمقتطَعُ هو المنشور نفسُه.
# الحالات:
#   ① مصادرُ web لم تتغيّر والصورةُ نفسُها والحاويةُ لم تُعَد ⇒ ○ مشروع — ولا إسقاط
#   ② مصادرُ web تغيّرت (apps/web/src/x.ts) والحاويةُ لم تُعَد ⇒ إسقاط يسمّي الملفّ
#   ③ بُنيت صورةٌ جديدة لـweb والحاويةُ لم تُعَد ⇒ إسقاط يسمّي الصورة
# الاستعمال: recreate-guard.selftest.sh <case:1|2|3>  — يطبع المخرَج ويعود بخروج الكتلة (die ⇒ 1).
set -uo pipefail
CASE="${1:?case}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# ── الكتلةُ المقتطَعة من deploy.sh — من عنوان الحارس إلى ما قبل الحصيلة ──
block="$(awk '/^head_ "حارس إعادة الإنشاء"/{f=1} /^# ═══ ٦\)/{f=0} f' deploy.sh)"
[[ -n "$block" ]] || { echo "selftest: لم أجد كتلةَ الحارس في deploy.sh"; exit 2; }

# ── بيئةُ deploy.sh المطلوبة للكتلة ──
RED=''; GRN=''; YLW=''; DIM=''; RST=''
say()  { printf '%s\n' "$*"; }
head_() { printf '═══ %s ═══\n' "$*"; }
die()  { printf '✖ %s\n' "$*" >&2; exit 1; }
COMPOSE_FILE="docker-compose.prod.yml"
MUST_RECREATE=(api web)
source ./ops/deploy/recreate-guard.sh

before_commit="aaaaaaa0000000000000000000000000000000000"
after_commit="bbbbbbb0000000000000000000000000000000000"
code_changed=1
deploy_start=1000000
declare -A before_id=([api]="apiold000000" [web]="webold000000")
declare -A before_img=([api]="sha256:api0000000000000" [web]="sha256:web0000000000000")
declare -A img_name=([api]="mad-app-api" [web]="mad-app-web")

# api أُعيدت دائماً (معرّفٌ جديد)؛ web بقيت بالمعرّف نفسِه وبدأت قبل النشر
WEB_BUILT_IMG="sha256:web0000000000000"
case "$CASE" in
  1) changed_files=$'docs/decisions.md\napps/api/src/x.ts' ;;
  2) changed_files=$'docs/decisions.md\napps/web/src/x.ts' ;;
  3) changed_files=$'docs/decisions.md'; WEB_BUILT_IMG="sha256:web1111111111111" ;;
  *) echo "case?"; exit 2 ;;
esac

dc() {  # مزيَّف: ps -q <service> · config
  case "$1 $2" in
    "ps -q") case "$3" in api) echo "apinew000000";; web) echo "webold000000";; esac ;;
    "config ") printf 'services:\n  api:\n    build:\n      context: %s\n      dockerfile: apps/api/Dockerfile\n  web:\n    build:\n      context: %s\n      dockerfile: apps/web/Dockerfile\n' "$ROOT" "$ROOT" ;;
    *) printf 'services:\n  api:\n    build:\n      context: %s\n      dockerfile: apps/api/Dockerfile\n  web:\n    build:\n      context: %s\n      dockerfile: apps/web/Dockerfile\n' "$ROOT" "$ROOT" ;;
  esac
}
docker() {  # مزيَّف: inspect -f <fmt> <id> · image inspect -f <fmt> <name>
  if [[ "$1" == "inspect" ]]; then
    case "$3" in
      '{{.State.Running}}') echo true ;;
      '{{.State.StartedAt}}') echo "1970-01-11T00:00:00Z" ;;   # epoch 864000 < deploy_start 1000000 ⇒ لم تُشغَّل الآن
      *) echo "" ;;
    esac
  elif [[ "$1 $2" == "image inspect" ]]; then
    case "$5" in mad-app-web) echo "$WEB_BUILT_IMG";; mad-app-api) echo "sha256:api1111111111111";; esac
  fi
}

eval "$block"
echo "selftest: الكتلةُ مرّت بلا إسقاط"
