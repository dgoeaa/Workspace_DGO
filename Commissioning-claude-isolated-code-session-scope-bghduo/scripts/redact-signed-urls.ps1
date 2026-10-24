<#
.SYNOPSIS
    Redacts credentials from already-exported Power Automate flow definitions.

.DESCRIPTION
    A flow definition holds whatever the flow was built with, and that includes secrets nobody
    thinks of as being "in" a flow. Two classes appear in this estate:

      - Signed Power Automate trigger URLs. A flow that calls another flow embeds one, and
        possession of it is authorisation.
      - Third-party API keys pasted into HTTP actions - Google, OpenAI, OpenRouter, Hugging
        Face and anything sitting in an Authorization or api-key header. Seven flows in this
        tenant carry one.

    Redacting only the first class is what lets the second reach a repository. Both are removed
    here, and the export is left valid JSON so the flow-to-list sweep still reads it.

    scripts/export-power-automate-flows.ps1 redacts on the way out, but an export taken before
    that redaction was correct - or taken by any other tool - will still hold them. This finds
    and removes them in place, and reports what it changed rather than working silently.

    Idempotent. A file with nothing to redact is left untouched and reported as clean.

.PARAMETER Path
    Directory of .json files to clean. Defaults to docs/reference/flow-contracts/exported.

.EXAMPLE
    ./scripts/redact-signed-urls.ps1
    ./scripts/redact-signed-urls.ps1 -Path C:\somewhere\else

.NOTES
    The sig= pattern deliberately does not anchor on the character before it. Windows PowerShell
    5.1 serialises JSON with the JavaScriptSerializer, which escapes & as \u0026 - so in a file
    written by 5.1 the character before the token is '6', not '&', and a pattern anchored on
    [?&] silently matches nothing.

    Redaction is not rotation. A key that reached a file has to be rotated at the provider; a
    key that is still in a deployed flow is still live no matter what this script does to a
    copy of it.
#>

[CmdletBinding()]
param(
    [string]$Path
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Path) { $Path = Join-Path $RepoRoot 'docs/reference/flow-contracts/exported' }

if (-not (Test-Path $Path)) {
    Write-Error "Not found: $Path"
    exit 1
}

$opts = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase

# Ordered: sk-ant- and sk-or- must be tried before the bare sk- rule, or the general pattern
# claims them first and the report names the wrong provider.
$Rules = @(
    @{ Name = 'signed trigger URL';  Pattern = '(sig=)[A-Za-z0-9_%\-]{8,}';        Replacement = '${1}REDACTED' }
    @{ Name = 'Anthropic key';       Pattern = '\bsk-ant-[A-Za-z0-9_\-]{20,}';      Replacement = 'REDACTED-ANTHROPIC-API-KEY' }
    @{ Name = 'OpenRouter key';      Pattern = '\bsk-or-[A-Za-z0-9_\-]{20,}';       Replacement = 'REDACTED-OPENROUTER-API-KEY' }
    @{ Name = 'OpenAI key';          Pattern = '\bsk-[A-Za-z0-9_\-]{20,}';          Replacement = 'REDACTED-OPENAI-API-KEY' }
    @{ Name = 'Hugging Face token';  Pattern = '\bhf_[A-Za-z0-9]{20,}';             Replacement = 'REDACTED-HUGGINGFACE-TOKEN' }
    @{ Name = 'Google API key';      Pattern = '\bAIza[0-9A-Za-z_\-]{30,}';         Replacement = 'REDACTED-GOOGLE-API-KEY' }
    @{ Name = 'GitHub token';        Pattern = '\bgh[pousr]_[A-Za-z0-9]{30,}';      Replacement = 'REDACTED-GITHUB-TOKEN' }
    @{ Name = 'Slack token';         Pattern = '\bxox[baprs]-[A-Za-z0-9\-]{10,}';   Replacement = 'REDACTED-SLACK-TOKEN' }
    @{ Name = 'AWS access key id';   Pattern = '\bAKIA[0-9A-Z]{16}\b';             Replacement = 'REDACTED-AWS-ACCESS-KEY-ID' }
    # The estate's own Compose_Redacted_Queries blanks 'code' as well as 'sig' - a one-time
    # password in a captured query string is a credential for as long as it is unconsumed.
    # This script did not cover it; aligning to the stricter of the two rather than leaving
    # the repository side weaker than the flow side.
    @{ Name = 'one-time code in a query'; Pattern = '([?&]code=)[A-Za-z0-9_%\-]{4,}'; Replacement = '${1}REDACTED' }
    # Catch-all for a credential in a header whose shape this list does not otherwise know.
    @{ Name = 'auth header';
       Pattern = '("(?:Authorization|api[-_]?key|x-api-key|Ocp-Apim-Subscription-Key)"\s*:\s*")(?![^"]*REDACTED)[^"]{16,}(")';
       Replacement = '${1}REDACTED-CREDENTIAL${2}' }
)

$files = @(Get-ChildItem -Path $Path -Filter *.json -File -Recurse)
Write-Host ""
Write-Host "Scanning $($files.Count) file(s) in $Path" -ForegroundColor Cyan

$changed = 0
$total = 0

foreach ($f in $files) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    $clean = $text
    $hits = 0
    $kinds = @()

    foreach ($rule in $Rules) {
        $n = ([regex]::Matches($clean, $rule.Pattern, $opts) | Where-Object { $_.Value -notmatch 'REDACTED' }).Count
        if ($n -eq 0) { continue }
        $clean = [regex]::Replace($clean, $rule.Pattern, $rule.Replacement, $opts)
        $hits += $n
        $kinds += "$($rule.Name) x$n"
    }

    if ($hits -eq 0) { continue }
    # BOM-less UTF-8: JSON.parse rejects a leading byte-order mark outright.
    [System.IO.File]::WriteAllText($f.FullName, $clean, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("  + {0}" -f $f.Name) -ForegroundColor Green
    Write-Host ("      {0}" -f ($kinds -join ', ')) -ForegroundColor DarkGray
    $changed++
    $total += $hits
}

Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
if ($changed -eq 0) {
    Write-Host "Clean: no unredacted credentials found." -ForegroundColor Green
} else {
    Write-Host "Redacted $total credential(s) across $changed file(s)." -ForegroundColor Cyan
    Write-Host "REDACTION IS NOT ROTATION. Every key listed above is still live wherever it was" -ForegroundColor Yellow
    Write-Host "issued, and still embedded in the deployed flow. Rotate at the provider." -ForegroundColor Yellow
    Write-Host "Re-check with:" -ForegroundColor DarkGray
    Write-Host "    Select-String -Path `"$Path\*.json`" -Pattern 'sig=(?!REDACTED)' | Measure-Object | Select-Object Count"
}
Write-Host ""
