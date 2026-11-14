# file: scripts/Get-Feedback.ps1
# Reads one Homebase Feedback request (FB-0012) from the live `krhomebase` database and writes it as Markdown for
# Claude Code to read (plan docs/12_Homebase_Feedback_Plan.md, stage F6, section 3.6; root script `feedback:get`).
#
#   pnpm feedback:get -Number 12            writes feedback-cache\FB-0012\FB-0012.md
#   pnpm feedback:get -Number FB-0012       the same
#
# Read-only: it runs one `wrangler d1 execute ... --command` of SELECT statements (AGENTS_06 and the root AGENTS.md
# hard rule 4 allow read-only commands). It never writes to the database; a status change is made in the viewer
# (stage F5). Image download from the R2 bucket kr-homebase-feedback comes with stage F3; until then the images are
# only listed.
#
# The output folder `feedback-cache\` is git-ignored: a request can hold client details, so it is treated like
# `snapshots\` and never committed. The request number is checked to be digits before it goes into the SQL.
#
# Run from anywhere; the script finds the repository from its own folder. Windows PowerShell 5.1 or later.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Number,
    # The database to read; `krhomebase` unless told otherwise.
    [string]$Database = "krhomebase"
)

$ErrorActionPreference = "Stop"
$Repo   = Split-Path -Parent $PSScriptRoot
$Config = Join-Path $Repo "apps\api\kr-api-wrangler.jsonc"

# FB-0012, fb-12 or 12 -> 12. Anything else stops here, so only digits ever reach the SQL.
if ($Number -notmatch '^(?i:FB-?)?0*(\d{1,9})$') {
    Write-Error "Not a feedback number: '$Number'. Use 12 or FB-0012."
}
$Value = [int64]$Matches[1]
if ($Value -lt 1) { Write-Error "Not a feedback number: '$Number'." }
$Code = "FB-{0:D4}" -f $Value

<#
.SYNOPSIS
Runs read-only SQL against the database through wrangler and returns the result sets (one per statement).
#>
function Invoke-ReadOnlyQuery([string]$Sql) {
    if ($Sql -match '(?i)\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA)\b') { throw "Get-Feedback runs SELECT statements only." }
    Push-Location $Repo
    # Windows PowerShell 5.1 turns every line a program writes to stderr into an error, which "Stop" would end the
    # script on (wrangler and pnpm write notices there). Both streams are read as plain text instead.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $raw = & pnpm.cmd exec wrangler d1 execute $Database --remote --config $Config --json --command $Sql 2>&1 | ForEach-Object { "$_" } | Out-String
    } finally {
        $ErrorActionPreference = $previous
        Pop-Location
    }
    # wrangler can print notices before the JSON; the JSON reply starts at the first line that opens an array.
    $start = $raw.IndexOf("[`n")
    if ($start -lt 0) { $start = $raw.IndexOf("[`r`n") }
    if ($start -lt 0) { $start = $raw.IndexOf("[") }
    if ($start -lt 0) { throw "wrangler did not answer with JSON:`n$raw" }
    $json = $raw.Substring($start)
    try {
        return ,($json | ConvertFrom-Json)
    } catch {
        if ($raw -match 'no such table: homebase_feedback') { throw "The feedback tables do not exist yet. Apply migration 033 first (docs/patch-notes/repository/Migration_Patch033_11_13_homebase_feedback.sql)." }
        throw "wrangler's reply could not be read:`n$raw"
    }
}

<# A person's name: preferred name, else first and last name, else email, else the id. #>
function Get-PersonLabel($Row, [string]$Prefix, [string]$Fallback) {
    $preferred = $Row."$($Prefix)_preferred_name"
    if ($preferred) { return $preferred.Trim() }
    $full = (@($Row."$($Prefix)_first_name", $Row."$($Prefix)_last_name") | Where-Object { $_ }) -join ' '
    if ($full) { return $full.Trim() }
    if ($Row."$($Prefix)_email") { return $Row."$($Prefix)_email" }
    return $Fallback
}

<# A value for a Markdown table cell: a dash when empty, pipes escaped, one line. #>
function Format-Cell($Value) {
    if ($null -eq $Value -or "$Value" -eq '') { return '-' }
    return ("$Value" -replace '\|', '\|' -replace '\r?\n', ' ')
}

$sql = @"
SELECT f.id, f.number, f.kind, f.title, f.body, f.status, f.priority, f.submitted_by_user_id, f.submitter_role,
       f.page_address, f.section_id, f.open_item, f.page_title, f.web_version, f.deployment_id, f.deployment_time,
       f.window_width, f.window_height, f.theme, f.created_at, f.updated_at,
       su.email AS submitter_email, si.preferred_name AS submitter_preferred_name, si.first_name AS submitter_first_name, si.last_name AS submitter_last_name
  FROM homebase_feedback f LEFT JOIN user su ON su.id = f.submitted_by_user_id LEFT JOIN individual si ON si.id = su.individual_id
 WHERE f.number = $Value;
SELECT m.attribute, m.value, m.found_at_capture, m.box_json
  FROM homebase_feedback_marker m JOIN homebase_feedback f ON f.id = m.feedback_id
 WHERE f.number = $Value ORDER BY m.sort_order, m.id;
