## ما الطلب

تصحيحُ الخطوة الخامسة (التحقّقُ الأخير) في `docs/management/إعداد_الجهاز_الجديد.md` بعد أوّل تشغيلٍ لها على الجهاز الجديد من PowerShell. وثائقيٌّ محض (القاعدة ١٥: يُدمج بالفحص الخفيف).

## لماذا

فحصُ الوحدات بأمر الدليل من PowerShell أسقط ثلاثَ حزمٍ وثلاثةَ عشرَ اختباراً (`certificate-expiry` · `deploy-recreate-guard` · `mail-dns-check`)، والأمرُ نفسُه من Git Bash 163 من 163. فالعلّةُ في البيئة التي يصفها الدليل لا في `main`:

• `bash` في مسار PowerShell هو `WindowsApps\bash.exe`، اسمٌ مستعارٌ يفتح WSL، وتوزيعتُه الوحيدة `docker-desktop` ليس فيها `/bin/bash`.
• `openssl` ليس في مسار PowerShell أصلاً.
• والأداتان مع Git في `C:\Program Files\Git\usr\bin`، والمسارُ يحمل `Git\cmd` وحدَه.

ومعها علّةٌ ثانية في الدليل نفسِه: طريقُه حين تكون السكربتاتُ معطّلة `npx.cmd`، وصيغةُ `--roots` بالعلامة `<` يقرؤها `cmd` تحويلاً فلا يبدأ jest («The system cannot find the file specified»).

## ما تغيّر

• سطرا بيئةٍ في رأس الخطوة، يسريان على النافذة وحدَها: `NODE_OPTIONS` كما كان، ومجلّدُ Git الثاني في أوّل المسار، بسببهما.
• `--roots src` بدل الصيغة ذات العلامة `<`، والصيغتان تجدان الملفّاتِ الـ163 نفسَها (`--listTests` متطابقة).
• «كسور: 0» كما يطبعها الأمر، والأعدادُ إلى ما قِيس اليوم: 163 و1055 للخادم، و43 و172 للواجهة.
• وتحذيرُ حجم الحزمة (قائمٌ في السير بالحزمة نفسِها `index-UoArxaYL.js`) وسطرُ «NativeCommandError» من PowerShell: لا يضرّان.

## التحقّق

من PowerShell بالنصّ المكتوب نفسِه: `prisma generate` و`tsc` و`openapi:check` («كسور: 0») خروج 0 · jest «Test Suites: 163 passed, 163 total · Tests: 1055 passed, 1055 total» بـ`npx` وبـ`npx.cmd` · الواجهة «Test Files 43 passed (43) · Tests 172 passed (172)» · البناء «built in». والمحطّةُ في نسخة العمل 163 من 163، وفحصُ الشَّرطات على الدليل صفر.
