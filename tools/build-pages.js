// Builds the search-engine landing pages: s/<xx>/index.html for every state with served questions,
// its Spanish twin s/<xx>/es/index.html, s/index.html and s/es/index.html (all states), sitemap.xml and robots.txt.
//   node tools/build-pages.js           write the files
//   node tools/build-pages.js --check   exit 1 if any generated file is missing or out of date
// Reads state-info/<xx>.json, bank.js (window.PV_BANK) and two constants from index.html (read only).
// Plain node, no dependencies. Output is deterministic (no dates, no randomness) so --check works.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const SITE = 'https://permitvoice.pages.dev';

/* ---------- Inputs ---------- */
const BANK = (() => {
  const src = fs.readFileSync(path.join(root, 'bank.js'), 'utf8');
  const m = src.match(/window\.PV_BANK=(\[[\s\S]*\]);\s*$/);
  if (!m) throw new Error('bank.js: cannot find window.PV_BANK=[...]');
  return JSON.parse(m[1]);
})();
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Colours: the :root tokens and their dark-mode override, copied from the app so both look the same.
const tokens = (() => {
  const light = indexHtml.match(/:root\{[^}]*\}/), dark = indexHtml.match(/@media \(prefers-color-scheme:dark\)\{\s*:root\{[^}]*\}\s*\}/);
  if (!light || !dark) throw new Error('index.html: cannot find the :root colour tokens');
  return light[0] + '\n' + dark[0];
})();
// States whose test is English only: EN_ONLY_TEST in index.html, plus englishOnly:true in state-info.
const EN_ONLY = new Set(((indexHtml.match(/const EN_ONLY_TEST = \{([^}]*)\}/) || [])[1] || '').split(',')
  .map(s => (s.match(/([A-Z]{2})\s*:\s*true/) || [])[1]).filter(Boolean));
const STATES = JSON.parse('{' + ((indexHtml.match(/const STATES = \{([^}]*)\}/) || [])[1] || '')
  .replace(/([A-Z]{2}):'([^']*)'/g, '"$1":"$2"') + '}');

const infoDir = path.join(root, 'state-info');
const INFO = {};
for (const f of fs.readdirSync(infoDir).filter(f => /^[a-z]{2}\.json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(infoDir, f), 'utf8'));
  INFO[j.code] = j;
  if (j.exam && j.exam.englishOnly === true) EN_ONLY.add(j.code);
}
// Florida's questions live in bank/*.json and it has no state-info file yet. Facts from README.md / CLAUDE.md /
// index.html (EXAM.FL = 50/40; English-only test since February 2026). The handbook URL is FLHSMV's long-standing
// PDF address; it could not be opened from the build machine on 2026-10-09 (network blocked), so check it.
const FL_FALLBACK = {
  code: 'FL', name: 'Florida', agency: 'Florida Department of Highway Safety and Motor Vehicles (FLHSMV)',
  handbook: { en: 'https://www.flhsmv.gov/pdf/handbooks/englishdriverhandbook.pdf', es: null },
  exam: { questions: 50, pass: 40, passPercent: 80, spanish: false, englishOnly: true }
};
if (!INFO.FL) INFO.FL = FL_FALLBACK;
EN_ONLY.add('FL');

const LANGS = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Español' }, { code: 'zh', label: '中文' },
  { code: 'vi', label: 'Tiếng Việt' }, { code: 'tl', label: 'Tagalog' }, { code: 'ar', label: 'العربية', rtl: true },
  { code: 'ht', label: 'Kreyòl ayisyen', states: ['FL'] }
];

