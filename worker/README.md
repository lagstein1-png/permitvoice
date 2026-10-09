# License Worker

Checks a PermitVoice license key with Lemon Squeezy. The code is `license.js`. No secret is in it.

Use a **separate Cloudflare account**, not bekol's (owner decision, `CLAUDE.md`). Bekol's Worker `tutor-api` is never used for PermitVoice.

## What you need first (from Lemon Squeezy)

1. **Store ID**: Lemon Squeezy → Settings → Stores. The number next to your store.
2. **One product per state** ("PermitVoice Florida", US$9.99, single payment), with **License keys** turned on (no activation limit needed, no expiry).
   For each one write down the **product ID** (Products → open the product → the number in the address bar, or the ID shown on the page).
3. **The checkout link** for each product: Products → Share → copy the link (`https://<store>.lemonsqueezy.com/buy/...`).

## Create the Worker (about ten clicks)

1. Go to https://dash.cloudflare.com and sign in to the **PermitVoice** account (create a new account if needed, with a different email from bekol's).
2. Left menu: **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**.
3. Name: `permitvoice-license`. Click **Deploy** (it deploys a "Hello World").
4. Click **Edit code**. Delete everything in `worker.js`, paste all of `license.js`, click **Deploy**.
5. Back on the Worker page: **Settings** → **Variables and Secrets** → **Add**:
   - Type **Text**, name `LS_STORE_ID`, value: your store ID, for example `123456`.
   - Type **Text**, name `LS_PRODUCTS`, value: the product ID of each state, as JSON, for example `{"FL":"111111"}`.
     Add a state here when you add its product: `{"FL":"111111","TX":"222222"}`.
   Click **Deploy**.
6. Copy the Worker's address from the top of its page, for example `https://permitvoice-license.yourname.workers.dev`.

No API key is needed: Lemon Squeezy's License API checks the key itself.

## Switch the upgrade on in the app

Give these to whoever edits `index.html` (near the top of the script):

```js
const UPGRADE = {
  checkout: { FL: 'https://<store>.lemonsqueezy.com/buy/<id>' },
  worker: 'https://permitvoice-license.yourname.workers.dev'
};
```

Then bump `CACHE` in `sw.js` and push. While `UPGRADE` stays empty, nothing is sold and nobody is limited.
A state is limited (one free practice test a day) only when it has a checkout link here.

## Check it works

Buy once in Lemon Squeezy's **test mode**, paste the key in the app ("I already have a license key"). It should say the state is unlocked.
A key for another state, or a key from another store, is refused.
