# T3cpu

الحكم العامّ: فشل  
المجموعات والاختبارات: 36320190008

سقاط:
- **الملف**: apps/api/package.json  
  **الاختبار**: RUN npm ci  
  **المتوقَّع**: نجاح البناء  
  **الواقع**: خطأ في تنفيذ `node scripts/ensure-prisma-client.cjs` — الملف غير موجود  
  **رقم السطر**: 13

خطأ بنية أو تشغيل:
- **الخطوة**: if sed 's/\x1b\[[0-9;]*m//g' /tmp/cache.log 2>/dev/null | grep -aqE "^[[:space:]]*[0-9]+ skipped"; then  
  **نصّ رسالة الخطأ الحاسمة**: `grep: /tmp/cache.log: No such file or directory`

<!-- calls=1 prompt_tokens=10027 completion_tokens=195 seconds=2709.4 raw_bytes=21732 summary_bytes=635 chunks=1 -->
