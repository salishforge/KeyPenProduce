# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Key Pen Produce — a full-stack web app for a local produce reseller (replacing the
GoDaddy site at keypenproduceexpress.com). One codebase serves two audiences:

- **Customer storefront** (`/shop`, `/cart`, `/orders`): browse the week's produce,
  reserve product + quantity, view an invoice, pay online or at pickup.
- **Business portal**: `admin` (`/admin/*`) manages suppliers/products/availability,
  commits orders, generates per-supplier wholesale sheets, reconciles pickups, and
  views finance; `fulfillment` (`/desk/*`) runs the pickup desk.

The order lifecycle is the core: **hold → committed → active → completed**.

## Stack

- **React Router v7** (framework mode, SSR) on **Cloudflare Workers**. Worker entry:
  `workers/app.ts` (exports `fetch` + `scheduled`). SSR entry: `app/entry.server.tsx`
  (Web Streams renderer — required on Workers).
- **D1** (SQLite) via **Drizzle ORM**; schema in `app/db/schema/*`, migrations in
  `drizzle/migrations/`.
- **R2** for product images (`PRODUCT_IMAGES`), **KV** (`CONFIG_KV`), **Cron Triggers**
  (`app/cron/`).
- **better-auth** (`app/auth/auth.server.ts`): email/password + Google + Facebook.
  New users default to role `client`; admins promote to `fulfillment`/`admin`.
- **Stripe** ("online + manual"): invoices at commit (`app/stripe/stripe.server.ts`),
  webhook reconciliation (`app/stripe/webhook.server.ts`), in-person card via shared
  QR link, cash marked manually.
- **Resend** for transactional email (`app/email/resend.server.ts`).
- **Tailwind v4** (`@tailwindcss/vite`) + a small component kit (`app/components/ui/*`);
  brand palette mapped to `@theme` tokens in `app/app.css` (legacy classes coexist).
