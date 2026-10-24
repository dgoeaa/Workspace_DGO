<#
.SYNOPSIS
    Bulk-exports Power Automate flow definitions into the shape scripts/flow-list-sweep.mjs
    reads, so the internal-operations coverage gate can be closed in one pass.

.DESCRIPTION
    WHAT THIS NEEDS, AND WHAT IT DOES NOT

    Needs:
      - The Microsoft.PowerApps.PowerShell module, installed to CurrentUser scope.
      - A sign-in as a user who OWNS or CO-OWNS the flows being exported.

    Does NOT need:
      - An Entra (Azure AD) app registration. Add-PowerAppsAccount signs in through the
        first-party client id published inside the module, so there is nothing to register,
        no client secret, and no admin consent to obtain.
      - Tenant admin, Power Platform admin, or any admin role. This uses the maker cmdlets
        (Get-Flow), never the Get-AdminFlow family. The trade-off is stated honestly under
        LIMITS below: you see your own flows, not everyone's.
      - Local administrator rights. -Scope CurrentUser installs into your profile.

    LIMITS - read these before running

      1. Get-Flow returns only flows you own or co-own. A flow owned solely by a colleague is
         invisible to this script and no amount of retrying changes that. The script names
         every target it could not find, so the gap is explicit rather than silent. Fix it by
         having the owner add you as a co-owner (Power Automate -> the flow -> Share), by having
         them run this script themselves, or by exporting that one flow by hand.
      2. Definitions are what the tenant holds right now. If a flow was edited since the last
         capture, this export is the newer truth and the sweep will say so.
      3. The PowerApps cmdlets are built for Windows PowerShell 5.1. If PowerShell 7 errors on
         import, run the same commands under `powershell.exe` instead of `pwsh`.

    WHAT IT WRITES
    One file per flow, as { workflow_identity, definition }, which is the same shape
    docs/reference/flow-contracts/recovered/ uses and which the sweep reads with no changes.
    Signed trigger tokens (`sig=`) are redacted on the way out: a flow definition can contain
    HTTP actions calling other flows by signed URL, and those are bearer credentials. Workflow
    ids are kept - they are identifiers, and the sweep checks the register against them.

.PARAMETER EnvironmentName
    The Power Platform environment, e.g. Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1.
    Omit to use the only environment you have, or to be shown the list to choose from.

.PARAMETER OutDir
    Where to write. Defaults to docs/reference/flow-contracts/exported.

.PARAMETER WorkflowId
    Export exactly these workflow ids. Use this for a flow whose display name does not match
    any target, after -ListOnly has shown you what is there.

.PARAMETER IncludeAll
    Export every flow you can see, not just the ones the coverage map still wants. Slower, and
    the right choice if you would rather sweep everything once than iterate.

.PARAMETER ListOnly
    Sign in, list what is visible with ids and display names, write nothing. Run this first.

.EXAMPLE
    Install-Module Microsoft.PowerApps.PowerShell -Scope CurrentUser -AllowClobber
    ./scripts/export-power-automate-flows.ps1 -ListOnly
    ./scripts/export-power-automate-flows.ps1
    node scripts/flow-list-sweep.mjs --write

.NOTES
    If you are an admin and would rather see every flow in the tenant regardless of ownership,
    the Get-AdminFlow cmdlet in Microsoft.PowerApps.Administration.PowerShell does that. It is
    deliberately not used here, because it requires the admin role this script was asked to
    avoid.
#>

