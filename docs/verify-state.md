# Checking a state against its handbook

How Florida was checked (2026-10-08). Do the same for every other state.

1. **Get the handbook.** The English PDF link is in `state-info/<xx>.json` (`handbook.en`) and in `STATES.md`.
   Download it to a scratch folder (not into the repo: handbooks are copyrighted) and extract the text (`pdftotext -layout`).
   If a link is missing or dead, find the official one on the state agency's site and update `state-info/<xx>.json`.
2. **Write a fact sheet** in the scratch folder: one line per rule, with the printed page number. Note what the handbook
   does NOT say. See how Florida's was used: every Florida question carries `page`.
3. **Check every question** in `bank/states/<xx>.json` against the fact sheet:
   - answer contradicts the handbook → fix it in both `en` and `es` (same option order, same `c`), and h1/h2/p;
   - fact confirmed → set `"page": <printed page>` and `"conf": "high"`;
   - fact not in the handbook but real state law with a reliable source → `"page": null`, `"conf": "high"` only if certain;
   - unsure → leave `"conf": "medium"` (it stays hidden).
   Run one agent per state file at most; never two agents on the same file.
4. **Fill the gaps in `state-info/<xx>.json`** from the handbook: test size and pass mark, permit age, supervised hours,
   teen limits. Set `"verified": true` and `"checked"` to the date.
5. **Exam format:** if the state's test size or pass mark differs from 50/40, add it to `EXAM` in `index.html`.
   If the state tests only in English, add it to `EN_ONLY_TEST`. Record which languages the state offers the test in.
6. **Translations:** checked questions also need `zh`, `vi`, `tl`, `ar` (see `tools/merge-i18n.js`).
   Until then they fall back to English in those languages.
7. Run `node build-bank.js`, `node tools/smoke.js .`, `node tools/states-report.js`; bump `CACHE` in `sw.js`; commit; push.
   A state appears in the app as soon as it has served (high) questions.
