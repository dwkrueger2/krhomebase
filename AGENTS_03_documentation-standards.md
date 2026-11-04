# AGENTS 03: Markdown Documentation Standards

<small>Version 1.1</small><br>
<small>Updated Nov 3, 2026 10:58pm</small>

## Purpose

This file defines the required title, document version, and updated timestamp for Markdown documentation created or changed by an automated agent in this repository.

All instructions in this file are mandatory unless the requester explicitly overrides them for a specific task.

## Required document header

Every newly created or updated documentation `.md` file must begin with this structure:

```markdown
# Document Title

<small>Version 1.0</small><br>
<small>Updated Aug 12, 2026 5:58pm</small>

[Continue with documentation]
```

Requirements:

1. The first content line is a level-one Markdown title that identifies the document.
2. The document version appears directly below the title in HTML `small` markup.
3. The updated timestamp appears on the next line in HTML `small` markup.
4. The first small-print line ends with `<br>` so the two metadata values render on separate lines.
5. A blank line separates the metadata from the documentation body.

## Document version rules

- Start a newly created document at `Version 1.0`.
- When adding this header to a pre-existing unversioned document, initialize it at `Version 1.0`, unless the document already states its own version (for example `v0.3`); then continue from that number with the next increment. Do not invent undocumented earlier versions.
- Increment the version by `0.1` whenever an existing versioned document is changed, for example `1.0` to `1.1` or `1.9` to `2.0`.
- Increment once per completed change set, not once per edit, retry, section, or agent turn.
- Do not change the version when the file was only inspected.
- The document version is independent of the version tracks in `package.json` (see `AGENTS_01`).

### Help-document exception

User-facing help documents live under `docs/help-docs` and correlate to the semantic version of the track they describe. Use the owning track's `package.json` version (for example `Version 1.1.5` for web help from `apps/web/package.json`). Do not advance a help-document version by `0.1`. Update the timestamp whenever content changes, and update the correlated version whenever the owning track's semantic version changes. The `docs/help-docs` folder is created with the first help document.

## Updated timestamp rules

- Update the timestamp whenever document content is changed.
- Use the date and time when the change is finalized, in the project timezone `America/Chicago`.
- Format exactly `Updated MMM D, YYYY h:mma`: English three-letter month, no leading zero on the day or hour, lowercase `am` or `pm` with no space before it.
- Example: `Updated Aug 12, 2026 5:58pm`.

## Scope

This standard applies to human-readable Markdown documentation throughout the repository, including:

- Root and companion `AGENTS*.md` guides, and the `AGENTS.md` in `apps/*` and `packages/*`.
- README files.
- Architecture, deployment, schema, process, and planning documents.
- Outstanding task lists in `docs/patch-notes` and patch reports.
- User-facing help documents under `docs/help-docs`.

`CLAUDE.md` files contain only the import line `@AGENTS.md` and are exempt. When modifying an existing Markdown document that lacks this header, add the header as part of that change. A task does not require retrofitting untouched Markdown files unless the requester asks for a repository-wide normalization.

Generated documentation, such as the HTML schema pages under `docs/Schema_*` and `apps/api/openapi/openapi.json`, follows its own generator and is not covered by this guide.

## Completion check

Before finishing a task that creates or modifies Markdown documentation, verify every changed `.md` file has:

- One level-one title at the top.
- A current `Version X.X` line, or the correlated owning track version for documents under `docs/help-docs`.
- A current `Updated MMM D, YYYY h:mma` line.
- A version incremented exactly once when the file was already versioned before the change (except `docs/help-docs`).
