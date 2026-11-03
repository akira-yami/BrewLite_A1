# Biên dịch báo cáo bằng XeLaTeX; không dùng shell-escape.
$ErrorActionPreference = 'Stop'
$engineCommand = Get-Command xelatex -ErrorAction SilentlyContinue
$enginePath = if ($engineCommand) { $engineCommand.Source } else {
    Join-Path $env:LOCALAPPDATA 'Programs\MiKTeX\miktex\bin\x64\xelatex.exe'
}
if (-not (Test-Path -LiteralPath $enginePath)) {
    throw 'Khong tim thay XeLaTeX. Cai TeX Live/MiKTeX va them xelatex vao PATH.'
}
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Path 'build' -Force | Out-Null
    for ($pass = 1; $pass -le 3; $pass++) {
        Write-Host "XeLaTeX: luot $pass/3"
        & $enginePath -no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error -output-directory=build main.tex
        if ($LASTEXITCODE -ne 0) {
            throw "Bien dich that bai o luot $pass. Xem build/main.log."
        }
    }
    Write-Host (Join-Path $PSScriptRoot 'build\main.pdf')
} finally {
    Pop-Location
}
