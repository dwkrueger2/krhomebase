# WorkStream, Leads, Tasks and Publishing Port Plan

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 9:30am</small>

## 1. The requester's direction (Nov 13, 2026)

The Settings and Dashboard port (`docs/08_Settings_Dashboard_Plan.md`, stages 0 to 9) is complete. The follow-ups it left are listed in section 4.

Next, in this order:

1. Projects & Matters, copied from the old Contact Detail tab.
2. Communications / WorkStream.
3. Leads, which use WorkStream.
4. WorkStream in the client view (Contact Detail).
5. Tasks.
6. Front End Publishing.
7. A check for missing Billing features ("there was a lot").
8. A check of the Stripe payment system: keys, sandbox, and resetting keys if necessary.
9. Deploy.

**Working rules:**
- The old repository is read-only: read only from `apps\kr-homebase` and `apps\shared`.
- Every stage follows the AGENTS guides, the Density Contract (`apps/web/DESIGN.md`) and the version tracks (`AGENTS_01`).
- Database writes and migrations are written out for the requester to run.

## 2. What exists today

These figures are rough sizes from the old app (`apps\kr-homebase\src`), measured Nov 13, 2026.

| Area | Old screens | Old routes | New repository now |
|---|---|---|---|
| Projects & Matters | `hb-components/KR-EditMatter` (about 780 lines: `ClientMattersCard`, `MatterEditCard`, `MatterSelector`, `MattersSummaryCard`, `SelectedMatterDetailsCard`) | `api/kr-api-v1/matters` (list, save, `deleteCheck`, delete), `api/matters`, `api/matters/activity`, `api/kr-api-v1/matter-import-instructions` | The Contact Detail tab exists but is empty. Billing reads matters. There is no `matters` API feature yet. `apps/web/features/matters` is empty. |
| Communications / WorkStream | `KR-Communications` (about 2,900 lines) and `KR-WorkStream` (about 1,900) | `api/workstream/[subgroup]`, `api/workstream/[subgroup]/[wsid]`, `api/workstream/assignees`, `api/kr-api-v1/workstream/send-email` | The theme already has the Communication Colors (dark tokens). The mailer exists (`KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY`). `features/communications` is empty. |
| Leads | `KR-Leads` (about 1,150 lines) | `api/kr-api-v1/leads` | Data Import skips lead rows "until the Leads port". `features/leads` is empty. |
| Tasks | `KR-Tasks` (about 150 lines) | `api/tasks` | `features/tasks` is empty. |
| Front End Publishing | `modules/front-end-publishing` (about 2,560 lines) | `api/front-end-publishing` (package, prompt, download, assets) | The article prompt card exists (Other Configuration). The R2 articles keys are only in the old `private` folder (`docs/09_ENV_KeyMappings.md`). The article image license rule waits (plan 08, decision 7). |
| Billing | `KR-Billing` (about 10,400 lines) | many (`docs/API/`) | About 3,800 lines of screens: the six tabs. Print, email and Stripe were shown disabled in plan 06, stage 5. |
| Stripe | Settings page and the pay Worker | `pay.krhomebase.com` | Ported exactly (plan 08, stage 6). `KR_PAYMENT_PROVIDER_KEK` must be set to the key file (Nov 12, 2026). |

## 3. Stages

| Stage | Work | Tracks |
|---|---|---|
| 0 | **As-is reference.** Read the old routes, tables (`docs/Schema_8.0`) and screens for every area below and write `docs/API/WorkStream_AsIs_Reference.md`. List each old route, the tables it touches, its rules, and the new route proposed. List the decisions for the requester (section 5). No code. | docs |
| 1 | **Projects & Matters.** API `src/features/matters/`: list a client's matters, create, change, the delete check and delete, with audit rows and the write gate. Contracts in `matters.ts`. The Contact Detail tab (`data-kr-id-menu="Contact-Detail-Menu-<client>"`) gets the old cards in `features/matters/`. The ASSOCIATED MATTERS box on Detail is filled. | contracts, API, web |
| 2 | **WorkStream core.** The WorkStream routes (by subgroup), assignees and send-email; the Communications section; the dark Communication Colors. | contracts, API, web |
| 3 | **Leads.** The leads list and lead detail with its WorkStream, and the Data Import lead rows (`features/data-import/contactImportValidation.ts` notes the lead-attach rules). | contracts, API, web |
| 4 | **WorkStream in the client view.** The Contact Detail WorkStream tab, for clients and their matters. | web (API from stage 2) |
| 5 | **Tasks.** The tasks list and the task card, with links to matters, leads and WorkStream entries. | contracts, API, web |
| 6 | **Front End Publishing.** Package, prompt, download and assets. The R2 articles bucket binding. The image license rule (plan 08, decision 7: a schema change in the public content database). | contracts, API, web, migration, Worker secret |
| 7 | **Billing audit.** Compare the old `KR-Billing` with the new tabs feature by feature and write the missing list. Then build in order: print, invoice and statement email with attachments, the pay-link-paid route for `kr-pay-worker-live` (`KR_HOMEBASE_PAY_WEBHOOK_URL`), and anything else the audit finds. | API, web |
| 8 | **Stripe check.** Confirm `KR_PAYMENT_PROVIDER_KEK` on the API matches the pay Worker (`/health`). Open Stripe Payment Configuration, re-enter or reset the Live and Sandbox keys and webhook secrets if they show "different encryption key", and run the sandbox card and ACH tests. Check that both webhook paths answer. | requester with agent |
| 9 | **Deploy.** Apply the migrations, set the secrets, then deploy the API, the web app, external-api and the pay Worker in that order. Update `docs/04_Deployed_Architecture.md` and run a smoke test as each test account. | requester |

## 4. Open follow-ups carried from plan 08 (not stages here)

- **Checks by the requester:**
  - As 001: Firm Settings → Users, the Edit Employee / Edit User tab, and the holiday wastebasket.
  - Confirm the R2 bucket `kr-homebase-employee-storage` exists.
  - Grant `employee_documents` own read to the role sets that need it.
- **GPT Model Gateway go-live:** the Worker's database, its secrets, its deploy, and the API binding.
- **Not yet built:**
  - Outside tools' Dashboard widgets.
  - The Review Queue widget.
  - The user photo (media storage; keys listed in `docs/09_ENV_KeyMappings.md`).
- **Small fixes:**
  - Contact Detail's own-record check uses `isCurrentUser`, which the cache drops.
  - The remaining text glyphs move to `KRHomebaseIcons`.
  - Older screens move to the Density Contract.
  - Contact import: entity status, formation state and EIN.

## 5. Decisions for the requester (to confirm in stage 0)

| # | Question | Recommendation |
|---|---|---|
| 1 | WorkStream subgroups: which ones are kept (client, matter, lead, internal)? | Keep the old set; stage 0 lists them from the old routes. |
| 2 | Does WorkStream email go through the existing mailer (`KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY`)? | Yes. Do not add a second mail path. |
| 3 | Front End Publishing: does the articles R2 bucket bind to the API directly, or go through the old articles Worker (`KR_R2_ARTICLES_WORKER_TOKEN`)? | Bind the bucket to the API, as Employee Documents does, unless stage 0 finds a reason not to. |
| 4 | Billing audit: build everything missing before the deploy, or deploy first with the missing list recorded? | Deploy after stage 8 with Billing print and email in place. Record the rest. |
