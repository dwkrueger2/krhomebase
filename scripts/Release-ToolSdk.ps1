# file: scripts/Release-ToolSdk.ps1
# Builds a release of the tool kit (packages/tool-sdk) for outside developers, and optionally copies it into the
# private krhomebase-sdk repository's local clone (root script `release:tool-sdk`; tool kit 1.1.0, repository patch 67;
# the requester's decisions of Nov 20, 2026: the kit is its own version track, and the GitHub repository
# dwkrueger2/krhomebase-sdk is where developers get it).
#
#   pnpm release:tool-sdk                                   writes dist\tool-sdk\krhomebase-sdk-<version>.zip
#   pnpm release:tool-sdk -PublishTo D:\Repos\krhomebase-sdk also fills the SDK repository's clone (nothing committed)
#
# Steps:
#   1. Reads the kit's version from packages\tool-sdk\package.json (its own version track, AGENTS_01).
#   2. Builds the kit file, dist\tool-sdk\krhomebase-tool-sdk-<version>.tgz (`pnpm pack`, as `pnpm pack:tool-sdk`).
#   3. Gathers the release folder dist\tool-sdk\release\krhomebase-sdk-<version>: the kit file, README.md (the
#      developer guide), CHANGELOG.md, examples\hello-tool (without node_modules or dist, with its own copy of the kit
#      file) and api-reference\ (scripts\write-tool-sdk-api-reference.mjs: only the routes open to tools).
#   4. Checks the folder and the kit file's contents for anything that must never leave this repository: key text,
#      Stripe or webhook secrets, real client secrets or tokens, .env or .dev.vars files, folders named private.
#      One hit stops the release.
#   5. Zips the folder into dist\tool-sdk\krhomebase-sdk-<version>.zip.
#   6. With -PublishTo: checks that the folder is a clone of krhomebase-sdk, then writes README.md (the front page,
#      packages\tool-sdk\release\REPOSITORY-README.md with the version filled in), DEVELOPER-GUIDE.md, CHANGELOG.md,
#      api-reference\ and releases\krhomebase-sdk-<version>.zip into it. Older zips in releases\ are kept. It runs no
#      git command: the requester reviews, commits and pushes the clone.
#
# Writes only under dist\tool-sdk (git-ignored) and, with -PublishTo, into that clone (the one folder outside this
# checkout the requester allowed, root AGENTS.md hard rule 1). Reads no secret. Windows PowerShell 5.1 or later.

param(
    # The local clone of the krhomebase-sdk repository to fill. Left out, only the zip is built.
    [string]$PublishTo
)

$ErrorActionPreference = "Stop"
$Repo    = Split-Path -Parent $PSScriptRoot
$Kit     = Join-Path $Repo "packages\tool-sdk"
$OutRoot = Join-Path $Repo "dist\tool-sdk"
$Utf8    = New-Object System.Text.UTF8Encoding($false)

# 1. The kit's version.
$Package = Get-Content (Join-Path $Kit "package.json") -Raw | ConvertFrom-Json
$Version = $Package.version
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "[RELEASE_TOOL_SDK:46] packages\tool-sdk\package.json has no plain version (found '$Version')." }
Write-Host "Tool kit $Version (patch $($Package.patchNum), $($Package.patchDate))"

# 2. The kit file.
Push-Location $Kit
try {
    & pnpm.cmd run pack
    if ($LASTEXITCODE -ne 0) { throw "[RELEASE_TOOL_SDK:54] pnpm pack failed." }
} finally { Pop-Location }
$Tgz = Join-Path $OutRoot "krhomebase-tool-sdk-$Version.tgz"
if (-not (Test-Path $Tgz)) { throw "[RELEASE_TOOL_SDK:57] The kit file was not written: $Tgz" }

# 3. The release folder, made fresh each time.
$Name    = "krhomebase-sdk-$Version"
$Stage   = Join-Path $OutRoot "release\$Name"
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force $Stage | Out-Null
Copy-Item $Tgz $Stage
Copy-Item (Join-Path $Kit "README.md") $Stage
Copy-Item (Join-Path $Kit "CHANGELOG.md") $Stage

# The example tool, without installed packages or build output, with its own copy of the kit file (its package.json
# installs `file:./krhomebase-tool-sdk-<version>.tgz`).
$ExampleFrom = Join-Path $Kit "examples\hello-tool"
$ExampleTo   = Join-Path $Stage "examples\hello-tool"
Get-ChildItem $ExampleFrom -Recurse -File | Where-Object { $_.FullName -notmatch '\\(node_modules|dist)\\' } | ForEach-Object {
    $Target = Join-Path $ExampleTo $_.FullName.Substring($ExampleFrom.Length + 1)
    New-Item -ItemType Directory -Force (Split-Path -Parent $Target) | Out-Null
    Copy-Item $_.FullName $Target
}
Copy-Item $Tgz $ExampleTo

& node (Join-Path $Repo "scripts\write-tool-sdk-api-reference.mjs") --out (Join-Path $Stage "api-reference") --kit $Version
if ($LASTEXITCODE -ne 0) { throw "[RELEASE_TOOL_SDK:80] The API reference could not be written." }

# 4. The check. The kit file is unpacked into a scratch folder so its contents are checked too.
$Unpacked = Join-Path $OutRoot "release\_kit-contents"
if (Test-Path $Unpacked) { Remove-Item -Recurse -Force $Unpacked }
New-Item -ItemType Directory -Force $Unpacked | Out-Null
& tar.exe -xzf $Tgz -C $Unpacked
if ($LASTEXITCODE -ne 0) { throw "[RELEASE_TOOL_SDK:87] The kit file could not be unpacked for the check." }

