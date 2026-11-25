# CareScript

CareScript helps patients organize prescriptions, medication schedules, dose tracking, and safe educational medication questions. It uses Supabase Auth (Google OAuth and optional email/password), PostgreSQL with RLS, private Supabase Storage, Supabase Edge Functions, and Google Gemini.

## Stack

- React, TypeScript, and Vite frontend (`frontend/`)
- Supabase Auth and PostgreSQL with row level security (`supabase/migrations/`)
- Authenticated Edge Functions: `ai-buddy` and `extract-prescription`
- Gemini API called only from Edge Functions
- Explicit local sample demo mode

## Local setup

Requirements: Node.js 20+, npm 10+, and Chrome/Edge for browser E2E. For local Supabase emulation, also install Docker and the Supabase CLI.

```bash
npm install
npm --prefix frontend install
Copy-Item .env.example .env.local
```

Set these public client values in root `.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Only public keys belong in `VITE_*`. Set the Gemini API key in Supabase Edge Function secrets:

```bash
npx supabase secrets set GEMINI_API_KEY="<key>" --project-ref vcceikmnjiksvixednlk
npx supabase secrets set GEMINI_MODEL="gemini-3.8-flash" --project-ref vcceikmnjiksvixednlk
```

## Google OAuth configuration

1. In Supabase Dashboard → Authentication → Providers → Google, enable Google and save the OAuth Web client ID and secret.
2. Use the callback URL displayed by Supabase as the Google OAuth client's authorized redirect URI.
3. In Google Cloud Console, authorize the app origin for local development (`http://localhost:5173`) and your eventual production origin.
4. In Supabase Authentication → URL Configuration, set the Site URL to `https://carescript-chi.vercel.app`. Add these exact Redirect URLs: `https://carescript-chi.vercel.app/auth/callback` and `http://localhost:5173/auth/callback`. Supabase must allow each `redirectTo` URL or it falls back to the Site URL.
5. Configure the same `VITE_SUPABASE_URL` and publishable/anon key for the production build environment.

Email/password confirmation and password recovery links return through `/auth/callback`. If email signup is enabled, configure SMTP in Supabase for reliable delivery.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run frontend against configured Supabase project |
| `npm run dev:frontend` | Start Vite |
| `npm run dev:backend` | Start local Supabase and Edge Functions when Docker and CLI are available |
| `npm run build` | Create the production frontend bundle |
| `npm run check` | Typecheck, lint, and unit tests |
| `npm test` | Run the unit test suite directly |
| `npm run test:e2e` | Chromium auth-screen smoke test; does not sign into Google or exercise signed-in workflows |
| `npm run test:live` | Anonymous request and optional authenticated RLS/Gemini checks against cloud Supabase |

To run authenticated live checks, provision two dedicated Supabase email test accounts and set `SUPABASE_TEST_USER_A_EMAIL`, `SUPABASE_TEST_USER_A_PASSWORD`, `SUPABASE_TEST_USER_B_EMAIL`, and `SUPABASE_TEST_USER_B_PASSWORD` in `.env.local`. The tests create/update their CareScript profile rows; use dedicated test accounts.

## Vercel frontend deployment setup

The Vercel project should use the `frontend/` directory as its Root Directory. Vercel will install the frontend dependencies, run `npm run build`, and publish the generated `dist/` directory. Add these environment variables to the Vercel project for the environments where the frontend will run:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

These are public browser configuration values; never add a Supabase service-role key, Gemini key, Google OAuth client secret, or other server credential to Vercel `VITE_*` variables. Configure Google OAuth's authorized origins and Supabase callback/site URLs for the assigned production domain in their respective dashboards. Supabase Edge Functions and database migrations are managed separately from the Vercel frontend build; follow the current audit and migration checklist before changing the connected project.

## Security and data migration

Every cloud request uses the signed-in Supabase Auth JWT. Edge Functions verify JWTs, then validate user identity with Supabase Auth; database access remains user-scoped and RLS stays enabled. No service-role key is used in browser code. The migration refuses to run if existing CareScript records or prescription files are present, because Firebase IDs cannot safely be converted to Supabase UUIDs without an explicit identity map.

The migration was applied to the connected project after confirming its CareScript patient tables, Supabase Auth users, and prescription Storage objects were empty. This does not inspect any separate Firebase Auth user directory. Existing Firebase users must sign in with their Google identity to create a new Supabase Auth account; there is no automatic Firebase UID transfer.

See [the migration audit](docs/migration-audit.md) for live counts, repository inventory, verification results, and outstanding setup.
