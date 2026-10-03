# ما يُضاف إلى `src/common/i18n/messages.ts` — حزمة د/③

## المفاتيح (بعد `fiscal_year_has_closed_period`)

```ts
  fiscal_year_close_needs_closed_periods: 'fiscal.year_close_needs_closed_periods',
  fiscal_year_already_closed: 'fiscal.year_already_closed',
  fiscal_year_nothing_to_close: 'fiscal.year_nothing_to_close',
  fiscal_year_closing_memo_profit: 'fiscal.year_closing_memo_profit',
  fiscal_year_closing_memo_loss: 'fiscal.year_closing_memo_loss',
  fiscal_year_closing_reversed_memo: 'fiscal.year_closing_reversed_memo',
  account_system_protected: 'account.system_protected',
```

## النصوص (بعد `[MSG.fiscal_year_has_closed_period]`)

```ts
  [MSG.fiscal_year_close_needs_closed_periods]: {
    ar: 'لا تُقفل السنة المالية وفيها فترة مفتوحة — الفترة {period} ما زالت مفتوحة',
    en: 'A fiscal year cannot be closed while a period is open — {period} is still open',
  },
  [MSG.fiscal_year_already_closed]: {
    ar: 'السنة المالية مقفلة بقيد إقفال قائم — أعد فتح فترة منها ليُعكس القيد أولاً',
    en: 'This fiscal year already has a closing entry — reopen one of its periods to reverse it first',
  },
  [MSG.fiscal_year_nothing_to_close]: {
    ar: 'لا حركة إيراد ولا مصروف حتى نهاية السنة — لا شيء يُقفل',
    en: 'No revenue or expense movement up to the year end — nothing to close',
  },
  [MSG.fiscal_year_closing_memo_profit]: {
    ar: 'إقفال السنة المالية {year} — صافي ربح {amount}',
    en: 'Closing fiscal year {year} — net profit {amount}',
  },
  [MSG.fiscal_year_closing_memo_loss]: {
    ar: 'إقفال السنة المالية {year} — صافي خسارة {amount}',
    en: 'Closing fiscal year {year} — net loss {amount}',
  },
  [MSG.fiscal_year_closing_reversed_memo]: {
    ar: 'عكس قيد إقفال السنة {no} — أُعيد فتح فترة فيها',
    en: 'Reversal of year-closing entry {no} — a period in it was reopened',
  },
  [MSG.account_system_protected]: {
    ar: 'الحساب {code} حساب نظامي — لا يُحذف ولا يُعدَّل رمزه',
    en: 'Account {code} is a system account — it cannot be deleted and its code cannot be changed',
  },
```

## التعديلات على الملفّات

| الملفّ | التعديل |
|---|---|
| `prisma/schema.prisma` | `closingForFiscalYearId String?` + علاقتان (مفردة `Restrict` ومركّبة `NoAction`) + فهرس؛ و`FiscalYear` يستقبل `closingEntries JournalEntry[]` بعلاقتَيها |
| هجرة `20260922..._fiscal_year_closing_entry` | عمودٌ + فهرسٌ + قيدان (مفردٌ ومركّب) — **بلا كتابة بيانات فلا `RAISE WARNING`** |
| `src/journal/journal-posting.util.ts` | `closingForFiscalYearId?: string` في المدخلات · **وتخطّي `assertPeriodOpen` له وحدَه بسببٍ مكتوب** · وكتابةُ العمود |
| `src/fiscal/year-closing.util.ts` | جديد — المحرّك |
| `src/fiscal/fiscal.service.ts` | `closeYear()` + عكسٌ آليّ داخل `setPeriodStatus(false)` |
| `src/fiscal/fiscal.controller.ts` | `@Post(':id/close')` بفعل `review` |
| `src/accounts/default-chart.ts` | `3300` في الدليل الافتراضي |
| `src/accounts/accounts.service.ts` | حمايةُ الحسابات النظامية (حذفٌ وتعديلُ رمز) — على `3300` و`3900` معاً |
| `test/fiscal-year-closing.e2e-spec.ts` | الحارسُ الحيّ بستّ مراحل |
