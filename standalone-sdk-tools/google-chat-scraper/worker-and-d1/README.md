# Google Chat Worker and D1
<small>Version 1.2</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

This directory keeps the Google Chat ingestion Worker and its D1 database definition together. The Worker owns the `CHAT_IMPORT_DB` binding and is the only component that should read or write the intake database. The vinext web Worker reaches it through the internal `CHAT_IMPORT` service binding declared in `cloudflare.config.ts`.

## Files

- [`chat-worker-wrangler.jsonc`](chat-worker-wrangler.jsonc) names this Worker, binds the D1 database, and points Wrangler at the migrations folder.
- [`src/`](src/) contains the Worker request handler, standalone Google OpenID Connect sign-in, and Cloudflare Access JWT verification for the existing review API. Google sign-in reads the current permitted emails from this tool's Outside Tools registration through `getPermittedUsers()` and fails closed unless the external API URL, tool credentials and `tool-registration:read` grant work; reviewer routes separately fail closed until the Access domain and audience are configured.
- [`migrations/`](migrations/) contains ordered SQL files. `0001_initial_sql_d1_start.sql` creates the initial empty schema; it does not load Google Chat data.
- [`d1-schema/00-d1-krhtool-google-chat-scraper-schema.md`](d1-schema/00-d1-krhtool-google-chat-scraper-schema.md) describes the database purpose, tables, columns, and constraints.

The Homebase registration's email list lives in KR Homebase D1 (`workspace_tool.permitted_users`), applied by repository migration 073. It is not copied into this tool's D1. The scraper reads only its own list from the server-only `GET /v1/tools/permitted-users` route; the scraper D1 remains bound to this Worker for intake data.

## D1 database

The configured database name is `krhtool-google-chat-scraper`. The database id was supplied by the requester and is recorded in the Wrangler configuration; it has not been independently checked against Cloudflare in this session.

The D1 binding keeps database calls inside the Worker. The web Worker sends `/auth/*` and `/api/*` calls to this Worker through the internal service binding. Google OpenID Connect protects health and migration-status diagnostics. Cloudflare Access JWT verification separately protects endpoints that return source-message content or change review state. The app returns source text to an authenticated reviewer's browser because the person needs to inspect it.

## Migration ownership

The schema document describes the intended initial database shape; the numbered SQL files are the executable schema changes. The database owner applies a migration only after reviewing it. Do not run a migration automatically as part of install, build, or deploy. After application, check the tool-local `chat_schema_migration` row, table columns, and foreign keys read-only.

The migration does not touch KR Homebase D1, import any messages, call Google, call Gemini, or create Workstream activity rows.
