# Settings and Dashboard Port Plan

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 7:46pm</small>

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

## 8. Test accounts

The requester owns these three sign-ins and keeps them in the database for testing (roles as stored in `user.role`):

| Name | Number | Role | Email |
|---|---|---|---|
| Dan Krueger | 001 | super_admin | dankrueger@legaldrive.net |
| Dan Krueger (66) | 002 | attorney | dankrueger66@gmail.com |
| Dan-DevBIC Krueger | 003 | staff | dankrueger@bicproperty.com |

Use them to check each area as each role. The agent never signs in; the requester does.
