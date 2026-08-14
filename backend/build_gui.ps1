$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Icon = Join-Path $PSScriptRoot "resources\ico.ico"
$ExeName = "FCX$([char]0x540E)$([char]0x7AEF)"

if (-not (Test-Path -LiteralPath $Icon)) {
    throw "Missing icon: $Icon"
}

Push-Location $Root
try {
    python -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --windowed `
        --name $ExeName `
        --icon $Icon `
        --paths (Join-Path $Root "backend") `
        --additional-hooks-dir (Join-Path $Root "pyinstaller_hooks") `
        --add-data "$Icon;resources" `
        (Join-Path $PSScriptRoot "gui.py")
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
