# BrewLite - Script Demo 3 Tiêu Chí Chấm Điểm
# (a) Chặn chuyển trạng thái sai
# (b) Gửi 2 lần cùng Idempotency-Key chỉ tạo 1 kết quả thanh toán
# (c) Đặt đồng thời không vượt tồn kho (Concurrency)

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "     BREWLITE - DEMO KIỂM THỬ 3 TIÊU CHÍ CỐT LÕI (VITEST)        " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " (a) Chặn chuyển trạng thái đơn sai" -ForegroundColor Green
Write-Host " (b) Idempotency-Key chống thanh toán trùng lặp" -ForegroundColor Green
Write-Host " (c) Đặt đồng thời không vượt tồn kho (Race condition)" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

$env:DATABASE_URL = "postgresql://brewlite:123456@localhost:5433/brewlite_foundation_smoke_sm?schema=public"
$env:SMOKE_DATABASE_URL = "postgresql://brewlite:123456@localhost:5433/brewlite_foundation_smoke_sm?schema=public"

npm.cmd --prefix apps/api run test:integration -- `
  order-state-machine.integration-spec.ts `
  inventory-concurrency.integration-spec.ts `
  orders.integration-spec.ts `
  --reporter=verbose
