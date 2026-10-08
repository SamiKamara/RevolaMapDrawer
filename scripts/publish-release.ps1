[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repository = 'SamiKamara/RevolaMapDrawer'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path $repositoryRoot "artifacts\release\v$Version" }
Push-Location $repositoryRoot
try {
    & node scripts/check-release.mjs --version $Version --existing-tag --verify-package --verify-assets --write-notes --output-directory $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Release source/tag/package validation failed.' }
    & (Join-Path $PSScriptRoot 'verify-release-archive.ps1') -Version $Version -OutputDirectory $OutputDirectory
    $tag = "v$Version"
    $zip = Join-Path $OutputDirectory "RevolaMapDrawer-$Version-win-x64.zip"
    $checksums = Join-Path $OutputDirectory 'SHA256SUMS.txt'
    $notes = Join-Path $OutputDirectory 'release-notes.md'
    $existing = & gh release view $tag --repo $repository --json isDraft,tagName,url 2>$null
    if ($LASTEXITCODE -eq 0) {
        $release = ($existing -join "`n") | ConvertFrom-Json
        if (-not $release.isDraft -or $release.tagName -ne $tag) {
            throw 'Refusing to replace assets or notes on a published release. Use a new patch version.'
        }
        & gh release edit $tag --repo $repository --draft --latest=false --verify-tag --title "Revola Map Drawer $tag" --notes-file $notes
        if ($LASTEXITCODE -ne 0) { throw 'Could not update draft release notes.' }
        & gh release upload $tag $zip $checksums --repo $repository --clobber
        if ($LASTEXITCODE -ne 0) { throw 'Could not upload verified assets to the draft.' }
    }
    else {
        & gh release create $tag $zip $checksums --repo $repository --draft --latest=false --verify-tag --title "Revola Map Drawer $tag" --notes-file $notes
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the draft release. Check GitHub CLI authentication and repository permissions.' }
    }
    $result = & gh release view $tag --repo $repository --json isDraft,tagName,url
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the resulting draft.' }
    $verified = ($result -join "`n") | ConvertFrom-Json
    if (-not $verified.isDraft -or $verified.tagName -ne $tag) { throw 'The resulting release is not the expected draft.' }
    Write-Host "Draft ready for owner review: $($verified.url)"
}
finally { Pop-Location }
