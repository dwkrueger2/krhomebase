# Outstanding Task List: Repository Patch 37

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 1:32pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 37  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch036_11_14.md`
**Same change set:** API patch 32 (the feedback routes opened to tools). Branch `impeccable-11-09`. Repository patch 36 (the Billing audit, another session) is a separate change set in the same folder.

## Completed by this patch

- **The Homebase Feedback viewer as a registered outside tool** (plan 12, stage F5; decision 3 changed by the requester on Nov 14, 2026). `workers/feedback-viewer/` (`krhomebase-feedback-viewer`):
  - **Built as a separate developer would build it, as a test of the tool kit.** It uses only the kit's public entry points (`@krhomebase/tool-sdk/frame`, `/manifest`, `/types`). Its reply shapes are written by hand from `openapi.json`. It does not use `@krhomebase/contracts`. `src/tool.test.ts` checks the imports, and checks that the README's registration sheet matches `registrationSheet(tool)`. The top of its `README.md` says so and names where the kit's guide, code, example and API reference are.
  - **Pages:** the list (status and kind filters), one request (text, markers, page context, images listed, notes), status and priority change (shown for confirmation first) with a note, add a note, and "Copy for Claude" with `plan FB-0012`.
  - **Build and hosting:** static files built by Vite into `dist/`. Served by the Worker from `https://krhomebase-feedback-viewer.dankrueger.workers.dev`, a different site from `krhomebase.com`, as `docs/05_Outside_Tools.md` asks. It has no bindings and no secrets.
  - **Security headers:** `public/_headers` sets the Content-Security-Policy (framing only by `https://krhomebase.com`, only its own script and stylesheet, no network calls of its own), `no-store`, `nosniff` and `no-referrer`.
- **Replaced before commit:** the first build (server-rendered pages behind Cloudflare Access on `feedback.krhomebase.com`, a shared secret, a special path in the API) was removed. That also removes its `.dev.vars.example`, the Access settings and the planned `feedback-viewer-secret.key`.
- **Kit and design documents:**
  - `packages/tool-sdk/README.md` 1.2: the new permission names, the routes open to tools, and that the clipboard may be refused in the frame.
  - `docs/05_Outside_Tools.md` 1.2, section 4: what is open to tools.
- **Root scripts:**
  - `dev:feedback-viewer` (port 5174) and `stop:port:5174`, which is also part of `stop:ports:all`.
  - `deploy:feedback-viewer` now builds first.
  - The viewer stays in `typecheck` and `test`. Its development dependency `vite` (same version as `apps/web`) is in `pnpm-lock.yaml`; no new outside package was downloaded.
- **Documents:**
  - the viewer's `README.md` 2.0 (go-live steps, and "What this test found about the kit");
  - root `AGENTS.md` 2.19 (the viewer rule, port 5174, scripts);
  - `workers/Readme-workers.md` 2.0;
  - `docs/04_Deployed_Architecture.md` 2.2 (section 7);
  - `docs/12_Homebase_Feedback_Plan.md` 1.2 (decision 3 changed, "What F5 built").
- **Web track:** no web file changed, so there is no web patch. The registration form shows the two new permissions once the web app is rebuilt with the new contracts.
- **Checks:**
  - `pnpm check` passed (the viewer: 16 tests);
  - `vite build` and `wrangler deploy --dry-run` for the viewer passed (no bindings);
  - `pnpm openapi` was run (API patch 32).

## Immediate (the requester)

1. Commit this patch with API patch 32.
2. `pnpm deploy:hot` (API and web), then `pnpm deploy:feedback-viewer`. Check that the printed address is `https://krhomebase-feedback-viewer.dankrueger.workers.dev`.
3. Register the tool: Settings → Application Settings → Outside tools, the values in the viewer's `README.md` ("Registration sheet"), both feedback permissions, and the developers' main roles.
4. Give each developer the Internal Developer role set (Settings → Users).
5. Carried from patches 35 and 36:
   - commit, `pnpm deploy:hot`, `pnpm deploy:public-article`, the smoke pass;
   - the Billing audit decisions B1 to B5 and C4.

## Later

- After the viewer is live: record its version id in `workers/Readme-workers.md`, and move its line in `docs/04_Deployed_Architecture.md` from section 7 into sections 1 to 5.
- **The kit, before it is published in its own GitHub repository:** work through the viewer README's "What this test found about the kit". In short:
  - say that a new permission needs a new kit version;
  - add a role list to `defineTool` and the registration sheet;
  - list the stable `--kr-theme-*` names;
  - decide on the clipboard (`clipboard-write`);
  - carry binary replies, or image addresses, for F3;
  - fix the `{number}` pattern in the API reference;
  - generate typed route replies;
  - add a starting path for deep links.

  Then switch the viewer to install the kit from that repository.
- F3: the viewer shows the images (needs the bridge decision above); F4 as planned; a person filter on the list (needs an API list filter); the "Copy plan" box of plan 3.6.
- Carried from patch 35:
  - a first real `pnpm deploy:warn 1 -Estimate 1`;
  - the `kr_maintenance_gate` page in `docs/Schema_8.0`;
  - the old `kr-r2-public-article-worker` copy;
  - the matter without a client party;
  - `www.krhomebase.com`;
  - the external API's domain;
  - plan 10 stages 7 and 8;
  - the `--no-promote` check at the next vinext upgrade.
- Carried from patch 36: parts 7a to 7f of the Billing audit's build order.
