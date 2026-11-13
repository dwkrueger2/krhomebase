# file: scripts/stop-dev-port.windows.ps1
# Stops the development server listening on one port (root scripts `stop:port:<number>`).
#
# Changed Nov 13, 2026: the script used to stop only the process that owned the port. For the API that is a
# workerd child of `wrangler dev`, and wrangler started a new workerd at once, so the old server came back and
# held the port. Now the script finds the dev server that owns the listener (the `wrangler dev` or `vite dev`
# command above it) and stops that whole process tree. A listener with no such command above it is stopped alone,
# as before.

param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 65535)]
    [int]$Port
)

# Command lines that belong to a development server started by this repository's scripts.
$devServerPattern = 'wrangler|vite|vinext|workerd'

<#
.SYNOPSIS
Returns the topmost process above $ProcessId whose command line is still part of the dev server
(for example `cmd /c wrangler dev ...`), so stopping its tree also stops wrangler and every workerd.
It never climbs to pnpm or to the terminal that started the server.
#>
function Get-DevServerRoot([int]$ProcessId) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $current) { return $ProcessId }
    while ($true) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($current.ParentProcessId)" -ErrorAction SilentlyContinue
        # pnpm's own command (`pnpm.js`, `pnpm.cmd`, `pnpm.exe`) ends the climb; a path through node_modules\.pnpm does not.
        if ($null -eq $parent -or $parent.CommandLine -notmatch $devServerPattern -or $parent.CommandLine -match 'pnpm\.(c?js|cmd|exe)') { break }
        $current = $parent
    }
    return [int]$current.ProcessId
}

$connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)

if ($connections.Count -eq 0) {
    Write-Host "No listening process found on port $Port."
    exit 0
}

$processIds = $connections |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

    if ($null -eq $process) {
        Write-Host "Process $processId for port $Port has already exited."
        continue
    }

    $rootId = Get-DevServerRoot -ProcessId $processId
    if ($rootId -ne $processId) {
        # taskkill /T stops the root and every process under it.
        taskkill /PID $rootId /T /F | Out-Null
        Write-Host "Stopped the dev server tree (PID $rootId) that owned $($process.ProcessName) (PID $processId) on port $Port."
    }
    else {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Stopped $($process.ProcessName) (PID $processId) listening on port $Port."
    }
}
