# CareScript Final Engineering Evaluation

**Evaluation date:** 2026-11-25
**Scope:** current repository state and checks listed in [the functional test matrix](../tests/functional-test-matrix.md). This is an engineering readiness score, not a clinical, regulatory, or external hackathon result.

## Scoring method

Each category is scored from 0 to 100 as a weighted checklist of implementation evidence and test evidence. The score reflects what was verified in this audit, not the amount of code present. Missing live proof loses points even where the source appears correct. The overall score is the unweighted arithmetic mean of the six category scores. A score is not a certification or a promise of another evaluator's result.

| Category | Score | Basis |
|---|---:|---|
| Code quality | 78 | TypeScript, lint, and 12 unit tests pass; active frontend Firebase SDK removed. Lost points for large components, incomplete migration reproducibility, and sparse workflow tests. |
| Security | 78 | RLS/ownership policies and authenticated Edge Functions verified; RPC grants hardened; frontend audit clear. Lost points for disabled leaked-password protection, no two-user live isolation test, unverified OAuth, wildcard CORS, and dormant Firebase dependencies with moderate advisories. |
| Efficiency | 77 | Lazy route/component chunks and production split build; current largest chunks are 223.08 kB React and 230.49 kB Supabase, 69.17/60.05 kB gzip. Lost points because no real-user performance profile, request-rate measurement, or representative-data query plan was run. |
| Testing | 50 | 12/12 unit tests, one E2E smoke test, and two live anonymous security checks passed. Authenticated feature suites, provider test, and cross-user tests were unavailable. |
| Accessibility | 52 | The app uses React controls and some semantic/accessible labels, but WCAG 2.2 AA, keyboard-only, screen-reader, contrast, and mobile checks were not completed. |
| Problem alignment | 68 | The codebase includes the requested prescription, medication, dose, reminder, profile, dashboard, and AI modules with review-required prescription extraction. The complete registration-to-dose workflow was not verified against a signed-in account in this pass. |

**Overall: 67.2/100** (mean of category scores above). This reflects meaningful security and maintainability improvements, with live user journeys still unproven.

## Category assessment

### Code quality — 78/100

- **Initial issues:** stale Firebase auth client/dependency remained despite no active frontend imports; extraction save errors were ignored; model fallback reporting could be inaccurate; local/live migration histories differ; largest UI/service/context modules remain substantial.
- **Implemented:** removed the unused Firebase web module and package after confirming there were no frontend imports; checked extraction persistence results, actual provider model, bounded file type/size/signature, UUID input, output shape, and redacted error logs; documented migration drift.
- **Evidence:** `npm run check` passed TypeScript, ESLint/secret-hygiene, and 12/12 unit tests; Edge Function TS sources parsed with esbuild.
- **Remaining:** Firebase Functions deployment code remains as an isolated legacy path; its package audit has eight moderate advisories. Component refactoring should be driven by dedicated behavioral tests, not done wholesale in this pass.

### Security — 78/100

- **Initial issues:** public execute inheritance on app RPCs; no independent server-side prescription file bounds/signature checks; leaked-password protection advisor warning; two-user isolation credentials absent.
- **Implemented:** applied `authenticated_rpc_grants` migration; live permission check confirms all ten app RPCs are denied to `anon` and executable by `authenticated`, while `set_updated_at` is not callable by either. Extraction validation now repeats critical checks server-side. Active frontend dependency audit is clean.
- **Evidence:** all inspected application tables had RLS enabled and ownership policies; product RPCs were SECURITY INVOKER and use `auth.uid()`; both deployed functions require JWTs and validate user tokens; live anonymous/invalid-token database, storage, and function probes passed.
- **Remaining:** Supabase Auth leaked-password protection is disabled; no dedicated two-user test; Google OAuth was not reauthenticated; CORS permits any origin (bearer token still required); no regulatory/security certification is claimed.

### Efficiency — 77/100

