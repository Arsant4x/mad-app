# نشر mad-app للإنتاج

> دليل عملي لتشغيل المنصة على خادم واحد بـ Docker. مكتوب لصاحب المشروع —
> كل خطوة قابلة للنسخ واللصق، مع «لماذا» عند كل قرار مهم.

## الاستضافة — قرار المالك (2026-08-09)

**Google Cloud · منطقة الدمام `me-central2`.**

الموقع شرطٌ لا تفضيل: عقود «إيجار» تُلزم ببقاء البيانات **داخل المملكة**،
ونظام حماية البيانات الشخصية (PDPL) يقيّد نقل بيانات المستأجرين خارجها.
فأي مزوّد خارج المملكة — AWS البحرين/الإمارات · Hetzner · DigitalOcean —
**مستبعَد بحكم العقد والنظام معاً، لا بحكم الأداء**.

⚠️ **تحقّق من المنطقة عند إنشاء كل مورد**، لا مرة واحدة عند إنشاء المشروع:
الأقراص والنسخ الاحتياطية والسجلات تُنشأ في مناطقها الخاصة، ومورد واحد
يسقط سهواً في `us-central1` يُخرج نسخةً من البيانات خارج المملكة بلا إشعار.

## المتطلبات

- خادم Linux (يوصى بـ Ubuntu 22.04+) عليه Docker وDocker Compose v2.
  الحد الأدنى العملي: **2 vCPU · 4 GB RAM · 40 GB SSD** (البناء على الخادم
  نفسه بـ`--build` هو ما يلتهم الذاكرة، لا التشغيل).
- **ثلاثة** نطاقات تشير إلى الخادم: `app.` (الواجهة) · `api.` (الخادم) ·
  `files.` (المرفقات — انظر §4؛ بدونه يُرفع كل مرفق ولا يُنزَّل).
- الكود مستنسخاً على الخادم: `git clone https://github.com/Arsant4x/mad-app.git`

## 1) التهيئة

```bash
cd mad-app
cp .env.production.example .env.production
```

افتح `.env.production` واملأ **كل** قيمة `change-me`. لتوليد الأسرار الطويلة:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

⚠️ **لماذا كلمتا مرور لقاعدة البيانات؟** `POSTGRES_PASSWORD` للدور الأعلى
(الإدارة والنسخ الاحتياطي فقط)، و`APP_DB_PASSWORD` لدور `app_user` الذي
يتصل به التطبيق. الدور الأعلى يتجاوز عزل الصفوف (RLS) بصمت، لذا لا يتصل
به التطبيق أبداً — هذا قرار أمني ثابت في المشروع (CLAUDE.md 6.1).

🔐 **حساب مدير المنصة في الإنتاج — قرار المالك (2026-08-09):**
`PLATFORM_ADMIN_PASSWORD` **تُولَّد عشوائياً ولا تُوثَّق في أي ملف.** لا تُعاد
استخدام كلمة حساب التطوير (`Arsan_admin`) ولا تُكتب في وثيقة أو رسالة أو
تذكرة — تُولَّد، تُلصق في `.env.production` على الخادم، وتُحفظ في مدير كلمات
مرور. الإنتاج **يبدأ بحساب جديد** لا صلة له بحساب القاعدة المحلية:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

وبعد أول دخول، `bootstrapPlatform` **لا يعيد ضبط كلمة مرور حساب قائم** عمداً
(`update: {}`) — فإعادة تشغيله بعد أي تحديث لا تُرجع كلمة المرور إلى ما في ملف
البيئة ولا تُبطل تدويراً جرى بعده.

## 2) التشغيل

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

أول تشغيل يبني الصورتين (دقائق). تحقّق:

```bash
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:3000/docs   # يجب أن يردّ 200
curl http://127.0.0.1:8080        # صفحة الواجهة
```