/* ---------- Helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = o => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
const nameOf = c => (INFO[c] && INFO[c].name) || STATES[c] || c;
const langSpan = L => `<span lang="${L.code}"${L.rtl ? ' dir="rtl"' : ''}>${esc(L.label)}</span>`;

const byScope = {};
for (const q of BANK) (byScope[q.scope] = byScope[q.scope] || []).push(q);
const national = byScope.US || [];
// A state gets a page when it has served questions of its own.
const codes = Object.keys(byScope).filter(c => c !== 'US').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

// Five sample questions: the state's own questions first (no sign pictures: they need the app to draw them),
// spread across topics, picked in a fixed order so the output never changes between runs.
function samples(code) {
  const pool = (byScope[code] || []).filter(q => !q.sign);
  const out = [], cats = new Set();
  for (const q of pool) if (out.length < 5 && !cats.has(q.cat)) { out.push(q); cats.add(q.cat); }
  for (const q of pool) if (out.length < 5 && !out.includes(q)) out.push(q);
  for (const q of national.filter(q => !q.sign)) if (out.length < 5) out.push(q);
  return out;
}

function examLines(info) {
  const e = info.exam || {}, lines = [];
  if (e.questions != null) lines.push(`${e.questions} multiple-choice questions.`);
  if (e.pass != null && e.questions != null) lines.push(`You need ${e.pass} correct answers to pass${e.passPercent != null ? ` (${e.passPercent}%)` : ''}.`);
  else if (e.pass != null) lines.push(`You need ${e.pass} correct answers to pass.`);
  else if (e.passPercent != null) lines.push(`You need ${e.passPercent}% correct to pass.`);
  return lines;
}

const CSS = `${tokens}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:20px/1.5 "Atkinson Hyperlegible",Verdana,system-ui,sans-serif;letter-spacing:.01em}
.app{max-width:640px;margin:0 auto;padding:12px 16px 48px}
.bar{display:flex;align-items:center;gap:10px;min-height:56px}
.brand{font-size:24px;margin:0;color:var(--brand);font-weight:700;text-decoration:none}
.switch{margin-inline-start:auto;display:inline-flex;align-items:center;min-height:48px;padding:0 14px;border:2px solid var(--line);border-radius:12px;background:var(--card);font-size:18px;font-weight:700;text-decoration:none}
h1{font-size:30px;line-height:1.25;margin:10px 0 8px}
h2{font-size:24px;margin:28px 0 8px}
p{margin:0 0 12px}
.lead{color:var(--muted)}
a{color:var(--brand);text-underline-offset:3px}
.card{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:10px 0}
.card ul{margin:0;padding-inline-start:22px}
.card li{margin:4px 0}
.notice{background:var(--notice);border-radius:14px;padding:12px 14px;margin:10px 0;font-size:18px}
.bigbtn{display:block;width:100%;min-height:60px;margin:16px 0;border-radius:16px;border:0;background:var(--go);color:#fff;font-size:21px;font-weight:700;text-align:center;text-decoration:none;line-height:60px;box-shadow:0 4px 0 var(--go-dark)}
.q{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}
.q h3{font-size:21px;line-height:1.4;margin:0 0 10px}
.q ol{margin:0 0 10px;padding-inline-start:26px}
.q li{margin:4px 0}
.q li.right{font-weight:700}
.ans{background:var(--right-bg);border-radius:12px;padding:10px 12px;margin:8px 0 0;font-size:19px}
.ref{font-size:15px;color:var(--muted);margin:6px 0 0}
.states{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:8px}
@media (min-width:520px){.states{grid-template-columns:1fr 1fr}}
.states a,.states span.soon{display:flex;justify-content:space-between;gap:8px;min-height:52px;align-items:center;padding:8px 14px;border-radius:12px;border:2px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none}
.states small{color:var(--muted);font-size:15px}
.states span.soon{color:var(--muted)}
.foot{font-size:15px;color:var(--muted);margin-top:28px;border-top:1px solid var(--line);padding-top:12px}
a:focus-visible{outline:4px solid var(--focus);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}`;

// lang: 'en' or 'es'. alt: { en, es } absolute URLs of the two versions. sw: { href, lang, label } visible switch link.
function shell({ title, desc, canonical, ld, body, up, lang = 'en', alt, sw }) {
  const hreflang = alt ? `\n<link rel="alternate" hreflang="en" href="${alt.en}">\n<link rel="alternate" hreflang="es" href="${alt.es}">\n<link rel="alternate" hreflang="x-default" href="${alt.en}">` : '';
  const swHtml = sw ? `<a class="switch" href="${sw.href}" hreflang="${sw.lang}" lang="${sw.lang}">${esc(sw.label)}</a>` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<!-- Generated by tools/build-pages.js. Do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">${hreflang}
<meta name="theme-color" content="#0E3B5C">
<link rel="icon" href="${up}icon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PermitVoice">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${lang === 'es' ? 'es_US' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'es' ? 'en_US' : 'es_US'}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
${jsonLd(ld)}
</script>
<style>
${CSS}
</style>
</head>
<body>
<main class="app">
<div class="bar"><a class="brand" href="${up}">PermitVoice</a>${swHtml}</div>
${body}
</main>
</body>
</html>
`;
}

function statePage(code) {
  const info = INFO[code] || { code, name: nameOf(code), exam: {}, handbook: {} };
  const name = nameOf(code), slug = code.toLowerCase();
  const own = byScope[code] || [], all = own.concat(national), total = all.length;
  const langs = LANGS.filter(L => !L.states || L.states.includes(code));
  const full = langs.filter(L => all.every(q => q[L.code]));
  const partial = langs.filter(L => !full.includes(L) && all.some(q => q[L.code]));
  const enOnly = EN_ONLY.has(code), e = info.exam || {};
  const canonical = `${SITE}/s/${slug}/`;
  const title = `${name} Permit Practice Test — Free, Read Aloud, English & Spanish | PermitVoice`;
  let desc = `Free ${name} permit practice test: ${total} questions read aloud in English and Spanish, with hints. No sign-up. Works on any phone.`;
  if (desc.length >= 160) desc = `Free ${name} permit practice test: ${total} questions read aloud in English and Spanish, with hints.`;
  if (desc.length >= 160) throw new Error(code + ': description too long');

  const exam = examLines(info);
  const examHtml = exam.length || enOnly || e.spanish === true ? `<h2>The ${esc(name)} knowledge test</h2>
<div class="card"><ul>
${exam.map(l => `<li>${esc(l)}</li>`).join('\n')}${e.spanish === true && !enOnly ? `\n<li>The state also gives the test in Spanish.</li>` : ''}
</ul></div>
${enOnly ? `<p class="notice">${esc(name)} gives the knowledge test only in English. If you practice in another language, PermitVoice shows the English words under each question and answer, so you learn the words you will see on the test.</p>\n` : ''}` : '';

  const langHtml = `<h2>Languages</h2>
<div class="card"><ul>
<li>Every question: ${full.map(langSpan).join(', ')}.</li>${partial.length ? `
<li>The ${national.length} national questions (signs, signals, road markings) also in ${partial.map(langSpan).join(', ')}. In these languages the ${esc(name)} questions show in English for now.</li>` : ''}
</ul></div>`;

  const sampleHtml = samples(code).map((q, i) => `<div class="q">
<h3>${i + 1}. ${esc(q.en.q)}</h3>
<ol type="A">
${q.en.o.map((o, k) => `<li${k === q.c ? ' class="right"' : ''}>${esc(o)}${k === q.c ? ' (correct answer)' : ''}</li>`).join('\n')}
</ol>
<p class="ans"><b>Answer: ${'ABCD'[q.c]}.</b> ${esc(q.en.h2)}</p>${q.ref && q.ref.page != null && q.scope === code ? `\n<p class="ref">${esc(name)} handbook, page ${esc(q.ref.page)}.</p>` : ''}
</div>`).join('\n');

  const hb = info.handbook || {};
  const hbHtml = hb.en || hb.es ? `<h2>Official handbook</h2>
<p>The questions are based on the official ${esc(name)} driver handbook. Read it too:</p>
<div class="card"><ul>
${hb.en ? `<li><a href="${esc(hb.en)}" rel="nofollow noopener">${esc(name)} driver handbook (English)</a></li>` : ''}${hb.es ? `\n<li><a href="${esc(hb.es)}" rel="nofollow noopener" hreflang="es">${esc(name)} driver handbook (Español)</a></li>` : ''}
</ul></div>` : '';

  const agency = info.agency ? `the ${esc(name)} driver license agency (${esc(info.agency)})` : `any ${esc(name)} state agency`;
  const body = `<h1>${esc(name)} Permit Practice Test</h1>
<p class="lead">Free practice for the ${esc(name)} learner's permit knowledge test. Every question can be read aloud, with each word highlighted as it is spoken. A wrong answer is never a penalty: you get a hint and try again.</p>
<a class="bigbtn" href="../../?state=${code}">Start practicing</a>
${examHtml}<h2>Practice questions</h2>
<p>${total} practice questions for ${esc(name)}: ${own.length} about ${esc(name)} rules and ${national.length} about signs, signals and markings that are the same in every state. Free: every question, hints and read-aloud. No sign-up.</p>
${langHtml}
<h2>5 sample questions</h2>
${sampleHtml}
<a class="bigbtn" href="../../?state=${code}">Start practicing</a>
${hbHtml}
<p class="foot">PermitVoice is independent. It is not affiliated with, endorsed by or connected to ${agency}. Always check the official handbook. All questions are written in our own words.<br><a href="../">All states</a> · <a href="../../">PermitVoice home</a></p>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `PermitVoice — ${name} Permit Practice Test`,
    url: canonical,
    description: desc,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    inLanguage: langs.map(L => L.code),
    isAccessibleForFree: true,
    educationalUse: 'practice',
    audience: { '@type': 'EducationalAudience', educationalRole: 'student' },
    about: { '@type': 'Thing', name: `${name} learner's permit knowledge test` },
    offers: {
      '@type': 'Offer', price: '0', priceCurrency: 'USD',
      description: 'All practice questions, hints, read-aloud and languages are free. An optional one-time upgrade per state is planned (unlimited full practice tests, score history, review pack).'
    }
  };
  return shell({ title, desc, canonical, ld, body, up: '../../',
    alt: { en: canonical, es: `${canonical}es/` }, sw: { href: 'es/', lang: 'es', label: 'Español' } });
}

function indexPage() {
  const all = Object.keys(STATES).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const items = all.map(c => codes.includes(c)
    ? `<li><a href="${c.toLowerCase()}/">${esc(nameOf(c))} <small>${byScope[c].length + national.length} questions</small></a></li>`
    : `<li><span class="soon">${esc(nameOf(c))} <small>coming soon</small></span></li>`).join('\n');
  const title = 'Permit Practice Test by State — Free, Read Aloud, English & Spanish | PermitVoice';
  const desc = 'Free learner\'s permit practice tests for every US state, read aloud in English and Spanish, with hints. Pick your state.';
  const canonical = `${SITE}/s/`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, description: desc,
    isAccessibleForFree: true,
    hasPart: codes.map(c => ({ '@type': 'WebPage', name: `${nameOf(c)} Permit Practice Test`, url: `${SITE}/s/${c.toLowerCase()}/` }))
  };
  const body = `<h1>Permit Practice Test by State</h1>
<p class="lead">Free practice for the learner's permit knowledge test, read aloud, in English, Español and more. Pick your state.</p>
<ul class="states">
${items}
</ul>
<p class="foot">PermitVoice is independent. It is not affiliated with, endorsed by or connected to any state driver license agency.<br><a href="../">PermitVoice home</a></p>`;
  return shell({ title, desc, canonical, ld, body, up: '../',
    alt: { en: canonical, es: `${canonical}es/` }, sw: { href: 'es/', lang: 'es', label: 'Español' } });
}

/* ---------- Spanish pages (s/<xx>/es/, s/es/) ----------
   Same facts as the English page, from the same inputs; only the wording is Spanish (plain US Spanish, "usted",
   like the app). The app has no ?lang= parameter: it opens in Spanish when the phone is set to Spanish or the learner
   chose it before, so the page tells the learner where to pick "Español". */
