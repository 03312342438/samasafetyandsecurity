# Switch the whole app to YOUR OWN Supabase project

This makes your **self-hosted Cloudflare deployment** the real app, backed by
**your own Supabase project** — with full service-role/admin power and your own
data. (The Lovable preview at `*.lovable.app` stays on Lovable Cloud and can't
be repointed; that's expected.)

You'll need three things from your Supabase project
(**Project Settings → API**, and **Project Settings → General**):

| Name              | Where to find it                              |
| ----------------- | --------------------------------------------- |
| Project URL       | API → Project URL                             |
| Publishable / anon key | API → Project API keys → `anon` / `publishable` |
| Service role key  | API → Project API keys → `service_role` (secret) |
| Project ref / ID  | General → Reference ID                         |

---

## Step 1 — Create the database schema

1. Open your Supabase project → **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/SETUP_OWN_PROJECT.sql`](supabase/SETUP_OWN_PROJECT.sql).
3. Click **Run**. This creates all tables, roles, RLS policies, and functions.

## Step 2 — Enable email auth

Supabase → **Authentication → Providers → Email** → make sure it's enabled.
(Turn off "Confirm email" if you want admins to create employees that can log
in immediately.)

## Step 3 — Fill in your keys locally

```bash
cp .env.cloudflare.example .env.cloudflare
```

Open `.env.cloudflare` and paste your values (URL, publishable key, service
role key, project ref). This file is private and never committed.

## Step 4 — Deploy

```bash
npx wrangler login            # one time
bash scripts/deploy-cloudflare.sh
```

The script builds the site against **your** Supabase, pushes the server secrets
to your Worker, and deploys.

## Step 5 — First sign-in

- The hidden admin (`HIDDEN_ADMIN_EMAIL` / `HIDDEN_ADMIN_PASSWORD` from your
  `.env.cloudflare`) is auto-seeded on first load of the sign-in page, because
  the service-role key is now present.
- Sign in with it → you'll have full admin rights on your own project.

---

### Notes
- **Existing Lovable Cloud data does not transfer.** You start fresh on your
  project. If you need the old data moved, export it from the backend and
  re-import — tell me and I can help script that.
- Keep `.env.cloudflare` secret. The service-role key bypasses all security.