## 3) إنشاء حساب مدير المنصة (مرة واحدة)

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/bootstrap-production.js
```

ينشئ قالبَي الصلاحيات العامّين وحساب المدير من `PLATFORM_ADMIN_*`،
**ولا شيء غيرهما**. القاعدة تبقى نظيفة: صفر منشأة، صفر بيانات تجريبية.
وهو عديم الأثر عند التكرار — أعد تشغيله بعد كل تحديث بلا قلق.

> ⚠️ **لا تشغّل `npx prisma db seed` على خادم حيّ.** تلك بذرة تطوير تُنشئ
> شركتين دخولهما `DemoPass123!` **مكتوبةً في المستودع العام**. الخادم يرفضها
> الآن من تلقاء نفسه حين `NODE_ENV=production`، وهي لا تعمل في صورة الإنتاج
> أصلاً (لا `ts-node` فيها ولا ملفات مصدر).

## 4) TLS (https) — إلزامي قبل استقبال أي عميل

الحاويتان تستمعان على `127.0.0.1` فقط عمداً: وسيطٌ عاكس هو من يواجه
الإنترنت ويحمل الشهادة. أبسط خيار هو Caddy (شهادات تلقائية):

```bash
sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
app.example.com {
    reverse_proxy 127.0.0.1:8080
}
api.example.com {
    reverse_proxy 127.0.0.1:3000
}
# نطاق ثالث للمرفقات: رابط التنزيل الموقَّع يُسلَّم لمتصفح العميل، والعنوان
# الداخلي (minio:9000) لا يُحلّ خارج شبكة Docker. يجب أن يطابق S3_PUBLIC_URL.
files.example.com {
    reverse_proxy 127.0.0.1:9000
}
```

⚠️ حاوية MinIO لا تنشر 9000 على المضيف افتراضياً — أضف
`ports: ["127.0.0.1:9000:9000"]` لخدمة `minio` قبل أن يعمل هذا النطاق.

```bash
sudo systemctl reload caddy
```

## 5) النسخ الاحتياطي والاستعادة

خدمة `backup` تأخذ نسخة منطقية **يومياً** إلى مجلد `./backups` وتحتفظ
بأحدث 14 نسخة. جرّب الاستعادة مرة واحدة على الأقل قبل الإطلاق — نسخة لم
تُجرَّب استعادتها ليست نسخة:

```bash
set -a; . ./.env.production; set +a          # يحمّل POSTGRES_USER/DB إلى صدفتك
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean < backups/mad-app-XXXX.dump
```

> السطر الأول ليس زينة: `$POSTGRES_USER` يعيش في `.env.production` لا في
> صدفتك، وبدونه يعمل `pg_restore -U ""` فيفشل بخطأ مصادقة غامض.

**جرّب الاستعادة على قاعدة منفصلة أولاً** — استعادةٌ بـ`--clean` على القاعدة
الحيّة تحذف قبل أن تكتب، فنسخةٌ تالفة تعني ضياع الاثنتين:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  createdb -U "$POSTGRES_USER" restore_test
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d restore_test < backups/mad-app-XXXX.dump
# تحقّق أن الصفوف موجودة فعلاً، لا أن الأمر انتهى بلا خطأ:
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d restore_test -c \
  "SELECT (SELECT count(*) FROM companies) AS companies, (SELECT count(*) FROM invoices) AS invoices;"
```

⚠️ **`pg_dump` لا يصدّر الأدوار.** دور `app_user` يُنشئه سكربت التهيئة عند أول
إقلاع لقاعدة جديدة، فالاستعادة على خادم جديد تمرّ بذلك المسار — لكن استعادةً
إلى مثيل Postgres لا يحمل الدور ستفشل عند إسناد الملكية.

⚠️ **حجم MinIO خارج هذه النسخة** — المقلب يغطي قاعدة البيانات وحدها. المرفقات
(عقود · شعارات · صور) في حجم `minio_data`، ويلزمها نسخٌ منفصل.

انسخ مجلد `backups/` دورياً خارج الخادم (rclone / S3 / أي تخزين خارجي).

## 6) التحديث لإصدار جديد

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

الحاوية تنفّذ `prisma migrate deploy` تلقائياً عند كل إقلاع، فالمخطط
يلحق بالكود دائماً.

## ما الذي يعمل بلا إعداد إضافي، وما الذي ينتظر مفاتيحك

| الميزة | الحالة |
|---|---|
| المنصة كاملة (محاسبة · عقارات · مخزون · صلاحيات · تدقيق · اشتراكات) | ✅ تعمل |
| استعادة كلمة المرور بالبريد | تحتاج تعبئة `SMTP_*` بأي مزوّد بريد |
| الدفع الإلكتروني للتجديد | ينتظر اختيارك للبوابة ومفاتيحها |
| رسائل SMS / OTP | ينتظر اختيارك لمزوّد الرسائل |
| ZATCA إنتاج | يحتاج OTP من بوابة فاتورة (زر الربط داخل بيانات المنشأة) |

## استكشاف الأعطال

```bash
docker compose -f docker-compose.prod.yml logs -f api    # سجلّ الخادم
docker compose -f docker-compose.prod.yml logs -f web    # سجلّ الواجهة
```

- **الواجهة تعمل والطلبات تفشل:** تأكد أن `PUBLIC_API_URL` صحيح — يُخبز
  في بناء الواجهة، فأي تغيير له يستلزم `--build`.
- **رسالة CORS:** تأكد أن `WEB_ORIGIN` يطابق نطاق الواجهة حرفياً (بالـ
  https وبلا شرطة مائلة أخيرة).
