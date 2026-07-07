# Deploying Key Pen Produce to Cloudflare

> **Live:** the core deploy is up at **https://keypenproduce.john-2bb.workers.dev**
> (D1 migrated, `BETTER_AUTH_SECRET` set, demo catalog seeded, cron trigger active).
> To finish: sign up at `/signup` with your email, then re-run
> `npm run seed:remote -- you@example.com` to promote yourself to admin.

Scope of this runbook: **core** — email/password auth + the Workers AI product-admin
assistant. Stripe, Google/Facebook OAuth, and Resend are optional and safely skipped when
their secrets are unset; add them later with `wrangler secret put`.

The Cloudflare resources already exist in the account and are wired into `wrangler.jsonc`:

| Resource | Name | ID / note | Binding |
| --- | --- | --- | --- |
| D1 | `keypenproduce-db` | `e0d75187-2d2d-4676-9c2c-bab55b8e2f3e` | `DB` |
| KV | `keypenproduce-config` | `50bb32726ff5442196a8596b52448969` | `CONFIG_KV` |
| R2 | `keypenproduce-images` | — | `PRODUCT_IMAGES` |
| Workers AI | — | no key needed | `AI` |
| Durable Object | `ProductAdminAgent` | created on first deploy | `PRODUCT_ADMIN_AGENT` |

## 0. Prerequisites

Node 20+, then authenticate `wrangler` one of two ways:

```bash
npx wrangler login                                   # interactive, OR
export CLOUDFLARE_API_TOKEN=…  CLOUDFLARE_ACCOUNT_ID=…
```

## 1. Get the code

```bash
git fetch origin claude/new-session-EsIBE
git checkout claude/new-session-EsIBE
npm install
```

## 2. Apply DB migrations to remote D1

Applies `0000_init` and `0001_catalog_undo_log`:

```bash
npm run db:migrate:remote
```

## 3. Set the only required secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" \
  | npx wrangler secret put BETTER_AUTH_SECRET
```

## 4. First deploy

```bash
npm run deploy
```

Note the printed URL: `https://keypenproduce.<your-subdomain>.workers.dev`.

## 5. Point `APP_URL` at that origin, then redeploy

better-auth uses `APP_URL` as its `baseURL` for cookies/CSRF — it **must** match the live
origin. Edit `wrangler.jsonc`:

```jsonc
"vars": {
  "APP_URL": "https://keypenproduce.<your-subdomain>.workers.dev",
  "APP_TIMEZONE": "America/Los_Angeles"
}
```

```bash
npm run deploy
```

## 6. Create your admin login

Open the deployed URL → `/signup`, register with your email + a password.

## 7. Seed catalog + promote yourself to admin

One run does both — inserts 2 suppliers, 32 products, and one open "Preview Week" window, and
sets your user's role to `admin`:

```bash
npm run seed:remote -- you@example.com
```

(The email must already have signed up in step 6 for the promotion to take effect.)

## 8. Smoke test

- `/` (landing), `/shop` (the week's produce), `/login`.
- Sign in → `/admin` (catalog) and the AI assistant page; ask it **"list the suppliers"** — it
  should call the catalog tools and answer. Workers AI runs server-side via the `AI` binding
  once deployed.

## Later (optional)

- **Custom domain:** add a Workers route for `keypenproduceexpress.com`, then set `APP_URL` to
  it and redeploy.
- **Payments / email / social login:** `npx wrangler secret put STRIPE_SECRET_KEY` (and
  `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `FACEBOOK_CLIENT_ID`/`SECRET`,
  `RESEND_API_KEY`, `EMAIL_FROM`).
