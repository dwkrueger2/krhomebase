# Settings and Dashboard Port Plan

<small>Version 1.8</small><br>
<small>Updated Nov 12, 2026 5:48pm</small>

This plan covers the Settings tab (User, Application and Firm Settings) and the Dashboard with its widgets. It records what exists today, the requester's direction, a recommended structure, the stages, and the decisions that belong to the requester. Nothing in it is built yet. It follows the same pattern as `06_Contacts_Billing_Port_Plan.md` (roadmap phase D: Dashboard, Settings) and `07_Attendance_Port_Plan.md`.

## 1. The requester's direction (Nov 11, 2026)

- Settings is the application's first stop and has become disorganized. Split it into three areas by **who may change what**:
  1. **User Settings:** what even the most basic user may set for themselves: theme (including a dark theme), auto logout time, what is on the dashboard, Employee File (to be decided), and a Time Card button that opens the Attendance card for the current user.
  2. **Application Settings:** who may sign in to KR Homebase and with which roles. These are **users** (sign-in accounts), not employees.
  3. **Firm Settings:** the firm itself. Employee Documents moves here (it was in Application Settings because users and employees were confused). The Firm Profile design is to be reworked, and Impeccable is to bring the Firm Settings sections to one consistent design.
- Keep the card style of three high-level IT cards, which need special focus: `firm-settings-gpt-model-gateway-card`, `firm-settings-stripe-payment-configuration-card` and `FirmSettingsMenu-option-data-management`.
- **GPT Model Gateway:** keep a similar style (it may be modified). Keep the bar on the left side of sections. Keep the Edit Model Connection dialog's look exactly. Give that dialog a `data-kr-id`.
- **Stripe Payment Configuration (strict):** keep its entire style, layout, structure and functionality as in the old app (`http://localhost:3001/krhomebase?section=firm-settings&firmSettingsSection=stripe-payment-configuration`).
- **Dashboard widgets:** build the widget feature, put the widget specification in the SDK (`packages/tool-sdk`), and mount `data-kr-id="dashboard-widget-employee-clock-in"` (ported from the old app) on the Dashboard.

## 2. What exists today

### New repository

- **Settings screens are placeholders.** `features/settings/components/` holds `SettingsPanel`, `UserSettingsPanel`, `ApplicationSettingsPanel` and `FirmSettingsPanel`; each shows the "Module [TBD]" card. The one finished screen is the super admin's **Outside tools** (`features/tools/components/OutsideToolsAdmin.client.tsx`), placed inside Application Settings by `app/page.tsx`.
- **Navigation:** `components/shell/navigation.ts` lists the sections (`settings`, `user-settings`, `application-settings`, `firm-settings` are children of Settings). The URL carries only `?section=<id>`; there is no second-level parameter yet. `app/page.tsx` maps each section id to a panel (`PANELS`); a missing key fails the type check.
- **Dashboard** (`features/dashboard/components/DashboardPanel.client.tsx`) is a placeholder and the default section. No widget concept exists.
- **API:** no routes for users, invites, role sets, teams, firm profile, employee policies, employee documents, payment providers, GPT, or user preferences. `features/permissions/` reads the role tables (no routes). Attendance already has the routes a clock widget needs: `GET /v1/timekeeping/clock-state`, `POST /v1/timekeeping/clock-in`, `POST /v1/timekeeping/clock-out`, `POST /v1/timekeeping/missed-clock-out`.
- **Theme:** one token set in `styles/theme.css` on `[data-kr-theme-scope="krhomebase"]`. No dark theme, no theme switch. `DESIGN.md` limits the dark token set to Communications.
- **Session:** fixed lengths in `apps/api/src/features/auth/rules.ts` (8 hours, or 30 days with "remember me"). No idle logout.
- **Tool kit** (`packages/tool-sdk`): `./frame`, `./server`, `./manifest` (`defineTool`), `./protocol` (bridge version 1: `krh:hello`, `krh:request`, `krh:set-title`, `krh:set-dirty`; host sends `krh:init`, `krh:response`), `./types` (`DisplayMode = 'workspace' | 'popout'`). `src/types.ts` must match `packages/contracts/src/tools.ts` (sync test).

### Old repository (read-only reference, `apps/kr-homebase/src`)

- **Router:** `hb-components/modules/settings/SettingsUsersPanel.client.tsx`: a landing page of choice cards, then the User, Application or Firm section, with three-level breadcrumbs.
- **User Settings:** `modules/settings/user-settings/UserSettingsSection.client.tsx`, parameter `?userSettingsSection=` (`user-settings`, `dashboard-settings`, `employee-file`, `time-card`). Personal Preferences: theme, starting page, auto logout (15, 30, 60, 120, 480 minutes; default 60), feedback button. Saved in `localStorage` only (`kr_homebase_user_settings_v1`). Idle monitor: `hb-components/session/KRHomebaseIdleSessionMonitor.client.tsx`.
- **Application Settings:** `modules/settings/application-settings/ApplicationSettingsSection.client.tsx` (1653 lines), super admin only, parameter `?applicationSettingsTab=`: User Management (users, invites, role sets per user), Role Sets, Teams and Scope, Employee Documents, Other Configuration (themes, article prompt), Web Site Feedback.
- **Firm Settings:** `modules/settings/firm-settings/FirmSettingsSection.client.tsx`, parameter `?firmSettingsSection=`: `profile` (entity row and the `lk_kr_firm_locations_profile` lookup), `employee-policies` (the `lk_kr_employee_policies` lookup; PTO, holiday pay, holiday calendar), `data-management` (bulk import), `gpt-model-gateway` (`ai-components/GptModelGatewayWorkspace` → `GptModelsPanel` → `GptModelConnectionsCard` with its CSS module and the dialog), `stripe-payment-configuration` (`firm-settings/stripe-payment-configuration/*`, table `payment_provider`).
- **Dashboard widgets:** `hb-components/dashboard/dashboardWidgetRegistry.ts` (definition: id, title, description, requiredRole, defaultEnabled, defaultOrder, size small/medium/wide), `DashboardWidgetGrid`, `DashboardWidgetShell` (card frame with collapse), `DashboardWidgetPreferences` (enable and order, per user, in `localStorage` key `kr_homebase_dashboard_widgets_v1`). Registered widgets: `employee-clock-in` (everyone) and `review-queue` (super admin; site feedback and public inquiries).
- **Clock widget:** `dashboard/EmployeeClockInWidget.client.tsx` with its CSS module: name, "Working Time Today" (refreshed every 30 seconds), status, Clock In, Clock Out, View Time Card, the period line and the regular hours.

