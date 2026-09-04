/**
 * كتالوج الأحداث — **بمعناها لا بأسماء الدوالّ**.
 *
 * الاسم يصف **ما وقع في العمل** (`invoice.issued`) لا ما سيُفعل به. فمن يستمع
 * يقرّر ماذا يعني له، ولا يفرض المُصدِر ترتيباً على من بعده.
 *
 * وهذا الملف **لا يستورد من أحد** (رتبة `shared`): لو استورد من وحدةٍ لصار
 * جزءاً منها، ولعاد كل مستمعٍ يعرف من يُصدِر — وهو ما وُجد الناقل لإنهائه.
 */

/** فاتورةٌ أو إشعارٌ صدر — والهيئة تنتظره (`ق-٤٩`). */
export const INVOICE_ISSUED = 'invoice.issued';

export interface InvoiceIssuedPayload {
  invoiceId: string;
  /** `INVOICE` · `CREDIT_NOTE` · `DEBIT_NOTE` — نصٌّ لا مُعدَّد، فالحمولة تعبر JSON. */
  docType: string;
  no: string;
}

/**
 * بضاعةٌ شُطبت باعتماد — **ولا جهةَ تنتظرها** (`ق-٩٥`: التلف لا يوجب تعديلاً
 * ضريبياً). فهو حدثٌ **تشغيليّ**: يُخبر من يريد أن يعرف (إشعارٌ لمالكٍ · تقريرٌ
 * يُحدَّث)، **ولا يُلغي فشلُ مستمعِه اعتماداً وقع**.
 */
export const INVENTORY_WRITTEN_OFF = 'inventory.written_off';

export interface InventoryWrittenOffPayload {
  writeOffId: string;
  no: string;
  /** رمزٌ من `WRITEOFF_REASONS` — ومساره الضريبي يُقرأ من تعريفه لا من هنا. */
  reasonCode: string;
  /** تكلفة ما خرج من الطبقات — وصفرٌ يعني ألّا طبقةَ لها تكلفة، لا خطأً. */
  baseCost: number;
}
