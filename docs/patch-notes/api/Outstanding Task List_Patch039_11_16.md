# Outstanding Task List: API Patch 39

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 8:30am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 39  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch038_11_16.md`
**Same change set:** repository patch 50 (the requester's report of Nov 16, 2026: "The billing mailbox is not set up on this server, so nothing was sent" for the statement of client 306, request `67610b20-b7dd-41b1-8517-6b3fde18d328`, and for Invoice #5). Branch `impeccable-11-09`.

## Completed by this patch

- **Cause:** the local API (`pnpm dev`) has no `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY`. The key file is only in the old repository's keys folder, and `Write-DevVars.ps1` did not write it (repository patch 50 now does). The deployed API has the secret (set Nov 12, 2026).
- **Billing documents refuse before building or storing** when the billing mailbox is missing: `requireReadyToSend` in `src/features/billing-documents/rules.ts` (step 0 of the flow), called first by the invoice, statement and receipt sends and the re-send. The route context gets `mailReady` (`mailConfigFor(env, 'billing') !== null`). Before this, a send without the key made the PDF, stored a copy and then marked it superseded.
- **Test:** `billing-documents.test.ts`: with storage and no key, the send answers 503 `BILLING_EMAIL_NOT_CONFIGURED` and stores nothing (no row, no object).
- `apps/api/AGENTS.md` 1.41 (Billing documents, the order line).
- No route, contract or OpenAPI change.

## Immediate (the requester)

1. Copy the mailer key file into this repository's keys folder and rewrite `.dev.vars` (repository list 050), restart `pnpm dev`, then send the statement of client 306 and Invoice #5 again.
2. The two failed sends stored copies before this patch, both `superseded` (read-only check): `KUJEOP0` (statement, 14:15 UTC) and `ZMD0VTC` (invoice, 14:17 UTC). They stay as the record of a send that did not go; nothing needs removing.
3. Commit with repository patch 50 (and 49, 48, API 38, web 553, 552 if not yet committed).

## Later

- Parts 7d (pay links), 7e (card payments and refunds), 7f (small fixes).
- Carried from patch 38.
