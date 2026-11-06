# Initial KR Homebase MCP Thoughts

<small>Version 1.1</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.


## Status and priority

This directory is an early architectural scaffold, not a production data integration. The work is intentionally low priority relative to current KR Homebase application work, but the intended trust boundaries are recorded here so later development starts from an explicit security model.

The current Worker exposes one read-only `hello_world` MCP tool. It has no D1, R2, token-store, or audit-store bindings and cannot access client information.

## Initial objective

The planned KR Homebase MCP Worker will be the dedicated gateway between approved AI hosts and narrowly defined KR Homebase capabilities. It should work directly with approved database records and approved file objects instead of routing normal MCP tool calls through the Next.js application API.

The Worker must remain the gatekeeper. It—not a skill, model, prompt, or client application—will determine whether:

- The presented access token is authentic, unexpired, correctly scoped, and intended for this MCP resource.
- The signing or verification key is active, trusted, correctly identified, and not revoked.
- The token represents an active, validated KR Homebase user.
- That user may use the requested tool.
- That user may access the particular client, matter, record, field, document, or file involved.
- The requested operation satisfies the current read-only or later write-approval policy.

No caller-supplied user ID, role, client ID, or matter ID should be trusted merely because it appears in an MCP tool request.

## Proposed boundary

```text
ChatGPT / Codex / Claude or another approved MCP host
        |
        | MCP Streamable HTTP + OAuth access token
        v
KR Homebase MCP Worker
        |
        +-- validate token, key, issuer, audience, expiry, and scopes
        +-- resolve the current KR Homebase user
        +-- enforce role, permission, client, matter, record, and field access
        +-- execute only named, parameterized MCP tools
        +-- filter and minimize returned data
        +-- emit a redacted audit event to the separate MCP audit system
        |
        +-- read approved D1 records directly
        +-- read approved R2/file objects directly
```

The MCP Worker should expose semantic tools such as `search_authorized_clients` or `get_authorized_contact_summary`. It must not expose arbitrary SQL, arbitrary table access, generic filesystem access, or the existing generic CRUD contract to a model.

## Authentication and authorization model

Google SSO remains the human login mechanism. A future OAuth 2.1 authorization flow should map the verified Google identity to an active KR Homebase user and issue a short-lived MCP access token with:

- A trusted issuer.
- An audience restricted to the KR Homebase MCP resource.
- A stable Homebase user subject.
- Narrow scopes.
- Short expiration.
- A connection or grant identifier that can be revoked.

The access token establishes the calling identity and delegated scope. It does not replace current database authorization. Every tool call must re-evaluate current Homebase permissions and record-level access so revocations and matter-access changes take effect without waiting for a long-lived token to expire.

Authentication answers "who is calling?" Authorization answers "may this caller perform this exact operation on this exact data?" Both checks are required.

## Key handling

The MCP Worker should validate tokens using public verification material stored in an appropriate key store or published JSON Web Key Set. Private signing keys should remain only in the system responsible for issuing tokens.

If the MCP Worker later calls another protected KR service, give the Worker its own service identity and key pair. Do not reuse a human credential, embed a private key in a skill, or create permanent private keys for individual conversations.

Key records should support rotation and revocation. Token validation should check at least the algorithm, key ID, signature, issuer, audience, expiry, not-before time when present, and required scopes.

## Token data is separate

OAuth grants, refresh tokens, token revocation state, authorization codes, connection records, and similar credential material will not be stored in the KR Homebase operational/client database.

The future token system should use a separate security store with tighter access controls and a deliberately small schema. Raw access and refresh tokens should not be written to logs. Where practical, persist only hashes or encrypted values needed for validation, rotation, or revocation.

No token-store binding is configured in this scaffold.

## MCP audit data is separate

MCP audit events will be stored outside the KR Homebase operational/client database. This separation reduces the need to grant the external MCP surface write access to the primary database merely to record its own activity and allows separate retention, monitoring, and access policies.

A future MCP audit event should capture only what is needed to investigate access:

- Timestamp and request/correlation ID.
- MCP connection or grant ID.
- Validated Homebase user ID.
- Tool name and read/write classification.
- Authorized target type and stable target ID where appropriate.
- Outcome, denial reason, latency, and policy version.
- Key ID and token ID/hash reference when useful for investigation.

Audit events should not contain raw tokens, unnecessary prompts, complete tool results, or unredacted personal information. Failed authentication and authorization attempts should also be auditable.

