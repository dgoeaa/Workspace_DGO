<#
.SYNOPSIS
    Write a patched definition back to a flow in place, over the same API the designer uses.

.DESCRIPTION
    WHY THIS EXISTS
    Exporting a package, patching definition.json and importing it back is the obvious route and
    it does not work here: legacy package import refuses to UPDATE the flow and offers only
    "save as a new flow". A new flow is a new trigger URL, and the portal's config holds the old
    one, so that offer has to be declined.

    This does what the designer does when you press Save: PATCH the flow's definition on
    api.flow.microsoft.com. The flow keeps its id, its trigger URL, its owners, its run history
    and its connections, because it is the same flow - only its definition changes.

    WHAT IT NEEDS, AND WHAT IT DOES NOT
    Needs:
      - Microsoft.PowerApps.PowerShell, and a prior Add-PowerAppsAccount in this session.
      - Ownership or co-ownership of the flow. The same access the exporter already uses.
    Does NOT need:
      - An Entra app registration, a client secret, or admin consent.
      - Tenant admin or Power Platform admin. This is the maker API, not the admin API.

    SAFETY
      - -WhatIf is the default posture: nothing is sent unless -Apply is given.
      - The current definition is written to a .before.json beside the patch first, every time,
        so a bad result can be put back with this same script.
      - A malformed definition is refused by the service with a validation error. It does not
        half-apply: the flow either takes the new definition or keeps the old one.

.PARAMETER EnvironmentName
    The environment id, e.g. Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1

.PARAMETER FlowId
    The flow's internal name - the dashed GUID in its designer URL.

.PARAMETER DefinitionPath
    A JSON file holding either the bare Logic App definition, or { definition: ... },
    or the { workflow_identity, definition } shape this repository's exporter writes.

.EXAMPLE
    .\scripts\update-flow-definition.ps1 -EnvironmentName Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 `
        -FlowId 3b69aa71-ffed-4956-9d20-2aa3021a8da0 -DefinitionPath .\pvc-patched-definition.json

    Shows what would be sent, and writes the current definition to
    pvc-patched-definition.before.json. Add -Apply to actually send it.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $EnvironmentName,
    [Parameter(Mandatory = $true)] [string] $FlowId,
    [Parameter(Mandatory = $true)] [string] $DefinitionPath,
    [switch] $Apply
)

$ErrorActionPreference = 'Stop'

function Write-Section([string] $Text) {
    Write-Host ''
    Write-Host $Text
    Write-Host ('-' * 58)
}

Write-Section 'Reading the patched definition'

if (-not (Test-Path -LiteralPath $DefinitionPath)) {
    throw "No file at $DefinitionPath"
}

# PowerShell 5.1 reads a BOM-less UTF-8 file as ANSI, which turns any non-ASCII byte into
# mojibake and can break an expression. Read the bytes and decode as UTF-8 explicitly.
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $DefinitionPath))
$text = [System.Text.Encoding]::UTF8.GetString($bytes) -replace "^\xEF\xBB\xBF", ''
$doc = $text | ConvertFrom-Json

$definition = $null
if ($doc.PSObject.Properties.Name -contains 'definition') { $definition = $doc.definition }
elseif ($doc.PSObject.Properties.Name -contains 'properties' -and $doc.properties.PSObject.Properties.Name -contains 'definition') { $definition = $doc.properties.definition }
else { $definition = $doc }

if (-not $definition.actions) { throw "That file has no definition.actions - is it a flow definition?" }

$actionCount = ($definition.actions.PSObject.Properties | Measure-Object).Count
Write-Host ("  {0} top-level action(s)" -f $actionCount)

Write-Section 'Signing in'

Import-Module Microsoft.PowerApps.PowerShell -DisableNameChecking -ErrorAction Stop | Out-Null

$audience = 'https://service.flow.microsoft.com/'
$token = $null
try { $token = Get-JwtToken -Audience $audience } catch { $token = $null }
if (-not $token -and $global:currentSession) {
    foreach ($key in @('flowToken', 'powerAppsToken')) {
        if ($global:currentSession.PSObject.Properties.Name -contains $key -and $global:currentSession.$key) {
            $token = $global:currentSession.$key
            break
        }
    }
}
if (-not $token) {
    throw "No access token. Run Add-PowerAppsAccount first, in this same PowerShell window."
}

$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$base = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$EnvironmentName/flows/$FlowId"
$uri = "$base`?api-version=2016-11-01"

Write-Section 'Reading the flow as it stands now'

$current = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
Write-Host ("  flow          {0}" -f $current.properties.displayName)
Write-Host ("  state         {0}" -f $current.properties.state)
$currentCount = ($current.properties.definition.actions.PSObject.Properties | Measure-Object).Count
Write-Host ("  actions       {0} at the top level" -f $currentCount)

$backupPath = [System.IO.Path]::ChangeExtension((Resolve-Path -LiteralPath $DefinitionPath), 'before.json')
$backupText = $current.properties.definition | ConvertTo-Json -Depth 100
# Windows PowerShell's -Encoding UTF8 writes a byte-order mark, and JSON.parse rejects a BOM.
# This file is read back by node, so write it without one.
[System.IO.File]::WriteAllText($backupPath, $backupText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("  saved the current definition to {0}" -f $backupPath)

if (-not $Apply) {
    Write-Section 'Nothing sent'
    Write-Host "  This was a dry run. It would replace $currentCount action(s) with $actionCount."
    Write-Host "  Re-run with -Apply to send it."
    Write-Host ''
    return
}

Write-Section 'Sending the new definition'

# ConvertTo-Json in Windows PowerShell escapes & as &, which is valid JSON and is read back
# correctly by the service, but -Depth must be generous or nested actions are truncated to the
# string "System.Object[]" and the flow is silently flattened.
$body = @{ properties = @{ definition = $definition } } | ConvertTo-Json -Depth 100 -Compress

try {
    $result = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body
    $newCount = ($result.properties.definition.actions.PSObject.Properties | Measure-Object).Count
    Write-Host ("  accepted. The flow now has {0} top-level action(s)." -f $newCount)
    Write-Host ''
    Write-Host '  The flow kept its id, its trigger URL, its owners and its run history.'
    Write-Host '  Re-export it to confirm, then run: node scripts/verify-portal-wiring.mjs'
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host '  REFUSED. Nothing changed - the flow still holds the definition in the .before.json above.'
    Write-Host ''
    $response = $_.Exception.Response
    if ($response) {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $detail = $reader.ReadToEnd()
        Write-Host $detail
    }
    else {
        Write-Host $_.Exception.Message
    }
    Write-Host ''
    throw
}
