<#
.SYNOPSIS
    Creates every SharePoint column the document portal and internal governance estates
    require but do not yet have. One pass, three sites, idempotent.

.DESCRIPTION
    Driven entirely by docs/deployment/sharepoint/portal-field-spec.json (specVersion 2.0.0).
    Nothing about a list or a field is hardcoded here - change the spec, not this file.

    This supersedes setup-sharepoint-portal.ps1 and the 07-portal-provisioning flow, both of
    which were written against specVersion 1.0. That spec named seven lists "NITDA_Portal_*"
    on NEDMS alone. The tenant holds twelve lists named "Portal <something>" spread across
    NEDMS and Global_Digital_Documents_Centre, plus DGO_AccessScopes on DGO_ECM_GOVERNANCE.
    Every lookup by the old names missed, so no run could ever reach a real list, however
    many times it was retried.

    Lists are never created. All thirteen already exist and are addressed by the GUID
    captured from the tenant, so a renamed or re-titled list still resolves and a typo can
    never produce a duplicate list. Only columns are created, and only when genuinely absent
    from the live list - the spec's capturedState is documentation, not control flow.

.PARAMETER SiteUrl
    Restrict the run to one site. Omit to do all three in one pass.

.PARAMETER ClientId
    Entra application (client) ID for the interactive sign-in. PnP.PowerShell 2.x removed the
    built-in multi-tenant app, so a first-party registration is required; see the runbook at
    docs/deployment/sharepoint/README.md. Omit only if your PnP install has a default set.

.PARAMETER VerifyOnly
    Read the live lists and print the ledger. Creates nothing. Use this to prove the estate
    is complete after a run, and to produce the sign-off evidence for the provisioning gate.

.PARAMETER WhatIf
    Report every column that would be created, without creating any.

.EXAMPLE
    ./provision-sharepoint-fields.ps1 -ClientId <guid> -WhatIf     # dry run, all sites
    ./provision-sharepoint-fields.ps1 -ClientId <guid>             # create the 85 columns
    ./provision-sharepoint-fields.ps1 -ClientId <guid> -VerifyOnly # 97/97, sign-off evidence

.NOTES
    Requires PnP.PowerShell:  Install-Module PnP.PowerShell -Scope CurrentUser
    The account signing in needs Manage Lists on each site. Site Owner is sufficient;
    tenant admin is not required.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SiteUrl,
    [string]$ClientId,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'

$SpecPath = Join-Path $PSScriptRoot '../docs/deployment/sharepoint/portal-field-spec.json'
if (-not (Test-Path $SpecPath)) {
    Write-Error "Specification not found: $SpecPath"
    exit 1
}
$Spec = Get-Content $SpecPath -Raw | ConvertFrom-Json

$script:Created = 0
$script:Present = 0
$script:Failed  = 0
$script:Ledger  = New-Object System.Collections.Generic.List[object]

function Escape-Xml([string]$s) {
    return $s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace "'", '&apos;' -replace '"', '&quot;'
}

# One formula turns the spec's stated type/required/indexed into the exact XML SharePoint
# accepts, so there is one place to read rather than 97 hand-written schema fragments.
# Name and StaticName are both set: without them SharePoint derives the internal name from
# the display name, and "Sender Name" would land as Sender_x0020_Name, which no flow reads.
function Build-FieldXml($Field) {
    $display  = Escape-Xml $Field.displayName
    $internal = Escape-Xml $Field.internalName
    $required = if ($Field.required) { "Required='TRUE'" } else { "Required='FALSE'" }
    $indexed  = if ($Field.indexed)  { " Indexed='TRUE'" } else { '' }
    $unique   = if ($Field.enforceUnique) { " EnforceUniqueValues='TRUE'" } else { '' }
    $common   = "DisplayName='$display' Name='$internal' StaticName='$internal' $required$indexed$unique"

    switch ($Field.fieldType) {
        'Text'     { return "<Field Type='Text' $common MaxLength='255' />" }
        'Number'   { return "<Field Type='Number' $common />" }
        'Boolean'  { return "<Field Type='Boolean' DisplayName='$display' Name='$internal' StaticName='$internal' $required />" }
        'DateTime' { return "<Field Type='DateTime' $common Format='DateTime' />" }
        'Note'     {
            $lines = if ($Field.numLines) { $Field.numLines } else { 6 }
            $rich  = if ($Field.richText) { 'TRUE' } else { 'FALSE' }
            return "<Field Type='Note' DisplayName='$display' Name='$internal' StaticName='$internal' $required NumLines='$lines' RichText='$rich' />"
        }
        'Choice'   {
            if (-not $Field.choices) { throw "Choice field '$($Field.internalName)' has no choices in the spec" }
            $opts = ($Field.choices | ForEach-Object { "<CHOICE>$(Escape-Xml $_)</CHOICE>" }) -join ''
            $def  = if ($Field.defaultValue) { "<Default>$(Escape-Xml $Field.defaultValue)</Default>" } else { '' }
            $fmt  = if ($Field.choiceFormat) { $Field.choiceFormat } else { 'Dropdown' }
            return "<Field Type='Choice' $common Format='$fmt'>$def<CHOICES>$opts</CHOICES></Field>"
        }
        default    { throw "Unknown fieldType '$($Field.fieldType)' for $($Field.internalName) - extend Build-FieldXml, don't guess a mapping" }
    }
}

