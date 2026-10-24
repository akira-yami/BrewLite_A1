# A2-4.4 — CI trên PR và required checks

Đối chiếu 24/10/2026 cho repository `phananhkhang/BrewLite`, nhánh đích `main`. [Workflow](../../.github/workflows/ci.yml) chạy `push`, `pull_request`, `workflow_dispatch`, không có path filter hoặc `continue-on-error` cho lint/test/build.

| Check | Trình tự và điều kiện lỗi |
|---|---|
| Frontend | npm ci → lint → typecheck → unit tests → build; lệnh trước lỗi thì lệnh sau không chạy |
| Backend | npm ci → Prisma generate → lint → typecheck → unit tests → HTTP E2E → build |
| Database migrations and integration | npm ci → Compose config test → validate/generate/deploy migration hai lượt/status → PostgreSQL integration |
| Documentation | Node 24 → kiểm tra link tài liệu, code fence, source/export hash, enum và register Task 1–3; không cần npm dependencies |

## Bằng chứng đã đọc từ GitHub

- **PR run pass:** [CI #73](https://github.com/phananhkhang/BrewLite/actions/runs/39933101729), head `0d6620a05c9d6bc07979c2b0f3530bf4b811458b`, event `pull_request`. Frontend/Backend/Database đều success; đã đối chiếu từng bước install/lint/test/build. Run này có trước job Documentation.
- **PR run phát hiện lỗi:** [CI lỗi](https://github.com/phananhkhang/BrewLite/actions/runs/38126540166), head `0c08b040fc44c32a6c1836e761e34581c9c34450`, event `pull_request`. Job Frontend lỗi tại **Typecheck**, Cart tests và Build bị skipped; Backend/Database success. Đây là lỗi thực tế lịch sử, không phải log dựng lại và không chứng minh gate đã được bật tại thời điểm đó.
- **Trước thay đổi:** ruleset `Protect main branch` (ID 24695724) active, yêu cầu 1 review và resolve thread, chặn force push/xóa; **không có required_status_checks**, admin role 5 bypass always. Vì vậy CI có chạy nhưng chưa bảo đảm chặn merge khi lỗi.

## Cấu hình gate

Ruleset bổ sung `BrewLite CI quality gate` nhắm default branch, active, bắt buộc bốn check đúng tên như bảng và branch phải cập nhật theo base. Không có bypass actor trong ruleset CI; ruleset review cũ được giữ nguyên. Check gắn app GitHub Actions; không dùng commit status tùy ý cùng tên để thay thế.

Snapshot đọc lại từ API, ID ruleset và bằng chứng run PR mới được lưu trong [evidence A2](../testing/evidence/a2-2026-10-24/github-quality-gates.json). File chỉ chứa metadata kiểm chứng, không chứa token. Chỉ trạng thái `verified` trong snapshot mới xác nhận đã áp dụng ngoài GitHub; JSON cấu hình hoặc YAML một mình chưa đủ.

PR thiếu/fail một check bắt buộc phải chờ đến khi check đạt; reviewer/admin vẫn chịu ruleset CI không bypass. Không gọi API merge để thử vì có thể merge thật khi đủ điều kiện. Đọc ruleset hiệu lực và trạng thái check trên PR để kiểm chứng. Nghiệm thu review độc lập của Huy được theo dõi riêng; run pass không phải approval.

## Kiểm tra lại và vận hành

1. Mở PR vào main; xác nhận bốn job xuất hiện và hoàn tất, ghi run URL/head SHA/conclusion.
2. Đọc Settings → Rules → `BrewLite CI quality gate`: Active, default branch, required checks đúng tên, strict, không bypass. Nếu đổi tên job phải cập nhật ruleset cùng đợt; không bỏ rule để merge.
3. Khi thất bại, xem step đầu tiên lỗi, sửa trong PR rồi chạy lại; không đổi success bằng status thủ công. Lưu cả run lỗi và run đạt.
4. Khi thêm merge queue sau này, phải bổ sung trigger `merge_group` trước khi bật. Workflow hiện chưa hỗ trợ queue; không bật queue trong task này.

API đối chiếu cấu hình: [GitHub rulesets](https://docs.github.com/en/rest/repos/rules). CI và branch protection là quality gate; không phải workflow CD, HTTPS, performance benchmark hoặc báo cáo availability.
