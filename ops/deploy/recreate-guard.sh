#!/usr/bin/env bash
# ops/deploy/recreate-guard.sh — دوالُّ حارس إعادة الإنشاء المشروط بسياق البناء (ق-٧١٧).
# تُستدعى بـ`source` من deploy.sh، وتُختبر وحدَها في apps/api/src/common/deploy-recreate-guard.spec.ts.
#
# لماذا يُشرَط الحارس (قرار المالك — التوجيه ١٥٦): في نشر 2026-09-14 (`31874f4 → edfc31c`) خرج
# deploy.sh بـ1 لأن `web` لم تُعَد إنشاؤها — ولا ملفَّ من مصادر بنائها تغيّر، فبُنيت الصورةُ نفسُها
# ولم يُعِد compose الحاوية. «فإنذارٌ كاذبٌ يُقرأ يدوياً مرّةً يُقرأ «معروفاً» بعد ثلاث — وقد قِسنا
# ذلك في جدار الأدراج شهراً».
#
# الشرطُ يُقرأ من المصدر لا من قائمةٍ ثانية: مصادرُ بناء الخدمة هي أسطرُ `COPY` في Dockerfile نفسِه
# (بلا `--from=`: ما يُنسخ من مرحلةٍ سابقة ليس مصدراً من الشجرة) + الملفُّ نفسُه + `.dockerignore`.
# فقائمةٌ تُكتب هنا تفترق عن Dockerfile يوماً؛ وقراءتُها منه لا تفترق.

# مصادرُ البناء: كلُّ وسيطٍ في سطر COPY عدا الأخير (الوجهة) وعدا الرايات (`--chown=…`).
build_sources() {  # $1 = مسار Dockerfile
  awk '/^COPY[[:space:]]/ && $0 !~ /--from=/ { for (i = 2; i < NF; i++) if ($i !~ /^--/) print $i }' "$1"
}

# هل تمسّ المساراتُ المتغيّرة (سطرٌ لكلّ مسارٍ من stdin) مصادرَ بناء الخدمة؟
# يطبع المساراتِ الماسّة سطراً سطراً، ويعود بـ0 إن وُجد شيءٌ و1 إن لم يوجد.
touching_sources() {  # $1 = مسار Dockerfile ; stdin = المسارات المتغيّرة (git diff --name-only)
  local df="$1" line src hit=1
  local -a sources
  mapfile -t sources < <(build_sources "$df"; printf '%s\n' "$df" .dockerignore)
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    for src in "${sources[@]}"; do
      src="${src%/}"
      if [[ "$line" == "$src" || "$line" == "$src/"* ]]; then
        printf '%s\n' "$line"
        hit=0
        break
      fi
    done
  done
  return $hit
}

# معرّفُ الصورة التي يحملها اسمٌ (وسمٌ) الآن — فارغٌ إن لم توجد. يُقارَن بالصورة التي تعمل بها الحاوية.
image_tag_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }

# ملفُّ Dockerfile الخدمة كما يراه compose بعد التطبيع (`docker compose config`) — لا من عُرفِ المسار.
# $1 = اسم الخدمة ; stdin = مخرجُ `docker compose config`. يطبع المسار (نسبياً إلى جذر المستودع إن أمكن).
service_dockerfile() {
  awk -v svc="$1" -v root="${2:-}" '
    /^services:/ { insvc = 1; next }
    insvc && /^[^ ]/ { insvc = 0 }
    insvc && /^  [A-Za-z0-9_.-]+:/ { cur = $1; sub(/:$/, "", cur) }
    insvc && cur == svc && /^      dockerfile:/ {
      df = $2
      if (root != "" && index(df, root "/") == 1) df = substr(df, length(root) + 2)
      print df; exit
    }'
}
