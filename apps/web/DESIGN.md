---
name: KR Homebase
description: The firm's ledger room. A navy frame around dense, ruled work surfaces for all-day practice management.
colors:
  brand-primary: "#00305b"
  brand-secondary: "#001e3a"
  brand-primary-active: "#0a4f9c"
  button-primary-background: "#21394f"
  button-primary-hover-background: "#2d4a66"
  table-heading-dark: "#21394f"
  accent: "#8a715c"
  accent-dark: "#6d5948"
  panel-accent-gradient-middle: "#0f766e"
  teal: "#4e998a"
  orange: "#e45e25"
  danger: "#9d2c20"
  success: "#246b45"
  sync-current: "#43c46b"
  sync-stale: "#f2c94c"
  text: "#243142"
  text-muted: "#5a6775"
  text-inverse: "#f7f9fb"
  line: "#d7dee5"
  shell-surface: "#f7f9fb"
  card-surface: "#ffffff"
  muted-surface: "#eef3f7"
  table-row-background-2: "#f7f9fb"
  table-row-hover: "#f0f6fb"
  table-row-selected: "#e3edf7"
  button-secondary-background: "#eef3f7"
  link: "#004c7f"
  line-strong: "#b8c7d4"
  warning: "#d97706"
  accent-strong: "#d99b3d"
  primary-strong: "#102a3a"
  background-soft: "#fbfcfd"
  on-dark: "#f8fbff"
  communication-surface: "#0f1011"
  communication-surface-elevated: "#202124"
  communication-line: "#3c4043"
  communication-text: "#e8eaed"
  communication-accent: "#a8c7fa"
typography:
  display:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(20px, 2.4vw, 30px)"
    fontWeight: 800
    lineHeight: 1
  headline:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(19px, 2.1vw, 28px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 850
    lineHeight: 1.2
  body:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  body-bigger:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
  small:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.08em"
  table-heading:
    fontFamily: "Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.045em"
rounded:
  sharp: "2px"
  soft: "3px"
  dialog: "4px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
components:
  button-primary:
    backgroundColor: "{colors.button-primary-background}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.title}"
    rounded: "{rounded.sharp}"
    padding: "8px 10px"
  button-primary-hover:
    backgroundColor: "{colors.button-primary-hover-background}"
    textColor: "{colors.text-inverse}"
  button-secondary:
    backgroundColor: "{colors.button-secondary-background}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sharp}"
    padding: "8px 10px"
  button-toolbar:
    backgroundColor: "{colors.brand-primary}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.label}"
    rounded: "{rounded.sharp}"
    padding: "2px 7px"
    height: "24px"
  button-toolbar-alert:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.sharp}"
    padding: "2px 7px"
    height: "24px"
  input:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sharp}"
    padding: "6px"
  card:
    backgroundColor: "{colors.card-surface}"
    rounded: "{rounded.sharp}"
    padding: "8px"
  card-header:
    backgroundColor: "{colors.muted-surface}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    padding: "7px 8px"
  ledger-heading:
    backgroundColor: "{colors.table-heading-dark}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.table-heading}"
    padding: "6px 8px"
  ledger-row:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.text}"
    padding: "2px 8px"
  ledger-row-alternate:
    backgroundColor: "{colors.table-row-background-2}"
  ledger-row-hover:
    backgroundColor: "{colors.table-row-hover}"
  ledger-row-selected:
    backgroundColor: "{colors.table-row-selected}"
  title-bar:
    backgroundColor: "{colors.brand-primary}"
    textColor: "{colors.card-surface}"
    padding: "8px 20px 10px"
  nav-item:
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.sharp}"
    padding: "9px 10px"
    height: "38px"
  nav-item-active:
    backgroundColor: "{colors.brand-primary-active}"
    textColor: "{colors.card-surface}"
  tab:
    textColor: "{colors.text-muted}"
    height: "34px"
    padding: "0 10px"
  tab-active:
    textColor: "{colors.table-heading-dark}"
  dialog:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
    padding: "10px"
    width: "440px"
---

# Design System: KR Homebase

<small>Version 1.6</small><br>
<small>Updated Nov 11, 2026 9:30pm</small>

