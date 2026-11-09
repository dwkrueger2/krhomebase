# Readme: Dev View

<small>Version 1.5</small><br>
<small>Updated Nov 7, 2026 7:10pm</small>

Ported from the old `README - Dev Overlay.md` (v1.3, krueger-richard-website, `apps/kr-homebase/src/hb-components/dev-view`). Version continues from it.

## Purpose

Dev View is the development-only inspection layer for KR Homebase. It finds named `data-kr-*` attributes in the rendered page, lets a developer select useful groups of markers, and draws a visual boundary around each selected element.

It runs only in development. `app/layout.tsx` places `DevViewLoader`, which loads Dev View when `process.env.NODE_ENV` is `development` and renders nothing in a production build.

## What changed in the port (web patch 507)

| Change | Detail |
|---|---|
| Location | `apps/web/components/dev-view/`. Mounted in `app/layout.tsx`, so it works on every page, including `/login`, and in each pop-out browser window. |
| Workspace Canvas | Now `<main data-kr-id="KRH-Workspace">` (`components/shell/KRHWorkspace.client.tsx`). The old names `krhomebase-main-content` and `application-main-content` are still recognized. |
| Styling | The CSS module became Tailwind `STYLES` and `LAYOUT_STYLES` maps with the same values. There is no CSS file. |
| Files | Marker rules moved to `markers.ts`; the panel to `DevViewPanel.client.tsx`. `DevView.client.tsx` keeps the state. |
| New: Pick | Point at the page to outline the nearest marked element; click to draw an overlay on that one element. See "Pick". |
| New: corners | The button and panel can sit in any corner of the window. See "Position". |
| Page reads | Re-reads of the page after a change are batched to one per animation frame. |
| Not ported | `Dev Overlay Example.html`, the standalone demonstration page. It used the old names and is replaced by this file and the tests. |

## Vocabulary

### Dev marker

A **Dev marker** is the underlying `data-kr-*` identifier being inspected. A marker is represented in Dev View as an attribute/value pair, for example:

```text
data-kr-id="KRH-Workspace"
```

The main marker families are `data-kr-id` / `data-kr-id-*` and `data-kr-element` / `data-kr-element-*`. Dev View also recognizes `data-kr-provider`, `data-kr-component`, `data-kr-action`, and `data-kr-section-id` as preferred named attributes.

### Dev overlay

A **Dev overlay** is the positioned shaded rectangle and dashed boundary highlighting a selected element. The rectangle follows the selected element's viewport bounds when the page scrolls or resizes.

The boundary can be hidden with the VisIcon while its label remains visible. This makes it possible to keep the identifier readable without leaving every shaded boundary on screen.

### Dev overlay label

A **Dev overlay label** is the attached label that identifies the selected marker and exposes its controls in this order:

```text
[GrabIcon][VisIcon][C][E]data-kr-id="MarkerTest"[Copy][-]
```

- **GrabIcon**: press and drag horizontally to slide the label left or right. The label is not clamped to its rectangle, so it can slide outside its associated overlay.
- **VisIcon**: toggles only the shaded boundary. Its slashed state means the boundary is hidden; the label remains visible.
- **C**: cycles the selected marker list through descendant `data-kr-id*` markers, direct data-marked siblings, and the nearest data-marked parent. The selected keys are also checked in the Dev View master list.
- **E**: selects the caller plus all descendant `data-kr-element*` markers and checks those keys in the Dev View master list. Clicking it again restores the selection from before E was activated.
- **Copy**: copies the marker text to the clipboard and briefly changes to a checkmark.
- **[-]**: deselects the marker. The marker remains available in the Dev View list for re-selection.

## Application vocabulary

| Term | Element |
|---|---|
| Application Shell | `<div data-kr-id="krhomebase-application-shell">`, the outer frame (`ApplicationShell.client.tsx`). |
| Header bar | `data-kr-id="HeaderBar"`: `LeftPanelHeader` on the left, `TopTitleBar` on the right. |
| Left panel | `data-kr-id="LeftPanel"`: `LeftPanelNavList`, `LeftPanelFooter` (holding `LoggedInUserBlock`). |
| Workspace Canvas (also "workspace shell") | `<main data-kr-id="KRH-Workspace">`, the working area. |
| Workspace regions | The direct children of the canvas, for example `data-kr-id="WorkingPanel-<section>"`. |