No audit-store binding is configured in this scaffold.

## Direct database and file access

The long-term model permits the MCP Worker to access approved D1 and R2 resources directly, but only through fixed-purpose code:

- Use parameterized queries whose tables and columns are chosen by server code.
- Apply user and record authorization within or before each query.
- Return only fields required for the named tool.
- Mask personal information when the full value is unnecessary.
- Restrict file reads by owner, matter/client association, classification, and object-key policy.
- Never accept SQL, table names, column names, R2 bucket names, or arbitrary object keys from the model.
- Keep operational database, token-store, file-store, and MCP audit permissions separate.

Binding a database or bucket to the Worker is not itself authorization. Tool-level and record-level policy checks remain mandatory.

## Read-only first phase

Initial production-capable MCP tools should be read-only. Candidate tools include:

- `search_authorized_clients`
- `list_authorized_matters`
- `get_authorized_contact_summary`
- `get_contact_verification_status`
- `list_authorized_client_documents`
- `get_authorized_document_metadata`

The first tools should return small, structured results and should default to masked contact information. Full values should be returned only when the workflow and permission scope require them.

Tool annotations must accurately mark read-only behavior. Server enforcement—not the annotation—must prevent writes.

## Future write and review model

No write-capable MCP tool should be added until the read-only design has been reviewed and tested. Future writes should begin as proposals rather than silent mutations, for example:

- Propose a client contact correction.
- Request contact verification.
- Present a before/after comparison.
- Require staff approval before applying the change.

KR Homebase may later add an **MCP Review** area for:

- Reviewing proposed changes and consequential actions.
- Approving or rejecting pending MCP requests.
- Viewing active MCP connections and scopes.
- Revoking a connection or grant.
- Reviewing access denials and unusual activity.
- Inspecting redacted MCP audit history.
- Managing allowed tools and policy versions.

That interface is a future concept and is not part of this scaffold.

## Current hello-world behavior

The Worker currently supports a small stateless subset of MCP Streamable HTTP at `/mcp`:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call` for `hello_world`

The `hello_world` result instructs the developer to review this file. The root `/` route provides a non-MCP health response showing that data access is disabled.

The scaffold intentionally avoids an MCP SDK dependency. Before production development, review the current official SDK and protocol version and decide whether to replace the minimal transport handler with the official TypeScript SDK.

## Local checks

Run a Wrangler bundle check without deploying:

```powershell
pnpm exec wrangler deploy --dry-run --config .\workers\d1-workers\kr-homebase-mcp-worker\kr-homebase-mcp-worker.jsonc
```

For interactive protocol testing, run the Worker locally and connect MCP Inspector to `/mcp`:

```powershell
pnpm exec wrangler dev --config .\workers\d1-workers\kr-homebase-mcp-worker\kr-homebase-mcp-worker.jsonc
npx @modelcontextprotocol/inspector
```

Do not deploy this Worker as a client-data endpoint until authentication, authorization, separate token storage, separate auditing, rate limiting, and security tests are implemented.

## Next steps

These steps are intentionally captured for later prioritization:

1. Confirm the OAuth 2.1 authorization-server design and how existing Google SSO maps to MCP grants.
2. Define the separate token/grant/revocation store; do not bind it to the operational client database.
3. Define the separate MCP audit destination, retention policy, redaction policy, and alerting rules.
4. Decide whether to use the official TypeScript MCP SDK and replace the minimal transport scaffold if appropriate.
5. Publish MCP protected-resource metadata and OAuth/OIDC discovery metadata.
6. Implement access-token validation, key rotation, revocation, issuer/audience checking, and scope enforcement.
7. Centralize Homebase role, permission, `matter_access`, client association, record, field, and file authorization for Worker use.
8. Design and threat-model the first one or two read-only tools.
9. Add fixed, parameterized D1 reads and narrowly constrained R2 reads only after authorization tests exist.
10. Add a separate redacted audit emitter and rate limits before exposing client data.
11. Test with MCP Inspector, invalid tokens, expired tokens, revoked grants, unauthorized records, prompt injection, oversized input, and enumeration attempts.
12. Pilot with a very small internal allowlist and masked results.
13. Consider an MCP Review section in KR Homebase before introducing any write-capable tools.

## References

- [OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI: Authenticate MCP users](https://developers.openai.com/plugins/build/auth)
- [Model Context Protocol](https://modelcontextprotocol.io/)