This file records the visual system that is already in the code (`apps/web/styles/theme.css`, the component `STYLES` maps) and in the old app's reference pages (`/tests/krh/u/default-theme`, `/tests/krh/u5`, `/tests/krh/u1`). The YAML block above must stay at the very top of the file for design tools to read it, so this file's title and version sit below it. Product facts are in `PRODUCT.md`. Layout rules for code (widths, spacing, corners, label placement) are binding in `apps/web/AGENTS.md`; this file describes them and does not override them.

## Overview

**Creative North Star: "The Firm's Ledger Room"**

KR Homebase looks like a well-kept records room: a deep navy frame (title bar and left menu) holds pale, ruled work surfaces where the firm's contacts, time and money are kept. Everything inside the frame is a ledger, a card or a form, set close together with hairline borders and almost no shadow. The look comes from order and density, not decoration.

The screens are dense on purpose. People spend whole days here with several clients open, so the system saves height before width, keeps labels on the same line as their fields, and uses 13px body text with 11px small print. Color carries meaning: navy is the frame and the main action, warm camel marks the current tab and the eyebrow over a title, slate heads every table, and red, orange and green appear only for state.

Every value a user may change (colors, padding, sizes) is a `--kr-theme-*` token, set on the theme scope `[data-kr-theme-scope="krhomebase"]`, never on `:root`. A saved user theme overrides the same tokens, so a component that hard-codes a color breaks the user's theme.

**Key Characteristics:**
- Navy frame (title bar and left menu), light work surface inside.
- Dense: 13px body, 2px to 10px gaps, 24px to 38px control heights.
- Nearly square corners (2px; 4px for dialogs).
- Flat surfaces with hairline borders; shadows only for things that float.
- Uppercase, letter-spaced labels on slate table headings and camel eyebrows.
- Every color and padding is a user-configurable theme token.

## Colors

A cool navy-and-slate palette with one warm camel accent from the K&R logo pack, and state colors kept for state.

### Primary
- **Firm Navy** (brand-primary): the title bar, the toolbar's main action, the selected filter card's 3px border, and the start of the panel accent gradient.
- **Midnight Navy** (brand-secondary): the left menu column, the backdrop tint behind dialogs (at 40%), and the dark fill behind the title-bar search and buttons (at 34%).
- **Active Blue** (brand-primary-active): the selected left-menu row and the focus border of a form field.
- **Ledger Slate** (button-primary-background, table-heading-dark): the primary button, the confirm button in dialogs, and every ledger heading row. Hover deepens to **Ledger Slate Light** (button-primary-hover-background).

### Secondary
- **Warm Camel** (accent): the underline of the active tab in Menu Style One, the eyebrow over a module title, and the hover or focus border of search fields and filter cards. **Dark Camel** (accent-dark) is its pressed or text-on-light form.
- **Deep Teal** (panel-accent-gradient-middle): the middle of the panel accent strip gradient (Firm Navy to Deep Teal to Ledger Slate, 135 degrees).

### Tertiary (state)
- **Brick Red** (danger): errors, destructive confirmations, overdue dates.
- **Ledger Green** (success): saved and paid states.
- **Signal Orange** (orange): the one toolbar action that needs attention.
- **Sea Teal** (teal): secondary informational marks.
- **Sync Green** and **Sync Amber** (sync-current, sync-stale): only the data sync light on the dark title bar.

### Neutral
- **Ink Slate** (text): all body text.
- **Muted Slate** (text-muted): descriptions, captions, inactive tabs, field labels.
- **Frost** (text-inverse): text on navy and slate.
- **Cool Hairline** (line): every border and divider.
- **Shell Mist** (shell-surface): the work-area background behind cards; also the alternate ledger row.
- **Card White** (card-surface): cards, ledgers, dialogs, fields.
- **Pale Denim** (muted-surface): card headers, filter cards, settings panels, the secondary button.
- **Row Hover** and **Row Selected** (table-row-hover, table-row-selected): ledger row states.

### Not yet ported
These are in the old app's default theme (Application Settings, Other Configuration) and belong to the system, but `apps/web/styles/theme.css` does not define them yet: **Link Blue** (link), **Strong Hairline** (line-strong), **Amber Warning** (warning), **Brass** (accent-strong), **Deep Slate** (primary-strong), **Soft Background** (background-soft), **Text on Dark** (on-dark). The old theme also has aliases (`card`, `muted`, `primary`, `surface`, `button-primary-text`, `on-success`) and `sticky-review-top` (36px). Add a token to `theme.css` before a component uses it.