```text
Application Shell
├── HeaderBar
│   ├── LeftPanelHeader
│   └── TopTitleBar
└── ApplicationPanels
    ├── LeftPanel
    │   ├── LeftPanelNavList
    │   └── LeftPanelFooter
    │       └── LoggedInUserBlock
    └── Workspace Canvas (KRH-Workspace)
        └── Workspace regions (WorkingPanel-<section>, cards, components, sections)
```

## Source map

| File | Responsibility |
| --- | --- |
| `DevViewLoader.client.tsx` | Loads Dev View in development; renders nothing in production. Placed in `app/layout.tsx` and in `PopOutBrowserWindow.client.tsx`. |
| `DevView.client.tsx` | Owns all state: selection, filters, visibility, label offsets, context (C and E), Pick mode, corner. Measures the overlays. |
| `DevViewPanel.client.tsx` | The control panel: counts, corner picker, search, filters, sort, Pick and select/clear actions, marker list. |
| `DevOverlay.client.tsx` | The overlay layer: one boundary per selected element and its label placement. |
| `DevOverlayLabel.client.tsx` | One label line: GrabIcon, VisIcon, C, E, marker text, Copy, `[-]`; the horizontal drag. |
| `useMarkerPicker.client.ts` | Pick mode's pointer, click and keyboard handling. |
| `DevPickHighlight.client.tsx` | The blue box and tag Pick draws around its target. |
| `markers.ts` | Marker discovery, filter rules, measurement, Pick helpers. No React. |
| `corner.ts` | The four corner positions and the saved choice. |
| `markers.test.ts`, `DevView.test.tsx` | Tests (run with `pnpm check`). |

## Filter behavior

The panel combines the search field, filter buttons, and sort selector.

### Focus

**Focus** shows and can select:

1. The Workspace Canvas (`KRH-Workspace`).
2. Every non-empty `data-kr-*` attribute on the Workspace Canvas and its direct children.

The initial Dev View selection is this Focus set, so a development page opens with the working area and its top-level workspace region visible.

### Overlay

**Overlay** shows and can select:

1. `data-kr-id="LeftPanel"`
2. `data-kr-id="LeftPanelHeader"`
3. `data-kr-id="LoggedInUserBlock"`
4. `data-kr-id="krhomebase-application-shell"`
5. The Workspace Canvas.
6. Every non-empty `data-kr-*` attribute on the Workspace Canvas's direct children.

TopTitleBar is not one of the fixed Overlay markers; it can still be found with `-kr-id`, `-kr-element`, All markers, or Pick.

### `-kr-id`

**`-kr-id`** filters the marker list to `data-kr-id` and `data-kr-id-*` attributes. Double-clicking the button selects all matching visible markers, or clears them when all matching markers are already selected.

### `-kr-element`

**`-kr-element`** filters the marker list to `data-kr-element` and `data-kr-element-*` attributes. Its double-click selection behavior matches `-kr-id`.

### `-ledger`

**`-ledger`** filters the marker list to `data-kr-id` markers whose value contains `-ledger` (case-insensitive), for example `time-and-fees-ledger`. Double-clicking the button turns the overlays for every matching visible marker on, or off when they are all already on. `data-kr-id-*` and `data-kr-element` values are not matched.

### `-dialog`

**`-dialog`** filters the marker list to `data-kr-id` / `data-kr-id-*` and `data-kr-element` / `data-kr-element-*` markers whose value contains `-dialog` (case-insensitive), for example `create-user-dialog`. Its double-click behavior matches `-ledger`.

### All markers

**All markers** shows the complete discovered marker list. Double-clicking it clears all selections.

### Bordered

**Bordered** replaces the selection with the markers on elements carrying one of the temporary b1-b4 border styles (`AGENTS_05`), plus the nearest dialog around each. Click again to leave.

### Search and sort

The search field narrows the currently active filter set. The sort selector provides:

