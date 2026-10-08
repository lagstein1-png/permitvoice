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
  async function page(geo, locale = 'en-US') {
    const ctx = await b.newContext({ locale, geolocation: geo, permissions: geo ? ['geolocation'] : [], viewport: { width: 375, height: 740 } });
    await ctx.addInitScript(() => { window.__spoken = []; const real = window.speechSynthesis;
      if (real) { const orig = real.speak.bind(real); real.speak = u => { window.__spoken.push(u.text); try { orig(u); } catch (e) {} }; } });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(url); return p;
  }
  // 1. Location: Miami → Florida (suggest, confirm)
  let p = await page({ latitude: 25.76, longitude: -80.19 });
  await p.selectOption('#selState', 'TX');
  ok(await p.isVisible('#btnNational'), 'Texas shows "coming soon" + national practice, not Florida questions');
  await p.click('#btnGeo'); await p.waitForSelector('#geoDlg[open]');
  ok((await p.textContent('#geoText')).includes('Florida'), 'Miami is detected as Florida, as a question');
  ok(await p.$eval('#selState', s => s.value) === 'TX', 'state does not change before the user confirms');
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
  const opts = await p.$$eval('.opt span', s => s.map(x => x.textContent));
  const wrongI = opts.findIndex(o => o !== right), rightI = opts.indexOf(right);
  await p.click(`.opt[data-i="${wrongI}"]`);
  ok(await p.isVisible('.hintbox') && await p.isVisible('.tag'), 'wrong answer in practice → "Almost" + hint');
  await p.click(`.opt[data-i="${rightI}"]`);
  ok(await p.isVisible('.praise') && await p.isVisible('#btnNext'), 'right answer → praise + next');
  // 4. Spanish
  await p.click('#btnBack'); await p.click('[data-lang="es"]');
  ok((await p.textContent('#btnStart')).match(/aprend/i) !== null, 'Spanish interface');
  await p.click('#btnStart'); await p.waitForSelector('.opt');
  const esOk = await p.evaluate(() => window.PV_BANK.some(x => x.es.q === document.querySelector('#qtitle').textContent));
  ok(esOk, 'Spanish question shown');
  // 5. Exam: 50 questions, one try, result
  await p.click('#btnBack'); await p.click('[data-lang="en"]');
  ok((await p.textContent('#btnExam')).includes('50'), 'Florida practice test has 50 questions');
  await p.click('#btnExam');
  for (let i = 0; i < 50; i++) { await p.waitForSelector('.opt:not([disabled])'); await p.click('.opt[data-i="0"]'); await p.click('#btnNext'); }
  ok(/of 50 correct/.test(await p.textContent('.result')), 'exam ends with a result of 50');
  ok(await p.isVisible('#btnHome'), 'result has a way home');
  // 6. Mistakes
  await p.click('#btnHome');
  ok(await p.isVisible('#btnMist'), 'mistakes review appears after wrong answers');
  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
