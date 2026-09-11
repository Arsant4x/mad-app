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

hex_sha256() { openssl dgst -sha256 | sed 's/^.*= *//'; }
hmac_hex() { openssl dgst -sha256 -mac HMAC -macopt "hexkey:$1" | sed 's/^.*= *//'; }
hmac_key() { openssl dgst -sha256 -mac HMAC -macopt "key:$1" | sed 's/^.*= *//'; }

amzdate=$(date -u +%Y%m%dT%H%M%SZ)
datestamp=$(date -u +%Y%m%d)
empty_hash=$(printf '' | hex_sha256)

# ترميزُ البادئة للاستعلام: `/` تصير `%2F` — والترتيبُ المعجميُّ للمعاملات مشروطٌ في التوقيع.
enc_prefix=$(printf '%s' "$PREFIX" | sed 's:/:%2F:g')
query="list-type=2&max-keys=1000&prefix=$enc_prefix"
canonical_uri="/$bucket"
canonical_headers="host:$host
x-amz-content-sha256:$empty_hash
x-amz-date:$amzdate
"
signed_headers='host;x-amz-content-sha256;x-amz-date'
canonical_request="GET
$canonical_uri
$query
$canonical_headers
$signed_headers
$empty_hash"
scope="$datestamp/$REGION/s3/aws4_request"
string_to_sign="AWS4-HMAC-SHA256
$amzdate
$scope
$(printf '%s' "$canonical_request" | hex_sha256)"

k=$(printf '%s' "$datestamp" | hmac_key "AWS4$AWS_SECRET_ACCESS_KEY")
k=$(printf '%s' "$REGION" | hmac_hex "$k")
k=$(printf '%s' 's3' | hmac_hex "$k")
k=$(printf '%s' 'aws4_request' | hmac_hex "$k")
signature=$(printf '%s' "$string_to_sign" | hmac_hex "$k")

body=$(curl -sS -f --max-time 30 \
  -H "Host: $host" \
  -H "x-amz-content-sha256: $empty_hash" \
  -H "x-amz-date: $amzdate" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=$AWS_ACCESS_KEY_ID/$scope, SignedHeaders=$signed_headers, Signature=$signature" \
  "$scheme://$host$canonical_uri?$query" 2>/dev/null) || {
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
