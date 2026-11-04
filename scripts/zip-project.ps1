# ============================================================
#  BrewLite - Auto zip du an (bo node_modules, build, .git...)
#  Dung boi scripts\zip-project.bat
# ============================================================

# Tat progress bar: tranh crash tien trinh khi chay khong co console day du
$ProgressPreference = 'SilentlyContinue'

# Thu muc goc du an = thu muc cha cua scripts\
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectName = Split-Path $root -Leaf
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$outDir = Join-Path $root 'outputs'
if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}
$zip = Join-Path $outDir "$projectName-$stamp.zip"

Write-Host ''
Write-Host '============================================================'
Write-Host " Dong goi du an: $projectName"
Write-Host " Thu muc goc   : $root"
Write-Host " File zip      : $zip"
Write-Host '============================================================'
Write-Host ''

# Thu muc loai bo (khop o bat ky cap nao) - cat nhanh truoc khi di vao
$excludeDirs = @(
    'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
    '.tmp', 'tmp', '.pnpm-store', '.turbo', 'playwright-report',
    'test-results', 'outputs', '.idea', '.vscode'
)

# File loai bo theo pattern
$excludeFiles = @('*.log', '*.tsbuildinfo', '*.db', '*.db-journal', '.DS_Store', 'Thumbs.db', '.env', '.env.*')

# File luon giu lai du khop pattern loai bo
$keepFiles = @('.env.example')

Write-Host ' Dang quet file (bo qua thu muc nang)...'

# Duyet thu cong theo kieu prune: khong di vao $excludeDirs
$files = New-Object System.Collections.Generic.List[string]
$stack = New-Object System.Collections.Generic.Stack[string]
$stack.Push($root)

while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    $children = Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue
    foreach ($c in $children) {
        if ($c.PSIsContainer) {
            if ($excludeDirs -contains $c.Name) { continue }
            # Bo qua reparse point (symlink/junction) de tranh vong lap
            if ($c.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            $stack.Push($c.FullName)
        }
        else {
            $name = $c.Name
            $skip = $false
            if ($keepFiles -notcontains $name) {
                foreach ($pat in $excludeFiles) {
                    if ($name -like $pat) { $skip = $true; break }
                }
            }
            if (-not $skip) { $files.Add($c.FullName) }
        }
    }
}

Write-Host (" So file se dong goi: " + $files.Count)

if ($files.Count -eq 0) {
    Write-Host ' [LOI] Khong tim thay file nao de dong goi.'
    exit 1
}

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

Write-Host ' Dang nen...'

# Nen truc tiep bang .NET ZipFile - khong can copy sang thu muc tam
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $rootPrefixLen = $root.Length
    foreach ($full in $files) {
        # Duong dan tuong doi trong zip, dung dau '/'
        $entryName = $full.Substring($rootPrefixLen).TrimStart('\').Replace('\', '/')
        try {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $full, $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        catch {
            Write-Host ("  [BO QUA] Khong doc duoc: " + $entryName)
        }
    }
}
finally {
    $archive.Dispose()
}

$size = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 2)

Write-Host ''
Write-Host '============================================================'
Write-Host " XONG! Kich thuoc: $size MB"
Write-Host " File: $zip"
Write-Host '============================================================'
