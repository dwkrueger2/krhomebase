# Outstanding Task List: Repository Patch 76

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:43pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 76  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch075_11_23.md`

## Completed by this patch

- `scripts/Release-ToolSdk.ps1` writes the release zip entry by entry with `/` separators (`System.IO.Compression.ZipFile`), instead of with Windows PowerShell 5.1's `Compress-Archive`. That command stored `\` in the paths, so some Mac and Linux tools unpacked files named `api-reference\API-REFERENCE.md` instead of folders. Used for kit 1.2.0.

## Notes

- Run the release script from PowerShell (or `pnpm.cmd` in the Terminal panel), not from Git Bash. Git Bash's `tar` reads `D:` as a network host, and the script's unpack check fails ("The kit file could not be unpacked").
