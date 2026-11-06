# KR Session Worker

<small>Version 1.2</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.


This worker validates `kr_session` rows from D1 using a SHA-256 hash of the opaque browser cookie token.

The browser never calls this worker directly. The flow should be:

1. Browser sends the `HttpOnly` session cookie to `/kr/krhomebase`.
2. `page.tsx` or `/kr/krhomebase/api/session` reads the cookie server-side.
3. The Next.js server hashes the raw token.
4. The Next.js server calls this worker with the hash and a shared symmetric bearer secret.
5. The worker checks `kr_session`, `user`, expiration, revocation, and active-user status.
6. The worker returns display-safe session data only.

Environment expected by the Next.js app for the live Worker:

```env
KR_SESSION_WORKER_URL=https://session-worker.<your-subdomain>.workers.dev
KR_SESSION_WORKER_SECRET=<same-secret-loaded-into-worker>
KR_SESSION_COOKIE_NAME=kr_session
```

For local development, put the private filename in
`KR_SESSION_WORKER_SECRET_PATH` in `apps/kr-homebase/.env.local`. The visible
Homebase startup loader reads the file and exports the direct
`KR_SESSION_WORKER_SECRET` binding before Next starts. Homebase itself does not
read secret files. Do not use a `.pub` file; the file's contents must exactly
match the secret stored in Cloudflare.

For developer-database work, use the separate `session-worker-dev` deployment:

```env
KRHOMEBASE_BACKEND_ENV=dev
KR_SESSION_WORKER_DEV_URL=https://session-worker-dev.<your-subdomain>.workers.dev
KR_SESSION_WORKER_SECRET=<same-secret-loaded-into-session-worker-dev>
```

`wrangler --env dev` stores bindings and secrets on the separate Cloudflare
Worker environment named `session-worker-dev`; it does not inject the secret
into the local Next.js process. The local server and the selected Worker must
receive the same shared secret. This worker does not use the asymmetric
`private-session-worker-1.pem` or `.pub` files; those belong to a different
public/private-key authentication design.

Worker secret setup:

```bash
pnpm wrangler secret put KR_SESSION_WORKER_SECRET --config ./workers/d1-workers/session-worker/session-worker.jsonc
pnpm wrangler secret put KR_SESSION_WORKER_SECRET --env dev --config ./workers/d1-workers/session-worker/session-worker.jsonc
```

Deploy the developer Session Worker from the repository root with:

```bash
pnpm run workers:dev:deploy:session
```

The secret must be set separately; redeploying code does not create or replace
the Cloudflare secret.

Temporary local UI preview:

```env
KRHOMEBASE_USE_MOCK_SESSION_STATE=true
KRHOMEBASE_DEV_ACCEPT_COOKIE_ONLY=true
```

Use these only in non-production. `KRHOMEBASE_USE_MOCK_SESSION_STATE=true` is the full local development bypass: Next.js returns a Super Admin mock session before reading cookies or calling the session worker, so pages and API routes can run while SSO/session-worker access is unavailable. `KRHOMEBASE_DEV_ACCEPT_COOKIE_ONLY=true` is narrower and only accepts an existing KR session cookie without worker validation.
