-- ⑬A1 (`ق-١٣٣٣`) — عدّادُ البريد المُرسَل بالساعة، لنافذة «آخر أربعٍ وعشرين ساعة» عند المزوّد.
--
-- بلا `companyId` وبلا سياسة عزل **عمداً**: الحدُّ على حساب المنصّة عند المزوّد لا على منشأة، والصفُّ رقمٌ
-- وساعةٌ لا بياناتِ مستأجر. **ولا صفوفَ تُكتب هنا** — جدولٌ جديدٌ فارغ، فلا عدَّ يُعلَن.

CREATE TABLE "mail_send_counts" (
  "hour" TIMESTAMPTZ(3) NOT NULL,
  "sent" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mail_send_counts_pkey" PRIMARY KEY ("hour")
);

-- والعددُ لا يكون سالباً — فالعدّادُ يزيد ولا ينقص.
ALTER TABLE "mail_send_counts" ADD CONSTRAINT "mail_send_counts_sent_non_negative" CHECK ("sent" >= 0);
