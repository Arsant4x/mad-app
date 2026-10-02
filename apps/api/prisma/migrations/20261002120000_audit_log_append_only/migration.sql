-- سجلُّ التدقيق ملحقٌ فقط: لا يُعدَّل صفٌّ فيه ولا يُحذف ولا يُفرَّغ الجدول (ق-١٥٧٥ · البند 3 من مراجعة 3.3).
--
-- كان المنعُ في الخدمة وحدَها: «Written only by AuditInterceptor; no update/delete path exists» (ترحيل
-- 20260807170000_audit_log). والسياسةُ `tenant_isolation_audit_logs` بلا عبارة FOR فتسري على UPDATE وDELETE،
-- ودورُ التطبيق مالكُ الجدول، فأيُّ مسارٍ يصل القاعدة (استعلامٌ خام · deleteMany · سكربت) يعدّل الأثرَ أو يمحوه
-- بلا أن يشتكي شيء، وقد أثبته المراجعُ بالتشغيل (PoC 3: UPDATE ثم DELETE نجحا من دور التطبيق).
--
-- فالمنعُ هنا في القاعدة حيث تلتقي المساراتُ كلُّها، على نمط سجلَّي التفويض والمهامّ (ترحيلا
-- 20260812150000_delegation_log و20260813090000_task_log): مُشغِّلٌ لكلِّ صفٍّ يرفض التعديلَ والحذف، ومُشغِّلٌ
-- للعبارة يرفض TRUNCATE (لا يمرّ عليه مُشغِّلُ الصفّ). والملحقُ (1) من قرار الفوترة الإلكترونية يحظر
-- «Allows for log modification/deletion».
--
-- ⚠️ وحدُّه معلَن: مالكُ الجدول يستطيع إسقاطَ المُشغِّل بأمر DDL، وفصلُ دور الترحيل عن دور التطبيق بندٌ مستقلّ
-- (البند 4 من المراجعة). وإخفاءُ هويّة صاحب البيانات عند المحو (قرارُ 2026-08-12: «تُخفى الهوية ويبقى الأثر»)
-- يحتاج مساراً مقصوداً يُصمَّم حين يُبنى، لا ثغرةً تُترك له.
--
-- لا كتابةَ بيانات في هذه الهجرة، فلا إعلانَ بعدٍّ (ق-٦٩١).

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'سجلُّ التدقيق ملحقٌ فقط: لا يُحذف منه صفّ.';
    END IF;
    RAISE EXCEPTION 'سجلُّ التدقيق لا يُعدَّل: الأثرُ يُكتب مرّةً ويبقى كما كُتب.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only_guard
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_no_truncate_guard
    BEFORE TRUNCATE ON "audit_logs"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
