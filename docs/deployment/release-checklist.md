# Hồ sơ bàn giao và release BrewLite

Bổ sung 24/10/2026: [hồ sơ CI/required checks](./ci-quality-gates.md) ghi run pass/fail và ruleset CI riêng không bypass, bao gồm job Documentation. Bảng 22/10 dưới đây là snapshot lịch sử; các mục deploy/HTTPS/smoke vẫn cần minh chứng tương ứng.

Đối chiếu 22/10/2026. A1 v1.0 yêu cầu code, Docker Compose, README, demo end-to-end và Review/Retro. CD/production HTTPS được nêu trong trao đổi về A2; chưa có đề A2 chính thức trong repo để xác nhận nguyên văn. Đây là danh sách điều kiện cần chứng minh, không phải báo cáo đã triển khai.

| Điều kiện | Hiện trạng | Minh chứng cần lưu |
|---|---|---|
| CI frontend/backend/database | Có [workflow](../../.github/workflows/ci.yml) | Link run ứng với SHA bàn giao và kết quả đủ 3 job |
| Chặn merge khi lỗi | YAML không thiết lập ruleset | Required checks Frontend, Backend, Database migrations and integration; approval khác owner và cấu hình bypass đã thống nhất |
| MVP chạy xuyên suốt | Chưa đạt: order/payment/history còn thiếu | Video/biên bản và E2E menu → login → order → payment → confirmation/history trên DB thật |
| Task 10 | Có schema/thiết kế, thiếu runtime tests | Transition sai, same-key payment, concurrent stock; coupon/loyalty không lặp |
| Docker từ môi trường sạch | Có cấu hình; chưa có biên bản runtime mới | SHA, lệnh, môi trường, migrate exit 0, các service healthy, seed/menu, restart giữ dữ liệu |
| Release có thể truy vết | Chưa có minh chứng trong hồ sơ này | Tag/SHA, changelog, image digest hoặc artifact và link CI |
| CD và production HTTPS | Chưa có workflow CD/URL trong repo | Nền tảng đã chốt, ADR, deployment run, URL TLS hợp lệ, cấu hình public/internal URL và CORS |
| Smoke/rollback | Chưa có kết quả môi trường đích | Smoke sau deploy, phiên bản trước/sau, quyết định giữ hoặc rollback và kiểm tra lại |
| Scrum/bàn giao | Chưa có biên bản nghiệm thu đầy đủ | Thời gian, người tham dự, task Accepted/Not Accepted, feedback, Retro/actions và bảng đóng góp được nhóm xác nhận |

## Quy trình smoke dự kiến

Ghi SHA, ngày giờ và môi trường, sau đó kiểm tra readiness/DB; menu/detail; register/login; đặt/thanh toán một đơn; xác nhận và đọc lại đúng đơn của user. Kiểm tra tài khoản khác không đọc/trả tiền đơn đó, thanh toán lặp không tạo side effect, lỗi giữ giỏ. Restart và xác nhận dữ liệu còn. Local Compose chỉ dùng HTTP theo [DD-01](../architecture/deployment-diagram.md); HTTPS cần kiểm chứng trên môi trường đã triển khai.

## Phương án rollback cần chốt trước release

Giữ artifact/SHA phiên bản chạy ổn gần nhất và sao lưu DB trước migration trên môi trường bàn giao. Khi smoke lỗi, dừng phát hành và khôi phục artifact trước theo topology đã chọn. Chỉ rollback ứng dụng khi schema còn tương thích; migration phá vỡ tương thích phải có kế hoạch phục hồi dữ liệu hoặc sửa tiến đã được thử trên bản sao. Không giả định `prisma migrate deploy` có lệnh tự hoàn tác dữ liệu. Chạy lại smoke và ghi kết quả sau phục hồi.

Chưa có môi trường production cụ thể, nên tài liệu không đặt URL/nhà cung cấp hoặc lệnh deploy giả. Chốt môi trường rồi cập nhật [Deployment Diagram](../architecture/deployment-diagram.md), ADR và checklist bằng kết quả thật.