### Database (Schema 8.0)

- Users and roles: `user`, `user_invite`, `user_sso_identity`, `user_role_set`, `user_permission_override`, `role_set`, `role_set_permission`, `role_set_permission_scope`, `team`, `team_lead`, `team_member`.
- Firm: `entity` (the firm's fixed id), `lookup` (`lk_kr_firm_locations_profile`, `lk_kr_employee_policies`, `kr_homebase_theme`), `hr_policy`, `hr_policy_rule`, `firm_holiday`, `firm_bank_account`, `payment_provider`.
- Employee documents: `employee`, `document_record`, `media_asset`, `employee_certification`.
- **No preference, dashboard or widget table exists.** GPT tables are in `Schema_GPT_Usage_1.1`.

## 3. Recommended structure

```text
Settings (landing: three cards, then the IT cards a super admin sees)
  User Settings            everyone; their own choices only
    Preferences            theme (light, dark), starting page, auto logout, feedback button
    Dashboard              which widgets show, and their order
    Time Card              opens Attendance on the viewer's own card, current period
    Employee File          to be decided (decision 6)
  Application Settings     super admin; sign-in accounts
    Users and Invites      who may sign in, account status, invites
    Role Sets              roles and their permissions
    Teams and Scope        team leads and members (Attendance team view depends on it)
    Outside Tools          already built; moves here as a tab
    Other Configuration    firm themes and the Upload Article GPT helper prompt (decision 7)
    Web Site Feedback      (decision 7)
  Firm Settings            everyone may read the profile; changes need the permission
    Firm Profile           reworked design (Impeccable)
    Employee Policies      PTO tiers, holiday pay, holiday calendar
    Employee Documents     moved from Application Settings
    -- IT cards (super admin), kept in their own card style --
    Stripe Payment Configuration   kept exactly
    GPT Model Gateway              similar style, the dialog kept exactly
    Data Management                kept card style
```

- **URL.** Keep the old parameter names so old links and habits still work: `?section=user-settings&userSettingsSection=…`, `?section=application-settings&applicationSettingsTab=…`, `?section=firm-settings&firmSettingsSection=…`. The shell reads and writes the second parameter as it does `section`, and the breadcrumbs grow to three levels.
- **Tabs inside an area** use `MenuStyleOne` (already ported for Contact Detail and Billing) so every Settings area has the same strip.
- **Who may do what is the API's decision.** Each section's routes use `defineRoute` `permission: {resource, action}`; the web app only hides what the API says the viewer cannot use.

## 4. Recommended design rules for Settings

- Firm Profile, Employee Policies, Employee Documents and the Application Settings tabs follow `DESIGN.md` (shared `KRModuleCard`, ledger, label-beside-field rows, 2px to 4px corners, `--kr-theme-*` tokens).
- The three IT cards are a stated **feature variation** in `DESIGN.md` ("Settings: IT cards"), with a surface brief in `.impeccable/surfaces/`, so Impeccable leaves them alone:
  - **Stripe Payment Configuration:** port the old structure, layout and behavior exactly. Its CSS becomes Tailwind maps value for value; a CSS module only for what `AGENTS_05` allows.
  - **GPT Model Gateway:** keep the left-side section bar and the overall feel; spacing and type may move to the shared scale. The Edit Model Connection dialog keeps its look exactly and gains `data-kr-id="firm-settings-gpt-connection-dialog"`.
  - **Data Management:** keep the card style.
- Run Impeccable `critique` then `polish` on Firm Settings only, after it is ported (AGENTS.md "Impeccable": narrow target).

## 5. Dashboard widgets (recommended design)

- **One widget definition**, used by built-in widgets and by outside tools:

  ```ts
  interface WidgetDefinition {
    id: string               // 'employee-clock-in'; data-kr-id is `dashboard-widget-<id>`
    title: string
    description: string      // shown in User Settings → Dashboard
    size: 'small' | 'medium' | 'wide'
    defaultEnabled: boolean
    defaultOrder: number
    requires?: { resource: string; action: string }  // the permission; replaces the old requiredRole
    refreshSeconds?: number
  }
  ```

- **In the SDK:** `packages/tool-sdk` gets the widget specification (`defineWidget()`, the type, the size list) and a new section in its `README.md`. A tool's manifest may list widgets; an outside widget is drawn in the same sandboxed frame as a tool page, with a new display mode `'widget'` and one new bridge message `krh:set-height` (frame to host). Both are additions, so `PROTOCOL_VERSION` stays 1 (`packages/tool-sdk/AGENTS.md`). `packages/contracts/src/tools.ts` gets the matching zod shapes, kept equal by the sync test. `docs/05_Outside_Tools.md` gains the widget path and its security notes (the frame sandbox is unchanged).
- **In the web app:** `features/dashboard/` holds the registry of built-in widgets, `DashboardWidgetGrid` (renders by registry entry, not by a chain of `if`s), `DashboardWidgetShell` (the card frame, a `KRModuleCard` variation), and the preferences screen used by User Settings → Dashboard.
- **First widget:** `dashboard-widget-employee-clock-in`, ported from the old `EmployeeClockInWidget`. It calls the existing Attendance routes (no new API), shares the clock-status logic with `TimeEntryControls` through a small shared piece (plan 07 said `ClockStatusButton` would move to `components/ui/` at this point), opens the missed clock-out dialog the same way, and has a View Time Card button that opens `?section=timekeeping`.
- **Where preferences live:** see decision 1.

## 6. Stages

Each stage ends with `pnpm check`, the task lists (`AGENTS_01`), and a browser check by the requester. Stages that add tables give the migration to the requester (`AGENTS_06`).

| Stage | Work | Tracks |
|---|---|---|
| 0 | As-is reference: the old Settings tree, every old route it calls, the tables, and the widget system (`docs/API/Settings_AsIs_Reference.md`). Confirm the decisions below. | docs |
| 1 | Settings frame: the landing cards, the three areas with `MenuStyleOne` tabs, the second URL parameter and three-level breadcrumbs. Outside Tools becomes a tab. Placeholders where a tab is not built. | web |
| 2 | User Settings: preferences (decision 1), the dark theme (decision 2), auto logout with an idle warning (decision 3), starting page, the Time Card button. | contracts, API, web, migration if decision 1 picks a table |
| 3 | Dashboard widgets: the definition in the SDK and contracts, the registry, grid, shell and preferences, the clock-in widget mounted on the Dashboard. | tool-sdk, contracts, web, docs/05 |
| 4 | Application Settings: users and invites, role sets, teams and scope, web site feedback. | contracts, API, web |
| 5 | Firm Settings, ordinary sections: Firm Profile (reworked), Employee Policies (decision 5 of plan 07 kept the `lookup` row), Employee Documents. | contracts, API, web |
| 6 | Stripe Payment Configuration, ported exactly (table `payment_provider`; the pay Worker reads it). | contracts, API, web |
| 7 | GPT Model Gateway with its dialog (decision 4). | API or Worker binding, web |
| 8 | Data Management (bulk import). | API, web |
| 9 | Impeccable pass on Settings (critique, polish), Firm Settings first; the IT cards are excluded by their brief. | web |

## 7. Decisions for the requester

| # | Question | Recommendation |
|---|---|---|
| 1 | Where do user preferences (theme, auto logout, starting page, dashboard widgets) live? The old app used `localStorage` only, so they did not follow a person between computers. | A new table `user_preference` (user id, key, JSON value, updated time) with `GET` and `PUT /v1/me/preferences`; `localStorage` only as a fast first paint. |
| 2 | Dark theme: `DESIGN.md` limits dark tokens to Communications. | Add a dark `--kr-theme-*` set to `styles/theme.css` under `[data-kr-theme="dark"]` on the frame, and change `DESIGN.md` to allow it app-wide. Print stays light. |
| 3 | Auto logout: the API session lasts 8 hours (30 days with "remember me"). | The idle timer in the browser (choices 15, 30, 60, 120, 480 minutes; default 60) with a one-minute warning dialog (`U6ConfirmationDialog`), and the API ends the session on logout. The API session length stays as is. |
| 4 | GPT Model Gateway: the old screen calls the GPT models Worker. Which Worker and database does the new API bind to? | Decide in stage 7; until then the card shows as not yet ported. |
| 5 | Order of stages after 3. | 4 (who may sign in) before 5 to 8. |
| 6 | Employee File under User Settings: what is it? | Leave as "to be decided" until Employee Documents (stage 5) is built; then a read-only view of one's own documents. |
| 7 | Web Site Feedback and the article prompt (old Application Settings): keep? | Keep Web Site Feedback (with the review-queue widget later); drop the article prompt unless the requester names a use. |
| 8 | Feedback button preference (old User Settings). | Port only when the feedback feature is ported. |

### Answers (Nov 11, 2026)

The requester answered in the stage 0 prompt and confirmed the restated decisions 3 and 5 the same day.

| # | Answer |
|---|---|
| 1 | **As recommended.** Table `user_preference` (one row per user and key, JSON value), `GET` and `PUT /v1/me/preferences`, `localStorage` only for a fast first paint. The migration is `docs/patch-notes/repository/Migration_Patch026_11_11_user_preference.sql` (the requester applies it; the only earlier migration, patch 16, was confirmed applied). |
| 2 | **As recommended.** A dark `--kr-theme-*` set app-wide; the viewer's choice is the `appearance` key in `user_preference`. |
| 3 | **Confirmed:** keep the old behavior. A browser idle timer with the old choices (15, 30, 60, 120, 480 minutes; default 60) and the warning **5 minutes** before logout as the old app does (the plan had said 1 minute), shown as a `U6ConfirmationDialog` with "Stay signed in"; the API session lengths (8 hours, 30 days) do not change. New: the value follows the person (decision 1) and takes effect without a reload. |
| 4 | Decide in stage 7, and add a feature task: a Worker that manages GPT use. Stage 0 found that this Worker already exists in the repository (`workers/gpt-workers/gpt-models-worker.ts`, copied Nov 4, not deployed, no database id); the task is to review it, choose its transport (service binding from the API instead of the old public HTTPS address), give it its database, and deploy it. |
| 5 | **Confirmed:** stage 4 (who may sign in: users, invites, role sets, teams) comes before stages 5 to 8 (Firm Settings), because Teams feed the Attendance team view and Employee Documents uses team scope. |
| 6 | Employee File is the employee's own documents (the R2 files that Employee Documents stores). Build it after Employee Documents (stage 5) as a read-only view of one's own files; an HR-style employee card can grow from it later. |
| 7 | **Keep both** Web Site Feedback and the article prompt. New rule: every image in an article must carry a license. The image table `content_asset` (public content database) has no license field, so this needs a schema change there and a check where articles are uploaded; recorded as a task, outside this port's stages. |
| 8 | Do not port the feedback-button preference until the feedback feature itself is ported. |

## 8. Test accounts

The requester owns these three sign-ins and keeps them in the database for testing (roles as stored in `user.role`):

| Name | Number | Role | Email |
|---|---|---|---|
| Dan Krueger | 001 | super_admin | dankrueger@legaldrive.net |
| Dan Krueger (66) | 002 | attorney | dankrueger66@gmail.com |
| Dan-DevBIC Krueger | 003 | staff | dankrueger@bicproperty.com |

Use them to check each area as each role. The agent never signs in; the requester does.

## 9. Stage 0 results (Nov 11, 2026, repository patch 26)

- **Written:** `docs/API/Settings_AsIs_Reference.md` (1.0): the old Settings router, landing cards and breadcrumbs; User Settings and the idle logout; Application Settings (six tabs, 20 routes); Firm Settings (Profile, Employee Policies, Data Import); Stripe Payment Configuration recorded class for class; the GPT Model Gateway with the Edit Model Connection dialog's exact markup and CSS; the widget registry, grid, shell, preferences and `EmployeeClockInWidget`.
- **Written:** the `user_preference` migration (decision 1), tested on a scratch SQLite database (bad JSON, unknown users and duplicate keys are refused; deleting a user removes their rows).
- **Found:** the idle warning is 5 minutes, not 1 (decision 3); the GPT Worker already exists (decision 4); the article image table has no license field (decision 7); nine native `window.confirm` calls to replace; `user.role` and `user.role_set_id` can disagree in the old user save (reference section 9).
- **Next:** stage 1, the Settings frame (web only; it does not need the migration). Decisions 3 and 5 were confirmed Nov 11, 2026.

## 10. Stage 1 results (Nov 11, 2026, web patch 519)

- **Built:** the landing page (User, Application and Firm Settings cards; then, for a super admin, "Firm IT · Super Admin" with the Data Import, GPT Model Gateway and Stripe Payment Configuration cards in their old orange styles and with their old ids); the three areas as Menu Style One tabs with a placeholder card naming the stage for each page not built; Outside Tools as an Application Settings tab; anyone but a super admin sees a notice in Application Settings and no IT pages in Firm Settings.
- **Shell:** a second address parameter per section (the old names and values), read on first draw and written on change by `useSectionSubPage`; a third breadcrumb step; earlier breadcrumb steps open their section; a popped-out area keeps its own tab. Old `stripe-dev-tests` links open the Stripe page.
- **Design:** `DESIGN.md` 1.6 lists "Settings IT cards" under Feature variations, with the brief `apps/web/.impeccable/surfaces/settings-it-cards.md`.
- **Changed from the structure in section 3:** Application Settings gained "Other Configuration" (firm themes and the article prompt, kept by decision 7). The old landing page's Reports card (Reports has its own menu row) and its development-only Developer Tests card are not carried over.
- **Not built:** every page except Outside Tools; old `?applicationSettingsTab=employee-documents` links open Users and Invites.
- **Next:** stage 2, User Settings (needs the `user_preference` migration applied).

## 11. Stage 2 results (Nov 11, 2026, API patch 13 and web patch 520)

- **Built:** `GET` and `PUT /v1/me/preferences` (contract `packages/contracts/src/preferences.ts`; API `src/features/preferences/`; table `user_preference`, keys `appearance`, `session`, `navigation`); Settings → User Settings → Preferences (Theme, Starting page, Auto logout time) and Time Card ("Open my time card"); the dark theme app-wide; the idle logout; the starting section.
- **Decision 1, changed in one detail:** the server reads the preferences for the first draw, so the theme and starting section are right before anything is painted; browser storage was not needed for a fast first paint and is not used.
- **Decision 2:** the dark token set is in `styles/theme.css` (screen only; printing light), switched by `data-kr-theme` on the frame and on `<html>`. `DESIGN.md` 1.7 allows it app-wide. 35 hard-coded white surfaces (the shared ledger and Billing) now read the card-surface token, so they follow the theme; the light look is unchanged.
- **Decision 3:** the old idle monitor's behavior, the warning 5 minutes before in `U6ConfirmationDialog`, sign-out through the API, and the login page says why (`idle_timeout`). A changed limit applies at once.
- **Browser check:** saving Dark applied at once and survived a reload; Attendance, Billing search and the contacts ledger read well in dark; the theme was set back to light. These saves wrote to the live database on the requester's account (one preference row, two audit rows).
- **Not checked in the browser:** the idle warning and sign-out, the starting page, a Billing client's tabs in dark, pop-outs in dark (unit tests cover the timing, the starting section and the theme attribute).
- **Next:** stage 3, Dashboard widgets.

## 12. Stage 3 results (Nov 11, 2026, API patch 14 and web patch 521)

- **Widget specification:** `WidgetDefinition`, `WIDGET_SIZES` and `defineWidget` in `packages/tool-sdk` (re-exported from `./manifest`); a tool's manifest may list `widgets`; protocol additions `widget` display mode and `krh:set-height` (protocol version stays 1). The same shapes in `packages/contracts/src/tools.ts`, kept equal by the kit's sync test. Kit `README.md` 1.1 and `docs/05_Outside_Tools.md` 1.1 (section 7a) describe them.
- **Preference:** `dashboardWidgets` (key `dashboard` in `user_preference`): shown or hidden and order, by widget id.
- **Web:** the Dashboard draws the widgets `app/page.tsx` hands it, each in `DashboardWidgetShell` (`data-kr-id="dashboard-widget-<id>"`), in the person's order; User Settings → Dashboard shows or hides and reorders them (Up and Down), with Reset. The first widget is Employee Time Entry (`dashboard-widget-employee-clock-in`), ported from the old `EmployeeClockInWidget` with Attendance's routes and its missed clock-out dialog.
- **Fixed during the browser check:** the widget crashed the Dashboard before its first read (the missed clock-out dialog formats its date while closed); it showed "Clocked Out" before the first read; View Time Card was cut off in a narrow column.
- **Not built:** outside tools' widgets on the Dashboard (registration stores no widget list yet); the old Review Queue widget (waits for Web Site Feedback, stage 4).
- **Also done (the requester, Nov 11, 2026):** the Preferences drop-downs are 2px 3px with no minimum height (they were held at 30px by `min-h-[30px]`, which is why changing the padding in dev tools did nothing).
- **Next:** the user-theme decisions (section 13), then stage 4.

## 13. User themes: proposal and decisions (Nov 11, 2026)

The requester asked that people be able to set the `--kr-theme-*` values themselves, starting from a default that can be loaded. The old app (survey Nov 11, 2026, from `hb-components/theme/*` and `modules/settings/theme-settings/*`) had a full token editor for super admins only, two built-in themes (one with the misspelled id `krhomebase-default-theme-setings`), custom themes saved in `lookup` (category `kr_homebase_theme`; the live database holds rows "User Theme 1" to "User Theme 3" and more), and a theme chosen per browser, not per person. Ordinary users could not even read the theme list (the route was admin-only), every theme had to carry all 54 tokens (adding one later silently dropped stored themes), and the theme was applied as an inline style, which in the new app would beat the dark theme and print colors.

**Recommended design:**

1. **Three layers, each optional:** the built-in KR Homebase theme (`styles/theme.css`, light and dark) → a **firm theme** a super admin made (one may be marked the firm default) → the person's own **color overrides**. "Load default" offers two buttons: *Reset to the firm default* (drops the person's choice and overrides) and *Start from* a firm theme (copies it into the person's overrides to adjust).
2. **What ordinary users may change:** colors only (brand, accent, surfaces, text, lines, tables, buttons), each checked for contrast before saving, plus a **text density** choice (Compact 13/11, Default 14/12, Comfortable 15/13) instead of free sizes. Paddings, fonts and the Communications colors stay with super admins in firm themes, so no one can break the dense layout for themselves by accident.
3. **Light and dark kept apart:** every theme and override stores `{ "schemaVersion": 1, "light": {...}, "dark": {...} }` with only the tokens that differ; missing tokens fall through to the layer below, unknown ones are ignored, so a token added later never breaks a stored theme.
4. **How it reaches the page:** a generated `<style>` rule, screen only, for every theme scope under the current `data-kr-theme` (so dialogs, pop-outs and the dark switch all follow, and printing stays light). Only checked values (six-digit hex colors, listed presets) are ever written into it.
5. **Where:** the person's choice and overrides in `user_preference` (a new `theme` key); firm themes in the `lookup` table, where the old app already keeps them (see the answers below), with an editor in Application Settings → Other Configuration (stage 4) and JSONC import and export for super admins.

| # | Decision | Recommendation |
|---|---|---|
| T1 | Layers: firm themes plus personal overrides, only personal overrides, or only firm themes? | Firm themes plus personal color overrides (above). |
| T2 | What may an ordinary user change? | Colors (contrast-checked) and a text density preset; paddings, fonts and Communications colors only in firm themes. |
| T3 | Where do firm themes live? | A new small table `ui_theme` (id, name, light and dark JSON, firm default flag, audit columns), and copy the old `lookup` theme rows into it once, converted to the new shape. The old `lookup` rows stay untouched. |
| T4 | When? | Personal colors and density with the Preferences page as stage 2b (needs T1 to T3); the firm theme editor with stage 4 (Other Configuration). |

### Answers (Nov 11, 2026)

- **T1, T2 and T4: approved as recommended.** Personal colors and the text density preset come as stage 2b (with the Preferences page); the firm theme editor comes with stage 4.
- **T3: no new table.** The requester: use the `lookup` table, which was designed for settings like these so the database shape does not change for each small addition. A read-only check on Nov 11, 2026 found what is already there:
  - `lookup` category `kr_homebase_theme` holds three active firm themes from the old editor: `krhomebase-user-theme-1`, `-2` and `-3` ("User Theme 1" to "User Theme 3"; ids `lk_kr_homebase_theme_krhomebase_user_theme_<n>`), each valid JSON with 40 tokens in the old flat shape (`{ id, name, description, tokens: { <camelCase>: value } }`, light values only).
  - The old built-in themes ("KR Homebase Default" and "KR Teal Gradient") were never in the database; they lived in the old code (`hb-components/theme/KRHomebaseTheme.ts`). In the new app the built-in default is `styles/theme.css`, so "Reset to the default" needs no row.
- **So:** firm themes stay in `lookup` (category `kr_homebase_theme`); the API reads the old flat shape as the light values (camelCase names mapped to `--kr-theme-*`) and writes new themes in the versioned `{ schemaVersion, light, dark }` shape in the same `description` column, so the three existing rows work unchanged and nothing is copied or migrated. The firm default, when a super admin marks one, is one more `lookup` row (category `kr_homebase_theme_default`, the chosen theme id in its `value`), as Firm Profile and Employee Policies keep their settings. The person's own choice and color overrides go in `user_preference` (key `theme`), which already exists.

## 14. Stage 2b results (Nov 11, 2026, API patch 15 and web patch 522)

- **Documentation first:** `docs/Schema_8.0/table_lookup.html` now has a hand-written section "How KR Homebase uses this table": the two kinds of rows (choice lists and `kr_` settings rows), the id rules, every live category with an example id and who points at it, every settings row with its JSON and the code that reads it, and example queries. Every place in the code that reads `lookup` or names a `lookup` row id carries a comment pointing to it, and the root `AGENTS.md` (2.9) makes that a rule.
- **Built:** `packages/contracts/src/themes.ts` (the catalog of every `--kr-theme-*` setting with its old name, kind, value check and who may change it; the built-in values; the readability check; the layering); `GET /v1/themes` (firm themes and the firm default from `lookup`, both stored shapes, every value checked); the preference `personalTheme` (key `theme`; own colors checked for readability, 422 `PERSONAL_THEME_LOW_CONTRAST`); the Theme card under Preferences (firm theme, text size, own colors for the theme in use, Copy the theme's colors, Clear my colors, Reset to the firm default, live preview); the style rule drawn by the frame and pop-outs.
- **Text size names:** the approved Compact / Default / Comfortable became Compact 13/11 (the standard), Comfortable 14/12 and Large 15/13, because the app's own size is already 13/11.
- **Browser check:** the Theme card lists the three firm themes from the live `lookup` rows; choosing "User Theme 1" previewed it across the page; Undo put it back. Nothing was saved.
- **Not built:** writing firm themes and the firm default (stage 4 editor); the Communications colors, fonts and paddings stay out of personal reach by design.
- **Next:** stage 4.

## 15. Stage 4a results: Other Configuration (Nov 11, 2026, API patch 16 and web patch 523)

Stage 4 is split so each part can be checked on its own: **4a** Other Configuration (firm themes, firm default, article prompt), **4b** Teams and Scope, **4c** Role Sets, **4d** Users and Invites (needs the email decision below), **4e** Web Site Feedback (needs the feedback database decision below).

- **Built (API):** `POST /v1/themes`, `PUT` and `DELETE /v1/themes/{themeId}`, `PUT /v1/themes/firm-default` (super admin, audited, through the write gate; new themes in the versioned shape; an old-shape theme rewritten when saved; retire keeps the row with `is_active = 0`); `GET` and `PUT /v1/publishing/article-prompt` (the `lookup` row `lk_kr_article_helper_prompt_upload_article`). Contracts `FirmThemeBody`, `FirmThemeParams`, `FirmThemeSavedData`, `FirmDefaultThemeBody`, `THEME_VALUE_CHOICES` (themes.ts) and `publishing.ts`. 10 new API tests.
- **Built (web):** Application Settings → Other Configuration: **Firm Themes** (the old Theme Settings: choose a theme, New theme, Upload and Download `.jsonc`, Retire, Save theme; Firm default; Name and Description; Light and Dark editing; grouped settings with Expand all and Collapse all, gradient rows hidden while the accent strip is solid; the Theme in action sample; readability advice) and **Article Settings** (the prompt, Revert, Save prompt). Saving a change to an existing theme, retiring a theme and changing the firm default ask first in `U6ConfirmationDialog`; the old app used the same kind of dialog for save and delete. 9 new web tests.
- **Changed from the old screens:** both cards are open by default (the old ones started collapsed); the built-in themes are not listed as editable rows (the built-in theme is `styles/theme.css`, and every setting a theme leaves alone shows its built-in value); Article Settings has no "Restore Default", because the old default prompt was text in the old code; "Apply Theme" is gone, because each person picks their theme under Preferences.
- **Browser check (account 001):** both cards drew the live data: the three old themes ("Saved by the old editor: light values only"), no firm default, no saved prompt. The light and dark switch and the sample worked; one unreadable button state was fixed. **Nothing was saved**, so no theme, default or prompt was written to the live database.
- **Not checked in the browser:** saving, retiring, the firm default, upload and download (covered by API and web tests).
- **Decisions needed before 4d and 4e:**
  1. **Invitation email (4d):** the old app sent invitations through its Google Workspace mailer (`krGoogleWorkspaceMailer.ts`). Port that mailer into `apps/api/src/platform/` (its service account key would be a Worker secret you set), use another email service, or build Users and Invites first without sending email (copy the invitation link by hand)? **Decided (Nov 12, 2026): port the Google Workspace mailer** into `apps/api/src/platform/`. The requester sets its key as a Worker secret; no key goes in a tracked file.
  2. **Web Site Feedback (4e):** the old app kept feedback in table `site_feedback` of the public inquiry database, reached through the public-inquiry CRUD Worker. Give `krhomebase-api` a service binding to that Worker (as the old app did), or wait until the public inquiry app is ported? **Decided (Nov 12, 2026): bind the inquiry Worker.** The answer was in `apps/shared/d1-workers/crud-worker-pub-inquiry` (copied to `workers/` on Nov 4); the public site writes through the old copy of the same Worker.

## 16. Stage 4b results: Teams and Scope (Nov 12, 2026, API patch 17 and web patch 524)

- **Built (API):** `GET /v1/teams`, `POST /v1/teams`, `PUT /v1/teams/{teamId}` (super admin, through the write gate, one batch per save with one `audit_log` row, resource `teams`). Contract `packages/contracts/src/teams.ts`. 5 new API tests.
- **Built (web):** Application Settings → Teams and Scope (`features/teams/components/TeamsCard.client.tsx`): Team (existing or New team), Team name, Description, Employee members and Team leads with Find boxes and counts, New team, Revert, Save team. 4 new web tests.
- **Changed from the old screen:**
  - The old single POST becomes create (`POST`) and change (`PUT`).
  - The name is checked against every team row, active or retired, because the database's UNIQUE rule covers them all. The old route checked only active teams, so a clash with a retired team failed as a server error.
  - A whole save is one batch, so a team is never half saved. The old route made each change as its own call.
  - A save that takes people off a team asks first, naming them. The old card saved without asking.
  - A former employee (status other than active) is marked in the members list.
- **Kept from the old screen:** people taken off keep their row (`is_active = 0`, `ends_at`); a returning person gets their latest earlier row back; there is no delete or retire for a team (the old app had none).
- **Browser check (account 001):** the card drew the live data: no teams yet, 3 employees, 3 users. Typing a name, ticking a member and a lead, the Find box and the counts worked; New team cleared the form. **Nothing was saved.**
- **Not checked in the browser:** creating or changing a team, and the take-off question (covered by API and web tests).
- **Next:** 4c Role Sets.

## 17. Stage 4e results: Web Site Feedback (Nov 12, 2026, API patch 18 and web patch 525)

- **Where the feedback lives:** table `site_feedback` of the quarantined public inquiry database `kr_public_inquiry_06_2026` (id `8517c8e6-f557-4286-824f-30f01148c325`), written by the public site through the old Worker `crud-worker-pub-inquiry` (live since Jun 5, 2026) and read by the old app through the same Worker by its address. Found in the old repository's `apps/shared/d1-workers/crud-worker-pub-inquiry` and `apps/kr-homebase/src/hb-lib/public-inquiries/publicInquiryWorkerClient.ts`; `apps/kr-website-public` was not opened (hard rule 1 limits the old repository to `apps/kr-homebase` and `apps/shared`).
- **Binding:** this repository's copy `krhomebase-crud-worker-pub-inquiry` now names that database and has no public address; `krhomebase-api` reaches it through the service binding `PUBLIC_INQUIRY_WORKER`. **Not deployed yet:** the requester sets its secret and deploys it (`workers/Readme-workers.md`, "Put the public inquiry Worker live"), then deploys the API. Until then the page answers "cannot be reached" locally.
- **Built (API):** `src/platform/publicInquiryClient.ts`; `src/features/site-feedback/` with `GET /v1/site-feedback`, `PUT` and `DELETE /v1/site-feedback/{feedbackId}`, `POST /v1/site-feedback/bulk-update`, `/bulk-delete` and `/{feedbackId}/vote`. Contract `packages/contracts/src/siteFeedback.ts`. 6 new API tests against a fake Worker that checks the pass with the Workers' own `verifyJwt` and opens the sealed command.
- **Built (web):** Application Settings → Web Site Feedback (`features/feedback/components/SiteFeedbackPage.client.tsx`): the review card with filters and bulk controls, the ledger, and the Feedback Review card. 2 new web tests.
- **Changed from the old screen:** deleting asks in `U6ConfirmationDialog` (the old screen used the browser's native confirm); an app filter; "Only the newest 100 are listed" when the Worker's limit is reached; bulk changes report rows that no longer exist; each change is audited in `krhomebase`; the network and bot-check columns are never sent to the browser.
- **Old bug fixed:** with empty notes the old app saved the review marker at the very start of `internal_notes` and then could not read its own votes and assignee back. The new reader finds the marker there too, so old rows read correctly.
- **Browser check (account 001):** the page drew with the expected "cannot be reached" line (the API answered 503 because the Worker is not deployed). Nothing was read from or written to the feedback database.
- **Mailer key (4d):** the Google Workspace service account key is `private\dev-private-keys\krhomebase-google-workspace-mailer-key.json` in the old repository (name listed only). It becomes the API secret `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` (the whole JSON, as the old mailer read it). The mailer code is ported with 4d.
- **Next:** 4c Role Sets, then 4d Users and Invites.

## 18. Density Contract and icons (Nov 12, 2026, web patch 527)

- **The requester:** "tight" means denser, with less vertical padding; the rows under `data-kr-element="rows-container"` of the Client Accounting register are the model for tables of records.
- **Recorded:** `apps/web/DESIGN.md` 1.11 "Density Contract" (scale 1 to 10px, 3px default gap-x, rows about 20px with 1px cell padding, fields 22px to 26px, buttons 24px to 28px, card padding 6px to 8px, the forbidden classes, the browser checks), binding in `apps/web/AGENTS.md` ("Tight spacing"), `PRODUCT.md` 1.1 ("operate" mode, density 0.7), `.impeccable/design.json`, and root `AGENTS.md` Impeccable rule 5 (density words mean one step up the scale).
- **Icons:** `KRHomebaseIcons` is the one place for icons. The theme selector's wastebasket is now `KRHomebaseIcons.Trash`; the ledger's caret is the new `KRHomebaseIcons.Chevron` (points down when folded, turns over when open). Glyphs left in older screens are listed in `apps/web/AGENTS.md`.

## 19. Stages 4c and 4d results (Nov 12, 2026, API patch 20 and web patch 527)

- **4c Role Sets:** contract `packages/contracts/src/roleSets.ts` (the resource catalog and protected grants, shared by the API and the screens); API `src/features/role-sets/` (`GET`, `POST /v1/role-sets`, `PUT`, `DELETE /v1/role-sets/{roleSetId}`); screen `features/role-sets/components/RoleSetsCard.client.tsx` with the shared `components/tables/PermissionMatrix.client.tsx`. Changes from the old tab: New custom role set is an unsaved draft; Retire role set (the old API had it, the screen did not); built-in grants show what is stored, not the old code definitions; one batch per save.
- **4d Users and Invites (core):** the Google Workspace mailer ported (`apps/api/src/platform/googleWorkspaceMailer.ts`, sender settings as `vars`, key as the secret set Nov 12); contract `packages/contracts/src/users.ts`; API `src/features/users/` (list, create by invitation or active, one save for status, staff code and role sets, enroll as employee, resend, cancel and delete invitations); screens `features/users/` (the list with the old filters, Add user, the selected user with the invitation controls, role sets with a primary choice and the effective permissions). Changes from the old tab: a new person gets a `user_role_set` row for the chosen role set at once (the old route left them with no grants); `user.role` and `user.role_set_id` follow the primary role set in the same save; any active role set (custom ones too) may be chosen on create; reads never rewrite invitations.
- **4d-2, not built yet:** the contact header and photo of the user editor, Bar Admissions (`employee_certification`), and the Security, Notifications and Danger zone tabs (placeholders in the old app).
- **Checked in the browser (account 001), nothing saved:** Role Sets lists the 12 live role sets; the custom role set opens as an editor; rows measure 19.7px with 1px padding; nothing scrolls sideways at 1615px or 768px. Users and Invites lists the 3 live users; your own status is locked. No user, role set or invitation was created, changed or sent.
- **Next:** 4d-2, then stage 5 (Firm Settings).

## 20. Stages 4d-2, 5 and 6 results (Nov 12, 2026, API patch 21 and web patch 528)

The requester asked for 4d-2 and stages 5 to 9 without a stop for each stage, and answered two decisions on Nov 12: Employee Documents binds the old app's R2 bucket `kr-homebase-employee-storage`; the GPT Worker is reached by a service binding and changed to trust a shared secret from the API instead of the RSA command envelope ("simplify").

- **4d-2 user editor:** the old five tabs (Individual, Security, Roles, Notifications, Danger zone) under a header with the initials, names, phone and ICID; Edit User Contact Details opens the person under Clients & Contacts. Individual adds Professional title, the Attorney tick box and Bar Admissions (`employee_certification`, law license; register rows with fields in the cells). Security lists the real sign-in identities and keeps the MFA "Coming Soon!" box; Notifications stays the old placeholder; Deactivate works (it asks first, and the account's open sessions end). The photo waits for the media storage work.
- **Stage 5 Firm Profile and Employee Policies:** `packages/contracts/src/firm.ts` (shapes, defaults, the old error sentences shared by the screen and the API), API `src/features/firm/` (`GET` for anyone signed in, `PUT` for a super admin, `lookup` rows `lk_kr_firm_locations_profile` and `lk_kr_employee_policies`, the firm entity's legal name), screens `features/firm/`. Policies are read field by field, as Attendance reads them; decimals can be typed; the holiday observation column is the current year.
- **Stage 5 Employee Documents:** `packages/contracts/src/employeeDocuments.ts`, API `src/features/employee-documents/` (list, multipart upload, the file inline; scoped grant `employee_documents` own/team/all), screen `features/employee-documents/`, R2 binding `EMPLOYEE_STORAGE`. Found: the old route wrote `purpose 'employee_document'`, `storage_type 'r2'` and `source 'employee_documents'`, which the CHECK rules refuse, so the old app never stored a document; the port uses `employee_file`, `r2_object` and `employee`.
- **Stage 6 Stripe Payment Configuration:** ported exactly (a stated variation) by `features/payment-providers/` on both sides; `src/platform/stripeApi.ts`; encryption byte-compatible with the pay Worker. Needs the API secret `KR_PAYMENT_PROVIDER_KEK` (the pay Worker's value).
- **Stage 7 GPT Model Gateway:** `packages/contracts/src/gpt.ts`, API `src/features/gpt/` with `src/platform/gptWorkerClient.ts`, screens `features/gpt/`. The GPT models Worker (`workers/gpt-workers/`) was changed as the requester chose ("simplify"): it trusts the API's shared secret (`Authorization: Bearer`, `GPT_WORKER_SHARED_SECRET` / `KR_GPT_WORKER_SECRET`) instead of the RSA signed and sealed commands, has no public address, and seals provider keys at rest with `GPT_CREDENTIAL_ENCRYPTION_KEY` (old rows read only with the optional `GPT_LEGACY_WORKER_PRIVATE_KEY`). Not deployed: the database id is still to be chosen, and the API binding is a commented block in `kr-api-wrangler.jsonc`; until then the page says "GPT Model Gateway cannot be reached right now".
- **Stage 8 Data Import:** `packages/contracts/src/maintenance.ts`, API `src/features/maintenance/` (`GET`/`PUT /v1/maintenance-gate`, exempt from the write gate), screens `features/data-import/` and the help document `docs/help-docs/001-contact-entity-trust-import-jsonc-instructions.md`. Contacts are created one at a time through `POST /v1/contacts`, which saves the identity, email and phone only (an entity's status, formation state and EIN in the file are checked but not saved, as before for addresses). Lead rows wait for the Leads port; the matter import stays disabled.
- **Stage 9 Impeccable critique of Firm Settings (Firm Profile, Employee Policies, Employee Documents):** 23/40; two P1 (unsaved drafts lost on a tab switch, save results far from Save) and three P2 (locked fields for people who cannot edit, Density Contract misses, tables clipping on narrow screens). Saved at `.impeccable/critique/2026-11-12T21-33-27Z__irm-components-firmprofilecard-client-tsx-bcd55bfa.md`. The fixes are in section 21.

## 21. The requester's decisions after the critique (Nov 12, 2026, API patch 21 and web patch 528)

| # | Comment | Decision | Done |
|---|---|---|---|
| D1 | 20px icon buttons against the 24px accessibility target | 20px icon buttons by default; 24px where a card holds little else (a Settings choice card). Design for usability, which is not the same as accessibility; the requester asked where the accessibility guidance comes from (the Impeccable skill's audit and critique references, not a project rule). On the requester's yes, `apps/web/PRODUCT.md` 1.2 records "Accessibility: usability first": no WCAG target; Impeccable's accessibility findings are advice. | Recorded in DESIGN.md (Density Contract). |
| D2 | DESIGN.md and the dialog button sizes | A decision dialog (Yes, No, OK, Cancel) is less dense, with bigger buttons; a dialog with many fields (the contact editor) stays dense. | DESIGN.md (Density Contract, Dialogs). |
| D3 | Holidays in the order added | List holidays in the order they fall in the year. | `sortHolidays`; saves keep date order. |
| D4 | Number columns | Center the heading over number values (usually money). | DESIGN.md; PTO, Holiday Pay, the users list's Employee # and the document sizes. |
| D5 | Loading text and ellipses | Use the rainbow spinner, and write "..." | DESIGN.md; the Settings pages of this port (the Stripe page kept as ported). |
| D6 | Holiday pay date | Holiday pay is paid in the pay period whose dates include the holiday's calendar date. | The Observation column shows the calendar date (unchanged). |
| D7 | Employee Documents and users | Employee File in User Settings shows the person's own `IndividualSummaryDetails` card and their documents. Users moves from Application Settings to Firm Settings → Users: the dense list with a pencil per row; the pencil opens an "Edit Employee" or "Edit User" tab with the old `IndividualSummaryDetails` card, the account tabs, and the employee's documents in Employment details. | Built (web patch 528). |
| D8 | Copying the firm's details | Anyone may copy the firm's phone, email and address; only a super admin may change them. | Read-only (not disabled) fields for others. |
| D9 | Switching employee | (Explained: a slow reply for an earlier choice could replace a newer one.) | The card ignores stale replies and shows the spinner. |
| D10 | Wording for people who rarely open Settings | Clarify while the user and employee paths are tested. | The documents note and empty sentences rewritten; the matter number pattern and Multiplier have tooltips. |

Also from the requester: the Holiday Calendar's wastebasket asks first and a holiday change saves at once with the spinner (a removal only changed the draft before).

Found while checking as the attorney test account: no role set grants `employee_documents` (own, team or all) except Super Admin, so Employee File and Employee Documents show "You do not have access" to everyone else until a role set grants it (Application Settings → Role Sets).

