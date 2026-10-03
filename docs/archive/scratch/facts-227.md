# وقائعُ التوجيه ٢٢٧ — سطرٌ لكلِّ رقمٍ ومعرّفٍ وحادثةٍ وقراءة، يُكتب مع الفعل لا بعده؛ كلُّ سطرٍ يجب أن يظهر حرفياً في التقرير
# قالبُ المالك (ق-١٠٥٠): [قِيس ولم يُبنَ] · [سقط وأُعيد] · [تعذّر] · [حدٌّ أُعلن] · [رقمٌ اعتُمد عليه]
# نقطةُ البداية
cae286b
#468
#469
04ed7cb
b2c9570
# [قِيس] gh مصادَقة
Logged in to github.com account Arsant4x (keyring)
'gist', 'read:org', 'repo', 'workflow'
gh version 2.101.0
# [تعذّر] النشرُ من هذه الجلسة: عنوانُ الخادم مقنَّعٌ في الوثائق وملفُّ المضيفين فارغ، والبحثُ عن طريقة الوصول (مفاتيحُ وعناوين) أوقفه مصنِّفُ السلامة — ولا يُلتفّ عليه
hosts.txt
# السجلّ ح٥
ح٥
ق-١١١٩
ق-١١٢٠
ق-١١٢١
ق-١١٢٢
ق-١١٢٣
ق-١١٢٤
ق-١١٢٥
ق-١١٢٦
docs/session-record-140
#470
24660f3
# [سقط وأُعيد] حارسُ السجلّ أوّلَ مرّة: إحالةٌ في خانة العنوان (ق-716) قُرئت معرّفاً مكرَّراً — نُقلت فمرّ
ق-716
26/26
# الدمجُ الأوّل والتربيع
0ec05bc
b97d128
59338d6
# الدمجُ الثاني والتربيع
f22a2f6
MERGED 2026-09-19T11:25:24Z
4c18bb5
# [تعذّر] ssh إلى الخادم رُفض من مصنِّف الوضع الآليّ ثلاثاً (قراءةٌ فقط أوّلاً: hostname وsha المنشور) — لا يُلتفّ عليه؛ النشرُ بيدك أو بإذنٍ صريح لـssh
root@test-api.rikzapp.com
# [قِيس] فرقُ النشر d9317a8..f22a2f6
d9317a8
254
85
246 files changed, 17514 insertions(+), 1367 deletions(-)
deploy.sh + pre-deploy-dump.sh + ops/deploy: unchanged since d9317a8
ops/backup/README.md
ops/backup/policy-proof.sh
ops/backup/restore-drill.sh
15
# [رقمٌ اعتُمد عليه] الهجراتُ التي تكتب بيانات وحرّاسُ EXCEPTION
journal_line_party writes=5
contract_classification writes=1
rent_accrual writes=1
ق-٨٧٤
ق-١٠٢٩/②
ق-١٠٩٠
# [رقمٌ اعتُمد عليه] المنشورُ آخرَ قراءةٍ (2026-09-16 · prod-count-191)
contracts_total=12
invoices_total=11
rent_payments_total=44/253846.04
# النتائج ق-١١٢٦
0804787
# العدّة
deploy-227
prod-dump-227.sh
prod-deploy-227.sh
prod-post-227.sh
README-227.md
measure-login-net.sh
# [حدٌّ أُعلن] ٢٥ لم يُبنَ — الترتيبُ النشرُ ثم البناء
# [قِيس] مرجعُ المقارنة بعد 165
p50=286.1
p50=19.1
# [قِيس] قاعدةُ الإذن التي أضافها المالك
Bash(ssh root@test-api.rikzapp.com:*)
.claude/settings.local.json
# [قِيس] حالُ الخادم قبل النشر (قراءةٌ فقط)
iZt4n22jl8ov2iip4v6m6fZ
server_sha=d9317a8
api_started=2026-09-14T23:54:13.371011958Z
deploy.sh=bc34fdcc58fa
mem_free_mb=2400
/dev/vda3        99G   22G   73G  23% /
# [قِيس] المقلبُ اليدويّ (ق-٧١٦ بأمر المالك)
dump_exit=0 file=backups/pre-upgrade-d9317a8-20260919T115529Z.dump bytes=426624
161a848bec83c552f65e3905531afed49d92c05e55134bf0419240dc9a813dc5
dump_tables=84
live_invoices=12 live_contracts=12 live_public_tables=84
migrations_applied_before=110
q874_purchases_paid_flag=0
q1029_live_contracts_without_customer=0
q1090_stock_batches_table=0
# [قِيس] النشرُ — الناتجُ الخام
T0=2026-09-19T11:55:51.598Z
deploy_exit=0
T1_deploy_returned=2026-09-19T12:02:58.453Z
T2_api_answers=2026-09-19T12:03:05.825Z code=401
12:02:45.498 502
12:03:04.001 502
probe_lines=354 down_lines=16
after: f22a2f6 · api started 2026-09-19T12:02:53.551289546Z
migrations_applied_after=125
migrations_failed=0
LOG=/root/deploy-227-20260919T115551Z.log
# [قِيس] صراخُ الهجرات — من سجلّ postgres
ق-٨٧٤: لا مشتريات معلَّمة بالعلَم القديم (paid) — 8 مشترياتٍ كلُّها تبدأ بالحالة DUE
ق-٨٧٣: 6 منشأة — نُسب: فواتير 36 · سندات قبض 10 · مشتريات 24 · سندات صرف 0 · عقود 88؛ وبقي بلا طرف: على 1200 0 · على 2100 0
ق-٨٩٨: 12 من 12 عقداً قائماً
ق-٩٢٦: 74 من 126 قسطاً قائماً
ق-١٠٢٩/②: عقدٌ حيٌّ بلا عميل: 0 (يجب 0) · مسوّداتٌ بلا عميل تُترك كما هي: 0
ق-١٠٤٠: أقساطٌ مختومةٌ PAID: 44 · منها مسدَّدةٌ بأقلَّ من مبلغها (تُترك كما هي — لا ترحيلَ رجعيّاً بلا حكم): 0
ق-١٠٦٩: القائمُ يُعلَن ويُعدّ ولا يُرحَّل — منتجاتٌ بلا وحدةٍ معلَنة: 2 (منها بنصٍّ قديم يُعلَن لا يُخمَّن: 2) · أسطرٌ بلا وحدة: فواتير 13 · عروض 2 · مشتريات 0
ق-١٠٨٦: القائمُ يُعلَن ويُعدّ ولا يُخمَّن — منتجاتٌ بلا إعلانِ تتبّع: 2 · طبقاتٌ بلا دفعة: 0
ق-١٠٩٠: لا تعارضَ في أرقام الدفعات (0)
# [قِيس] المخزنُ والمقالب
minio version RELEASE.2025-09-07T16-13-09Z
files_in_bucket=0
426624 2026-09-19 19:56 backups/pre-deploy-f22a2f6-20260919T115600Z.dump
{"ok":true,"at":"2026-09-18T23:55:48Z"
543dfe69
# [قِيس] ما بعد النشر — hot-after227
server≈total−tls(401): n=20 min=206.1 p50=288.0 p95=372.0 max=451.7 ms
whoAmI server≈total−tls(200): n=20 min=11.3 p50=13.7 p95=31.2 max=32.2 ms
receivables-aging  codes=200,200,200,200 cold=  149 ms  warm(median3)=   69 ms
balance-sheet      codes=200,200,200,200 cold=   28 ms  warm(median3)=   21 ms
rolconfig(app_user): plan_cache_mode=force_custom_plan
rls probe without context (expect 0): 0
Time: 2305.069 ms
test-app.rikzapp.com -> 200
test-api.rikzapp.com -> 404
test-files.rikzapp.com -> 403
mad-app-api-1 cpu=0.00% mem=153.7MiB / 3.413GiB
# [قِيس] من سجلّ deploy.sh
Updating d9317a8..f22a2f6
✔ مقلبٌ قبل الهجرات: ./backups/pre-deploy-f22a2f6-20260919T115600Z.dump (168 جدولاً · 426624 بايت)
«api»: حاوية جديدة (a8c7b79f4099 ← 9160103fb1b0)
«web»: حاوية جديدة (e5a0ec0d91db ← fba360f2becb)
اضغط Ctrl+Shift+R في المتصفح
# [قِيس] من خارج الخادم
test-app / -> 200
auth/me -> 401
# النتائج بعد النشر
dc2e822
4ecd54c
