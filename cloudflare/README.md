# Terminal Detective on Cloudflare + Firebase

Production Worker: `https://terminal-detective-codex.terminal-detective.workers.dev`

Health check: `https://terminal-detective-codex.terminal-detective.workers.dev/api/cloudflare/status`

## Architecture

- Cloudflare Workers Assets serves the Vite application and SPA routes.
- Firebase Authentication owns email/password, email verification, password reset and GitHub sign-in.
- The browser sends a short-lived Firebase ID token in the `Authorization: Bearer` header.
- The Worker uses `jose` to verify the RS256 signature, Google certificate `kid`, issuer, audience, `exp`, `iat`, `auth_time`, UID and verified-email claim.
- Cloudflare D1 stores profiles and game progress under the Firebase UID.
- Profile mutations use one browser WAL v2 record per UID, operation ID and lineage plus a D1 operation ledger, so retries remain ordered and idempotent while cross-tab forks fail closed instead of overwriting progress.
- Protected detective rules execute inside the Worker and never enter the browser bundle.
- The previous `td_session` cookie and Worker-hosted GitHub OAuth callback are no longer used.

Runtime baseline: Node.js 22+ for tooling, React 18.3.1, Firebase Web SDK 12.18.0, `jose` 6.2.10, Vite 8.2.2, TypeScript 5.9.3, Wrangler 4.128.0, and Workers compatibility date `2026-08-31` with `nodejs_compat`.