[CmdletBinding()]
param(
    [string]$EnvironmentName,
    [string]$OutDir,
    [string[]]$WorkflowId,
    [switch]$IncludeAll,
    [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot 'docs/reference/flow-contracts/exported' }
$MapPath = Join-Path $RepoRoot 'docs/reference/flow-list-map.json'

function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Note($msg) { Write-Host "  $msg" -ForegroundColor DarkGray }

# -- module ------------------------------------------------------------------------------
if (-not (Get-Module -ListAvailable -Name Microsoft.PowerApps.PowerShell)) {
    Write-Host "Microsoft.PowerApps.PowerShell is not installed. Install it with:" -ForegroundColor Yellow
    Write-Host "    Install-Module Microsoft.PowerApps.PowerShell -Scope CurrentUser -AllowClobber" -ForegroundColor Yellow
    Write-Host "That needs no administrator rights and no app registration." -ForegroundColor DarkGray
    exit 1
}
Import-Module Microsoft.PowerApps.PowerShell -ErrorAction Stop

# -- sign in -----------------------------------------------------------------------------
# Add-PowerAppsAccount uses the module's own first-party client id. Nothing to register.
Write-Step 'Signing in to Power Platform ...'
Add-PowerAppsAccount | Out-Null

# -- environment -------------------------------------------------------------------------
# The cmdlet is Get-PowerAppEnvironment, with Get-FlowEnvironment as an alias in some module
# versions. Resolve whichever this install actually exposes rather than assuming.
$envCmd = @('Get-PowerAppEnvironment', 'Get-FlowEnvironment') |
    Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } |
    Select-Object -First 1

if (-not $EnvironmentName) {
    if (-not $envCmd) { throw 'Cannot list environments on this module version - pass -EnvironmentName explicitly.' }
    $envs = @(& $envCmd)
    if ($envs.Count -eq 1) {
        $EnvironmentName = $envs[0].EnvironmentName
        Write-Note "Environment: $EnvironmentName ($($envs[0].DisplayName))"
    }
    else {
        Write-Host "`nYou have $($envs.Count) environments. Re-run with -EnvironmentName <name>:" -ForegroundColor Yellow
        $envs | ForEach-Object { Write-Host "    $($_.EnvironmentName)   $($_.DisplayName)" }
        exit 1
    }
}
else {
    Write-Note "Environment: $EnvironmentName"
}

# -- what the coverage map still wants ---------------------------------------------------
# Targets come from the sweep's own output, so this script never needs editing as coverage
# moves - a flow that has been exported stops being asked for on the next run.
$targets = @()
if (Test-Path $MapPath) {
    $map = Get-Content $MapPath -Raw | ConvertFrom-Json
    $targets = @($map.physicalFlows | Where-Object { -not $_.covered })
    Write-Note "$($targets.Count) physical flow(s) still uncovered per $(Split-Path -Leaf $MapPath)"
}
else {
    Write-Note "No flow-list-map.json found - exporting everything visible."
    $IncludeAll = $true
}

# -- enumerate ---------------------------------------------------------------------------
Write-Step 'Reading the flows you own or co-own ...'
$flows = @(Get-Flow -EnvironmentName $EnvironmentName)
Write-Note "$($flows.Count) flow(s) visible to this account"

function Get-FlowId($f) {
    if ($f.FlowName) { return $f.FlowName }
    if ($f.Internal -and $f.Internal.name) { return $f.Internal.name }
    return $null
}
function Get-FlowTitle($f) {
    if ($f.DisplayName) { return $f.DisplayName }
    if ($f.Internal -and $f.Internal.properties -and $f.Internal.properties.displayName) { return $f.Internal.properties.displayName }
    return '(no display name)'
}

if ($ListOnly) {
    Write-Host ''
    foreach ($f in ($flows | Sort-Object { Get-FlowTitle $_ })) {
        Write-Host ("  {0}  {1}" -f (Get-FlowId $f), (Get-FlowTitle $f))
    }
    Write-Host "`nRe-run without -ListOnly to export, or pass -WorkflowId <id> for specific flows.`n"
    exit 0
}

# -- choose what to export ---------------------------------------------------------------
# $satisfiedBy maps a target's physicalFlow name to the flow id chosen for it, so the
# "still uncovered" report at the end reflects what was actually matched. Comparing only on
# workflow id would report every id-less target as still missing even when its flow had just
# been exported by name - a report that cries wolf gets ignored, and then the one target that
# really is unreachable gets ignored with it.
$wanted = @()
$satisfiedBy = @{}