function Invoke-ListPass($ListSpec) {
    $title = $ListSpec.listTitle
    $guid  = [Guid]$ListSpec.listGuid

    $list = Get-PnPList -Identity $guid -ErrorAction SilentlyContinue
    if (-not $list) {
        Write-Host "  ! $title - list GUID $guid not found on this site" -ForegroundColor Red
        $script:Failed += $ListSpec.fields.Count
        foreach ($f in $ListSpec.fields) {
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$f.internalName; Type=$f.fieldType; Result='LIST NOT FOUND' })
        }
        return
    }
    if ($list.Title -ne $title) {
        Write-Host "  ~ $title is titled '$($list.Title)' in the tenant - matching by GUID, spec title is stale" -ForegroundColor Yellow
    }

    Write-Host "  $title" -ForegroundColor White
    $live = @(Get-PnPField -List $guid | Select-Object -ExpandProperty InternalName)

    foreach ($f in $ListSpec.fields) {
        $name = $f.internalName

        if ($live -contains $name) {
            Write-Host "      = $name" -ForegroundColor DarkGray
            $script:Present++
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$name; Type=$f.fieldType; Result='present' })
            continue
        }

        if ($VerifyOnly) {
            Write-Host "      ! $name ($($f.fieldType)) - ABSENT" -ForegroundColor Red
            $script:Failed++
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$name; Type=$f.fieldType; Result='ABSENT' })
            continue
        }

        if (-not $PSCmdlet.ShouldProcess("$title.$name", 'Add field')) {
            Write-Host "      ? $name ($($f.fieldType)) - would create" -ForegroundColor Yellow
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$name; Type=$f.fieldType; Result='would create' })
            continue
        }

        try {
            Add-PnPFieldFromXml -List $guid -FieldXml (Build-FieldXml $f) | Out-Null
            $suffix = @()
            if ($f.required) { $suffix += 'required' }
            if ($f.indexed)  { $suffix += 'indexed'  }
            $note = if ($suffix) { ", $($suffix -join ', ')" } else { '' }
            Write-Host "      + $name ($($f.fieldType)$note)" -ForegroundColor Green
            $script:Created++
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$name; Type=$f.fieldType; Result='created' })
        }
        catch {
            Write-Host "      ! $name - $($_.Exception.Message)" -ForegroundColor Red
            $script:Failed++
            $script:Ledger.Add([pscustomobject]@{ Site=$ListSpec.site; List=$title; Field=$name; Type=$f.fieldType; Result="FAILED: $($_.Exception.Message)" })
        }
    }
}

$targets = $Spec.lists | Group-Object siteUrl
if ($SiteUrl) {
    $targets = $targets | Where-Object { $_.Name -eq $SiteUrl }
    if (-not $targets) {
        Write-Error "No list in the specification lives at $SiteUrl. Known sites: $(($Spec.sites | ForEach-Object { $_.url }) -join ', ')"
        exit 1
    }
}

$mode = if ($VerifyOnly) { 'Verifying' } else { 'Provisioning' }
Write-Host ""
Write-Host "$mode $($Spec.totals.fields) columns across $($Spec.totals.lists) lists (spec $($Spec.specVersion))" -ForegroundColor Cyan

foreach ($group in $targets) {
    Write-Host ""
    Write-Host "-- $($group.Name)" -ForegroundColor Cyan
    $connect = @{ Url = $group.Name; Interactive = $true }
    if ($ClientId) { $connect.ClientId = $ClientId }
    Connect-PnPOnline @connect

    foreach ($list in ($group.Group | Sort-Object listOrder)) { Invoke-ListPass $list }

    Disconnect-PnPOnline
}

$ReportPath = Join-Path $PSScriptRoot '../sharepoint-field-ledger.csv'
$script:Ledger | Export-Csv -Path $ReportPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
if ($VerifyOnly) {
    Write-Host "Present: $script:Present   Absent: $script:Failed" -ForegroundColor Cyan
} else {
    Write-Host "Created: $script:Created   Already present: $script:Present   Failed: $script:Failed" -ForegroundColor Cyan
}
Write-Host "Ledger written to $ReportPath" -ForegroundColor DarkGray

if ($script:Failed -gt 0) {
    if ($VerifyOnly) {
        Write-Host "The estate is incomplete. Re-run without -VerifyOnly to create what is missing." -ForegroundColor Red
    } else {
        Write-Host "One or more columns failed. This script is idempotent - fix the cause and re-run." -ForegroundColor Red
    }
    exit 1
}
Write-Host "Estate complete: $($Spec.totals.fields)/$($Spec.totals.fields) columns present." -ForegroundColor Green
