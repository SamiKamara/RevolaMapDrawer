[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Windows x64 release verification must run on Windows.' }
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'artifacts\release'))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path $releaseRoot "v$Version" }
$releaseDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $releaseDirectory.StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release output must be a child directory of artifacts/release.'
}
# Refuse junction/symlink targets before clearing this one generated directory.
$checkedPath = $releaseDirectory
while ($checkedPath.Length -ge $repositoryRoot.Length) {
    if ((Test-Path -LiteralPath $checkedPath) -and
        ((Get-Item -LiteralPath $checkedPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Release output cannot use a junction or symbolic link: $checkedPath"
    }
    if ($checkedPath -eq $repositoryRoot) { break }
    $checkedPath = [IO.Path]::GetDirectoryName($checkedPath)
}

function Invoke-Npm([string[]]$Arguments) {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') failed." }
}

Push-Location $repositoryRoot
try {
    & node scripts/check-release.mjs --version $Version --output-directory $releaseDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Release metadata validation failed.' }
    Invoke-Npm -Arguments @('ci')
    Invoke-Npm -Arguments @('test')
    Invoke-Npm -Arguments @('run', 'test:ui')
    $isContinuousIntegration = $env:CI -ieq 'true' -or $env:GITHUB_ACTIONS -ieq 'true'
    if ($isContinuousIntegration) {
        # The maintained package script still runs; only npm's postpackage desktop
        # hook is skipped on hosted runners. Local packaging always refreshes it.
        Invoke-Npm -Arguments @('run', 'package', '--ignore-scripts')
    }
    else { Invoke-Npm -Arguments @('run', 'package') }
    Invoke-Npm -Arguments @('run', 'test:packaged')
    & node scripts/check-release.mjs --version $Version --verify-package
    if ($LASTEXITCODE -ne 0) { throw 'Packaged runtime/source verification failed.' }

    if (Test-Path -LiteralPath $releaseDirectory) { Remove-Item -LiteralPath $releaseDirectory -Recurse -Force }
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $packageDirectory = Join-Path $repositoryRoot 'dist\RevolaMapDrawer-win32-x64'
    $zipPath = Join-Path $releaseDirectory "RevolaMapDrawer-$Version-win-x64.zip"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($packageDirectory, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
    $zipStream = [IO.File]::OpenRead($zipPath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $checksum = [BitConverter]::ToString($algorithm.ComputeHash($zipStream)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $zipStream.Dispose() }
    "$checksum  $([IO.Path]::GetFileName($zipPath))" | Set-Content -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS.txt') -Encoding Ascii
    & node scripts/check-release.mjs --version $Version --write-notes --output-directory $releaseDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Release notes generation failed.' }
    & (Join-Path $PSScriptRoot 'verify-release-archive.ps1') -Version $Version -OutputDirectory $releaseDirectory
    $extractionDirectory = Join-Path $releaseDirectory 'extracted'
    [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractionDirectory)
    Invoke-Npm -Arguments @('run', 'test:portable', '--', '--directory', (Join-Path $extractionDirectory 'RevolaMapDrawer-win32-x64'))
    # This exact absolute child was just created beneath the checked release root.
    Remove-Item -LiteralPath $extractionDirectory -Recurse -Force
    Write-Host "Verified release assets: $releaseDirectory"
    Get-Item -LiteralPath $zipPath, (Join-Path $releaseDirectory 'SHA256SUMS.txt')
}
finally { Pop-Location }
