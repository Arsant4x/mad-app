# وقائعُ فحص المعاينة المنشورة (توجيه ٢٨٥، ٧ أكتوبر ٢٠٢٦)

• النموذج `claude-opus-5-5` والجهد `high`، بلا تحوّل.
• رسالةُ صاحب المشروع: رابطُ المعاينة `https://rikzapp-home.pages.dev/`، وصل وأنا أنتظر فحوصَ طلب الأرشيف #800.
• #800 (تقريرُ تشخيص البوّابة ووقائعُه): السيرُ أخضر، والحالُ `CLEAN` قُرئ في أمرٍ مستقلّ، ودُمج مضغوطاً `a269430`. ولا طلبَ مفتوح.
• الصفحةُ على الرابط: `HTTP/1.1 200 OK` و`Content-Type: text/html; charset=utf-8`، والترويساتُ كلُّها حاضرة كما في `_headers`: `x-robots-tag: noindex, nofollow`، وسياسةُ أمان المحتوى بنصّها (`default-src 'none'` …)، و`referrer-policy: no-referrer`، و`x-content-type-options: nosniff`، و`permissions-policy`. ولا `set-cookie`.
• `robots.txt` يردّ `200` بسطرين: `User-agent: *` و`Disallow: /`. والخطُّ `readex-pro-latin-600-normal.woff2` يردّ `200` ومعه `Cache-Control: public, max-age=31536000, immutable`. و`style.css` يردّ `200` بـ٥٬٩٦١ بايتاً.
• `/_headers` و`/README.md` و`/preview-server.mjs` ومسارٌ لا وجود له (`/no-such-page-xyz`) تردّ كلُّها `200` بمحتوى الصفحة الرئيسية نفسِها (أوّلُ ١٢٠ حرفاً `<!doctype html> <html lang="en" dir="ltr">`)، لا بمحتواها هي. فـCloudflare Pages يردّ الصفحةَ الرئيسية على كلّ مسارٍ مجهول، ولم يُرفع شيءٌ من خارج `public` ولم يُخدم `_headers`.
• الصفحةُ المنشورة مطابقةٌ لـ`sites/rikzapp-home/public/index.html` على `main` بايتاً ببايت (`cmp` بلا فرق).
• في المتصفّح على الرابط: ستّةُ خطوطٍ محمّلة، و`document.scripts.length = 0`، و`document.cookie` فارغ، ولا رسائلَ في الوحدة، ولغةُ الصفحة `en`، والعنوانُ `Rikz · رِكز`، ولا تمريرَ أفقيّاً على ١٢٨٠ ولا على ٣٧٥. والبريدُ ظاهرٌ نصّاً (لم يحقن Cloudflare شيفرةَ إخفاء البريد).
• الصورُ من الرابط نفسِه: `review-285/pagesdev-desktop-light.jpg` (١٢٨٠×٩٠٠) و`review-285/pagesdev-mobile-light.jpg` (٣٧٥×٨١٢).
