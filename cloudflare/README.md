# Terminal Detective on Cloudflare

Production Worker: `https://terminal-detective-codex.terminal-detective.workers.dev`

Health check: `https://terminal-detective-codex.terminal-detective.workers.dev/api/cloudflare/status`

## Architecture

- Vite assets are served by Cloudflare Workers Assets.
- GitHub OAuth is handled by the Worker with PKCE and state validation.
- Authentication uses a 30-day HttpOnly, Secure, SameSite=Lax session cookie.
- Player profiles, revisions and active-device sessions are stored in D1.
- Protected detective rules execute inside the Worker and never enter the browser bundle.
- No request is proxied to the previous backend and no old account is migrated.

## GitHub OAuth App

Create one GitHub OAuth App with:

- Homepage URL: `https://terminal-detective-codex.terminal-detective.workers.dev/`
- Authorization callback URL: `https://terminal-detective-codex.terminal-detective.workers.dev/api/auth/github/callback`

Store the Client ID as a Worker variable and the Client Secret only as a Worker secret:

```bash
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
```

## Local verification

```bash
npm run cloudflare:d1:local
npm run cloudflare:check
npm run cloudflare:dev
```

Remote migrations and deployment change production state. Run them only after reviewing the target account and database.
