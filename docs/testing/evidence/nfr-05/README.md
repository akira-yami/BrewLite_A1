# NFR-05 · Chống xử lý lặp

Gửi lại cùng yêu cầu thanh toán chỉ lưu một payment. Gửi lại cùng yêu cầu đổi điểm trả cùng voucher và chỉ trừ điểm một lần. Dùng lại khóa với nội dung khác trả `409 IDEMPOTENCY_KEY_REUSED`.

| Tình huống | Minh chứng hiện tại |
| --- | --- |
| Thanh toán hai lần cùng khóa | [Log PostgreSQL 51/51](raw/postgres-verification.txt), ca `keeps one order and one payment after two requests with the same Idempotency-Key` |
| Đổi điểm đồng thời cùng khóa | [Cùng log PostgreSQL](raw/postgres-verification.txt), ca `returns the same coupon for concurrent retries with the same key` |
| Dùng khóa đổi điểm cho gói khác | [Cùng log PostgreSQL](raw/postgres-verification.txt), ca `rejects reusing a redemption key for a different tier without a second debit` |
| Dùng khóa thanh toán với nội dung khác | [Log unit thanh toán](raw/payment-unit-verification.txt), ca `409 IDEMPOTENCY_KEY_REUSED` |

PostgreSQL là DB thật; gateway thanh toán trong integration là bản mô phỏng. Đây là minh chứng xử lý lặp tại BrewLite. Các log có tên ca, lệnh chạy và kết quả gốc; không cần chuyển thành ảnh để chứng minh tự động kiểm thử.

- [Log chạy 3 ca integration trên DB smoke](raw/idempotency-integration-run.txt) kiểm tra thanh toán lặp, đổi điểm lặp và đổi gói với cùng khóa. Cả 3 ca đạt.
- [Log chạy unit test khóa thanh toán bị dùng lại](raw/payment-key-reuse-run.txt) xác nhận lỗi `409 IDEMPOTENCY_KEY_REUSED`. Ca kiểm thử đạt.

Lệnh chạy dùng bộ lọc theo tên ca. Các ca ngoài NFR-05 được đánh dấu `skipped` trong log.

- [Trích log chạy lại trên PostgreSQL và unit test thanh toán](raw/idempotency-retest-extract.txt)
- [Trích log kiểm thử trước đó](raw/idempotency-excerpts.txt)
