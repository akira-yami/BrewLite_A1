# NFR-07 · Bảo trì và triển khai

Nghiệm thu Docker Compose từ volume rỗng. Migration thoát mã 0. PostgreSQL, API và web báo `healthy`, web và API trả HTTP 200, seed demo thành công. Chín ca kiểm tra cấu hình môi trường và Compose cũng đạt.

- [Kiểm thử mã nguồn hiện tại](raw/api-web-verification.txt): 437/437 ca API và 96/96 ca web, mã thoát 0.
- [Kiểm tra kiểu TypeScript API](raw/typecheck-verification.txt): mã thoát 0.
- [Log nghiệm thu Compose](raw/compose-clean-start.txt)
- [Log kiểm thử cấu hình](raw/compose-config-tests.txt)
- [Log áp dụng Prisma migrations](raw/prisma-migrations.txt)

Trong mã nguồn, các mô-đun API được khai báo ở `apps/api/src/app.module.ts`, lịch sử migration nằm ở `apps/api/prisma/migrations/`, và CI ở `.github/workflows/ci.yml`.

Log Compose ghi nhận nghiệm thu stack sạch ở lượt dựng đã lưu. Các log unit và typecheck ở trên là lượt kiểm tra lại mã nguồn hiện tại.
