# file: scripts/Deploy-Krhomebase.ps1
# Deploys the API (krhomebase-api) and the web app (krhomebase-web) with Cloudflare Worker versions (repository patch
# 34, Nov 14, 2026). The process, the order and the checks are in docs/11_Deployment_PromptStart.md.
#
#   pnpm deploy:hot                      upload both, make both live now (API first). No warning.
#   pnpm deploy:warn 5 -Estimate 3       upload both, warn everyone for 5 minutes (banner above the top bar), sign
#                                        everyone out and close the API, make both live, open the API (green)
#   pnpm deploy:status                   the pending deploy, the deploy window, and what is live
#   pnpm deploy:finish                   continue a warn deploy whose terminal was closed (or clear a stuck window)
#   pnpm deploy:cancel                   end the warning; the uploaded versions are never made live
#
# Options (after the command): -Only api|web (one Worker), -Restart (a new warn deploy restarts the countdown),
# -Force (a hot deploy while a warn deploy is pending: cancels the warning first), -AllowDirty (deploy with
# uncommitted files; the build takes the working folder as it is).
#
# How it works:
#  1. Upload: `wrangler versions upload` (API) and `vinext-cloudflare deploy --no-promote` (web) build and upload a new
#     version without making it live. The build is taken at upload, so the working folder may change right after.
#     The version ids, the commit and the versions live before (the rollback targets) go to deploy-state\pending.json
#     (git-ignored).
#  2. Warn only: one `wrangler d1 execute` writes the deploy window on the maintenance gate row (migration 034:
#     deploy_notice_at, deploy_logout_at, deploy_expires_at = logout + estimate + 15 minutes, deploy_estimate_minutes)
#     with an audit_log row. The API reports it in GET /v1/health; the banner counts down and signs people out at
#     logout time, when the API closes (apps/api/src/platform/deployLock.ts). The script waits in the terminal.
#  3. Live: `wrangler versions deploy <id>@100%`, API first, then web, each checked with `wrangler deployments status`.
#  4. Warn only: the window is cleared (green), with an audit_log row. The login pages reload when they see green.
#
# Several deploys: the waiting script reads pending.json again when it makes the versions live, so the newest upload
# wins. A second `deploy:warn` while one is waiting uploads, replaces the pending ids and keeps the countdown (unless
# -Restart). If the script never finishes, the window ends on its own at deploy_expires_at: the API opens again on the
# versions live before. Migrations are never run here; apply them as their own step.
#
# The requester runs this script (it deploys and writes the deploy window): hard rule 4 of the root AGENTS.md.
# Windows PowerShell 5.1 or later. Run from anywhere; the script finds the repository from its own folder.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("hot", "warn", "status", "finish", "cancel")]
    [string]$Mode,
    # Minutes of warning before everyone is signed out (warn only).
    [Parameter(Position = 0)]
    [ValidateRange(1, 120)]
    [int]$Minutes = 5,
    # Estimated shutdown in minutes, shown in the banner and on the login page (warn only).
    [ValidateRange(1, 240)]
    [int]$Estimate = 5,
    # Which Worker: both (default), api or web.
    [ValidateSet("both", "api", "web")]
    [string]$Only = "both",
    [switch]$Restart,
    [switch]$Force,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
# wrangler and vite write UTF-8 (the cloud, the box lines, the check marks). Windows PowerShell 5.1 reads a program's
# output in the console's old code page unless told otherwise, which turned them into stray Greek letters (Nov 14, 2026).
# This file stays plain ASCII: Windows PowerShell 5.1 reads a script without a byte-order mark in that old code page too.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Repo     = Split-Path -Parent $PSScriptRoot
$Api      = Join-Path $Repo "apps\api"
$Web      = Join-Path $Repo "apps\web"
$Config   = "kr-api-wrangler.jsonc"
$State    = Join-Path $Repo "deploy-state"
$Pending  = Join-Path $State "pending.json"
$Last     = Join-Path $State "last.json"
$Database = "krhomebase"
$ApiName  = "krhomebase-api"
$WebName  = "krhomebase-web"
# The window ends on its own this many minutes after the estimate runs out.
$GraceMinutes = 15