### Communications (dark layer)
The Communications screens use their own dark set, modeled on a chat client: **Night** (communication-surface), **Night Raised** (communication-surface-elevated), **Night Line** (communication-line), **Night Text** (communication-text) and **Night Link** (communication-accent). The rest of the dark set is in `theme.css`. Use it only inside Communications.

### Named Rules
**The Token Only Rule.** Never write a color into a component when a `--kr-theme-*` token names it. Users can change these values, so a hard-coded color is a bug.

**The State Color Rule.** Red, orange, green and amber mean state. They never decorate.

## Typography

**Body Font:** Raleway (with Inter, then the system sans: Segoe UI on Windows)
**Display Font:** Raleway (same stack)
**Login only:** Black Mango (title), DM Serif Display italic (firm name), Geist (card text)

**Character:** one plain sans, used small and bold. Weight and letter-spacing make the hierarchy, not size.

Raleway is loaded from `styles/fonts` (variable weight 100 to 900, upright, Latin and extended Latin; `app/globals.css`). The old app never loaded it, so its screens drew the system font; expect ported screens to look slightly different. Raleway's default figures are old-style, so the theme scope turns on lining figures (`font-variant-numeric: lining-nums`). The files have no fixed-width figures, so right-align amount columns.

### Hierarchy
- **Display** (800, clamp(20px, 2.4vw, 30px), line-height 1): the application title in the title bar, white on Firm Navy.
- **Headline** (600, clamp(19px, 2.1vw, 28px), tracking -0.035em): the module title in a module header.
- **Title** (850, 13px, 1.2): card and ledger captions.
- **Body** (400, 13px): all screen text. **Bigger** (14.5px, 600) is for dialog titles.
- **Small** (11px): descriptions, toolbar text, ledger search, field help.
- **Label** (800, 10px to 11px, tracking 0.05em to 0.18em, uppercase): eyebrows in Warm Camel, stat labels, the application label in the title bar, the open-list group label in the menu.
- **Table heading** (800, 11px, tracking 0.045em, uppercase): ledger heading row, Frost on Ledger Slate.

### Named Rules
**The Small and Bold Rule.** Body text stays at 13px and small print at 10px to 12px. Make things stand out with weight (700 to 850) and uppercase tracking, not with bigger type.

**The Login Exception Rule.** Black Mango, DM Serif Display and Geist belong to the sign-in card (Chalk Denim tokens in `styles/chalk-denim.css`). Do not use them inside the application frame.

## Layout

The frame is a grid filling the window (`h-dvh`, at least 320px wide): title bar across the top; under it, the left menu (240px open, 68px collapsed to icons, sliding in 200ms) and the work area. Below 768px the menu becomes a horizontal strip under the title bar.

Three widths are designed: mobile under 768px (checked at 390px), tablet 768px to 1023px (768px) and desktop 1024px and wider (1280px). Widths in between are handled with `clamp()`, `minmax()` and `min-w-0`. Nothing scrolls sideways at 320px.

Spacing is tight: 4px to 8px between elements, 6px to 8px vertical padding in fields and buttons, 10px at most inside cards and panels. Labels sit beside their fields, short fields share a row, and help goes in a tooltip. A form people use again and again must fit whole in a 1280 by 720 window.

**The Height Budget Rule.** Screens run out of height before width. Every extra line in a form is a row someone scrolls past.

## Elevation & Depth

