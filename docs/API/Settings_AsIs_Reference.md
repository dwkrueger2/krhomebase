# Settings and Dashboard As-Is Reference

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 8:35pm</small>

## 1. Purpose and sources

This is a read-only reference of the old Settings tab (User, Application and Firm Settings), the old dashboard widget system and `EmployeeClockInWidget`, as the code is written today. It is stage 0 of `docs/08_Settings_Dashboard_Plan.md`, made in the same way as `docs/API/Timekeeping_AsIs_Reference.md` for Attendance: it records every screen, label, route, check and table so the port can be designed without reading the old code again. Nothing here is a design decision. Where the code and its comments disagree, the code is described and the disagreement is noted.

The old repository `D:\Repos\krueger-richard-website` was read only, from `apps\kr-homebase` and `apps\shared`. No folder named `private`, no `.dev.vars*` file and no key file was opened, and no secret value appears in this document (environment variables are named, never shown). Paths are relative to the old app root `apps/kr-homebase/` unless stated. Line numbers are those of the files as read on Nov 11, 2026. Sections 3 and 4 and section 5.7 use short file names that each section defines at its top.

| Area | Main files | Section |
|---|---|---|
| Settings router, landing cards, breadcrumbs | `src/hb-components/modules/settings/SettingsUsersPanel.client.tsx`, `SettingsChoiceCard.client.tsx`, `KRHomebaseShell.client.tsx` | 3 |
| User Settings, idle logout | `modules/settings/user-settings/*`, `hb-components/session/*` | 3 |
| Firm Settings: menu, Profile, Employee Policies, Data Import | `modules/settings/firm-settings/*`, `src/hb-import/*` | 3 |
| Application Settings | `modules/settings/application-settings/*`, `ThemeSettingsPanel`, `theme-settings/*`, `KR-EditUser/*` | 4 |
| Stripe Payment Configuration | `modules/settings/firm-settings/stripe-payment-configuration/*`, `api/payment-providers`, `api/stripe-dev-tests`, `api/_server/krPayment*` | 5 |
| GPT Model Gateway | `src/ai-components/*`, `api/kr-gpt/*` | 6 |
| Dashboard widgets, `EmployeeClockInWidget` | `src/hb-components/dashboard/*` | 7 |

A read-only check of the live `krhomebase` database on Nov 11, 2026 (table names and column types only, no rows) confirmed that `lookup`, `payment_provider`, `user` and the three `workspace_tool*` tables exist and that no user preference table exists.

## 2. Summary

- **Everything personal lives in the browser.** Theme choice, starting page, auto logout, feedback button and dashboard widgets are kept in `localStorage` only (`kr_homebase_user_settings_v1`, `kr_homebase_active_theme_v1`, `kr_homebase_dashboard_widgets_v1`), so they do not follow a person to another computer. The starting page is saved but never read.
- **Auto logout is a browser idle timer**, separate from the API session: 15, 30, 60 (default), 120 or 480 minutes; a warning box appears 5 minutes before logout ("Stay signed in"); activity is shared across tabs; on timeout the browser calls `DELETE /krhomebase/api/session` and goes to the login page. A new value takes effect only after a reload.
- **Access is by role name, not by permission.** Application Settings, Stripe, GPT and Data Import check `user.role === 'super_admin'` on the screen; the routes accept `super_admin` (some also an `admin` role that no role set defines). Firm Profile and Employee Policies are offered to everyone but load and save only for `super_admin`/`admin`; other users silently see hard-coded firm defaults.
- **Users and employees are mixed.** Creating a user in Application Settings can create an `employee` row, and Employee Documents sits in Application Settings. This is why the plan moves Employee Documents to Firm Settings.
- **The three IT cards** are the orange cards in the Firm Settings menu: Data Import (`FirmSettingsMenu-option-data-management`, orange border and icon), GPT Model Gateway (`firm-settings-gpt-model-gateway-card`, solid orange) and Stripe Payment Configuration (`firm-settings-stripe-payment-configuration-card`, solid orange). The code has no "IT card" concept; the style is two CSS module classes (section 3, "Card CSS").
- **Stripe Payment Configuration** is the most finished screen: Live and Sandbox cards with write-only, encrypted secrets checked by hash in the browser, three confirmation dialogs, and a sandbox test workspace. Its classes are already Tailwind `STYLES`/`LAYOUT_STYLES` maps and can be carried over value for value.
- **GPT Model Gateway** calls a separate Worker, `gpt-models-worker`, over HTTPS with signed and encrypted messages. That Worker was copied into this repository (`workers/gpt-workers/`) but is not deployed and has no database id. The Edit Model Connection dialog has no `data-kr-id` and uses two native `window.confirm` calls.
- **Dashboard widgets** are a small registry (two widgets), a grid that switches on widget id, a card shell, and a checkbox preferences screen with no ordering control.
- **Native dialogs to replace:** 9 `window.confirm` calls across these screens (5 in Application Settings, 1 in Data Import, 3 in the GPT gateway), plus one `beforeunload` prompt.

## 3. Settings router, User Settings and Firm Settings

### Path abbreviations used below

All paths are relative to the old app root `apps/kr-homebase/`.

- `SET/` = `src/hb-components/modules/settings/`
- `FS/` = `src/hb-components/modules/settings/firm-settings/`
- `API/` = `src/app/krhomebase/api/kr-api-v1/`
- `CSS` = `src/hb-components/modules/KRManagementCards.module.css` (a CSS module; class names are hashed at build time)
- `SHELL` = `src/hb-components/KRHomebaseShell.client.tsx`

### 3.1 Settings router

#### How a Settings screen is reached

- The nav items `settings`, `user-settings`, `application-settings`, `firm-settings` are defined in `src/hb-components/types.ts:194-227`. Their labels are `Settings`, `User Settings`, `Application Settings`, `Firm Settings`. The three children have `parentId: 'settings'` and `isSubItem: true`. Every role gets every nav item: `src/app/krhomebase/page.tsx:50` passes `KR_HOMEBASE_DEFAULT_NAV_ITEMS` unfiltered, and `LeftPanel.client.tsx:113-114` filters only on `status`.
- The server reads only `?section=` to pick the first section (`page.tsx:40-41`, falling back to `dashboard`). The client shell reads it again after mount (`SHELL:171-182`).
- `WorkingPanel.client.tsx:126-153` renders `SettingsUsersPanel` once for each of the four ids. It passes `activeSettingsSection` set to the same id and passes `onSelectSection`. It never passes `onNavigateToUserSettings`.
- `SET/SettingsUsersPanel.client.tsx:240-247` is the router:
  - `settings` shows the landing page.
  - `user-settings` shows `UserSettingsSection`. `onOpenAttendance` switches the shell to `timekeeping`.
  - `application-settings` shows `ApplicationSettingsSection` (not covered here).
  - `firm-settings` shows `FirmSettingsSection`.
  - With no value it falls back to `'application-settings'` (`:40-44`).
- All four share one wrapper: `<section class=managementPanel aria-label="KR Homebase settings" data-kr-id="SettingsUsersPanel" data-kr-component="SettingsUsersPanel" data-kr-element="settings-panel">` around `div.workingCard[data-kr-element=settings-working-card] > div.panelBody` (`:58-70`).

#### Landing page (`section=settings`) — `SET/SettingsUsersPanel.client.tsx:79-218`

The grid is `<section class=settingsChoiceGrid aria-label="Settings choices" data-kr-element="settings-choice-grid">` (`:137-142`). The cards appear in this order:

| # | Icon | Title | Description (exact) | Who sees it | Markup / attributes | Action |
|---|---|---|---|---|---|---|
| 1 | `◉` | User Settings | `Theme, starting page, and auto logout preferences for the signed-in user.` | everyone | `<button>`, `data-kr-id="user-settings"` | sets `section=user-settings`, deletes `userSettingsSection` (`:126-135`) |
| 2 | `▦` | Application Settings | `User management, role specifications, and application-wide configuration.` | everyone | `<button>`, `data-kr-id="application-settings"` | sets `section=application-settings` |
| 3 | `⌂` | Firm Settings | `Firm profile, office defaults, time zone, and matter numbering settings.` | everyone | `<button>`, `data-kr-id="firm-settings"` | sets `section=firm-settings` |
| 4 | `▤` | Reports | `Choose a report to display, beginning with Time Card Reports.` | everyone | `<button>`, `data-kr-action="open-reports"`, `data-kr-id="settings-reports-choice"` | sets `section=reports` (`:154-166`) |
| 5 | `G` | GPT Model Gateway | `Open the implemented workspace for provider connections, readiness checks, and token-usage reporting.` | only when `NODE_ENV === 'development'`, any role | `<a href="/krhomebase?section=firm-settings&firmSettingsSection=gpt-model-gateway">`, class `gptPrototypeChoiceCard`, `data-kr-id="firm-settings-gpt-model-gateway-card"` | full page load (`:167-178`) |
| 6 | `$` | Stripe Payment Configuration | `Live and Sandbox Stripe keys (stored encrypted, write-only) and sandbox card/ACH tests.` | `user.role === 'super_admin'` | `<a href="/krhomebase?section=firm-settings&firmSettingsSection=stripe-payment-configuration">`, class `gptPrototypeChoiceCard`, `data-kr-action="open-stripe-payment-configuration-workspace"`, `data-kr-id="settings-stripe-payment-configuration-choice"` | full page load (`:180-190`) |
| 7 | `⚙` | Developer Tests | `Open the role-based access test and published backend test endpoint.` | development only | `<a href="http://localhost:3002/tests/krh" target=_blank rel="noopener noreferrer">`, class `developerTestsChoiceCard`, `data-kr-action="open-developer-tests"`, `data-kr-element="developer-tests-choice"`, `data-kr-id="developer-tests-choice"`. The byline reads `Running` (`#16803c`) or `not running` (`#b42318`), with `aria-live=polite` and inline style `display:block;font-size:.78rem;font-weight:700;margin-top:6px` | (`:191-215`) |

The byline status comes from `fetch('http://localhost:3002/tests/api?isRunning')`, which runs on every mount of the landing page (`:90-97`).

#### Shared card component — `SET/SettingsChoiceCard.client.tsx`

- With `href` set, the card renders as `<a class="settingsChoiceCard {className}" href rel target onClick …data-kr-*>` (`:94-113`). Otherwise it renders as `<button class="settingsChoiceCard {className}" type="button" onClick …data-kr-*>` (`:116-127`).
- The card holds three or four spans: `span.settingsChoiceIcon[aria-hidden=true]{icon}`, `span.settingsChoiceTitle{title}`, `span.settingsChoiceText{description}`, and an optional `span[aria-live][style]{byline}` (`:53-64`).
- Metadata props map to `data-kr-action`, `data-kr-id`, `data-kr-element`, `data-kr-section-id` and `data-kr-target-id`. React drops the ones left undefined (`:86-92`).

#### Card CSS (value for value, `CSS`)

- `.settingsChoiceGrid` (`:616-620`): `display:grid; gap:8px; grid-template-columns:repeat(3,minmax(0,1fr))`. Below 767px it becomes `grid-template-columns:1fr` (`:974`, `:995-998`).
- `.settingsChoiceCard` (`:622-635`): `background:#ffffff; border:1px solid var(--kr-line-cool,#d7dee5); border-radius:2px; box-shadow:0 1px 2px rgba(27,35,48,0.08); color:inherit; cursor:pointer; display:grid; gap:3px 8px; grid-template-columns:30px minmax(0,1fr); min-height:78px; padding:9px 10px; text-align:left`.
- `.settingsChoiceCard:hover, :focus-visible` (`:637-642`): `border-color:rgba(33,57,79,0.42); box-shadow:0 0 0 2px rgba(33,57,79,0.08); outline:none`.
- `.settingsChoiceIcon` (`:645-658`): `align-items:center; align-self:start; background:var(--kr-deep-navy,#21394f); border-radius:2px; color:#ffffff; display:inline-flex; font-size:14px; font-weight:900; height:26px; justify-content:center; line-height:1; width:26px`.
- `.settingsChoiceTitle` (`:660-665`): `color:var(--kr-ink,#1f3040); font-size:14px; font-weight:850; line-height:1.15`.
- `.settingsChoiceText` (`:667-672`): `color:var(--kr-fg-2,#526172); grid-column:2; font-size:12px; line-height:1.35`.
- `.firmSettingsMenuFlow` (`:674-678`): `display:grid; gap:10px; min-width:0`. `.firmSettingsMenu` (`:680-684`): `display:grid; gap:8px; min-width:0`.
- `.dataManagementChoiceCard` (`:686-688`): `border-color:color-mix(in srgb, var(--kr-theme-orange, var(--kr-orange,#e45e25)) 48%, var(--kr-line-cool,#d7dee5))`. Its icon (`.dataManagementChoiceCard .settingsChoiceIcon`, `:711-713`) gets `background:var(--kr-theme-orange, var(--kr-orange,#e45e25))`. On `:hover`/`:focus-visible` (`:736-740`) it gets `border-color:var(--kr-theme-orange, var(--kr-orange,#e45e25)); box-shadow:0 0 0 2px color-mix(in srgb, var(--kr-theme-orange, var(--kr-orange,#e45e25)) 18%, transparent)`.
- `.gptPrototypeChoiceCard` (`:690-709`):
  - card: `background` and `border-color` set to `var(--kr-theme-orange, var(--kr-orange,#e45e25))`
  - icon: `background:rgba(255,255,255,0.2)`
  - title and text: `color:#ffffff`
  - hover and focus: same orange border, `box-shadow:0 0 0 3px color-mix(in srgb, <orange> 28%, transparent); outline:none`
- `.developerTestsChoiceCard` (`:715-734`) repeats the `.gptPrototypeChoiceCard` rules exactly.
- Data Import workspace card (`:742-754`):
  - `.settingsCard[data-kr-element="firm-settings-data-management-card"] .collapsibleSectionTopbar` gets `background:linear-gradient(90deg, <orange>, color-mix(in srgb, <orange> 74%, var(--kr-theme-brand-primary,#00305b)))`.
  - `.dataManagementBody` gets `background:linear-gradient(90deg, color-mix(in srgb, <orange> 10%, transparent), transparent 54%), var(--kr-theme-card-surface,#ffffff)`.

#### Exact markup of `FirmSettingsMenu-option-data-management`

From `FS/FirmSettingsSection.client.tsx:440-462` together with `SettingsChoiceCard`:

```html
<section class="firmSettingsMenu" aria-label="Firm Settings options" data-kr-id="FirmSettingsMenu">
  <div class="settingsChoiceGrid" data-kr-element="firm-settings-option-grid">
    <button class="settingsChoiceCard dataManagementChoiceCard" type="button" data-kr-id="FirmSettingsMenu-option-data-management">
      <span class="settingsChoiceIcon" aria-hidden="true">D</span>
      <span class="settingsChoiceTitle">Data Import</span>
      <span class="settingsChoiceText">Super Admin tools for controlled data preparation and bulk contact staging.</span>
    </button>
```

The card has no `data-kr-action` and no `data-kr-section-id`; both are commented out at `:453` and `:455`.

#### Breadcrumbs — `SHELL:365-397`, clickable labels in `TopTitleBar.client.tsx:242-250`

- `settings` shows an empty breadcrumb (`[]`). The title then falls back to the nav label.
- `user-settings`, by `userSettingsSection`:
  - `employee-file`: `Settings / User Settings / Employee File`
  - `time-card`: `Settings / User Settings / Time Card`
  - `user-settings`: `Settings / User Settings / Personal Preferences`
  - `dashboard-settings`: `Settings / User Settings / Dashboard Settings`
  - anything else: `Settings / User Settings`
- `application-settings` always shows `Settings / Application Settings`.
- `firm-settings`:
  - `gpt-model-gateway`: `Settings / Firm Settings / GPT Model Gateway`
  - `data-management`: `Settings / Firm Settings / Data Import`
  - all other values (including `profile`, `employee-policies`, `stripe-payment-configuration`): `Settings / Firm Settings`
- The labels `Settings`, `User Settings`, `Application Settings` and `Firm Settings` render as `<button data-kr-action="select-breadcrumb-section" data-kr-section-id=…>`. The page title is the last breadcrumb item (`SHELL:401`).

#### URL parameters and exact values

| Param | Values | Written by | Read by |
|---|---|---|---|
| `section` | `settings`, `user-settings`, `application-settings`, `firm-settings` (also `reports`, `timekeeping` from Settings) | `SHELL:193-209` (`replaceState`), landing cards `SET/SettingsUsersPanel.client.tsx:126-135`, `FS/FirmSettingsSection.client.tsx:288,313` | `page.tsx:40-41`, `SHELL:171-182` |
| `userSettingsSection` | `user-settings`, `dashboard-settings`, `employee-file`, `time-card` | `SET/user-settings/UserSettingsSection.client.tsx:260-264`; `SettingsUsersPanel:229-238` (`employee-file`) | `UserSettingsSection:91-95`, `SHELL:384` |
| `firmSettingsSection` | `profile`, `employee-policies`, `data-management`, `gpt-model-gateway`, `stripe-payment-configuration`; the old alias `stripe-dev-tests` maps to `stripe-payment-configuration` | `FS/FirmSettingsSection.client.tsx:285-292` (set), `:310-317` (delete) | `FirmSettingsSection:42-49` (on mount and on `popstate`, `:117-124`), `SHELL:393` |
| `applicationSettingsTab` | owned by Application Settings | — | deleted by `FirmSettingsSection:290,315` |

`cleanSectionScopedParams` (`SHELL:104-110`) deletes the sub-section parameters that do not belong to the active section. When the user picks `firm-settings`, the shell also dispatches a synthetic `popstate` (`SHELL:208`), which resets Firm Settings to its menu.

#### Where theme and user settings are applied in the shell

- `KRHomebaseThemeProvider` wraps the whole shell (`SHELL:404`). After mount it reads `localStorage['kr_homebase_active_theme_v1']` and loads the lookup themes. It also listens for the window event `krhomebase-theme-change` (`theme/KRHomebaseThemeProvider.client.tsx:38-70`).
- `KRHomebaseIdleSessionMonitor` is mounted for every section (`SHELL:406`).
- The feedback button is shown or hidden from `useFeedbackButtonPreference()`. That hook reads `kr_homebase_user_settings_v1` and listens for `kr-homebase-user-settings-change` and cross-tab `storage` events (`SHELL:71-89`, `:477-485`).

### 3.2 User Settings (`section=user-settings`)

#### Workspaces — `SET/user-settings/UserSettingsSection.client.tsx`

The choice grid is `<section class=settingsChoiceGrid aria-label="User Settings choices" data-kr-element="user-settings-choice-grid">`. Each card is a `<button>` with `data-kr-action="select-user-settings-workspace"`, `data-kr-element="settings-choice-card"` and `data-kr-target-id=<id>` (`:97-121`).

| `userSettingsSection` | Icon | Title | Description (exact) | What it shows today |
|---|---|---|---|---|
| (absent) = `menu` | — | — | — | the choice grid |
| `user-settings` | U | User Settings | `Theme, starting page, and auto logout preferences for the signed-in user.` | the preference form |
| `dashboard-settings` | D | Dashboard Settings | `Choose the dashboard cards and information shown for this user.` | the widget checkboxes plus a placeholder |
| `employee-file` | E | Employee File | `Employee-specific profile, policy, and file workspace. Available after enrollment.` | placeholder text only |
| `time-card` | T | Time Card | `Employee time-entry workspace placeholder for future timekeeping workflows.` | never rendered; it redirects to the Attendance (`timekeeping`) section |

- Any workspace other than the menu shows a back button: `<button class=ghostButton data-kr-action="return-to-user-settings-choices">← User Settings</button>` (`:273-280`).
- `time-card` behavior (`:159-173`, `:245-258`): it calls `onOpenAttendance()`, which switches the shell to `timekeeping`. Without that callback it sets `section=timekeeping`, deletes `userSettingsSection` and calls `window.location.assign`.
- `employee-file` and `time-card` share one placeholder component (`:123-139`) inside `section.workingCard[data-kr-element=employee-file-workspace|time-card-workspace]`:
  - eyebrow: `USER SETTINGS`
  - heading: `Employee File` or `Time Card`
  - Employee File text: `` `${user.displayName} is enrolled in the Employee File workspace placeholder. Employee details will be added here.` ``
  - Time Card text: `The Time Card workspace is reserved for employee time entry and review.`
  - note on both: `Workspace placeholder — implementation will follow the employee and timekeeping records.`

#### Preference form (`userSettingsSection=user-settings`, `:281-388`)

- The form sits in a `CollapsibleSection` with eyebrow `User Settings` and title `user.displayName`. It passes `dataKrId="user-settings-card"`, but `CollapsibleSection` renders that as `data-kr-element`, not `data-kr-id` (`src/hb-components/ui/CollapsibleSection.client.tsx:50-53`).
- Header actions are `Undo Changes` (ghost) and `Save changes` (primary). Both are always visible.

| Field label | Control | Options (value → label) | Default |
|---|---|---|---|
| `Theme selection` | select, disabled when no options | the themes returned by GET theme-settings (`theme.id` → `theme.name`). When the list is empty, one option: `""` → `No administrator themes saved` | `''`. After load it is set to the first option when the stored id is not in the list (`:207-210`) |
| `Starting page` | select | `dashboard`→Dashboard, `application-settings`→Application Settings, `matters`→Matters, `contacts`→Contacts, `leads`→Leads | `dashboard` |
| `Auto logout time` | select | `15`→15 minutes, `30`→30 minutes, `60`→60 minutes, `120`→2 hours, `480`→8 hours | `'60'` |
| `Feedback button` | checkbox `Show Feedback button` (`data-kr-element="user-settings-show-feedback"`) | — | `true` |
| `Feedback button position` | select (`data-kr-element="user-settings-feedback-position"`), disabled when the button is hidden | `bottom-right`→Lower Right, `bottom-left`→Lower Left, `top-right`→Upper Right, `top-left`→Upper Left (`KR-Feedback/KRHomebaseFeedbackButton.client.tsx:30-43`) | `bottom-right` |

Sources: `:56-61`, `:299-385`, and `userSettingsStorage.ts:36-39`.

- **Save** (`:223-232`):
  - Writes the whole form to `localStorage['kr_homebase_user_settings_v1']` and dispatches `kr-homebase-user-settings-change`.
  - If a theme is selected, writes `localStorage['kr_homebase_active_theme_v1'] = form.theme` and dispatches `krhomebase-theme-change` with the full theme object as `detail`.
  - Status: `User settings saved locally. Theme selection uses administrator-created themes from Application Settings.`
- **Undo Changes** (`:235-243`): resets to the defaults but keeps the feedback fields. Status: `Defaults restored locally. Click Save changes to persist them.`
- **Feedback fields** save immediately. `writeFeedbackButtonPreference` merges the patch into the stored JSON and dispatches the change event (`userSettingsStorage.ts:75-91`). Status: `Feedback button updated.` (`:192-196`). The floating button can also change them (`SHELL:482-483`).
- **Stored JSON shape** (`kr_homebase_user_settings_v1`): `{ "theme": string, "startingPage": string, "autoLogoutMinutes": "15"|"30"|"60"|"120"|"480", "showFeedbackButton": boolean, "feedbackButtonPosition": "bottom-right"|"bottom-left"|"top-right"|"top-left" }`. The numbers are stored as strings.

#### Idle monitor — `src/hb-components/session/KRHomebaseIdleSessionMonitor.client.tsx`

