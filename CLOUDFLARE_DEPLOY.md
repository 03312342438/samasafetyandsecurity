# Deploying to your own Cloudflare account (Wrangler)

This app is built with TanStack Start and already compiles to a Cloudflare
Worker. The build emits a ready-to-use Worker config at
`dist/server/wrangler.json` (with `nodejs_compat` enabled). You do **not** need
to write a `wrangler.toml` by hand.

## Why admin rights & old data "disappeared" on Cloudflare

When you deploy elsewhere, two different sets of config are involved:

| Config | Used by | Baked in at... |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | the browser (sign-in) | **build time** (already in the bundle) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, … | the **Worker** (your profile, admin role, reports) | **runtime** — must be set as Worker secrets |

Signing in worked because the public keys were already in the bundle. But the
server functions that load your **admin role** and your **saved reports** run on
the Worker and read `process.env.SUPABASE_URL` / `process.env.SUPABASE_PUBLISHABLE_KEY`.
Those were never set on your Worker, so those calls failed — making it look like
you had no admin rights and no data. The data was always safe in the database.

> Both your Lovable deployment and your Cloudflare deployment talk to the **same
> database**. Use the same Supabase values in both, and the same data appears.

## One-command deploy

```bash
# 1. Log in to Cloudflare once
npx wrangler login

# 2. Add your own database values
cp .env.cloudflare.example .env.cloudflare   # then fill it in

# 3. Build the current app + push secrets + update sama.safetyportal.workers.dev
bash scripts/deploy-cloudflare.sh
```

The script sets the **required** secrets (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`) plus any optional ones it finds, then runs
`wrangler deploy`. It accepts either the standard names or the secure-form names
`APP_SUPABASE_URL`, `APP_SUPABASE_PUBLISHABLE_KEY`, and
`APP_SUPABASE_SERVICE_ROLE_KEY`, and maps them automatically.

The script also pins the generated configuration to the existing `sama` Worker.
This matters because deploying under the generated package name creates a second
Worker while `sama.safetyportal.workers.dev` continues showing the old app.

## Manual deploy (if you prefer)

```bash
bun run build

# Required — admin rights + data depend on these:
echo "<your VITE_SUPABASE_URL value>"             | npx wrangler secret put SUPABASE_URL             -c dist/server/wrangler.json
echo "<your VITE_SUPABASE_PUBLISHABLE_KEY value>" | npx wrangler secret put SUPABASE_PUBLISHABLE_KEY -c dist/server/wrangler.json

npx wrangler deploy -c dist/server/wrangler.json
```

## Optional secrets (only for some features)

| Secret | Needed for | Note |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | creating/deleting employees, seeding the hidden admin | **Not retrievable on Lovable Cloud.** Leave unset if you don't have it — admin rights & data still work. |
| `HIDDEN_ADMIN_EMAIL` / `HIDDEN_ADMIN_PASSWORD` | auto-seeding the hidden admin on a fresh DB | Only used when the service-role key is set. Your existing admin already lives in the DB. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | emailing reports | |
| `LOVABLE_API_KEY` | AI features | |

## Renaming the Worker

The Worker name defaults to `tanstack-start-ts` (from `package.json`). To change
it, rename the package or edit the generated `dist/server/wrangler.json` `name`
field before deploying. Keep the name stable so your secrets stay attached.

## Troubleshooting

- **Still no admin rights / no data:** confirm the two required secrets are set:
  `npx wrangler secret list -c dist/server/wrangler.json`. They must match your
  Lovable project's Supabase URL and publishable key exactly.
- **Sign-in works but everything else 500s:** the build was made without the
  `VITE_*` values in `.env`. Rebuild with `.env` present, then redeploy.
- **The page still has the old appearance:** make sure
  `CLOUDFLARE_WORKER_NAME=sama`, then run only
  `bash scripts/deploy-cloudflare.sh`. The script builds first and updates the
  same Worker URL, so the current navy sidebar and current program are deployed.