// The usual Spanish names, where they differ from the English name. Every other state keeps its English name.
const ES_NAMES = {
  DC: 'Distrito de Columbia', HI: 'Hawái', LA: 'Luisiana', MS: 'Misisipi', MO: 'Misuri', NH: 'Nuevo Hampshire',
  NJ: 'Nueva Jersey', NM: 'Nuevo México', NY: 'Nueva York', NC: 'Carolina del Norte', SC: 'Carolina del Sur',
  ND: 'Dakota del Norte', SD: 'Dakota del Sur', OR: 'Oregón', PA: 'Pensilvania', WV: 'Virginia Occidental'
};
const nameEs = c => ES_NAMES[c] || nameOf(c);
const deEs = c => (c === 'DC' ? 'del ' : 'de ') + nameEs(c); // "de Florida", "del Distrito de Columbia"
const EnEs = c => (c === 'DC' ? 'En el ' : 'En ') + nameEs(c); // sentence start: "En Florida"

function examLinesEs(info) {
  const e = info.exam || {}, lines = [];
  if (e.questions != null) lines.push(`${e.questions} preguntas de opción múltiple.`);
  if (e.pass != null && e.questions != null) lines.push(`Para aprobar necesita ${e.pass} respuestas correctas${e.passPercent != null ? ` (${e.passPercent}%)` : ''}.`);
  else if (e.pass != null) lines.push(`Para aprobar necesita ${e.pass} respuestas correctas.`);
  else if (e.passPercent != null) lines.push(`Para aprobar necesita el ${e.passPercent}% de respuestas correctas.`);
  return lines;
}

