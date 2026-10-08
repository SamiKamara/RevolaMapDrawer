[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$OutputDirectory,
    [string]$PackageDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot "artifacts\release\v$Version"
}
if ([string]::IsNullOrWhiteSpace($PackageDirectory)) {
    $PackageDirectory = Join-Path $repositoryRoot 'dist\RevolaMapDrawer-win32-x64'
}
Push-Location $repositoryRoot
try {
    & node scripts/check-release.mjs --version $Version --verify-assets --output-directory $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Release version or ZIP checksum verification failed.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archivePath = Join-Path $OutputDirectory "RevolaMapDrawer-$Version-win-x64.zip"
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path.TrimEnd('\', '/')
        $prefix = [IO.Path]::GetFileName($packageRoot) + '/'
        $expected = @{}
        foreach ($file in Get-ChildItem -LiteralPath $packageRoot -File -Recurse -Force) {
            $relative = $file.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
            $expected[$prefix + $relative] = $file.FullName
        }
        $seen = @{}
        foreach ($entry in $archive.Entries) {
            # Windows PowerShell's .NET Framework can emit backslash ZIP paths;
            # normalize before comparing, while still rejecting duplicate names.
            $entryName = $entry.FullName.Replace('\', '/')
            if ($entryName.EndsWith('/')) {
                if (($entryName -ne $prefix -and -not $entryName.StartsWith($prefix, [StringComparison]::Ordinal)) -or
                    $entryName.Split('/') -contains '..' -or $entryName.Split('/') -contains '.') {
                    throw "Unsafe release ZIP directory entry: $($entry.FullName)"
                }
                continue
            }
            if (-not $expected.ContainsKey($entryName) -or $seen.ContainsKey($entryName)) {
                throw "Unexpected or duplicate release ZIP entry: $($entry.FullName)"
            }
            $seen[$entryName] = $true
            $stream = $entry.Open()
            $sourceStream = [IO.File]::OpenRead($expected[$entryName])
            $algorithm = [Security.Cryptography.SHA256]::Create()
            try {
                $archiveHash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
                $sourceHash = [BitConverter]::ToString($algorithm.ComputeHash($sourceStream)).Replace('-', '').ToLowerInvariant()
            }
            finally { $algorithm.Dispose(); $stream.Dispose(); $sourceStream.Dispose() }
            if ($archiveHash -ne $sourceHash) { throw "Release ZIP file differs from verified package: $($entry.FullName)" }
        }
        if ($seen.Count -ne $expected.Count) { throw 'The release ZIP is missing packaged files.' }
        Write-Host "Verified every byte of $($seen.Count) portable ZIP files."
    }
    finally { $archive.Dispose() }
}
finally { Pop-Location }
