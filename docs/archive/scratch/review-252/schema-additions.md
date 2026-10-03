# إضافاتُ `schema.prisma` — حزمة د/③

## ① في `model JournalEntry` — بعد كتلة `reversalOf…`

```prisma
  /// ⚖️ **قيدُ إقفال سنةٍ مالية** (`ق-١٢٨٣` · د/③): يسِم القيدَ بالسنة التي يُقفلها،
  /// فمنه يُعرف «أمقفلةٌ هي؟» — قيدُ إقفالٍ لم يُعكس بعد. **وبه وحدَه يُسمح بالترحيل
  /// داخل فترةٍ مقفلة**: الإقفالُ يقع **لأنها أُقفلت** لا رغم ذلك (والعكسُ يحمله كذلك
  /// كي يمرّ من الباب نفسِه، ويُميَّز بأنه يحمل `reversalOfId`).
  /// `Restrict`: لا تُحذف سنةٌ لها قيدُ إقفال — وحذفُها ممنوعٌ أصلاً وفيها فترةٌ مقفلة.
  closingForFiscalYearId String?
  closingForFiscalYear   FiscalYear? @relation("YearClosingEntries", fields: [closingForFiscalYearId], references: [id], onDelete: Restrict)
  /// ق-١٢٥٢ — حارسُ الكتابة عبر المنشآت: المركّبُ بجانب المفرد، بلا فعلٍ عند الحذف (المفردُ يحمله).
  closingForFiscalYearTenant FiscalYear? @relation("JournalEntry_closingForFiscalYearId_tenant", fields: [companyId, closingForFiscalYearId], references: [companyId, id], onDelete: NoAction, onUpdate: NoAction)
```

## ② في `model FiscalYear` — بجانب `periods`

```prisma
  /// قيودُ إقفال هذه السنة — الفعّالُ منها ما لم يُعكس (`ق-١٢٨٣`).
  closingEntries JournalEntry[] @relation("YearClosingEntries")
  journalEntry_closingForFiscalYearId_tenant JournalEntry[] @relation("JournalEntry_closingForFiscalYearId_tenant")
```