<#
.SYNOPSIS
Runs pnpm.cmd with the given arguments in a folder, prints and returns its output as text, and stops on failure.
#>
function Invoke-Pnpm([string]$Folder, [string[]]$Arguments, [switch]$Quiet) {
    Push-Location $Folder
    # Windows PowerShell 5.1 turns every line a program writes to stderr into an error; wrangler writes notices there.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = & pnpm.cmd @Arguments 2>&1 | ForEach-Object {
            $text = "$_"
            if (-not $Quiet) { Write-Host $text }
            $text
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
        Pop-Location
    }
    $output = ($lines -join "`n")
    if ($code -ne 0) { throw "pnpm $($Arguments -join ' ') failed (exit $code).`n$output" }
    return $output
}

<# Reads the newest version id of a Worker (`wrangler versions list --json`), or $null when there is none. #>
function Get-NewestVersionId([string]$Worker) {
    $raw = if ($Worker -eq $ApiName) {
        Invoke-Pnpm $Api @("exec", "wrangler", "versions", "list", "--config", $Config, "--json") -Quiet
    } else {
        Invoke-Pnpm $Repo @("exec", "wrangler", "versions", "list", "--name", $Worker, "--json") -Quiet
    }
    $start = $raw.IndexOf("[")
    if ($start -lt 0) { throw "wrangler versions list did not answer with JSON for $Worker." }
    # Windows PowerShell 5.1 hands a JSON array on as one object; ForEach-Object unrolls it into its versions.
    $versions = @($raw.Substring($start) | ConvertFrom-Json | ForEach-Object { $_ })
    if ($versions.Count -eq 0) { return $null }
    return ($versions | Sort-Object { [int]$_.number } | Select-Object -Last 1).id
}

<# Reads the version id serving 100% of a Worker's traffic now (`wrangler deployments status`), or $null. #>
function Get-LiveVersionId([string]$Worker) {
    $raw = if ($Worker -eq $ApiName) {
        Invoke-Pnpm $Api @("exec", "wrangler", "deployments", "status", "--config", $Config) -Quiet
    } else {
        Invoke-Pnpm $Repo @("exec", "wrangler", "deployments", "status", "--name", $Worker) -Quiet
    }
    if ($raw -match '\(100%\)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') { return $Matches[1] }
    return $null
}

<# Uploads a new version of one Worker without making it live, and returns its id. #>
function Send-Version([string]$Worker, [string]$Message) {
    $before = Get-NewestVersionId $Worker
    Write-Host ""
    Write-Host "== Uploading $Worker (not live yet) ==" -ForegroundColor Cyan
    if ($Worker -eq $ApiName) {
        $out = Invoke-Pnpm $Api @("exec", "wrangler", "versions", "upload", "--config", $Config, "--message", $Message)
        if ($out -match 'Worker Version ID:\s*([0-9a-f-]{36})') { return $Matches[1] }
    } else {
        # vinext-cloudflare 1.4 uploads through the `cf` tool and then reads the new id from its output. On Nov 14,
        # 2026 the upload worked (a new version was listed) but vinext stopped with "Could not detect Worker version ID".
        # The id is read from `wrangler versions list` below either way, so that one failure is let through when a new
        # version exists; any other failure stops the deploy.
        try {
            Invoke-Pnpm $Web @("exec", "vinext-cloudflare", "deploy", "--no-promote") | Out-Null
        } catch {
            if ($_.Exception.Message -notmatch 'Could not detect Worker version ID') { throw }
            Write-Host "vinext could not read the new version id from its own output; reading it from the version list instead." -ForegroundColor Yellow
        }
    }
    $after = Get-NewestVersionId $Worker
    if (-not $after -or $after -eq $before) { throw "No new version of $Worker was found after the upload." }
    return $after
}

<# Makes one version serve 100% of a Worker's traffic, then checks it. #>
function Publish-Version([string]$Worker, [string]$VersionId, [string]$Message) {
    Write-Host ""
    Write-Host "== Making $Worker version $VersionId live ==" -ForegroundColor Cyan
    # --version-id and --percentage instead of "<id>@100%": a "%" can be read as a variable by cmd.exe (pnpm.cmd).
    $spec = @("--version-id", $VersionId, "--percentage", "100", "--message", $Message, "--yes")
    if ($Worker -eq $ApiName) {
        Invoke-Pnpm $Api (@("exec", "wrangler", "versions", "deploy", "--config", $Config) + $spec) | Out-Null
    } else {
        Invoke-Pnpm $Repo (@("exec", "wrangler", "versions", "deploy", "--name", $Worker) + $spec) | Out-Null
    }
    $live = Get-LiveVersionId $Worker
    if ($live -ne $VersionId) { throw "$Worker serves $live at 100%, not $VersionId." }
    Write-Host "$Worker now serves $VersionId at 100%." -ForegroundColor Green
}

