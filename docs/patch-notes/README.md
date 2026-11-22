# Patch Notes
<small>Version 3.0</small><br>
<small>Updated Nov 21, 2026 8:16pm</small>

## Purpose

This folder is a durable repository record. It holds one outstanding task list for each completed patch, as `AGENTS_01_version-procedures.md` requires. The files are committed with the change set they document and are kept as project history.

Do not put secrets, keys, client data, database rows, or other sensitive material in these files.

## Layout

The four version tracks have independent patch numbers that can be equal, so each has its own folder:

```text
docs/patch-notes/repository/   root workspace, scripts, documentation
docs/patch-notes/api/          apps/api and apps/external-api
docs/patch-notes/web/          apps/web
docs/patch-notes/tool-sdk/     packages/tool-sdk (the tool kit, a track since Nov 20, 2026)
```

File name: `Outstanding Task List_PatchXXX_MM_DD.md`, where `XXX` is the track's new `patchNum` (at least three digits, zero-padded) and `MM_DD` is the patch date.

## Current lists

| Track | Latest list |
|---|---|
| Repository | `repository/Outstanding Task List_Patch073_11_21.md` |
| API | `api/Outstanding Task List_Patch054_11_21.md` |
| Web | `web/Outstanding Task List_Patch579_11_21.md` |
| Tool kit | `tool-sdk/Outstanding Task List_Patch003_11_21.md` |

This table was last brought up to date in repository patch 73; the newest file in each folder is always the current list.

Migration files are not kept here: they live in `docs/Schema_8.0/migrations/` (`AGENTS_06`; moved in repository patch 45, Nov 15, 2026). Older lists still name the old place, `repository/Migration_Patch...sql`.

Earlier lists stay in place as history.
