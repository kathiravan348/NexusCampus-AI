# Correcting the Hindi and Tamil texts

`TRANSLATIONS.csv` (next to this file) holds every text people see in NexusCampus: the institution app (`app`),
Nexus Control (`control`) and the words each institution type uses (`terms:k12`, `terms:he`, …). Today's Hindi and
Tamil are machine drafts. Correct them once before production (D54).

## Steps

1. Make the file current: `pnpm --dir frontend texts:export`
2. Open `docs/review/TRANSLATIONS.csv` in Excel or LibreOffice Calc (UTF-8; Hindi and Tamil show correctly).
3. Change only the `hindi` and `tamil` columns. Read `english` and `note` (where and how the text is used).
   You may set `status` to `checked` for your own tracking; it is not imported.
4. Save as **CSV UTF-8** (Excel: *File → Save As → CSV UTF-8*). Keep the first line and the columns as they are.
5. Write the corrections back: `pnpm --dir frontend texts:import`
6. Check: `pnpm --dir frontend review:check`, then commit the changed `hi.json` / `ta.json` files.

## Rules the import checks

- Keep every placeholder in curly braces exactly as in English: `{name}`, `{count}`. Do not translate the word inside.
- In plural texts such as `{count, plural, one {# item} other {# items}}` translate only the words inside the inner
  braces (`item`, `items`); keep `{count, plural, one`, `other` and `#`.
- Every `{` needs its `}`.
- A row that breaks these rules is **refused** and listed with its key; nothing else is lost. Fix it and import again.
- English is never changed by the import. Empty cells are skipped (the current text stays).
