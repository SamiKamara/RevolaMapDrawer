[CmdletBinding()]
param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$executable = Join-Path $projectRoot 'dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe'
$desktopDirectory = [Environment]::GetFolderPath('DesktopDirectory')
$shortcutPath = Join-Path $desktopDirectory 'RevolaMapDrawer - testattava versio.lnk'
$iconLocation = "$executable,0"

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'No packaged application exists. Run npm run package before creating a test shortcut.'
}
if (-not (Test-Path -LiteralPath $desktopDirectory -PathType Container)) {
    throw "The Windows desktop directory does not exist: $desktopDirectory"
}

$shell = New-Object -ComObject WScript.Shell
try {
    if (-not $VerifyOnly) {
        # Keep the machine-specific .lnk outside the source tree. Its stable target
        # is replaced by every successful package build; no runtime server is needed.
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $executable
        $shortcut.Arguments = ''
        $shortcut.WorkingDirectory = $projectRoot
        $shortcut.IconLocation = $iconLocation
        $shortcut.Description = 'Start the latest packaged Revola Map Drawer test build.'
        $shortcut.WindowStyle = 1
        $shortcut.Save()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
    }
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
        throw "The desktop test shortcut is missing: $shortcutPath"
    }
    # Reopen the saved link so verification checks disk contents, not assigned values.
    $verified = $shell.CreateShortcut($shortcutPath)
    try {
        if ($verified.TargetPath -ine $executable -or
            $verified.WorkingDirectory -ine $projectRoot -or
            $verified.Arguments -ne '' -or
            $verified.IconLocation -ine $iconLocation) {
            throw 'The shortcut does not point to the current packaged application. Run npm run shortcut to repair it.'
        }
        foreach ($referencedPath in @($verified.TargetPath, $verified.WorkingDirectory)) {
            if (-not (Test-Path -LiteralPath $referencedPath)) {
                throw "The shortcut references a missing path: $referencedPath"
            }
        }
        [pscustomobject]@{
            Shortcut = $shortcutPath
            Target = $verified.TargetPath
            Arguments = $verified.Arguments
            WorkingDirectory = $verified.WorkingDirectory
            Icon = $verified.IconLocation
            Verified = $true
        } | ConvertTo-Json
    } finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($verified)
    }
} finally {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}
