[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [switch]$Push
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location $repositoryRoot
try {
    & node scripts/check-release.mjs --version $Version
    if ($LASTEXITCODE -ne 0) { throw 'Release metadata validation failed.' }
    & git fetch origin main --tags
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch origin/main and release tags.' }
    & node scripts/check-release.mjs --version $Version --new-tag
    if ($LASTEXITCODE -ne 0) { throw 'Release tagging preflight failed.' }
    $intendedCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not capture the intended release commit.' }
    & (Join-Path $PSScriptRoot 'build-release.ps1') -Version $Version
    # Recheck after tests/build so a concurrent source edit cannot become tagged.
    & git fetch origin main --tags
    if ($LASTEXITCODE -ne 0) { throw 'Could not refresh origin/main before tagging.' }
    $currentCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $currentCommit -ne $intendedCommit) { throw 'HEAD changed while the release was being built; start release preparation again.' }
    & node scripts/check-release.mjs --version $Version --new-tag --verify-package
    if ($LASTEXITCODE -ne 0) { throw 'The repository changed during release preparation.' }
    $tag = "v$Version"
    & git tag -a $tag $intendedCommit -m "Revola Map Drawer $tag"
    if ($LASTEXITCODE -ne 0) { throw "Could not create annotated tag $tag." }
    if ($Push) {
        & git push origin "refs/tags/$tag"
        if ($LASTEXITCODE -ne 0) { throw "Tag push failed. Local $tag remains available for retry." }
        Write-Host "Pushed $tag. GitHub Actions will verify assets and create a draft release for owner review."
    }
    else { Write-Host "Created local $tag. Push it when authorized: git push origin refs/tags/$tag" }
}
finally { Pop-Location }
