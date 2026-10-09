# PermitVoice

Learner's permit practice for the US, in English and Spanish, read aloud. Florida first.
Read `README.md` for the files and the question rules.

## Owner decisions (2026-10-08)

- **Name:** PermitVoice. Not yet checked against USPTO. "Drivewise" is never used here.
- **Hosting:** Cloudflare Pages from this private repo, live at https://permitvoice.pages.dev (connected 2026-10-09). No build step: the repo root is the site; every push to `main` deploys.
- **Server:** any paid feature (ads, premium check) uses its **own** Cloudflare Worker, in its own account.
  Never Barak's / Limor's worker from the bekol repo (`tutor-api/worker.js`). Bekol has no link to money; PermitVoice does.
- **Separate from bekol.** Different market, languages and revenue model. Nothing here is copied into `lagstein1-png.github.io`, and nothing from there is loaded here.

## Rules that carry over from Talking Theory

- Vanilla JS, no npm, no framework, no build step. No API key in the repo.
- Accessibility first: dyslexia, ADHD, second-language learners, older drivers. Legible beats clever.
- A wrong answer is never a penalty: "Almost" and a hint.
- Every explanation (`h2`) is a full sentence that states the answer, never a formula.
- Speech is the device voice (`speechSynthesis`). Unlock on first touch, start a moment after `cancel()`, then one part at a time from `onend`; keep a reference to the utterance.
- The spoken word is highlighted from `onboundary`. A voice with no boundary events gets the whole element highlighted.

## Content

- Each question holds both languages together (same option order, same `c`). Do not split languages into separate files.
- `conf: "medium"` questions are not served until a person checks them.
- Original wording only. Nothing copied from any state handbook. FLHSMV permission was requested 2026-10-07; no answer yet.
- After any change to `bank/`, run `node build-bank.js`, then `node tools/smoke.js .`.
- Bump `CACHE` in `sw.js` whenever a served file changes.