- **Idle limit:** `Number(autoLogoutMinutes)` from `kr_homebase_user_settings_v1` when the value is 1 or more. Otherwise `DEFAULT_IDLE_MINUTES = 60` (`:15`, `:24-34`). The limit in milliseconds is `max(60_000, minutes*60_000)` (`:68`).
- **Warning:** `WARNING_MINUTES = 5` (`:18`). The warning shows when the user has been idle for at least `(minutes-5)*60_000` ms, and only when `minutes > 5`. With the 15-minute option it therefore appears at 10 minutes (`:67`, `:114`).
- **Activity events:** `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `pointerdown`, plus window `focus`. They are throttled to one write every 2 s. Each write stores `Date.now()` in `localStorage['kr_homebase_last_activity_at']`, which is shared across tabs, and hides the warning (`:21`, `:74-94`).
- **Polling:** the monitor checks every 1000 ms (`:104-127`).
- **Warning markup** (`:131-153`): a fixed box at bottom 18px, right 18px, `zIndex:1000`, `role=status`, `aria-live=polite`, styled inline. It contains:
  - `Session idle warning`
  - `You will be logged out in {N} minute(s) unless activity resumes.`
  - a plain `<button>Stay signed in</button>` that calls `markActivity`
- **Timeout:** calls `logoutKRHomebaseAndRedirect('idle-timeout')` (`:110-112`). That function (`KRHomebaseSessionClient.client.ts:28-79`):
  1. Deletes every localStorage key that starts with `kr_homebase_`, except `kr_homebase_active_theme_v1`, `kr_homebase_user_settings_v1` and keys starting `kr_homebase_ledger_`, `kr_homebase_panel_` or `kr_homebase_collapse_`.
  2. Deletes sessionStorage keys that start `kr_homebase_` or `krh_`, or that contain `krhomebase`.
  3. Sends `DELETE /krhomebase/api/session`.
  4. Redirects to `/krhomebase/login?idle_timeout=1`. User logout uses `logged_out=1`; an expired session uses `session_expired=1`.
- **Forced logout on API errors:** any API helper that calls `handleKRHomebaseSessionApiError` logs the user out on HTTP 401, or on an `error`/`reason` of `missing_session_cookie`, `invalid_session` or `session_expired` (`:82-93`).

#### Dashboard Settings (`:389-399`)

- `CollapsibleSection` with `dataKrId="dashboard-settings-card"`, eyebrow `User Settings` and title `Dashboard Settings`.
- `DashboardWidgetPreferences` (`src/hb-components/dashboard/DashboardWidgetPreferences.client.tsx`) shows one checkbox per allowed widget, with the widget's title and description:
  - `employee-clock-in`: `Employee Clock In`, enabled by default, order 5, all roles.
  - `review-queue`: `Review Queue`, enabled by default, order 10, `requiredRole:'super_admin'` (`dashboard/dashboardWidgetRegistry.ts:39-57`).
- Buttons: `Reset dashboard widgets` and `Save dashboard widgets`.
- Settings are stored in `localStorage['kr_homebase_dashboard_widgets_v1']` (`dashboardWidgetRegistry.ts:4`) as `{ [widgetId]: { enabled: boolean, order: number } }`.
- Initial status: `Dashboard widget settings are stored locally until user preference persistence is added.`
- Below the checkboxes is a static `UserDashboardSettingsPlaceholder`: heading `Dashboard Card Settings`, with three tabs (`Personal Dashboard`, `Firm Dashboard`, `Firm Feed`) that each say `Dashboard cards will be configurable here.` (`dashboard/UserDashboardSettingsPlaceholder.client.tsx`).

### 3.3 Firm Settings (`section=firm-settings`)

#### Menu — `FS/FirmSettingsSection.client.tsx:404-490`

- Outer element (`:320`): `<section class=firmSettingsMenuFlow aria-label="Firm Settings" data-kr-component="FirmSettingsSection" data-kr-element="firm-settings-menu-flow">`. Its `data-kr-id` is `FirmEmployeePolicies` on the employee-policies view, `FirmSettingsDataManagementFlow` on the data-management view, and `FirmSettingsMenuFlow` otherwise.
- The first render is always the menu. The URL is applied after mount so server and browser render the same markup (`:54-57`, `:117-124`).

| Order | `firmSettingsSection` | Icon | Title | Description (exact) | Who sees it | Element / `data-kr-id` | Card style |
|---|---|---|---|---|---|---|---|
| 1 | `profile` | P | Profile | `Firm identity, contact details, offices, and matter numbering.` | everyone | button, `FirmSettingsMenu-option-profile` | plain |
| 2 | `employee-policies` | E | Employee Policies | `Employee clock windows, PTO accrual rules, holiday pay, and holiday calendar.` | everyone | button, `FirmSettingsMenu-option-employee-policies` | plain |
| 3 | `data-management` | D | Data Import | `Super Admin tools for controlled data preparation and bulk contact staging.` | `super_admin` (`superAdminOnly`) | button, `FirmSettingsMenu-option-data-management` | `dataManagementChoiceCard` (orange border and orange icon) |
| 4 | `gpt-model-gateway` | G | GPT Model Gateway | `Open the implemented workspace for provider connections, readiness checks, and token-usage reporting.` | `super_admin` | `<a href="/krhomebase?section=firm-settings&firmSettingsSection=gpt-model-gateway">`, `firm-settings-gpt-model-gateway-card` | `gptPrototypeChoiceCard` (solid orange) |
| 5 | `stripe-payment-configuration` | $ | Stripe Payment Configuration | `Live and Sandbox Stripe keys (stored encrypted, write-only) and sandbox card/ACH tests.` | `super_admin` | `<a href=…stripe-payment-configuration>`, `data-kr-action="open-stripe-payment-configuration-workspace"`, `firm-settings-stripe-payment-configuration-card` | `gptPrototypeChoiceCard` (solid orange) |

- The code has no "IT card" concept. The orange cards (4 and 5 solid, 3 bordered) are the super-admin or technical tools.
- Button cards call `selectFirmSettingsSection`. It sets `section=firm-settings` and `firmSettingsSection=<id>`, deletes `applicationSettingsTab`, and calls `replaceState` (`:285-292`).
- Link cards (4 and 5) do a full page navigation.
- Each workspace is a `CollapsibleSection` with eyebrow `Firm Settings`. Collapsing it returns to the menu: `returnToFirmSettingsMenu` deletes `firmSettingsSection` and `applicationSettingsTab` (`:310-317`).
- Workspaces 4 and 5 render only when `isSuperAdmin` (`:376-399`). They use the `data-kr-element` values `firm-settings-gpt-model-gateway-workspace-card` and `firm-settings-stripe-payment-configuration-workspace-card`. Their contents are documented elsewhere.

#### Firm Profile — `FS/FirmProfileSettingsSection.client.tsx`

- Card: `CollapsibleSection` titled `Profile`, `dataKrElement="firm-settings-card"`, body class `firmSettingsBody` (`display:grid; gap:10px`, `CSS:1651-1654`).
- Header actions appear only while the form is dirty: `Undo Changes` (ghost) and `Save changes` (primary + `accentSaveButton`). While saving, the save button reads `Saving...` (`:53-58`).
- Top fields (`:76-102`), in `div.settingsFormGrid`:

| Label | Control | Key |
|---|---|---|
| `Firm display name` (full width) | text | `firmName` |
| `Primary office email` | email | `officeEmail` |
| `Primary office phone` | text | `officePhone` |
| `Time zone` | select: `America/Chicago`→Central, `America/New_York`→Eastern, `America/Denver`→Mountain, `America/Los_Angeles`→Pacific | `timeZone` |
| `Matter numbering format` | text | `matterNumberFormat` |

- Locations editor (`:123-143`): `section.firmLocationsPanel[aria-label="Firm locations"][data-kr-element=firm-locations-editor]`.
  - Heading: `Firm Locations`. Text: `Firm location records are stored as typed JSON in lookup.description.`
  - Button: `Add location`. A new row is named `New Location`, with id `firm-location-<base36 time>-<5 random>` and `isPrimary:false` (`src/hb-components/firm/KRFirmSettings.ts:102-120`).
- Each location card (`:167-210`) is `article.firmLocationCard[data-kr-element=firm-location-card][data-kr-record-id=id]` and contains:
  - a `Primary` radio (`name=firmPrimaryLocation`; choosing one clears the others, `FS/FirmSettingsSection.client.tsx:156-164`)
  - a `Remove` button (danger), disabled when only one location is left
  - fields `Location name`, `Phone`, `Email` (full width), `Address line 1` (full width), `Address line 2` (full width), `City`, `State` (uppercased, cut to 2 characters), `Postal code`
  - the note `Location {n} · Primary office|Additional office`
- Removing the primary location makes the first remaining location primary. Removing the last location adds an empty one (`FirmSettingsSection:172-179`).
- **Hard-coded defaults**, used when the lookup row is missing or invalid (`firm/KRFirmSettings.ts:65-99`):
  - `firmEntityId` `ent_krueger_richard_firm`
  - `firmName` `Krueger & Richard`
  - `officeEmail` `service@krueger-richard.com`
  - `officePhone` `972-688-6760`
  - `timeZone` `America/Chicago`
  - `matterNumberFormat` `[000]-LName,FName`
  - two locations: `firm-location-primary` "Primary Office" (state `TX`, the same phone and email, primary) and `firm-location-secondary` "Second Office" (empty)
- **Validation** (`validateKRFirmSettings`, `firm/KRFirmSettings.ts:155-199`). It runs in the browser before save and again on the server. It trims every string. It requires:
  - `schemaVersion === 'kr-firm-settings-v1'`
  - non-empty `firmName`, `officeEmail`, `officePhone`, `timeZone` and `matterNumberFormat`
  - at least one location, each with a name
  - exactly one primary location

  Error messages (exact): `Firm name is required.`, `Primary office email is required.`, `Primary office phone is required.`, `Time zone is required.`, `Matter number format is required.`, `At least one firm location is required.`, `Location N requires a name.`, `Exactly one firm location must be marked primary.` No email or phone format check is done.
- **Status lines** (`FirmSettingsSection:127-147`): `Firm settings validation failed: …`, `Saving firm settings...`, `Firm settings saved.`, `Firm settings save failed: <error>`. A load failure silently shows the defaults (`:82-87`).
- **Where it is saved** (`API/firm-settings/route.ts`):
  - Entity row: `entity.id = settings.firmEntityId` (default `ent_krueger_richard_firm`). When the row exists, `legal_name = firmName` and `updated_at` are updated. Otherwise it is created with `id, legal_name, entity_subtype_legacy='partnership', entity_subtype='partnership', entity_status='active', boi_status='unknown', created_at, updated_at` (`:79-118`).
  - Lookup row: `lookup.id = 'lk_kr_firm_locations_profile'`, `category='kr_firm_locations'`, `value='firm_locations'`, `label='Firm Locations'`, `description=JSON.stringify(settings)`, `sort_order=10` (an existing value is kept), `is_active=1`, plus `created_at`/`updated_at` (`:155-201`). The constants are in `src/hb-types/kr_lookup.types.ts:62,71,81,83`.
  - The lookup JSON stores the whole settings object, not only the locations: `{ "schemaVersion":"kr-firm-settings-v1", "firmEntityId", "firmName", "officeEmail", "officePhone", "timeZone", "matterNumberFormat", "locations":[{ "id","name","addressLine1","addressLine2","city","state","postalCode","phone","email","isPrimary" }] }`.
  - A GET falls back to the defaults when the row is missing, inactive (`is_active=0`), has the wrong category, or fails validation (`:68-76`, `:132`).

#### Employee Policies — `FS/EmployeePoliciesSettingsSection.client.tsx`

- Card: `CollapsibleSection` titled `Employee Policies`, `dataKrElement="employee-policies-card"`.
- Header actions appear only while dirty: `Undo` and `Save employee policies` (`Saving...` while saving; disabled for anyone who is not super admin) (`:104-111`).
- Users who are not super admin see `Only Super Admin can change employee policies.`, and every input is disabled.
- Top row (`div.compactPolicyRow`, `:175-206`):

| Label | Key | Control and rule |
|---|---|---|
| `Number of days employee can adjust clock entries` | `employeeClockEditWindowDays` | text; non-digits are stripped and the value is clamped to 0-30 (`FirmSettingsSection:215-218`) |
| `Number of days manager can adjust clock entries` | `managerClockEditWindowDays` | same rule (`:295-298`) |
| `Pay-period start date` | `payPeriodAnchorDate` | `type=date` |
| `Automatic return after break` | `employeeAutoClockInAfterBreak` | checkbox |

- **PTO Accrual ledger** (`FS/PTOAccrualPolicyLedger.client.tsx`). A `KRCompactLedger` with caption `PTO Accrual` and description `PTO accrual is calculated per regular hour worked and stops when unused PTO exceeds the configured maximum.` It saves its column settings under `settingsKey=kr_homebase_employee_policy_pto_ledger_v1`. Columns:

| Column | Width | Contents |
|---|---|---|
| `Years` | 110px | read-only |
| `Multiplier` | 95px | input, clamped to 0-1 on blur |
| `Max PTO` | 95px | input, clamped to 0-999 on blur |

  The rows are fixed: `0`,`1`,`2`,…,`9`,`Greater than 10`, with ids `pto-years-<slug>`. Defaults are 0.04 and 80 h for bands 0-2, and 0.06 and 120 h for the others (`firm/KREmployeePolicies.ts:82`, `:115-123`).
- **Holiday Pay ledger** (`FS/HolidayPayPolicyLedger.client.tsx`). Caption `Holiday Pay`, description `Average-hours ranges are fixed; Super Admin chooses the holiday-pay hours for each tier.`, key `kr_homebase_employee_policy_holiday_pay_ledger_v1`. Columns: `Average Hours in Last 12 Weeks` (260px) and `Holiday Pay` (110px). The pay input shows `Nhrs` and is clamped to 0-12 on blur (`kr-validator-helpers/EmployeePolicyValue.helpers.ts:18-29`). The tiers are fixed (`KREmployeePolicies.ts:85-89`):
  - `holiday-tier-0-33`: `0-33 Average Hours in last 12 weeks`, 6
  - `holiday-tier-33-36`: `33-36 …`, 7
  - `holiday-tier-36-40`: `36-40 …`, 8
- **Holiday Calendar** (`FS/HolidayCalendarPolicyPanel.client.tsx`):
  - Panel: `section[aria-label="Holiday rules"][data-kr-element=employee-policy-holiday-rules]`. Heading `Holiday Calendar`, text `Date-certain and floating holiday rules used for employee holiday pay.`, button `Add Holiday`. Ledger key `kr_homebase_employee_policy_holiday_ledger_v1`.
  - Columns: `Holiday` (190px), `Observed Rule` (190px), `2026 Observation` (140px), and `Actions` (86px). Actions holds `✎` "Edit holiday" and `🗑` "Remove holiday"; remove is disabled when only one holiday is left. Double-clicking a row opens the editor for super admins.
  - `Observed Rule` reads `MM/DD`, or `{ordinal} {weekday} in {MM-Mon}`. `2026 Observation` reads `MM-Mon-DD`, computed for 2026 (`EmployeePolicyValue.helpers.ts:45-64`).
  - The dialog is `div.modalBackdrop > section.modalDialog[role=dialog][aria-modal][data-kr-element=add-holiday-dialog]`, titled `Add Holiday` or `Edit Holiday`. Fields:
    - `Preset`: `custom`→`Custom Holiday`, then the presets. A preset that is already used is disabled and labelled `{name}-Firm Holiday`.
    - `Name of Holiday`: typing here switches the preset to `custom`.
    - `Rule Type`: `specific-date`→`Specific date every year`, `floating-weekday`→`Floating weekday of month`.
    - `Month`: labels `01-Jan` … `12-Dec`.
    - For a specific date, `Day` from `01` to the month's last day. February stops at 28 (`daysForMonth`).
    - For a floating day, `Ordinal` (`1st`,`2nd`,`3rd`,`4th`,`5th`,`last`→Last) and `Weekday` (Monday…Sunday).
  - Fixed note in the dialog: `Memorial Day is normally the last Monday in May. Labor Day is normally the first Monday in September.` Buttons: `Cancel` and `OK`.
  - New-holiday draft defaults: name `Firm Holiday No 1`, specific date, 1/1. An empty name is saved as `Firm Holiday` (`FS/EmployeePolicyHoliday.helpers.ts:24-57`).
  - The 11 presets (`KREmployeePolicies.ts:92-104`): New Year's Day 1/1, Martin Luther King Jr. Day (3rd Monday of January), Presidents' Day (3rd Monday of February), Memorial Day (last Monday of May), Juneteenth 6/19, Independence Day 7/4, Labor Day (1st Monday of September), Thanksgiving Day (4th Thursday of November), Christmas Eve 12/24, Christmas Day 12/25, New Year's Eve 12/31. All except MLK, Presidents' Day and Juneteenth are in the default list (`:125-134`).
- **Other default values** (`:107-114`): `employeeClockEditWindowDays 1`, `managerClockEditWindowDays 4`, `firmTimezone 'America/Chicago'`, `payPeriodAnchorDate '2026-08-09'`, `employeeAutoClockInAfterBreak true`, `timeReportingIncrementMinutes 6`. No screen edits `firmTimezone` or `timeReportingIncrementMinutes`.
- **Validation** (`validateKREmployeePolicies`, `:203-251`). It runs in the browser and on the server. Rules:
  - `schemaVersion === 'kr-employee-policies-v1'`
  - both clock windows 0-30
  - `timeReportingIncrementMinutes` 1-60
  - PTO multiplier 0-1 and maximum 0-999. Rows are matched by `yearsOfService`; a missing row takes its default.
  - holiday pay 0-12. Tiers are matched by `id`.
  - each holiday has a name and a month 1-12; a specific-date holiday has a day 1-31
  - at least one holiday
  - a bad `payPeriodAnchorDate` (not `YYYY-MM-DD`), `firmTimezone` or `employeeAutoClockInAfterBreak` falls back to its default without an error

  An unknown `ordinal` or `weekday` becomes `1st` or `Monday`.
- **Status lines** (`FirmSettingsSection:182-206`): `Only Super Admin can change employee policies.`, `Employee policy validation failed: …`, `Saving employee policies...`, `Employee policies saved.`, `Employee policy save failed: <error>`.
- **Stored in** `lookup.id='lk_kr_employee_policies'`, `category='kr_employee_policies'`, `value='employee_policies'`, `label='Employee Policies'`, `sort_order=20`, `is_active=1` (`API/employee-policies/route.ts:102-147`). The `description` JSON is `{ "schemaVersion":"kr-employee-policies-v1", "employeeClockEditWindowDays", "managerClockEditWindowDays", "firmTimezone", "payPeriodAnchorDate", "employeeAutoClockInAfterBreak", "timeReportingIncrementMinutes", "ptoPolicies":[{ "id","yearsOfService","accrualMultiplier","maxUnusedPtoHours" }], "holidayPayTiers":[{ "id","averageHoursRange","holidayPayHours" }], "holidays":[{ "id","name","ruleType","month","dayOfMonth"? | "ordinal"?,"weekday"? }] }`.

#### Unsaved-change (dirty) handling

- The form counts as dirty when `JSON.stringify(form)` differs from `JSON.stringify(saved)` (`FirmSettingsSection:70-71`; `stableSettingsJson`, `EmployeePolicyValue.helpers.ts:67-69`).
- `persistKRFirmSettingsViewingState` writes `localStorage['kr_homebase_firm_settings_viewing_state_v1'] = { section:'firm-settings', firmProfileDirty, employeePoliciesDirty, updatedAt }` while either form is dirty, and removes the key otherwise (`FS/FirmSettingsDirtyState.client.ts:6-35`, called at `FirmSettingsSection:113-115`).
- Nothing else reads that key, and there is no `beforeunload` handler or navigation guard.
- Profile and Employee Policies state lives in `FirmSettingsSection`, so it survives moving between Firm Settings workspaces while the section stays mounted.

#### Data Import (`firmSettingsSection=data-management`) — `src/hb-import/BulkDataManagementImportPanel.client.tsx`

- Card: `CollapsibleSection` titled `Data Import`, `dataKrElement="firm-settings-data-management-card"`, body class `dataManagementBody`. Users who are not super admin see `Only Super Admin can access Data Import.` (`FS/FirmSettingsSection.client.tsx:492-515`).
- The panel styles itself with Tailwind `STYLES` and `LAYOUT_STYLES` maps (`:30-78`). Panel element: `data-kr-id="FirmSettingsDataManagementPanel"`.

Steps:

1. **On mount** it loads `GET contacts?limit=100` and `GET matters?limit=100` (`:207-229`), then reports one of these statuses:
   - `Current contact and matter summaries loaded for duplicate checks.`
   - `Reference rows unavailable in this session. Contact creation is disabled until duplicate-check data loads.`

   It also loads `GET maintenance-gate` (`:241-252`).
2. **Chooser** (`data-kr-id="FirmSettingsDataManagementImportChooser"`): eyebrow `Data Import` and heading `Bulk Contact Staging`. It shows:
   - a `Help` button
   - a pill: `Writes: LOCKED|UNLOCKED|checking...`
   - `[lock] Lock writes`, which opens the native `window.confirm('Lock Homebase application writes? Reads, searches, this page, and your session will remain available.')`
   - `[unlock] Unlock writes`
   - `[+] Import Contacts`, disabled while writes are locked
   - `[+] Import Matters`, always `disabled`, with the tooltip `Matter imports are temporarily disabled while Contact Import review is being finalized.`
   - a download link `Contact JSONC GPT Instructions (v1.2 · Homebase 1.1.5 p441)` to `/krhomebase/api/kr-api-v1/contact-import-instructions`
   - a greyed `Matter JSONC Instructions` label (`:421-491`)
3. **Upload card**: heading `Upload JSONC`. Contact text: `Upload a contact, entity, and trust JSONC file.` It has a hidden file input (`accept=".json,.jsonc,application/json"`), a button `Select Contact JSONC file to upload or drop file below.`, and a drop zone reading `Drop JSONC file here` or `Release to upload JSONC file` (`:500-548`).
4. **Parsing and checking** happen in the browser (`stageFile`, `:285-308`; `src/hb-import/BulkImportValidation.ts`):
   - comments are stripped and the JSON parsed (`parseKrImportJsonc:131`)
   - rows are collected from a top-level array or from `contacts`, `individuals`, `entities`, `trusts` and `leads`. Trusts become `entitySubtype='trust'`; leads become individuals with `isLead:true` (`:179-189`).
   - rows are normalized (`:198-270`)
   - each row is scored against existing contacts and against earlier rows in the same file (`:272-303`):
     - email match: 0.98
     - phone match: 0.82
     - normalized name match: 0.86 for the same kind, 0.72 for a different kind
     - substring name match (both names longer than 6 characters): 0.68
     - only scores of 0.75 or more count as candidates
   - the row action is `blocked` when it has any error, `merge-review` when it has any candidate, and `create` otherwise (`:353-357`)

   The upload card collapses when every row is unblocked, and the review dialog opens automatically.
5. **Review dialog** (`src/hb-import/ContactImportReviewDialog.client.tsx`):
   - title `Review Contact Import`
   - sections `Approved to create (n)`, `Suggested merge review (n)` and `Denied (n)`
   - buttons `Close` and `Import approved contacts (n)`. The import button reads `Waiting for contact references` when the reference load failed.
6. **Import** (`runContactImport`, `:317-369`):
   - If the gate is locked it stops with `Application writes are locked. Unlock the maintenance gate before importing contacts.`
   - Each row is sent one at a time, in order:
     - a lead row goes to `POST leads?mode=contact-import` with `leadApiBody`
     - any other row goes to `POST contacts?mode=contact-import` with `contactApiBody` (`BulkImportValidation.ts:479-534`)
   - A lead row with an existing-individual candidate (score 0.82 or more) is sent with `individualId`, so the lead attaches to that person.
   - Rows that are not sent are recorded as `skipped` with `Staged for merge review; no duplicate row created.`
   - The results card lists `created`, `skipped` and `failed` rows with their IDs.
7. **Matter path** (`runMatterImport`, `:385-410`) posts to `POST matters`. It cannot be reached, because its start button is disabled.

The Help dialog (`ContactImportHelpDialog.client.tsx`) walks through five steps and describes the gate table `kr_maintenance_gate` (one row, `id='krhomebase'`). It shows manual SQL (`:52-54`).

### 3.4 Route table

`USER_ADMIN` = `['super_admin','admin']`. `INTERNAL_WRITE` = `super_admin, admin, attorney, paralegal, staff, employee`. `INTERNAL_READ` = `INTERNAL_WRITE` plus `billing, front_end_author` (`API/_server/krApiV1.ts:48-70`). A role failure returns `ROLE_NOT_AUTHORIZED` 403 (`src/app/krhomebase/api/_server/krHomebaseApiAuth.ts:42-43`). `isAuthorized` reads `user_role_set`, `role_set`, `role_set_permission`, `role_set_permission_scope` and `user_permission_override` (`api/_server/krAuthorization.ts:133,199-202`). All table access goes through the CRUD Worker (`crudRead`/`crudCreate`/`crudUpdate`/`crudSearch`).

| Method | Path | Called from | Permission check | Tables read | Tables written |
|---|---|---|---|---|---|
| GET | `/krhomebase/api/kr-api-v1/firm-settings` | `firm/KRFirmSettingsPersistence.client.ts:34` (Firm Settings mount) | `USER_ADMIN` (`route.ts:122`) | `lookup` (id `lk_kr_firm_locations_profile`) | — |
| POST | same | `KRFirmSettingsPersistence.client.ts:48` (Profile Save) | `USER_ADMIN` (`:141`); 422 `VALIDATION_INVALID_FIRM_SETTINGS: …` | `entity`, `lookup` | `entity` (`legal_name`, `updated_at`, or a new row), `lookup` (all columns); 201 `created` or 200 `updated` |
| GET | `/krhomebase/api/kr-api-v1/employee-policies` | `firm/KREmployeePoliciesPersistence.client.ts:34` | `USER_ADMIN` (`route.ts:68`) | `lookup` (id `lk_kr_employee_policies`) | — |
| POST | same | `KREmployeePoliciesPersistence.client.ts:48` | `USER_ADMIN` (`:87`) plus `role==='super_admin'`, else 403 `PERMISSION_SUPER_ADMIN_REQUIRED` (`:89`) | `lookup` | `lookup` |
| GET | `/krhomebase/api/kr-api-v1/theme-settings` | `theme/KRHomebaseThemePersistence.client.ts:57` (User Settings theme list and ThemeProvider) | `USER_ADMIN` (`theme-settings/route.ts:102`) | `lookup` where `category='kr_homebase_theme'`, limit 100; returns built-in themes plus lookup themes (`:106-114`) | — |
| DELETE | `/krhomebase/api/session` | `session/KRHomebaseSessionClient.client.ts:73` (idle and other logouts) | not examined in this pass | — | session cookie cleared |
| GET | `/krhomebase/api/kr-api-v1/contacts?limit=100` | Data Import `:212` | session, then `isAuthorized(contacts, read)`, else 403 `PERMISSION_CONTACTS_READ_REQUIRED` (`contacts/route.ts:819-825`) | full mode: `individual`, `entity`, `individual_contact_method`, `entity_contact_method`, `client`, `client_member`, `individual_address`, `entity_address`, `address`, `entity_contact`, `individual_relationship`, `contact_resolution`, `user` (`:613-625`) | — |
| POST | `/krhomebase/api/kr-api-v1/contacts?mode=contact-import` | Data Import `:342-349` | `INTERNAL_WRITE` (`:1475`), then `super_admin` for this mode, else 403 `CONTACT_IMPORT_MODE_FORBIDDEN` (`:1478`), then `isAuthorized(contacts, create)` (`:1479`) | permission tables | `individual` or `entity` (`_server/krApiV1Records.ts:263-282`, `:323-348`); `individual_contact_method` or `entity_contact_method`, primary email and phone only (`:362-429`) |
| POST | `/krhomebase/api/kr-api-v1/leads?mode=contact-import` | Data Import `:341` | `INTERNAL_WRITE` (`leads/route.ts:162`) plus `super_admin` for this mode (`:165`) | `individual`, `lead` (by `individual_id` or `public_inquiry_id`) | `individual` and `individual_contact_method` when the person is new; `lead` (`id, individual_id, public_inquiry_id, source, status, urgency, summary, practice_area, assigned_to_user_id, received_at, last_action_at, converted_client_id, created_at, updated_at`, `:214-218`) |
| GET | `/krhomebase/api/kr-api-v1/matters?limit=100` | Data Import `:213` | `INTERNAL_READ` (`matters/route.ts:439`) | `matter` (limit 100) | — |
| POST | `/krhomebase/api/kr-api-v1/matters` | Data Import `:397` (unreachable; button disabled) | `INTERNAL_WRITE` (`:508`) | `client` | `matter`, `matter_activity_log` (`:330`), `matter_party` (`:409`) |
| GET, POST | `/krhomebase/api/kr-api-v1/maintenance-gate` | Data Import `:242`, `:263` | `['super_admin']` (`maintenance-gate/route.ts:55,65`); POST body `{operation:'lock'|'unlock'}`, otherwise 422 | `kr_maintenance_gate` | `kr_maintenance_gate` (CRUD Worker action `MAINTENANCE_GATE`; lock reason `'Contact import review'`, `:31-40`) |
| GET | `/krhomebase/api/kr-api-v1/contact-import-instructions` | download link `:482`, Help dialog `:146` | `['super_admin']` (`route.ts:25`) | file `src/hb-user-docs/001-contact-entity-trust-import-jsonc-instructions.md` | — |
| GET | `http://localhost:3002/tests/api?isRunning` | Settings landing `:92` | none (external dev server) | — | — |

These screens never call `kr-api-v1/entities`. The firm entity row is written directly by the firm-settings route.

### 3.5 Tables and the sections that use them

| Table | Used by |
|---|---|
| `lookup` | Firm Profile (`lk_kr_firm_locations_profile`), Employee Policies (`lk_kr_employee_policies`), User Settings theme list (category `kr_homebase_theme`) |
| `entity` | Firm Profile (firm entity `legal_name`); Data Import (entity and trust create, duplicate-check read) |
| `individual`, `individual_contact_method`, `entity_contact_method` | Data Import (read for duplicates, write on create) |
| `lead` | Data Import (lead rows) |
| `client`, `client_member`, `address`, `individual_address`, `entity_address`, `entity_contact`, `individual_relationship`, `contact_resolution`, `user` | Data Import (read only, through the full contacts GET) |
| `matter` | Data Import (read for duplicates; write path disabled) |
| `matter_party`, `matter_activity_log` | Data Import matter path (disabled) |
| `kr_maintenance_gate` | Data Import gate |
| `user_role_set`, `role_set`, `role_set_permission`, `role_set_permission_scope`, `user_permission_override` | permission checks for the contacts routes |
| browser localStorage: `kr_homebase_user_settings_v1`, `kr_homebase_active_theme_v1`, `kr_homebase_last_activity_at`, `kr_homebase_dashboard_widgets_v1`, `kr_homebase_firm_settings_viewing_state_v1`, the three `kr_homebase_employee_policy_*_ledger_v1` keys | User Settings, idle monitor, Dashboard Settings, Firm Settings |

### 3.6 Oddities

1. **Starting page is never used.** `startingPage` is saved, but no code reads it. A repository-wide search finds it only in `UserSettingsSection`. The app always opens on `?section=` or on `dashboard` (`page.tsx:41`).
2. **A new auto-logout value takes effect only after a reload.** The monitor reads the setting on mount and on cross-tab `storage` events only (`IdleSessionMonitor:71,83-85`). Saving in the same tab fires no `storage` event, and the monitor does not listen for `kr-homebase-user-settings-change`.
3. **Users who are not admins see an empty theme list.** GET theme-settings is limited to `USER_ADMIN`. A 403 does not log the user out (only 401 does), so other users see `No administrator themes saved`. The status text says "administrator-created themes", yet the route also returns the built-in themes (`theme-settings/route.ts:114`).
4. **Profile and Employee Policies are offered to everyone but load and save only for `super_admin`/`admin`.** For other users the load fails silently and the hard-coded firm defaults are shown (`FirmSettingsSection:82-87`). A save then fails with `ROLE_NOT_AUTHORIZED`. `admin` is in `USER_ADMIN` but not in `KR_API_V1_PERSISTABLE_USER_ROLES` (`krApiV1.ts:32-48`).
5. **Unsaved-change marker.** It is written to localStorage but never read, and there is no unsaved-changes guard (`FirmSettingsDirtyState.client.ts`). Logout deletes the key because it starts with `kr_homebase_` and is not in the keep list. The same happens to `kr_homebase_dashboard_widgets_v1` and to the `kr_homebase_employee_policy_*` ledger keys (`SessionClient:33-49`).
6. **Two time-zone settings exist.** One is the firm profile `timeZone`; the other is employee-policy `firmTimezone`, which no screen edits. `timeReportingIncrementMinutes` is also stored but cannot be edited.
7. **Stale breadcrumbs.** The breadcrumb reads `window.location` inside a `useMemo` whose dependencies leave out the URL (`SHELL:383-399`). A change made with `replaceState` inside Firm or User Settings does not refresh the breadcrumb or title until another dependency changes. The breadcrumb never names `profile`, `employee-policies` or `stripe-payment-configuration`.
8. **Super-admin-only workspaces render empty for others.** In development, the landing GPT card shows for every role, but the workspace renders only for super admins. Anyone else gets an empty Firm Settings section with no menu (`SettingsUsersPanel:167-178`, `FirmSettingsSection:376,389`). A hand-typed URL for the Stripe workspace does the same. The landing GPT card also reuses the Firm-menu `data-kr-id` `firm-settings-gpt-model-gateway-card`.
9. **Hard-coded development addresses.** `http://localhost:3002/tests/api?isRunning` is fetched on every Settings landing mount, including production builds; only the card is development-only (`SettingsUsersPanel:90-97`).
10. **`?limit=100` is ignored by contacts.** The contacts GET never reads `limit`, because the route does not call `parseLimit`. Data Import therefore loads the full contact collection. Matters is capped at 100, so duplicate checks against matters beyond 100 are incomplete.
11. **The approved count understates what is imported.** The review dialog counts only `action==='create'` in `Import approved contacts (n)` and says suggested merges "are not imported". `runContactImport` also sends `merge-review` lead rows that have an individual candidate scoring 0.82 or more (`:325`, `:330-331`).
12. **Same-file duplicates can produce a bad lead request.** `leadDuplicateCandidate` does not filter out `source:'import'` candidates (`:132-136`). A lead row that duplicates an earlier row in the same file is sent with `individualId = <importKey>`, which leads to 404 `VALIDATION_INDIVIDUAL_NOT_FOUND`.
13. **Duplicated lead summary line.** `leadApiBody` already puts `Source detail: …` into `inquirySummary` and also sends `sourceDetail`. The leads route then adds `Source detail: …` again (`BulkImportValidation.ts:512-516`, `leads/route.ts:204`), so the lead summary repeats the line.
14. **Help dialog contradicts the code.**
    - It says the import may continue while the gate is locked. The panel disables `Import Contacts` and refuses to import while locked (`:318-320`, `:462`).
    - It cites "ICID" as duplicate evidence. The scorer uses only email, phone and name.
    - Its SQL uses `reason='Import review'`; the API uses `'Contact import review'`.
15. **Contact import drops fields.** It writes only the identity row plus the primary email and phone. Addresses and other fields are not imported (`krApiV1Records.ts:362-429`).
16. **Native dialog.** `window.confirm` is used for Lock writes (`BulkDataManagementImportPanel:259`). User and Firm Settings use no native alert, confirm or prompt.
17. **Hard-coded values.**
    - the firm defaults, including the name, email, phone and `ent_krueger_richard_firm` (`KRFirmSettings.ts:8,65-99`)
    - `payPeriodAnchorDate '2026-08-09'`
    - the `2026 Observation` column, fixed to the year 2026
    - February limited to 28 days
    - the instruction link label `v1.2 · Homebase 1.1.5 p441`
    - the upload button always says "Contact" even in the matter flow (`:535`)