- **Page order**: first rendered DOM order.
- **Identifier A–Z**: lexical `attribute=value` order.
- **Most used**: highest rendered occurrence count first.

**Select visible** adds every currently visible marker to the selection. **Clear visible** removes every currently visible marker from the selection. A single click on a filter toggles that filter; a double-click performs the selection action described above.

### Suppressed markers

Any marker attribute whose name contains `-suppress` is intentionally retained for inspection but excluded from Focus, Overlay, `-kr-id`, `-kr-element`, `-ledger`, `-dialog`, and Pick. For example, `data-kr-id-suppress="identity-name-row-component"` appears only when **All markers** is selected.

## Pick

1. Press **Pick** in the action row. The pointer becomes a crosshair.
2. Point at the page. A blue dashed box outlines the **nearest marked element** around the pointer: the element under the pointer if it has a `data-kr-*` marker, otherwise its closest marked ancestor. The tag names its first marker.
3. **Up arrow** moves the box out to the next marked ancestor (the tag shows `↑1`, `↑2`, ...). **Down arrow** moves back in.
4. **Click** draws an overlay on **that element only**, labeled with all of its markers, and turns Dev View on. Pick mode then ends. **Shift + click** picks and keeps picking. The panel counts picks as `N picked`.
5. **Escape**, the Pick button again, or closing the panel ends Pick mode.

While picking, the page underneath receives no clicks, so picking a button does not press it. Scrolling still works. Dev View's own panel and labels keep working.

Picks are kept as elements, not as markers. Picking the Leads menu button draws one overlay, even though all 13 menu buttons carry `data-kr-element="left-nav-item"`. Checking a marker in the list still draws every element that carries it.

- `[-]` on a picked overlay removes that pick.
- Changing a filter, Bordered, double-clicking All markers, and C clear all picks. E leaves them.
- Picks are not listed in the marker list and are not checked there.

## Pop-out windows

A section popped out into its own browser window gets its own Dev View, with its own button, panel, overlays and Pick. The main window's Dev View cannot see into another window, so `PopOutBrowserWindow.client.tsx` places a second `DevViewLoader` inside the pop-out with `targetWindow` set to that window.

- Each copy reads, measures and listens to its own window only. Selections are separate.
- In the pop-out, the section's frame `data-kr-id="KRH-PopOutWindow"` plays the Workspace Canvas role, so Focus shows the panel and its direct children.
- Both copies share the saved corner.
- The in-page fallback (`PopOutWindow`, used when the browser blocks pop-ups) is part of the main page, so the main Dev View already covers it.

## Position

The four small squares at the top right of the panel move the button and panel to that corner of the window. The choice is saved in the browser (local storage, key `kr-dev-view-corner`) and restored on the next load. Bottom right is the default and keeps the old offsets.

## Marker discovery rules

Dev View prefers these exact attributes when they are present:

```text
data-kr-element
data-kr-id
data-kr-provider
data-kr-component
data-kr-action
data-kr-section-id
```

It also recognizes the named `data-kr-id-*` and `data-kr-element-*` families. On the Workspace Canvas and its direct children, every non-empty `data-kr-*` attribute is included so the Focus and Overlay scopes do not lose a top-level inspection contract. Other elements use the preferred/named attributes and a single `data-kr-*` fallback when no preferred marker exists.

Dev View ignores its own elements (everything inside `data-dev-view-root`), except the panel's own `data-kr-id="Dev-View-Marker-Controls"`, which stays in the list as in the old tool. The root attribute deliberately does not start with `data-kr-`.

## Checking that production has no Dev View code

After a production build, the built files must not contain the panel's marker. Run:

```powershell
$Repo = "D:\Repos\krhomebase"
$Web  = Join-Path $Repo "apps\web"
Set-Location $Repo
pnpm build:web
Get-ChildItem (Join-Path $Web "dist") -Recurse -Include *.js | Select-String -Pattern "Dev-View-Marker-Controls" -List | Select-Object Path
```

No output means no Dev View code was bundled. Tailwind still writes Dev View's utility classes into the shared stylesheet, because it scans every source file; those are style rules only (about 3 KB compressed), not code.
