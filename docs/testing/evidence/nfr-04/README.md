# NFR-04 · Toàn vẹn dữ liệu

[Lượt kiểm tra lại trên PostgreSQL](raw/postgres-verification.txt) đạt **51/51 ca, mã thoát 0**. DB kiểm thử riêng: `brewlite_foundation_smoke_nfr01_native_verify`. Log ghi đầy đủ lệnh và tên các ca.

| Điều kiện | Minh chứng ảnh thật | Kiểm tra trong log |
| --- | --- | --- |
| Tạo đơn và lưu snapshot/giữ nguyên liệu | [Tạo đơn và lưu dữ liệu](screenshot/tao_don_va_luu_du_lieu.png) | `merges normalized lines... snapshots and ownership` |
| Hoàn tác khi lỗi ở cuối giao dịch | [Rollback](screenshot/hoan_tac_toan_bo_khi_loi.png) | `rolls back all order rows, stock/version, reservation and coupon after a late failure` |
| Hai khách đặt ly cuối | [Tranh ly cuối](screenshot/tranh_ly_cuoi.png) | Đúng một đơn thành công, một đơn bị từ chối, tồn cuối bằng 0 |
| Coupon giới hạn không bị giữ quá lượt | [Giữ coupon một lần](screenshot/coupon_gioi_han_chi_giu_mot_lan.png) | `reserves a limited coupon once under concurrent requests` |

Các ảnh terminal là phần chụp hẹp của từng ca; dùng log đầy đủ để xem bối cảnh và kết quả tổng. Các ca còn kiểm tra giới hạn coupon theo người dùng/toàn cục và hoàn kho đúng một lần.

Log trước đó: [51 ca integration](raw/postgres-invariants-tests.txt), [trích rollback và đồng thời](raw/transaction-and-concurrency-excerpts.txt).