18. **Decimals are hard to type into policy inputs.** The PTO and holiday-pay inputs are controlled numbers coerced on every keystroke (`Number(...)||0`). A partial entry such as `0.` re-renders as `0`, and the holiday-pay input shows `Nhrs` while it is being edited (`PTOAccrualPolicyLedger:37-56`, `HolidayPayPolicyLedger:40-43`).
19. **Shared validators go unused here.** `KRCommonValidators.ts` (required text, email, phone, time) is used only by the contacts, clients and leads screens. Firm Profile does no email or phone format checking. `EmployeePolicyValue.helpers.ts` is the only validator-helper used by Firm Settings.
20. **The `user-settings` nav description mentions a font size that does not exist.** It reads "theme, font size, starting page, and auto logout" (`types.ts:208`), but there is no font-size field. The user-settings card passes `dataKrId`, which `CollapsibleSection` renders as `data-kr-element`. Collapsing the User Settings card does not return to the menu, while collapsing Firm Settings cards does.
21. **Duplicated constants.** The key `kr_homebase_user_settings_v1` is declared in three places (`userSettingsStorage.ts:18`, `IdleSessionMonitor:12`, `SessionClient:13`), and the theme key in two (`theme/KRHomebaseTheme.ts:254`, `SessionClient:10`).
22. **Side effect inside a state updater.** `CollapsibleSection` calls `onExpandedChange` inside the `setExpanded` updater (`CollapsibleSection.client.tsx:66-70`).

## 4. Application Settings

### Sources and citation shorthand

