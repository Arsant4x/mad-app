# صورةُ وظيفة النسخ خارج المضيف: أدواتُ القاعدة + `restic` في صورةٍ واحدة.
#
# ⚠️ **وقاعدةُ الأساس هي `postgres` لا `restic`** عمداً: نسخةُ `pg_dump`/`pg_restore`
#    **يجب أن تطابق نسخةَ الخادم** (مقلبُ ١٦ لا يُقرأ بأدوات ١٥)، أما `restic` فملفٌّ
#    تنفيذيٌّ واحدٌ ساكن يُنسخ كما هو.
#
# 🔒 والإصداران مثبَّتان: `postgres:16-alpine` كالخادم، و`restic` بوسمٍ صريح.
FROM restic/restic:0.17.3 AS restic

FROM postgres:16-alpine
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
# `coreutils` لأجل `date -d` في فحص الطزاجة — وصيغةُ `busybox` منه لا تقرأ ISO-8601.
RUN apk add --no-cache coreutils ca-certificates
COPY offsite-backup.sh check-freshness.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/offsite-backup.sh /usr/local/bin/check-freshness.sh
ENTRYPOINT ["/bin/sh"]