SELECT n.note_type, n.body, n.from_value, n.to_value, n.created_at,
       au.email AS author_email, ai.preferred_name AS author_preferred_name, ai.first_name AS author_first_name, ai.last_name AS author_last_name, n.author_user_id
  FROM homebase_feedback_note n JOIN homebase_feedback f ON f.id = n.feedback_id
  LEFT JOIN user au ON au.id = n.author_user_id LEFT JOIN individual ai ON ai.id = au.individual_id
 WHERE f.number = $Value ORDER BY n.created_at, n.rowid;
SELECT i.id, i.r2_key, i.byte_size, i.width, i.height, i.created_at
  FROM homebase_feedback_image i JOIN homebase_feedback f ON f.id = i.feedback_id
 WHERE f.number = $Value ORDER BY i.created_at, i.id;
"@ -replace '\r?\n', ' '

Write-Host "Reading $Code from $Database (read-only)..."
$sets = Invoke-ReadOnlyQuery $sql
$request = @($sets[0].results)[0]
if ($null -eq $request) { Write-Error "$Code was not found in $Database." }
$markers = @($sets[1].results)
$notes   = @($sets[2].results)
$images  = @($sets[3].results)

# The Markdown Claude reads: the text first, then the markers, the captured page and the notes.
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# ${Code}: $($request.title)")
$lines.Add("")
$lines.Add("<small>Read $(Get-Date -Format 'MMM d, yyyy h:mmtt') by scripts/Get-Feedback.ps1 from $Database (read-only). Git-ignored; never commit.</small>")
$lines.Add("")
$lines.Add("| Field | Value |")
$lines.Add("|---|---|")
$lines.Add("| Kind | $(Format-Cell $request.kind) |")
$lines.Add("| Status | $(Format-Cell $request.status) |")
$lines.Add("| Priority | $(Format-Cell $request.priority) |")
$lines.Add("| Sent by | $(Format-Cell (Get-PersonLabel $request 'submitter' $request.submitted_by_user_id)) ($(Format-Cell $request.submitter_role)) |")
$lines.Add("| Sent | $(Format-Cell $request.created_at) |")
$lines.Add("| Changed | $(Format-Cell $request.updated_at) |")
$lines.Add("")
$lines.Add("## Request")
$lines.Add("")
$lines.Add($request.body)
$lines.Add("")
$lines.Add("## Markers named in the text")
$lines.Add("")
if ($markers.Count -eq 0) {
    $lines.Add("None.")
} else {
    $lines.Add("Search the code for each marker (for example ``rg -F 'data-kr-element=""related-contacts-list""' apps/web``).")
    $lines.Add("")
    $lines.Add("| Marker | On the page when sent | Box (x, y, width, height in CSS px) |")
    $lines.Add("|---|---|---|")
    foreach ($marker in $markers) {
        $box = '-'
        if ($marker.box_json) {
            $b = $marker.box_json | ConvertFrom-Json
            $box = "$($b.x), $($b.y), $($b.width), $($b.height)"
        }
        $found = if ([int]$marker.found_at_capture -eq 1) { 'yes' } else { 'no' }
        $lines.Add("| ``$($marker.attribute)=""$($marker.value)""`` | $found | $box |")
    }
}
$lines.Add("")
$lines.Add("## Captured page")
$lines.Add("")
$lines.Add("Compare the web version and deployment with ``git log`` and docs/04_Deployed_Architecture.md.")
$lines.Add("")
$lines.Add("| Field | Value |")
$lines.Add("|---|---|")
$lines.Add("| Address | $(Format-Cell $request.page_address) |")
$lines.Add("| Section | $(Format-Cell $request.section_id) |")
$lines.Add("| Open item | $(Format-Cell $request.open_item) |")
$lines.Add("| Page | $(Format-Cell $request.page_title) |")
$lines.Add("| Web version | $(Format-Cell $request.web_version) |")
$lines.Add("| Deployment id | $(Format-Cell $request.deployment_id) |")
$lines.Add("| Deployment time | $(Format-Cell $request.deployment_time) |")
$windowSize = if ($request.window_width) { "$($request.window_width) x $($request.window_height)" } else { $null }
$lines.Add("| Window | $(Format-Cell $windowSize) |")
$lines.Add("| Theme | $(Format-Cell $request.theme) |")
$lines.Add("")
$lines.Add("## Images")
$lines.Add("")
if ($images.Count -eq 0) {
    $lines.Add("None. (Screenshots come with stage F3.)")
} else {
    $lines.Add("Listed only; downloading them comes with stage F3.")
    $lines.Add("")
    foreach ($image in $images) { $lines.Add("- ``$($image.r2_key)`` ($($image.width) x $($image.height), $($image.byte_size) bytes, $($image.created_at))") }
}
$lines.Add("")
$lines.Add("## Notes")
$lines.Add("")
if ($notes.Count -eq 0) {
    $lines.Add("None.")
} else {
    foreach ($note in $notes) {
        $who = Get-PersonLabel $note 'author' $note.author_user_id
        $what = switch ($note.note_type) {
            'status_change'   { "Status $($note.from_value) to $($note.to_value)" }
            'priority_change' { "Priority $($note.from_value) to $($note.to_value)" }
            default           { '' }
        }
        $text = (@($what, $note.body) | Where-Object { $_ }) -join ': '
        $lines.Add("- $($note.created_at), ${who}: $text")
    }
}
$lines.Add("")

$folder = Join-Path $Repo "feedback-cache\$Code"
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$file = Join-Path $folder "$Code.md"
# UTF-8 without a byte order mark, so every tool reads it the same.
[System.IO.File]::WriteAllText($file, ($lines -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $file"
