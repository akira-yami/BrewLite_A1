# Quy chuẩn Phát triển Dự án BrewLite (ECC — Test-Driven Development Mandatory)

Dự án này áp dụng nghiêm ngặt quy trình **TDD (Test-Driven Development)** từ chuẩn **ECC (Everything Claude Code)**.

---

## Nguyên tắc cốt lõi: Tests BEFORE Code (Bắt buộc)

Mọi yêu cầu viết tính năng mới, sửa lỗi (bug fix) hay refactor đều **BẮT BUỘC** tuân thủ chu kỳ:

1. **RED:** Viết bài test tự động trước mô tả nghiệp vụ hoặc tái hiện lỗi. Chạy test và chứng minh test FAIL. Không sửa mã nghiệp vụ trước khi có test thất bại.
2. **GREEN:** Viết lượng mã tối thiểu chỉ để pass test. Xác nhận test chuyển sang GREEN.
3. **REFACTOR:** Làm sạch code, tối ưu hóa mà vẫn giữ test GREEN.
4. **Coverage:** Đạt độ phủ tối thiểu $\ge$ 80% (Unit + Integration tests).
