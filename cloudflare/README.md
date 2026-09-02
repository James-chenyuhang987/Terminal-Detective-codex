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
| `POST /api/apps/:appId/functions/playerProfile` | ID token + `X-Profile-Owner` | Claim a device session, read status or apply an idempotent patch. |
| `POST /api/apps/:appId/functions/detectiveRules` | Firebase ID token | Run allowlisted deterministic game rules. |

The profile owner header is a consistency guard, not an identity source: it must equal the verified token UID. Unknown `/api/*` paths return JSON 404 and never fall through to the SPA.

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

Certificate refreshes are shared across concurrent requests. Unknown key IDs are throttled for one minute and certificate-download failures use a short retry backoff, preventing a malformed-token burst or Google outage from amplifying outbound requests.

## GitHub provider

Create a GitHub OAuth App dedicated to Terminal Detective:

```text
Homepage URL: https://terminal-detective-codex.terminal-detective.workers.dev/
Authorization callback URL: https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler
```

Enter the GitHub Client ID and Client Secret only in Firebase Authentication → Sign-in method → GitHub. Do not add the secret to this repository, a `VITE_` variable, or Wrangler.

Enable one-account-per-email and email-enumeration protection. Add every frontend hostname that can start Firebase Authentication—including the production Worker, GitHub Pages when enabled, `localhost` and `127.0.0.1`—to Firebase Authentication → Settings → Authorized domains.

The GitHub Pages workflow reads the four `VITE_FIREBASE_*` values from GitHub Actions repository variables. Configure `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` before enabling Pages deployment. These are public Web App identifiers; the GitHub Client Secret remains only in Firebase.

## Database reset warning

`cloudflare/migrations/0002_reset_for_firebase.sql` intentionally removes the old users, OAuth accounts, sessions and profiles before the Firebase UID rollout. It is included because the product decision is to start without old players. `0003_profile_operations.sql` adds the idempotency ledger required by profile writes. The production database has applied migrations `0001` through `0003`; review the target database before applying the same sequence to a new environment.

Do not run the remote migration until Firebase login has been configured and the production reset has been explicitly approved. Building, testing and deploying Worker code do not run D1 migrations automatically.

`/api/auth/config` verifies the Firebase project ID, D1 binding, and required schema. `/api/cloudflare/status` returns HTTP `503` until those checks pass; the frontend also confirms that its Firebase project ID matches the Worker before starting authentication.

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

## Production activation order

1. Configure Firebase Email/Password, GitHub, one-account-per-email, email-enumeration protection and every authorized frontend domain.
2. Configure the dedicated GitHub OAuth callback as `https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler`; keep its client secret only in Firebase.
3. Inject the four public `VITE_FIREBASE_*` values into the frontend build and set the same project ID in Worker `FIREBASE_PROJECT_ID`.
4. Confirm the Wrangler account, D1 database ID and reset approval; schedule a maintenance window.
5. Run `npm run release:check` and the full local verification below.
6. Apply the reviewed remote migrations. Because `0002` deletes legacy player data, do not reopen the game between migration and deployment.
7. Deploy the Worker/assets immediately, then require both readiness endpoints and a real registration/login/profile smoke test to pass before reopening.

```bash
npm run cloudflare:d1:remote
npm run cloudflare:deploy
```

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