- **Initial issues:** prior matrix described a >500 kB warning, and actual app profiling/query plans were missing.
- **Implemented/evidence:** current build has code-split views and a no-warning production build. Largest chunks are React 223.08 kB (69.17 kB gzip) and Supabase 230.49 kB (60.05 kB gzip); feature chunks are individually smaller. Performance advisor's four unused indexes were reviewed and retained because the live dataset is too small to justify removal.
- **Remaining:** no before/after user-timing metrics, memory profile, large-data pagination test, or query plan with representative production volume.

### Testing — 50/100

- **Passed:** typecheck, lint, 12 unit tests, 1 Chromium auth-screen smoke test, 2 live anonymous security checks, frontend/root npm audit, RPC permission check, and Edge deployment status check.
- **Not passed/blocked:** test suite did not sign in with Google, write/read profile or medication data, upload a prescription, invoke Gemini with a live signed-in user, or perform two-user isolation. Those integration tests skipped because dedicated account variables were absent.
- **Failed:** no executed project test failed in the final pass.
- **Remaining:** grow Playwright coverage around the real user journey and provision disposable, dedicated test accounts. Avoid using a personal account for destructive isolation checks.

### Accessibility — 52/100

- **Evidence:** automated lint and browser smoke test passed; some forms and errors use accessible labels/roles.
- **Limitations:** no axe/WCAG scan, keyboard-only walkthrough, screen reader test, contrast measurement, zoom/font-size check, or mobile tablet review was executed. The score is intentionally conservative and does not imply WCAG 2.2 AA conformance.
- **Next checks:** run axe against each signed-in page and manually verify keyboard order, dialogs/focus restoration, form error announcements, 200% zoom, and narrow viewport layouts.

### Problem statement alignment — 68/100

- **Evidence:** repository implements profile/dashboard, private prescription storage, extraction with patient review, medication/schedule/dose tracking, reminders, and educational Gemini chat with safety instructions. AI Buddy limits prompt length and avoids sending patient context for general questions.
- **Limitations:** complete user journey and data-backed dashboard numbers were not tested with an authenticated user in this pass. Prescription file uploads, review/confirmation, recurrence/time-zone behavior, and chat persistence need live user validation.
- **Safety:** extraction results stay in `review_required` until user confirmation; the app messaging says the AI does not diagnose or replace a doctor/pharmacist. This does not establish clinical accuracy.

## Changes and deployment evidence

- **Files changed by this audit:** `frontend/src/lib/firebase.ts` removed; frontend dependency/lockfile updated; `supabase/functions/extract-prescription/index.ts` hardened; new `supabase/migrations/20261125154000_authenticated_rpc_grants.sql`; `README.md` test description corrected; new audit and evaluation reports; functional matrix replaced with current evidence.
- **Database:** one non-destructive privilege migration applied to the connected Supabase project. No table data, schema columns, or RLS policies were removed or disabled.
- **Edge Functions:** `extract-prescription` deployed as active version 6 with `verify_jwt=true`; `ai-buddy` remains active version 10 with `verify_jwt=true`. No fresh authenticated Gemini request was made in this audit.
- **Frontend hosting:** no frontend site deployment was performed.
- **Production data:** no patient record or prescription content was read or modified by audit tests.

## Remaining setup before claiming deploy-ready

1. Enable Supabase Auth leaked-password protection in the project's password security settings.
2. Verify the production Google OAuth client, callback URL, site URL, and allowed origins in a real browser.
3. Configure two disposable Supabase test users and run the live cross-user CRUD/storage checks.
4. Run an authenticated Gemini test against deployed `ai-buddy` after the extraction release; test timeouts/rate limits separately.
5. Reconcile local migration history against a clean disposable Supabase project before relying on a fresh bootstrap.
6. Decide whether to retire legacy Firebase Functions. Do not deploy them for the current Supabase auth architecture: their blocking handlers require Firebase Identity Platform/Blaze and their separate package audit reports eight moderate advisories.
7. Complete axe and manual keyboard/screen-reader/mobile accessibility review.
