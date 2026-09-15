# Robust Gifting Solutions

B2B corporate gifting CRM/ERP. Manage a customer from first enquiry through fulfilment, invoice, and payment.

## Stack

Next.js 16, TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, Storage, RLS).

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env`.

Admin-created portal client logins also require the **server-only** variable `SUPABASE_SERVICE_ROLE_KEY`. Never prefix this key with `NEXT_PUBLIC_`. On Vercel, add it under Project Settings → Environment Variables (Production).

Password recovery uses the request host (`http://localhost:3000` locally, the Vercel production origin in production). `resetPasswordForEmail` sets `redirectTo` to `/reset-password`. Query tokens (`code`, `token_hash`) are exchanged once at `/auth/confirm`; hash tokens are handled on `/reset-password`.

Request a reset from the same environment you will open the email in. A localhost request produces a localhost link; a production request produces a production link.

In the Supabase dashboard, Authentication → URL Configuration must include:

- Site URL: the production origin (the site origin, not `/login`)
- Redirect URLs:
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/reset-password`
  - `<production origin>/auth/confirm`
  - `<production origin>/reset-password`

Optional wildcards if needed: `http://localhost:3000/**` and `<production origin>/**`.

Reset password email template (Authentication → Email Templates → Reset password) should use the token-hash confirm link so recovery does not depend on a PKCE cookie from the original browser:

```html
<h2>Reset your password</h2>
<p>Follow the link below to choose a new password.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a></p>
```

Open http://localhost:3000

## Database

`supabase/schema.sql` is the complete baseline: tables, constraints, indexes, functions, triggers,
RLS policies, storage buckets and grants. The dated files in `supabase/migrations/` are the
incremental history; every change in them is already folded into the baseline.

## Demo users

Seeded Auth users for the demo environment (developer reference — not shown on the production login screen).

Password for all demo users: `Robust-Demo-2026!`

- `admin@robustgifting.demo` — Admin
- `sales@robustgifting.demo` — Sales
- `ops@robustgifting.demo` — Operations
- `accounts@robustgifting.demo` — Accounts
- `management@robustgifting.demo` — Management
- `procurement@robustgifting.demo` — Operations (Procurement)
- `printing@robustgifting.demo` — Operations (Printing)
- `logistics@robustgifting.demo` — Operations (Logistics)
- `priya@wipro.example` — Client Admin (Wipro)
- `rahul@nexora.example` — Client Admin (Nexora)

These are demo-only credentials for a demo dataset. Rotate them before any production use.

## Deploy

Repository: https://github.com/VIAayush/robust-gifting-crm

Vercel project: **Robust Gifting CRM**
