#!/usr/bin/env bash
# اللغة تُضبط أولاً — §8.7 الوجه السادس. ويحرسه `locale-gate.spec.ts`.
export LC_ALL=C.UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# نشر mad-app — المسار الوحيد المعتمد.
#
# لماذا وُجد هذا الملف
# ────────────────────
# في 2026-08-14 نُفِّذ `docker compose up -d --build` من /opt/mad-app بلا رايات.
# فالتقط Docker ملفَّ التطوير `docker-compose.yml` — وفيه postgres وredis وminio
# وحدها — فأعاد بناءها، **ولم يمسّ api ولا web إطلاقاً**. ثم خرج بالرمز 0.
#
# وصف Docker الحاويتين بـ«يتيمتين» في تحذيرٍ في **أول** سطر من السجل، وابتلعه
# `EXIT=0` في **آخر** سطر. فبدا النشر ناجحاً وهو لم يحدث. الذي فضحه لم يكن رمز
# الخروج بل `Up 47 hours` في `docker compose ps`.
#
# فهذا السكربت يفعل ثلاثة أشياء لا اثنين:
#   ١. يحمل الرايتين دائماً — لا مجال لالتقاط الملف الخطأ.
#   ٢. يرفض المضيّ إن لم تكن api وweb في المشروع أصلاً — وهو **جذر** الحادثة.
#   ٣. يؤكّد بعد البناء أن api وweb أُعيد إنشاؤهما فعلاً — وإلا خرج بخطأ.
#
# ولماذا سكربت لا متغيّر بيئة (COMPOSE_FILE): المتغيّر غير مرئي لمن يفتح
# الطرفية، والسكربت يُقرأ. — قرار المالك 2026-08-14.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
MUST_RECREATE=(api web)

