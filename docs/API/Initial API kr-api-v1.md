Git branch: main
Working directory: D:\Repos\krhomebase

**There are 64 `route.ts` files under `krhomebase\api`.** I got them from a read-only folder listing of the old repo, without opening any file contents. Every web address starts with `/krhomebase/api`, which I left out of the table to save space. The methods (GET, POST and so on) are not shown because that needs reading each file. Sizes are the `route.ts` file size in KB.

| # | Address (after `/krhomebase/api`) | KB | Notes |
|---|---|---|---|
| 1 | `/admin/role-sets` | 20.0 | |
| 2 | `/admin/teams` | 11.0 | |
| 3 | `/admin/users` | 3.5 | |
| 4 | `/admin/users/[userId]/role-permissions` | 2.5 | |
| 5 | `/admin/users/[userId]/role-sets` | 8.9 | |
| 6 | `/auth/[provider]/start` | 4.5 | |
| 7 | `/auth/[provider]/callback` | 5.7 | |
| 8 | `/auth/turnstile/verify` | 2.3 | |
| 9 | `/session` | 3.4 | |
| 10 | `/billing` | 7.5 | Overlaps #20 |
| 11 | `/contacts` | 1.9 | Overlaps #31 |
| 12 | `/employee-documents` | 10.9 | |
| 13 | `/employee-documents/[documentId]` | 8.0 | |
| 14 | `/front-end-publishing` | 26.3 | |
| 15 | `/front-end-publishing/assets/[...key]` | 4.2 | |
| 16 | `/front-end-publishing/download/[id]` | 4.9 | |
| 17 | `/front-end-publishing/package` | 3.8 | |
| 18 | `/front-end-publishing/prompt` | 2.5 | |
| 19 | `/kr-api-v1` | 2.3 | |
| 20 | `/kr-api-v1/billing` | 83.5 | Overlaps #10 |
| 21 | `/kr-api-v1/billing/card-payment` | 11.2 | |
| 22 | `/kr-api-v1/billing/pay-link-paid` | 7.6 | |
| 23 | `/kr-api-v1/billing/payment-notice` | 6.6 | |
| 24 | `/kr-api-v1/billing/print-pay-link` | 6.7 | |
| 25 | `/kr-api-v1/billing/sample-pdf` | 5.3 | |
| 26 | `/kr-api-v1/billing/send-invoice` | 30.4 | |
| 27 | `/kr-api-v1/billing/send-statement` | 21.9 | |
| 28 | `/kr-api-v1/clients` | 20.8 | |
| 29 | `/kr-api-v1/contact-import-instructions` | 1.7 | |
| 30 | `/kr-api-v1/contact-maintenance` | 21.2 | |
| 31 | `/kr-api-v1/contacts` | 68.7 | Overlaps #11 |
| 32 | `/kr-api-v1/documents/storage-check` | 11.0 | |
| 33 | `/kr-api-v1/employee-policies` | 5.4 | |
| 34 | `/kr-api-v1/entities` | 5.0 | |
| 35 | `/kr-api-v1/firm-settings` | 6.6 | |
| 36 | `/kr-api-v1/individuals` | 6.9 | |
| 37 | `/kr-api-v1/leads` | 16.9 | |
| 38 | `/kr-api-v1/maintenance-gate` | 2.9 | |
| 39 | `/kr-api-v1/matter-import-instructions` | 1.7 | |
| 40 | `/kr-api-v1/matters` | 29.7 | Overlaps #51 |
| 41 | `/kr-api-v1/notifications/summary` | 4.6 | |
| 42 | `/kr-api-v1/operational-support` | 11.3 | |
| 43 | `/kr-api-v1/public-inquiries` | 14.7 | |
| 44 | `/kr-api-v1/site-feedback` | 14.3 | Overlaps #58 |
| 45 | `/kr-api-v1/theme-settings` | 8.5 | |
| 46 | `/kr-api-v1/timekeeping` | 0.5 | Overlaps #61. Tiny; may just pass through. Not read. |
| 47 | `/kr-api-v1/user-invites` | 12.3 | |
| 48 | `/kr-api-v1/users` | 62.8 | |
| 49 | `/kr-api-v1/workstream/send-email` | 9.3 | |
| 50 | `/kr-api-v1/article-helper-prompt` | 5.3 | |
| 51 | `/matters` | 5.3 | Overlaps #40 |
| 52 | `/matters/activity` | 3.5 | |
| 53 | `/media/[mediaId]` | 8.4 | |
| 54 | `/media/client-upload/[token]` | 5.0 | |
| 55 | `/media/profile-image` | 10.2 | |
| 56 | `/payment-providers` | 6.3 | |
| 57 | `/kr-gpt` | 16.4 | |
| 58 | `/site-feedback` | 8.2 | Overlaps #44 |
| 59 | `/stripe-dev-tests` | 21.8 | Looks like a test route in the production tree |
| 60 | `/tasks` | 16.3 | No `kr-api-v1` version |
| 61 | `/timekeeping` | 57.8 | Overlaps #46 |
| 62 | `/workstream/[subgroup]` | 4.5 | |
| 63 | `/workstream/[subgroup]/[wsid]` | 3.9 | |
| 64 | `/workstream/assignees` | 3.5 | |

## What the list shows

- **Five pairs of routes cover the same resource** at the top level and under `kr-api-v1`: billing, contacts, matters, site-feedback and timekeeping. Only `tasks` is top-level with no `kr-api-v1` version.
- **A correction to my earlier note:** I put the 58 KB timekeeping file under `kr-api-v1`. It is the top-level `/timekeeping` route (#61). The `kr-api-v1` version is only 0.5 KB.
- **Largest files:** `kr-api-v1/billing` (83.5 KB), `kr-api-v1/contacts` (68.7 KB), `kr-api-v1/users` (62.8 KB), then top-level `timekeeping` (57.8 KB).
- **Every route also has an `api-contract.json`,** which is the hand-kept description we'd replace.
- **Billing is spread across eight routes** (#20 to #27, plus #10).

I can add each route's methods by reading the route files from the old repo (read-only), and group them by business area for the port order. I can also save this table in `docs\`.