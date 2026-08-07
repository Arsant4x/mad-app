# نشر mad-app للإنتاج

> دليل عملي لتشغيل المنصة على خادم واحد بـ Docker. مكتوب لصاحب المشروع —
> كل خطوة قابلة للنسخ واللصق، مع «لماذا» عند كل قرار مهم.

## المتطلبات

- خادم Linux (يوصى بـ Ubuntu 22.04+) عليه Docker وDocker Compose v2.
- نطاقان يشيران إلى الخادم: `app.example.com` (الواجهة) و`api.example.com` (الخادم).
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
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

⚠️ الـseed الحالي يُنشئ أيضاً شركتين تجريبيتين (`demo-company-a/b`).
بعد الدخول بحساب المدير، **احذفهما من لوحة المطوّر** — بيئة الإنتاج لا
تحمل بيانات تجريبية.

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
```

```bash
sudo systemctl reload caddy
```

## 5) النسخ الاحتياطي والاستعادة

خدمة `backup` تأخذ نسخة منطقية **يومياً** إلى مجلد `./backups` وتحتفظ
بأحدث 14 نسخة. جرّب الاستعادة مرة واحدة على الأقل قبل الإطلاق — نسخة لم
تُجرَّب استعادتها ليست نسخة:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean < backups/mad-app-XXXX.dump
```

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
