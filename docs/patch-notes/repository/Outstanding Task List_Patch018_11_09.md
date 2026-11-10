# Outstanding Task List: Repository Patch 18

<small>Version 1.2</small><br>
<small>Updated Nov 9, 2026 3:30pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 18  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch017_11_09.md`
**Same change set:** API patch 7 (contacts read, permissions, write gate).

## Completed by this patch

- `workers/d1-workers/kr-pay-worker` is now `kr-pay-worker-live`: bound to `krhomebase` (id `ef68921f-…`), claims `pay.krhomebase.com`, one deployment (the old `env.dev` block is gone), `version_metadata` binding. Payment code unchanged.
- Version metadata on every pay-site response: headers `X-KR-Worker`, `X-KR-Version` (repository track, read from the root `package.json` at bundle time) and `X-KR-Deployment` (Cloudflare deployment id); `meta` in JSON bodies; `<meta>` tags in pages. New file `payWorkerVersion.ts`. Bundled and checked with a stand-in database in a scratch copy.
- Root script `deploy:pay`. `README.md` (1.8) in that folder: setup steps. `workers/Readme-workers.md` (1.4), `docs/04_Deployed_Architecture.md` (1.2), root `AGENTS.md` (2.7).
- `docs/06_Contacts_Billing_Port_Plan.md` (1.2): answers to the eight differences, item 6 explained, fuzzy-match kept, section 7 (what replaces each crud Worker protection), pay-site move.

## Immediate (the requester)

New in this patch:

1. **Pay site moved** (Nov 9, 2026): databases compared (identical: 1 open, 3 posted, 3 revoked; last change Oct 22), KEK set, `pnpm deploy:pay` done, `pay.krhomebase.com` now on `kr-pay-worker-live`, version `e86c85ac-8295-4286-98c8-145060fde00d`. Still to do:
   1. Check `/health` from PowerShell. Done Nov 9: `kr-pay-worker-live`, `1.0.0 p18 (11-09)`, both Stripe profiles `ready`.
   2. (Withdrawn Nov 9: `kr-pay-worker-dev` stays for side-by-side comparison with the old app.)
2. Confirm item 6 of the plan (Stripe and pay links last), now explained in section 4.

Carried from patch 017: none open except the eight differences, now answered.

Carried unchanged from patch 016: `pnpm install` and `pnpm check`; apply the workspace tools migration; deploy API, external API and web in order; choose the external API's public address; build and test the tool kit file; and the seven items carried from patch 015.

## Later

- Paid pay links are not posted to the ledger until plan stage 6. Until then they stay `paid` in `krhomebase`.
- Carried unchanged from patch 016.
