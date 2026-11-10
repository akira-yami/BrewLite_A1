<#
.SYNOPSIS
    Script chuyển đổi môi trường cấu hình linh hoạt giữa LOCAL và PRODUCTION (RAILWAY) cho BrewLite.
.EXAMPLE
    .\scripts\switch-env.ps1 local
    .\scripts\switch-env.ps1 prod
    .\scripts\switch-env.ps1 status
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("local", "prod", "railway", "status")]
    [string]$Target = "status",

    [Parameter(Position = 1)]
    [string]$PublicDbUrl = ""
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path "$PSScriptRoot\..").Path
$RootEnv = Join-Path $RootDir ".env"
$ApiEnv = Join-Path $RootDir "apps\api\.env"
$WebEnvLocal = Join-Path $RootDir "apps\web\.env.local"

function Show-Status {
    Write-Host "`n================ TRẠNG THÁI CẤU HÌNH BREWLITE ================" -ForegroundColor Cyan
    
    if (Test-Path $ApiEnv) {
        $apiLines = Get-Content $ApiEnv
        $dbLine = ($apiLines | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=", ""
        if ($dbLine -match "localhost|127\.0\.0\.1|brewlite-postgres") {
            Write-Host " [Backend DB]   : " -NoNewline; Write-Host "LOCAL (Docker PostgreSQL)" -ForegroundColor Green
        } elseif ($dbLine -match "railway") {
            Write-Host " [Backend DB]   : " -NoNewline; Write-Host "RAILWAY / PRODUCTION" -ForegroundColor Magenta
        } else {
            Write-Host " [Backend DB]   : Custom ($dbLine)" -ForegroundColor Yellow
        }
        Write-Host "   -> URL       : $dbLine" -ForegroundColor DarkGray
    } else {
        Write-Host " [Backend DB]   : apps/api/.env chưa tồn tại" -ForegroundColor Red
    }

    if (Test-Path $WebEnvLocal) {
        $webLines = Get-Content $WebEnvLocal
        $apiUrl = ($webLines | Where-Object { $_ -match "^NEXT_PUBLIC_API_URL=" }) -replace "^NEXT_PUBLIC_API_URL=", ""
        if ($apiUrl -match "localhost|127\.0\.0\.1") {
            Write-Host " [Frontend API] : " -NoNewline; Write-Host "LOCAL (http://localhost:3001/api/v1)" -ForegroundColor Green
        } else {
            Write-Host " [Frontend API] : " -NoNewline; Write-Host "RAILWAY ($apiUrl)" -ForegroundColor Magenta
        }
    }

    # Check terminal environment variable overrides
    if ($env:DATABASE_URL) {
        Write-Host " [CẢNH BÁO]     : Biến môi trường `$env:DATABASE_URL đang gán đè trong terminal:" -ForegroundColor Yellow
        Write-Host "                  $env:DATABASE_URL" -ForegroundColor Yellow
    }

    # Check Docker Postgres
    $pgContainer = docker ps --filter "name=brewlite-postgres" --format "{{.Names}} ({{.Status}})" 2>$null
    if ($pgContainer) {
        Write-Host " [Docker DB]    : $pgContainer" -ForegroundColor Green
    } else {
        Write-Host " [Docker DB]    : Chưa chạy (dùng 'docker compose up -d postgres' nếu chạy local)" -ForegroundColor Gray
    }
    Write-Host "==============================================================`n"
}

if ($Target -eq "status") {
    Show-Status
    exit 0
}

# 1. Chuyển sang LOCAL
if ($Target -eq "local") {
    Write-Host "`n[BrewLite] Đang chuyển toàn bộ cấu hình sang LOCAL..." -ForegroundColor Cyan

    $localEnvSource = Join-Path $RootDir ".env.local"
    if (Test-Path $localEnvSource) {
        Copy-Item $localEnvSource $RootEnv -Force
    }

    # Cập nhật apps/api/.env
    $apiContent = @"
PORT=3001
WEB_ORIGIN=http://localhost:3000,https://web-production-b910e.up.railway.app,http://127.0.0.1:3000
DATABASE_URL=postgresql://brewlite:123456@localhost:5433/brewlite?schema=public
JWT_SECRET=b05deb3c252229c83c9d05cf5caf2003da472e9016727c17c87241aeb8075ab8ba5fd1938cd9e3dfcec0fc3027219b11
VNPAY_ENABLED=true
VNPAY_TMN_CODE=QEZXV06S
VNPAY_HASH_SECRET=TLRYXIRSIMLVRLZAENIXJGHWWJJMORDO
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=http://localhost:3001/api/v1/payments/vnpay/return
VNPAY_IPN_URL=https://api-production-1be6.up.railway.app/api/v1/payments/vnpay/ipn
"@
    Set-Content -Path $ApiEnv -Value $apiContent -Encoding UTF8

    # Cập nhật apps/web/.env.local
    $webContent = @"
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_VNPAY_ENABLED=true
"@
    Set-Content -Path $WebEnvLocal -Value $webContent -Encoding UTF8

    # Xóa biến môi trường tạm thời trong session hiện tại
    if (Test-Path env:DATABASE_URL) {
        Remove-Item env:DATABASE_URL
    }

    Write-Host "[THÀNH CÔNG] Đã chuyển sang môi trường LOCAL hoàn chỉnh!" -ForegroundColor Green
    Write-Host "- Backend: Kết nối PostgreSQL local tại localhost:5433"
    Write-Host "- Frontend: Gọi API local tại http://localhost:3001/api/v1"
    Show-Status
    exit 0
}

# 2. Chuyển sang PRODUCTION / RAILWAY
if ($Target -in @("prod", "railway")) {
    Write-Host "`n[BrewLite] Đang chuyển toàn bộ cấu hình sang PRODUCTION / RAILWAY..." -ForegroundColor Cyan

    $railwayEnvSource = Join-Path $RootDir ".env.railway"
    if (Test-Path $railwayEnvSource) {
        Copy-Item $railwayEnvSource $RootEnv -Force
    }

    $dbUrl = "postgresql://postgres:RQswvNtkTYgZhzLSSyxWnbDLrqCenPKt@postgres.railway.internal:5432/railway"
    if ($PublicDbUrl) {
        $dbUrl = $PublicDbUrl
    }

    # Cập nhật apps/api/.env
    $apiContent = @"
PORT=3001
WEB_ORIGIN=http://localhost:3000,https://web-production-b910e.up.railway.app,http://127.0.0.1:3000
DATABASE_URL=$dbUrl
JWT_SECRET=b05deb3c252229c83c9d05cf5caf2003da472e9016727c17c87241aeb8075ab8ba5fd1938cd9e3dfcec0fc3027219b11
VNPAY_ENABLED=true
VNPAY_TMN_CODE=QEZXV06S
VNPAY_HASH_SECRET=TLRYXIRSIMLVRLZAENIXJGHWWJJMORDO
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=https://api-production-1be6.up.railway.app/api/v1/payments/vnpay/return
VNPAY_IPN_URL=https://api-production-1be6.up.railway.app/api/v1/payments/vnpay/ipn
"@
    Set-Content -Path $ApiEnv -Value $apiContent -Encoding UTF8

    # Cập nhật apps/web/.env.local (frontend gọi thẳng API Railway)
    $webContent = @"
NEXT_PUBLIC_API_URL=https://api-production-1be6.up.railway.app/api/v1
NEXT_PUBLIC_VNPAY_ENABLED=true
"@
    Set-Content -Path $WebEnvLocal -Value $webContent -Encoding UTF8

    if (Test-Path env:DATABASE_URL) {
        Remove-Item env:DATABASE_URL
    }

    Write-Host "[THÀNH CÔNG] Đã chuyển sang cấu hình PRODUCTION / RAILWAY!" -ForegroundColor Green
    Write-Host "- Frontend: Gọi trực tiếp API Railway: https://api-production-1be6.up.railway.app/api/v1"
    Write-Host "- Backend: Trỏ DATABASE_URL vào Railway."
    if ($dbUrl -match "internal") {
        Write-Host "  LƯU Ý: Nếu chạy Backend từ máy local kết nối ra Railway DB, bạn cần Public TCP Proxy URL." -ForegroundColor Yellow
        Write-Host "  Ví dụ: .\scripts\switch-env.ps1 prod 'postgresql://postgres:...@<proxy>.proxy.rlwy.net:<port>/railway'" -ForegroundColor Yellow
    }
    Show-Status
    exit 0
}

