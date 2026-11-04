# AGENTS 04: Coding Style and Descriptive Comments

<small>Version 1.1</small><br>
<small>Updated Nov 3, 2026 10:58pm</small>

## Purpose

This file defines the repository-wide standard for preserving and adding human-readable comments in application code. Comments are part of the maintenance interface: they should help a developer understand what a section does by reading the source, without having to add temporary borders, inspect browser layout, or reverse-engineer the relationships between components.

It applies to `apps/web`, `apps/api` and `packages/contracts`. The JSX, HTML and CSS sections apply to `apps/web`; the JSDoc rules apply to all three.

All instructions in this file are mandatory unless the requester explicitly overrides them for a specific task.

## Preserve descriptive comments

- Do not remove, rewrite, relocate, or condense a descriptive comment written by any project contributor unless the related code is intentionally deleted or the author explicitly requests the comment change.
- Treat comments that explain purpose, layout, defaults, browser behavior, dependencies, workarounds, or design decisions as intentional documentation, even when the surrounding code is being refactored into a component.
- When moving code, move its descriptive comments with the code. If a comment applies to the containing section rather than the moved line, preserve it at the new section boundary.
- Do not remove comments merely to make a diff smaller or to satisfy a formatting preference. Add a new comment when a refactor changes the context needed to understand the existing comment.
- **Code ported from the old repository keeps its descriptive comments.** Porting is a move, not a rewrite. Read the old file (read-only), carry its comments across, and update a comment only where the new location changes what it says (for example an old path or API route).

## Prospective application and existing-code boundary

- These style rules apply prospectively to new code and to code being intentionally changed for the requested task.
- Do not reformat, reorganize, extract, or otherwise rewrite existing JSX merely to conform to this guide.
- Do not retrofit section markers, JSDoc, Tailwind class ordering, style maps, or other formatting conventions across untouched files unless the requester explicitly requests that cleanup.
- When an existing component is intentionally changed, keep surrounding JSX, comments, and styling organization intact unless the requested change requires a structural rewrite.
- A component ported unchanged from the old repository is existing code: port it faithfully and report which style conventions it does not yet follow. Apply this guide's conventions to the parts that are rewritten for the new architecture (for example, replacing a direct database call with `callApi`) and to anything new.

## Descriptive component filenames

- Prefer descriptive, responsibility-based filenames for new component files rather than generic names such as `pages.tsx`, `component.tsx`, or `index.tsx` when a more specific name is available.
- For client components, use the `.client.tsx` suffix so the file's client boundary is clear from its name, for example `ContactForm.client.tsx` or `ProjectFilters.client.tsx`.
- Use the framework-required filename when a route or framework convention requires one, such as `page.tsx`, `layout.tsx`, `loading.tsx`, or `route.ts`; this preference applies to the component files those route files import or contain when a descriptive filename is otherwise available.
- Apply this preference to new files and to files being intentionally renamed as part of the requested task. Do not rename untouched existing files solely to retrofit this convention.
- In `apps/api`, file names follow the folder pattern in `apps/api/AGENTS.md` (`routes.ts`, `rules.ts`, `queries.ts`).

## JSDoc for functions and styles

- Use JSDoc comments (`/** ... */`) for functions, components, hooks, exported types, and interfaces that have behavior or are used across a component boundary.
- JSDoc should describe what the code really does, how it is used, what it expects as input, what it returns or renders, and the important state, side effects, dependencies, or callbacks involved.
- The first main entry-point function in a file requires a robust human-language JSDoc description. It should explain the purpose of the file's entry point, its inputs, its output, its major internal stages, and how it works with neighboring components or services.
- Document every function's non-obvious parameters and return value. For React components, describe the rendered responsibility and the parent/child state ownership rather than only repeating the function name.
- For API code, describe who may call the function, which tables it reads or writes, and which error codes it can produce.
- Use JSDoc-style block comments immediately above CSS rules or groups of related rules when the purpose, layout relationship, responsive behavior, print behavior, or naming is not obvious. CSS uses the same `/** ... */` syntax, although CSS does not process JSDoc tags.
- CSS comments should explain usage and relationships, for example which component owns a class, what layout role it plays, and which parent state changes it. Preserve existing descriptive CSS comments.

## JSX and HTML section markers

- Add a section comment before each major JSX/HTML region so the source makes the page structure clear. Comment regions such as the header, navigation, control bar, formatting sidebar, report workspace, preview paper, metadata block, footer, and print-only content.
- The comment must say what the region is for, not merely repeat the element name. Prefer `<!-- Report preview toolbar: viewer actions and print controls -->` over `<!-- header -->`.
- In literal HTML files and HTML templates, use HTML comments in the form `<!-- ... -->`.
- In `.tsx` JSX source, use the JSX-compatible form `{/* ... */}` for the same section markers; raw `<!-- ... -->` is not valid JSX syntax. The comment text should still follow the HTML section-comment standard.
- Add nested section comments when a major region contains distinct subregions whose purpose would otherwise be unclear. Avoid comments on every individual element; comments are for meaningful structural boundaries.
- Keep section comments adjacent to the region they describe so that moving the region also moves its documentation.

## Refactoring checklist

Before completing a refactor, component extraction, or port from the old repository:

- Confirm all user-authored descriptive comments remain present and still sit beside the code they explain.
- Add or update JSDoc for the new component, its props, its key functions, and any CSS rules whose ownership or purpose changed.
- Add clear JSX/HTML section markers around the major regions in the changed render tree.
- Verify that comments explain the relationship between parent state, child props, rendered output, styling, pagination, printing, or other relevant behavior.