# ── الموضع: السكربت يعمل من جذر المستودع أياً كان مكان استدعائه ──
cd "$(dirname "$(readlink -f "$0")")"

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; DIM=$'\033[2m'; RST=$'\033[0m'
say()  { printf '%s\n' "$*"; }
head_() { printf '\n%s═══ %s ═══%s\n' "$DIM" "$*" "$RST"; }
die()  { printf '\n%s✖ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# دوالُّ حارس إعادة الإنشاء المشروط بسياق البناء (ق-٧١٧) — في ملفٍّ يُختبر وحدَه.
[[ -f ./ops/deploy/recreate-guard.sh ]] || die "لا أجد ops/deploy/recreate-guard.sh — الحارسُ بلا دوالّه."
# shellcheck source=ops/deploy/recreate-guard.sh
source ./ops/deploy/recreate-guard.sh

# مِن داخل حاوية الواجهة — بصمة الحزمة التي يقدّمها nginx فعلاً.
bundle_hash() {
  local cid; cid="$(dc ps -q web 2>/dev/null || true)"
  [[ -n "$cid" ]] || { echo "—"; return 0; }
  docker exec "$cid" sh -c 'ls /usr/share/nginx/html/assets 2>/dev/null | grep -E "^index-.*\.js$"' 2>/dev/null | head -1 || echo "—"
}

mem() { free -m | awk '/^Mem:/{printf "%s مستخدَمة · %s متاحة", $3, $7} /^Swap:/{printf " · تبديل %s\n", $3}'; }

# ═══ ١) فحوص ما قبل الإقلاع ═══════════════════════════════════════════════
head_ "فحص أوّلي"

[[ -f "$COMPOSE_FILE" ]] || die "لا أجد $COMPOSE_FILE في $(pwd) — هل تشغّل السكربت من مكانه الصحيح؟"
[[ -f "$ENV_FILE"     ]] || die "لا أجد $ENV_FILE في $(pwd) — النشر بلا ملف بيئة يبني بمتغيّرات فارغة."
command -v docker >/dev/null || die "docker غير متاح."
docker info >/dev/null 2>&1  || die "خادم docker لا يستجيب."

# 🔴 الفحص الجذري: هل الخدمتان في هذا المشروع أصلاً؟
#    هذا بالضبط ما كان سيوقف حادثة 2026-08-14 قبل أن تبدأ.
services="$(dc config --services 2>/dev/null)" || die "تعذّرت قراءة $COMPOSE_FILE."
for s in "${MUST_RECREATE[@]}"; do
  grep -qx -- "$s" <<<"$services" \
    || die "الخدمة «$s» غير موجودة في $COMPOSE_FILE.
   الخدمات المعرّفة فيه: $(tr '\n' ' ' <<<"$services")
   هذا هو خطأ 2026-08-14 نفسه: البناء سينجح ويخرج بالرمز 0 دون أن يلمس $s."
done
say "${GRN}✔${RST} $COMPOSE_FILE يعرّف: $(tr '\n' ' ' <<<"$services")"

# ═══ ٢) خط الأساس — يُلتقط قبل أي تغيير ══════════════════════════════════
head_ "خط الأساس"

before_commit="$(git rev-parse HEAD)"
before_hash="$(bundle_hash)"
declare -A before_id=() before_img=() img_name=()
for s in "${MUST_RECREATE[@]}"; do
  before_id["$s"]="$(dc ps -q "$s" 2>/dev/null || true)"
  # الصورةُ التي تعمل بها الحاوية الآن، واسمُها (الوسم) — يُقارَن بما يُبنى (ق-٧١٧).
  before_img["$s"]="$(docker inspect -f '{{.Image}}' "${before_id[$s]}" 2>/dev/null || true)"
  img_name["$s"]="$(docker inspect -f '{{.Config.Image}}' "${before_id[$s]}" 2>/dev/null || true)"
done

say "الالتزام:     $(git log -1 --format='%h %s' 2>/dev/null)"
say "هاش الواجهة:  $before_hash"
say "الذاكرة:      $(mem)"

# لحظة انطلاق النشر — مرجع مقارنة StartedAt لاحقاً. UTC لتفادي المناطق الزمنية.
deploy_start="$(date -u +%s)"

# ═══ ٣) السحب ════════════════════════════════════════════════════════════
head_ "السحب"

git pull --ff-only origin main \
  || die "فشل السحب. إمّا أن الشجرة العاملة متّسخة، أو أن التاريخ تفرّع فلا يمكن التقديم السريع.
   افحص: git status && git log --oneline -3"

after_commit="$(git rev-parse HEAD)"
if [[ "$before_commit" == "$after_commit" ]]; then
  code_changed=0
  say "${YLW}⚠${RST} لا التزام جديد — الشيفرة كما هي."
else
  code_changed=1
  say "${GRN}✔${RST} ${before_commit:0:7} ← ${after_commit:0:7}"
  # `|| true`: سرد الالتزامات زينة لا حارس. ونطاق غير صالح (بعد إعادة كتابة
  # تاريخ مثلاً) كان يقتل السكربت هنا برمز 128 و`fatal` من git — أي بلا رسالة
  # الحارس ولا فحص إعادة الإنشاء. كشفه الإثبات العكسي (ب).
  git log --oneline "${before_commit}..${after_commit}" 2>/dev/null | head -10 | sed 's/^/    /' || true
fi
# المساراتُ المتغيّرة بين الالتزامين — يقرؤها حارسُ إعادة الإنشاء (ق-٧١٧). فارغةٌ إن لم يصل التزام.
changed_files="$(git diff --name-only "$before_commit" "$after_commit" 2>/dev/null || true)"

# ═══ ٣ب) مقلبٌ قبل الهجرات — يسبق البناءَ ولا يمرّ إن فشل (ق-٦٨٧) ═══════════════
# الحاويةُ تُطبّق الهجراتِ عند إقلاعها، فالمقلبُ هنا هو الحالُ الذي يُرجَع إليه إن سقطت
# هجرةٌ في المنتصف (مسارُ الرجوع (أ) في DEPLOY.md §6). اسمُه يحمل التزامَ النشر،
# وفشلُه يُوقف النشر قبل أن يُبنى شيء — والفحصُ فحصُ خدمة النسخ نفسُه.
head_ "مقلبٌ قبل الهجرات"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE" bash ./ops/backup/pre-deploy-dump.sh "$after_commit" \
  || die "لا نشرَ بلا مقلبٍ مُثبَت — انظر السطرَ أعلاه."

# ═══ ٤) البناء والتشغيل ══════════════════════════════════════════════════
head_ "البناء والتشغيل"

dc up -d --build

# ═══ ٥) 🔴 الحارس: هل أُعيد إنشاء api وweb فعلاً؟ ═════════════════════════
# يقرأ حالة الحاوية من `docker inspect` مباشرةً — لا من مخرجات `ps` المنسّقة.
# دليل إعادة الإنشاء أحد أمرين: تبدّل معرّف الحاوية، أو StartedAt بعد لحظة
# انطلاق النشر. أيّهما تحقّق كفى.
#
# ⚖️ ومشروطٌ بسياق البناء (ق-٧١٧ — قرار المالك 2026-09-14): حاويةٌ لم تُعَد **ولا ملفَّ من
# مصادر بنائها تغيّر** (أسطرُ COPY في Dockerfile نفسِه + الملفُّ + .dockerignore) **والصورةُ
# نفسُها** — بقاؤها مشروعٌ ويُقال؛ أمّا إن تغيّرت مصادرُها أو بُنيت صورةٌ جديدة ولم تُعَد فذلك
# حادثةُ 2026-08-14 بعينها ويُسقِط. قبل هذا كان الحارسُ غيرَ مشروط، فأنذر كاذباً في نشر
# 2026-09-14 (web بلا تغيير) — «وإنذارٌ كاذبٌ يُقرأ يدوياً مرّةً يُقرأ «معروفاً» بعد ثلاث».
head_ "حارس إعادة الإنشاء"

compose_config="$(dc config 2>/dev/null || true)"
violations=()
for s in "${MUST_RECREATE[@]}"; do
  cid="$(dc ps -q "$s" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    violations+=("«$s»: لا حاوية بعد البناء إطلاقاً.")
    continue
  fi

  running="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)"
  if [[ "$running" != "true" ]]; then
    state="$(docker inspect -f '{{.State.Status}} (خروج {{.State.ExitCode}})' "$cid" 2>/dev/null || echo '?')"
    violations+=("«$s»: الحاوية ليست قيد التشغيل — $state")
    continue
  fi

  started_raw="$(docker inspect -f '{{.State.StartedAt}}' "$cid")"
  started_epoch="$(date -u -d "$started_raw" +%s 2>/dev/null || echo 0)"

  if [[ "$cid" != "${before_id[$s]}" ]]; then
    say "${GRN}✔${RST} «$s»: حاوية جديدة (${before_id[$s]:0:12}${before_id[$s]:+ ← }${cid:0:12})"
  elif (( started_epoch >= deploy_start )); then
    say "${GRN}✔${RST} «$s»: نفس الحاوية لكن أُعيد تشغيلها الآن"
  else
    # نفس الحاوية ولم تُشغَّل الآن — مشروعٌ أم حادثة؟ يُقرأ من سياق البناء لا من الافتراض (ق-٧١٧).
    age=$(( (deploy_start - started_epoch) / 60 ))
    df="$(printf '%s\n' "$compose_config" | service_dockerfile "$s" "$(pwd)")"
    [[ -n "$df" ]] || df="apps/$s/Dockerfile"
    touched="$(printf '%s\n' "$changed_files" | touching_sources "$df" || true)"
    built_img="$(image_tag_id "${img_name[$s]}")"
    if [[ -n "$touched" ]]; then
      violations+=("«$s»: لم تُمَسّ — نفس المعرّف (${cid:0:12}) مع أن مصادرَ بنائها تغيّرت: $(tr '\n' ' ' <<<"$touched")")
    elif [[ -n "$built_img" && -n "${before_img[$s]}" && "$built_img" != "${before_img[$s]}" ]]; then
      violations+=("«$s»: لم تُمَسّ — نفس المعرّف (${cid:0:12}) مع أن صورةً جديدة بُنيت (${before_img[$s]:7:12} ← ${built_img:7:12}).")
    else
      say "${YLW}○${RST} «$s»: لم تُعَد إنشاؤها — ولا ملفَّ من مصادر بنائها ($df · COPY) تغيّر، والصورةُ نفسُها؛ بقاؤها مشروع (تعمل منذ ${age} دقيقة)."
    fi
  fi
done

# كلُّ ما بقي في القائمة حادثةٌ لا حالةٌ مشروعة — فلا يُقال بالأصفر ولا يمرّ، وصل التزامٌ أو لم يصل:
# حاويةٌ غائبة أو واقفة، أو مصادرُ تغيّرت وصورةٌ بُنيت ولم تُعَد الحاوية. (ما كان يُقال بالأصفر —
# «لا التزام جديد فالبقاءُ مشروع» — صار يُقرأ من سياق البناء نفسِه فوق: ○.)
if (( ${#violations[@]} > 0 )); then
  printf '\n%s✖ الحارس أسقط النشر — api/web لم يُعادا إنشاؤهما:%s\n' "$RED" "$RST" >&2
  printf '   %s\n' "${violations[@]}" >&2
  die "النشر (${before_commit:0:7} ← ${after_commit:0:7}) ولم تُعَد الحاويتان.
   الشيفرة الجديدة **ليست منشورة**. لا تُبلغ عن نجاح.
   افحص: dc logs api  ·  dc logs web  ·  docker compose -f $COMPOSE_FILE ps"
fi

# ═══ ٦) الحصيلة ══════════════════════════════════════════════════════════
head_ "الحصيلة"

dc ps --format '{{.Service}}\t{{.Status}}'

after_hash="$(bundle_hash)"
say ""
say "الالتزام:  $(git log -1 --format='%h %s')"
say "الذاكرة:   $(mem)"
say "الترحيلات: تُطبَّق آلياً عند إقلاع api (prisma migrate deploy)"

if [[ "$after_hash" != "$before_hash" ]]; then
  printf '\n%s⚠ هاش الواجهة تغيّر: %s ← %s%s\n' "$YLW" "$before_hash" "$after_hash" "$RST"
  printf '%s  اضغط Ctrl+Shift+R في المتصفح، وإلا قُدِّمت لك الحزمة القديمة.%s\n' "$YLW" "$RST"
else
  say "هاش الواجهة: $after_hash (بلا تغيير)"
fi

printf '\n%s✔ اكتمل النشر.%s\n' "$GRN" "$RST"