if ($WorkflowId) {
    $wanted = @($flows | Where-Object { $WorkflowId -contains (Get-FlowId $_) })
}
elseif ($IncludeAll) {
    $wanted = $flows
}
else {
    foreach ($t in $targets) {
        $match = $null

        if ($t.workflowId) {
            $match = $flows | Where-Object { ("" + (Get-FlowId $_)).ToLower() -eq $t.workflowId.ToLower() } | Select-Object -First 1
        }

        # A target with no recorded workflow id can still be matched on its name - the
        # register's physicalFlow keys read like the flows do (GET_DOCS, SCAN_INTAKE, AI_CHAT).
        if (-not $match) {
            $needle = ($t.physicalFlow -replace '_', ' ')
            $match = $flows | Where-Object {
                $title = Get-FlowTitle $_
                $title -and (($title -replace '[_\-]', ' ') -like "*$needle*")
            } | Select-Object -First 1
        }

        if ($match) {
            $satisfiedBy[$t.physicalFlow] = Get-FlowId $match
            if ($wanted -notcontains $match) { $wanted += $match }
        }
    }
}

if (-not $wanted -or $wanted.Count -eq 0) {
    Write-Host "`nNothing matched. Run with -ListOnly to see what is visible, then pass -WorkflowId, or use -IncludeAll.`n" -ForegroundColor Yellow
    exit 1
}

# -- export ------------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Step "Exporting $($wanted.Count) flow(s) to $OutDir ..."

$written = New-Object System.Collections.Generic.List[object]
$skipped = New-Object System.Collections.Generic.List[object]

