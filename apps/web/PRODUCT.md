# Product

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 10:20pm</small>

<!-- impeccable:product-schema 1 -->

This is the product record for the KR Homebase screens (`apps/web`). Impeccable reads it before any design work. It holds product facts only; the visual system belongs in `DESIGN.md`.

## Platform

web

## Users

- **Attorneys of Krueger & Richard, PLLC** (Dan Krueger, Marcus Richard). They use the app directly to look up clients, review matters and work billing.
- **Office staff.** They work in the app all day: contacts, time and fees, invoices, payments, trust, tasks.
- **Outside tool developers** (secondary). They build tools with `packages/tool-sdk` that open inside the application frame. Their guide is `packages/tool-sdk/README.md`; the screens only host their tools.

Clients do not use this app. The client payment site (`pay.krhomebase.com`, `kr-pay-worker-live`) is a separate Worker and outside this record.

## Product Purpose

KR Homebase is the firm's internal practice-management application. It keeps contacts, matters, time, billing and the firm's daily work in one signed-in place.

This repository is the migration target for the old `apps/kr-homebase` in `krueger-richard-website`. Success means each business area works at least as well as in the old app, on the new split of screens (`krhomebase-web`) and business rules (`krhomebase-api`), so the old app and its Workers can be retired.

## Positioning

It is built for one firm and its own way of working, not as a general product. Its value is that the firm's workflows (open-client lists, the client search by name or client number, the billing register, trust handling) behave the way the people who use them every day expect.

## Operating Context

- **Mostly a desktop at a desk:** large monitors, mouse and keyboard, long sessions, several clients open at once, and pop-out windows for a client's screens.
- **Sometimes a tablet** (the left menu collapses to icons) and **sometimes a phone** for quick lookups.
- **The application frame:** left menu of business areas; top bar with the application search (searches the browser's encrypted copy of the contact list, at least 3 characters, top 5 results) and the sync light (updating, current, stale, error; right-click "Refresh Data"); a "recently accessed" menu; open lists under Contacts and Billing (five at most); pop-outs that close on a browser refresh while the open lists stay.
- **Sign-in:** Google sign-in with a Cloudflare Turnstile check.
- **Data:** the screens never touch the database. Every read and write goes through the API, and every reply carries a `requestId`.
- **Dev View:** a development-only inspector reads `data-kr-id` and `data-kr-element` markers on the screens.

## Capabilities and Constraints

- **Business areas.** Done: sign-in, the application frame, Contacts Manager, Billing (Overview register, Time & Fees, Invoices, Payments, Trust, Help). Next in Billing: Print and Send (stage 5), then card and ACH payments, refunds and pay links (stage 6). Planned (phase D, order not yet agreed): Leads, Tasks and workstream, Attendance (time), Communications, Front End Publishing, Reports, Dashboard, Settings (user, application, firm, roles). Menu rows marked "Module [TBD]" are these areas. Plan: `docs/06_Contacts_Billing_Port_Plan.md`.
- **Outside tools** open in a frame inside the workspace or in a pop-out (`docs/05_Outside_Tools.md`).
- **Roles matter.** Some actions are reserved (for example, a super admin may void a payment or unlock an invoice).
- **Confirmations** use the custom `U6ConfirmationDialog`, never the browser's own alert, confirm or prompt.
- **User-configurable theme values** (spacing, padding, colors) stay as `--kr-theme-*` tokens in `apps/web/styles/theme.css`.
- **Styling** is Tailwind 4 with component-local `STYLES` and `LAYOUT_STYLES` maps (`AGENTS_05_coding-style-tailwindcss.md`).
- **Stack:** Next.js 16 on vinext, deployed as a Cloudflare Worker. React 19.
- **Terms:** "client" is a contact marked as a client with a client number and a status that is not inactive. "Matter", "time and fees", "trust", "register" are the firm's own words; keep them.
- **Open:** no accessibility standard has been set yet.

## Brand Commitments

- Name: **KR Homebase**. Firm: **Krueger & Richard, PLLC**.
- Existing assets: `KRHomebaseLogo` and `KRHomebaseIcon` (`apps/web/components/ui/`).
- The rainbow busy indicator (`RainbowBusySpinner`) is the established busy signal, including inside dialogs.
- Voice: plain language, no slang, the firm's own terms.

## Evidence on Hand

- The old app (`D:\Repos\krueger-richard-website\apps\kr-homebase`, read-only) is the reference for every workflow being ported.
- Real client data lives only in the `krhomebase` database and in git-ignored `snapshots/`. It must never appear in designs, mock-ups, screenshots or tests. Use made-up names and amounts.
- There are no testimonials, metrics or marketing claims, and none are needed.

## Product Principles

1. **Keep the workflows, improve the look.** The tasks, menus and order of steps carry over from the old app so nobody relearns their job. Clarity and appearance are free to improve.
2. **Built for all-day work.** Fast to scan, quick by keyboard, comfortable over long sessions with many clients open.
3. **Never lose work or leave doubt.** Saves, syncs and money actions show clearly what happened. Destructive and financial actions ask first and say what they will do.
4. **Client data stays private.** Show only what the task needs; never expose client data in logs, examples or shared views.
5. **One firm, one vocabulary.** Labels use the firm's terms and plain language.