The system is flat. Surfaces sit on Shell Mist and are separated by Cool Hairline borders and Pale Denim headers. Cards and ledgers carry only a hairline shadow. Real shadows appear only on things that float above the page: popovers, menus, the ledger hover card and dialogs.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 1px 2px rgba(27,35,48,.07)`): cards, ledgers, module headers.
- **Popover** (`box-shadow: 0 4px 12px rgba(0,30,58,.25)`): the notification and recently accessed menus.
- **Floating panel** (`box-shadow: 0 8px 22px rgba(0,30,58,.22)`): search results and hover cards.
- **Dialog** (`box-shadow: 0 18px 50px rgba(16,42,58,.22)`): confirmation and save dialogs, over a Midnight Navy backdrop at 40%.
- **Inset field** (`box-shadow: inset 0 1px 2px rgba(0,30,58,.08)`): recessed inputs.

**The Flat Desk Rule.** Nothing on the page casts a shadow unless it floats over something else.

## Shapes

Corners are nearly square: 2px on cards, buttons, fields, badges and tabs; 3px on dialog buttons and popovers; 4px on dialogs. A full circle is allowed only for avatars, status dots, small count badges and the round collapse handle of the left menu. Borders are 1px Cool Hairline. Emphasis uses a heavier line, not a fill: the active tab gets a 3px Warm Camel underline and a selected filter card a 3px Firm Navy border.

The panel accent strip, when the theme turns it on, is a thin band along a panel's top edge in the Firm Navy, Deep Teal and Ledger Slate gradient.

## Components

### Buttons
Compact and firm. Bold text on a solid fill, square corners.
- **Shape:** 2px corners (3px inside dialogs).
- **Primary:** Ledger Slate fill, Frost text, 12px to 13px at 800 weight, padding 8px 10px; hover to Ledger Slate Light.
- **Secondary / muted:** Pale Denim fill, Muted Slate text and border.
- **Toolbar actions:** 24px tall, 11px bold, padding 2px 7px. Main action in Firm Navy; quiet action in an 8% Ledger Slate tint; attention action in Signal Orange. Hover brightens slightly and the border turns Warm Camel.
- **Dialog buttons:** Cancel is outlined (Cool Hairline, transparent); confirm is Ledger Slate; a secondary choice is outlined in Ledger Slate.
- **Disabled:** 52% to 65% opacity with a not-allowed (or, while busy, a wait) pointer.
- **Focus:** a 2px outline, white on navy and Active Blue or Warm Camel on light.

### Chips and badges
- **Count and status badges:** 24px tall, Pale Denim fill, Cool Hairline border, 11px bold Muted Slate text.
- **Date tags** (old reference): small bordered tags; overdue in Brick Red.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** Card White, with a Pale Denim header row under a hairline.
- **Shadow Strategy:** Hairline only.
- **Border:** 1px Cool Hairline.
- **Internal Padding:** 8px (header 7px 8px).
- **Module header:** a Card White band with a Warm Camel eyebrow, a Headline title, an 11px description and square filter cards on the right (Pale Denim; Warm Camel border on hover; 3px Firm Navy border when selected).

### Inputs / Fields
- **Style:** 1px Cool Hairline, Card White (or a light Pale Denim mix), 2px corners, 12px to 13px text, padding about 6px, at least 26px tall.
- **Focus:** the border turns Active Blue (search fields turn Warm Camel).
- **Error / Disabled:** errors in Brick Red text under the field; disabled at 60% opacity.

### Navigation
- **Title bar:** Firm Navy. Uppercase application label (11px, 800, white at 68%), the Display title, a breadcrumb (white at 74%), the application search in a Midnight Navy tint, 32px icon buttons.
- **Left menu:** Midnight Navy. Rows 38px tall with 20px icons and 13px text at white 86%; hover lightens 12%; the selected row is Active Blue and bold. Open items sit indented below their row, with a small uppercase group label.
- **Tabs (Menu Style One):** 34px tall, 13px bold Muted Slate; the active tab is Ledger Slate text with a 3px Warm Camel underline.

### Ledger (signature component)
The dense record table used by Contacts and Billing (`components/tables/KRLedgerTable.client.tsx`).
- A caption bar (13px title, 11px description, search, settings and toolbar actions).
- A Ledger Slate heading row: 11px, 800, uppercase, tracking 0.045em, padding 6px 8px; sort arrows fade in on hover in 120ms.
- Rows padded 2px 8px, alternating Card White and Shell Mist, Row Hover and Row Selected for state.
- Resizable columns, a hover card, an action rail and a paging footer.

### Dialogs
`U6ConfirmationDialog`: up to 440px wide, 4px corners, 10px padding, Dialog shadow over a 40% Midnight Navy backdrop. The title is Bigger text. While busy, it shows the rainbow spinner. Never use the browser's own alert, confirm or prompt.

### Rainbow busy spinner
`RainbowBusySpinner` is the only busy signal: a spinning gradient ring, on its own or with a short label. It is the one place the full spectrum appears.

## Feature variations
A few features depart from this system on purpose. Each departure is listed here, and its full description (what it keeps, what differs, its states) lives in that feature's surface brief in `.impeccable/surfaces/`. A design check that flags one of these inside its own feature is not a defect. A feature that departs from the system adds one line here and gets its own brief.
- **Communications dark set.** The Communications screens use the dark layer described under Colors (`theme.css`). Only inside Communications.
- **Attendance time-card grid.** A fixed 14-day sheet (`features/timekeeping/components/TimeCardLedger.client.tsx`) instead of the shared ledger: fixed 29px rows, In/Out pairs closed by a Firm Navy rule, extra punches on their own rows, a Brick Red problem pill, a minimum width of about 980px that scrolls inside its card, and its own print layout. It keeps the Ledger Slate heading row, the row colors and lining figures. Brief: `.impeccable/surfaces/ing-components-attendancepanel-client-tsx-5cc48da7.md`.
- **Attendance header.** Attendance keeps the old screen's header (`AttendanceHeader.client.tsx`) instead of the shared module header, at the requester's direction: a serif title on the left and three Pale Denim context boxes on the right (Pay Period, Regular Period Hours, View), with no eyebrow. The four hour boxes (RH, OH, PTO, HOL, with their full names) sit in the time-card card header. Its card notes use the dark, semibold `noteTone="strong"` of `KRModuleCard` instead of the gray note. Same brief.
- **Settings IT cards.** The Settings landing page keeps the old Firm Settings menu's three IT cards in their own orange styles, at the requester's direction (`features/settings/components/SettingsChoiceCard.client.tsx`): Data Import (`FirmSettingsMenu-option-data-management`) with a Signal Orange outline mixed 48% into the hairline and an orange badge; GPT Model Gateway (`firm-settings-gpt-model-gateway-card`) and Stripe Payment Configuration (`firm-settings-stripe-payment-configuration-card`) solid Signal Orange with white text and a translucent badge. The plain choice cards around them follow this system. The pages they open keep their own looks too: Stripe Payment Configuration ported exactly, the GPT Model Gateway's 4px orange left bar and its Edit Model Connection dialog (reference `docs/API/Settings_AsIs_Reference.md` sections 5 and 6). Brief: `.impeccable/surfaces/settings-it-cards.md`.
## Do's and Don'ts

### Intended patterns
These are deliberate parts of this system. Generic design checks (including Impeccable's quality floor and its design hook) may flag them; keep them. The root `AGENTS.md` ("Impeccable") makes this file and the AGENTS files outrank those checks.

- **The camel eyebrow.** The small uppercase Warm Camel label above a module title (module header, module placeholder, create dialogs) stays. It names the area the screen belongs to.
- **The rainbow spinner.** `RainbowBusySpinner` is the busy signal everywhere, including while content loads. Skeleton placeholders are not used.
- **Fluid titles.** The application title (clamp(20px, 2.4vw, 30px)) and the module title (clamp(19px, 2.1vw, 28px)) scale with the window. Body, small and label sizes stay fixed.
- **Text glyph icons.** The ⚙, × and ✓ in the ledger settings, close and copy buttons stay until an icon set replaces them. New icons use `KRHomebaseIcons.<Name>`.

### Do:
- **Do** read every color and padding from a `--kr-theme-*` token, and add the token to `styles/theme.css` first when it is missing.
- **Do** right-align amount and number columns; Raleway's figures are lining but not fixed-width.
- **Do** keep corners at 2px to 4px (`rounded-[2px]`, `rounded-[3px]`, `rounded-[4px]`).
- **Do** keep body text at 13px and small print at 10px to 12px, and build hierarchy with weight and uppercase tracking.
- **Do** head every ledger with the Ledger Slate row in uppercase, tracked 11px text.
- **Do** mark the active tab with the 3px Warm Camel underline and the selected menu row with Active Blue.
- **Do** check every screen at 390px, 768px and 1280px, and fit a repeated form in 1280 by 720.
- **Do** use `U6ConfirmationDialog` and the rainbow spinner for confirmations and busy states.

### Don't:
- **Don't** use `rounded-lg`, `rounded-xl` or larger on cards, buttons, fields or dialogs.
- **Don't** hard-code a color that a token names.
- **Don't** put shadows on surfaces that do not float.
- **Don't** use red, orange, green or amber for decoration.
- **Don't** use the login fonts (Black Mango, DM Serif Display, Geist) inside the application frame.
- **Don't** use the Communications dark set outside Communications.
- **Don't** use `sm:`, `xl:`, `2xl:` or custom breakpoints.
