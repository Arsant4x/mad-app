# Interface languages

The interface ships in Arabic (the default, right to left) and English (left to
right). The user's choice is stored in `localStorage` under `ui_language`;
`setLanguage()` in `index.ts` switches language and page direction.

## Where text lives

- `locales/ar.json` and `locales/en.json`: older shared keys (navigation,
  login, generic errors). Add new keys to an area file instead.
- `locales/ar/<area>.json` and `locales/en/<area>.json`: one file per screen
  area (`shell`, `contracts`, `reports`, ...). The file name is the key prefix:
  `locales/ar/contracts.json` holds keys read as `t('contracts.…')`.
  Both languages always have the same keys; `locales.test.ts` fails otherwise.

## Rules for a screen

1. No user-visible text written in the code. Use `t('area.key')` from
   `useTranslation()`. The gate `ops/ci/i18n-literals-check.mjs` fails a pull
   request that adds or changes a UI file with direct text.
2. The Arabic value is the text the screen showed before, unchanged, so the
   Arabic interface looks the same.
3. Values inside a sentence use placeholders: `"بقي {{n}} يوماً"` with
   `t('area.days_left', { n })`. Do not name a placeholder `count` unless the
   key has plural forms; use `n`.
4. Text outside a component (a `.ts` helper, a constant table) is translated
   when it is used, not when the module loads: export a function that calls
   `i18n.t(...)`, or keep the key in the table and call `t(key)` at render.
   A value translated at load time would not change when the user switches.
5. Dates and numbers go through `format.ts` (`formatDate`, `formatTime`,
   `formatDateTime`, `formatNumber`). Pass the Arabic locale the screen used
   before (for example `'ar-SA-u-ca-gregory'`) so Arabic does not change.
6. Directions are logical: `marginInlineStart`/`End`, `paddingInlineStart`/`End`,
   `insetInlineStart`/`End`, `textAlign: 'start'`/`'end'`. The interface was
   written right to left, so `right` becomes `start` and `left` becomes `end`.
7. Icons that point a direction (arrows, chevrons) flip in left to right; text
   symbols such as `←` move into the translation so each language has its own.
8. A string that is not shown to the user (a regular expression, a data value
   sent to the server) stays in the code with `// i18n-exempt: <reason>` at the
   end of its line.