function statePageEs(code) {
  const info = INFO[code] || { code, name: nameOf(code), exam: {}, handbook: {} };
  const name = nameEs(code), de = deEs(code), slug = code.toLowerCase();
  const own = byScope[code] || [], all = own.concat(national), total = all.length;
  const langs = LANGS.filter(L => !L.states || L.states.includes(code));
  const full = langs.filter(L => all.every(q => q[L.code]));
  const partial = langs.filter(L => !full.includes(L) && all.some(q => q[L.code]));
  const enOnly = EN_ONLY.has(code), e = info.exam || {};
  const enUrl = `${SITE}/s/${slug}/`, canonical = `${enUrl}es/`;
  const title = `Examen de práctica del permiso de manejo ${de} — Gratis, en español y en voz alta | PermitVoice`;
  let desc = `Examen de práctica gratis para el permiso de manejo ${de}: ${total} preguntas en español e inglés, leídas en voz alta, con pistas. Sin registro.`;
  if (desc.length >= 160) desc = `Práctica gratis para el permiso de manejo ${de}: ${total} preguntas en español e inglés, en voz alta, con pistas.`;
  if (desc.length >= 160) throw new Error(code + ': Spanish description too long');

  const exam = examLinesEs(info);
  const examHtml = exam.length || enOnly || e.spanish === true ? `<h2>El examen de conocimientos ${esc(de)}</h2>
<div class="card"><ul>
${exam.map(l => `<li>${esc(l)}</li>`).join('\n')}${e.spanish === true && !enOnly ? `\n<li>El estado también ofrece el examen en español.</li>` : ''}
</ul></div>
${enOnly ? `<p class="notice">${esc(EnEs(code))}, el examen de conocimientos se da solo en inglés. Si practica en español o en otro idioma, PermitVoice muestra las palabras en inglés debajo de cada pregunta y respuesta, para que aprenda las palabras que verá en el examen.</p>\n` : ''}` : '';

  const langHtml = `<h2>Idiomas</h2>
<div class="card"><ul>
<li>Todas las preguntas: ${full.map(langSpan).join(', ')}.</li>${partial.length ? `
<li>Las ${national.length} preguntas nacionales (señales, semáforos y marcas en el pavimento) también en ${partial.map(langSpan).join(', ')}. En estos idiomas, las preguntas ${esc(de)} se muestran en inglés por ahora.</li>` : ''}
</ul></div>`;

  const sampleHtml = samples(code).map((q, i) => `<div class="q">
<h3>${i + 1}. ${esc(q.es.q)}</h3>
<ol type="A">
${q.es.o.map((o, k) => `<li${k === q.c ? ' class="right"' : ''}>${esc(o)}${k === q.c ? ' (respuesta correcta)' : ''}</li>`).join('\n')}
</ol>
<p class="ans"><b>Respuesta: ${'ABCD'[q.c]}.</b> ${esc(q.es.h2)}</p>${q.ref && q.ref.page != null && q.scope === code ? `\n<p class="ref">Manual ${esc(de)}, página ${esc(q.ref.page)}.</p>` : ''}
</div>`).join('\n');

  const hb = info.handbook || {};
  const hbHtml = hb.en || hb.es ? `<h2>Manual oficial</h2>
<p>Las preguntas se basan en el manual oficial de manejo ${esc(de)}. Léalo también:</p>
<div class="card"><ul>
${hb.es ? `<li><a href="${esc(hb.es)}" rel="nofollow noopener">Manual de manejo ${esc(de)} (en español)</a></li>` : ''}${hb.es && hb.en ? '\n' : ''}${hb.en ? `<li><a href="${esc(hb.en)}" rel="nofollow noopener" hreflang="en">Manual de manejo ${esc(de)} (en inglés)</a></li>` : ''}
</ul></div>` : '';

  const agency = info.agency ? `la agencia de licencias de conducir ${esc(de)} (${esc(info.agency)})` : `ninguna agencia estatal ${esc(de)}`;
  const body = `<h1>Examen de práctica del permiso de manejo ${esc(de)}</h1>
<p class="lead">Práctica gratis para el examen de conocimientos del permiso de aprendiz ${esc(de)}. Puede escuchar cada pregunta en voz alta, y cada palabra se resalta mientras se lee. Una respuesta incorrecta nunca es un castigo: recibe una pista y vuelve a intentarlo.</p>
<a class="bigbtn" href="../../../?state=${code}&amp;lang=es">Empezar a practicar</a>
${examHtml}<h2>Preguntas de práctica</h2>
<p>${total} preguntas de práctica para ${esc(name)}: ${own.length} sobre las reglas ${esc(de)} y ${national.length} sobre señales, semáforos y marcas en el pavimento que son iguales en todos los estados. Gratis: todas las preguntas, las pistas y la lectura en voz alta. Sin registro.</p>
${langHtml}
<h2>5 preguntas de ejemplo</h2>
${sampleHtml}
<a class="bigbtn" href="../../../?state=${code}&amp;lang=es">Empezar a practicar</a>
${hbHtml}
<p class="foot">PermitVoice es independiente. No está afiliado, respaldado ni relacionado con ${agency}. Consulte siempre el manual oficial. Todas las preguntas están escritas con nuestras propias palabras.<br><a href="../../es/">Todos los estados</a> · <a href="../../../">Página principal de PermitVoice</a></p>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `PermitVoice — Examen de práctica del permiso de manejo ${de}`,
    url: canonical,
    description: desc,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    inLanguage: langs.map(L => L.code),
    isAccessibleForFree: true,
    educationalUse: 'practice',
    audience: { '@type': 'EducationalAudience', educationalRole: 'student' },
    about: { '@type': 'Thing', name: `Examen de conocimientos del permiso de aprendiz ${de}` },
    offers: {
      '@type': 'Offer', price: '0', priceCurrency: 'USD',
      description: 'Todas las preguntas de práctica, las pistas, la lectura en voz alta y los idiomas son gratis. Se planea una mejora opcional de pago único por estado (exámenes de práctica completos ilimitados, historial de resultados y un paquete de repaso).'
    }
  };
  return shell({ title, desc, canonical, ld, body, up: '../../../', lang: 'es',
    alt: { en: enUrl, es: canonical }, sw: { href: '../', lang: 'en', label: 'English' } });
}

function indexPageEs() {
  const all = Object.keys(STATES).sort((a, b) => nameEs(a).localeCompare(nameEs(b), 'es'));
  const items = all.map(c => codes.includes(c)
    ? `<li><a href="../${c.toLowerCase()}/es/">${esc(nameEs(c))} <small>${byScope[c].length + national.length} preguntas</small></a></li>`
    : `<li><span class="soon">${esc(nameEs(c))} <small>próximamente</small></span></li>`).join('\n');
  const title = 'Examen de práctica del permiso de manejo por estado — Gratis, en español | PermitVoice';
  const desc = 'Exámenes de práctica gratis para el permiso de aprendiz de cada estado de EE. UU., en español e inglés, leídos en voz alta, con pistas. Elija su estado.';
  if (desc.length >= 160) throw new Error('s/es: description too long');
  const enUrl = `${SITE}/s/`, canonical = `${enUrl}es/`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, description: desc,
    inLanguage: 'es', isAccessibleForFree: true,
    hasPart: codes.map(c => ({ '@type': 'WebPage', name: `Examen de práctica del permiso de manejo ${deEs(c)}`, url: `${SITE}/s/${c.toLowerCase()}/es/` }))
  };
  const body = `<h1>Examen de práctica del permiso de manejo por estado</h1>
<p class="lead">Práctica gratis para el examen de conocimientos del permiso de aprendiz, en voz alta, en español, inglés y otros idiomas. Elija su estado.</p>
<ul class="states">
${items}
</ul>
<p class="foot">PermitVoice es independiente. No está afiliado, respaldado ni relacionado con ninguna agencia estatal de licencias de conducir.<br><a href="../../">Página principal de PermitVoice</a></p>`;
  return shell({ title, desc, canonical, ld, body, up: '../../', lang: 'es',
    alt: { en: enUrl, es: canonical }, sw: { href: '../', lang: 'en', label: 'English' } });
}

/* ---------- Output ---------- */
const files = {};
for (const c of codes) {
  files[`s/${c.toLowerCase()}/index.html`] = statePage(c);
  files[`s/${c.toLowerCase()}/es/index.html`] = statePageEs(c);
}
files['s/index.html'] = indexPage();
files['s/es/index.html'] = indexPageEs();
files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by tools/build-pages.js. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[`${SITE}/`, `${SITE}/s/`, `${SITE}/s/es/`].concat(codes.flatMap(c => [`${SITE}/s/${c.toLowerCase()}/`, `${SITE}/s/${c.toLowerCase()}/es/`])).map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
files['robots.txt'] = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

// Page folders under s/ that no longer have a state (for example a state whose questions were all held again).
const sDir = path.join(root, 's');
const extra = fs.existsSync(sDir) ? fs.readdirSync(sDir).filter(d => /^[a-z]{2}$/.test(d) && d !== 'es' && !files[`s/${d}/index.html`]) : [];

console.log('state pages', codes.length, '(+ Spanish', codes.length + ')', '|', codes.join(' '));
if (check) {
  const stale = Object.keys(files).filter(f => { const p = path.join(root, f); return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== files[f]; });
  for (const d of extra) stale.push(`s/${d}/ (no longer generated)`);
  console.log(stale.length ? 'pages are stale: ' + stale.join(', ') : 'pages are current');
  process.exit(stale.length ? 1 : 0);
}
for (const [f, content] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
  fs.writeFileSync(path.join(root, f), content);
}
for (const d of extra) fs.rmSync(path.join(sDir, d), { recursive: true });
console.log('wrote', Object.keys(files).length, 'files' + (extra.length ? ', removed s/' + extra.join(', s/') : ''));
