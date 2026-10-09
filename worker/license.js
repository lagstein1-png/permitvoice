// PermitVoice license Worker (Cloudflare Workers, ES module, no npm, no build step).
//
// One job: POST /validate with JSON {key, state}  ->  {ok:true, state} or {ok:false}.
// It asks Lemon Squeezy's License API whether the key is valid, then checks that the key
// belongs to OUR store and to the product sold for THAT state.
//
// Nothing secret is in this file. Settings come from the Worker's environment variables:
//   LS_STORE_ID   your Lemon Squeezy store ID, e.g. "123456"
//   LS_PRODUCTS   JSON map of state -> product ID, e.g. {"FL":"111111","TX":"222222"}
// The License API needs no API key: the license key itself is the credential.
//
// This Worker is separate from bekol's tutor-api Worker and lives in its own Cloudflare account.

const LS_VALIDATE = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const ALLOWED_ORIGINS = ['https://permitvoice.pages.dev'];
const CACHE_SECONDS = 600; // Same key + state asked again within 10 minutes: answered from cache.

function corsHeaders(origin) {
  // Only the app may call this from a browser: the live site, and http://localhost (any port) for testing.
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin || '');
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}

function reply(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), { status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin), ...extra } });
}

// Asks Lemon Squeezy. Returns true only for a valid key from our store, for the product of `state`.
async function checkWithLemonSqueezy(key, state, env) {
  let products = {};
  try { products = JSON.parse(env.LS_PRODUCTS || '{}'); } catch (e) { return { error: 'LS_PRODUCTS is not valid JSON' }; }
  const wantProduct = products[state];
  if (!env.LS_STORE_ID || !wantProduct) return { valid: false }; // Not on sale for this state.

  const r = await fetch(LS_VALIDATE, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ license_key: key }),
  });
  if (r.status === 429 || r.status >= 500) return { error: 'Lemon Squeezy busy (' + r.status + ')' };
  // An unknown key comes back as 404 with {valid:false, error:"..."}; that is a normal "no".
  let data = null;
  try { data = await r.json(); } catch (e) { return { error: 'Lemon Squeezy reply was not JSON' }; }
  const meta = (data && data.meta) || {};
  const status = data && data.license_key && data.license_key.status; // active | inactive | expired | disabled
  const valid = !!(data && data.valid) && status !== 'disabled' && status !== 'expired'
    && String(meta.store_id) === String(env.LS_STORE_ID)
    && String(meta.product_id) === String(wantProduct);
  return { valid };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname !== '/validate') return reply({ ok: false, error: 'not found' }, 404, origin);
    if (request.method !== 'POST') return reply({ ok: false, error: 'use POST' }, 405, origin);

    // Small, strict input: a key of sensible length and a two-letter state code.
    let body = null;
    try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch (e) {}
    const key = String((body && body.key) || '').trim();
    const state = String((body && body.state) || '').toUpperCase();
    if (!/^[A-Za-z0-9-]{8,100}$/.test(key) || !/^[A-Z]{2}$/.test(state)) return reply({ ok: false }, 400, origin);

    // Cache the answer for a while, so a learner tapping "Check" again does not reach Lemon Squeezy
    // every time (their License API allows 60 requests a minute). The cache key is a hash, not the key.
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state + ':' + key)))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const cacheKey = new Request('https://cache.permitvoice.invalid/' + hash);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) { const v = await hit.json(); return reply(v.valid ? { ok: true, state } : { ok: false }, 200, origin); }

    let res;
    try { res = await checkWithLemonSqueezy(key, state, env); } catch (e) { res = { error: 'network' }; }
    if (res.error) return reply({ ok: false, retry: true }, 503, origin); // App says "try again"; not cached.

    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify({ valid: res.valid }),
      { headers: { 'Cache-Control': 'max-age=' + CACHE_SECONDS } })));
    return reply(res.valid ? { ok: true, state } : { ok: false }, 200, origin);
  },
};
