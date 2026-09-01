# Terminal Detective on Cloudflare + Firebase

Production Worker: `https://terminal-detective-codex.terminal-detective.workers.dev`

Health check: `https://terminal-detective-codex.terminal-detective.workers.dev/api/cloudflare/status`

## Architecture

- Cloudflare Workers Assets serves the Vite application and SPA routes.
- Firebase Authentication owns email/password, email verification, password reset and GitHub sign-in.
- The browser sends a short-lived Firebase ID token in the `Authorization: Bearer` header.
- The Worker verifies the RS256 signature, issuer, audience, expiry, UID and verified-email claim.
- Cloudflare D1 stores profiles and game progress under the Firebase UID.
- Protected detective rules execute inside the Worker and never enter the browser bundle.
- The previous `td_session` cookie and Worker-hosted GitHub OAuth callback are no longer used.

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

The Worker does not require a Firebase service-account private key. Google signing certificates are downloaded from the official metadata endpoint and cached according to its `Cache-Control` header.

## GitHub provider

Create a GitHub OAuth App dedicated to Terminal Detective:

```text
Homepage URL: https://terminal-detective-codex.terminal-detective.workers.dev/
Authorization callback URL: https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler
```

Enter the GitHub Client ID and Client Secret only in Firebase Authentication → Sign-in method → GitHub. Do not add the secret to this repository, a `VITE_` variable, or Wrangler.

Enable one-account-per-email and email-enumeration protection. Add the production Worker hostname, `localhost` and `127.0.0.1` to Firebase Authentication → Settings → Authorized domains.

## Database reset warning

`cloudflare/migrations/0002_reset_for_firebase.sql` intentionally removes the old users, OAuth accounts, sessions and profiles before the Firebase UID rollout. It is included because the product decision is to start without old players.

Do not run the remote migration until Firebase login has been configured and the production reset has been explicitly approved. Building, testing and deploying Worker code do not run D1 migrations automatically.

## Local verification

```bash
npm run cloudflare:d1:local
npm run cloudflare:check
npm run cloudflare:dev
```

Remote migrations and deployment change production state. Run them only after reviewing the selected Cloudflare account and D1 database.