All paths are relative to the old app root `D:\Repos\krueger-richard-website\apps\kr-homebase\`. Citations use these short names.

| Short name | File |
|---|---|
| ASS | `src/hb-components/modules/settings/application-settings/ApplicationSettingsSection.client.tsx` |
| CUT | `.../application-settings/CurrentUsersTable.client.tsx` |
| CUP | `.../application-settings/CurrentUsersPrefetchProvider.client.tsx` |
| CUR | `.../application-settings/currentUsersRequests.client.ts` |
| CUTY | `.../application-settings/currentUsers.types.ts` |
| TSP | `.../application-settings/TeamsSettingsPanel.client.tsx` |
| EDP | `.../application-settings/EmployeeDocumentsPanel.client.tsx` |
| ARP | `.../application-settings/ArticleSettingsPanel.client.tsx` |
| SFP | `.../application-settings/SiteFeedbackSettingsPanel.client.tsx` |
| THP | `src/hb-components/modules/settings/ThemeSettingsPanel.client.tsx` |
| THS / THI / THL | `.../settings/theme-settings/ThemeSelector.client.tsx` / `ThemeInAction.tsx` / `ThemeTokenLedger.client.tsx` |
| THPER | `src/hb-components/theme/KRHomebaseThemePersistence.client.ts` |
| THM | `src/hb-components/theme/KRHomebaseTheme.ts` |
| SUP | `src/hb-components/modules/settings/SettingsUsersPanel.client.tsx` |
| UEC / UET | `src/hb-components/KR-EditUser/UserEditCard.tsx` / `UserEditTabComponents.tsx` |
| IEC | `src/hb-components/KR-EditIndividual/IndividualEditCard.tsx` |
| RC / CRS | `src/hb-components/roleCapabilities.ts` / `customRoleSets.ts` |
| R:role-sets | `src/app/krhomebase/api/admin/role-sets/route.ts` |
| R:user-role-sets | `src/app/krhomebase/api/admin/users/[userId]/role-sets/route.ts` |
| R:teams | `src/app/krhomebase/api/admin/teams/route.ts` |
| R:users | `src/app/krhomebase/api/kr-api-v1/users/route.ts` |
| R:invites | `src/app/krhomebase/api/kr-api-v1/user-invites/route.ts` |
| R:themes | `src/app/krhomebase/api/kr-api-v1/theme-settings/route.ts` |
| R:prompt | `src/app/krhomebase/api/kr-api-v1/article-helper-prompt/route.ts` |
| R:feedback | `src/app/krhomebase/api/kr-api-v1/site-feedback/route.ts` |
| R:empdocs / R:empdoc | `src/app/krhomebase/api/employee-documents/route.ts` / `.../employee-documents/[documentId]/route.ts` |
| V1 | `src/app/krhomebase/api/kr-api-v1/_server/krApiV1.ts` |
| AUTH / AUTHZ | `src/app/krhomebase/api/_server/krHomebaseApiAuth.ts` / `krAuthorization.ts` |

Role-name sets used by the route checks:

- `KR_API_V1_USER_ADMIN_ROLES` = `super_admin`, `admin` (V1:48).
- `KR_API_V1_INTERNAL_READ_ROLES` = `super_admin`, `admin`, `attorney`, `paralegal`, `staff`, `employee`, `billing`, `front_end_author` (V1:51-60).
- `requireKRHomebaseApiSession(source, roles)` returns 401 `AUTH_REQUIRED` (503 when session validation is unavailable) or 403 `ROLE_NOT_AUTHORIZED` when `session.role` is not in the list (AUTH:27-50). `requireKrApiV1Session` is a pass-through to it (V1:95-101).
- `isBuiltInSuperAdmin` returns true at once when `session.role === 'super_admin'`; otherwise it resolves effective permissions (AUTHZ:286-294).

### 4.1 Entry and access

- **Navigation.** "Application Settings" is a sub-item of Settings (section id `application-settings`, label `Application Settings`, description "Application-wide user management, role specifications, and configuration.") (`src/hb-components/types.ts:211-218`). The left panel lists it under Settings for every user; no role filter hides it (`src/hb-components/LeftPanel.client.tsx:112`). The Settings landing card reads "Application Settings" / "User management, role specifications, and application-wide configuration." (SUP:111-116). The URL is `/krhomebase?section=application-settings` (SUP:128). The breadcrumb is `Settings / Application Settings` (`src/hb-components/KRHomebaseShell.client.tsx:391`).
- **Render.** `SettingsUsersPanel` renders `<ApplicationSettingsSection user onNavigateToUserSettings>` when the section is `application-settings` (SUP:244).
- **Access check (client).** `mayManageUsers = canManageUsers(user.role)` (ASS:654); `canManageUsers` is true only when the trimmed, lower-cased role equals `super_admin` (RC:409-416). Any other role sees only a placeholder: heading "Permissions insufficient to access Application Settings", text "Application Settings require the Super Admin role." (`data-kr-element="application-settings-permission-placeholder"`) (ASS:1304-1313). Each route re-checks on the server (see the route table).
- **Prefetch.** `CurrentUsersPrefetchProvider` wraps the whole shell (`KRHomebaseShell.client.tsx:132-136`). For Super Admin sessions it starts the users and invites requests as soon as the shell mounts (CUP:35-42). Requests are keyed by `[sessionId, userId, role]` (CUP:17-19), de-duplicated, held in memory for 30 seconds (`PREFETCH_MAX_AGE_MS = 30_000`, CUR:8), and never stored in browser storage (CUP:8).
- **URL parameter.** `applicationSettingsTab`. Accepted values, exactly: `user-management`, `role-specifications`, `team-management`, `employee-documents`, `other-configuration`, `site-feedback` (type ASS:46; read on mount ASS:661-667). Selecting a tab writes the value with `history.replaceState` (ASS:669-675). The shell removes the parameter when another section is chosen (`KRHomebaseShell.client.tsx:106`). The notifications summary links to `/krhomebase?section=application-settings&applicationSettingsTab=site-feedback` (`src/app/krhomebase/api/kr-api-v1/notifications/summary/route.ts:91`).
- **Default tab.** `user-management` (ASS:659).
- **Tab strip.** A `<nav>` with `aria-label="Application settings tabs"`, `data-kr-element="application-settings-tabs"`, `data-kr-id="application-settings-tabs"`. Each tab is a `<button>` with `data-kr-action="select-application-settings-tab"`, `data-kr-id="application-settings-tab-<id>"`, `data-kr-section-id="<id>"` (ASS:1317-1338). Labels in order:

| Value | Label |
|---|---|
| `user-management` | User Management |
| `role-specifications` | Role Sets |
| `team-management` | Teams and Scope |
| `employee-documents` | Employee Documents |
| `other-configuration` | Other Configuration |
| `site-feedback` | Web Site Feedback |

(ASS:1318-1325). Only the active tab's body is mounted (ASS:1341, 1515, 1636-1647). The outer section is `aria-label="Application settings"`, `data-kr-element="application-settings-panel"` (ASS:1316).

### 4.2a User Management tab

**Load.** On mount the screen loads users and invites in parallel (ASS:984-1030, 1092-1097):
- `GET /krhomebase/api/kr-api-v1/users?limit=100` (CUR:64). The route caps `limit` at 100 (R:users:692), so at most 100 users are listed.
- `GET /krhomebase/api/kr-api-v1/user-invites?limit=200` (CUR:68).
- It also calls `GET /krhomebase/api/admin/role-sets` for the Role Sets catalog (ASS:896-904, 1094).
- Status text: "Loading users...", then "Loaded N user(s); loading invitations…", then "Loaded N users and M invites." or "Live user list is unavailable."; errors "Current users could not be loaded." / "Invitations could not be loaded." (ASS:997-1029).

**Merging users and invites.** Each user row is matched to an invite by lower-cased email; a matching invite adds `inviteId`, `inviteStatus` (null when accepted), `inviteExpiresAt` (ASS:728-741). An invite with no matching user and not `accepted` becomes a synthetic row with id `invite:<inviteId>`, `isInviteOnly: true`, `isActive: false` (ASS:743-765). Invite status display: `revoked` shows as `cancelled`; `pending` past `expiresAt` shows as `expired` (ASS:230-234; CUT:44-49).

**Collapsible section.** Eyebrow "Application Settings", title "Current users", expanded by default, `data-kr-element="current-users-collapsible-section"` (ASS:1351-1361). Header action button "Add User" (`data-kr-action="add-user"`), shown only when no create card and no selected user (ASS:1352-1356). Inner wrapper `data-kr-id="application-settings-current-users-card"`, `data-kr-element="current-users-card"` (ASS:1363).

**Toolbar** (`data-kr-element="user-management-toolbar"`, hidden while creating or while a user is selected) (ASS:1364-1425):
- Checkbox "Active users" (default on; `data-kr-id="application-settings-current-users-active-users-filter"`; title "Show active users").
- Checkbox "Pending invites" (default off; title "Show users with pending, rejected, cancelled, or expired invitations").
- Checkbox "Deactivated users" (default off; title "Show deactivated users without an open invite").
- Icon button "⌕" (title "Filter current users") opens a popover (`role="dialog"`, `aria-label="Current users filter"`) with field "Name, email, or role" (placeholder "Start typing a user name") and up to 6 matching users as suggestion buttons (name + email) (ASS:815-821, 1378-1423). The popover closes on an outside mouse-down (ASS:884-893).
- Filter rules: active rows need `accountStatus === 'active'` and not invite-only; pending rows need an invite status or `accountStatus === 'pending'`; deactivated rows need `accountStatus === 'deactivated'` and no invite status. The text filter matches name, email, role and invite status (ASS:796-813). With no checkbox ticked the empty message is "Select Active users, Pending invites, or Deactivated users to show rows." otherwise "No users found." (ASS:1300-1302).

**Current users table** (`CurrentUsersTable` → `KRCompactLedger`; wrapper `data-kr-id="CurrentUsersTable"`; table `data-kr-id="kr-users-list-ledger-table"`; `data-kr-element="current-users-ledger"`; caption "Current users"; description "Select a row to review/edit the selected user below. Select the same row again to hide the card."; default sort Name ascending; settings key `kr_homebase_ledger_users_v1`; settings in the header) (CUT:146-180). Columns (CUT:112-128):

| Column | Value |
|---|---|
| Name | "First Last (Preferred)", middle name omitted; falls back to email (CUT:84-90, 113) |
| Email | login email |
| Role | `roleLabel(role)` (centered) |
| Status | `Active`, `Pending`, `Deactivated`, `(Invite Sent)`, `(Invite Declined)` (CUT:52-60) |
| ICID | individual ICID or "—" |
| Staff Code | employee staff code or "—" |
| Employee # | employee number or "—" |
| Last Login | `MM/DD/YY, hh:mm` or "—" |

A one-time column reveal adds ICID and Staff Code to saved preferences (migration id `users-identifiers-430`, CUT:41). Clicking a row selects it; clicking the selected row closes the card. Switching rows with unsaved edits asks `window.confirm('Discard unsaved changes to the selected user card?')` (ASS:775-794). While loading, the empty message is "Loading users…" (CUT:171). Under the table a status line shows error or status text, hidden while a user is selected (ASS:1457-1459).

**Create user.** "Add User" opens a slide-in card (`aria-label="Create user"`, `data-kr-element="create-user-card"`) (ASS:339-478):
- Breadcrumb "Users / Create"; buttons "Discard" and "Create User" (shows "User Created" after success).
- Text: "Fill the highlighted fields, choose an activation mode, then create the account." Error line "Creation failed: <message>".
- Avatar placeholder with initials, role label, and "Invitation pending" or "Activated immediately".
- Fields: "First name" (required style), "Last name" (required style), "Email" (type email), "Phone" (formatted on blur or Enter as `(NNN) NNN-NNNN`, ASS:191-206), "Role" select, "User type" select, "Activation" radios, "Invitation expires in (days)".
- Role options: all 11 built-in role sets from `KR_ROLE_SET_DEFINITIONS` — Super Admin, Attorney, Paralegal, Staff, Manager, HR / Payroll Coordinator, Office Manager, Billing / Office Manager, Front End Author, Client, External CPA (RC:263-347, 355-359) — plus "Do Not Assign a Role" (`unassigned`) only in invitation mode (ASS:419-424). Default role `staff` (ASS:172).
- User type: "Employee" (`employee`, default), "Vendor (1099)" (`vendor`), "Unspecified user" (`unspecified`); hint "Employee and Vendor create an employee file; Unspecified does not." (ASS:427-438).
- Activation: "Send invitation" (default; title "Create the user and send a login invitation email.") or "Activate now" (title "Activate without sending invitation"); choosing Activate now changes an `unassigned` role to `staff` (ASS:439-459).
- Expiry field (invitation mode only): number 1-30, default 7, hint "Choose 1–30 days. The default is 7 days." (ASS:460-473).
- "Create User" opens a custom dialog (`role="dialog"`, `data-kr-element="create-user-dialog"`): title "Create User?", text "Confirm that this user should be created in KR Homebase.", busy text "Sending request to the database...", buttons "Cancel" and "Confirm Create User" ("Creating..." while busy). The result view shows "Success" / "User created successfully." or "Failure" / "User creation failed: <error>" with an "OK" button (ASS:486-543).
- On confirm: client checks first and last name, then `POST /krhomebase/api/kr-api-v1/users` with the whole form plus `isActive` (`activateNow`), `sendInvitation`, `inviteExpirationDays` (ASS:1119-1146). Success adds an optimistic row, selects it, sets status "User created. Invitation email sent." or "User created. Invitation created, but email was not sent: <reason>." then reloads (ASS:1147-1175). Error codes are translated (ASS:212-221): `VALIDATION_MISSING_FIRST_NAME`, `VALIDATION_MISSING_LAST_NAME`, `PENDING_INVITE_ALREADY_EXISTS` ("Invitation is still pending for this email address."), `USER_EMAIL_ALREADY_EXISTS`, `USER_SSO_EMAIL_ALREADY_EXISTS` ("A Google sign-in identity already exists with this email address."), `VALIDATION_INVITE_EXPIRATION_DAYS_MUST_BE_*`, `VALIDATION_ROLE_NOT_SUPPORTED_BY_SCHEMA_V5_0`.
- "Discard" clears the form and closes the card after 350 ms (ASS:1189-1196).

**What `POST /kr-api-v1/users` does** (R:users:800-1101):
- Requires email, first name, last name and role; role must be in `KR_API_V1_PERSISTABLE_USER_ROLES` (the 11 roles plus `unassigned`, V1:32-45) (R:users:819-825). Blocks a request whose `userId` equals the caller's id with a non-`super_admin` role (R:users:826-828).
- Worker classification defaults to `employee` when absent (R:users:395-400). Expiration days 1-30, default 7 (R:users:162-164, 345-351).
- Reads `user_invite` by email; pending invites past expiry are updated to `expired` with a note; an open pending invite returns 409 `PENDING_INVITE_ALREADY_EXISTS` (R:users:841-864).
- Reads `user` by email. If found and (no invitation requested or the user is active) → 409 `USER_EMAIL_ALREADY_EXISTS`. If found, inactive and an invitation is requested → re-invites: sends email, updates `employee.is_1099_vendor` when an employee row exists and the type is not `unspecified`, creates a new `user_invite` row, returns `reissuedInvite: true` (R:users:866-956).
- Reads `user_sso_identity` by email → 409 `USER_SSO_EMAIL_ALREADY_EXISTS` (R:users:960-970).
- Without `individualId`, creates an `individual` row and `individual_contact_method` rows for email and phone (R:users:972-982; `kr-api-v1/_server/krApiV1Records.ts:249, 362-410`).
- Creates `user` with `password_hash = "disabled:<uuid>"`, `role`, `role_set_id = "role_<role>"`, `is_active`, `account_status` (`pending` when invited, else `active`) (R:users:985-1001).
- For `employee` or `vendor`: creates `employee` (`employee_number` = next 3-digit number, `staff_code` = same number, `employment_status` `inactive`/`active`, `job_title` = role key, `is_1099_vendor`, `department` "KR Homebase", `login_status` `pending`/`enabled`) (R:users:1005-1030). For `employee` it also ensures an active `user_role_set` row for `role_staff` (R:users:615-633, 1031).
- With an invitation: emails the invite link `<KR_APP_BASE_URL or origin>/krhomebase/login?invite=<token>` and creates `user_invite` (token stored as SHA-256 hash; `status` `pending`; `expires_at`; email provider fields) (R:users:425-430, 1035-1088). The raw invite URL is returned only when the email was not sent (R:users:1096).
- Returns 201 `{ userId, individualId, employeeNumber, invitation }` (R:users:1092).

**Selected user card.** `data-kr-element="selected-user-card"`, `data-kr-record-id=<id>`, with a close button (`aria-label`/title "Close selected user card", `data-kr-element="selected-user-close-button"`) (ASS:1464-1471). It shows:

1. **Selected invitation card** when the row has an invite status (ASS:1472-1480, 551-640): `data-kr-element="selected-invite-card"`, breadcrumb "Users / Invitation", status pill, name, email, "Expires <date>". Controls: "Resend expires in [N] days" (default 7, 1-30), buttons "Resend request" (disabled when accepted), "Cancel invite" (only when pending), "Delete stale request" (only when not pending).
   - Resend → `PATCH /kr-api-v1/user-invites` `{ inviteId, action: 'resend', expirationDays }`; status "Invitation resent." or "Invitation recreated, but email was not sent: <reason>." (ASS:1053-1070). The route rejects accepted invites (409 `INVITE_ALREADY_ACCEPTED`), emails a new token, updates the old row to `revoked` with a "Resent by <email> from invitation <id>. Previous invitation superseded." note, and creates a new `pending` `user_invite` row (R:invites:167-264).
   - Cancel → `PATCH` `{ inviteId, action: 'cancel' }`; status "Invitation cancelled." (ASS:1033-1050). The route sets `status = 'revoked'` and replaces `notes` with "Cancelled from KR Homebase user management." (R:invites:178-179, 268-292).
   - Delete → `window.confirm('Delete this stale invitation row? This removes the invite audit row from the pending-invite view.')`, then `DELETE /kr-api-v1/user-invites?inviteId=<id>`; status "Stale invitation deleted." (ASS:1073-1090). The route hard-deletes the `user_invite` row (R:invites:298-321).
2. **Embedded `UserEditCard`** for every row that is not invite-only (ASS:1481-1509), opened on the "Individual" tab (`defaultTab="identity"`). Shell `data-kr-id="user-edit-card-shell"` (UEC:610-613).
   - **Identity header:** the shared contact detail summary (`ContactDetailRoute summaryOnly`) with the photo column. It loads the linked person with `GET /krhomebase/api/kr-api-v1/contacts?contactId=<individualId>` (UEC:322-337). With no linked individual it shows "This account has no linked individual. Link the person before editing details." (UEC:316-320). The photo button only sets the status "Photo upload is still pending media-asset wiring." (ASS:1504).
   - **Tabs** (`role="tablist"`, `data-kr-element="user-edit-tabs"`): "Individual", "Security", "Roles", "Notifications", "Danger zone" (UEC:191-197, 644-661).
   - **Individual tab** (IEC:64-114): "Staff Code" (max 4 characters, upper-cased, placeholder "e.g. KRU1", editable only when a Staff role is assigned; info icon "Staff Code is required for users with the Staff role.") ; "User Status" select — "Active" (`active`), "Pending" (`pending`), "Inactive" (`deactivated`) — disabled for the viewer's own account and for `super_admin` rows, title "Super Admin and your own status cannot be changed here" (IEC:82-89; ASS:257); button "Edit User Contact Details" (opens the shared contact editor); "Undo Changes" and "Save Changes". A collapsible "Employment details" block holds "Professional title" (enrolled employees only), "Employee File" (enrolled; navigates to User Settings `userSettingsSection=employee-file`, SUP:229-238) or "Enroll as Employee" (not enrolled), and bar-admission controls when the person is an attorney (IEC:96-111).
   - **Security tab:** "Google SSO Active" / "Sign-in is currently controlled through Google SSO." and an MFA "Coming Soon!" box; password fields are hidden (UET:498-522).
   - **Roles tab** (`data-kr-id="roles-component"`): heading "Roles", text "Assign one or more independent role sets to this user. Permissions are additive; matter access stays in Associated Matters."; one checkbox per role set from `GET /admin/role-sets`, marked "Built in" or "Custom definition"; notice "Role assignments changed locally. Click Save user to apply them."; a read-only "Current Resource Permissions" table described "Effective permissions are additive across the assigned Role Sets." The first checked set (catalog order) becomes primary (UET:524-611).
   - **Notifications tab:** "Coming Soon" placeholder listing Matter assignments, Conflict-check results, Invoice approvals pending, Weekly time summary (UET:676-692).
   - **Danger zone tab:** "Deactivate user" / "Revokes sign-in and reassigns open matters. The employee record is retained." and a "Deactivate" button with no click handler (UET:694-706).
   - **Save rules (client):** first and last name required; "Staff Code is required for Staff users." when any Staff role is present (UEC:436-459). Turning off attorney with admissions present opens a custom dialog "Clear Bar Admissions?" / "Turning off IsAttorney will clear the current bar-admission records when you save. Continue?" / "Clear and Save" (UEC:477-489, 706-713). A browser `beforeunload` warning is registered while dirty (UEC:416-424).
   - **Save calls** (`saveSelectedUser`, ASS:1216-1275): (a) `PATCH /kr-api-v1/users` with `userId`, `individualId`, `jobTitle`, `role`, `staffCode`, `accountStatus`, `barAdmissions`, `roleSetId: "role_<roleSet>"`; then (b) `PUT /admin/users/<userId>/role-sets` with `roleSetIds` and `primaryRoleSetId` (sent whenever `roleSetAssignments` is defined, which is always, ASS:253, 1235-1243). Success status "User changes saved." clears after 5 seconds.
   - **Enroll as Employee:** custom dialog "Enroll as Employee?" / "Register this user as an Employee and assign the Staff role while preserving any existing Super Admin access." / "Enroll as Employee" / busy "Registering as employee..." (UEC:695-705). It calls `PATCH /kr-api-v1/users` `{ userId, workerClassification: 'employee' }`; status "Employee enrollment saved as <number>." (ASS:1277-1298).

**What `PATCH /kr-api-v1/users` does** (R:users:1109-1383): role is taken from `role` or from `roleSetId` (`role_<x>`); a mismatch returns `VALIDATION_ROLE_SET_ID_MISMATCH`. Staff role without a staff code → `VALIDATION_STAFF_CODE_REQUIRED` (R:users:1147-1157); staff code longer than 4 → `VALIDATION_STAFF_CODE_TOO_LONG`. Self-demotion is blocked (R:users:1165-1167). `accountStatus` sets `user.account_status` and `user.is_active`; changing status away from `active` for yourself or a `super_admin` → 422 `SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED` (R:users:1227-1231). `roleSetIds` in the body → 409 `ROLE_SET_ASSIGNMENTS_USE_ADMIN_ROLE_SETS_ENDPOINT`; `customRoleSet` → 410 `LEGACY_CUSTOM_ROLE_LOOKUP_STORAGE_RETIRED` (R:users:1214-1215). Writes: `user` (role, role_set_id, account_status, is_active); `individual` (name parts, dob, ssn, ssn_last4, notes, is_minor, is_attorney) when sent; `employee.staff_code` (unique across employees, 409 `STAFF_CODE_ALREADY_EXISTS`); a new `employee` row on enrollment (`employment_status` `active` or `contractor`) plus the `role_staff` assignment; `employee.job_title`; `employee_certification` rows for bar admissions (`certification_type_lookup_id = 'lk_employee_cert_law_license'`; removed admissions are set to `inactive`) (R:users:1233-1369). Email changes go through the shared linked-email helpers and can revoke sessions (R:users:1222-1226, 1372-1378).

**What `PUT /admin/users/[userId]/role-sets` does** (R:user-role-sets:64-113): super_admin only; target user must exist (32-42). Removing `role_super_admin` from your own account → 422 `SELF_SUPER_ADMIN_DEMOTION_BLOCKED` (73). Primary must be in the list (75). Every id must be an active, assignable `role_set` (77-78). Including `role_staff` requires a non-empty `employee.staff_code` (79-88). Deactivates dropped `user_role_set` rows, re-activates or creates the rest (`id = urs_<uuid>`, `is_primary`, `assigned_by_user_id`), then sets `user.role_set_id` to the primary (89-105). `user.role` is not changed. `GET` on the same path returns `{ assignments, roleSets }` (44-61) but the screen does not call it.

### 4.2b Role Sets tab

- Collapsible section, eyebrow "Application Settings", title "Role Sets", `data-kr-element="role-sets-workspace"` (ASS:1516-1522).
- Toolbar (`data-kr-element="role-set-toolbar"`): button "New Custom Role Set"; text "Built-in roles are code-defined. Custom role sets are independent role_set definitions and may be assigned to one or more users." (ASS:1523-1528).
- Ledger: caption "Role Sets", description "Built-in role sets are read-only. Custom role sets are editable role_set definitions with normalized role_set_permission rows.", columns "Role Set" (sortable), "Permissions" (count, sortable), "Notes"; default sort Role Set ascending; settings key `kr_homebase_ledger_role_specs_v1` (ASS:824-828, 1529-1538). Rows come from `GET /admin/role-sets`; if that list is empty the code-defined `KR_ROLE_SET_DEFINITIONS` are shown instead (ASS:707-726, 319-330). Custom rows show the summary "Independent custom role-set definition. Assign it to users from the user Roles tab." (ASS:718).
- Selecting a row with unsaved custom edits asks `window.confirm('This custom role set has unsaved changes. Discard changes and view another role set?')` (ASS:862-872).
- **Selected card** (`data-kr-element="selected-role-card"`, `data-kr-id="role-set-selected-card"`, `data-kr-record-id`) (ASS:1539-1601):
  - Built-in: name, summary, read-only permission table, text "This is a build in role. It cannot be edited."
  - Custom: name input (`aria-label="Custom role set name"`; shows "Role Set Name in use." when another row has the same normalized name), button "Copy Existing Role Set" (`data-kr-id="copy-existing-role-set-button"`), description textarea, editable permission table, text "Role-set id: <id>. Custom roles may create, read, and update users, but cannot delete users or manage protected administration.", button "Save Custom Role Set".
  - Permission table: shared "Current Resource Permissions" card (`data-kr-id="role-set-current-resource-permissions"`), description "Built-in Role Sets are read-only; custom Role Sets may edit allowed permissions.", columns Resource, Scope, C, R, U, D (`CurrentResourcePermissionsCard.tsx:31-55`). `attendance` and `employee_documents` have Own/Team/All rows and store scoped keys `<resource>.<action>.<scope>`; other resources have one "All" row (ASS:1574-1593). Protected checkboxes are disabled: whole resources `roles`, `firm_details`, `data_management`, and actions `users.delete`, `invoices.delete`, `payments.delete`, `writeoffs.delete` (CRS:28-40; ASS:1571-1573).
- **Copy dialog** (`data-kr-element="copy-role-set-dialog"`): title "Copy Existing Role Set", text "Select one or more role sets. Their permissions will be merged into the current editing role set and will not be saved until you click Save Custom Role Set.", one checkbox per other role set ("Built in"/"Custom"), buttons "Cancel" and "Copy to Current Role Set". Merging is client-side and drops protected keys (ASS:958-977, 1603-1632).
- **Actions:**
  - "New Custom Role Set" → `POST /admin/role-sets` `{ name: 'New Custom Role Set', description: 'Describe the purpose of this custom role set.', permissions: [] }`, reload, select the new row; status "Custom role-set template created." (ASS:907-928).
  - "Save Custom Role Set" → `POST /admin/role-sets` `{ roleSetId, name, description, permissions, scopedPermissions }`; status "Saved custom role set “<name>”." (ASS:931-956).
- **Route `POST /admin/role-sets`** (R:role-sets:165-218): role `super_admin` plus `isBuiltInSuperAdmin` (167-171). Name 1-120 chars, description ≤1000. Unknown `roleSetId` → 404; built-in (`is_system = 1`) → 409 `BUILT_IN_ROLE_SET_READ_ONLY`; duplicate active name → 409 `VALIDATION_ROLE_SET_NAME_IN_USE` (184-187). New ids are `role_custom_NNN` / role key `custom_NNN` (74-78), `role_family 'operations'`, `sort_order 100` (199). Writes `role_set`, then one `role_set_permission` row per permission resource (`id = rsp_<roleKey>_<resource>`, `can_create/read/update/delete`, `can_approve = 0`, `can_send = 0`, `is_restricted_delete`, `permission_group` `billing` for invoices/payments/writeoffs/time_entries, else `application`) (80-112), and `role_set_permission_scope` rows for own/team/all (`id = rsps_<roleKey>_<resource>_<scope>`; new rows only when a flag is 1) (114-139). Optional `copyFromRoleSetId` copies a source's rows when `permissions` is empty (190-195); the screen never sends it.
- **Route `GET /admin/role-sets`** (141-162): reads active `role_set` rows, all `role_set_permission` and `role_set_permission_scope` rows; resources with no stored row are synthesized from the code definitions (37-56). Returns `{ roleSets, customRoleSets }` sorted by `sort_order`, label.
- **Route `DELETE /admin/role-sets?roleSetId=`** (221-237) sets `role_set.is_active = 0` and deactivates its `user_role_set` rows. No button calls it.

### 4.2c Teams and Scope tab

- Card `aria-label="Team management"`, `data-kr-element="team-management-panel"`; heading "Teams and Scope"; text "Assign employees to teams and designate team leads. A team-scoped permission applies only when the signed-in user is a lead of the employee's active team." (TSP:72-77).
- Buttons "New Team" (clears the draft) and "Save Team" ("Saving…") (TSP:78-81). Status lines "Loading teams…", error text, "Team saved. Team scope now follows these active memberships and leads." (TSP:60, 83-85).
- Fields: "Existing team" select (first option "New team", then team names; the first team is auto-selected after load), "Team name", "Description" (TSP:30, 87-101).
- Fieldset "Employee members": one checkbox per employee — "Name · EmployeeNumber" with job title (or "Employee"); empty text "No enrolled employees found. Enroll a User as an Employee before assigning team scope." (TSP:104-110). Fieldset "Team leads": one checkbox per active user — name and email (TSP:111-117).
- Client check: "A team name is required." (TSP:52).
- **`GET /admin/teams`** (R:teams:38-75): super_admin plus `isBuiltInSuperAdmin` (28-36). Reads `team`, `team_member`, `team_lead`, `employee`, active `user`, `individual`. Returns active teams with `memberEmployeeIds` and `leadUserIds` from active rows, `employeeDirectory` (all employees: id, userId, employeeNumber, employmentStatus, jobTitle, name) and `userDirectory` (active users: id, email, name). Name is preferred name, else first + last, else email (24-26).
- **`POST /admin/teams`** (77-135): body `{ teamId?, name, description, memberEmployeeIds, leadUserIds }`. Name 1-120 chars, unique among active teams (409 `VALIDATION_TEAM_NAME_IN_USE`); unknown employee or lead ids → 422. Creates or updates `team` (`id = team_<uuid>`, `created_by_user_id`). Syncs `team_member` and `team_lead`: removed rows get `is_active = 0`, `ends_at = now`; re-added rows are re-activated; new rows `tm_<uuid>` / `tl_<uuid>` with `starts_at = now`. Returns `{ teamId }`. There is no delete route and no delete button.

### 4.2d Employee Documents tab

- Card `aria-label="Employee documents"`, `data-kr-element="employee-documents-panel"`; heading "Employee Documents"; text "Sensitive HR files are stored privately and are separate from Employee Records. Hard delete is disabled; retention workflows can be added later." Button "Upload Document" ("Uploading…") (EDP:63-67).
- Fields: "Employee" select ("Select employee", then "Name · EmployeeNumber"; first employee auto-selected), "Category" select with the raw values `i9`, `w4`, `w9`, `offer-letter`, `handbook-acknowledgment`, `performance-review`, `new-hire`, `termination`, `payroll-support`, `other` (default `other`), "Title (optional)" (placeholder "Uses the file name when blank"), "Private file" (file input `id="employee-document-file"`) (EDP:6, 27, 71-74).
- Table columns: Document, Category, Status, Received, File ("Open" link to the download URL); empty row "No documents for this employee." (EDP:76).
- Messages: "Select an employee and a document file.", "Employee document uploaded to private storage." (EDP:47, 55).
- Calls: employee list from `GET /krhomebase/api/admin/teams` (`employeeDirectory`) (EDP:22-28); `GET /krhomebase/api/employee-documents?employeeId=<id>` (EDP:30-35); upload `POST /krhomebase/api/employee-documents` as multipart `employeeId`, `category`, `title`, `file` (EDP:46-58).
- **`GET /employee-documents`** (R:empdocs:114-135): any signed-in user; visibility from scoped permission `employee_documents.read` own/team/all (80-94; team = active `team_lead` of an active `team_member`, 71-78). Reads `employee`, `team_member`, `team_lead`, all `document_record` and all `media_asset` rows, keeps `source = 'employee_documents'`, `storage_status <> 'archived'`. Returns `{ documents }` with `downloadUrl = /krhomebase/api/employee-documents/<id>`.
- **`POST /employee-documents`** (137-172): scoped `employee_documents.create`; category must be in the list above (`employeeDocumentStorage.ts:7-18`). Uploads to R2 bucket `KR_EMPLOYEE_STORAGE_BUCKET` env or `kr-homebase-employee-storage` (55), key `employees/<employeeId>/hr/<category>/<documentId>/<safeName>` (`employeeDocumentStorage.ts:36-39`). Creates `media_asset` (`owner_type 'employee'`, `purpose 'employee_document'`, `visibility 'private'`) and `document_record` (`id doc_<uuid>`, `is_confidential 1`, `source 'employee_documents'`, `storage_type 'r2'`, optional `receivedDate`, `notes`). On failure it deletes the R2 object and marks the rows `failed` / `deleted` (166-168).
- **`GET /employee-documents/[documentId]`** (R:empdoc:38-65) streams the file after own/all/team read checks. `PATCH` (67-93) updates title, category, notes; the screen does not call it. `DELETE` (95-100) always returns 405 `EMPLOYEE_DOCUMENT_HARD_DELETE_DISABLED_USE_RETENTION_WORKFLOW`.

### 4.2e Other Configuration tab

The tab stacks `ThemeSettingsPanel` and `ArticleSettingsPanel` (`data-kr-element="application-other-configuration-workspace"`) (ASS:1640-1645).

**Theme Settings** (THP:381-476; `data-kr-id="ThemeSettingsPanel"`, `data-kr-element="theme-settings-card"`):
- Breadcrumb "Application Settings / Other Configuration / Theme Settings" and a caret ("Expand Theme Settings" / "Collapse Theme Settings"). Collapsed by default (THP:158, 383-396).
- When expanded: a sticky review bar (`data-kr-id="theme-settings-review-bar"`) titled "Theme setup and preview", collapsed by default ("Collapsed so the token ledger stays visible.") (THP:159, 398-410), and the token ledger.
- **Theme selector** (`data-kr-id="ThemeSelector"`) (THS:133-236): "THEME" select; "Apply Theme" (shown after a selection or edit); delete button "🗑" (custom themes only; `aria-label="Delete <name>"`); "Download Theme"; "Upload Theme" (accepts `.json`/`.jsonc`); "Create New Theme"; "Save Theme" (enabled only when dirty). Note "Built-in themes are read-only. Editing a token automatically creates a custom User Theme draft." Upload errors: "Upload must be a .json or .jsonc theme file.", "Theme settings validation failed: …", "Could not parse the selected theme file. Check the JSON/JSONC syntax and try again."
- **Theme in action** preview (`data-kr-id="ThemeInAction"`): heading "Theme in action: <name>", samples for dark shell, light workspace, buttons ("Download Theme Settings", "Apply Preview", "Primary Sample" — inert), mini table, panel accent, notices (THI:269-328).
- **Token ledger** (`data-kr-id="ThemeTokenLedger"`, table `data-kr-id="kr-theme-token-ledger-table"`): heading "Theme token ledger", text "Grouped rows are editable. Built-in themes save as a new custom theme.", buttons "+ Expand all", "- Collapse all", a caret; columns Group, Setting Name (CSS variable + label), Value / Sample, Purpose; collapsible group banners (THL:299-396). Gradient rows are hidden when the accent style is `solid`.
- Behavior: editing a token on a built-in theme forks it to "User Theme N" (THP:211-231). "Create New Theme" copies the draft as "User Theme N" (THP:247-263). Upload imports as a custom draft (THP:266-280). "Apply Theme" writes `localStorage['kr_homebase_active_theme_v1']` and fires the window event `krhomebase-theme-change` (THP:75-79, 240-244; THM:254, 257). "Download Theme" saves `<themeId>.jsonc` with a comment header naming "kr-homebase-theme-v1.1 / Patch 36" (THP:86-102).
- Save dialog (`data-kr-element="theme-save-dialog"`): "Create Custom Theme?" / "Create Custom Theme "<name>"?" or "Overwrite Custom Theme?" / "Overwrite Custom Theme "<name>"?", buttons "Cancel", "Confirm Save" (THP:455-474). Delete dialog (`data-kr-element="theme-delete-dialog"`): "Delete Custom Theme?" / "Delete Custom Theme "<name>" from the selector[ and lookup table]?", "Cancel", "Confirm Delete" (THP:438-453). Both use a rainbow spinner while busy.
- Calls (THPER:16, 57-148): `GET /krhomebase/api/kr-api-v1/theme-settings` on mount (THP:173-198); `POST` `{ theme }` on save (THP:357); `DELETE` with JSON body `{ themeId }` (only when the theme was saved to lookup) (THP:298-307).
- **Routes** (R:themes): all three require `super_admin` or `admin` (102, 127, 205). Storage is the `lookup` table, `category = 'kr_homebase_theme'`, `id = lk_kr_homebase_theme_<slug>` (`hb-types/kr_lookup.types.ts:60, 452-460`), `value` = theme id, `label` = name, `description` = theme JSON, `sort_order 100`. `GET` returns built-in themes plus valid active lookup themes (101-120). `POST` validates the theme and creates or updates the row; returns `{ id, themeId, status: 'created' | 'updated' }` (126-196). `DELETE` refuses built-in ids (409 `BUILT_IN_THEME_DELETE_FORBIDDEN`) and sets `is_active = 0`; returns `status: 'deactivated'` (204-247).

**Article Settings** (ARP:120-153): collapsible, eyebrow "Application Settings / Other Configuration", title "Article Settings", collapsed by default, `data-kr-element="article-settings-collapsible-section"`. Header buttons "Restore Default" and "Save Prompt" ("Saving..."; disabled unless dirty and non-blank). Text "Super Admin setting for the GPT Helper Prompt downloaded from Upload Article. The prompt is stored in lookup.description and falls back to the code default until saved." Field "Upload Article GPT Helper Prompt" (monospace textarea, `data-kr-element="article-helper-prompt-editor"`). Status line "<status> Source: lookup|default. [Unsaved changes.]".
- Calls: `GET` and `POST { prompt }` to `/krhomebase/api/kr-api-v1/article-helper-prompt` (ARP:12, 36-60). "Restore Default" only resets the editor to `DEFAULT_FRONT_END_PUBLISHING_HELPER_PROMPT` (ARP:113-118).
- **Route** (R:prompt): `super_admin` only (26, 71, 91). Reads/writes one `lookup` row `id = 'lk_kr_article_helper_prompt_upload_article'`, `value = 'upload_article_gpt_helper_prompt'`, `label 'Upload Article GPT Helper Prompt'`, `description` = prompt, `sort_order 110` (`kr_lookup.types.ts:75-87`; R:prompt:104-141). Prompt required, max 50,000 characters (29, 97-99). `GET` returns `{ prompt, source, lookupId }` (70-87).

### 4.2f Web Site Feedback tab

- Wrapper `data-kr-id="application-settings-site-feedback-panel"`; card `data-kr-id="site-feedback-ledger-card"`; heading "Web Site Feedback", text "Super Admin review surface for public-site and KR Homebase feedback.", button "Refresh" (SFP:385-395).
- Toolbar (`data-kr-id="site-feedback-toolbar"`): checkbox "Select visible", "Status filter" select ("All statuses" + statuses), chip "N selected" (SFP:398-411).
- Bulk controls (`data-kr-id="site-feedback-bulk-controls"`): "Selected status", "Selected class", "Selected priority" (each "No change" + options), "Selected assignee" (placeholder "No change"); buttons "Apply to selected", "Delete selected"; status line (SFP:415-452).
- Value lists: classifications `general`, `bug`, `content`, `design`, `accessibility`, `workflow`; priorities `low`, `normal`, `high`; statuses `new`, `reviewing`, `reviewed`, `closed`, `spam` (SFP:24-26; same sets server-side R:feedback:34-36).
- Ledger: caption "Site feedback ledger"; columns "✓" (row checkbox), Submitted, App, Class, Priority, Status, Votes, Route, Feedback (message cut to 86 characters), Assigned; default sort Submitted descending; empty "No feedback rows found."; settings key `kr_homebase_ledger_site_feedback_v1` (SFP:192-218, 457-468).
- Detail card (`data-kr-id="site-feedback-detail-card"`): heading "Feedback Review", route/page/id; buttons "Vote +1 (N)" and "Delete"; "Submitted feedback" message box; pills "Submitted …", "App …", "Component …", "From <email>"; fields "Status", "Classification", "Priority", "Assigned to" (placeholder "Unassigned"), "Internal notes"; buttons "Save Review", "Revert" (SFP:470-538).
- Calls: `GET /krhomebase/api/kr-api-v1/site-feedback?limit=200` or `?reviewStatus=<s>&limit=200` (reloads on filter change) (SFP:221-235, 375-378). `POST /kr-api-v1/site-feedback` with `action`: `update_feedback` (Save Review), `vote`, `delete_feedback`, `bulk_update`, `bulk_delete` (SFP:263-373). Deletes ask `window.confirm('Delete this feedback row? This cannot be undone.')` and `window.confirm('Delete N selected feedback row(s)? This cannot be undone.')` (SFP:314, 359). Vote messages "Vote recorded." / "This user already voted on that feedback." (SFP:303).
- **Route** (R:feedback): `GET` `super_admin` only (243-266); `POST` accepts `KR_API_V1_INTERNAL_READ_ROLES` (270), allows `vote` for them, and requires `super_admin` for every other action (303). Data lives in table `site_feedback` reached through the public-inquiry CRUD Worker (`publicInquiryRead/Search/Delete`, `callPublicInquiryWorker`), not the main D1 (21-28, 189-240). Column mapping: classification → `feedback_type`, priority → `severity`, status → `review_status`; updates also set `reviewed_at`, `reviewed_by_user_id`, `updated_at` (199-226). Assignee, vote count and voter ids are stored as JSON appended to `internal_notes` after the marker `--- KRH_FEEDBACK_REVIEW_META ---` (33, 130-162). A Super Admin vote always adds 1 and is not recorded as a voter; other users vote once (284-293). Assignee max 120 characters, notes max 4,000 (215-216). Bulk lists are capped at 100 ids (128). Deletes are hard deletes (326-350).

### 4.3 Route table

| Method | Path | Called from | Permission check | Tables read | Tables written |
|---|---|---|---|---|---|
| GET | `/krhomebase/api/kr-api-v1/users?limit=100` | Users list (CUR:64; prefetch CUP:38) | `super_admin` or `admin` (R:users:687) | user, individual, user_invite, individual_contact_method, employee, individual_address, address, matter_access, matter_staff_assignment, matter, user_role_set, role_set, employee_certification (R:users:635-660) | none |
| POST | `/krhomebase/api/kr-api-v1/users` | Create User (ASS:1136) | `super_admin` or `admin` (R:users:801) | user_invite, user, user_sso_identity, employee, user_role_set | user_invite (expire, create), user, individual, individual_contact_method, employee, user_role_set |
| PATCH | `/krhomebase/api/kr-api-v1/users` | Save Changes (ASS:1222), Enroll as Employee (ASS:1284) | `super_admin` or `admin` (R:users:1110) | user, employee, employee_certification, user_role_set | user, individual, employee, employee_certification, user_role_set; linked-email helpers on email change |
| PUT | `/krhomebase/api/admin/users/{userId}/role-sets` | Save Changes (ASS:1236) | `super_admin` + `isBuiltInSuperAdmin` (R:user-role-sets:34-37) | user, role_set, employee, user_role_set | user_role_set, user.role_set_id |
| GET | `/krhomebase/api/kr-api-v1/user-invites?limit=200` | Invites list (CUR:68) | `super_admin` or `admin` (R:invites:143) | user_invite | user_invite (auto-expire, R:invites:158) |
| PATCH | `/krhomebase/api/kr-api-v1/user-invites` | Cancel invite / Resend request (ASS:1038, 1058) | `super_admin` or `admin` (R:invites:168) | user_invite, user | user_invite |
| DELETE | `/krhomebase/api/kr-api-v1/user-invites?inviteId=` | Delete stale request (ASS:1079) | `super_admin` or `admin` (R:invites:299) | none | user_invite (hard delete) |
| GET | `/krhomebase/api/admin/role-sets` | Role Sets tab (ASS:899); user Roles tab (UET:541) | `super_admin` + `isBuiltInSuperAdmin` (R:role-sets:143-147) | role_set, role_set_permission, role_set_permission_scope | none |
| POST | `/krhomebase/api/admin/role-sets` | New Custom Role Set, Save Custom Role Set (ASS:912, 939) | `super_admin` + `isBuiltInSuperAdmin` (R:role-sets:167-171) | role_set, role_set_permission, role_set_permission_scope | role_set, role_set_permission, role_set_permission_scope |
| DELETE | `/krhomebase/api/admin/role-sets?roleSetId=` | not called | `super_admin` + `isBuiltInSuperAdmin` (R:role-sets:222-225) | role_set, user_role_set | role_set, user_role_set |
| GET | `/krhomebase/api/admin/teams` | Teams tab (TSP:25), Employee Documents employee list (EDP:23) | `super_admin` + `isBuiltInSuperAdmin` (R:teams:28-36) | team, team_member, team_lead, employee, user, individual | none |
| POST | `/krhomebase/api/admin/teams` | Save Team (TSP:57) | same (R:teams:78) | team, employee, user, team_member, team_lead | team, team_member, team_lead |
| GET | `/krhomebase/api/employee-documents?employeeId=` | Employee Documents list (EDP:32) | any session; scoped `employee_documents.read` own/team/all (R:empdocs:116, 120) | employee, team_member, team_lead, document_record, media_asset | none |
| POST | `/krhomebase/api/employee-documents` | Upload Document (EDP:52) | any session; scoped `employee_documents.create` (R:empdocs:139, 150-151) | employee, team_member, team_lead | R2 object, media_asset, document_record |
| GET | `/krhomebase/api/employee-documents/{documentId}` | "Open" link (EDP:76) | scoped `employee_documents.read` (R:empdoc:49-55) | document_record, employee, team_member, team_lead, media_asset, R2 | none |
| GET / POST / DELETE | `/krhomebase/api/kr-api-v1/theme-settings` | Theme Settings (THPER:57-148) | `super_admin` or `admin` (R:themes:102, 127, 205) | lookup | lookup (POST create/update; DELETE sets is_active 0) |
| GET / POST | `/krhomebase/api/kr-api-v1/article-helper-prompt` | Article Settings (ARP:37, 49) | `super_admin` only (R:prompt:71, 91) | lookup | lookup |
| GET | `/krhomebase/api/kr-api-v1/site-feedback` | Feedback ledger (SFP:226) | `super_admin` only (R:feedback:244) | site_feedback (public-inquiry Worker) | none |
| POST | `/krhomebase/api/kr-api-v1/site-feedback` | Save Review, Vote, Delete, Apply to selected, Delete selected (SFP:263-268) | internal roles; non-vote actions `super_admin` (R:feedback:270, 303) | site_feedback | site_feedback (update, hard delete) |
| GET | `/krhomebase/api/kr-api-v1/contacts?contactId=` | Embedded user card header (UEC:325) | Contacts module route (not reviewed here) | individual and contact tables | none (the contact editor's own save routes belong to Contacts) |

### 4.4 Tables touched by Application Settings

| Table | Tab(s) |
|---|---|
| `user` | User Management (read, create, update); Teams and Scope (read active users); role-set PUT writes `role_set_id` |
| `user_invite` | User Management (read, auto-expire, create, revoke, hard delete) |
| `user_sso_identity` | User Management (create-user duplicate check) |
| `individual`, `individual_contact_method` | User Management (create, update; list enrichment); Teams (names) |
| `individual_address`, `address` | User Management (list enrichment, address display) |
| `matter_access`, `matter_staff_assignment`, `matter` | User Management (list enrichment: associated matters) |
| `employee` | User Management (create on user create or enroll; staff code, job title, 1099 flag); Teams and Scope (directory); Employee Documents (scope checks) |
| `employee_certification` | User Management (bar admissions) |
| `role_set`, `role_set_permission`, `role_set_permission_scope` | Role Sets (read, create, update); User Management Roles tab (read) |
| `user_role_set` | User Management (role assignments; automatic `role_staff` on employee enrollment); Role Sets DELETE route (unused) |
| `team`, `team_member`, `team_lead` | Teams and Scope (read, write); Employee Documents (team scope checks) |
| `document_record`, `media_asset` (+ R2 bucket `kr-homebase-employee-storage`) | Employee Documents |
| `lookup` (`category = 'kr_homebase_theme'`; row `lk_kr_article_helper_prompt_upload_article`) | Other Configuration |
| `site_feedback` (public-inquiry database through its Worker) | Web Site Feedback |

### 4.5 Oddities, dead code, bugs and hard-coded values

**Access and permissions**
- The left-panel item and Settings landing card show "Application Settings" to every role; only the component blocks non-Super-Admins (LeftPanel.client.tsx:112; ASS:1304).
- Inside the User Management tab, the block `!mayManageUsers` ("User creation is restricted" / "Only Super Admin/Admin users should see user-management controls.") can never render, because the component already returned the placeholder (ASS:1304-1313 vs 1343-1348).
- Client gate is `super_admin` only (RC:414-416), but the users, user-invites and theme-settings routes also accept a role named `admin` (V1:48). `admin` is not one of the 11 role sets (RC:263-347); `roleLabel` has a special case for it (RC:403).
- The admin routes check `['super_admin']` and then `isBuiltInSuperAdmin`, which returns true immediately for that role, so the second check never adds anything (AUTHZ:291).
- The theme provider calls `GET /kr-api-v1/theme-settings` for every signed-in user (`KRHomebaseThemeProvider.client.tsx:46`), but that route allows only `super_admin`/`admin`; other users silently keep built-in themes. `UserSettingsSection.client.tsx:202` makes the same call.
- Employee Documents: the employee picker loads from `/admin/teams` (Super Admin only), while the document routes use scoped `employee_documents` permissions open to any role that holds them (EDP:23; R:empdocs:80-94).
- Site feedback `POST` accepts a role `employee` (V1:57) that is not a role set either.

**User Management**
- The user list asks for `limit=100` and the route caps at 100, so firms with more than 100 users see a truncated list with no paging (CUR:64; R:users:692).
- `GET /kr-api-v1/user-invites` writes to the database (auto-expires pending invites) on every read (R:invites:87-104, 158).
- Cancel overwrites `user_invite.notes` with the reason instead of appending (R:invites:286); resend and auto-expire append.
- Resend emails use the email address as the display name (R:invites:210).
- `invited_by_user_id` is stored as null when the session user is not found in D1; a note records this (R:users:772-795, 937, 1077).
- Create user: client does not check email; the route error `VALIDATION_MISSING_EMAIL` is shown raw because `formatCreateUserError` has no case for it (ASS:212-221; R:users:819).
- Create user with an `employee` or `vendor` type sets `employee.job_title` to the role key (for example `staff`) and `staff_code` to the employee number (R:users:1014-1018). The `employee` type also assigns `role_staff` regardless of the chosen role (R:users:1031).
- Create user writes `role_set_id = "role_" + role` with no check that the `role_set` row exists, including `role_unassigned` for `unassigned` (R:users:260-262, 995).
- `saveSelectedUser` always sends `role` and `roleSetId: "role_" + roleSet`, so every save rewrites `user.role` and `user.role_set_id`; it then always calls the role-sets PUT, which overwrites `user.role_set_id` with the primary assignment but never changes `user.role`. The two columns can disagree (ASS:1222-1243; R:user-role-sets:105).
- Because the PUT runs on every save, a Super Admin saving their own card fails with `SELF_SUPER_ADMIN_DEMOTION_BLOCKED` unless `role_super_admin` is among their assignments (R:user-role-sets:73).
- After saving with no assignments, the local row's role becomes `unassigned` ("Do Not Assign a Role") though the database `user.role` was not changed (ASS:1244-1247).
- Status messages "Prototype card edits undone." and "Photo upload is still pending media-asset wiring." are set while a user is selected, but the status line is hidden whenever a user is selected, so they never show (ASS:1457, 1501, 1504).
- Photo upload in `UserEditCard` (`POST /krhomebase/api/media/profile-image`, UEC:524-584) is unreachable from Application Settings because the parent passes `onUploadPhoto`.
- `UserEditCard` appends the debug class `STYLES.b1` (red 4px dashed border) to its shell, so the embedded card shows a debug border (UEC:219, 611).
- Roles tab notice says "Click Save user to apply them." but the button is labeled "Save Changes" (UET:562; UEC:603).
- Roles tab marks the first checked set in catalog order as primary, not the set the user marked (UET:561).
- Danger zone "Deactivate" button has no handler; Notifications and MFA are placeholders (UET:676-706, 514-520).
- `UserEditCard` default tab is `security` but Application Settings passes `identity` (UEC:252; ASS:1496). The doc comment at UEC:10-12 names tabs (Permissions, Bar admissions) that no longer match the strip.
- `mfaStatus` is hard-coded "Google SSO" by the route and the client; `practice` is hard-coded "KR Homebase user" (R:users:744; ASS:254, 284).
- `inviteSent ?? Boolean(row.lastLogin)` in CUR:65 is dead because the route always returns `inviteSent` (R:users:748).
- Optimistic user id fallback `usr_<Date.now()>` (ASS:1148).
- Invite expiry limits 1-30 days, default 7, are hard-coded in three places (ASS:175, 465-466, 577; R:users:162-164; R:invites:52-54).
- Unused import `type MouseEvent` (ASS:7).

**Role Sets**
- "New Custom Role Set" always posts the name "New Custom Role Set"; a second click fails with `VALIDATION_ROLE_SET_NAME_IN_USE` until the first is renamed (ASS:915; R:role-sets:187).
- The `DELETE` route and the `copyFromRoleSetId` option exist but nothing in the screen uses them; there is no way to remove a custom role set from the UI (R:role-sets:190-195, 221-237).
- Typo "This is a build in role. It cannot be edited." (ASS:1600).
- Fallback rows (when the API returns none) use ids like `super_admin` while API rows use `role_super_admin` (ASS:319-330 vs R:role-sets:60).
- Scope-aware resources are hard-coded to `attendance` and `employee_documents` in the toggle handler (ASS:1577).
- Protected lists are hard-coded (CRS:28-40); the `billing` permission group list is hard-coded (R:role-sets:89).
- The ASS doc comment says "user-management and role-specification tabs" only (ASS:642-646).

**Teams, documents, configuration, feedback**
- Teams: no delete or deactivate for a team; Team leads lists every active user, not only employees (TSP:111-117).
- Employee Documents: the category select shows raw values (`i9`, `offer-letter`); the form has no Received date or Notes field though the route accepts them (EDP:72; R:empdocs:161); edit (PATCH) exists but is unused; the list shows only the selected employee.
- Theme default id fallback `'krhomebase-default'` does not match the built-in id `krhomebase-default-theme-setings` (misspelled "setings") (THP:149; THM:292).
- "Apply Theme" is per browser (localStorage), not per user (THP:77).
- Article prompt textarea uses an inline `style` object (ARP:145).
- Site feedback stores assignee and votes inside `internal_notes` text, not columns (R:feedback:33, 155-162). Super Admin can vote without limit (R:feedback:293). The client both sends `reviewStatus` to the server and filters again locally (SFP:185-188, 225).
- Feedback ledger keeps rows per status filter; `bulk_update` reports the number of requested ids, including ids it skipped as not found (R:feedback:315-324).

**Native browser dialogs (all `window.confirm`; no `alert` or `prompt`)**
- ASS:777 "Discard unsaved changes to the selected user card?"
- ASS:864 "This custom role set has unsaved changes. Discard changes and view another role set?"
- ASS:1074 "Delete this stale invitation row? This removes the invite audit row from the pending-invite view."
- SFP:314 "Delete this feedback row? This cannot be undone."
- SFP:359 "Delete N selected feedback row(s)? This cannot be undone."
- Plus a browser `beforeunload` prompt while the user card is dirty (UEC:416-424).
- Custom dialogs (not native): Create User, Copy Existing Role Set, theme save/delete, Enroll as Employee, Clear Bar Admissions.

**Browser storage keys**
- `kr_homebase_active_theme_v1` — active theme id (THM:254; THP:77, 163, 180).
- `kr_homebase_ledger_users_v1`, `kr_homebase_ledger_role_specs_v1`, `kr_homebase_ledger_site_feedback_v1` — ledger column settings, plus named preferences at `<key>:preference:<name>` (CUT:176; ASS:1537; SFP:467; `modules/ledger/KRCompactLedger.client.tsx:255-268, 378`).
- User and invite rows are kept in memory only (CUP:8).

## 5. Stripe Payment Configuration (port exactly)

Folder: `src/hb-components/modules/settings/firm-settings/stripe-payment-configuration/`. Super Admin only. Reached at `?section=firm-settings&firmSettingsSection=stripe-payment-configuration`. The requester's direction is to keep its style, layout, structure and behavior exactly, so this section records class strings value for value. The Tailwind strings below already follow the `STYLES` / `LAYOUT_STYLES` pattern of `AGENTS_05`, so they can be carried over unchanged; only the import paths and the API calls change.

### 5.1 Component tree

```text
StripePaymentConfigurationWorkspace          data-kr-id="StripePaymentConfigurationWorkspace"
  PaymentProviderConfigPanel                 data-kr-id="PaymentProviderConfigPanel"  (section, aria-label "Stripe payment configuration")
    status row                               encryption-key line, load error, Refresh
    cards row (Live left, Sandbox right; stacked below xl)
      PaymentProviderConfigCard live         data-kr-id="payment-provider-live-card"
      PaymentProviderConfigCard sandbox      data-kr-id="payment-provider-sandbox-card"
  divider
  StripeDevTestsWorkspace                    sandbox tests (section 5.7)