foreach ($f in $wanted) {
    $id = Get-FlowId $f
    $title = Get-FlowTitle $f

    try {
        $full = Get-Flow -EnvironmentName $EnvironmentName -FlowName $id
        $def = $null
        if ($full.Internal -and $full.Internal.properties) { $def = $full.Internal.properties.definition }
        if (-not $def -and $f.Internal -and $f.Internal.properties) { $def = $f.Internal.properties.definition }

        if (-not $def) {
            Write-Host "  ! $title - no definition returned" -ForegroundColor Red
            $skipped.Add([pscustomobject]@{ workflowId = $id; displayName = $title; reason = 'no definition in the API response' })
            continue
        }

        $record = [ordered]@{
            exportedBy       = 'scripts/export-power-automate-flows.ps1'
            exportedAtUtc    = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            # Get-Flow returns the flow's INTERNAL NAME - a dashed GUID - which is not the
            # 32-hex workflow id that appears in a signed trigger URL. They are two different
            # identifiers for the same flow, and recording one under the other's name would
            # put a false id into the register and make the cross-check assert against
            # nothing. Only a genuine 32-hex value is written as full_resource_id.
            workflow_identity = [ordered]@{
                internal_name    = $id
                full_resource_id = $(if ($id -match '^[0-9a-f]{32}$') { "/workflows/$id" } else { $null })
                tags             = [ordered]@{
                    flowDisplayName = $title
                    environmentName = $EnvironmentName
                }
            }
            definition       = $def
        }

        # A definition can call other flows by signed URL. Those are bearer credentials and do
        # not belong in a repository, so they are redacted here rather than at review time.
        $json = $record | ConvertTo-Json -Depth 100
        # The pattern must not depend on what precedes 'sig=', because that varies by
        # PowerShell version: 5.1 serialises JSON with the JavaScriptSerializer, which escapes
        # & as \u0026, so the character before the token is '6' and not '&'. A pattern
        # anchored on [?&] therefore redacts nothing under 5.1 while appearing to work under 7.
        # The token length floor is 8, not 20, so a short or truncated token is caught too.
        $sigPattern = '(sig=)[A-Za-z0-9_%\-]{8,}'
        $redacted = [regex]::Replace($json, $sigPattern, '${1}REDACTED', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $redactions = ([regex]::Matches($json, $sigPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count

        # '#' and '%' are legal in a filename and hostile to a URL parser: '#' opens a fragment
        # and '%' starts a percent-escape, so a name carrying either resolves to a different
        # path when any tool builds a file: URL from it. The tenant has a flow called
        # 'W#B Task Escalation', which produced a definition tests/flow-list-map.test.mjs could
        # not read. Sanitised here as well, so the hazard is not created in the first place.
        $safeTitle = ($title -replace '[\\/:*?"<>|&#%]', '_').Trim()
        $path = Join-Path $OutDir "$safeTitle`__$id`__full_definition.json"
        # Not Set-Content -Encoding UTF8: under Windows PowerShell 5.1 that writes a UTF-8 BOM,
        # and JSON.parse rejects a leading BOM outright - the sweep would fail on every file
        # this produced. UTF8Encoding($false) is BOM-less on both 5.1 and 7.
        [System.IO.File]::WriteAllText($path, $redacted, (New-Object System.Text.UTF8Encoding($false)))

        $note = if ($redactions -gt 0) { "  ($redactions signed url(s) redacted)" } else { '' }
        Write-Host "  + $title$note" -ForegroundColor Green
        $written.Add([pscustomobject]@{ workflowId = $id; displayName = $title; file = $path; redactions = $redactions })
    }
    catch {
        Write-Host "  ! $title - $($_.Exception.Message)" -ForegroundColor Red
        $skipped.Add([pscustomobject]@{ workflowId = $id; displayName = $title; reason = $_.Exception.Message })
    }
}

# -- what is still missing, named --------------------------------------------------------
$exportedIds = @($written | ForEach-Object { $_.workflowId.ToLower() })
$stillMissing = @($targets | Where-Object {
    $chosen = $satisfiedBy[$_.physicalFlow]
    if (-not $chosen) { $chosen = $_.workflowId }
    (-not $chosen) -or ($exportedIds -notcontains ("" + $chosen).ToLower())
})

Write-Host ''
Write-Host '----------------------------------------------------------' -ForegroundColor DarkGray
Write-Host "Exported: $($written.Count)   Skipped: $($skipped.Count)" -ForegroundColor Cyan

if ($stillMissing.Count -gt 0) {
    Write-Host "`nStill uncovered after this run - this account cannot see them, or they are named" -ForegroundColor Yellow
    Write-Host "differently from the register:" -ForegroundColor Yellow
    foreach ($m in $stillMissing) {
        # Statement form, not `$x = if (...) {...}` spread over lines: Windows PowerShell 5.1
        # ends the assignment at the first newline after '}' and then fails on the orphaned
        # 'elseif'. PowerShell 7 accepts the multi-line form, which is exactly why it has to be
        # avoided here - this script is documented to run under 5.1.
        $wf = 'workflow id not recorded, and no visible flow matched the name'
        if ($satisfiedBy[$m.physicalFlow]) {
            $wf = "$($satisfiedBy[$m.physicalFlow]) (matched, but the export failed)"
        }
        elseif ($m.workflowId) {
            $wf = $m.workflowId
        }
        Write-Host ("    {0,-24} {1}" -f $m.physicalFlow, $wf)
    }
    Write-Host "  Run with -ListOnly to see the display names this account CAN see, then either" -ForegroundColor DarkGray
    Write-Host "  pass -WorkflowId for the right ones, or ask their owner to co-own them to you." -ForegroundColor DarkGray
}

if ($written.Count -gt 0) {
    Write-Host "`nNext:" -ForegroundColor Cyan
    Write-Host "    node scripts/flow-list-sweep.mjs `"$OutDir`"     # footprint of what you just exported"
    Write-Host "    node scripts/flow-list-sweep.mjs --write        # fold it into the estate map"
    Write-Host "    npm run test:flowmap                            # check it holds together"
    Write-Host "  Then attribute each new file in docs/reference/internal-flow-register.json so it"
    Write-Host "  counts toward contract coverage.`n" -ForegroundColor DarkGray
}

if ($skipped.Count -gt 0) { exit 1 }
