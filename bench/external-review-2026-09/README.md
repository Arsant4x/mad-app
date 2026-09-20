# قياس الأداء

1. طبّق هجرات المشروع على PostgreSQL 16 بدور `app_user` (مالك المخطط، بلا BYPASSRLS).
2. `psql -U postgres -d mad_app -v n=10000 -v cid=c10000 -f seed.sql` (كرر لـ 1000 و100000).
3. `npm i pg && node --expose-gc bench.mjs c1000 c10000 c100000` للمسارات.
4. `node bench2.mjs c10000 9` للتزامن (الوسيط الثاني حجم المجمع).

الاستعلامات تطابق ما يولده Prisma من الشيفرة المذكورة بالملف والسطر في التقرير؛ الأرقام خام بلا زمن Prisma.
