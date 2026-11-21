# Vendored KR Homebase Tool SDK
<small>Version 1.1</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

This is a source snapshot of `@krhomebase/tool-sdk` version 1.0.0, copied here so this directory can build independently after it is moved to another repository. Keep only public SDK entry points and their source dependencies. Do not import from the monorepo.

To refresh the snapshot, copy the approved public source files from the SDK and review the diff and upstream version. The snapshot does not include SDK tests or development-only dependencies.

This snapshot includes the server-only `getPermittedUsers()` call, which reads the calling tool's own Outside Tools email list and requires `tool-registration:read`. The standalone Google Chat Scraper uses it to enforce its separate Google sign-in policy. This change does not package or publish the SDK distribution.
