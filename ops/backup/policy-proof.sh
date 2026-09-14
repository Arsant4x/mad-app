#!/bin/sh
# ═══ «يكتب ولا يحذف» مُثبَتاً لا مُدَّعىً — حالتان بـ `restic` نفسِه (ق-٧٣٤ · ق-٧٦٠) ═══
#
# يُشغَّل على المضيف جذراً **بعد** أن يضع صاحبُ المشروع الأسرارَ في `.env.production` —
# **ولا يطبع سرّاً**: يقرأ القيمَ من الملفّ إلى بيئة العملية فقط (بلا `source` — فقيمةٌ فيها
# `(` أو `!` تُسقط الصدفةَ أو تُنفَّذ)، ويمرّرها إلى حاوية `restic` بـ`-e` بلا قيمةٍ في سطر الأمر.
#
#   ⓪ المستودعُ يُهيّأ مرّةً (`init` إن لم يكن) — ويُقرأ وجودُه لا يُفترض (`cat config`).
#   ① الكتابة: `backup` لمجلّدٍ رميٍّ صغير **ينجح** — ويُنشئ قفلاً ويُزيله، فاستثناءُ `locks/*` مُثبَتٌ ضمناً.
#   ② الحذف: `forget` لتلك اللقطة **يُرفض** (`AccessDenied`) — وتبقى مسرودةً بعده.
#
# ⚠️ اللقطةُ الرميّةُ (`--host policy-proof`) تبقى في المستودع — لا يحذفها هذا المفتاح، وهي بايتاتٌ
#    معدودة؛ وتجربةُ الاستعادة تستثنيها (`restore latest --host mad-app`). يحذفها المالك بمفتاحه إن شاء.
#
# الخروج: 0 = الحالتان كما يجب · 1 = الكتابةُ سقطت · 2 = الحذفُ نجح أو اللقطةُ اختفت (السياسةُ لا تمنعه)
#         · 3 = تعذّر السؤال (ملفٌّ ناقص · تهيئةٌ متعذّرة · رفضٌ بسببٍ غير الصلاحية).
# البيئة: `ENV_FILE` (افتراضُه `/opt/mad-app/.env.production`) · `RESTIC_IMAGE` (الوسمُ نفسُه الذي في صورة الخدمة).
set -eu

ENV_FILE="${ENV_FILE:-/opt/mad-app/.env.production}"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.17.3}"
[ -r "$ENV_FILE" ] || { echo "policy-proof: $ENV_FILE غير مقروء — ولا حكمَ بالصمت" >&2; exit 3; }

# قيمةُ مفتاحٍ من ملفّ البيئة: ما بعد أوّل `=`، وتُنزَع علامتا اقتباسٍ محيطتان إن وُجدتا — بلا تفسيرٍ للصدفة.
envval() {
  v=$(sed -n "s/^$1=//p" "$ENV_FILE" | head -1)
  case $v in
    \"*\") v=${v#\"}; v=${v%\"} ;;
    \'*\') v=${v#\'}; v=${v%\'} ;;
  esac
  printf '%s' "$v"
}
RESTIC_REPOSITORY=$(envval RESTIC_REPOSITORY)
RESTIC_PASSWORD=$(envval RESTIC_PASSWORD)
AWS_ACCESS_KEY_ID=$(envval OFFSITE_ACCESS_KEY)
AWS_SECRET_ACCESS_KEY=$(envval OFFSITE_SECRET_KEY)
AWS_DEFAULT_REGION=$(envval OFFSITE_REGION)
for k in RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  eval "val=\$$k"
  [ -n "$val" ] || { echo "policy-proof: المفتاحُ $k فارغٌ في $ENV_FILE" >&2; exit 3; }
done
[ -n "$AWS_DEFAULT_REGION" ] || AWS_DEFAULT_REGION=us-east-1
export RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

# القيمُ تصل الحاويةَ من البيئة — لا تُكتب في سطر الأمر.
r() { docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION "$@"; }

probe=$(mktemp -d)
trap 'rm -rf "$probe"' EXIT

# ⓪ التهيئة مرّةً — وجودُ المستودع يُقرأ لا يُفترض.
if r "$RESTIC_IMAGE" cat config >/dev/null 2>&1; then
  init=existing
else
  r "$RESTIC_IMAGE" init >"$probe/init.out" 2>&1 || { echo "policy-proof: تعذّرت تهيئةُ المستودع" >&2; tail -n 3 "$probe/init.out" >&2; exit 3; }
  init=created
fi

# ① الكتابة تنجح — ومعها إنشاءُ القفل وإزالتُه.
mkdir -p "$probe/data"
echo "policy-proof $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$probe/data/probe.txt"
r -v "$probe/data:/probe:ro" "$RESTIC_IMAGE" backup --tag policy-proof --host policy-proof /probe >"$probe/backup.out" 2>&1 \
  || { echo "policy-proof: ⛔ الكتابةُ سقطت — السياسةُ لا تسمح بالرفع أو القفل" >&2; tail -n 3 "$probe/backup.out" >&2; exit 1; }
snap=$(r "$RESTIC_IMAGE" snapshots --host policy-proof --latest 1 --json 2>/dev/null | sed -n 's/.*"short_id":"\([0-9a-f]*\)".*/\1/p' | head -1)
[ -n "$snap" ] || { echo "policy-proof: اللقطةُ الرميّةُ لم تُسرد بعد الرفع" >&2; exit 3; }

# ② الحذف يُرفض — باسمه لا بصمت — وتبقى اللقطة.
if r "$RESTIC_IMAGE" forget "$snap" >"$probe/forget.out" 2>&1; then
  echo "policy-proof: ⛔ الحذفُ نجح — السياسةُ لا تمنعه (اللقطة $snap حُذفت)" >&2
  exit 2
fi
if ! grep -qi 'AccessDenied\|Forbidden\|403' "$probe/forget.out"; then
  echo "policy-proof: الحذفُ سقط لسببٍ غير الصلاحية — لا حكم" >&2; tail -n 3 "$probe/forget.out" >&2; exit 3
fi
r "$RESTIC_IMAGE" snapshots "$snap" >/dev/null 2>&1 \
  || { echo "policy-proof: ⛔ اللقطةُ $snap اختفت رغم الرفض" >&2; exit 2; }

printf '{"at":"%s","init":"%s","write":"ok","lock":"ok","delete":"denied","probeSnapshot":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$init" "$snap"
echo "policy-proof ok: التهيئة $init · الكتابةُ تنجح (والقفلُ يُزال) · الحذفُ يُرفض باسمه · اللقطةُ الرميّة $snap باقية"
