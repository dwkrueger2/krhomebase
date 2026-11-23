# Outstanding Task List: API Patch 56

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:23pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 56  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch055_11_23.md`

## Completed by this patch

- `apps/api/.dev.vars.example` names the requester's sandbox secret file, `private-kr-outsidetool-sandbox-secret.txt`. A comment only; no code changed.

## Immediate (the requester)

1. Deploy the API: krhomebase.com does not have `POST /v1/tools/registrations/{toolId}/sandbox-secret` yet (checked Nov 23, 2026: 404). The deployed sandbox Worker reports 1.2.0 p55; that is the same code (this patch changes no code), so it need not be deployed again.
