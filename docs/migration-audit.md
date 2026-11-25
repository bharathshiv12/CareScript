# CareScript Authentication Migration Audit

## Target and scope

CareScript now routes frontend authentication through Supabase Auth, uses Supabase UUIDs for database ownership, and enforces user scope through `auth.uid()` RLS. No Firebase project, user, or data was deleted. Supabase migration files and the applied project migration history are versioned separately from this audit.

## Repository inventory

| Area | Current state |
|---|---|
| Frontend login, registration, reset, session restore, logout | Supabase Auth SDK in `frontend/src/lib/supabase.ts`; UI in `frontend/src/components/AuthScreen.tsx`; auth listener in `frontend/src/context/CareScriptContext.tsx` |
| OAuth callback | PKCE code exchange in `frontend/src/components/auth/OAuthCallback.tsx`; redirect errors return to the sign-in screen |
| User ownership | Frontend writes use `user_id`; database policies and RPCs use Supabase Auth UUIDs |
| RLS and Storage | Enabled on all CareScript tables; private prescription-object paths are scoped to the authenticated UUID |
| Edge Functions | `ai-buddy` and `extract-prescription` use Supabase Auth token verification and are deployed with `verify_jwt=true` |
| Gemini | API calls remain server-side in `supabase/functions/_shared/gemini.ts`; `GEMINI_API_KEY` is read from Edge Function secrets |
| Legacy Firebase | The unused frontend Firebase client module and dependency were removed after confirming there were no active frontend imports. `backend/firebase-functions/`, `firebase.json`, `.firebaserc`, and historical Firebase migrations remain isolated as legacy artifacts pending verification of Google OAuth and account cutover. The legacy function package has 8 moderate npm audit advisories and requires Identity Platform/Blaze for its blocking handlers. |
| Secrets | Browser config uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; OAuth client secrets and Gemini keys are not frontend variables |

## Live database record counts

At the migration preflight and immediately after it, the CareScript application tables and prescription Storage bucket were empty. On the latest read-only count-only recount (2026-11-25), user-owned app data exists. No record contents or identifiers were read. This later data must not be treated as migrated Firebase identity data without a verified mapping.

| Entity | Current rows |
|---|---:|
| `profiles` | 1 |
| `user_settings` | 1 |
| `prescriptions` | 0 |
| `prescription_extractions` | 0 |
| `medications` | 2 |
| `medication_schedules` | 2 |
| `scheduled_doses` | 62 |
| `dose_audit_logs` | 0 |
| `conversations` | 1 |
| `chat_messages` | 4 |
| `notifications` | 0 |
| Prescription Storage objects | 0 |
| Supabase Auth identities | 1 (email provider) |

The Firebase Auth directory was not inspected. Any Firebase account and any data outside the connected Supabase project still require a separately verified identity mapping before migration.

## Database migration and access controls

The applied SQL migration stops if existing CareScript rows or prescription files exist, drops the Firebase-claim policies, changes ownership fields to UUID, adds the `auth.users`/profile relationships, rewrites the existing SECURITY INVOKER RPCs, and installs per-user RLS and Storage policies. RLS was verified enabled on all listed public tables. A live schema check found zero public RPCs that still reference `firebase_uid` or the Firebase JWT helper. Supabase `service_role` is not used by browser or Edge Function code.

No existing Supabase patient records were rewritten or deleted by this audit. Existing profile, medication, schedule, dose, and chat rows were counted only; their values were not read or modified.

## Verified checks

- `npm run check`: typecheck, lint, and 12/12 unit tests passed.
- `npm run build`: passed; React and Supabase vendor chunks are split; no chunk-size warning.
- `npm run test:e2e`: one auth-screen smoke test passed, including OAuth error handling and absence of the demo login. It does not perform a Google login or cloud-data CRUD.
- `npm run test:live`: unauthenticated Postgres, Storage, malformed-token, and Edge Function probes passed. Two-user RLS CRUD and real Gemini response checks are skipped until dedicated test accounts are configured.
- Live RPC inspection found product function grants were inherited by `anon`; migration `authenticated_rpc_grants` was applied and verified to restrict the application RPCs to `authenticated`.
- Google OAuth has not been verified end to end in this audit.

## Remaining actions for deployment verification

1. Enable Google in Supabase Auth with the Google Cloud OAuth Web client ID/secret. Add Supabase's displayed callback URI to Google Cloud's authorized redirect URIs; allow local `http://localhost:5173/auth/callback` and the eventual production callback in Supabase Auth URL configuration.
2. Confirm `GEMINI_API_KEY` exists in Supabase Edge Function Secrets by running the live authenticated AI test. The key is never requested or printed.
3. Configure two dedicated Supabase email test accounts locally as `SUPABASE_TEST_USER_A_*` and `SUPABASE_TEST_USER_B_*`, then rerun `npm run test:live` to verify CRUD and isolation.
4. After OAuth/account cutover is verified, decide whether to retire the isolated Firebase Functions deployment files and project. Do not remove the Firebase project or historical migration records without separately checking its user directory and deployed resources.
