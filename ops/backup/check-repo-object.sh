#!/bin/sh
# ═══ «أوقعت نسخةُ الأمس؟» — بلا تسليم المفتاح (ق-٥٨٠) ═══
#
# ⭐ **الفرقُ جوهريّ**: «أوقعت؟» **سؤالٌ عن وجود**، و«ماذا فيها؟» **سؤالٌ عن محتوى**.
#    والأوّلُ يكفي للإنذار **ولا يحتاج مفتاحاً** — فيُسأل الدلوُ نفسُه: متى كُتب
#    أحدثُ كائنٍ تحت `snapshots/`؟ **باعتمادِ قراءةٍ فقط**.
#
# ⇒ **ولماذا لا يُستعمل `check-freshness.sh` في الجدولة**: ذاك يسرد لقطاتِ `restic`
#    فيلزمه **كلمةُ المستودع** — **ووضعُها عند طرفٍ ثالثٍ يوسّع دائرةَ من يملك فكَّ
#    النسخة**. فهذا للجدولة الدورية، وذاك لفحصٍ يدويٍّ بيد من يملك الكلمة أصلاً.
#
# ⚠️ **وحدُّه يُعلَن ولا يُخفى**: يُخبر أن اللقطة **وُجدت**، **ولا يُخبر أنها سليمة**
#    ولا أنها تُفكّ — **وسلامتُها تُثبتها التجربةُ الشهرية وحدها** (`ق-٥٧٦`).
#
# ⚠️ **ولا يقرأ المحتوى**: يسرد البيانات الوصفية فقط (اسمُ الكائن وزمنُ كتابته)،
#    فاعتمادُ القراءة المستعمَل هنا **لا يفتح النسخة** ولو سُرّب.
#
# البيئة: `RESTIC_REPOSITORY` (يُشتقّ منه العنوانُ والدلو) · `AWS_ACCESS_KEY_ID` ·
#         `AWS_SECRET_ACCESS_KEY` · `AWS_REGION` (افتراضُه `us-east-1`) · `MAX_AGE_HOURS`.
# الخروج: 0 = كائنٌ حديث · 1 = لا كائنَ أو متقادم · 2 = تعذّر السؤال (ولا حكمَ بالصمت).
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY غير مضبوط}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID غير مضبوط — اعتمادُ قراءةٍ فقط}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY غير مضبوط}"
REGION="${AWS_REGION:-us-east-1}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
PREFIX="${SNAPSHOT_PREFIX:-snapshots/}"

# العنوانُ والدلو من `RESTIC_REPOSITORY` نفسِه — **مصدرُ حقيقةٍ واحد**، فلا يفترق
# ما يُفحص عمّا يُكتب. الصيغة: `s3:<scheme>://<host>[:port]/<bucket>[/path]`.
repo=${RESTIC_REPOSITORY#s3:}
case "$repo" in
  http://*|https://*) ;;
  *) repo="https://$repo" ;;
esac
scheme=${repo%%://*}
rest=${repo#*://}
host=${rest%%/*}
bucket_path=${rest#*/}
bucket=${bucket_path%%/*}
[ -n "$bucket" ] && [ "$bucket" != "$rest" ] || { echo "⛔ تعذّر استخراجُ الدلو من RESTIC_REPOSITORY" >&2; exit 2; }
# مستودعٌ داخل مجلّدٍ في الدلو: البادئةُ تتبعه.
sub=${bucket_path#"$bucket"}
sub=${sub#/}
[ -n "$sub" ] && PREFIX="$sub/$PREFIX" || true

# ترميزُ البادئة للاستعلام: `/` تصير `%2F`.
enc_prefix=$(printf '%s' "$PREFIX" | sed 's:/:%2F:g')
query="list-type=2&max-keys=1000&prefix=$enc_prefix"

# ⛔ **السرُّ لا يمرّ في سطر أمر** (`ق-١٤٧٥` · التوجيه ٢٦٦ §٧ب): سطرُ الأمر يُقرأ من قائمة العمليات
#    (`/proc/<pid>/cmdline`)، وكان التوقيعُ يُحسب بـ`openssl -macopt key:` — و`openssl` لا يأخذ مفتاحَ
#    `HMAC` إلا من سطر الأمر (مقيس: `openssl dgst -help` لا يعرف غير `-hmac` و`-macopt`). فصار التوقيعُ
#    لـ`curl --aws-sigv4` نفسِه، والاعتمادُ يصله **من مدخله القياسيّ** (`-K -`)؛ و`printf` مدمجةٌ في الصدفة
#    فلا عمليةَ تحمله في سطرها.
case "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" in
  *[\"\\]*) echo "⛔ اعتمادٌ بحرفٍ لا يُكتب في ملفّ خيارات curl (\" أو \\) — ولا حكمَ بالصمت." >&2; exit 2 ;;
esac
body=$(printf 'user = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" \
  | curl -sS -f --max-time 30 -K - --aws-sigv4 "aws:amz:$REGION:s3" \
      "$scheme://$host/$bucket?$query" 2>/dev/null) || {
    echo "⛔ تعذّر سؤالُ الدلو ($host/$bucket) — ولا حكمَ بالصمت." >&2
    exit 2
  }

newest=$(printf '%s' "$body" | grep -o '<LastModified>[^<]*' | sed 's/<LastModified>//' | sort | tail -1)
if [ -z "$newest" ]; then
  echo "⛔ لا كائنَ واحدٍ تحت $PREFIX في $bucket — النسخةُ لم تقع قطّ، أو الدلوُ ليس هذا." >&2
  exit 1
fi

ts=$(date -u -d "$newest" +%s 2>/dev/null || true)
[ -n "$ts" ] || { echo "⛔ تعذّر تحويلُ زمن الكائن ($newest)." >&2; exit 2; }
age_h=$(( ($(date -u +%s) - ts) / 3600 ))

if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
  echo "🔴 أحدثُ لقطةٍ في الدلو كُتبت قبل $age_h ساعة (الحدّ $MAX_AGE_HOURS) — في $newest. نسخةُ الأمس لم تقع." >&2
  exit 1
fi
echo "🟢 أحدثُ لقطةٍ في الدلو كُتبت قبل $age_h ساعة — في $newest. (وجودٌ لا سلامة: السلامةُ بالتجربة الشهرية.)"