<# Runs SQL that writes the deploy window (and its audit row) on the live database. #>
function Invoke-GateWrite([string]$Sql) {
    Invoke-Pnpm $Api @("exec", "wrangler", "d1", "execute", $Database, "--remote", "--config", $Config, "--command", $Sql) -Quiet | Out-Null
}

<#
.SYNOPSIS
Builds the audit_log insert for a deploy window change (no person: the script acts, the requester runs it).
.DESCRIPTION
The details are built with SQLite's json_object, so the command carries no double quotes: Windows PowerShell 5.1 does
not escape them when it passes an argument to pnpm.cmd. Values are plain times, numbers and fixed words.
#>
function Get-AuditSql([string]$Action, [hashtable]$Details, [string]$Now) {
    $pairs = foreach ($key in ($Details.Keys | Sort-Object)) {
        $value = $Details[$key]
        if ($value -is [int]) { "'$key', $value" } else { "'$key', '$(([string]$value).Replace("'", "''"))'" }
    }
    $id = [guid]::NewGuid().ToString()
    return "INSERT INTO audit_log (id, request_id, actor_user_id, actor_email, actor_role, source, resource, action, target_table, target_id, matter_id, client_id, previous_json, new_json, idempotency_key, success, error_message, created_at) VALUES ('$id', 'deploy-$id', NULL, NULL, NULL, 'deploy-script', 'deploy', '$Action', 'kr_maintenance_gate', 'krhomebase', NULL, NULL, NULL, json_object($($pairs -join ', ')), NULL, 1, NULL, '$Now');"
}

function Get-IsoNow { return [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }

<# Writes the deploy window: warning now, sign-out at $LogoutAt. #>
function Set-DeployWindow([DateTime]$LogoutAt, [int]$EstimateMinutes) {
    $now = Get-IsoNow
    $logout = $LogoutAt.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $expires = $LogoutAt.ToUniversalTime().AddMinutes($EstimateMinutes + $GraceMinutes).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $sql = "INSERT INTO kr_maintenance_gate (id, locked, updated_at, deploy_notice_at, deploy_logout_at, deploy_expires_at, deploy_estimate_minutes, deploy_set_by) " +
        "VALUES ('krhomebase', 0, '$now', '$now', '$logout', '$expires', $EstimateMinutes, 'deploy-script') " +
        "ON CONFLICT (id) DO UPDATE SET deploy_notice_at = excluded.deploy_notice_at, deploy_logout_at = excluded.deploy_logout_at, " +
        "deploy_expires_at = excluded.deploy_expires_at, deploy_estimate_minutes = excluded.deploy_estimate_minutes, deploy_set_by = excluded.deploy_set_by, updated_at = excluded.updated_at; " +
        (Get-AuditSql "DEPLOY_WARN" @{ logoutAt = $logout; expiresAt = $expires; estimateMinutes = $EstimateMinutes } $now)
    Invoke-GateWrite $sql
    Write-Host "Deploy window written: warning now, sign-out at $($LogoutAt.ToLocalTime().ToString('h:mm:ss tt')), opens by itself at $(([DateTime]::Parse($expires)).ToLocalTime().ToString('h:mm tt')) if this script stops." -ForegroundColor Yellow
}

<# Clears the deploy window (green). #>
function Clear-DeployWindow([string]$Why) {
    $now = Get-IsoNow
    $sql = "UPDATE kr_maintenance_gate SET deploy_notice_at = NULL, deploy_logout_at = NULL, deploy_expires_at = NULL, deploy_estimate_minutes = NULL, deploy_set_by = NULL, updated_at = '$now' WHERE id = 'krhomebase'; " +
        (Get-AuditSql "DEPLOY_CLEAR" @{ reason = $Why } $now)
    Invoke-GateWrite $sql
    Write-Host "Deploy window cleared: server status green (the API sees it within 10 seconds)." -ForegroundColor Green
}

<# Stops unless migration 034 (the deploy window columns) is applied. Read-only. #>
function Assert-DeployWindowColumns {
    $raw = Invoke-Pnpm $Api @("exec", "wrangler", "d1", "execute", $Database, "--remote", "--config", $Config, "--json", "--command", "SELECT COUNT(*) AS n FROM pragma_table_info('kr_maintenance_gate') WHERE name LIKE 'deploy_%';") -Quiet
    if ($raw -notmatch '"n":\s*5') { throw "Migration 034 is not applied (the deploy window columns are missing). Apply docs\patch-notes\repository\Migration_Patch034_11_14_deploy_window.sql first, or use pnpm deploy:hot." }
}

function Read-Pending { if (Test-Path $Pending) { return Get-Content $Pending -Raw | ConvertFrom-Json } else { return $null } }

function Save-Pending($Data) {
    if (-not (Test-Path $State)) { New-Item -ItemType Directory -Path $State | Out-Null }
    $Data | ConvertTo-Json -Depth 5 | Set-Content -Path $Pending -Encoding UTF8
}

<# Stops when the working folder has uncommitted changes (unless -AllowDirty), and returns "<short hash> <subject>". #>
function Get-CommitLabel {
    Push-Location $Repo
    try {
        $dirty = (& git status --porcelain) -join "`n"
        $label = (& git log -1 --format="%h %s") -join " "
    } finally { Pop-Location }
    if ($dirty -and -not $AllowDirty) { throw "The working folder has uncommitted changes. Commit first (the build takes the folder as it is), or add -AllowDirty.`n$dirty" }
    if ($dirty) { $label = "$label (with uncommitted changes)" }
    # Only plain characters go to wrangler's --message (it passes through cmd.exe in pnpm.cmd).
    $label = ($label -replace '[^A-Za-z0-9 ._:,()/-]', ' ') -replace '\s+', ' '
    if ($label.Length -gt 90) { $label = $label.Substring(0, 90) }
    return $label
}

function Get-Workers { switch ($Only) { "api" { return @($ApiName) } "web" { return @($WebName) } default { return @($ApiName, $WebName) } } }

<# Uploads the chosen Workers and returns @{ api; web; commit; previousApi; previousWeb } (ids of what was uploaded and what was live). #>
function Send-Release {
    $commit = Get-CommitLabel
    $release = @{ commit = $commit; uploadedAt = (Get-IsoNow); api = $null; web = $null; previousApi = $null; previousWeb = $null }
    foreach ($worker in Get-Workers) {
        if ($worker -eq $ApiName) {
            $release.previousApi = Get-LiveVersionId $ApiName
            $release.api = Send-Version $ApiName "deploy: $commit"
        } else {
            $release.previousWeb = Get-LiveVersionId $WebName
            $release.web = Send-Version $WebName "deploy: $commit"
        }
    }
    return $release
}

<# Makes the pending versions live, API first, writes last.json and prints the rollback commands. #>
function Publish-Release($Release) {
    $message = "deploy: $($Release.commit)"
    if ($Release.api) { Publish-Version $ApiName $Release.api $message }
    if ($Release.web) { Publish-Version $WebName $Release.web $message }
    if (-not (Test-Path $State)) { New-Item -ItemType Directory -Path $State | Out-Null }
    $Release | ConvertTo-Json -Depth 5 | Set-Content -Path $Last -Encoding UTF8
    Write-Host ""
    Write-Host "Live. Rollback, if needed (web first if a screen fails, the API if a route fails):" -ForegroundColor Green
    if ($Release.previousWeb) { Write-Host "  pnpm.cmd exec wrangler versions deploy $($Release.previousWeb)@100% --name $WebName --yes" }
    if ($Release.previousApi) { Write-Host "  (in apps\api) pnpm.cmd exec wrangler versions deploy $($Release.previousApi)@100% --config $Config --yes" }
}

<# Waits until the pending sign-out time, following changes to pending.json; returns $false when the deploy was cancelled. #>
function Wait-ForLogout {
    while ($true) {
        $pending = Read-Pending
        if (-not $pending) { Write-Host "`nThe pending deploy was cancelled." -ForegroundColor Yellow; return $false }
        $left = ([DateTime]::Parse($pending.logoutAt).ToUniversalTime() - [DateTime]::UtcNow).TotalSeconds
        if ($left -le 0) { Write-Host ""; return $true }
        $text = "{0}:{1:D2}" -f [int][Math]::Floor($left / 60), [int]([Math]::Floor($left) % 60)
        Write-Host -NoNewline "`rSign-out and deploy in $text  (Ctrl+C stops waiting; pnpm deploy:finish continues later)   "
        Start-Sleep -Seconds 1
    }
}

<# The end of a warn deploy: a short pause so the API's cache sees the lock, the versions go live, then green. #>
function Complete-WarnDeploy {
    $pending = Read-Pending
    Write-Host "The API is closed (maintenance). Waiting 12 seconds for every API copy to see it..." -ForegroundColor Yellow
    Start-Sleep -Seconds 12
    $pending = Read-Pending
    if (-not $pending) { throw "pending.json disappeared before the deploy; nothing was made live. Run pnpm deploy:cancel to open the API." }
    try {
        Publish-Release $pending
    } catch {
        Write-Host ""
        Write-Host "The deploy stopped: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "The API stays closed until the window ends by itself ($($pending.estimateMinutes) + $GraceMinutes minutes after sign-out)." -ForegroundColor Red
        Write-Host "Try again: pnpm deploy:finish    Open it now on whatever is live: pnpm deploy:cancel" -ForegroundColor Red
        throw
    }
    Clear-DeployWindow "deployed"
    Remove-Item $Pending -Force
}

switch ($Mode) {
    "status" {
        $pending = Read-Pending
        if ($pending) { Write-Host "Pending deploy:"; $pending | Format-List | Out-String | Write-Host } else { Write-Host "No pending deploy." }
        Write-Host "Deploy window (UTC):"
        try {
            $raw = Invoke-Pnpm $Api @("exec", "wrangler", "d1", "execute", $Database, "--remote", "--config", $Config, "--json", "--command", "SELECT deploy_notice_at, deploy_logout_at, deploy_expires_at, deploy_estimate_minutes FROM kr_maintenance_gate WHERE id = 'krhomebase';") -Quiet
            $start = $raw.IndexOf("[")
            if ($start -ge 0) { ($raw.Substring($start) | ConvertFrom-Json)[0].results | Format-List | Out-String | Write-Host }
        } catch {
            Write-Host "  not readable (is migration 034 applied?)"
        }
        Write-Host "Live: $ApiName $(Get-LiveVersionId $ApiName)"
        Write-Host "Live: $WebName $(Get-LiveVersionId $WebName)"
    }

    "cancel" {
        if (Test-Path $Pending) { Remove-Item $Pending -Force }
        Clear-DeployWindow "cancelled"
        Write-Host "Cancelled. Uploaded versions stay unused; nothing new went live."
    }

    "hot" {
        $pending = Read-Pending
        if ($pending) {
            if (-not $Force) { throw "A warn deploy is pending (sign-out at $($pending.logoutAt)). Wait for it, run pnpm deploy:cancel, or add -Force." }
            Remove-Item $Pending -Force
            Clear-DeployWindow "replaced by a hot deploy"
        }
        $release = Send-Release
        Publish-Release $release
    }

    "warn" {
        $pending = Read-Pending
        if ($pending) {
            # Joining a waiting deploy: upload, replace the pending ids, keep the countdown unless -Restart.
            $release = Send-Release
            $pending.commit = $release.commit
            $pending.uploadedAt = $release.uploadedAt
            if ($release.api) { $pending.api = $release.api }
            if ($release.web) { $pending.web = $release.web }
            if ($Restart) {
                $logoutAt = [DateTime]::UtcNow.AddMinutes($Minutes)
                $pending.logoutAt = $logoutAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                $pending.estimateMinutes = $Estimate
                Set-DeployWindow $logoutAt $Estimate
            }
            Save-Pending $pending
            Write-Host "Joined the pending deploy: these versions go live at $(([DateTime]::Parse($pending.logoutAt)).ToLocalTime().ToString('h:mm:ss tt'))." -ForegroundColor Green
            return
        }
        Assert-DeployWindowColumns
        $release = Send-Release
        $logoutAt = [DateTime]::UtcNow.AddMinutes($Minutes)
        $release.logoutAt = $logoutAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $release.estimateMinutes = $Estimate
        Save-Pending $release
        Set-DeployWindow $logoutAt $Estimate
        if (Wait-ForLogout) { Complete-WarnDeploy }
    }

    "finish" {
        $pending = Read-Pending
        if (-not $pending) {
            Clear-DeployWindow "finish without a pending deploy"
            return
        }
        if (Wait-ForLogout) { Complete-WarnDeploy }
    }
}
