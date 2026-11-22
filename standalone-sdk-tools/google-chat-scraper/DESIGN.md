# Design
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 10:33am</small>

## Visual direction

The tool runs in the KR Homebase Tool SDK frame and uses the host-provided `--kr-theme-*` values. The initial scaffold keeps an operational, dense review layout with clear queue and sync readiness states. When opened outside the Homebase frame for local preview, CSS fallbacks keep the same controls legible. Source-message and editable-proposal rows are planned but not yet implemented.

## Interaction rules

- Make the source text and proposed activity fields visually distinct.
- Keep pending, dismissed, approval-unavailable, and sync-disabled states explicit.
- Never imply that a draft has been written to Workstream before an authorized approval route confirms it.
- Keep keyboard focus, errors, and loading states visible.

