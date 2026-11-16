# Outstanding Task List: Repository Patch 43

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 9:25pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 43  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch042_11_15.md`
**Same change set:** web patch 549 (the Text tool reworked, the Dev Mode notice for outside tools). Branch `impeccable-11-09`.

## Completed by this patch

- `docs/12_Homebase_Feedback_Plan.md` 1.5: the F3 fixes and the `pnpm dev` viewer note under "What F4 built".
  - The deployed viewer keeps letting only `https://krhomebase.com` frame it (the requester, Nov 15, 2026).
  - A local KR Homebase shows a Dev Mode notice instead.
- A first try in this patch let `http://localhost:3011` frame the deployed viewer. The requester chose against it, and it was undone before commit. The viewer is unchanged (still 1.2.0).
- `pnpm check` passed.

## Immediate (the requester)

1. Commit with web patch 549.
2. Deploy the web app. The viewer and the API did not change.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:status
   pnpm deploy:hot
   ```

## Later

- Images in the viewer under `pnpm dev` are not possible: the deployed viewer is not shown there. Check images on the deployed KR Homebase.
- Carried from patch 42.
