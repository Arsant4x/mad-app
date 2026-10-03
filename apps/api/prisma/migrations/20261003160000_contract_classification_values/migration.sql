-- ⚖️ ق-١٦٠٠ · ق-١٦٠٩/د — التصنيفُ الثالث والمختلط (السؤالان ٥٩ و٤١٢، بحكم صاحب المشروع).
--
-- قيمتان على تعداد التصنيف: `SERVICED_LODGING` إيواءٌ مخدومٌ أو مؤقّت خاضعٌ كالتجاريّ، و`MIXED` عقدٌ واحدٌ بجزأين معفى وخاضع.
--
-- ⚠️ في هجرةٍ وحدَها: قيمةٌ تُضاف إلى تعدادٍ لا تُستعمل في المعاملة نفسِها (`unsafe use of new value`)، والهجرةُ الواحدةُ
-- نصٌّ واحدٌ ينفّذه Postgres معاملةً ضمنية — فالقيدُ الذي يسمّي `MIXED` في الهجرة التالية. ولا كتابةَ بيانات هنا.

ALTER TYPE "ContractClassification" ADD VALUE 'SERVICED_LODGING';
ALTER TYPE "ContractClassification" ADD VALUE 'MIXED';
