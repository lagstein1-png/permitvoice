# PermitVoice

Learner's permit practice for the US, in English and Spanish, read aloud. Florida first.
Read `README.md` for the files and the question rules.

## Owner decisions (2026-10-08)

- **Name:** PermitVoice. Not yet checked against USPTO. "Drivewise" is never used here.
- **Hosting:** Cloudflare Pages from this private repo, live at https://permitvoice.pages.dev (connected 2026-10-09). No build step: the repo root is the site; every push to `main` deploys.
- **Server:** any paid feature (ads, premium check) uses its **own** Cloudflare Worker, in its own account.
  Never Barak's / Limor's worker from the bekol repo (`tutor-api/worker.js`). Bekol has no link to money; PermitVoice does.
- **Revenue (2026-10-09):** one-time upgrade, sold through Lemon Squeezy (merchant of record: it collects and pays US sales tax). The buyer gets a license key; the separate Worker checks it. No user accounts. The Lemon Squeezy API key lives only as a Worker secret, never in this repo. Price: **US$9.99 one-time per state**, lifetime access for that state, no subscription (set 2026-10-09; compared with DMV Genie's basic Premium at $9.99 and Zutobi's weekly plans from $4.99, App Store listings found by search that day).
  - Free forever: all practice questions, hints, read-aloud with word highlighting, both languages, and one full practice test per day.
  - Upgrade: unlimited full practice tests, score history, and a focused review pack built from the learner's mistakes.
- **Languages (2026-10-09):** English, Spanish, then Chinese (Simplified), Vietnamese, Tagalog and Arabic, the largest home languages in the US after English and Spanish (owner's list from Census figures). Arabic is right-to-left. Haitian Creole (`ht`) is offered for Florida only; phones rarely have a Creole voice, so it falls back to a French voice and says so. New languages are machine-translated and need a native speaker's review before marketing them.
- **Florida tests only in English** (FLHSMV, from February 2026, per news reports and county tax collector pages found 2026-10-09). The app tells non-English learners this and shows the English text under each question and option (on by default, can be turned off).
- **Separate from bekol.** Different market, languages and revenue model. Nothing here is copied into `lagstein1-png.github.io`, and nothing from there is loaded here.

## Rules that carry over from Talking Theory

- Vanilla JS, no npm, no framework, no build step. No API key in the repo.
- Accessibility first: dyslexia, ADHD, second-language learners, older drivers. Legible beats clever.
- A wrong answer is never a penalty: "Almost" and a hint.
- Every explanation (`h2`) is a full sentence that states the answer, never a formula.
- Speech is the device voice (`speechSynthesis`). Unlock on first touch, start a moment after `cancel()`, then one part at a time from `onend`; keep a reference to the utterance.
- The spoken word is highlighted from `onboundary`. A voice with no boundary events gets the whole element highlighted.

## Content

- Each question holds all its languages together (same option order, same `c`): `en` and `es` required, `zh`, `vi`, `tl`, `ar`, `ht` optional but complete when present. Translations are produced in a scratch folder and merged in with `node tools/merge-i18n.js <dir>`; never keep a language in a separate bank file.
- `conf: "medium"` questions are not served until a person checks them.
- Original wording only. Nothing copied from any state handbook. FLHSMV permission was requested 2026-10-07; no answer yet.
- After any change to `bank/`, run `node build-bank.js`, then `node tools/smoke.js .`.
- Bump `CACHE` in `sw.js` whenever a served file changes.
