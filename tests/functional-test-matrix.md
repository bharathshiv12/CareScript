# CareScript Functional Test Matrix

**Last executed:** 2026-11-25. Results describe this audit pass only. `PASS` means the named test actually ran; `BLOCKED` means required credentials/configuration were unavailable; `NOT RUN` means no automated/manual check was available in this pass.

| Feature | Test case / command | Expected result | Actual result | Status / evidence |
|---|---|---|---|---|
| Frontend types, lint, unit | `npm run check` | TypeScript, lint/security hygiene, unit suite pass | Typecheck/lint passed; 12/12 unit tests passed | PASS — command output, 2026-11-25 |
| Production bundle | `npm run build` | Production assets generated without errors | Build passed; largest chunks React 223.08 kB, Supabase 230.49 kB, gzip 69.17/60.05 kB; no >500 kB warning | PASS — Vite output |
| Browser smoke | `npm run test:e2e` | Auth screen renders and callback error handling works | One Chromium smoke test passed; also checks removed demo login | PASS — 1/1; not an authenticated workflow suite |
| Anonymous database access | `npm run test:live` | Unauthenticated profile/RPC/storage requests denied | Probes passed against connected project | PASS — integration test output |
| Edge Function auth | `npm run test:live` | Missing/malformed bearer tokens rejected for both functions | Both functions rejected unauthenticated/invalid-token requests | PASS — integration test output; `verify_jwt=true` on deployed functions |
| RPC role grants | Read-only live SQL permission check after migration | Public app RPCs denied to `anon`, available to `authenticated` | All ten app RPCs show anon=false/authenticated=true; trigger helper false/false | PASS — live permission query after migration |
| RLS ownership policies | Live schema inspection | User-owned rows protected; RLS remains enabled | All inspected app tables had RLS and authenticated ownership policies | PASS — schema inspection only; no two-user isolation transaction |
| Google OAuth | Real provider login, callback, refresh, logout | Supabase session persists and protected profile loads | Not exercised in this run; provider credentials/origin configuration must be verified in browser | BLOCKED — no authenticated OAuth browser session |
| Profile/settings persistence | Sign in, edit, reload, verify row | Changes persist to the same user's database rows | Not exercised | BLOCKED — no dedicated test account credentials |
| Prescription upload and extraction | Valid/invalid file, 10 MiB boundary, Gemini extraction, patient review | Private upload; server bounds/type checks; result stays review-required | Source checks implemented; deployed extraction is v6 with JWT verification; no authenticated upload performed | BLOCKED — requires a signed-in test user and real prescription fixture |
| Gemini AI Buddy | Authenticated real Gemini greeting/medical term/error/retry | Genuine provider answer; safe errors for invalid credentials/rate/timeouts | Current live Gemini call was skipped by integration suite because dedicated test account is absent. A previous session had a successful manual response before this audit. | BLOCKED for this pass — no fresh post-audit provider request |
| Two-user isolation | Create/modify/read User A/B profile and records | B cannot read/change A's rows or files | Test was skipped; test variables absent | BLOCKED — dedicated A/B test accounts required |
| Reminders/dose lifecycle | Create, edit, deactivate, mark dose, timezone validation | DB state persists and dashboard counts match | Unit tests cover schedule sorting/adherence/date utilities; no authenticated live CRUD | PARTIAL — unit coverage only |
| Accessibility | Keyboard, screen reader, contrast, responsive; axe/WCAG 2.2 AA | No critical WCAG 2.2 AA barriers | No axe package or authenticated manual screen-reader/mobile pass executed | NOT RUN — needs browser/manual evaluation |
| Dependency audit: root | `npm audit --json` | No known advisories | 0 vulnerabilities | PASS |
| Dependency audit: frontend | `npm audit --prefix frontend --json` | No known advisories in shipped frontend dependency graph | 0 vulnerabilities after removing unused Firebase web SDK/module | PASS |
| Dependency audit: legacy Firebase Functions | `npm audit --prefix backend/firebase-functions --json` | No known advisories | 8 moderate advisories in dormant legacy Firebase deployment package; it is not used by frontend, and Identity Platform/Blaze is required for its blocking handlers | FINDING — retain/retire or major-upgrade only after Firebase cutover decision |
| Supabase security advisor | Live advisor after permissions migration | No unresolved high-priority auth warnings | One WARN: leaked password protection disabled | ACTION REQUIRED — enable in Supabase Auth password security settings |

## Test commands

```powershell
npm run check
npm run build
npm run test:e2e
npm run test:live
npm audit --json
npm audit --prefix frontend --json
npm audit --prefix backend/firebase-functions --json
```
