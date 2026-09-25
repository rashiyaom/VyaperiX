# Site translation (Hindi + Gujarati)

English is the source. Hindi and Gujarati are **hand-written and hand-reviewed** — no translation API is used,
at build time or at runtime, so there are no credits or rate limits involved.

```
npm run i18n:collect    # render "/" and "/login", collect every English string -> frontend/src/i18n/source-strings.json
                        #   (dev server on :8080 must be running; add random/timed strings to extra_strings.txt)
# edit scripts/i18n/manual_translations.txt:  English ⇒ Hindi ⇒ Gujarati      (one line per new/changed string)
npm run i18n:apply      # merges the manual file into translations/{hi,gu}.json, prunes stale keys, prints anything missing
npm run i18n:check      # coverage / digits / script sanity checks (exit 1 on problems)
npm run i18n:coverage   # opens the real site in each language and reports the % of visible text that is translated
```

Runtime: `frontend/src/i18n/site-translator.ts` swaps text in place using exact-match lookups (dictionaries are
lazy-loaded). Anything without an entry stays English. A language appears in the switcher only if a dictionary
for it exists in `frontend/src/i18n/translations/`.

Rules that keep translations correct
- **Never split a sentence across elements** (inline `<strong>`, `{value}` interpolation). Fragments cannot be
  translated with correct word order. Use a `t("key", {vars})` entry in `components/app/lang.tsx` instead —
  it supports `{placeholders}` and has explicit `hi` / `gu` values.
- Text that changes character-by-character (typewriters) must use `t()` too; the DOM translator can only match
  complete strings.
- Add `translate="no"` to anything that must stay as written: language pickers, native-script demo text, brand names.
- Keep brand/product names and acronyms (AI, CRM, ICP, SDR, HubSpot…) in Latin; identical entries are fine.

Adding a language: write its column into a copy of the manual file workflow (one more dictionary JSON), add the
language to `LANGUAGES` in `components/app/lang.tsx`, and add `hi`/`gu`-style values to the `t()` entries.
