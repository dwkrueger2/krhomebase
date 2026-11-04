param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 65535)]
    [int]$Port
)

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

    Stop-Process -Id $processId -Force -ErrorAction Stop
    Write-Host "Stopped $($process.ProcessName) (PID $processId) listening on port $Port."
}