- **AI product-admin agent** on **Workers AI** (no third-party key): a per-user Durable
  Object `ProductAdminAgent` (`app/agents/product-admin.ts`) runs a Vercel-AI-SDK
  tool-calling loop (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` via `workers-ai-provider`)
  over the shared catalog tools. Roles: `client`/`fulfillment`/`admin`/`product_admin`.

## Commands

```bash
npm run dev            # vite dev server (http://localhost:5173)
npm run build          # production build (react-router build)
npm run typecheck      # react-router typegen + wrangler types + tsc --noEmit
npm test               # vitest (unit + integration on the Workers pool)
npx vitest run test/oversell.test.ts   # a single test file
npm run test:e2e       # Playwright E2E (boots dev server)
npm run db:generate    # generate a Drizzle migration after editing app/db/schema/*
npm run db:migrate:local   # apply migrations to local D1
npm run deploy         # build + wrangler deploy
```

After editing `app/db/schema/*`, run `npm run db:generate` then `db:migrate:local`.
After editing `wrangler.jsonc` or route modules, types come from
`npx wrangler types` + `npx react-router typegen` (both run by `npm run typecheck`).

## Architecture notes (non-obvious, span multiple files)

- **Reserve-on-submit + oversell guard.** The cart is a client-side cookie
  (`app/services/cart.server.ts`); inventory is only locked when the order is
  submitted. `placeOrder` in `app/services/ordering.ts` reserves each line with a
  single conditional `UPDATE ... WHERE quantityReserved + qty <= quantityAvailable`
  (`reserveListingQuantity`) that also flips the listing to `sold_out` atomically.
  Order submit is all-or-nothing: if any line loses the race, already-reserved lines
  are released. This is the key invariant — see `test/oversell.test.ts`.
- **Money + time conventions.** All amounts are **integer cents** (`app/lib/money.ts`);
  timestamps are UTC epoch millis stored via Drizzle `timestamp_ms`, displayed/reasoned
  in `America/Los_Angeles` (`app/lib/time.ts`).
- **Price/cost snapshots.** Listings and reservations snapshot price + wholesale cost so
  historical P&L stays correct when product defaults change. Margin/P&L is derived from
  reservation snapshots; the append-only ledger (`app/services/ledger.ts`,
  `ledger_entries`) records actual cash.
- **Ordering-allowed predicate** (`orderingAllowed` in `app/services/ordering.ts`) is
  server-authoritative: open window, OR closed window with a stay-open listing / global
  reopen / unexpired per-user override.
- **Commit → reconcile flow.** `commitWindow` (`app/services/commit.ts`) confirms orders,
  raises Stripe invoices, emails customers, records expected revenue.
  `generateSupplierSheets` + `reconcileWindow` (`app/services/reconcile.ts`) build
  per-supplier sheets and allocate received quantity **FIFO** by reservation time;
  short lines get `shortfall` status + a refund (issued via Stripe when already paid).
- **Stripe webhook is the source of truth** for online payment — never the client
  redirect. Idempotent via the `webhook_events` table.
- **Sales tax** is exempt (produce); `taxCents` exists in the schema (default 0) so it
  can be enabled later without a migration.

## AI product-admin agent (non-obvious)

- **One shared catalog write path.** `app/services/catalog.ts` is the single place
  suppliers/products/listings/windows are created/updated (it owns `slugify` +
  `parseDollarsToCents`). Both the manual admin forms AND the AI tools call it, so they
  can never drift. Money crosses the AI tool boundary as **dollar strings** ("3.50");
  units/statuses are `z.enum(...)` from the schema constants.
- **Agent routing + auth.** `workers/app.ts` routes `/agents/*` to the per-user DO
  (`idFromName(userId)`) only after `getSessionUser` confirms `admin`/`product_admin`;
  verified identity is forwarded via `x-kpp-user-*` headers, never trusted from the body.
  The DO class is re-exported from `workers/app.ts` (required for the wrangler migration).
- **Auto-apply + undo.** Writes apply immediately and record an inverse op in
  `catalog_undo_log` (`app/services/undo.ts`); the `undo_last` tool / "Undo last" button
  reverts the most recent change (refuses if customers have since reserved).
- **Spreadsheet import.** `/api/catalog-import` parses CSV (`parseCsv` in `app/lib/csv.ts`)
  or XLSX (SheetJS) in the Worker; the assistant page feeds a preview to the agent, which
  maps columns, asks clarifying questions, and applies via `bulk_import`.
- **Real-time availability.** `app/components/live-poll.tsx` (`useRevalidator`) re-runs the
  availability loader on an interval so reserved counts update live.
- **Testing the agent.** Don't test through the model — call each tool's `execute` directly
  (`test/agent-tools.test.ts`). We deliberately avoided the `agents`/`@cloudflare/ai-chat`
  packages (they force zod v4, conflicting with better-auth/drizzle) and rolled the DO.

## Toolchain gotcha (important)

The `cloudflare()` plugin uses **`remoteBindings: false`** (`vite.config.ts`) so `npm run dev`
boots without a Cloudflare login — Workers AI (`env.AI`) is remote-only and would otherwise
force a login-gated proxy at startup. Locally the assistant's model calls no-op (handled
gracefully); they work once deployed (or after `wrangler login`). The catalog forms,
storefront, and the rest of the admin all run locally regardless.


The build only works with React Router's `future.v8_viteEnvironmentApi: true`
(`react-router.config.ts`) — this routes the build through the `@cloudflare/vite-plugin`
integrated path. Do **not** enable `v8_middleware`: it switches loader `context` to the
new provider API and breaks the `context.cloudflare.env` access used throughout. The
toolchain is pinned to a known-good set (React Router 7.16, `@cloudflare/vite-plugin`
1.47.0, **Vite 6** — Vite 8/rolldown currently fails to bundle better-auth's deps).
`shims/kysely.ts` patches a broken `kysely` re-export pulled in by better-auth's unused
kysely-adapter; keep the alias in `vite.config.ts`.

**Keep vitest and `@cloudflare/vitest-pool-workers` in lockstep.** The pool peer-depends
on an exact vitest major (v0.18 → vitest 4), so bumping one alone makes `npm install`
fail to resolve on a clean clone even though an existing `node_modules` keeps working.
The v3→v4 move also changed two things worth remembering: pool options left
`test.poolOptions.workers` for the `cloudflareTest()` Vite plugin (`vitest.config.ts`),
and the implicit `isolatedStorage` rollback is gone — `test/apply-migrations.ts` now
calls `reset()` + `applyD1Migrations` in a `beforeEach` to give each test a clean D1.
`cloudflare:test`'s `env` is typed as `Cloudflare.Env` now, so test-only bindings are
declared by merging into that interface (`test/env.d.ts`), not the removed `ProvidedEnv`.

E2E: set `PLAYWRIGHT_CHROMIUM_PATH` to use a pre-installed Chromium when the sandbox's
build predates the one Playwright wants; unset, Playwright resolves its own browser.

## Secrets

Local dev reads `.dev.vars` (gitignored). Production uses `wrangler secret put` for:
`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`. Bindings
(`DB`, `PRODUCT_IMAGES`, `CONFIG_KV`) and IDs live in `wrangler.jsonc` — the D1/KV ids
are placeholders that must be set to real resources before deploy.
