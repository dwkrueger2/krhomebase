# Patch Notes

<small>Version 1.2</small><br>
<small>Updated Nov 3, 2026 11:46pm</small>

## Purpose

This folder is a durable repository record. It holds one outstanding task list for each completed patch, as `AGENTS_01_version-procedures.md` requires. The files are committed with the change set they document and are kept as project history.

Do not put secrets, keys, client data, database rows, or other sensitive material in these files.

## Layout

The three version tracks have independent patch numbers that can be equal, so each has its own folder:

```text
docs/patch-notes/repository/   root workspace, scripts, documentation
docs/patch-notes/api/          apps/api
docs/patch-notes/web/          apps/web
```

File name: `Outstanding Task List_PatchXXX_MM_DD.md`, where `XXX` is the track's new `patchNum` (at least three digits, zero-padded) and `MM_DD` is the patch date.

## Current lists

| Track | Latest list |
|---|---|
| Repository | `repository/Outstanding Task List_Patch003_11_03.md` |
| API | `api/Outstanding Task List_Patch003_11_03.md` |
| Web | `web/Outstanding Task List_Patch500_11_03.md` |

Earlier lists stay in place as history.
