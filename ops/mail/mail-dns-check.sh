#!/usr/bin/env bash
# ops/mail/mail-dns-check.sh — سجلّاتُ مصادقة البريد على نطاق المنصّة قبل أن يُقبل SMTP_HOST (ق-١٣٣٣ · ⑬A1).
# تُستدعى بـ`source` من deploy.sh، وتُختبر وحدَها في apps/api/src/common/mail-dns-check.spec.ts بـ`dig` مزيَّف.
#
# لماذا (البابُ ⑬ · البندُ A1 من العمود الأوّل «لا يُعكَس»): **أوّلُ دفعةِ بريدٍ من نطاقٍ بلا مصادقة تُصنّف
# النطاقَ مرسِلَ رسائلَ مزعجة لدى المستقبِلين — وسمعةُ النطاق لا تُستردّ بسطر**. والضابطُ الوطنيّ يوجبها علينا:
# ECC-2:2024 «2-4-3-5 Validation of the entity's email service domains by using SPF, DKIM, and DMARC».
#
# ⚠️ **ولا يُفحص شيءٌ حين لا بريد**: بلا SMTP_HOST تعود الدالّة بـ0 وتقول ذلك — فالحارسُ على تفعيل البريد لا
#    على كلِّ نشر. **وحين يُضبط SMTP_HOST فالثلاثةُ شرطٌ لا تنبيه**: غيابُ أحدها يُسقط النشرَ قبل أيِّ تغيير.
#
# ⚠️ **ويُقرأ السجلُّ من DNS العامّ لا من ملفّ**: ما يراه المستقبِلُ هو ما يُفحص. والفحصُ `dig` — فإن غاب
#    فالنشرُ يُرفض ويسمّي الحزمة (dnsutils)، لا يمضي كأن الفحصَ وقع (`§8.8`: أداةٌ غائبةٌ ليست فحصاً ناجحاً).

# قيمةُ متغيّرٍ من ملفّ البيئة — السطرُ الأخير يغلب، وتُنزع علاماتُ الاقتباس المحيطة.
env_value() {  # $1 = ملفّ البيئة ; $2 = اسم المتغيّر
  local v
  # `|| true`: غيابُ السطر ليس عطلاً — ولولاه لأسقط `pipefail` و`set -e` في deploy.sh السكربتَ عند أوّل غياب.
  v="$(grep -E "^[[:space:]]*$2=" "$1" 2>/dev/null | tail -n 1 | sed -E "s/^[[:space:]]*$2=//; s/^['\"]//; s/['\"][[:space:]]*\$//" || true)"
  printf '%s' "$v"
}

# النطاقُ من عنوان المرسِل — «اسمٌ <no-reply@rikzapp.com>» أو «no-reply@rikzapp.com».
sender_domain() {  # $1 = SMTP_FROM
  local addr="$1"
  addr="${addr##*<}"
  addr="${addr%%>*}"
  [[ "$addr" == *@* ]] || return 1
  printf '%s' "${addr##*@}" | tr '[:upper:]' '[:lower:]'
}

# الفحصُ نفسُه — يطبع سطراً لكلِّ سجلٍّ، ويعود بـ0 إن حضرت الثلاثةُ (أو لا بريد) و1 إن غاب أحدُها.
mail_dns_check() {  # $1 = ملفّ البيئة
  local env_file="$1" host from selector domain fail=0 spf dkim dmarc
  host="$(env_value "$env_file" SMTP_HOST)"
  if [[ -z "$host" ]]; then
    printf '○ لا SMTP_HOST — لا بريدَ يُرسَل، فلا سجلّاتَ تُفحص.\n'
    return 0
  fi
  # الأداةُ تُسمّى بمتغيّرٍ (افتراضُه `dig`) — لأداةٍ في مسارٍ غير قياسيّ، وليُثبَت فرعُ الغياب في الاختبار.
  local dig_bin="${MAIL_DNS_DIG:-dig}"
  command -v "$dig_bin" >/dev/null 2>&1 || { printf '✖ dig غير مثبَّت — لا فحصَ بلا أداته (ثبّت dnsutils). والنشرُ يُرفض لا يمضي كأن الفحصَ وقع.\n'; return 1; }

  from="$(env_value "$env_file" SMTP_FROM)"
  domain="$(sender_domain "$from")" || { printf '✖ SMTP_FROM بلا عنوانٍ صحيح («%s») — لا نطاقَ يُفحص.\n' "$from"; return 1; }
  selector="$(env_value "$env_file" MAIL_DKIM_SELECTOR)"

  # ① SPF على النطاق نفسِه.
  # وكلُّ قراءةٍ تتسامح مع الغياب (`|| true`) — فالدالّةُ تُبلّغ عن الثلاثة كلِّها لا عن أوّل غائب.
  spf="$("$dig_bin" +short TXT "$domain" 2>/dev/null | tr -d '"' | grep -i 'v=spf1' | head -n 1 || true)"
  if [[ -n "$spf" ]]; then printf '✔ SPF   %s: %s\n' "$domain" "$spf"; else printf '✖ SPF   %s: لا سجلَّ «v=spf1»\n' "$domain"; fail=1; fi

  # ② DKIM — سجلُّ CNAME على «المنتقي._domainkey.النطاق» كما يولّده الكونسول.
  if [[ -z "$selector" ]]; then
    printf '✖ DKIM  MAIL_DKIM_SELECTOR غير مضبوط — المنتقي كما يعرضه الكونسول بعد «Generate DKIM Record».\n'
    fail=1
  else
    dkim="$("$dig_bin" +short CNAME "$selector._domainkey.$domain" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$dkim" ]]; then printf '✔ DKIM  %s._domainkey.%s → %s\n' "$selector" "$domain" "$dkim"; else printf '✖ DKIM  %s._domainkey.%s: لا سجلَّ CNAME\n' "$selector" "$domain"; fail=1; fi
  fi

  # ③ DMARC على «_dmarc.النطاق».
  dmarc="$("$dig_bin" +short TXT "_dmarc.$domain" 2>/dev/null | tr -d '"' | grep -i 'v=DMARC1' | head -n 1 || true)"
  if [[ -n "$dmarc" ]]; then printf '✔ DMARC _dmarc.%s: %s\n' "$domain" "$dmarc"; else printf '✖ DMARC _dmarc.%s: لا سجلَّ «v=DMARC1»\n' "$domain"; fail=1; fi

  return $fail
}

# تشغيلٌ مباشر لا `source`:   bash ops/mail/mail-dns-check.sh [ملفّ البيئة — افتراضُه .env.production]
# لفحصٍ يدويٍّ على الخادم قبل ضبط SMTP_HOST — **ولأوّل نشرٍ يحمل هذا الملفّ**: bash يُكمل نسخةَ deploy.sh التي
# بدأ بها (ما قبل السحب)، فلا يبلغ هذا الفحصُ نشرَه الأوّل؛ فيُشغَّل هكذا بيدٍ مرّةً قبله.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  mail_dns_check "${1:-.env.production}"
  exit $?
fi
