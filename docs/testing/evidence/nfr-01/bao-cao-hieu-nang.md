# NFR-01 · Báo cáo đo hiệu năng BrewLite

## Kết quả dùng nộp trên DB mẫu

Chạy API và PostgreSQL 18.3 local trên Windows với Node.js 24.21.0. Bộ dữ liệu mẫu bắt đầu với 100 sản phẩm, 300 biến thể, 30 topping và 1.000 đơn. Bốn API đầu chạy 20 client đồng thời, làm nóng 30 giây và đo 60 giây mỗi API. Bước tạo link VNPay chạy tuần tự 100 mẫu. Công cụ đo tính thời gian đến khi đọc xong phản hồi.

| API | Mẫu thành công / Tổng mẫu | p95 | Tối đa | HTTP 5xx |
| --- | ---: | ---: | ---: | ---: |
| `GET /products` | 59.201 / 59.201 | 34,46 ms | 76,95 ms | 0 |
| `GET /products/:id` | 61.919 / 61.919 | 34,04 ms | 86,97 ms | 0 |
| `GET /orders/me` | 39.281 / 39.281 | 65,51 ms | 1.026,78 ms | 0 |
| `POST /orders` | 6.953 / 6.953 | 302,01 ms | 875,68 ms | 0 |
| `POST /payments` (tạo link VNPay) | 100 / 100 | 10,41 ms | 38,98 ms | 0 |

JSON ghi `allPassed: true`. Ngưỡng benchmark là p95 dưới 500 ms cho bốn API đo tải, tỷ lệ 5xx hoặc lỗi kết nối dưới 1%, và mọi mẫu phải trả 2xx. Các giá trị tối đa được giữ trong bảng để thể hiện những phản hồi riêng lẻ vượt 500 ms. Bước VNPay đo thời gian tạo link tại BrewLite. [JSON gốc](nfr-01-results-submission.json) · [Đầu ra terminal](nfr-01-submission-terminal.txt).

API menu dùng chung lượt đọc đang chạy cho các yêu cầu đồng thời. Khi tạo đơn, transaction ghi lịch sử và bản ghi giữ chỗ trước khi cập nhật tồn kho. Lần cập nhật đầu so khớp phiên bản nguyên liệu. Nếu phiên bản đã đổi, PostgreSQL kiểm tra lượng tồn hiện tại trong cập nhật tiếp theo. Các bản ghi trong transaction cùng được hoàn tác nếu nguyên liệu thiếu. Bộ kiểm thử hiện tại đạt 437 ca API và 51 ca integration PostgreSQL, gồm rollback, giới hạn coupon và tranh ly cuối.

## Tái hiện

Tạo PostgreSQL thử nghiệm rỗng hoặc sao chép DB mẫu trước khi chạy tải. Dùng cùng `DATABASE_URL` cho migration, seed, API và benchmark. Script benchmark tạo thêm đơn và giao dịch, nên mỗi lượt so sánh cần bắt đầu từ bản sao dữ liệu mẫu ban đầu. Hướng dẫn PostgreSQL nằm trong `docs/testing/README.md` của mã nguồn; script seed là `scripts/seed-perf-nfr01.mjs`.

```powershell
npm.cmd --prefix apps/api run prisma:deploy
Push-Location apps/api
node --import=tsx prisma/seed-demo.ts
Pop-Location
npm.cmd run perf:seed
$env:PORT = '3102'
npm.cmd --prefix apps/api run start:dev
```

Ở cửa sổ PowerShell còn lại, đặt cùng `DATABASE_URL` và chạy lệnh đo. API cần cấu hình VNPay Sandbox để đo bước tạo liên kết thanh toán.

```powershell
$env:API_BASE_URL = 'http://127.0.0.1:3102/api/v1'
$env:PERF_RESULTS_FILE = 'nfr-01-results-sample-retest.json'
npm.cmd run perf:test
Remove-Item Env:PERF_RESULTS_FILE
```

Giữ cả kết quả gốc và lượt đo lại. Khi kiểm tra lỗi tạo đơn, đối chiếu `requestId` của lỗi trong JSON với log API của cùng lượt chạy. Script benchmark trong mã nguồn: `scripts/run-load-test-nfr01.mjs`.

Ảnh `perf/summary_perf.png` thuộc DB smoke cũ có 1.096 sản phẩm. Các JSON chẩn đoán cũ được giữ để đối chiếu, không dùng thay cho JSON của lượt nộp ở trên.
