// Smoke test for the PermitVoice prototype: real browser, mocked location.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(p)] || 'text/plain' }); r.end(b); } }); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
srv.listen(0, async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  const errs = [];
  async function page(geo, locale = 'en-US', opt = {}) {
    const ctx = await b.newContext({ locale, geolocation: geo, permissions: geo ? ['geolocation'] : [], viewport: { width: 375, height: 740 } });
    if (opt.init) await ctx.addInitScript(opt.init, opt.arg);
    // A stand-in voice: records what is said and finishes each part, like a phone would.
    await ctx.addInitScript(() => { window.__spoken = []; const real = window.speechSynthesis;
      if (real) { real.speak = u => { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 5); }, 5); }; } });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(url + (opt.path || '')); return p;
  }
  // 1. Location: Miami → Florida (suggest, confirm)
  let p = await page({ latitude: 25.76, longitude: -80.19 });
  // A state with no checked (served) questions yet shows "coming soon". Picked from the bank, so it keeps working as states are checked.
  const soon = await p.evaluate(() => { const served = new Set(window.PV_BANK.map(q => q.scope));
    return [...document.querySelectorAll('#selState option')].map(o => o.value).find(v => /^[A-Z]{2}$/.test(v) && v !== 'US' && !served.has(v)) || null; });
  const other = soon || 'AZ';
  await p.selectOption('#selState', other);
  if (soon) ok(await p.isVisible('#btnNational'), `${soon} (no checked questions yet) shows "coming soon" + national practice, not Florida questions`);
  else console.log('SKIP every state has checked questions: no "coming soon" state left to test');
  await p.click('#btnGeo'); await p.waitForSelector('#geoDlg[open]');
  ok((await p.textContent('#geoText')).includes('Florida'), 'Miami is detected as Florida, as a question');
  ok(await p.$eval('#selState', s => s.value) === other, 'state does not change before the user confirms');
  await p.click('#geoYes');
  ok(await p.$eval('#selState', s => s.value) === 'FL', 'confirming switches to Florida');
  ok(!(await p.evaluate(() => JSON.stringify(localStorage))).includes('25.76'), 'coordinates are not stored');
  // 2. Border cities
  for (const [lat, lon, want] of [[33.75, -84.39, 'Georgia'], [30.33, -81.66, 'Florida'], [30.69, -88.04, 'Alabama'], [38.90, -77.04, 'District of Columbia'], [40.71, -74.0, 'New York']]) {
    const q = await page({ latitude: lat, longitude: lon }); await q.click('#btnGeo'); await q.waitForSelector('#geoDlg[open]');
    ok((await q.textContent('#geoText')).includes(want), `${lat},${lon} → ${want}`); await q.context().close();
  }
  const out = await page({ latitude: 48.85, longitude: 2.35 }); await out.click('#btnGeo'); await out.waitForTimeout(500);
  ok((await out.textContent('#geoNote')).includes('outside'), 'Paris → outside the 50 states message'); await out.context().close();
  // 3. Practice flow
  await p.click('#btnStart'); await p.waitForSelector('.opt');
  const right = await p.evaluate(() => { const q = window.PV_BANK.find(x => x[document.documentElement.lang] && document.querySelector('#qtitle').textContent === x.en.q); return q ? q.en.o[q.c] : null; });
  ok(!!right, 'question text matches the bank');
  await p.waitForTimeout(400);
  const q1 = await p.textContent('#qtitle');
  ok((await p.evaluate(() => window.__spoken)).some(x => x.startsWith(q1)), 'question is read aloud as soon as it appears');
  await p.evaluate(() => { window.__spoken = []; }); await p.click('#btnPlay'); await p.waitForTimeout(400);
  const said = await p.evaluate(() => window.__spoken.join(' | '));
  ok(said.includes(q1) && said.includes('1. '), 'Read button reads the question and the numbered options');
  // Word following: drive the voice's boundary events by hand and watch the highlight move.
  const follow = await p.evaluate(async () => {
    const real = window.speechSynthesis, seen = [];
    real.speak = u => { setTimeout(() => { u.onstart && u.onstart();
      const words = []; u.text.replace(/\S+/g, (w, at) => words.push(at));
      words.forEach(at => { u.onboundary && u.onboundary({ name: 'word', charIndex: at });
        const on = document.querySelector('.kw.on'); seen.push(on ? on.textContent : null); });
      u.onend && u.onend(); }, 0); };
    real.cancel = () => {}; Object.defineProperty(real, 'speaking', { get: () => false, configurable: true });
    document.getElementById('btnPlay').click(); if (document.getElementById('btnPlay').classList.contains('playing')) {} 
    await new Promise(r => setTimeout(r, 600));
    const q = document.getElementById('qtitle').textContent.split(/\s+/).filter(Boolean);
    return { seen, q, left: document.querySelectorAll('.kw.on').length };
  });
  ok(follow.seen.slice(0, follow.q.length).join(' ') === follow.q.join(' '), 'highlight follows each spoken word of the question');
  ok(follow.seen.some(x => /^\d\.$/.test(x || '')) === false && follow.seen.filter(Boolean).length > follow.q.length, 'options are followed too, without highlighting the spoken number');
  ok(follow.left === 0, 'no highlight left after reading ends');
  const opts = await p.$$eval('.opt .otext', s => s.map(x => x.textContent));
  const wrongI = opts.findIndex(o => o !== right), rightI = opts.indexOf(right);
  await p.click(`.opt[data-i="${wrongI}"]`);
  ok(await p.isVisible('.hintbox') && await p.isVisible('.tag'), 'wrong answer in practice → "Almost" + hint');
  await p.click(`.opt[data-i="${rightI}"]`);
  ok(await p.isVisible('.praise') && await p.isVisible('#btnNext'), 'right answer → praise + next');
  // Handbook page: shown for Florida, matching the bank.
  const refOk = await p.evaluate(() => {
    const qt = document.getElementById('qtitle').textContent, q = window.PV_BANK.find(x => x.en.q === qt);
    const r = document.querySelector('.ref'); const shown = r ? r.textContent : '';
    if (!q.ref) return shown === '';
    return q.ref.page ? shown.includes('page ' + q.ref.page) : shown.includes('Florida law');
  });
  ok(refOk, 'handbook page shown after a Florida answer matches the bank');
  // 4. Spanish
  await p.click('#btnBack'); await p.click('[data-lang="es"]');
  ok((await p.textContent('#btnStart')).match(/aprend/i) !== null, 'Spanish interface');
  await p.click('#btnStart'); await p.waitForSelector('.opt');
  const esOk = await p.evaluate(() => window.PV_BANK.some(x => x.es.q === document.querySelector('#qtitle').textContent));
  ok(esOk, 'Spanish question shown');
  // 4b. More languages: Arabic is right-to-left, Chinese shows its own text, English is shown under it for Florida.
  await p.click('#btnBack'); await p.click('[data-lang="ar"]');
  ok(await p.evaluate(() => document.documentElement.dir === 'rtl'), 'Arabic switches the page to right-to-left');
  await p.click('[data-lang="zh"]');
  ok(await p.evaluate(() => document.documentElement.dir === 'ltr'), 'leaving Arabic switches back to left-to-right');
  ok(await p.isVisible('#chkEn'), 'Florida in Chinese: English-only test notice with the "show English" switch');
  await p.click('#btnStart'); await p.waitForSelector('.opt');
  const zhOk = await p.evaluate(() => { const t = document.getElementById('qtitle').textContent;
    const q = window.PV_BANK.find(x => x.zh && x.zh.q === t); const en = document.getElementById('qen');
    return !!q && !!en && en.textContent === q.en.q && document.querySelectorAll('.opt .en2').length === 4; });
  ok(zhOk, 'Chinese question shown with the English question and options under it');
  // 4c. Haitian Creole is offered for Florida only.
  await p.click('#btnBack');
  ok(await p.isVisible('[data-lang="ht"]'), 'Haitian Creole is offered for Florida');
  await p.click('[data-lang="ht"]'); await p.click('#btnStart'); await p.waitForSelector('.opt');
  ok(await p.evaluate(() => window.PV_BANK.some(x => x.ht && x.ht.q === document.getElementById('qtitle').textContent)), 'Creole question shown');
  await p.click('#btnBack'); await p.selectOption('#selState', 'TX');
  ok(!(await p.isVisible('[data-lang="ht"]')) && await p.evaluate(() => document.documentElement.lang === 'en'), 'Creole is not offered for Texas, and the app falls back to English');
  await p.selectOption('#selState', 'FL');
  // 5. Exam: 50 questions, one try, result
  await p.click('[data-lang="en"]');
  ok((await p.textContent('#btnExam')).includes('50'), 'Florida practice test has 50 questions');
  await p.click('#btnExam');
  for (let i = 0; i < 50; i++) { await p.waitForSelector('.opt:not([disabled])'); await p.click('.opt[data-i="0"]'); await p.click('#btnNext'); }
  ok(/of 50 correct/.test(await p.textContent('.result')), 'exam ends with a result of 50');
  ok(await p.isVisible('#btnHome'), 'result has a way home');
  // 6. Mistakes
  await p.click('#btnHome');
  ok(await p.isVisible('#btnMist'), 'mistakes review appears after wrong answers');
  // 7. Paid upgrade switched off (UPGRADE empty): no buy button, no daily limit.
  ok(!(await p.isVisible('#btnUpgrade')), 'upgrade not on sale yet: no buy button');
  await p.click('#btnExam'); await p.waitForSelector('.opt', { timeout: 5000 });
  ok(!(await p.isVisible('#limitScr')), 'upgrade not on sale yet: a second practice test the same day still starts');
  await p.click('#btnBack');
  // 8. Landing pages link with ?state=XX.
  const lp = await page(undefined, 'en-US', { path: '?state=NY' });
  ok(await lp.$eval('#selState', s => s.value) === 'NY' && await lp.evaluate(() => localStorage.getItem('pv:state')) === '"NY"', '?state=NY selects and stores New York');
  await lp.context().close();
  const lp2 = await page(undefined, 'en-US', { path: '?state=ZZ' });
  ok(await lp2.$eval('#selState', s => s.value) === 'FL', '?state=ZZ (not a state) is ignored');
  await lp2.context().close();
  // 9. Paid upgrade switched on through the test hook (read only on 127.0.0.1), Worker mocked.
  try {
  const up = await page(undefined, 'en-US', { path: '?state=NY', init: () => { window.PV_UPGRADE_TEST = { checkout: { NY: 'https://shop.example/buy-ny' }, worker: 'https://worker.example/' }; } });
  const sent = [];
  await up.route('https://worker.example/**', async r => { const body = JSON.parse(r.request().postData() || '{}'); sent.push(body);
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body.key === 'GOOD-KEY' && body.state === 'NY' ? { ok: true, state: 'NY' } : { ok: false }) }); });
  ok(await up.isVisible('#btnUpgrade'), 'upgrade on sale: home offers it');
  ok(!(await up.isVisible('#hist')) && !(await up.isVisible('#btnWeak')), 'free learner: no score history or weak-topics pack');
  const nEx = +(await up.textContent('#btnExam')).match(/\d+/)[0];
  await up.click('#btnExam');
  for (let i = 0; i < nEx; i++) { await up.waitForSelector('.opt:not([disabled])'); await up.click('.opt[data-i="0"]'); await up.click('#btnNext'); }
  await up.click('#btnHome');
  await up.click('#btnExam');
  ok(await up.isVisible('#limitScr'), 'second practice test the same day shows the friendly limit screen');
  ok(!(await up.isVisible('.opt')), 'the second test does not start');
  await up.click('#btnBack'); await up.click('#btnStart'); await up.waitForSelector('.opt');
  ok(true, 'practice is never limited');
  await up.click('#btnBack'); await up.click('[data-lang="es"]'); await up.click('#btnExam');
  ok(/mañana/i.test(await up.textContent('#limitScr')), 'limit screen in Spanish');
  await up.click('#btnBack'); await up.click('[data-lang="zh"]'); await up.click('#btnExam');
  const zhLim = await up.textContent('#limitScr');
  ok(/tomorrow/i.test(zhLim) && !/undefined/.test(zhLim), 'Chinese has no upgrade text yet: falls back to English, nothing breaks');
  await up.click('#btnBack'); await up.click('[data-lang="en"]');
  await up.click('#btnUpgrade', { timeout: 5000 });
  const upTxt = await up.textContent('#upScr');
  ok(upTxt.includes('9.99') && upTxt.includes('New York') && /no subscription/i.test(upTxt), 'upgrade screen: $9.99 one-time for the state, no subscription');
  ok(await up.$eval('#btnBuy', a => a.href === 'https://shop.example/buy-ny' && a.target === '_blank'), 'Buy opens the state checkout in a new tab');
  await up.fill('#licKey', 'BAD-KEY'); await up.click('#btnCheck'); await up.waitForFunction(() => document.getElementById('licMsg').textContent.length > 0);
  ok(!(await up.evaluate(() => localStorage.getItem('pv:license:NY'))), 'a key the Worker rejects does not unlock');
  await up.fill('#licKey', ' GOOD-KEY '); await up.click('#btnCheck'); await up.waitForSelector('#badge');
  ok(sent.some(x => x.key === 'GOOD-KEY' && x.state === 'NY'), 'the key (trimmed) and state are sent to the Worker');
  ok(!!(await up.evaluate(() => localStorage.getItem('pv:license:NY'))), 'a key the Worker accepts unlocks New York');
  await up.click('#btnBack');
  ok(await up.isVisible('#badge') && !(await up.isVisible('#btnUpgrade')), 'unlocked: small badge, no more offer');
  ok((await up.$$('#hist li')).length === 1 && /of \d+/.test(await up.textContent('#hist')), 'score history lists the finished test');
  await up.click('#btnExam'); await up.waitForSelector('.opt');
  ok(!(await up.isVisible('#limitScr')), 'unlocked: unlimited practice tests');
  await up.click('#btnBack');
  ok(await up.isVisible('#btnWeak'), 'unlocked: "Practice my weak topics" offered');
  await up.click('#btnWeak'); await up.waitForSelector('.opt');
  const weak = await up.evaluate(() => { const n = +document.getElementById('pill').textContent.match(/of (\d+)/)[1];
    return { n, hasHint: !!document.getElementById('btnHint') }; });
  ok(weak.n > 0 && weak.n <= 20 && weak.hasHint, 'weak-topics pack: up to 20 questions, practice mode with hints');
  await up.context().close();
  } catch (e) { ok(false, 'upgrade flow stopped: ' + e.message.split('\n')[0]); }
  // Small phone (320px): the home screen must not scroll sideways. Florida has the most language buttons (7).
  for (const lg of ['en', 'ar']) {
    const n = await page(undefined, 'en-US', { path: '?state=FL&lang=' + lg }); await n.setViewportSize({ width: 320, height: 640 }); await n.waitForTimeout(200);
    ok(await n.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `320px wide, ${lg}: no sideways scrolling on the home screen`);
    await n.context().close();
  }
  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
