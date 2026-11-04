# KR Homebase Web Agent Guide

<small>Version 1.8</small><br>
<small>Updated Nov 4, 2026 12:00pm</small>

## Purpose

`apps/web` is the screens: Next.js (App Router) built with vinext and deployed as the `krhomebase-web` Worker. It shows data and collects input. It holds no database code and no business rules. The repository guides in the root (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply as well: versioning, commits, documentation headers, coding style, Tailwind and D1 procedures. This folder is the web version track: changes under `apps/web` advance `version`/`patchNum`/`patchDate` in `apps/web/package.json` as `AGENTS_01` describes. Before touching any `.tsx` or `.css` file, do the styling preflight in the root `AGENTS.md`.

## Boundary rules

1. **No database.** `web` has no D1 binding and never imports from `apps/api`.
2. **One door to the API.** Server code calls the API only through `lib/api.ts` (`callApi`), or later through the generated `packages/api-client`. Components never call `fetch` directly for API data.
3. **Browser calls** go to `/api/v1/...` on the same host name. `app/api/[...path]/route.ts` forwards them to the API Worker. That file holds no business rules.
4. **Shapes come from `@krhomebase/contracts`.** Parse API replies with the shared zod descriptions; do not re-declare them.
5. **No secrets in this app.** Secrets and provider keys belong to `apps/api`.
6. **No test-only routes in the deployed app.** Test pages, prototypes and development-only API routes do not ship in `apps/web`. Put them in tests, or behind a development-only flag that is off in production.

## How the API is reached

- **Deployed:** the service binding `API` declared in `cloudflare.config.ts`. The API has no public address.
- **Local development:** `callApi` calls `http://localhost:8787` (override with `API_DEV_URL`). Start the API with `pnpm dev:api`, or both with `pnpm dev`.

## Folder layout

```text
apps/web/
  app/          Routes only. A page places a screen from features/ and holds no screen logic.
  components/   Pieces that more than one feature uses. Knows nothing about any feature.
    ui/           Small parts: buttons, fields, cards, badges, tabs, the busy spinner.
    dialogs/      Dialogs, such as U6ConfirmationDialog.
    tables/       The ledger (the dense record table) and its parts.
    shell/        The frame around every screen: left panel, top title bar, working panel, menu, logo, icon.
  features/     One folder for each business area.
    <area>/       components/ (screens and parts for this area only), api.client.ts (this area's
                  calls to the API from the browser), and tests beside the code.
  lib/          Helpers: KRUtilities.ts (logging), api.ts (callApi). Session and permission helpers come later.
  styles/       theme.css, which holds the --kr-theme-* tokens.
```

Area folders now in place: `billing`, `communications`, `documents`, `employees`, `entities`, `individuals`, `matters`, `settings`, `tasks`, `timekeeping`, `users`. Create another (`feedback`, `leads`, `reports`, and so on) when its first screen is ported. An empty folder holds a `.gitkeep` file so Git keeps it; delete that file when the first real file arrives.

Rules:

1. **Start in the feature.** A piece moves to `components/` only when a second feature needs it.
2. **Dependencies run one way:** `app` uses `features`, `features` use `components`, and all of them use `lib`. A component never imports from a feature. A feature never imports another feature's internal files.
3. **Area names match the rest of the repository.** A folder in `features/` has the same name as its folder in `apps/api/src/features` and its file in `packages/contracts`. Use plain nouns. No `kr-` or `hb-` prefix, and no folder repeats its parent's name. `U6ConfirmationDialog` and `RainbowBusySpinner` keep their old names because they were ported from the old app.
4. **One folder per component only when it has several files** (for example the component, its CSS module and its test). A one-file component sits directly in its parent folder.
5. **No `index.ts` files.** Import each file by its own path, so the file name states its purpose and is easy to search. Next.js does not need `index` files: routes in `app/` come from the fixed names `page.tsx`, `layout.tsx` and `route.ts`, which stay thin.
6. **Keep files short.** Split a file that grows past about 400 lines. Split large CSS by component.
7. **No prototypes or sample data in these folders.** Put samples in tests, or in a development-only route that is off in production (see boundary rule 6).
8. **Shapes and calls.** API shapes come from `@krhomebase/contracts`. A feature's browser calls to the API live in its `api.client.ts`. Components do not call `fetch` for API data.

## Styling: where classes go, screen widths, spacing and corners

**Where classes go.** Every new component keeps its Tailwind classes in two named maps in its own file, as `AGENTS_05` describes. `LAYOUT_STYLES` holds layout: margins, container padding, gaps, grid and flex. `STYLES` holds everything else visual: color, border, type, shadow, state. A new component gets no CSS file of its own for appearance. A CSS file is for the cases `AGENTS_05` lists (print, pseudo-elements, animation, custom properties). `U6ConfirmationDialog` has no CSS file. `RainbowBusySpinner` keeps `RainbowBusySpinner.module.css` because it needs a pseudo-element, a gradient ring and a spinning animation.

**Three designed widths.** Design and check each screen at three widths only. Use only the unprefixed class, `md:` and `lg:`. Do not use `sm:`, `xl:`, `2xl:` or a custom breakpoint.

| Name | Width | Class prefix | Review at |
|---|---|---|---|
| Mobile | under 768px | none | 390px |
| Tablet | 768px to 1023px | `md:` | 768px |
| Desktop | 1024px and wider | `lg:` | 1280px |

Widths between these are not designed. Fluid sizing absorbs them: `clamp()`, `minmax()`, `max-w-*` and `min-w-0`. Example: the application title is `clamp(20px,2.4vw,30px)`. Nothing may scroll sideways at 320px.

**Tight spacing.** The screens are dense on purpose.

- Gaps between elements: 4px to 8px.
- Input and button vertical padding: 6px to 8px.
- Card and panel padding: 10px at most.
- Text: 13px to 14px for body, 10px to 12px for small print.

**Save height before width.** Screens run out of height long before they run out of width, so every extra line in a form costs a row the person must scroll past. The defaults:

- Put a label on the same line as its field: label on the left, field on the right. In a grid, use a narrow label column and a wide field column. The label and the field share one row (`AGENTS_05`).
- Put short fields side by side on one row, such as date, amount and status, or first name and last name.
- Put help text in a tooltip, or after the field on the same line. Do not give it a line of its own.
- Keep headings to one line. Do not stack a heading, a sub-heading and a description above a form.

A label may sit above its field when any of these is true:

1. The field is tall or wide: a text area, an editor, a list or a table.
2. The block is small and short, like the "Module [TBD]" card, and the screen has room or scrolls anyway.
3. The screen is at mobile width (under 768px), where there is no room beside the field.
4. The label is too long for the label column and cannot be shortened.

The test: a form or panel that people use again and again must be visible whole, without scrolling, in a 1280 by 720 window. If it does not fit, move labels inline and put short fields side by side until it does. A screen that scrolls by nature (a long list, a settings page, a report) may use either layout. These are defaults, not a ban; the requester may allow an exception for one screen, and the file says why in a one-line comment.

**Corners: 2px to 4px.** Use `rounded-[2px]`, `rounded-[3px]` or `rounded-[4px]` on sections, cards, buttons, fields and dialogs. Do not use `rounded-lg`, `rounded-xl`, `rounded-2xl` or `rounded-3xl` there. A full circle is allowed only for avatars, status dots, small count badges and the round collapse handle on the left panel.

## Tooling notes

- Config files: `vite.config.ts`, `cloudflare.config.ts` (generated by `vinext init`) and `vitest.config.ts` (tests only). The old `wrangler-krhomebase-vinext.jsonc` approach is not used here.
- **Tailwind CSS 4** is installed (`tailwindcss` and `@tailwindcss/vite`). `app/globals.css` holds `@import "tailwindcss"` and is imported by `app/layout.tsx`. There is no `tailwind.config` or PostCSS file. The old app used Tailwind 3.4; when porting a screen, check renamed utilities (for example `shadow-sm` is now `shadow-xs` and `rounded` is now `rounded-sm`) and read the Tailwind 4 upgrade notes before assuming a class behaves the same.
- **Tests** run with vitest (`pnpm --filter @krhomebase/web test`, also part of `pnpm check`). Test files sit beside the code as `*.test.ts` and `*.test.tsx`, in `lib/`, `components/` and `features/`. The header of `lib/KRUtilities.test.ts` shows the commands to run all tests, one file, or watch mode. Component tests render to text with `react-dom/server`; there is no browser test setup yet.
- **Shared pieces:** `lib/KRUtilities.ts` (the `L` logging helper and color tables, see root `AGENTS.md`), `lib/api.ts` (`callApi`), `components/dialogs/U6ConfirmationDialog.client.tsx` and `components/ui/RainbowBusySpinner.client.tsx`. Both were ported from the old app with their comments kept. The dialog styles itself with `LAYOUT_STYLES` and `STYLES` and the `--kr-theme-*` tokens, so render it inside the application frame. The spinner still reads the old `--kr-*` custom properties from its CSS module and falls back to the old colors.
- Cloudflare binding types are generated into `.cloudflare/types` by `pnpm typecheck` (`cf workers types`). They are git-ignored.
- vinext cannot load native Node modules (for example `sharp`) in Worker code. Do not import one; use a Workers-compatible library or move the work to `apps/api`.
- The build tooling includes beta packages (`cf`, Cloudflare Vite plugin 2.0 beta). Do not upgrade them casually; check `pnpm build` and `pnpm check` after any change.

## Carried over from the old app (apply when screens are ported)

These conventions came from the old `apps/kr-homebase` guide and are kept for screens:

- Use the `--kr-theme-*` design tokens for color and spacing. Do not replace them with hard-coded colors (`AGENTS_05`).
- **Theme scope.** Wrap the whole application frame in `<div data-kr-theme-scope="krhomebase">` and define the `--kr-theme-*` tokens on that selector in `styles/theme.css`. Do not define them on `html`, `body` or `:root`, unless a variable is documented as a bridge for ported CSS. This repository has no public site, but the scope stays so that theme choices never reach anything outside the frame.
- Give production elements `data-kr-id` and `data-kr-element` attributes that describe the production feature. Never use prototype numbers such as `p16`. Form rows get a `data-kr-element="...-row"` marker. These attributes are for inspection and automation, not for styling (`AGENTS_05`).
- Use `U6ConfirmationDialog` (or a custom `role="dialog"`), never `window.alert`, `window.confirm` or `window.prompt` (root `AGENTS.md`).
- Ported components keep their descriptive comments (`AGENTS_04`).
- Never import a test prototype into production UI. If a prototype is promoted, recreate it in `apps/web` and adapt its data, session, API, authorization, responsive behavior and accessibility; copying JSX alone is not complete.

The token list is in `styles/theme.css` (imported by `app/globals.css`), copied from the old app's default theme. Add a token there when a screen needs one; never write a color into a component that a token already names.

## Completion checklist

- [ ] No import from `apps/api`; no database or secret code in `apps/web`.
- [ ] API data goes through `callApi` or the generated client and is parsed with `@krhomebase/contracts`.
- [ ] `pnpm check` passes and `pnpm build` succeeds.
- [ ] The screen was opened in the browser and its layout inspected.
- [ ] New logging uses `L` with `[AREA:line]`; no native `alert`, `confirm` or `prompt`.
- [ ] Styling preflight done; comments, JSDoc and section markers follow `AGENTS_04` and `AGENTS_05`.
- [ ] `apps/web/package.json` `patchNum` and `patchDate` were advanced once, and the task list was written (`AGENTS_01`).
