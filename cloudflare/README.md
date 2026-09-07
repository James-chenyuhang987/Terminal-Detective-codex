# Terminal Detective on Cloudflare + Firebase

Production Worker: `https://terminal-detective-codex.terminal-detective.workers.dev`

Health check: `https://terminal-detective-codex.terminal-detective.workers.dev/api/cloudflare/status`

## Architecture

- Cloudflare Workers Assets serves the Vite application and SPA routes.
- Firebase Authentication owns email/password, email verification, password reset and GitHub sign-in.
- The browser sends a short-lived Firebase ID token in the `Authorization: Bearer` header.
- The Worker uses `jose` to verify the RS256 signature, Google certificate `kid`, issuer, audience, `exp`, `iat`, `auth_time`, UID and verified-email claim.
- Cloudflare D1 stores profiles and game progress under the Firebase UID.
- D1 is authoritative for resources, progression and paid investigation runs. Browsers submit allowlisted intents, never economic patches or run snapshots. Profile and run operation ledgers bind each intent to an owner, revision, hash and persisted result for idempotent retries.
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
| `POST /api/apps/:appId/functions/playerProfile` | Firebase ID token | Claim a device session, read status or execute an authoritative profile intent for the verified token UID. |
| `POST /api/apps/:appId/functions/playerRun` | Firebase ID token | Read or advance an owned, paid, persisted investigation using intent commands. |
| `POST /api/apps/:appId/functions/detectiveRules` | Firebase ID token | Informational deterministic rules only; these results cannot authorize rewards. |

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

The checked-in `wrangler.jsonc` contains the public production Firebase project ID, not a credential. The four public Firebase Web App values still come from the build environment and are not committed. `npm run release:check` reads the same production environment as Vite: `.env`, `.env.local`, `.env.production`, then `.env.production.local` (later files override earlier ones); existing shell/CI variables take highest priority, including empty values. It uses the browser's Firebase config validator to reject missing/placeholder values, surrounding whitespace, malformed auth hostnames and non-Web App IDs, and also rejects frontend/Worker project mismatches, invalid D1 IDs and unsafe CORS origins before a production build can proceed. A valid custom auth hostname is supported, but its Firebase authorization and hosting must be verified separately. Error messages report field names rather than supplied values.

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

`0003_profile_operations.sql` adds the historical profile ledger. **This authority release requires the additive `0004_authoritative_state.sql` migration before readiness can pass.** It adds initialization versioning, persisted operation results, owned paid runs and their command ledger; it does not delete or reset player data. Applying it to a live environment requires separate approval and a backup/recovery plan. Do not rerun historical migrations or reset migration history. Building, testing, deploying and smoke-checking code never apply D1 migrations automatically.

`/api/auth/config` verifies the Firebase project ID, D1 binding, required authority columns/tables, migration `0004_authoritative_state.sql`, table primary keys, one complete non-partial unique `users.email` index, and owner cascade foreign keys. `/api/cloudflare/status` returns HTTP `503` until those checks pass; the frontend also confirms that its Firebase project ID matches the Worker before starting authentication.

## Profile durability model

1. All economic and reward-affecting operations require online server confirmation. `action: 'patch'`, imports, resets and client-supplied settlement summaries are rejected.
2. Profile commands include `session_id`, `operation_id`, a nonnegative safe-integer `expected_revision`, and an allowlisted `command` object. The authenticated UID is never caller-selectable.
3. D1 applies an intent only when both the profile/run revision and active device session match. A takeover makes old-device commands and replays fail closed.
4. Each ledger binds the operation ID to the canonical command SHA-256, base/result revisions and result JSON. Lost-response retries return the identical stored `result` alongside current authoritative state; different content cannot reuse the ID.
5. Business rejections return HTTP 200 with `result.error`, are recorded once and advance the revision. Invalid command fields and forged snapshots return HTTP 400 without an economic write.
6. Requests are limited to 32 KiB; stored profiles, runs and results to 512 KiB. No client clock, resource total, XP, rank or completion assertion is trusted.
7. `start_case` atomically charges canonical energy/items and creates one owned run. A second unsettled run cannot start. Run commands update only the server reducer state; `settle_case` derives rewards exclusively from that persisted terminal run.
8. Empty profiles receive initial resources once. Existing D1 snapshots are preserved as the migration baseline; no browser migration patch is required or accepted. Previously forged data cannot be distinguished retroactively from legitimate snapshots.

See [the backend authority protocol](../docs/backend-authority.md) for intent envelopes, replay semantics and rollout constraints.

This protects against refreshes and temporary outages, not deletion of browser site data or an indefinitely unavailable D1 database. A device takeover makes the previous device read-only and preserves its local pending records for an explicit recovery decision.

## Ongoing production publication (no migration)

1. Keep Firebase providers, authorized domains, repository Web App variables and the matching Worker Firebase project configured as above. Confirm the target Worker/account and existing D1 binding; do not initialize or reset the live database.
2. Review and merge the release PR into `main`. The production workflow uses the exact 40-character `github.sha` for both builds, and new runs do not cancel a deployment already in progress.
3. The Worker job runs the unchanged full `npm run cloudflare:deploy` gate: tests, typecheck, lint, security checks, release/build validation and Wrangler dry run before the deployment. There is no automatic migration.
4. Require the Worker post-deploy smoke gate to pass. Only then can the dependent Pages job verify, build and publish its mirror.
5. After `actions/deploy-pages`, require the same strict smoke gate against its actual `page_url`, including the Pages subpath, critical assets and the configured Worker API origin. A failed postcheck fails the job; it does not undo a deployment already published.

For an explicitly approved manual code deployment, `npm run cloudflare:deploy` retains the same full gate; run both applicable site postchecks below afterwards. Database administration is a separate operation. Unlike an ordinary code-only release, this authority release requires the separately approved additive `0004` schema prerequisite; deploying without it intentionally leaves readiness unavailable. Publish the coordinating authority-capable client and Worker together: old patch-based clients intentionally cannot spend or settle through this API.

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
