# CareScript Engineering Audit

**Audit date:** 2026-11-25
**Scope:** repository, connected Supabase project `vcceikmnjiksvixednlk`, deployed Edge Functions, available automated checks. No patient row contents, prescription documents, conversation contents, secrets, or auth identifiers were inspected.

## Initial condition

The active product is a Vite/React/TypeScript application using Supabase Auth, PostgreSQL with RLS, private Supabase Storage, Supabase Edge Functions, and Gemini. Firebase client/authentication and Identity Platform blocking-function code still existed in the repository, but no active frontend module imported the Firebase client. Existing migration notes had conditioned their removal on a verified Google OAuth/profile/AI workflow, so only the independently unused Firebase web SDK module and package were removed after confirming no references.

The repo had substantial staged and unstaged restructuring from earlier work. Those changes were preserved. Local SQL migration history did not fully match the live migration history: the live project contained separately applied RPC migrations that were absent locally. That is a reproducibility risk and remains to be reconciled before a fresh-project bootstrap can be treated as deterministic.

## Findings and remediation

| Severity | Finding | Evidence / effect | Action |
|---|---|---|---|
| High | Unused Firebase web SDK had four high npm audit findings via Firestore/gRPC dependencies. | No frontend references existed outside `frontend/src/lib/firebase.ts`; active auth is Supabase. | Removed the dead Firebase client module and frontend dependency. Frontend audit now reports zero advisories. Legacy Firebase Functions remain separately isolated pending verified account cutover; their package audit reports eight moderate advisories and they still require Identity Platform/Blaze if deployed. |
| High | App RPCs inherited PostgreSQL's default PUBLIC execute permission. | Live permission check showed `anon EXECUTE=true` for the patient RPCs before remediation. Function bodies were SECURITY INVOKER and used `auth.uid()`, with RLS ownership checks, limiting impact, but the permissions were broader than intended. | Applied and checked in `20261125154000_authenticated_rpc_grants.sql`; all app RPCs now show `anon EXECUTE=false`, `authenticated EXECUTE=true`; trigger-only helper is not executable by either role. RLS remains enabled. |
| Medium | Extraction ignored Postgres errors while marking work and saving AI output. | `extract-prescription` awaited writes without checking their `error` field and could return success despite failed persistence. | Added checked writes; extraction now returns an error if state or result persistence fails. |
| Medium | Extraction reported the configured Gemini model even when fallback served the request. | Shared Gemini client already returned the model that produced the response. | Extraction now persists and returns that actual model. |
| Medium | Server-side extraction trusted metadata more than the client validation path. | Client validated size and magic bytes; function did not independently enforce those checks before base64 encoding and forwarding to Gemini. | Function now validates UUID, supported MIME, downloaded size (10 MiB), and PDF/PNG/JPEG signatures server-side; output structure is bounded and errors avoid raw exception text. Storage bucket also has a 10 MiB limit and allowed MIME list. |
| Medium | Live security advisor reports leaked-password protection disabled. | Supabase security advisor, checked after migration, returned `auth_leaked_password_protection` WARN. | No Auth settings-management tool was available in this session. Enable in Supabase Auth password security settings before production email/password use. |
| Medium | End-to-end and integration coverage is much narrower than the feature set. | E2E suite contains one auth-screen smoke test; live tests include anonymous probes and optional two-user/Gemini tests. | Matrix updated with explicit skips/blocks. No fabricated OAuth, CRUD, Gemini, file upload, or cross-user pass claims. |
| Medium | Product-level accessibility and performance have not been measured end-to-end. | No axe/WCAG automation or authenticated mobile/browser journey was available. Build gives bundle measurements but not real-user metrics. | Recorded limitations and useful next checks in final evaluation. |
| Low | Root migration history is not a complete, clean bootstrap representation of the live project. | Live project has multiple migration entries not present as equivalent local files; selected auth migration timestamps/names also differ. | No automatic re-baselining was attempted because that can create dangerous replay/drop behavior. Reconcile against a clean disposable Supabase project before claiming one-command setup. |
| Low | Supabase performance advisor reports four unused indexes. | Low current row counts make these inconclusive; dropping them could harm future query paths. | Kept indexes; re-evaluate with representative data and query plans. |

## Architecture and data protection observations

- Frontend auth is Supabase Auth with PKCE, persistent sessions, automatic token refresh, and OAuth callback handling. Firebase code is not imported by the active frontend.
- Edge Functions use `verify_jwt=true`, separately call Supabase Auth `getUser` on the bearer token, and use a user-scoped anonymous-key client rather than a service-role key.
- Public application tables had RLS enabled. Ownership policies use `auth.uid()` and join child records through parent ownership. Prescription storage is private and scoped by the first path segment to the signed-in user's UUID.
- Product RPCs are SECURITY INVOKER with a fixed `public` search path and now require the authenticated role at the grant layer as well as row-level ownership checks.
- `ai-buddy` limits prompt length to 2,000 characters, fetches health context only for recognized personal-medication questions, limits queried records, disables Gemini storage, and logs request IDs/stages without prompt contents.
- Prescription AI results are stored as `review_required`; confirmation remains a separate patient action. No extraction is treated as verified medication data by the AI function.
- Both functions currently use wildcard CORS. Since requests require explicit bearer JWTs and no cookie credentials are used, this is not an authentication bypass; restricting browser origins is still a hardening opportunity once the production hostname is finalized.
- No regulatory or clinical-compliance claim is made.

## Verified live state and limitations

- Connected Supabase project was active and healthy at inspection.
- Both `ai-buddy` (v10) and `extract-prescription` (v6 after remediation) are active with JWT verification enabled.
- Security advisor currently has one warning: leaked-password protection disabled. Health advisor returned no findings. Performance advisor listed four unused indexes.
- RLS and RPC access were inspected without reading patient values. Existing data is present, so no destructive database test or migration replay was attempted.
- `npm run test:live` executed anonymous/invalid-token probes successfully. Tests requiring dedicated test users were skipped because the four `SUPABASE_TEST_USER_*` variables are absent.
- Google OAuth, signed-in profile edits, two-user data isolation, real Gemini after this release, prescription upload/extraction, and authenticated reminder/settings workflows were not re-tested in this pass.
