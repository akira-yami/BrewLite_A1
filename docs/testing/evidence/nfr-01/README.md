# NFR-01 · Hiệu năng API

Lượt đo trên PostgreSQL mẫu có 100 sản phẩm, 300 biến thể, 30 topping và 1.000 đơn ban đầu đạt tiêu chí benchmark. Cả năm API có p95 dưới 500 ms, mọi phản hồi đo được đều 2xx và JSON ghi `allPassed: true`.

- [JSON kết quả dùng làm minh chứng](nfr-01-results-submission.json)
- [Đầu ra terminal của lượt chạy](nfr-01-submission-terminal.txt)
- [Phương pháp đo, bảng đầy đủ và lệnh chạy lại](bao-cao-hieu-nang.md)
- Ảnh PageSpeed của giao diện web gồm [desktop 1](screenshot_pagespeed/desktop-1.png), [desktop 2](screenshot_pagespeed/desktop-2.png), [mobile 1](screenshot_pagespeed/mobile-1.png) và [mobile 2](screenshot_pagespeed/mobile-2.png).

Ảnh PageSpeed đo giao diện web. [Ảnh thống kê DB smoke cũ](perf/summary_perf.png) có 1.096 sản phẩm, khác bộ dữ liệu mẫu 100 sản phẩm của lượt nộp. [Các JSON chẩn đoán trước đó](raw/diagnostic/README.md) được giữ riêng; dùng `nfr-01-results-submission.json` để đối chiếu bảng kết quả đạt.

Ngưỡng 500 ms trong benchmark được đánh giá bằng **p95**. Một số phản hồi riêng lẻ vượt 500 ms; xem cột tối đa trong báo cáo.
