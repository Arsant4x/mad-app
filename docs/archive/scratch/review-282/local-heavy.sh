#!/usr/bin/env bash
# قياسُ وظيفة `db-integration` على الجهاز، داخل لينكس نظيف، بخطوات `web-tests.yml` نفسِها.
#   bash local-heavy.sh <git-ref> <logdir>
# · كلُّ تشغيلٍ يبدأ من الصفر: حاويةُ تشغيلٍ جديدة، وPostgres جديد، وMinIO جديد، بلا مجلّدٍ مشترك مع ويندوز.
# · الشيفرةُ تدخل من `git archive` (الملفّاتُ المتتبَّعة وحدَها، فلا `.env` ولا `node_modules` من الجهاز).
# · الثلاثةُ تتشارك شبكةً واحدة (`--network container:`) فيبقى `localhost:5432` و`localhost:9100` كما في السير.
# · وكلُّ شيءٍ يُمحى في آخره ولو سقط (`trap`).
# ⚠️ الصورة `node:22-bookworm-slim` (أساسُ صورة الإنتاج)، لا `ubuntu-24.04` صورةُ GitHub: الفرقُ مُعلَن.
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8
# Git Bash يحوّل `/w` في وسائط docker إلى مسار ويندوز («Cwd must be an absolute path»، التشغيل الأوّل).
export MSYS_NO_PATHCONV=1
REF="${1:?git ref}"
LOG="${2:?log dir}"
case "$LOG" in /d/mad-app-scratch/review-282/*) : ;; *) echo "✖ مجلّدُ السجلّ خارج review-282: $LOG"; exit 1 ;; esac
mkdir -p "$LOG"
ID="lh-$(date +%s)"
R="$ID-run"; PG="$ID-pg"; MIN="$ID-minio"
cleanup() {
  docker rm -f "$MIN" "$PG" "$R" >/dev/null 2>&1 || true
  echo "تُمحى: $R $PG $MIN · الباقي باسمها: $(docker ps -a --filter "name=$ID" -q | wc -l)" | tee -a "$LOG/steps.txt"
}
trap cleanup EXIT
t0=$(date +%s)
step() { local name="$1"; shift; local s=$(date +%s); echo "▶ $name" | tee -a "$LOG/steps.txt"; "$@"; local rc=$?; echo "  $name: $(( $(date +%s) - s ))s rc=$rc" | tee -a "$LOG/steps.txt"; return $rc; }
ex() { docker exec -w /w/apps/api "${ENVS[@]}" "$R" bash -c "$1"; }

ENVS=(-e LC_ALL=C.UTF-8 -e LANG=C.UTF-8 -e CI=true
  -e PGPASSWORD=ci_only_not_a_secret
  -e DATABASE_URL='postgresql://app_user:ci_app_pass@localhost:5432/mad_app?schema=public'
  -e DEV_SEED_PLATFORM_ADMIN_USERNAME=Arsan_admin -e DEV_SEED_PLATFORM_ADMIN_PASSWORD='CiAdminPass123!'
  -e JWT_ACCESS_SECRET=test-jwt-secret-not-used-outside-tests-0123456789 -e JWT_ACCESS_TTL=15m -e JWT_REFRESH_TTL=30d
  -e WEB_ORIGIN=http://localhost:5173
  -e SECRETS_ENCRYPTION_KEY=test-secrets-key-at-least-32-characters-long
  -e PII_ENCRYPTION_KEYS='test1:ERERERERERERERERERERERERERERERERERERERERERE=' -e PII_ENCRYPTION_KEY_ID=test1
  -e PII_BLIND_INDEX_KEY='tb1:IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI='
  -e S3_ENDPOINT=http://localhost:9100 -e S3_ACCESS_KEY=mad_app -e S3_SECRET_KEY=mad_app_dev_password -e S3_BUCKET=mad-app-files)

# ⚠️ حجمُ خادم `ubuntu-latest` للمستودع الخاصّ لم يُقرأ من مصدر في هذه الجلسة (القاعدة ١٢: يُوسم ويُعدّ).
# فيُقيَّد افتراضياً بمعالجَين و7 GB، ويُقاس أيضاً بلا قيدٍ (CPUS=22 MEM=14g) ليُعرف أثرُ الجهاز.
step "حاويةُ التشغيل" docker run -d --name "$R" --cpus "${CPUS:-2}" --memory "${MEM:-7g}" node:22-bookworm-slim sleep infinity
step "Postgres" docker run -d --name "$PG" --network "container:$R" \
  -e POSTGRES_USER=mad_app -e POSTGRES_PASSWORD=ci_only_not_a_secret -e POSTGRES_DB=mad_app postgres:16-alpine
step "MinIO" docker run -d --name "$MIN" --network "container:$R" \
  -e MINIO_ROOT_USER=mad_app -e MINIO_ROOT_PASSWORD=mad_app_dev_password \
  ghcr.io/arsant4x/minio@sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2 server /data --address :9100
step "أدواتُ النظام (openssl كما في صورة GitHub)" docker exec "$R" bash -c 'apt-get update -qq && apt-get install -y -qq openssl ca-certificates >/dev/null'
step "الشيفرة من git archive $REF" bash -c "git -C D:/mad-app archive --format=tar '$REF' | docker exec -i '$R' bash -c 'mkdir -p /w && tar -x -C /w'"
step "npm ci (بلا مخبأ)" docker exec -w /w "$R" bash -c 'npm ci --ignore-scripts --no-audit --no-fund >/dev/null'
step "انتظارُ Postgres" bash -c "for i in \$(seq 1 60); do docker exec '$PG' pg_isready -U mad_app -d mad_app >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"
step "انتظارُ MinIO" docker exec "$R" node -e "(async()=>{for(let i=0;i<30;i++){try{if((await fetch('http://localhost:9100/minio/health/live')).ok)process.exit(0)}catch{};await new Promise(r=>setTimeout(r,1000))}process.exit(1)})()"
step "دور app_user" docker exec -i "$PG" psql -U mad_app -d mad_app -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE app_user WITH LOGIN PASSWORD 'ci_app_pass' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT ALL PRIVILEGES ON DATABASE mad_app TO app_user;
ALTER SCHEMA public OWNER TO app_user;
SQL
step "prisma generate + migrate deploy" ex 'npx prisma generate >/dev/null && npx prisma migrate deploy | tail -3'
step "البذرة" ex 'npx prisma db seed 2>&1 | tail -3'
set +e
step "المجسّاتُ الحيّة" ex "set -o pipefail; npx jest --roots '<rootDir>/src' --testPathPattern 'live\\.spec' --testPathIgnorePatterns 'period-lock-tz' 2>&1 | tee /tmp/live.log | tail -6" > "$LOG/live.log" 2>&1; LIVE=$?
step "قفلُ الفترة (America/New_York)" ex "set -o pipefail; TZ=America/New_York npx jest src/fiscal/period-lock-tz.live.spec.ts 2>&1 | tail -6" > "$LOG/period-tz.log" 2>&1; TZRC=$?
step "التكامل e2e مشرَّحاً" ex 'set -o pipefail; npm run test:e2e 2>&1' > "$LOG/e2e.log" 2>&1; E2E=$?
step "صدقُ الردود" ex 'set -o pipefail; npm run response:truth 2>&1 | tail -8' > "$LOG/response-truth.log" 2>&1; RT=$?
set -e
echo "الحكم: live=$LIVE tz=$TZRC e2e=$E2E response_truth=$RT · الكلّ $(( $(date +%s) - t0 ))s" | tee -a "$LOG/steps.txt"