$Forbidden = @(
    @{ Why = "a private key";                Pattern = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ Why = "a real tool client secret";    Pattern = 'krts_[A-Za-z0-9_-]{16,}' },
    @{ Why = "a real tool access token";     Pattern = 'krtt_[A-Za-z0-9_-]{16,}' },
    @{ Why = "a Stripe key";                 Pattern = '\b[sr]k_(live|test)_[A-Za-z0-9]{10,}' },
    @{ Why = "a Stripe webhook secret";      Pattern = 'whsec_[A-Za-z0-9]{10,}' },
    @{ Why = "a cloud access key";           Pattern = 'AKIA[0-9A-Z]{16}' }
)
$Problems = @()
foreach ($Folder in @($Stage, $Unpacked)) {
    Get-ChildItem $Folder -Recurse -File | ForEach-Object {
        $Relative = $_.FullName.Substring($Folder.Length + 1)
        if ($Relative -match '(^|\\)(\.env[^\\]*|\.dev\.vars[^\\]*)$' -or $Relative -match '(^|\\)private(\\|$)') {
            $Problems += "$Relative (a file that must never be shipped)"
        }
        if ($_.Extension -in @('.tgz', '.zip', '.png', '.jpg', '.ico')) { return }
        $Text = [System.IO.File]::ReadAllText($_.FullName)
        foreach ($Rule in $Forbidden) {
            if ($Text -match $Rule.Pattern) { $Problems += "$Relative (looks like $($Rule.Why))" }
        }
    }
}
Remove-Item -Recurse -Force $Unpacked
if ($Problems.Count) {
    $Problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "[RELEASE_TOOL_SDK:113] The release holds something that must not be shipped. Nothing was zipped."
}
Write-Host "Checked: no keys, secrets, .env, .dev.vars or private folders."

# 5. The zip.
$Zip = Join-Path $OutRoot "$Name.zip"
if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip
Write-Host "Wrote $Zip"

# R2 is updated by the requester after reviewing these commands. The pointer is versioned from this build and the
# API reads the ZIP's upload time and byte size from R2 object metadata.
$PointerDir  = Join-Path $OutRoot "tool-sdk"
$PointerPath = Join-Path $PointerDir "latest.json"
New-Item -ItemType Directory -Force $PointerDir | Out-Null
$Pointer = [ordered]@{
    version  = $Version
    fileName = "$Name.zip"
    key      = "tool-sdk/$Name.zip"
}
[System.IO.File]::WriteAllText($PointerPath, ($Pointer | ConvertTo-Json -Depth 3), $Utf8)

$ApiConfig = "apps/api/kr-api-wrangler.jsonc"
$Bucket = "krhomebase-media-dev"
Write-Host "R2 upload commands (not run):"
Write-Host ('pnpm.cmd exec wrangler r2 object put "{0}/tool-sdk/{1}.zip" --file "{2}" --content-type "application/zip" --remote --config "{3}"' -f $Bucket, $Name, $Zip, $ApiConfig)
Write-Host ('pnpm.cmd exec wrangler r2 object put "{0}/tool-sdk/latest.json" --file "{1}" --content-type "application/json" --remote --config "{2}"' -f $Bucket, $PointerPath, $ApiConfig)

# 6. The SDK repository's clone.
if ($PublishTo) {
    if (-not (Test-Path (Join-Path $PublishTo ".git"))) { throw "[RELEASE_TOOL_SDK:125] $PublishTo is not a git clone." }
    $Origin = (& git -C $PublishTo remote get-url origin).Trim()
    if ($Origin -notmatch 'krhomebase-sdk(\.git)?$') { throw "[RELEASE_TOOL_SDK:127] $PublishTo is a clone of '$Origin', not of krhomebase-sdk." }
    # Whole folders are compared (a trailing backslash on both), so D:\Repos\krhomebase-sdk is not taken for a folder
    # inside D:\Repos\krhomebase.
    $Target  = (Resolve-Path $PublishTo).Path.TrimEnd('\') + '\'
    $Checkout = (Resolve-Path $Repo).Path.TrimEnd('\') + '\'
    if ($Target.StartsWith($Checkout, [System.StringComparison]::OrdinalIgnoreCase)) { throw "[RELEASE_TOOL_SDK:131] -PublishTo must be outside this checkout." }

    $Released = (Get-Date).ToString("MMM d, yyyy", [System.Globalization.CultureInfo]::GetCultureInfo("en-US"))
    $Front = [System.IO.File]::ReadAllText((Join-Path $Kit "release\REPOSITORY-README.md"))
    $Front = $Front.Replace("{{VERSION}}", $Version).Replace("{{RELEASE_DATE}}", $Released)
    [System.IO.File]::WriteAllText((Join-Path $PublishTo "README.md"), $Front, $Utf8)
    Copy-Item (Join-Path $Kit "README.md") (Join-Path $PublishTo "DEVELOPER-GUIDE.md") -Force
    Copy-Item (Join-Path $Kit "CHANGELOG.md") (Join-Path $PublishTo "CHANGELOG.md") -Force
    $Reference = Join-Path $PublishTo "api-reference"
    New-Item -ItemType Directory -Force $Reference | Out-Null
    Copy-Item (Join-Path $Stage "api-reference\*") $Reference -Force
    $Releases = Join-Path $PublishTo "releases"
    New-Item -ItemType Directory -Force $Releases | Out-Null
    Copy-Item $Zip $Releases -Force
    Write-Host "Filled $PublishTo for kit $Version. Nothing is committed: review it, then commit and push that clone."
    & git -C $PublishTo status --short
}