```

`StripePaymentConfigurationWorkspace.client.tsx:41-55`: holds the active sandbox profile (`useState<PaymentProviderConfig | null>`) reported by the panel through `onSandboxChange`, and passes `sandboxConfigured` and `sandboxPublishableKey` to the tests workspace.

| Map | Key | Value (exact) |
|---|---|---|
| Workspace `STYLES` | `divider` | `border-t border-[var(--kr-theme-line,#d7dee5)]` |
| Workspace `LAYOUT_STYLES` | `workspace` | `gap-3 grid` |
| | `tests` | `pt-2` |
| Panel `STYLES` | `muted` | `text-[9pt] text-[var(--kr-theme-text-muted,#526172)]` |
| | `warning` | `text-[9pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]` |
| | `smallButton` | `px-1.5 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[8pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50` |
| Panel `LAYOUT_STYLES` | `panel` | `gap-1.5 grid` |
| | `statusRow` | `gap-2 flex items-center` |
| | `refresh` | `ml-auto` |
| | `cardsRow` | `gap-2 grid grid-cols-1 xl:grid-cols-2 items-start` |

### 5.2 Panel behavior (`PaymentProviderConfigPanel.client.tsx`)

- Loads `GET /krhomebase/api/payment-providers` on mount and on **Refresh** (`data-kr-action="stripe-payment-configuration-refresh"`, disabled while loading). Until the list arrives the cards still render from an empty list (`EMPTY_PROVIDER_LIST`, lines 35-38), so the layout never jumps.
- Status row text (exact): `Loading…` while loading; then either `Secrets are encrypted at rest (key {kekId ?? '—'}). Stored keys are never shown; compare by SHA-256.` (muted) or `Payment encryption key not configured{ (problem)}. Secrets cannot be saved.` (warning). Load errors use `KrRequestErrorNote` (`data-kr-element="stripe-payment-configuration-load-error"`).
- Friendly load errors (lines 41-46): `PAYMENT_PROVIDER_TABLE_MISSING` → "The payment_provider table is not available yet (run the migration and redeploy the CRUD Worker)."; codes starting `VALIDATION_SEARCH_COLUMN_UNKNOWN` → "The CRUD Worker registry is out of date for payment-provider profiles; redeploy the CRUD Worker and refresh this page."; `KR_API_V1_FORBIDDEN` or any code containing `FORBIDDEN` → "Only Super Admins can view payment configuration."
- Sandbox report (lines 88-91): the active sandbox profile is the first enabled sandbox row, else the first sandbox row, else null.
- After a save (lines 94-106) the saved row replaces or is appended to the list; when it is enabled, every other row of the same environment is shown as `configured: false, isEnabled: false` with the problem "Configuration is disabled." (the server enforces one enabled profile per environment). After a delete the row is removed.
- Cards are given their environment's rows sorted by `ppid` (nulls last).

### 5.3 Card layout (`PaymentProviderConfigCard.client.tsx`)

One card per environment. Top border 4px: Live uses `--kr-theme-danger` (#9d2c20), Sandbox uses `--kr-theme-orange` (#e45e25).

```text
┌─ Live Configuration [Configured|Not configured]      Connection [select ▾]  ☐ Enabled ─┐
│ Account ID ⓘ  [acct_…            ]   Login email ⓘ    [                         ]      │
│ Publishable ⓘ [pk_live_…                                                          ]    │
│ Secret name ⓘ [e.g. krh-sandbox… ]   Secret key ⓘ     sk_live_… · SHA-256 1234abcd…    │
│                                                       [••••••••••••••••••] [Check]     │
│ Webhook name ⓘ[                  ]   Webhook secret ⓘ whsec_… · SHA-256 …               │
│                                                       [••••••••••••••••••] [Check]     │
│ API version ⓘ [account default   ]   Currency ⓘ       [usd]                             │
│ Notes ⓘ       [                                                                   ]    │
│ status / problems / errors           [Delete key] [Test connection] [Save]             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Header (lines 480-492): `h3` title `Live Configuration` or `Sandbox Configuration`; chip `Configured` (success) or `Not configured` (danger); right side: label `Connection` with a select (`id="pp-{env}-profile"`) whose first option is `Create new` (value `new`) and then one option per stored profile, text `[CON {ppid}] {secretKeyName || 'Unnamed key'}`; then a checkbox labelled `Enabled`.

Rows (lines 495-537), each a grid with a fixed 92px label column. Every label has an info icon (`KRHomebaseIcons.InfoDark`, `h-3 w-3 shrink-0 cursor-help`) whose `title` is the field tip (5.4).

| Row (`data-kr-element`) | Grid | Fields (label → input id, placeholder) |
|---|---|---|
| `payment-provider-{env}-account-row` | `pairRow` | `Account ID` → `pp-{env}-account-id`, `acct_…`, mono, red border when not `^acct_[A-Za-z0-9]{6,}$`; `Login email` → `pp-{env}-account-email`, `type="email"`, `autoComplete="off"`, `data-1p-ignore`, `data-lpignore="true"` |
| `payment-provider-{env}-publishable-row` | `singleRow` | `Publishable` → `pp-{env}-pk`, `pk_live_…` / `pk_test_…`, mono, trimmed on input, red border when the pattern fails, `spellCheck={false}` |
| `payment-provider-{env}-secret-row` | `secretRow` | `Secret name` → `pp-{env}-sk-name`, `e.g. krh-sandbox-secret-key`; `Secret key` → write-only `SecretKeyField` `pp-{env}-sk`, placeholder `Paste sk_live_/rk_live_ to replace` (live) or `Paste sk_test_/rk_test_ to replace` (sandbox) |
| `payment-provider-{env}-webhook-row` | `secretRow` | `Webhook name` → `pp-{env}-wh-name`; `Webhook secret` → write-only `SecretKeyField` `pp-{env}-wh`, placeholder `Paste whsec_… to replace`, stored prefix shown as `whsec_` |
| `payment-provider-{env}-api-row` | `pairRow` | `API version` → `pp-{env}-api-version`, `account default`, mono, trimmed; `Currency` → `pp-{env}-currency`, mono, `maxLength={3}`, lowercased |
| `payment-provider-{env}-notes-row` | `notesRow` | `Notes` → `pp-{env}-notes` |
| `payment-provider-{env}-actions-row` | `actionsRow` | messages left; buttons right |

Both secret inputs are disabled when the server has no encryption key (`encryptionReady` false) or the card is busy.

Actions (lines 539-551):

| Button | `data-kr-action` | Shown / enabled | Busy text |
|---|---|---|---|
| `Delete key` (secondary) | `payment-provider-{env}-delete` | only when the selected profile is saved (`config.id`) | — |
| `Test connection` (secondary) | `payment-provider-{env}-test` | enabled only when configured and not dirty; `title="Save first"` when dirty | `Testing…` |
| `Save` (primary) | `payment-provider-{env}-save` | enabled only when dirty | `Saving…` |

Message area: `KrRequestErrorNote` (`data-kr-element="payment-provider-{env}-error"`), else the status text, else up to two `problems` (warning color) and `Last test {YYYY-MM-DD HH:MM} UTC · {lastVerifiedStatus ?? '—'}`.

Card `STYLES` (exact):

| Key | Value |
|---|---|
| `card` | `rounded border border-[var(--kr-theme-line,#d7dee5)] bg-white` |
| `cardLive` | `border-t-4 border-t-[var(--kr-theme-danger,#9d2c20)]` |
| `cardSandbox` | `border-t-4 border-t-[var(--kr-theme-orange,#e45e25)]` |
| `title` | `text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]` |
| `chipOk` | `px-1.5 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-success,#2e7d5b)]` |
| `chipOff` | `px-1.5 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-danger,#9d2c20)]` |
| `label` | `whitespace-nowrap text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]` |
| `labelWithTip` | `inline-flex items-center gap-0.5` |
| `tipIcon` | `h-3 w-3 shrink-0 cursor-help` |
| `field` | `px-1.5 py-0.5 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] text-[var(--kr-theme-text,#243142)]` |
| `profileSelect` | `px-1 py-0.5 max-w-[220px] rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[8pt] text-[var(--kr-theme-text,#243142)]` |
| `mono` | `font-mono` |
| `masked` | `[-webkit-text-security:disc]` |
| `invalid` | `border-[var(--kr-theme-danger,#9d2c20)]` |
| `secretMeta` | `truncate font-mono text-[8pt] text-[var(--kr-theme-text-muted,#526172)]` |
| `smallButton` | same as the panel's `smallButton` |
| `primaryButton` | `px-2 py-0.5 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50` |
| `secondaryButton` | `px-2 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50` |
| `match` | `text-[8pt] font-semibold text-[var(--kr-theme-success,#2e7d5b)]` |
| `noMatch` | `text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]` |
| `status` | `text-[8pt] text-[var(--kr-theme-text-muted,#526172)]` |
| `problem` | `text-[8pt] font-semibold text-[var(--kr-theme-warning,#b47a2a)]` |

Card `LAYOUT_STYLES` (exact):

| Key | Value |
|---|---|
| `card` | `px-2 py-1.5 gap-1 grid content-start` |
| `header` | `gap-2 flex items-center` |
| `headerSpacer` | `ml-auto gap-2 flex items-center` |
| `profileChooser` | `gap-1.5 flex items-center` |
| `deleteConfirmationRow` | `mt-3 gap-1 grid` |
| `pairRow` | `gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1.6fr)] items-center` |
| `secretRow` | `gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1.6fr)] items-start` |
| `secretCell` | `gap-0.5 grid` |
| `secretInputRow` | `gap-1 grid grid-cols-[minmax(0,1fr)_auto] items-center` |
| `singleRow` | `gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)] items-center` |
| `notesRow` | `gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)] items-center` |
| `actionsRow` | `pt-0.5 gap-2 flex items-start justify-between` |
| `actionGroup` | `gap-1.5 flex shrink-0 items-center` |
| `messages` | `gap-0.5 grid` |
| `mismatchRow` | `gap-1 flex items-center` |

The card's root is `<section>` with `LAYOUT_STYLES.card STYLES.card` plus `cardLive` or `cardSandbox`, `aria-label` = the title, `data-kr-id="payment-provider-{env}-card"`, `data-kr-element="stripe-payment-configuration-{env}"`.

### 5.4 Field tips (exact, `fieldTip`, lines 77-92)

`{webhookUrl}` is `https://pay.krhomebase.com/stripe/webhook/live` or `.../sandbox`.

| Field | Tip |
|---|---|
| Account ID | "Stripe Dashboard → Settings (gear icon) → Business → Account details. The ID (acct_…) is listed there. Stripe moves this around, so you may also find it by clicking your account name in the top-left." + sandbox only: " A sandbox has its own ID: switch into the sandbox first." + " Optional; used only for Open in Stripe Dashboard links." |
| Login email | "The email you sign in to Stripe with. For reference only." |
| Publishable | "Stripe Dashboard → Developers → API keys → Publishable key (pk_live_… / pk_test_…). One per account or sandbox, public by design. Stripe.js uses it for card entry and the bank lookup." |
| Secret name | "The key name shown in Stripe → Developers → API keys. The standard key is called "Secret key"; a restricted key shows the name you gave it (e.g. krh-sandbox-secret-key). For reference, so you know which key to roll." |
| Secret key | "Paste the secret key (sk_live_ / sk_test_…) or a restricted key (rk_live_ / rk_test_…) from Developers → API keys. Stripe checks it on Save. It is stored encrypted and never shown again: only its prefix and SHA-256. To confirm which key is stored, paste it and press Check (compared in this browser, nothing is sent)." |
| Webhook name | "The Stripe Webhook name for this Live / Sandbox profile. The URL is {webhookUrl}. For reference only." |
| Webhook secret | "Signing secret (whsec_…) of the Live / Sandbox pay Worker event destination in Stripe → Workbench → Webhooks ({webhookUrl}, event payment_intent.succeeded). The pay Worker reads this profile's secret to verify events on that route. Stored encrypted, write-only." |
| API version | "Leave blank to use your Stripe account's default API version. Enter a dated version only to pin one." |
| Currency | "Three-letter currency code for charges, lowercase (usd)." |
| Notes | "Free text for Super Admins, e.g. where the key is kept in KeePass. Never put a key here." |

### 5.5 Card behavior

- **Profile selection** (lines 300-341, 363-374): the card opens on the enabled profile, else the first one, else a new draft. Because the cards mount before the list arrives, it selects the enabled profile when the list arrives unless the user already chose `Create new`. `Create new` starts a draft (`isEnabled: true`, empty keys) that carries Account ID, Login email and Currency forward from the selected (or first) profile. If the selected profile disappears (deleted elsewhere), the card falls back to the default profile.
- **Dirty** (line 360): a pasted secret, a pasted webhook secret, or any editable field differing from the stored row. Selecting another profile, or a newer `updatedAt` arriving, reloads the form and clears both secret inputs (lines 343-353).
- **Write-only secret field** (`SecretKeyField`, lines 201-272): an uncontrolled `type="text"` input masked with `-webkit-text-security: disc` (deliberately not `type="password"`, so browsers and password managers never offer to save it), with `autoComplete/autoCorrect/autoCapitalize="off"`, `spellCheck={false}`, `data-1p-ignore`, `data-bwignore`, `data-form-type="other"`, `data-lpignore="true"`, `aria-label="{label} (write-only)"`. Above it: `{prefix}… · SHA-256 {first 8}…{last 8} · {YYYY-MM-DD}` (full hash in `title`), or `No secret key stored` / `No webhook secret stored`. **Check** (disabled when nothing is stored; `title="Hashes the pasted value in this browser and compares it with the stored hash"`) hashes the pasted value with Web Crypto SHA-256 in the browser; nothing is sent. Pasting a value of the right shape runs Check automatically (typing does not).
  - Same key: "Matches the stored key. Nothing to save; the field was cleared." The input is emptied so the card stays clean.
  - Different key: "Does not match the stored key." with a **Replace…** button (`data-kr-action="{id}-replace-prompt"`), and the replace dialog opens.
  - Wrong shape: "Paste a secret key of the right type first." / "Paste a webhook secret of the right type first."
- **Key patterns** (`paymentProvider.types.ts:112-115`): sandbox secret `^(sk|rk)_test_[A-Za-z0-9]{10,}$`, publishable `^pk_test_[A-Za-z0-9]{10,}$`; live secret `^(sk|rk)_live_[A-Za-z0-9]{10,}$`, publishable `^pk_live_[A-Za-z0-9]{10,}$`; webhook (both) `^whsec_[A-Za-z0-9]{10,}$`.
- **Save** (lines 382-425): blocked with "Fix the highlighted fields first." when the publishable key or account id is invalid. A **live** save that pastes a new secret, or that disables an enabled profile, first opens the dialog "Change live payment configuration" (confirm `Save live configuration`), text "Replace the live Stripe secret key? Card payments and refunds use the new key immediately. Stripe checks the key before it is stored." or "Disable the live Stripe configuration? Card payments will stop working until it is enabled again." The request sends `providerId`, the editable fields, `secretKey` and `webhookSecret` only when pasted, and `expectedUpdatedAt` (optimistic concurrency). After success both secret inputs are emptied at once and the status reads "Saved. Stripe accepted the new secret key." or "Saved."
- **Replace dialog** (lines 389-401, 564-573): title "Different secret key" / "Different webhook secret"; buttons `Copy the new key` (saves now, counts as the live confirmation), secondary `Leave the old key` (clears the field; status "Kept the stored {label}; the pasted one was cleared."), and Cancel (keeps the pasted value). The description names both shortened hashes and says that other unsaved changes on the card are saved too.
- **Test connection** (lines 427-441): status "Connected (live|test mode). Available: {amount/100 with 2 decimals} {CURRENCY}, ….".
- **Delete key** (lines 443-473, 575-601): dialog "Delete payment provider key", text "This permanently deletes provider profile {ppid} ({secretKeyName || 'unnamed key'}) from the database.", with an input labelled "Type DELETE KEY to confirm" (`placeholder="DELETE KEY"`, focused on open). Anything else shows "Type DELETE KEY exactly to permanently delete this provider profile." Busy label "Deleting key…". After delete the card selects the next enabled (or first remaining) profile and shows "Deleted provider profile {ppid}."
- **Friendly save/test/delete errors** (lines 141-154): `PAYMENT_PROVIDER_MODE_MISMATCH` "That key belongs to the other Stripe mode (test vs live)."; `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY*` "Stripe rejected the secret key."; `PAYMENT_PROVIDER_CHANGED_ELSEWHERE` "This configuration was changed elsewhere. Reload and try again."; `PAYMENT_PROVIDER_NOT_FOUND` "That provider profile no longer exists. Refresh the payment settings and try again."; `PAYMENT_PROVIDER_KEK*` "The payment encryption key is not configured on the server."; `PAYMENT_PROVIDER_TABLE_MISSING` "The payment_provider table is not available (migration or CRUD Worker deploy pending)."; `VALIDATION_PAYMENT_PROVIDER_SECRET_KEY*` "The secret key does not match this environment (sk_/rk_ test vs live)."; `VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY*` "The publishable key does not match this environment (pk_test_ vs pk_live_)."; `VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET` "The webhook secret must start with whsec_."; `VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION` "Type DELETE KEY exactly to confirm deletion."; `VALIDATION_PAYMENT_PROVIDER_ID` "Select a saved provider profile before deleting it."
- All three dialogs use the old `U6ConfirmationDialog` (the new repository's `U6ConfirmationDialog` has the same props: `busy`, `busyLabel`, `error`, `secondaryLabel`, `onSecondary` and children).

### 5.6 Browser contract (`paymentProvider.types.ts`, `paymentProvidersApi.client.ts`)

- `PaymentProviderConfig`: `environment`, `id`, `ppid`, `configured`, `isEnabled`, `displayName`, `accountId`, `accountEmail`, `publishableKey`, `secretKeyName`, `secretKeyPrefix`, `secretKeyHash`, `secretKeySetAt`, `webhookSecretName`, `webhookSecretHash`, `webhookSecretSetAt`, `apiVersion`, `defaultCurrency`, `lastVerifiedAt`, `lastVerifiedStatus`, `notes`, `updatedAt`, `problems[]`.
- List: `{ providers: PaymentProviderConfig[], encryption: { configured, kekId, problem } }`.
- One route, `/krhomebase/api/payment-providers`: `GET` lists; `POST {action:'save', environment, providerId?, fields, secretKey?, webhookSecret?, expectedUpdatedAt}` → `{provider}`; `POST {action:'delete', environment, providerId, confirmation:'DELETE KEY', expectedUpdatedAt}`; `POST {action:'test-connection', environment}` → `{connection:{environment, livemode, available[], pending[]}}`.
- `displayName` is in the editable fields but the card has no input for it (it is sent back unchanged).


### 5.7 Sandbox tests, server routes, table and pay Worker


Old app root: `D:\Repos\krueger-richard-website\apps\kr-homebase\`. Paths below are relative to it unless absolute. All files read in full; nothing written there.

Files covered:

- `src/hb-components/modules/settings/firm-settings/stripe-payment-configuration/StripeDevTestsWorkspace.client.tsx` (417 lines)
- `.../StripeDevTestsAchForm.client.tsx` (314 lines)
- `.../StripeDevTestsQueryPanel.client.tsx` (461 lines)
- `.../stripeDevTests.types.ts` (376 lines), `.../stripeDevTestsApi.client.ts` (99 lines)
- `.../paymentProvider.types.ts` (only for key patterns, field names)
- `src/hb-lib/stripe/stripeJs.client.ts`, `src/hb-lib/errors/krRequestError.client.ts`, `src/hb-lib/errors/KrRequestErrorNote.client.tsx`
- `src/hb-components/menu/tab-menu-style1/MenuStyleOne.client.tsx` + `MenuStyleOne.module.css`
- `src/app/krhomebase/api/payment-providers/route.ts`, `src/app/krhomebase/api/stripe-dev-tests/route.ts` (+ their `api-contract.json`)
- `src/app/krhomebase/api/_server/krPaymentProviderStore.ts`, `krPaymentProviderCrypto.ts`, `krStripeApi.ts`, `krStripeSettings.ts`, `krEnvironmentSecrets.ts`, `krHomebaseApiAuth.ts`, `kr-api-v1/_server/krApiV1.ts`
- `D:\Repos\krueger-richard-website\apps\shared\d1-workers\kr-pay-worker\kr-pay-worker.ts` (targeted reads only)

---

#### 5.7.1 Sandbox tests workspace (`StripeDevTestsWorkspace`)

##### 5.7.1.1 Mounting and props

Parent `StripePaymentConfigurationWorkspace.client.tsx:51`:

```tsx
<StripeDevTestsWorkspace sandboxConfigured={Boolean(sandbox?.configured)} sandboxPublishableKey={sandbox?.publishableKey || null} />
```

`sandbox` is the `PaymentProviderConfig` that `PaymentProviderConfigPanel` reports through `onSandboxChange`. `configured` is computed server-side (see 5.7.2.6). Props:

- `sandboxConfigured: boolean`: gates every Run / Look up / Search button.
- `sandboxPublishableKey: string | null`: `pk_test_…` used only by the ACH tab's Stripe.js bank lookup.

##### 5.7.1.2 Rendered tree (in order)

```
div  workspace  data-kr-id="StripeDevTestsWorkspace" data-kr-component="StripeDevTestsWorkspace" data-kr-element="stripe-dev-tests-workspace"
├─ div header  data-kr-element="stripe-dev-tests-header"
│   ├─ p.intro      "Sandbox tests: run test card and ACH payments with the Sandbox configuration. Live keys are never used here."
│   └─ span.sandboxBadge "Sandbox"
├─ MenuStyleOne  props={{ ariaLabel:'Stripe sandbox test type', idPrefix:'stripe-dev-tests', menuKrId:'stripe-dev-tests-menu',
│                 items:[{id:'card',label:'Card',card:cardTab},{id:'ach',label:'ACH',card:<StripeDevTestsAchForm enabled={sandboxConfigured} onResult={setResult} publishableKey={sandboxPublishableKey}/>}] }}
├─ div resultsRow  data-kr-element="stripe-dev-tests-results-row"
│   ├─ section  `${LAYOUT_STYLES.resultPanel} ${resultStyle}`  aria-live="polite" aria-label="Test payment result"
│   │           data-kr-id="stripe-dev-tests-result" data-kr-element="stripe-dev-tests-result"
│   └─ StripeDevTestsQueryPanel (defaultClientNumber, defaultIcid, defaultIvid from the CARD form, enabled=sandboxConfigured,
│                                latestPaymentIntentId=result?.paymentIntentId ?? null)
└─ p.footnote
```

Footnote text (exact, `{…}` is dynamic): `Test cards from ` + link `docs.stripe.com/testing` (href `https://docs.stripe.com/testing`, `rel="noopener noreferrer" target="_blank"`, class `STYLES.link`) + `. The card number stays in this browser; the server charges Stripe's matching test PaymentMethod ({activeScenario.paymentMethodId}). Client No, ICID, and IVID are saved on the PaymentIntent as metadata.`

The default tab is Card (first item). Both tabs write into the one shared `result` state, so the result panel and lookup box show whichever ran last. Note: the query panel defaults always come from the card form, even when the ACH tab is active.

##### 5.7.1.3 MenuStyleOne (tab strip)

- Root `div` (`data-kr-id-menu="stripe-dev-tests-menu"`) → `nav role="tablist" aria-label="Stripe sandbox test type"` → one `button role="tab"` per item: `id="stripe-dev-tests-tab-card"` / `-ach`, `aria-controls="stripe-dev-tests-panel-<id>"`, `aria-selected`, `data-kr-element-menu-item="<id>"`, `type="button"`. Panel `div role="tabpanel"` `id="stripe-dev-tests-panel-<id>"`, `aria-labelledby` the tab, `data-kr-element-menu-panel="menu-style1-panel"`. Only the active card is mounted (switching tabs unmounts the other form; its local state resets).
- Styling is a CSS module (`MenuStyleOne.module.css`), not Tailwind:
  - `.menuStyleOne`: flex column, `min-width:0; width:100%`.
  - `.menuStyleOneMenu`: `align-items:flex-end; background:var(--kr-theme-table-row-background-1,#ffffff); border-bottom:1px solid var(--kr-theme-line,#d7dee5); display:flex; gap:2px; overflow-x:auto; overflow-y:hidden; padding:var(--kr-theme-tab-strip-padding,0 10px)`; thin scrollbar `color-mix(in srgb, var(--kr-theme-brand-primary,#21394f) 32%, transparent) transparent`; webkit scrollbar height 5px.
  - `.menuStyleOneButton`: transparent bg, no border except `border-bottom:3px solid transparent`, `color:var(--kr-theme-text-muted,#526172)`, pointer, `flex:0 0 auto`, `font-family:var(--kr-theme-font-body, Raleway, Inter, ui-sans-serif, system-ui, sans-serif)`, `font-size:var(--kr-theme-font-size-base,13px)`, `font-weight:700`, `min-height:34px`, `padding:var(--kr-theme-tab-button-padding,0 10px)`, nowrap. Hover `color:var(--kr-theme-text,#1f3040)`. Disabled: muted, not-allowed, opacity .55. Focus-visible `outline:2px solid var(--kr-theme-accent,#0066cc); outline-offset:-2px`.
  - `.menuStyleOneButtonActive`: `border-bottom-color:var(--kr-theme-accent,#8a715c); color:var(--kr-theme-table-heading-dark,#21394f); font-weight:800`.
  - `.menuStyleOnePanel` / `.menuStyleOneEmptyPanel`: `min-width:0; padding:var(--kr-theme-menu-panel-padding,10px 0 0)`.

##### 5.7.1.4 Workspace STYLES (verbatim)

```ts
const STYLES = {
  intro: 'text-[10pt] text-[var(--kr-theme-text-muted,#526172)]',
  sandboxBadge: 'px-2 py-0.5 rounded-full border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[8pt] font-bold uppercase tracking-wide text-white',
  panel: 'rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  notConfigured: 'text-[9pt] font-semibold text-[var(--kr-theme-warning,#b47a2a)]',
  panelTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] text-[var(--kr-theme-text,#243142)]',
  fieldInvalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  monoField: 'font-mono tracking-wide tabular-nums',
  fieldHint: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  fieldError: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  secondaryButton: 'px-2 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-3 py-0.5 rounded border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  resultSucceeded: 'rounded border border-[var(--kr-theme-success,#2e7d5b)] bg-white',
  resultDeclined: 'rounded border border-[var(--kr-theme-danger,#9d2c20)] bg-white',
  resultPending: 'rounded border border-[var(--kr-theme-warning,#b47a2a)] bg-white',
  resultEmpty: 'rounded border border-dashed border-[var(--kr-theme-line,#b8c3cd)] text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  resultKey: 'text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  resultValue: 'font-mono text-[9pt] text-[var(--kr-theme-text,#243142)] break-all',
  link: 'text-[9pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
  footnote: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  // b1..b4 debug borders commented out
} as const
```

##### 5.7.1.5 Workspace LAYOUT_STYLES (verbatim)

```ts
const LAYOUT_STYLES = {
  workspace: 'gap-3 grid',
  header: 'gap-2 flex items-center justify-between',
  formGrid: 'p-3 gap-1.5 grid',
  scenarioRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] items-center',
  cardRow:
    'gap-x-2 grid grid-cols-[92px_minmax(0,1.6fr)_auto_64px_auto_56px_auto_72px] items-center',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  referenceRow:
    'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  chargeRow: 'gap-x-2 grid grid-cols-[92px_110px_auto_minmax(0,1fr)] items-center',
  actionsRow: 'pt-1 gap-2 flex items-start justify-between',
  errorList: 'gap-0.5 grid',
  actionGroup: 'gap-2 flex shrink-0 items-center',
  resultsRow:
    'gap-3 grid grid-cols-[minmax(300px,1fr)_minmax(300px,2fr)] items-start',
  resultPanel: 'p-3 gap-2 grid',
  resultGrid: 'gap-x-3 gap-y-1 grid grid-cols-[120px_minmax(0,1fr)]',
} as const
```

The JSDoc comment above it: "Layout map in rendered order. The test form uses inline labels (label left, input right) on explicit grid rows so it stays short vertically; the first label column is a fixed 92px on every row so the inputs line up."

##### 5.7.1.6 Card tab form (`cardTab`)

`<form className={LAYOUT_STYLES.formGrid} aria-label="Stripe sandbox test card" data-kr-element="stripe-dev-tests-form" noValidate onSubmit=…>`. Title `<h3 className={STYLES.panelTitle}>Test CC Processing</h3>`.

Every `<label>` uses `STYLES.inlineLabel`; every input uses `STYLES.field` (+ extras below) and `autoComplete="off"` (except the select). No input has `type` unless listed. Invalid fields add `STYLES.fieldInvalid`.

| Row (`data-kr-element`) | Label | id | Control | Extra classes / attrs | Default |
|---|---|---|---|---|---|
| `stripe-dev-tests-scenario-row` (scenarioRow) | `Scenario` | `stripe-dev-tests-scenario` | `select`, options = scenario labels | | `visa-success` |
| ↳ third cell | | | `span.fieldHint` `title={activeScenario.note}`, text `{typedCardScenario?.brand ?? 'Unknown card'} · {activeScenario.note}` | | |
| `stripe-dev-tests-card-row` (cardRow) | `Card number` | `stripe-dev-tests-card-number` | text | `monoField`, `inputMode="numeric"` | `4242 4242 4242 4242` |
| | `Exp` | `stripe-dev-tests-expiry` | text | `placeholder="MM/YY"` | `12/34` |
| | `CVC` | `stripe-dev-tests-cvc` | text | `inputMode="numeric"` | `123` |
| | `ZIP` | `stripe-dev-tests-postal-code` | text | (never invalid) | `75069` |
| `stripe-dev-tests-contact-row` (contactRow) | `Cardholder` | `stripe-dev-tests-name` | text | | `KR Sandbox Tester` |
| | `Email` | `stripe-dev-tests-email` | `type="email"` | | `sandbox-test@example.com` |
| `stripe-dev-tests-reference-row` (referenceRow) | `Test Client No` | `stripe-dev-tests-client-number` | text | `monoField`, `inputMode="numeric"` | `999` |
| | `ICID` | `stripe-dev-tests-icid` | text | `monoField` | `TSTC001` |
| | `IVID` | `stripe-dev-tests-ivid` | text | `monoField` | `TSTI001` |
| `stripe-dev-tests-charge-row` (chargeRow) | `Amount (USD)` | `stripe-dev-tests-amount` | text | `tabular-nums` (literal, between field and invalid), `inputMode="decimal"` | `1.00` |
| | `Description` | `stripe-dev-tests-description` | text | | `KR Homebase Stripe sandbox test` |

Class composition is literally `` `${STYLES.field} ${STYLES.monoField} ${errors.x ? STYLES.fieldInvalid : ''}` `` (trailing space when valid). Exp/CVC: `` `${STYLES.field} ${errors.x ? STYLES.fieldInvalid : ''}` ``. Amount: `` `${STYLES.field} tabular-nums ${errors.amount ? STYLES.fieldInvalid : ''}` ``.

Input behaviour:

- Card number `onChange`: `value.replace(/[^\d\s-]/g, '').slice(0, 23)`; if it matches an allowlisted number (spaces/dashes ignored), `scenarioId` follows it; result is NOT cleared.
- Scenario select: sets scenario, card number formatted (`4-4-4-4`, Amex `4-6-5`), CVC `'1234'` for Amex else `'123'`; clears `result` and `submitError`.
- ICID / IVID: `value.toUpperCase().slice(0, 7)`. Others stored as typed.

Actions row (`data-kr-element="stripe-dev-tests-actions-row"`, actionsRow):

- Left `div.errorList`, `role="alert"` when there are errors or a submit error: one `span.fieldError` per validation message (key = message), then `<KrRequestErrorNote dataKrElement="stripe-dev-tests-submit-error" error={submitError} />`, then when `!sandboxConfigured`: `<span className={STYLES.notConfigured}>Save the Sandbox configuration above to enable test payments.</span>`.
- Right `div.actionGroup`:
  - `button.secondaryButton` `data-kr-action="stripe-dev-tests-reset"` `type="button"` → `Reset to Visa 4242` (restores defaults, clears result and error).
  - `button.primaryButton` `data-kr-action="stripe-dev-tests-run-payment"` `type="submit"` `disabled={hasErrors || submitting || !sandboxConfigured}` → `Run Test Payment` / `Processing…` while submitting.

Validation (`validateForm`, live via `useMemo` on every change; exact messages):

- Card not in allowlist → `Card: only Stripe test card numbers are accepted. Never enter a real card.`
- Expiry not `/^(\d{2})\s*\/\s*(\d{2})$/` → `Expiry: use MM/YY, e.g. 12/34.`; month outside 1–12 or past month (year = 2000+YY) → `Expiry: use any valid future date.`
- CVC must be exactly `cvcLength` digits (scenario of the TYPED card; default 3) → `` CVC: use any ${cvcLength}-digit CVC. ``
- Client No (when non-blank) `/^\d{1,6}$/` → `Client No: digits only.`
- ICID (when non-blank) `/^[A-Z0-9]{7}$/` → `ICID: 7 letters/digits, e.g. K7M2Q9A.`
- IVID (when non-blank) → `IVID: 7 letters/digits, e.g. A1B2C3D.`
- Amount: strip `[$,\s]`, must match `/^\d+(\.\d{1,2})?$/`, cents = `Math.round(n*100)`, 50 ≤ cents ≤ 100000 → `Amount: between $0.50 and $1,000.00.` (built with `Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})`).
- Cardholder, email, ZIP, description are not validated in the browser.

Submit (`runTestPayment`): returns if errors/submitting/unknown card; sets submitting, clears result and error, posts:

```json
{ "action": "create-test-payment", "scenarioId": "<scenario of typed card>", "amountCents": <int>,
  "description": "<as typed>", "cardholderName": "<as typed>", "email": "<as typed>", "postalCode": "<as typed>",
  "clientNumber": "<trimmed>", "icid": "<trimmed>", "ivid": "<trimmed>" }
```

Card number, expiry and CVC are never sent. Failure → `stripeDevTestsFailure(envelope, 'create-test-payment')`; success → `setResult(envelope.data.result)`.

##### 5.7.1.7 Result panel

`resultStyle`: no result → `resultEmpty`; `status === 'succeeded'` → `resultSucceeded`; else `errorCode` → `resultDeclined`; else `resultPending`.

Empty: `<p>No test payment yet. Run one to see the PaymentIntent here.</p>`.

With result: `<h3 className={STYLES.panelTitle}>` = `Payment succeeded` | `Payment declined` (errorCode set) | `` Payment ${result.status ?? 'incomplete'} `` (e.g. `Payment processing`, `Payment requires_action`). Then `<dl className={LAYOUT_STYLES.resultGrid}>` with `dt.resultKey` / `dd.resultValue` pairs:

| dt | dd |
|---|---|
| `PaymentIntent` | `paymentIntentId ?? '—'` |
| `Status` | `status ?? '—'` |
| `Amount` | `formatCents(amountCents, currency)` |
| `Bank` (method `ach`) or `Card` | `` `${cardBrand ?? ''} •••• ${cardLast4 ?? ''}`.trim() `` if either set, else `—` |
| `Error / decline` (only if errorCode) | `errorCode` + `` ` / ${declineCode}` `` if set |
| `Stripe message` (only if errorMessage) | `errorMessage` |
| `Client / ICID` | `{clientNumber ?? '—'} / {icid ?? '—'}` |
| `IVID` | `ivid ?? '—'` |
| `Mode` | `LIVE` if livemode else `sandbox` |

Then, if `dashboardUrl`: `<a className={STYLES.link} … target="_blank" rel="noopener noreferrer">Open in Stripe Dashboard</a>`.

##### 5.7.1.8 ACH tab (`StripeDevTestsAchForm`)

STYLES (verbatim):

```ts
const STYLES = {
  panelTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] text-[var(--kr-theme-text,#243142)]',
  fieldInvalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  monoField: 'font-mono tracking-wide tabular-nums',
  fieldHint: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  fieldError: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  secondaryButton: 'px-2 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-3 py-0.5 rounded border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  note: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  labelWithTip: 'inline-flex items-center gap-0.5',
  tipIcon: 'h-3 w-3 shrink-0 cursor-help',
  bankName: 'truncate text-[8pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  bankMuted: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  // b1..b4 commented out
} as const
```

LAYOUT_STYLES (verbatim; comment "Same compact inline-label rows as the card tab (fixed 92px label column).")

```ts
const LAYOUT_STYLES = {
  formGrid: 'p-3 gap-1.5 grid',
  scenarioRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] items-center',
  bankRow: 'gap-x-2 grid grid-cols-[92px_96px_minmax(0,1fr)_auto_minmax(0,1.3fr)_auto_92px] items-center',
  bankResult: 'min-w-0 grid',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  referenceRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  chargeRow: 'gap-x-2 grid grid-cols-[92px_110px_auto_minmax(0,1fr)] items-center',
  actionsRow: 'pt-1 gap-2 flex items-start justify-between',
  errorList: 'gap-0.5 grid',
  actionGroup: 'gap-2 flex shrink-0 items-center',
} as const
```

Form: `<form className={LAYOUT_STYLES.formGrid} aria-label="Stripe sandbox ACH test" data-kr-element="stripe-dev-tests-ach-form" noValidate>`; title `<h3 className={STYLES.panelTitle}>Test ACH Processing</h3>`.

| Row (`data-kr-element`) | Label | id | Control | Extras | Default |
|---|---|---|---|---|---|
| `stripe-dev-tests-ach-scenario-row` | `Scenario` | `stripe-dev-tests-ach-scenario` | select of ACH scenario labels | | `ach-success` |
| ↳ | | | `span.fieldHint` `title={scenario.note}` text `{scenario.note}` | | |
| `stripe-dev-tests-ach-bank-row` (bankRow) | `ABA` | `stripe-dev-tests-ach-routing` | text `readOnly` | `field monoField`, `title="Stripe's sandbox test routing number (the sandbox rejects real routing numbers)"`, no autoComplete attr | `110000000` |
| ↳ bank result cell | | | `div.bankResult` `aria-live="polite"` `data-kr-element="stripe-dev-tests-ach-bank-result"` | see below | |
| | `Account No` + info icon | `stripe-dev-tests-ach-account` | select | label class `` `${inlineLabel} ${labelWithTip}` ``; select `field monoField [+invalid]`; onChange strips non-digits | `000123456789` |
| | `Type` | `stripe-dev-tests-ach-holder-type` | select: `individual`→`Individual`, `company`→`Business` | | `individual` |
| `stripe-dev-tests-ach-contact-row` | `Account Name` | `stripe-dev-tests-ach-holder` | text | `placeholder="Name on Account"` | `KR Sandbox Tester` |
| | `Email` | `stripe-dev-tests-ach-email` | `type="email"` | | `sandbox-test@example.com` |
| `stripe-dev-tests-ach-reference-row` | `Test Client No` / `ICID` / `IVID` | `stripe-dev-tests-ach-client-number` / `-icid` / `-ivid` | text | same as card tab | `999` / `TSTC001` / `TSTI001` |
| `stripe-dev-tests-ach-charge-row` | `Amount (USD)` / `Description` | `stripe-dev-tests-ach-amount` / `-description` | text | amount `tabular-nums`, `inputMode="decimal"` | `25.00` / `KR Homebase Stripe sandbox ACH test` |

Account No option text: `achAccountOptionLabel(accountNumber, label)` → label with leading `ACH · ` removed and first letter capitalised, e.g. `000123456789 - Payment succeeds`, `000222222227 - Insufficient funds`. The info icon is `<KRHomebaseIcons.InfoDark className={STYLES.tipIcon} title={ACH_ACCOUNT_TIP} />` (from `@hb-components/KRHomebaseIcon.client`). Tooltip text (exact):

> Stripe's sandbox has no real banks. With routing 110000000, Stripe publishes these test account numbers; each one tells Stripe which outcome to simulate (success, insufficient funds, closed account, no account, debit not authorized, dispute, or stuck in processing). The test charge uses Stripe's matching test bank account (pm_usBankAccount_…), so only these numbers can be run.

Scenario select sets `scenarioId` and `accountNumber`, clears submit error (does not clear the shared result). Changing Account No moves `scenarioId` to the matching scenario.

Bank result cell contents (multiple may show at once):

- busy: `<span className={STYLES.bankMuted}>Looking up bank…</span>`
- found: `<span className={STYLES.bankName} title="Bank name Stripe returns for its test routing number.">{bankName}</span>` (fallback text `Bank not found`)
- error: `<KrRequestErrorNote dataKrElement="stripe-dev-tests-ach-bank-error" error=… />`
- when `!publishableKey`: `<span className={STYLES.bankMuted}>Save the Sandbox publishable key to look up the bank.</span>`

Bank lookup (`useEffect` on `[form.accountNumber, form.accountHolderType, publishableKey]`): no key → idle. Otherwise set busy, wait 400 ms (debounce), `getStripeJs(publishableKey)` then `stripe.createPaymentMethod({ type: 'us_bank_account', us_bank_account: { routing_number: '110000000', account_number, account_holder_type }, billing_details: { name: holderName.trim() || 'Account holder' } })`. Stripe.js error → `describeKrRequestError(result.error, 'KR_STRIPE_DEV_TESTS', 'ach-bank-lookup')` (shows Stripe's own message). Thrown (script load failure etc.) → same, message overridden to `Stripe could not be reached.` This creates an unattached sandbox PaymentMethod in Stripe on every change; nothing is charged.

Validation (live; exact):

- `Account: only Stripe test account numbers are accepted.`
- `Account holder name is required.`
- `Client No: digits only.`
- `ICID: 7 letters/digits.` (shorter than the card tab)
- `IVID: 7 letters/digits.`
- `Amount: between $0.50 and $1,000.00.` (hard-coded string here)

Actions row (`data-kr-element="stripe-dev-tests-ach-actions-row"`): error list (`role="alert"` when messages or submit error): messages, `<KrRequestErrorNote dataKrElement="stripe-dev-tests-ach-submit-error" … />`, and when there are no messages and no submit error: `<span className={STYLES.note}>The mandate is recorded as accepted online by you (IP and browser). ACH starts as processing.</span>`. Note: no "not configured" warning on this tab. Buttons:

- `secondaryButton` `data-kr-action="stripe-dev-tests-ach-reset"` → `Reset` (restores ACH defaults, clears submit error, not the result).
- `primaryButton` `data-kr-action="stripe-dev-tests-run-ach-payment"` `disabled={Boolean(messages.length) || submitting || !enabled}` → `Run Test ACH Payment` / `Processing…`.

Submit: `onResult(null)` first, then posts `{ action: 'create-test-ach-payment', scenarioId, amountCents, description (untrimmed), accountHolderName (trimmed), email (trimmed), clientNumber, icid, ivid (trimmed) }`; failure → `stripeDevTestsFailure(envelope, 'create-test-ach-payment')`; success → `onResult(result)`. Routing and account numbers are never sent.

##### 5.7.1.9 Scenario allowlists (`stripeDevTests.types.ts`)

Card (`STRIPE_DEV_TEST_SCENARIOS`; first is default):

| id | label | brand | cardNumber | cvc | paymentMethodId | note |
|---|---|---|---|---|---|---|
| `visa-success` | `Visa · payment succeeds` | `Visa` | 4242424242424242 | 3 | `pm_card_visa` | `Standard Visa test card. The PaymentIntent should finish as succeeded.` |
| `visa-debit-success` | `Visa debit · payment succeeds` | `Visa (debit)` | 4000056655665556 | 3 | `pm_card_visa_debit` | `Visa debit test card. The PaymentIntent should finish as succeeded.` |
| `mastercard-success` | `Mastercard · payment succeeds` | `Mastercard` | 5555555555554444 | 3 | `pm_card_mastercard` | `Mastercard test card. The PaymentIntent should finish as succeeded.` |
| `amex-success` | `American Express · payment succeeds` | `American Express` | 378282246310005 | 4 | `pm_card_amex` | `American Express test card (four-digit CVC). The PaymentIntent should finish as succeeded.` |
| `generic-decline` | `Declined · generic decline` | `Visa` | 4000000000000002 | 3 | `pm_card_visa_chargeDeclined` | `Stripe returns card_declined / generic_decline.` |
| `insufficient-funds` | `Declined · insufficient funds` | `Visa` | 4000000000009995 | 3 | `pm_card_visa_chargeDeclinedInsufficientFunds` | `Stripe returns card_declined / insufficient_funds.` |
| `authentication-required` | `3D Secure · authentication required` | `Visa` | 4000002760003184 | 3 | `pm_card_authenticationRequired` | `Always requires 3D Secure. Without Stripe.js the PaymentIntent stops at requires_action.` |

Each also has `expectedOutcome` (`succeeded` / `declined` / `requires_action`), unused by the UI.

ACH (`STRIPE_DEV_TEST_ACH_SCENARIOS`; routing always `110000000`):

| id | label | account | paymentMethodId | note |
|---|---|---|---|---|
| `ach-success` | `ACH · payment succeeds` | 000123456789 | `pm_usBankAccount_success` | `Starts as processing, then succeeds (sandbox settles quickly; use Look up to see it change).` |
| `ach-insufficient-funds` | `ACH · insufficient funds` | 000222222227 | `pm_usBankAccount_insufficientFunds` | `Fails with insufficient funds (the status moves to requires_payment_method).` |
| `ach-account-closed` | `ACH · account closed` | 000111111113 | `pm_usBankAccount_accountClosed` | `Fails because the account is closed.` |
| `ach-no-account` | `ACH · no account found` | 000111111116 | `pm_usBankAccount_noAccount` | `Fails because no account is found.` |
| `ach-debit-not-authorized` | `ACH · debit not authorized` | 000333333335 | `pm_usBankAccount_debitNotAuthorized` | `Fails because debits are not authorized.` |
| `ach-dispute` | `ACH · succeeds, then disputed` | 000555555559 | `pm_usBankAccount_dispute` | `Succeeds, then a dispute is opened (watch for it in the Dashboard).` |
| `ach-processing` | `ACH · stays processing` | 000000000009 | `pm_usBankAccount_processing` | `Stays processing indefinitely; useful for testing status checks and cancellation.` |

Other constants: `STRIPE_DEV_TEST_MIN_AMOUNT_CENTS = 50`, `STRIPE_DEV_TEST_MAX_AMOUNT_CENTS = 100_000`, `STRIPE_DEV_TEST_PUBLIC_ID_PATTERN = /^[A-Z0-9]{7}$/`, `STRIPE_DEV_TEST_CLIENT_NUMBER_PATTERN = /^\d{1,6}$/`, `STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]{8,64}$/`, `STRIPE_DEV_TEST_SEARCH_FIELDS = { ivid: { label: 'Invoice (IVID)', metadataKey: 'kr_ivid' }, icid: { label: 'Client (ICID)', metadataKey: 'kr_icid' }, clientNumber: { label: 'Client No', metadataKey: 'kr_client_number' } }`. This file is shared by browser and server.

##### 5.7.1.10 Query panel (`StripeDevTestsQueryPanel`)

STYLES (verbatim; note `b1` is ACTIVE, not commented):

```ts
const STYLES = {
  box: 'rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  boxTitle: 'text-[9pt] font-bold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] text-[var(--kr-theme-text,#243142)]',
  monoField: 'font-mono',
  button: 'px-2 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  message: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  detailKey: 'text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  detailValue: 'font-mono text-[8pt] text-[var(--kr-theme-text,#243142)] break-all',
  listRow: 'border-b border-[var(--kr-theme-line,#d7dee5)] text-[8pt] last:border-b-0',
  listLink: 'truncate text-left font-mono text-[8pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
  listAmount: 'text-right tabular-nums text-[var(--kr-theme-text,#243142)]',
  listDate: 'text-right text-[var(--kr-theme-text-muted,#526172)]',
  chipSucceeded: 'px-1 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-success,#2e7d5b)]',
  chipFailed: 'px-1 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-danger,#9d2c20)]',
  chipPending: 'px-1 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-warning,#b47a2a)]',
  dashboardLink: 'text-[8pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
  b1: ' border-red-800 border-4 border-dashed',
} as const
const b1 = STYLES.b1 // declared, never used in JSX
```

LAYOUT_STYLES (verbatim):

```ts
const LAYOUT_STYLES = {
  panel: 'gap-2 grid grid-cols-2 content-start',
  box: 'p-2 gap-1.5 grid content-start',
  inputSearchRow: 'gap-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center',
  searchColumn: 'gap-1.5 grid content-start min-w-0',
  clientInputRow: 'gap-1 grid grid-cols-[92px_minmax(0,1fr)_auto_auto] items-center',
  detailGrid: 'gap-x-2 gap-y-0.5 grid grid-cols-[82px_minmax(0,1fr)]',
  list: 'max-h-[180px] overflow-y-auto',
  listRow: 'py-0.5 gap-1 grid grid-cols-[minmax(0,1fr)_auto_64px_52px] items-center',
} as const
```

Structure: `<aside className={LAYOUT_STYLES.panel} aria-label="Stripe sandbox queries" data-kr-id="StripeDevTestsQueryPanel" data-kr-element="stripe-dev-tests-query-panel">` with two columns: Box 1 (left) and a `div.searchColumn` (`data-kr-element="stripe-dev-tests-search-column"`) holding Box 2 above Box 3. Each box is a `<form className={`${LAYOUT_STYLES.box} ${STYLES.box}`}>` with an `<h4 className={STYLES.boxTitle}>`.

Box 1, `data-kr-element="stripe-dev-tests-lookup"`, title `PaymentIntent lookup`:

- Row `inputSearchRow`: input `aria-label="PaymentIntent id"` `placeholder="pi_…"` class `field monoField`, no default; `Clear` button (`data-kr-action="stripe-dev-tests-clear-lookup"`, `type="button"`, disabled when busy or nothing to clear); submit `Look up` / `…` (`data-kr-action="stripe-dev-tests-lookup"`, disabled `!enabled || lookupBusy`).
- `<KrRequestErrorNote dataKrElement="stripe-dev-tests-lookup-error" />`.
- Local check: id must match the PI pattern, else local error `Enter a PaymentIntent id (pi_…).`
- Posts `{ action: 'get-payment', paymentIntentId }`. On success `<dl className={detailGrid} data-kr-element="stripe-dev-tests-lookup-detail">`: `Status` (chip), `Amount` (`{amount} · received {amountReceived}`), `Card` (`` `${brand} •••• ${last4 ?? ''}` `` or `—`), `Error` (only when lastErrorCode; `code / decline`), `Created` (`toLocaleString('en-US',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'})`, e.g. `9/25, 1:42 PM`), `Client / ICID`, `IVID`, `Scenario`. Then `Open in Stripe Dashboard` (`STYLES.dashboardLink`).
- Auto-runs whenever `latestPaymentIntentId` or `enabled` changes (each new test result loads itself here).

Box 2, `data-kr-element="stripe-dev-tests-search-invoice"`, title `Payments by invoice (IVID)`: input `aria-label="Invoice IVID"` `placeholder="IVID"` `maxLength={7}` uppercased; `Clear` (`stripe-dev-tests-clear-search-invoice`), submit `Search` / `…` (`stripe-dev-tests-search-invoice`). Error note `stripe-dev-tests-invoice-error`. Value follows the card form's IVID (`useEffect`).

Box 3, `data-kr-element="stripe-dev-tests-search-client"`, title `Payments by client`: row `clientInputRow`: select `aria-label="Client reference type"` options `clientNumber` → `Client No`, `icid` → `ICID`; input `aria-label="Client reference"`, no placeholder, `maxLength` 7 (ICID) or 6, uppercased for ICID; `Clear` (`stripe-dev-tests-clear-search-client`, keeps the select), submit `Search` / `…` (`stripe-dev-tests-search-client`). Error note `stripe-dev-tests-client-error`. Value follows the card form's Client No or ICID depending on the select.

Search (Boxes 2–3): value trimmed (uppercased unless clientNumber); invalid → local error `Client No is digits only.` or `Use the 7-character code, e.g. K7M2Q9A.`; posts `{ action: 'search-payments', field, value }`; failure action label `search-<field>`. Summary line `p.message`: none → `No matches yet. New payments can take up to a minute to appear in search.`; else `` `${n}${hasMore ? '+' : ''} payment${n === 1 ? '' : 's'} · newest first` ``. Results list `div.list` `data-kr-element="stripe-dev-tests-payment-list"`, each row `` `${LAYOUT_STYLES.listRow} ${STYLES.listRow}` ``: id button (`listLink`, `title="Look up <id>"`, click → runs Box 1 lookup), status chip, amount (`listAmount`), date (`listDate`, the part before the first comma, e.g. `9/25`).

Status chip: `succeeded` → green; `requires_payment_method` or `canceled` → red; anything else → amber. Chip label: `requires_payment_method` → `failed`; `requires_action` → `action`; else underscores → spaces (CSS uppercases it).

##### 5.7.1.11 API helper, error display and friendly map

`stripeDevTestsApi.client.ts`: `STRIPE_DEV_TESTS_API_PATH = '/krhomebase/api/stripe-dev-tests'`; `fetch(…, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body })`. Envelope normalised to `{ ok: payload.ok === true && response.ok, data, error: payload.error ?? (response.ok ? null : 'HTTP_<status>'), status, requestId }`; unparseable JSON → `HTTP_<status>`; fetch throw → `NETWORK_UNREACHABLE`, status 0.

Friendly map (`friendlyStripeDevTestsError`, exact):

| Code | Text |
|---|---|
| `STRIPE_SANDBOX_NOT_CONFIGURED` | `The Sandbox configuration has no keys yet. Fill in the Sandbox card above and Save.` |
| `STRIPE_SANDBOX_DISABLED` | `The Sandbox configuration is disabled. Enable it above.` |
| starts with `PAYMENT_PROVIDER_KEK` | `The payment encryption key is not configured on the server.` |
| `PAYMENT_PROVIDER_SECRET_UNREADABLE` | `The stored sandbox secret cannot be decrypted. Paste the key again and Save.` |
| `PAYMENT_PROVIDER_TABLE_MISSING` | `The payment_provider table is not available (migration or CRUD Worker deploy pending).` |
| `NETWORK_UNREACHABLE` | `Could not reach KR Homebase.` |
| starts with `STRIPE_REQUEST_FAILED` | `` `Stripe refused the request (${code.replace('STRIPE_REQUEST_FAILED: ', '')}).` `` |

`describeKrRequestError(error, area, action, friendly)`: code from `error.code` (else `Error.message`, string, or `REQUEST_FAILED`); message = friendly text, else a non-Error object's `message` (Stripe.js), else the code with leading `VALIDATION_` removed, `_`→space, lowercased (e.g. `STRIPE_DEV_TESTS_INVALID_AMOUNT` → `stripe dev tests invalid amount`). `detail` = `code · HTTP <status> · request <id>`. Logs `L('[KR_STRIPE_DEV_TESTS:<action>] failed <detail>')`. `krLocalValidationError(message)` → `code: 'CLIENT_VALIDATION'`, no log, empty detail.

`KrRequestErrorNote` renders `<span className="text-[9pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]" data-kr-element={dataKrElement ?? 'request-error-note'} role="alert">{message}</span>`, plus in non-production builds (`process.env.NODE_ENV !== 'production'`) a nested `<span className="block font-mono text-[8pt] font-normal text-[var(--kr-theme-text-muted,#526172)]">{detail}</span>`.

##### 5.7.1.12 Stripe.js loading (`src/hb-lib/stripe/stripeJs.client.ts`)

- Script URL `https://js.stripe.com/v3/` (Stripe.js v3; no npm package). Injected once into `document.head` (`async`), reusing an existing `script[src=…]` tag; resolves when `window.Stripe` exists. Errors: `STRIPE_JS_SERVER_RENDER`, `STRIPE_JS_NOT_AVAILABLE`, `STRIPE_JS_LOAD_FAILED` (load failure resets the promise so it can retry).
- `getStripeJs(publishableKey)` caches one instance per key (`window.Stripe(publishableKey)`, no options).
- Only the ACH tab's bank lookup uses Stripe.js here. The card tab never loads Stripe.js (server-confirmed PaymentMethods; 3DS stops at `requires_action`).

---

#### 5.7.2 Server route `/krhomebase/api/payment-providers`

File `src/app/krhomebase/api/payment-providers/route.ts`. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Store: `src/app/krhomebase/api/_server/krPaymentProviderStore.ts` (the only reader/writer of `payment_provider`, via the CRUD Worker client `krCrudClient`: `crudSearch`, `crudCreate`, `crudUpdate`, `crudDelete`).

##### 5.7.2.1 Auth

- `PAYMENT_PROVIDER_ROLES = ['super_admin']` (route.ts:41). GET calls `requireKrApiV1Session('payment-providers/GET', …)` (route.ts:61); POST `requireKrApiV1Session('payment-providers/POST', …)` (route.ts:77).
- That wraps `requireKRHomebaseApiSession` (`_server/krHomebaseApiAuth.ts:27-50`): no session → `401` with `state.reason ?? 'AUTH_REQUIRED'` (or `503 SESSION_VALIDATION_UNAVAILABLE` when the session service is down); wrong role → `403 ROLE_NOT_AUTHORIZED`.
- Every CRUD call carries `audit: buildKrApiV1Audit(session)` (request source `kr-homebase-ui`) and a derived `requestId` (`<requestId>:payment-providers`, `:payment-provider-update`, `-create`, `-delete`, `-disable-<ppid>`, `-verified`, `-verify-failed`).

##### 5.7.2.2 Envelope

Success `{ ok: true, data, requestId }` (200). Error `{ ok: false, error: <code>, requestId }` with status from `statusFor` (route.ts:44-51):

- `VALIDATION_*` → 422
- `PAYMENT_PROVIDER_CHANGED_ELSEWHERE` → 409
- `PAYMENT_PROVIDER_NOT_FOUND` → 404
- `PAYMENT_PROVIDER_MODE_MISMATCH`, `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY*` → 422
- `PAYMENT_PROVIDER_KEK*`, `PAYMENT_PROVIDER_TABLE_MISSING`, any code containing `NOT_CONFIGURED` or `DISABLED` → 503
- everything else → 502
- Bad JSON → `400 REQUEST_PARSE_ERROR` (`parseJsonBody`).

##### 5.7.2.3 GET

`listPaymentProviders(ctx)` → `data: { providers: PaymentProviderConfig[], encryption: { configured, kekId, problem } }`. Rows read with `crudSearch({ table: 'payment_provider', where: { provider: 'stripe' }, orderBy: [{ column: 'ppid', direction: 'asc' }], limit: 100 })`, then sorted by `environment` (alphabetical: `live` before `sandbox`) then `ppid`. A read error matching `/UNKNOWN_TABLE|no such table/i` becomes `PAYMENT_PROVIDER_TABLE_MISSING`. Only existing rows are returned (no placeholder for an empty environment). Log `[KR_PAYMENT_PROVIDERS:62] GET ok kek=<bool> requestId=…`.

`PaymentProviderConfig` fields: `environment, id, ppid, configured, isEnabled, displayName, accountId, accountEmail, publishableKey, secretKeyName, secretKeyPrefix, secretKeyHash, secretKeySetAt, webhookSecretName, webhookSecretHash, webhookSecretSetAt, apiVersion, defaultCurrency, lastVerifiedAt, lastVerifiedStatus, notes, updatedAt, problems`. Secret ciphertext is never returned. Defaults when null: `displayName` `Stripe live` / `Stripe sandbox`; strings `''`; `defaultCurrency` `'usd'`.

##### 5.7.2.4 POST common

Body must have `environment` `'live' | 'sandbox'` (checked first, for every action) else `422 VALIDATION_PAYMENT_PROVIDER_ENVIRONMENT`. Unknown action → `422 VALIDATION_PAYMENT_PROVIDER_ACTION`. Any thrown error → its `message` as the code. Bodies are never logged.

##### 5.7.2.5 POST `save`

Body `{ action: 'save', environment, providerId?, fields, secretKey?, webhookSecret?, expectedUpdatedAt? }`. Non-object `fields` → `{}`. `expectedUpdatedAt` absent → no concurrency check; non-string → `null`.

Validation, in order (`savePaymentProvider`, store:210-225). Text is trimmed and capped:

| Field | Cap | Rule | Error code |
|---|---|---|---|
| publishableKey | 255 | sandbox `/^pk_test_[A-Za-z0-9]{10,}$/`, live `/^pk_live_[A-Za-z0-9]{10,}$/` (when non-blank) | `VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_SANDBOX` / `_LIVE` |
| accountId | 64 | `/^acct_[A-Za-z0-9]{6,}$/` | `VALIDATION_PAYMENT_PROVIDER_ACCOUNT_ID` |
| accountEmail | 200 | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | `VALIDATION_PAYMENT_PROVIDER_ACCOUNT_EMAIL` |
| apiVersion | 40 | `/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/` | `VALIDATION_PAYMENT_PROVIDER_API_VERSION` |
| defaultCurrency | 3 | lowercased, blank → `usd`, `/^[a-z]{3}$/` | `VALIDATION_PAYMENT_PROVIDER_CURRENCY` |
| secretKey | none | sandbox `/^(sk\|rk)_test_[A-Za-z0-9]{10,}$/`, live `/^(sk\|rk)_live_[A-Za-z0-9]{10,}$/` | `VALIDATION_PAYMENT_PROVIDER_SECRET_KEY_SANDBOX` / `_LIVE` |
| webhookSecret | none | `/^whsec_[A-Za-z0-9]{10,}$/` (both environments) | `VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET` |
| displayName | 80 | none | |
| secretKeyName, webhookSecretName | 80 | none | |
| notes | 500 | none | |

Then:

1. Read all rows. `providerId` given but no row with that id **and** environment → `PAYMENT_PROVIDER_NOT_FOUND`.
2. Concurrency: if updating and `expectedUpdatedAt !== undefined` and `(expectedUpdatedAt ?? null) !== (row.updated_at ?? null)` → `PAYMENT_PROVIDER_CHANGED_ELSEWHERE` (409).
3. Build `data`: `display_name, is_enabled (1/0), account_id, account_email, publishable_key, secret_key_name, webhook_secret_name, api_version, notes` (blank → `null`), `default_currency`, `updated_by_user_id`, `updated_at = new Date().toISOString()`.
4. New secret key: `checkKeyWithStripe` (see 5.7.2.8), then `secret_key_ciphertext` (encrypted), `secret_key_hash` (SHA-256 hex), `secret_key_prefix` (`/^(sk|rk)_(test|live)_/` match, e.g. `sk_test_`), `secret_key_set_at`, `secret_key_set_by_user_id`, `last_verified_at = now`, `last_verified_status = 'ok'`.
5. New webhook secret: `webhook_secret_ciphertext`, `webhook_secret_hash`, `webhook_secret_set_at`, `webhook_secret_set_by_user_id`. Not checked with Stripe.
6. **One enabled per environment:** if `fields.isEnabled`, every other row of the same environment with `is_enabled` truthy is updated to `{ is_enabled: 0, updated_by_user_id, updated_at: now }` (in parallel, before the main write; not transactional).
7. Update the existing row, or create: `id = 'ppv_' + crypto.randomUUID()`, **`ppid = max(ppid of all stripe rows) + 1`** (1 when empty), `provider: 'stripe'`, `environment`, `created_by_user_id`, `created_at = now`, plus `data`.
8. Clear the credentials cache; re-list and return `data: { provider }` (the row matching environment + saved ppid), else `PAYMENT_PROVIDER_SAVE_READBACK_FAILED` (502).

Omitting `secretKey` / `webhookSecret` keeps the stored ones (secrets are write-only; there is no "clear secret" action).

##### 5.7.2.6 `configured` and `problems` (`toConfig`, store:118-152)

- `storedKekId` = second `:` segment of `secret_key_ciphertext`.
- `problems` (exact strings, in this order):
  1. ciphertext present, KEK configured, `storedKekId !== kek.kekId` → `The secret key was saved with a different encryption key. Paste the secret key again and save.`
  2. no `publishable_key` → `Publishable key is missing.`
  3. no `secret_key_ciphertext` → `Secret key is not stored.`
  4. row exists and `!is_enabled` → `Configuration is disabled.`
- `readable` = ciphertext present AND KEK configured AND kekId matches.
- `configured` = row exists AND `is_enabled` AND `publishable_key` AND `readable`.
- The webhook secret does not affect `configured` or `problems`.

##### 5.7.2.7 Encryption (`_server/krPaymentProviderCrypto.ts`)

- KEK: 32 random bytes, base64, from env var **`KR_PAYMENT_PROVIDER_KEK`** (Worker secret when deployed). Dev-only companion name **`KR_PAYMENT_PROVIDER_KEK_PATH`** (a startup loader resolves it; the server itself refuses to read files). Read through `requireEnvironmentSecret` (`_server/krEnvironmentSecrets.ts`). Decoded length must be 32 or `PAYMENT_PROVIDER_KEK_INVALID`. Imported as non-extractable AES-GCM key. Cached while the text is unchanged.
- `kekId` = first 8 hex chars of SHA-256 of the **base64 KEK text**.
- Algorithm AES-256-GCM (Web Crypto), fresh 12-byte IV per write, AAD `payment_provider:<provider>:<environment>:<field>` with field `secret_key` or `webhook_secret` (e.g. `payment_provider:stripe:sandbox:secret_key`), so ciphertext cannot move between environments or columns.
- Stored form `v1:<kekId>:<iv base64>:<ciphertext base64>` (tag included in ciphertext). Columns: `secret_key_ciphertext`, `webhook_secret_ciphertext`.
- Hash: unsalted SHA-256 hex of the plaintext → `secret_key_hash` / `webhook_secret_hash` (browser can compare a candidate with `sha256HexInBrowser`).
- Prefix: `secret_key_prefix` only (no webhook prefix).
- Decrypt errors: wrong format → `PAYMENT_PROVIDER_SECRET_UNREADABLE`; kekId differs → `PAYMENT_PROVIDER_KEK_MISMATCH`; GCM auth failure → `PAYMENT_PROVIDER_SECRET_UNREADABLE`.
- Also exported: `PAY_LINK_WEBHOOK_KEY_LABEL = 'kr-pay-link-webhook:v1'` and `signPayLinkWebhook` (HMAC-SHA256 with key HMAC(KEK bytes, label)), shared with the pay Worker.

##### 5.7.2.8 Stripe calls (`_server/krStripeApi.ts`)

- Plain `fetch` to `https://api.stripe.com` + path (no Stripe SDK). Headers: `Authorization: Bearer <secret>`; `Content-Type: application/x-www-form-urlencoded` when a form is sent; **`Stripe-Version: <api_version>` only when the row (or the form, during save) has an `api_version`**, otherwise the account default; `Idempotency-Key` when given. `cache: 'no-store'`, 15 s timeout (`AbortSignal.timeout(15_000)`). Network/timeout → throws `STRIPE_NETWORK_ERROR`. Returns `{ status, ok, body, error (Stripe error object or {message:'HTTP <n>'}), stripeRequestId (response header request-id) }`.
- `checkKeyWithStripe`: `GET /v1/balance`. Non-2xx → `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY: <error.code ?? error.type ?? status>`. `livemode` must equal `environment === 'live'`, else `PAYMENT_PROVIDER_MODE_MISMATCH`. Returns `{ environment, livemode, available: [{amount,currency}], pending: [...] }`.

##### 5.7.2.9 POST `delete`

Body `{ action: 'delete', environment, providerId, confirmation: 'DELETE KEY', expectedUpdatedAt? }`. Checks: `confirmation !== 'DELETE KEY'` (exact, case-sensitive) → `422 VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION`; blank `providerId` → `422 VALIDATION_PAYMENT_PROVIDER_ID`; row with id + environment missing → `404 PAYMENT_PROVIDER_NOT_FOUND`; same concurrency rule → `409`. Hard delete through `crudDelete`, cache cleared. Response `data: { deleted: true }`.

##### 5.7.2.10 POST `test-connection`

Body `{ action: 'test-connection', environment }`. `readSecret`: rows of that environment; pick the first enabled row, else the first row (by ppid). No row / no ciphertext / no publishable key → `STRIPE_<ENV>_NOT_CONFIGURED` (503); row disabled → `STRIPE_<ENV>_DISABLED` (503); decrypt; key patterns re-checked → `STRIPE_<ENV>_KEY_MODE_MISMATCH` (502, falls to default). Then `checkKeyWithStripe` with the row's `api_version`. Success updates `last_verified_at = now, last_verified_status = 'ok'`; failure updates `last_verified_status = <code, max 120 chars>` (write failure ignored) and rethrows. Response `data: { connection }`.

##### 5.7.2.11 Credentials for other server code

`getPaymentProviderCredentials(ctx, env)` (via `krStripeSettings.getKrStripeCredentials`) returns `{ environment, secretKey, publishableKey, accountId, apiVersion, defaultCurrency (|| 'usd'), source: 'database' }`, cached per isolate per environment for 60 s (`CREDENTIALS_CACHE_MS = 60_000`); cleared by save/delete in that isolate.

##### 5.7.2.12 Error codes (complete list for this route)

`AUTH_REQUIRED`/session reason 401, `SESSION_VALIDATION_UNAVAILABLE` 503, `ROLE_NOT_AUTHORIZED` 403, `REQUEST_PARSE_ERROR` 400, `VALIDATION_PAYMENT_PROVIDER_ENVIRONMENT`, `_ACTION`, `_DELETE_CONFIRMATION`, `_ID`, `_PUBLISHABLE_KEY_SANDBOX|LIVE`, `_ACCOUNT_ID`, `_ACCOUNT_EMAIL`, `_API_VERSION`, `_CURRENCY`, `_SECRET_KEY_SANDBOX|LIVE`, `_WEBHOOK_SECRET` (all 422), `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY: <code>` 422, `PAYMENT_PROVIDER_MODE_MISMATCH` 422, `PAYMENT_PROVIDER_NOT_FOUND` 404, `PAYMENT_PROVIDER_CHANGED_ELSEWHERE` 409, `PAYMENT_PROVIDER_TABLE_MISSING` 503, `PAYMENT_PROVIDER_KEK_INVALID` / `_KEK_MISMATCH` 503, `STRIPE_LIVE|SANDBOX_NOT_CONFIGURED` / `_DISABLED` 503, `STRIPE_<ENV>_KEY_MODE_MISMATCH` 502, `PAYMENT_PROVIDER_SECRET_UNREADABLE` 502, `PAYMENT_PROVIDER_SAVE_READBACK_FAILED` 502, `STRIPE_NETWORK_ERROR` 502, `CONFIG_ENV_MISSING:…` / `CONFIG_ENV_BINDING_NOT_LOADED:…` / `CONFIG_ENV_AMBIGUOUS:…` 502 (see Oddities), CRUD Worker messages 502, fallback `PAYMENT_PROVIDER_READ_FAILED` / `PAYMENT_PROVIDER_REQUEST_FAILED`.

---

#### 5.7.3 Server route `/krhomebase/api/stripe-dev-tests`

File `src/app/krhomebase/api/stripe-dev-tests/route.ts`. POST only (no GET export). `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

##### 5.7.3.1 Order of checks

1. Auth: `KR_STRIPE_DEV_TESTS_ROLES = ['super_admin']` (route.ts:32), `requireKrApiV1Session('stripe-dev-tests/POST', …)` (route.ts:146). Same 401/403/503 as 2.1.
2. JSON parse → `400 REQUEST_PARSE_ERROR`.
3. `action` must be one of `create-test-payment`, `create-test-ach-payment`, `get-payment`, `search-payments` → else `422 STRIPE_DEV_TESTS_INVALID_ACTION`.
4. **Sandbox-only guard:** credentials are always `getKrStripeCredentials(ctx, 'sandbox')` (route.ts:158); there is no way to ask for live. Any failure → `503` with the thrown code (`STRIPE_SANDBOX_NOT_CONFIGURED`, `STRIPE_SANDBOX_DISABLED`, `STRIPE_SANDBOX_KEY_MODE_MISMATCH`, `PAYMENT_PROVIDER_KEK_*`, `PAYMENT_PROVIDER_SECRET_UNREADABLE`, `PAYMENT_PROVIDER_TABLE_MISSING`, `CONFIG_ENV_*`). Key patterns (`sk_test_`/`rk_test_`, `pk_test_`) are re-checked on every read. The response `livemode` is reported but not enforced.
5. Action branch. Validation happens after credentials are loaded, so with no sandbox config even a bad request returns 503.

All Stripe calls use `credentials.secretKey`, `Stripe-Version` from the row's `api_version` (if set), currency `credentials.defaultCurrency`.

Dashboard links (local `dashboardUrl`): `https://dashboard.stripe.com/<acct_…/>test/payments/<pi>` (account segment only when `account_id` is saved; always `test/`).

##### 5.7.3.2 `get-payment`

- Body `{ paymentIntentId }`, trimmed, `/^pi_[A-Za-z0-9]{8,64}$/` → else `422 STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT`.
- Stripe `GET /v1/payment_intents/<id>?expand[]=latest_charge`. 404 → `404 STRIPE_PAYMENT_NOT_FOUND`; other non-2xx → `502 STRIPE_REQUEST_FAILED: <code|type|status>`; network → `502 STRIPE_NETWORK_ERROR`.
- Response `data: { payment: PaymentSummary }`.

`PaymentSummary` (`toPaymentSummary`): `paymentIntentId`, `status` (`'unknown'` fallback), `amountCents`, `amountReceivedCents`, `currency` (`'usd'` fallback), `createdIso` (from unix `created`), `description`, `cardBrand` / `cardLast4` (from `latest_charge.payment_method_details.card` or `.us_bank_account.bank_name/last4`), `lastErrorCode` / `lastDeclineCode` (`last_payment_error`), `scenarioId` (metadata `kr_scenario`), `clientNumber` (`kr_client_number`), `icid` (`kr_icid`), `ivid` (`kr_ivid`), `livemode`, `dashboardUrl`.

##### 5.7.3.3 `search-payments`

- Body `{ field, value }`. `field` must be a string and `field in STRIPE_DEV_TEST_SEARCH_FIELDS` → else `422 STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD`. `value` trimmed (uppercased unless clientNumber), must match its pattern; blank or malformed → `422 STRIPE_DEV_TESTS_INVALID_REFERENCE`.
- Query `metadata['<kr_ivid|kr_icid|kr_client_number>']:'<value>'`, `limit=20` (`KR_STRIPE_SEARCH_LIMIT`), `expand[]=data.latest_charge`. Stripe `GET /v1/payment_intents/search?<params>` (Stripe Search API; results can lag about a minute; Stripe returns newest first).
- Non-2xx → `502 STRIPE_REQUEST_FAILED: …`.
- Response `data: { search: { field, value, payments: PaymentSummary[], hasMore } }`.

##### 5.7.3.4 `create-test-payment` (card; the default branch)

- `scenarioId` must be in the card allowlist → else `422 STRIPE_DEV_TESTS_UNKNOWN_SCENARIO`.
- `amountCents` must be a number; `Math.round`; 50..100000 → else `422 STRIPE_DEV_TESTS_INVALID_AMOUNT`.
- `description` trimmed, max 200, blank → `KR Homebase Stripe sandbox test`; `cardholderName` max 100; `email` max 200; `postalCode` max 20; `clientNumber`/`icid`/`ivid` cleaned (blank allowed; malformed → `422 STRIPE_DEV_TESTS_INVALID_REFERENCE`).
- Stripe `POST /v1/payment_intents`, form fields:
  - `amount`, `currency`, `payment_method=<scenario.paymentMethodId>`, `payment_method_types[]=card`, `confirm=true`, `description`
  - `receipt_email` only when email matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - `metadata[kr_source]=krhomebase-stripe-dev-tests`, `metadata[kr_scenario]`, `metadata[kr_request_id]`, `metadata[kr_requested_by_user_id]`
  - when non-blank: `metadata[kr_cardholder_name]`, `metadata[kr_postal_code]`, `metadata[kr_client_number]`, `metadata[kr_icid]`, `metadata[kr_ivid]`
  - `expand[]=latest_charge`
- **Idempotency key** `kr-stripe-dev-tests-<requestId>`.
- 2xx → `result` with `method: 'card'`, status, card brand/last4 from the charge, errors null.
- Stripe error with `type === 'card_error'` (declines, 3DS failures) → still `200 ok` with `result` built from `error.payment_intent`: `errorCode`, `declineCode`, `errorMessage` (Stripe's text), `cardBrand`/`cardLast4` null.
- Any other Stripe error → `502 STRIPE_REQUEST_FAILED: <code|type|status>` (message deliberately not returned); network → `502 STRIPE_NETWORK_ERROR`.
- `3D Secure` scenario: Stripe returns 200 with status `requires_action` → amber "Payment requires_action".

`StripeDevTestsPaymentResult`: `{ method, scenarioId, paymentIntentId, status, amountCents, currency, cardBrand, cardLast4, errorCode, declineCode, errorMessage, dashboardUrl, livemode, clientNumber, icid, ivid }` (references `null` when blank). Response `data: { result }`.

##### 5.7.3.5 `create-test-ach-payment`

- ACH allowlist scenario → else `422 STRIPE_DEV_TESTS_UNKNOWN_SCENARIO`; amount same rule → `422 STRIPE_DEV_TESTS_INVALID_AMOUNT`; `accountHolderName` trimmed, max 100, required → `422 STRIPE_DEV_TESTS_ACCOUNT_HOLDER_REQUIRED`; references → `422 STRIPE_DEV_TESTS_INVALID_REFERENCE`; email max 200.
- Mandate: IP = `cf-connecting-ip` || first `x-forwarded-for` || `127.0.0.1`; user agent = `user-agent` header (max 300) || `KR Homebase Stripe Dev Tests`.
- Stripe `POST /v1/payment_intents`, form: `amount`, `currency`, `payment_method_types[]=us_bank_account`, `payment_method=<pm_usBankAccount_…>`, `confirm=true`, `mandate_data[customer_acceptance][type]=online`, `mandate_data[customer_acceptance][online][ip_address]`, `mandate_data[customer_acceptance][online][user_agent]`, `description` (blank → `KR Homebase Stripe sandbox ACH test`), optional `receipt_email`, `metadata[kr_source]`, `metadata[kr_scenario]`, `metadata[kr_request_id]`, `metadata[kr_requested_by_user_id]`, `metadata[kr_account_holder_name]`, optional `kr_client_number`/`kr_icid`/`kr_ivid`, `expand[]=latest_charge`.
- **Idempotency key** `kr-stripe-dev-tests-ach-<requestId>`.
- The intent is taken from the 2xx body or, on any error type, from `error.payment_intent`. No intent → `502 STRIPE_REQUEST_FAILED: …`. Otherwise `200` with `result` (`method: 'ach'`, `cardBrand` = bank name, `cardLast4` = bank last4 or the last 4 of the scenario account, errors from the Stripe error or `last_payment_error`).

##### 5.7.3.6 Error codes (complete list)

`STRIPE_DEV_TESTS_INVALID_ACTION`, `_UNKNOWN_SCENARIO`, `_INVALID_AMOUNT`, `_INVALID_REFERENCE`, `_INVALID_PAYMENT_INTENT`, `_INVALID_SEARCH_FIELD`, `_ACCOUNT_HOLDER_REQUIRED` (all 422); `STRIPE_PAYMENT_NOT_FOUND` 404; credential codes 503 (3.1 step 4); `STRIPE_REQUEST_FAILED: <x>` 502; `STRIPE_NETWORK_ERROR` 502; `REQUEST_PARSE_ERROR` 400; auth 401/403/503. No KR database writes. Log area `[KR_STRIPE_DEV_TESTS:<line>]`.

---

#### 5.7.4 `payment_provider` table

Source: `D:\Repos\krhomebase\docs\Schema_8.0\_source\live_schema.json`.

| Column | Type | Null | Default / check | UI field (`PaymentProviderEditableFields` / config) |
|---|---|---|---|---|
| `id` | TEXT | PK | `ppv_<uuid>` set by app | `id` (providerId) |
| `ppid` | INTEGER | NOT NULL | `DEFAULT 1 CHECK (ppid > 0)`, `UNIQUE (ppid)` | `ppid` (shown) |
| `provider` | TEXT | NOT NULL | `CHECK (provider IN ('stripe'))` | none (always `stripe`) |
| `environment` | TEXT | NOT NULL | `CHECK (environment IN ('live','sandbox'))` | card (Live / Sandbox) |
| `display_name` | TEXT | yes | | `displayName` |
| `is_enabled` | INTEGER | NOT NULL | `DEFAULT 1 CHECK (is_enabled IN (0,1))` | `isEnabled` |
| `account_id` | TEXT | yes | `CHECK (account_id IS NULL OR account_id GLOB 'acct_*')` | `accountId` |
| `account_email` | TEXT | yes | | `accountEmail` |
| `publishable_key` | TEXT | yes | `CHECK (… GLOB 'pk_*')` | `publishableKey` |
| `secret_key_name` | TEXT | yes | | `secretKeyName` |
| `secret_key_prefix` | TEXT | yes | | `secretKeyPrefix` (read-only) |
| `secret_key_hash` | TEXT | yes | `CHECK (… length = 64)` | `secretKeyHash` (read-only) |
| `secret_key_ciphertext` | TEXT | yes | `CHECK (… GLOB 'v1:*')` | written from `secretKey` (write-only) |
| `secret_key_set_at` | TEXT | yes | | `secretKeySetAt` |
| `secret_key_set_by_user_id` | TEXT | yes | FK `user(id) ON DELETE SET NULL` | not shown |
| `webhook_secret_name` | TEXT | yes | | `webhookSecretName` |
| `webhook_secret_hash` | TEXT | yes | `CHECK (… length = 64)` | `webhookSecretHash` |
| `webhook_secret_ciphertext` | TEXT | yes | `CHECK (… GLOB 'v1:*')` | written from `webhookSecret` |
| `webhook_secret_set_at` | TEXT | yes | | `webhookSecretSetAt` |
| `webhook_secret_set_by_user_id` | TEXT | yes | FK `user(id) ON DELETE SET NULL` | not shown |
| `api_version` | TEXT | yes | | `apiVersion` |
| `default_currency` | TEXT | NOT NULL | `DEFAULT 'usd'` | `defaultCurrency` |
| `last_verified_at` | TEXT | yes | | `lastVerifiedAt` |
| `last_verified_status` | TEXT | yes | | `lastVerifiedStatus` |
| `notes` | TEXT | yes | | `notes` |
| `created_by_user_id` | TEXT | yes | FK `user(id) ON DELETE SET NULL` | not shown |
| `updated_by_user_id` | TEXT | yes | FK `user(id) ON DELETE SET NULL` | not shown |
| `created_at` | TEXT | NOT NULL | `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` | not shown |
| `updated_at` | TEXT | NOT NULL | same default | `updatedAt` (concurrency token) |

Keys and indexes: `PRIMARY KEY (id)`; `UNIQUE (ppid)` (table-wide, not per environment); index `idx_payment_provider_provider_environment ON payment_provider(provider, environment)`. No unique constraint enforces one enabled row per environment; only the app does.

---

#### 5.7.5 How the pay Worker uses `payment_provider`

File `apps/shared/d1-workers/kr-pay-worker/kr-pay-worker.ts` (D1 binding `KR_PAY_D1`; secret binding name `KR_PAYMENT_PROVIDER_KEK`; also `KR_PAY_ENVIRONMENT`, optional `KR_HOMEBASE_PAY_WEBHOOK_URL`).

- Routes: `GET /p/<token>`, `POST /p/<token>/intent`, `POST /p/<token>/confirm`, `GET /assets/pay.js`, `POST /stripe/webhook/sandbox`, `POST /stripe/webhook/live`, `GET /health` (`{ ok, environment: 'dual', stripe: { sandbox, live } }` where each is `ready` or the error code; never a key).
- Environment comes from the `payment_request.environment` row (pay pages) or from the webhook path. `KR_PAY_ENVIRONMENT` is only a fallback label.
- `loadStripeConfig` (line 486): `SELECT is_enabled, publishable_key, secret_key_ciphertext, webhook_secret_ciphertext, api_version, updated_at FROM payment_provider WHERE provider = 'stripe' AND environment = ?1 AND is_enabled = 1 ORDER BY ppid ASC LIMIT 1`. Missing row/keys → `STRIPE_<ENV>_NOT_CONFIGURED`. Decrypts both secrets with the same KEK, format and AAD (`payment_provider:stripe:<env>:secret_key|webhook_secret`); KEK text has a BOM stripped and is trimmed. Re-checks key prefixes → `STRIPE_<ENV>_KEY_MODE_MISMATCH`. Caches one config keyed by environment + a stamp of `updated_at|ciphertexts|publishable_key|api_version` (key changes apply on the next request, no deploy). Sends `Stripe-Version` when `api_version` is set.
- Webhooks: per environment, the decrypted `webhook_secret` of that environment's enabled row; none → `503 { error: 'webhook secret not configured' }`. `Stripe-Signature` `t=…,v1=…`, HMAC-SHA256 over `` `${t}.${rawBody}` ``, constant-time hex compare, 300-second tolerance. Event `livemode` must match the route environment, and the `payment_request` environment must match, or the event is ignored. Events logged to `external_webhook_event`.
- After a paid link it POSTs to KR Homebase signed with `X-KR-Pay-Signature: t=…,v1=…` using HMAC(KEK, `kr-pay-link-webhook:v1`), so both sides must hold the same KEK.
- Difference from Homebase: Homebase `readSecret` falls back to a disabled row and reports `_DISABLED`; the Worker only ever selects enabled rows, so it reports `_NOT_CONFIGURED` instead.

---

#### 5.7.6 Oddities, bugs, dead code

1. **KEK error codes do not match the docs or the friendly map.** `loadKek` → `requireEnvironmentSecret` throws `CONFIG_ENV_MISSING:KR_PAYMENT_PROVIDER_KEK:<long sentence>`, `CONFIG_ENV_BINDING_NOT_LOADED:…` or `CONFIG_ENV_AMBIGUOUS:…`, not the documented `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` / `_FILE_UNREADABLE` (crypto JSDoc line 86; store JSDoc). Results: payment-providers `statusFor` returns 502 (not 503); the browser friendly text `The payment encryption key is not configured on the server.` never matches; the full sentence (env var names, `pnpm run dev:homebase`) goes to the browser as the error code and as `encryption.problem`. No secret value leaks.
2. `last_verified_status = verified.livemode === (environment === 'live') ? 'ok' : 'mode_mismatch'` (store:256): the `mode_mismatch` branch is dead because `checkKeyWithStripe` already throws on mismatch.
3. Save is not transactional: other rows are disabled before the save. If the Stripe check passes but the update/create fails (or the read-back fails), the environment can be left with no enabled row.
4. `ppid = max+1` computed in the app with no retry. Two simultaneous creates collide on `UNIQUE (ppid)` → 502 with the CRUD message.
5. `toConfig` fallbacks for a missing row (`isEnabled: true`, default display names) are only partly reachable; `listPaymentProviders` never builds a config without a row.
6. `test-connection` picks the enabled row, else the first row, then throws `_DISABLED`; the pay Worker reports `_NOT_CONFIGURED` for the same state.
7. `STRIPE_<ENV>_KEY_MODE_MISMATCH` falls through `statusFor` to 502 (it contains neither `NOT_CONFIGURED` nor `DISABLED`); `PAYMENT_PROVIDER_SECRET_UNREADABLE` is also 502. In stripe-dev-tests every credential failure is 503.
8. Credentials cache is per isolate (60 s); a save in one isolate does not clear another isolate's cache, so the dev-tests route can use old keys for up to a minute.
9. Webhook secret is validated only by pattern, never checked with Stripe; `configured` ignores it.
10. Log line numbers in `payment-providers/route.ts` are wrong (`:111` at line 108, `:95` at 113, `:101` at 119). Store logs `:118`, `:196`, `:283`, `:321` do not match their lines either.
11. `search-payments` checks `field in STRIPE_DEV_TEST_SEARCH_FIELDS`: `in` also accepts prototype keys (`toString`, `constructor`…). With a valid 7-char value the query becomes `metadata['undefined']:'…'`: harmless, but the check is wrong (use `Object.hasOwn`).
12. Stripe-dev-tests loads credentials before validating the body, so a malformed request returns 503 when the sandbox is not configured.
13. Idempotency keys use the per-request `requestId`, so they only guard retries of the same HTTP request (none are made); a second click creates a second PaymentIntent.
14. The dev-tests route does not reject a `livemode: true` response; it relies on the `sk_test_`/`rk_test_` pattern check. The result panel can show `LIVE`.
15. Hard-coded values: Stripe API base `https://api.stripe.com`; Dashboard `https://dashboard.stripe.com/…/test/payments/…` (a local copy of `krStripeDashboardPaymentUrl`, which is not used here); docs link `https://docs.stripe.com/testing`; Stripe.js `https://js.stripe.com/v3/`; mandate IP fallback `127.0.0.1`; UA fallback `KR Homebase Stripe Dev Tests`; defaults ZIP `75069`, email `sandbox-test@example.com`, client `999`, `TSTC001`, `TSTI001`.
16. Query panel: `STYLES.b1` debug border is active and `const b1` is declared but unused (lint warning). Workspace `STYLES.panel` is defined but unused.
17. Query panel search values are overwritten by the card form's values whenever those change, discarding what the user typed. The defaults always come from the card tab, even after an ACH run.
18. Card tab hint mixes two sources: brand from the typed card (`Unknown card` if not allowlisted) and note from the selected scenario.
19. Card tab: typing a different allowlisted card number does not clear the previous result (choosing from the select does). ACH scenario change/Reset never clears the shared result.
20. ACH tab has no "Save the Sandbox configuration above…" message (card tab does); ACH validation texts differ from the card tab (`ICID: 7 letters/digits.` vs `ICID: 7 letters/digits, e.g. K7M2Q9A.`; amount text hard-coded instead of formatted).
21. ACH bank lookup creates a new unattached sandbox PaymentMethod in Stripe on every account/type change (debounced 400 ms); the holder name is left out of the effect dependencies on purpose.
22. Card decline result: `cardBrand`/`cardLast4` are always null (not read from the error's payment intent), so the panel shows `Card —`.
23. Double `role="alert"`: the error list `div` and the nested `KrRequestErrorNote` span both carry it.
24. The `api-contract.json` for stripe-dev-tests says auth is "Review route implementation" (its generator does not detect `requireKrApiV1Session`); the `humanNotes` are correct.
25. Workspace JSDoc says "Settings → Stripe Payment Configuration → Sandbox tests (Super Admin only)": the browser components do no role check themselves; only the routes enforce `super_admin`.

## 6. GPT Model Gateway

Folder: `src/ai-components/`. Super Admin only (the route checks `super_admin`). Reached at `?section=firm-settings&firmSettingsSection=gpt-model-gateway`.

### 6.1 Component tree

```text
GptModelGatewayWorkspace          section, data-kr-id="gpt-model-gateway-workspace" (grid, gap 12px)
  GptModelsPanel
    loading:  section data-kr-id="gpt-model-connections-loading"  "Loading saved GPT model connections…"
    empty:    div data-kr-id="p29-gpt-model-connections-empty"
                GptModelConnectionsCard (variant "card": table + Add connection + dialog)
                "ERROR: {connectionError}"
    normal:   section data-kr-id="gpt-models-panel" (.shell)
                intro: eyebrow "Super Admin · GPT Gateway", title "Model connections", description,
                       GptModelConnectionsCard variant "trigger" (Add connection button + dialog),
                       transport badge "Transport / Signed + encrypted / Server ↔ gpt-models-worker"
                ledger: KRCompactLedger "Models in use" (data-kr-id="gpt-models-ledger-caption")
                editor for the selected row (.editor, LEFT BAR):
                  Gemini → M0_GeminiEditSettingsCard
                  OpenAI → M2_OpenAIEditSettingsCard → GptSelectedConnectionCard
                  Cloudflare → M1_CloudflareGatewayEditSettingsCard → GptSelectedConnectionCard
                usage report (.report, LEFT BAR) "Usage report · {applicationId}"
                status line (.status, 3px left bar) and "Worker setup still needs: …"
```

- Intro description (exact): "Select a provider connection, adjust its provider-neutral controls, save the approved application settings, or send the readiness prompt through the secure Worker boundary."
- Ledger columns (`GptModelsPanel.client.tsx:412-418`): `Model` (displayName, minmax(220px,1.4fr)), `Connection` (Cloudflare Gateway / OpenAI Direct / Gemini Direct, minmax(150px,1fr)), `Provider model` (minmax(120px,.8fr)), `State` (`configured` or `prototype`, 110px), `Actions` (a `✎` button that opens the Edit Model Connection dialog, 76px). Description "Select a row to configure its connection below. API key values never enter this browser surface." Empty text "No GPT model connections are defined." Sort `displayName asc`. Settings key `kr_homebase_gpt_models_ledger_v2`.
- Only rows whose connection is `gemini`, `openai` or `cloudflare-ai-gateway` appear in the ledger (`modelFromConnection`, lines 117-130); `anthropic-claude` and `other` can be saved but have no editor ("The saved {connection} connection does not yet have a supported editor.").
- Usage report table columns: `Model` (with provider label beneath), `Requests`, `IT`, `CT`, `OT`, `Total`, `Cost` (6 decimals); header shows "{totalTokens} tokens · ${totalCost}".

### 6.2 The left bar (keep)

The "bar on the left side of sections" is a 4px orange left border, `GptModelsPanel.module.css:150-158`:

```css
.editor, .report {
  background: var(--kr-theme-card-surface, #ffffff);
  border: 1px solid var(--kr-theme-line, #d7dee5);
  border-left: 4px solid var(--kr-theme-orange, #e45e25);
  display: grid; gap: 10px; padding: 10px;
}
```

The same device appears on the transport badge (`border: 1px solid orange; border-left-width: 4px`, lines 112-120), on the status line (`border-left: 3px solid var(--kr-theme-brand-primary, #21394f)`; orange when it is an error, lines 571-587), and on the old workspace header class `.header` (`GptModelGatewayWorkspace.module.css:6-11`, defined but not used by the component).

Other panel tokens: `.shell` background `--kr-theme-panel-background` (#f7f9fb), 1px line border, padding 12px, gap 12px. `.eyebrow` orange, 10px, weight 900, letter-spacing .08em, uppercase. `.title` brand primary, display font (Georgia), `clamp(22px, 3vw, 32px)`; `.editorTitle` 20px. `.ledgerBoundary` white with 1px line border, padding 8px. Two breakpoints: 900px (editor grid 2 columns) and 640px (intro, editor header and report header stack; transport badge full width; editor grid 1 column). The CSS module is 618 lines.

### 6.3 Edit Model Connection dialog (keep the look exactly; add `data-kr-id`)

Source: `GptModelConnectionsCard.client.tsx:124` (the `dialog` constant, one line) with `GptModelConnectionsCard.module.css`. The same dialog serves **Add a model connection** (from `Add connection`) and **Edit model connection** (from the ledger's `✎`). It has no `data-kr-id` today; the plan names it `firm-settings-gpt-connection-dialog`.

Structure (exact text):

```text
div.backdrop  role="presentation"  (mouse-down on the backdrop itself closes, unless saving)
  section.dialog  role="dialog" aria-modal="true" aria-labelledby="gpt-connection-dialog-title"
    header.dialogHeader
      div
        p.eyebrow        "MODEL CONNECTION"
        h3.dialogTitle#gpt-connection-dialog-title   "Edit model connection" | "Add a model connection"
      button.closeButton aria-label="Close dialog"   "×"
    form.form (onSubmit = save)
      label.field
        span.fieldLabel  "Connection " + span.info(tabIndex 0, aria-label "This is the Connection Company source. How is the AI engine contacting the database.") "i"
        select           Cloudflare AI Gateway | Gemini | Open AI | Anthropic-Claude | Other
        small            "Saved as the connection type: {label}."
      [only when Other] label.field
        span.fieldLabel  "Provider " + span.info(aria-label "This is the descriptive model name") "i"
        input            placeholder "Enter provider name", required
      label.field
        span.fieldLabel  "Provider model"
        input            placeholder "Example: gemini-3.7-flash", required
        small            "Enter the exact provider model identifier from the API documentation."
      div.field
        span.fieldLabel  "State: Unconfigured " + span.info(aria-label "Connection is considered to have a state as unconfigured until a successful test response is obtained") "i"
      [when editing and the type changed] p.warning role="status"
                         "Changing the connection type will discard the previous connection settings when saved."
      [on error] p.status.error   {error}
      div.dialogActions
        [edit only] button.dangerButton  "Delete model"   (margin-right auto, so it sits at the left)
        button.secondaryButton           "Cancel"
        button.primaryButton (submit)    "Saving…" | "Save changes" | "Add connection"
```

Behavior: choosing a type other than Other sets Provider to that type's label. Save requires Provider and model ("Provider and exact provider model are required."). Saving with a changed type (line 99) asks `window.confirm('Changing the connection type will discard the previous connection settings. Save the new connection type?')`. Delete (line 113) asks `window.confirm('Delete the {provider} · {model} connection?')`. Success messages: "Connection saved with State: Unconfigured." / "Model connection updated with State: Unconfigured." / "Model connection deleted." Both `window.confirm` calls break the User-Response Dialog Standard and must become `U6ConfirmationDialog` in the port (the dialog's own look stays).

Dialog CSS (exact, `GptModelConnectionsCard.module.css`):

```css
.backdrop { align-items: center; background: rgb(20 32 45 / 55%); display: flex; inset: 0; justify-content: center; padding: 16px; position: fixed; z-index: 100; }
.dialog { background: #fff; border: 1px solid var(--kr-theme-line, #d7dee5); border-top: 4px solid var(--kr-theme-orange, #e45e25); box-shadow: 0 18px 45px rgb(20 32 45 / 25%); display: grid; gap: 14px; max-width: 520px; padding: 18px; width: 100%; }
.dialogHeader { align-items: start; display: flex; justify-content: space-between; }
.eyebrow { color: var(--kr-theme-orange, #e45e25); font-size: 10px; font-weight: 900; letter-spacing: .08em; margin: 0 0 3px; text-transform: uppercase; }
.dialogTitle { color: var(--kr-theme-brand-primary, #21394f); font-family: var(--kr-theme-font-display, Georgia, serif); font-size: 20px; margin: 0; }
.closeButton { background: transparent; border: 0; color: var(--kr-theme-brand-primary, #21394f); cursor: pointer; font-size: 22px; line-height: 1; padding: 0 2px; }
.form { display: grid; gap: 11px; }
.field { display: grid; gap: 4px; }
.fieldLabel { align-items: center; color: var(--kr-theme-brand-primary, #21394f); display: flex; font-size: 11px; font-weight: 850; gap: 6px; }
.field input, .field select { background: #fff; border: 1px solid var(--kr-theme-line, #d7dee5); border-radius: 2px; color: var(--kr-theme-text, #1f3040); font: inherit; font-size: 12px; padding: 7px; width: 100%; }
.field input:focus, .field select:focus { border-color: var(--kr-theme-orange, #e45e25); outline: 2px solid color-mix(in srgb, var(--kr-theme-orange, #e45e25) 18%, transparent); }
.field small { color: var(--kr-theme-text-muted, #526172); font-size: 10px; line-height: 1.3; }
.info { align-items: center; background: var(--kr-theme-brand-primary, #21394f); border-radius: 50%; color: #fff; cursor: help; display: inline-flex; font-family: Georgia, serif; font-size: 10px; font-weight: 900; height: 15px; justify-content: center; position: relative; width: 15px; }
.info:hover::after, .info:focus-visible::after { background: var(--kr-theme-brand-primary, #21394f); border-radius: 2px; bottom: calc(100% + 7px); color: #fff; content: attr(aria-label); font-family: var(--kr-theme-font-body, Arial, sans-serif); font-size: 11px; font-weight: 500; left: 0; line-height: 1.3; min-width: 220px; padding: 7px 8px; position: absolute; z-index: 2; }
.warning { background: color-mix(in srgb, var(--kr-theme-orange, #e45e25) 10%, #fff); border-left: 3px solid var(--kr-theme-orange, #e45e25); color: var(--kr-theme-orange, #a9431b); font-size: 12px; line-height: 1.4; margin: 0; padding: 7px 8px; }
.status { border-left: 3px solid var(--kr-theme-brand-primary, #21394f); margin: 0; padding: 5px 8px; color: var(--kr-theme-text-muted, #526172); font-size: 12px; line-height: 1.45; }
.error { border-left-color: var(--kr-theme-orange, #e45e25); color: var(--kr-theme-orange, #a9431b); }
.dialogActions { display: flex; gap: 8px; justify-content: flex-end; }
.primaryButton, .secondaryButton { border: 1px solid transparent; border-radius: 2px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 850; padding: 7px 10px; }
.primaryButton { background: var(--kr-theme-orange, #e45e25); border-color: var(--kr-theme-orange, #e45e25); color: #fff; }
.secondaryButton { background: #fff; border-color: var(--kr-theme-line, #d7dee5); color: var(--kr-theme-brand-primary, #21394f); }
.primaryButton:hover, .primaryButton:focus-visible, .secondaryButton:hover, .secondaryButton:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kr-theme-orange, #e45e25) 22%, transparent); outline: none; }
.primaryButton:disabled { cursor: wait; opacity: .55; }
.dangerButton { background: var(--kr-theme-error, #b42318); border: 1px solid var(--kr-theme-error, #b42318); border-radius: 2px; color: var(--kr-theme-text-inverse, #fff); cursor: pointer; font: inherit; font-size: 12px; font-weight: 850; margin-right: auto; padding: 7px 10px; }
.dangerButton:hover, .dangerButton:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kr-theme-error, #b42318) 22%, transparent); outline: none; }
.dangerButton:disabled { cursor: wait; opacity: .55; }
```

Porting note: the `.info` tooltip uses `::after` with `content: attr(aria-label)`, and the `.field input` rules style descendants; neither has a clean Tailwind map form. This is the kind of case `AGENTS_05` allows a CSS module for; the decision belongs in stage 7.

The "card" variant of the same component (the empty state) adds `.card` (panel background, 1px border, padding 12px), eyebrow "MODEL CONNECTIONS", title "Add Model Connection" (22px), description "Save the connection company and exact provider model identifier. New rows remain unconfigured until a successful test response is obtained.", and a table `Connection | Provider model | State` ("Loading connections…", "No model connections saved yet.").

### 6.4 Editors and actions

- **Gemini** (`M0_GeminiEditSettingsCard.client.tsx`, 457 lines, `data-kr-element="gpt-model-editor"`): eyebrow "Selected connection · Gemini Direct"; inline "Gemini Model:" identifier input; copyable `kr-gpt-connection-id`; switch "Enabled for application modules"; Thinking level (Low, Medium (default), High); Max output tokens (tip: model maximum 65,536, readiness fixed at 1,024); "Google Cloud project name" (placeholder `krhomebase`, config2); "Google Cloud project ID" (config1); "Key Name" (placeholder `krhomebase-gemini-key`); "Gemini API key" (hold-to-show button, file upload); three rate inputs in dollars per million tokens; system instruction (disabled: "Sending instructions not implemented at this time."); details "Advanced / administrator settings" with "Gemini endpoint URL"; actions Save settings, Save credential, readiness, report, delete; readiness status with Copy, spinner, result.
- **OpenAI and Cloudflare** share `GptSelectedConnectionCard.client.tsx` (172 lines, `data-kr-id="gpt-model-editor-{model}"`).
- Panel delete uses `window.confirm('Delete the {displayName} connection?')` (`GptModelsPanel.client.tsx:393`), a second native prompt to replace.
- Readiness sends the fixed `GPT_READINESS_PROMPT` with `maxOutputTokens: 1024`.

### 6.5 Server route and Worker

`src/app/krhomebase/api/kr-gpt/route.ts` (335 lines) with `gptGatewayClient.ts` (324 lines). Both methods require a session with role `super_admin` (`requireKrApiV1Session('kr-gpt/…', ['super_admin'])`, lines 181 and 214).

| Method | Action | Worker command | Notes |
|---|---|---|---|
| GET | — | `REPORT_USAGE` | Returns `models` (a fixed default list), `connections` (from the report), `connectionError`, `worker` (`configured`, `missing[]`), `usage`. |
| POST | `save-model-connection` / `delete-model-connection` | `SAVE_MODEL_CONNECTION` / `DELETE_MODEL_CONNECTION` | Needs `modelConnection` (`GPT_MODEL_CONNECTION_REQUIRED`). |
| POST | `readiness` | `READINESS` | Prompt capped at 4,000 characters. |
| POST | `save-settings` | `SAVE_SETTINGS` | Non-secret settings and credential metadata. |
| POST | `save-credential` | `SAVE_CREDENTIAL` | The key is encrypted for the Worker before sending (`GPT_CREDENTIAL_KEY_REQUIRED` if empty). |
| POST | `report-usage` | `REPORT_USAGE` | `limit` default 50. |

Other errors: `GPT_INVALID_ACTION` (422), `GPT_WORKER_NOT_CONFIGURED: {missing}` (503), `GPT_MODEL_REQUIRED` (422), Worker failures (502). Application id `krhomebase`; module name `krhomebase/firm-settings/gpt-gateway`.

**Transport** (`gptGatewayClient.ts`): the old Next.js server calls the Worker over HTTPS at `KR_GPT_WORKER_URL`. Each command is encrypted with a per-request AES-256-GCM key wrapped for the Worker's RSA public key (OAEP), and signed with an RS256 JWT made with the server's private key (key id `kr-gpt-server-key1.pub`). The Worker's reply is signed and encrypted the other way; the server checks the signature, request id, action and expiry. Settings read (names only): `KR_GPT_WORKER_URL`, `KR_GPT_SERVER_PRIVATE_KEY` (or `_PATH`), `KR_GPT_WORKER_PUBLIC_KEY` (or `_PATH`), `KR_GPT_SERVER_KEY_ID`.

**The Worker already exists in this repository:** `workers/gpt-workers/gpt-models-worker.ts` (1,232 lines, copied unchanged on Nov 4, 2026) with `gpt-models-worker.jsonc` (name `krhomebase-gpt-models-worker`, D1 binding `GPT_USAGE_DB` → `krhomebase_gpt_usage_dev` with id `NOT_SET_REVIEW_BEFORE_USE`, `workers_dev: true`, secrets `GPT_WORKER_PRIVATE_KEY` and `GPT_SERVER_PUBLIC_KEY`). It is not deployed. It calls Gemini, OpenAI or a Cloudflare AI Gateway, keeps credentials encrypted in `gpt_llm_credential`, and writes `gpt_usage`, `gpt_approved_application` and `gpt_model_connection` (`docs/Schema_GPT_Usage_1.1`). Nothing in the GPT gateway is hard coded except the fallback model list `DEFAULT_MODELS` and the readiness prompt.

## 7. Dashboard widgets

Folder: `src/hb-components/dashboard/`. Mounted by `hb-components/DashboardPanel.client.tsx:31` (`<DashboardWidgetGrid user onSelectSection>`); preferences screen mounted by `UserSettingsSection.client.tsx:396`.

### 7.1 Registry (`dashboardWidgetRegistry.ts`)

```ts
interface KRDashboardWidgetDefinition {
  id: string; title: string; description: string
  requiredRole?: string          // exact role match, lowercased; no permission check
  defaultEnabled: boolean; defaultOrder: number
  size: 'small' | 'medium' | 'wide'   // declared, never read by the grid
}
```

| id | title | description | requiredRole | defaultEnabled | defaultOrder | size |
|---|---|---|---|---|---|---|
| `review-queue` | Review Queue | Shows website feedback and assigned public inquiry leads that need review. | `super_admin` | true | 10 | wide |
| `employee-clock-in` | Employee Clock In | Clock in or out from the dashboard and open the Employee Time Card workspace. | — (everyone) | true | 5 | medium |

- Preferences: `Record<widgetId, {enabled, order}>` in `localStorage` key `kr_homebase_dashboard_widgets_v1`, merged over the role defaults (`mergeDashboardWidgetPreferences`); invalid stored values fall back to the defaults. Writing fires the window event `kr-dashboard-widget-preferences-changed`.
- Visible widgets: allowed by role, enabled, sorted by order (`getVisibleDashboardWidgets`).

### 7.2 Grid, shell and preferences

- **Grid** (`DashboardWidgetGrid.client.tsx`): re-reads on the `storage` event and the custom event. With no widgets it shows `DashboardPlaceholder`. Renders with a chain of `if (widget.id === …)` (lines 44-45). Container `div.kr-dashboard-widget-gallery` (`data-kr-id="dashboard-widget-grid"`), global CSS in `hb-components/KR-EditUser/forms.css:1558-1565`: grid, gap 10px, `grid-template-columns: repeat(auto-fit, minmax(400px, 400px))`, `justify-content: start`, padding `var(--kr-theme-widget-padding-8-10, 8px 10px 8px 10px)`; one column below 767px.
- **Shell** (`DashboardWidgetShell.client.tsx`): `article.kr-dashboard-card` with `data-kr-id={id}`; header with optional scope tag (`WTU`, `WTF`, `WTU/WTF`, `Review`, `Timekeeping`), `h3` title, optional subtitle, and a collapse button (`–` / `+`, 24×24). `collapseDisabled` shows a disabled `×` labelled "Remove {title} widget (disabled)". Collapse state is not saved. Card CSS (`forms.css:1566-1608`): dashed 1px border `rgba(12, 44, 77, 0.34)`, background `rgba(255,255,255,0.96)`, `--kr-shadow-1`; title 14px; subtitle 11px; header bottom border.
- **Preferences** (`DashboardWidgetPreferences.client.tsx`): one checkbox per allowed widget (title in bold, description small), buttons "Reset dashboard widgets" and "Save dashboard widgets". Status lines: "Dashboard widget settings are stored locally until user preference persistence is added." / "Dashboard widget settings saved locally for this browser profile." / "Dashboard widget settings reset to the role-based defaults." Empty: "No dashboard widgets are available for this role yet." There is no ordering control; `order` can only come from defaults.
- Other files in the folder (`AppointmentWidget`, `ClientFilesWidget`, `CourtDatesWidget`, `CriticalDeadlinesWidget`, `TasksWidget`, `WebsiteRequestsWidget`, `UserDashboardSettingsPlaceholder`, `dashboardData.ts`) are placeholders or sample-data widgets that the registry does not list.
- **Review Queue** (`ReviewQueueWidget.client.tsx`): `GET /krhomebase/api/kr-api-v1/notifications/summary` → `{hasUnread, totalCount, items[{id, count, label, description, href}]}`; shell id `dashboard-widget-review-queue`, scope `Review`, subtitle "Website feedback and assigned intake leads that need action."; empty "You have no new website feedback or assigned public inquiry leads."

### 7.3 EmployeeClockInWidget (`data-kr-id="dashboard-widget-employee-clock-in"`)

Source: `EmployeeClockInWidget.client.tsx` (225 lines) and `EmployeeClockInWidget.module.css` (163 lines).

```text
┌ EMPLOYEE TIME ENTRY                                         [×] (disabled) ┐
│ Dan Krueger                                        [ Clocked In  ]         │
│ Working Time Today: 03:25                                                  │
│ ────────────────────────────────────────────────────────────────────────── │
│ [ Clock In ]        [ Clock Out ]        [ View Time Card ]                │
│ P23 · 2026-11-02 – 2026-11-15                                   31.5 RH    │
│ (repair warning) (status) (error)                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

- Shell: `id="dashboard-widget-employee-clock-in"`, title `EMPLOYEE TIME ENTRY`, `collapseDisabled` (no collapse). Inner section `aria-label="Employee clock in module"`, `data-kr-id="dashboard-employee-clock-in-controls"`, `data-kr-component="EmployeeClockInWidget"`, `data-kr-element="attendance-time-card-controls"`, `data-kr-pattern="control-group"`, `aria-busy` while saving.
- Data: `GET /krhomebase/api/kr-api-v1/timekeeping?view=mine` on mount and after each action. Uses `reports[0]` (the viewer's card), `policies.firmTimezone` (default `America/Chicago`), `clockState` (`isClockedIn`, `openPunch`, `today`, `minutesWorkedToday`, `repairWarning`, `staleOpenPunch.message`), `period` (`number`, `start`, `end`) and `totals.regularHours`.
- Name: `report.employee.name`, else the session display name.
- "Working Time Today: HH:MM": `clockState.minutesWorkedToday` when the API gives it, else computed in the browser from today's non-voided punch pairs, an open punch counting up to now. A 30-second timer refreshes `now` (lines 95-98).
- Status button (not clickable; `aria-pressed`): `Clocked In` (primary background #21394f) or `Clocked Out` (accent #0066cc).
- Buttons: `Clock In` (disabled when clocked in), `Clock Out` (disabled when clocked out), `View Time Card` (orange outline; opens section `timekeeping`). The button for the next action is drawn primary, the other secondary.
- Actions: `POST /krhomebase/api/kr-api-v1/timekeeping` `{action:'clock_in'|'clock_out', idempotencyKey:'{action}-{uuid}'}`. A busy dialog (`SaveDialog`) shows "Clocking in attendance change" / "Clocking out attendance change". Success: "Clock In recorded." / "Clock Out recorded." When the open punch is from an earlier day, or the API answers `MISSED_CLOCK_OUT_REQUIRES_REVIEW`, the widget shows "Open the Time Card to resolve the overnight missed clock-out." and switches to Attendance; it never opens the missed clock-out dialog itself.
- Footer: `P{period.number} · {start} – {end}` left, `{regularHours.toFixed(1)} RH` right (tabular numbers).
- CSS (exact values): widget `width: 400px; max-width: 100%`; header and body padding `var(--kr-theme-button-padding-regular, 8px 10px 8px 10px)`; disabled collapse button muted surface, `opacity .65`; `.controls` grid gap 10px; `.identityRow` flex, space-between, gap 10px; name `--kr-theme-font-size-bigger`, line-height 1.2; status button and action buttons radius 2px, weight 850, `--kr-theme-font-size-base`, padding as above; `.actions` 3 equal columns, gap 6px (1 column below 520px); primary `--kr-theme-button-primary-background` #21394f with inverse text; secondary `--kr-theme-button-secondary-background` #eef3f7 with line border; view button secondary background, 1px orange border, orange text, weight 900; disabled `opacity .55`, `not-allowed`; rule 1px line; meta muted, flex space-between; success #246b45; warning and error #9d2c20.
- New repository mapping: the new API already has `GET /v1/timekeeping/clock-state`, `POST /v1/timekeeping/clock-in`, `/clock-out` and `/missed-clock-out` (Attendance stage 1), so the widget needs no new route. The old widget's one `view=mine` call becomes `clock-state` plus whatever the footer needs (period number and regular hours).

## 8. Tables behind each area

| Area | Tables (database `krhomebase` unless stated) |
|---|---|
| User Settings | none (browser storage only); theme list reads `lookup` (`category='kr_homebase_theme'`) |
| Application Settings: users and invites | `user`, `user_invite`, `user_sso_identity`, `individual`, `individual_contact_method`, `employee`, `employee_certification`, `user_role_set` (list also reads addresses and matter access) |
| Application Settings: role sets | `role_set`, `role_set_permission`, `role_set_permission_scope`, `user_role_set` |
| Application Settings: teams | `team`, `team_member`, `team_lead`, `employee`, `user`, `individual` |
| Employee Documents | `document_record`, `media_asset`, `employee`, team tables; files in the R2 bucket `kr-homebase-employee-storage` |
| Other Configuration | `lookup` (themes; row `lk_kr_article_helper_prompt_upload_article`) |
| Web Site Feedback | `site_feedback` in the public-inquiry database, through its CRUD Worker |
| Firm Profile | `entity` (firm row `ent_krueger_richard_firm`), `lookup` row `lk_kr_firm_locations_profile` |
| Employee Policies | `lookup` row `lk_kr_employee_policies` |
| Data Import | `individual`, `entity`, contact-method tables, `lead`, `matter`, `kr_maintenance_gate` |
| Stripe Payment Configuration | `payment_provider` |
| GPT Model Gateway | `gpt_model_connection`, `gpt_llm_credential`, `gpt_usage`, `gpt_approved_application` in `krhomebase_gpt_usage_dev` (owned by the GPT Worker) |
| Dashboard widgets | none (browser storage); the clock widget reads the Attendance tables through its routes |

## 9. Findings that affect the plan

These are facts found in stage 0 that bear on `docs/08_Settings_Dashboard_Plan.md`. The decisions themselves are recorded in the plan.

1. **Idle warning lead time.** The old warning appears 5 minutes before logout, not 1 minute as the plan's decision 3 assumed. It is a status box, not a dialog.
2. **Feedback button.** The old preference has two fields, show and position (four corners), and drives the floating feedback button, which is not ported.
3. **Article prompt.** "Article Settings" holds one text: the GPT helper prompt downloaded from Upload Article (`lookup` row `lk_kr_article_helper_prompt_upload_article`, up to 50,000 characters). The article image table `content_asset` (public content database, `workers/d1-workers/article-schema/schema_public_content_v6.sql:84-99`) has `alt_text` but no license field, so the requester's rule that every article image carries a license needs a schema change there.
4. **Employee File.** The old Employee File is a placeholder; the employee documents themselves are R2 files under `employees/<employeeId>/hr/<category>/<documentId>/` with `document_record` and `media_asset` rows.
5. **GPT Worker exists.** `workers/gpt-workers/gpt-models-worker.ts` is ready to review, but it uses `workers_dev: true` (a public address) and an HTTPS call with RSA keys; the new API reaches Workers through service bindings, so the transport needs a decision before it is deployed.
6. **Time Card.** The old Time Card choice never shows a screen; it switches to Attendance, which matches the requester's direction.
7. **Theme scope.** Themes are firm-wide records in `lookup`, chosen per browser; only `super_admin`/`admin` may read them, so other users never saw the custom themes.
8. **Role columns can disagree.** Saving a user writes `user.role` and `user.role_set_id`, then the role-set route overwrites `role_set_id` from the primary assignment without changing `role` (section 4, "User Management" oddities). The port should keep one source of truth.
