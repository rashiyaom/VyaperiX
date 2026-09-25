# Site translation pipeline

The public site is translated into Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Kannada and Malayalam
(English is the source). Translation happens **offline**, once — visitors never trigger any translation call.

```
npm run i18n:collect     # render "/" and "/login", collect every English string -> frontend/src/i18n/source-strings.json
npm run i18n:translate   # Sarvam Translate; only strings missing from a language file are sent -> frontend/src/i18n/translations/<code>.json
npm run i18n:check       # coverage / digits / script sanity checks
```

Run these after changing site copy (frontend dev server on :8080 must be running for `collect`).
`translate` uses `SARVAM_WEBSITE_DEMO_API_KEY` from `backend/.env`; re-runs are incremental and cheap.

Runtime: `frontend/src/i18n/site-translator.ts` swaps text in place using exact-match lookups
(lazy-loaded per language). Unmatched strings stay English. Add `translate="no"` to any element that must
never be translated. Hand-fix a translation by editing its entry in `translations/<code>.json`
(it is kept on re-runs because only missing strings are re-translated).

Note: only the public pages are collected. The signed-in dashboard keeps its own `t()` dictionary
(`components/app/lang.tsx`, English/Hindi/Gujarati) — extend `collect_strings.py`'s `PAGES` to cover more.