## API surface

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /api/auth/config` | Public | Check the Firebase project, D1 binding and required schema. |
| `GET /api/cloudflare/status` | Public | Aggregate readiness; returns `503` until all checks pass. |
| `GET /api/auth/session` | Firebase ID token | Return the normalized `firebase-cloudflare` account. |
| `GET /api/apps/:appId/entities/User/me` | Firebase ID token | Read the current token owner's account and profile. |
| `POST /api/apps/:appId/functions/playerProfile` | Firebase ID token | Claim a device session, read status or apply an idempotent patch for the verified token UID. |
| `POST /api/apps/:appId/functions/detectiveRules` | Firebase ID token | Run allowlisted deterministic game rules. |

The browser cannot select a profile owner through a request header or payload; the Worker derives it only from the verified Firebase token. Unknown `/api/*` paths return JSON 404 and never fall through to the SPA.

## Required configuration

Create `.env.local` for local builds, or provide these values to the production Vite build:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_APP_ID=...
```

Set the matching public project ID in `wrangler.jsonc` or the Cloudflare dashboard:

```json
{
  "vars": {
    "FIREBASE_PROJECT_ID": "<project-id>"
  }
}
```

The checked-in `wrangler.jsonc` contains the public production Firebase project ID, not a credential. The four public Firebase Web App values still come from the build environment and are not committed. `npm run release:check` rejects placeholders, missing Web App values, frontend/Worker project mismatches, invalid D1 IDs and unsafe CORS origins before a production build can proceed.

If the frontend is also hosted on another origin, such as GitHub Pages, list its exact origin in `CORS_ALLOWED_ORIGINS`:

```json
{
  "vars": {
    "CORS_ALLOWED_ORIGINS": "https://james-chenyuhang987.github.io"
  }
}
```

Same-origin requests need no CORS entry. HTTP `localhost` and `127.0.0.1` origins are accepted for local development. Cross-origin API requests receive no cookie credentials and must continue to send the Firebase ID token.

The Worker does not require a Firebase service-account private key. Google signing certificates are downloaded from the official metadata endpoint and cached according to its `Cache-Control` header.

Certificate refreshes are shared across concurrent requests. The 3.5-second deadline covers both the metadata request and response-body parsing; network failures and temporary `429/5xx` responses receive one retry. Unknown key IDs are throttled for one minute and certificate-download failures use a short retry backoff, preventing a malformed-token burst or Google outage from amplifying outbound requests.

## GitHub provider

Create a GitHub OAuth App dedicated to Terminal Detective:

```text
Homepage URL: https://terminal-detective-codex.terminal-detective.workers.dev/
Authorization callback URL: https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler
```

Enter the GitHub Client ID and Client Secret only in Firebase Authentication → Sign-in method → GitHub. Do not add the secret to this repository, a `VITE_` variable, or Wrangler.

Enable one-account-per-email and email-enumeration protection. Add every frontend hostname that can start Firebase Authentication—including the production Worker, GitHub Pages when enabled, `localhost` and `127.0.0.1`—to Firebase Authentication → Settings → Authorized domains.

The production workflow reads the four `VITE_FIREBASE_*` values from GitHub Actions repository variables. Configure `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` before enabling deployment. These are public Web App identifiers; the GitHub Client Secret remains only in Firebase.

Worker deployment also requires a repository Actions secret named `CLOUDFLARE_API_TOKEN` with permission to edit this Worker. Configure `CLOUDFLARE_ACCOUNT_ID` as either a repository secret or variable. The workflow checks both values before installing dependencies so a missing production credential fails immediately with an actionable error.

## Historical database initialization — not a release step

`cloudflare/migrations/0002_reset_for_firebase.sql` intentionally removed the old users, OAuth accounts, sessions and profiles for the original Firebase UID rollout. That destructive initialization is historical, not part of ongoing releases. **Never rerun `0002` against a live database with player data.** Do not reset migration history or apply its SQL manually to make a readiness check pass.

`0003_profile_operations.sql` adds the idempotency ledger required by profile writes. Production has applied migrations `0001` through `0003`. Any future schema change needs a separately reviewed migration and backup/recovery plan; a new empty environment also requires explicit review before initialization. Building, testing, deploying and smoke-checking code never apply D1 migrations automatically.

`/api/auth/config` verifies the Firebase project ID, D1 binding, required columns, migration `0003_profile_operations.sql`, table primary keys, one complete non-partial unique `users.email` index, and the profile cascade foreign keys. `/api/cloudflare/status` returns HTTP `503` until those checks pass; the frontend also confirms that its Firebase project ID matches the Worker before starting authentication.

## Profile durability model

1. Before changing the optimistic profile, the browser writes an individual WAL v2 record to `localStorage`.
2. Records are isolated by full Firebase UID, operation ID and tab lineage, and include a checksum, base revision, timestamp and attempt count.
3. A single lineage replays in persisted order. The next base revision advances only after the prior operation is confirmed at exactly `base + 1`; new mutations remain blocked for the complete replay.
4. D1 applies a patch only when both `profile_revision` and `active_session_id` still match.
5. `profile_operations` binds an operation ID to its patch SHA-256 and result revision. A retry returns the committed result; reuse with different content is rejected.
6. Every write requires a non-negative safe-integer `expected_revision` and a non-empty patch. Both the patch and the resulting complete profile are capped at 512 KiB.
7. Temporary network/platform failures leave the WAL pending for login, online-event and 20-second polling replay. True stale revisions, damaged WAL data and multiple lineages enter explicit recovery instead of silently rebasing absolute values.
8. Case settlements also keep one UID/run outbox intent until the corresponding profile operation commits.

This protects against refreshes and temporary outages, not deletion of browser site data or an indefinitely unavailable D1 database. A device takeover makes the previous device read-only and preserves its local pending records for an explicit recovery decision.

## Ongoing production publication (no migration)

1. Keep Firebase providers, authorized domains, repository Web App variables and the matching Worker Firebase project configured as above. Confirm the target Worker/account and existing D1 binding; do not initialize or reset the live database.
2. Review and merge the release PR into `main`. The production workflow uses the exact 40-character `github.sha` for both builds, and new runs do not cancel a deployment already in progress.
3. The Worker job runs the unchanged full `npm run cloudflare:deploy` gate: tests, typecheck, lint, security checks, release/build validation and Wrangler dry run before the deployment. There is no automatic migration.
4. Require the Worker post-deploy smoke gate to pass. Only then can the dependent Pages job verify, build and publish its mirror.
5. After `actions/deploy-pages`, require the same strict smoke gate against its actual `page_url`, including the Pages subpath, critical assets and the configured Worker API origin. A failed postcheck fails the job; it does not undo a deployment already published.

For an explicitly approved manual code deployment, `npm run cloudflare:deploy` retains the same full gate; run both applicable site postchecks below afterwards. Database administration is a separate operation, never a prerequisite for an ordinary code release.

## Read-only release smoke gate

`node scripts/smoke-production.mjs` uses only Node's built-in capabilities. The workflow supplies:

| Environment variable | Meaning |
| --- | --- |
| `SMOKE_TARGET` | `worker` or `pages`. |
| `SMOKE_SITE_URL` | Worker homepage, or the exact Pages deployment `page_url` including its repository subpath. |
| `SMOKE_API_URL` | Expected Worker HTTPS origin, without an API path; both sites check readiness here. |
| `VITE_BUILD_SHA` | Exact 40-character release commit; missing, wrong and `-dirty` markers cannot pass. |
| `VITE_FIREBASE_PROJECT_ID` | Expected public Firebase project shared by frontend and Worker. |
| `VITE_APP_ID` | Expected application ID embedded in the frontend. |

Each bounded round separately checks `GET /api/cloudflare/status` (`ok`, service, mode, Firebase, database and schema), `GET /api/auth/config` (ready, primary provider, Firebase project and database/schema checks), the homepage build meta marker, and every linked module entry, stylesheet and module preload. Valid meta attribute ordering, spacing, quotes and self-closing forms are accepted without weakening the exact SHA comparison. Entry assets must be nonempty, use the proper JavaScript/CSS MIME type and not return an HTML SPA fallback. Pages assets must resolve inside the deployed subpath. The downloaded entry JS must contain the actual Vite runtime APP_ID, Firebase project and API URL settings: `same-origin` on Worker, the exact expected Worker origin on Pages. An unrelated URL or extra meta marker is not configuration proof.

The fixed production ceilings are **5 rounds**, **10 seconds per request including its response body**, **120 seconds overall**, and **2 seconds between retryable rounds**. Only network failures, timeouts, HTTP `429`/`5xx`, stale/missing deployment content and temporarily absent assets retry. Invalid JSON, known configuration/project mismatches, unexpected redirects, incorrect asset MIME and HTTP `403` fail immediately; the gate never bypasses a challenge. Exhaustion always exits nonzero. Diagnostics identify public stages, bounded round/status/error codes and sanitized expected/actual SHAs, never response bodies, tokens or player records.

With the three expected `VITE_*` values exported from the reviewed release configuration, repeat the read-only postchecks when needed:

```bash
SMOKE_TARGET=worker \
SMOKE_SITE_URL=https://terminal-detective-codex.terminal-detective.workers.dev \
SMOKE_API_URL=https://terminal-detective-codex.terminal-detective.workers.dev \
node scripts/smoke-production.mjs

# Use the actual page_url returned by the reviewed Pages deployment.
SMOKE_TARGET=pages \
SMOKE_SITE_URL="$PAGE_URL" \
SMOKE_API_URL=https://terminal-detective-codex.terminal-detective.workers.dev \
node scripts/smoke-production.mjs
```

These checks issue public GET requests only: no registration, login, profile writes, session takeovers or D1 mutations. They validate published readiness and release assets, not an authenticated browser journey. A later healthy response does not establish why an earlier opaque gate failed; deployment propagation is only one possible cause, not a confirmed diagnosis.

## Local verification

```bash
npm test
npm run typecheck
npm run lint
npm run security:check
npm run release:check
npm run cloudflare:d1:local
npm run cloudflare:check
npm run cloudflare:dev
```

Remote migrations and deployment change production state. Run them only after reviewing the selected Cloudflare account and D1 database.

The GitHub Actions production workflow follows the no-migration publication order above. Local migration commands target local development only; never substitute `--remote` as part of routine verification or to repair a smoke failure.
