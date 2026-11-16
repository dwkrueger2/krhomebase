# Outstanding Task List: Repository Patch 56

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:39pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 56  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch055_11_16.md`
**Same change set:** documentation only; no API or web patch. Branch `impeccable-11-09`.

## Completed by this patch

- `docs/00_PromptMemoryStart.md` 1.8: "the requester" defined; `krhomebase` named the live database; `pnpm dev` works on live data (3.4, item 4); Claude runs `pnpm check` itself (the old "no shell" line removed); commit message text only (3.5); steps already done are not given again (3.6); new 3.7 Homebase Feedback requests and bug reports; section 4 lists docs 01 to 12, every local `AGENTS.md`, `PRODUCT.md` and `DESIGN.md`.
- `docs/04_Deployed_Architecture.md` 2.7: last deploy (Nov 16, 2026, `98765b0`); ten Workers, with `krhomebase-feedback-viewer` and `krhomebase-public-article-worker` added to sections 1, 2 and 4; the API bindings `ARTICLES`, `FEEDBACK_STORAGE`, `DOCUMENTS`; the API secret list checked Nov 16; section 7 keeps only what is not live (the external-api domain, the public site switch).
- `docs/11_Deployment_PromptStart.md` 1.8: sections 4 (live now), 5 (nothing waiting) and 10 (open items) as of Nov 16, 2026; 6.3 marked as the done Nov 14 release.
- `docs/12_Homebase_Feedback_Plan.md` 1.7 and `AGENTS.md` 2.26: F4 and F5 are live; `AGENTS.md` gains the `pnpm dev` live-data warning under "Development servers and ports".
- Every fact checked read-only on Nov 16, 2026: `wrangler deployments status` for each Worker, `wrangler secret list` on the API and the viewer, `wrangler r2 bucket list`, and a `SELECT` on `workspace_tool`.

## Immediate (the requester)

1. Commit (documentation only); nothing to deploy.

## Later

- `AGENTS_02_commit-push-procedures.md` still tells agents to give the `git add` and `git commit` commands; the requester's rule is the commit message text only (now in `00_PromptMemoryStart.md` 3.5). Align `AGENTS_02` when the requester agrees.
- Check whether the public site reads `krhomebase-public-article-worker` (04 section 7).
- Carried from patch 55.
