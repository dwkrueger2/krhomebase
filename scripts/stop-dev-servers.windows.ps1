# file: scripts/stop-dev-servers.windows.ps1
# Stops every `wrangler dev` and `vite dev` started from this repository, listening or not (root script
# `stop:dev:servers`, also the first step of `stop:ports:all`).
#
# Why (Nov 13, 2026): on Windows a dev server can outlive the terminal or pnpm run that started it. Such an orphan
# may not hold a port when `stop:ports:all` runs, then start a new workerd later and take port 8787 back. The next
# `pnpm dev` then reports "Ready" but its API never answers, or vinext refuses to start ("Another vinext dev server
# is already running"). This script finds those servers by their command line (the wrangler or vite script inside
# this repository's folder) and stops each whole process tree. Servers of other repositories are left alone.

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$escapedRoot = [regex]::Escape($repoRoot)

# The node process that runs wrangler or vite from this repository, in `dev` mode.
$servers = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match $escapedRoot -and $_.CommandLine -match '(wrangler|vite)[\\/]bin[\\/][^ ]+\.js"?\s+dev' })

if ($servers.Count -eq 0) {
    Write-Host "No dev servers from $repoRoot are running."
    exit 0
}

foreach ($server in $servers) {
    # Climb to the `cmd /c wrangler dev ...` wrapper when there is one, so its tree is stopped too.
    $root = $server
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($server.ParentProcessId)" -ErrorAction SilentlyContinue
    if ($null -ne $parent -and $parent.Name -eq 'cmd.exe' -and $parent.CommandLine -match '(wrangler|vite) dev') { $root = $parent }

    if (Get-Process -Id $root.ProcessId -ErrorAction SilentlyContinue) {
        taskkill /PID $root.ProcessId /T /F | Out-Null
        $kind = if ($server.CommandLine -match 'wrangler') { 'wrangler' } else { 'vite' }
        Write-Host "Stopped $kind dev server (PID $($root.ProcessId), started $($server.CreationDate))."
    }
}
