# Báo cáo BrewLite — Nhóm 7

Báo cáo được đối chiếu với mã nguồn và hồ sơ nhóm ngày **03/11/2026**. Nội dung gồm 12 User Story kèm Acceptance Criteria, 14 yêu cầu chức năng, 10 yêu cầu phi chức năng, kiến trúc và schema hiện hành, hiện trạng triển khai, kiểm thử, bảng phân công năm thành viên và danh mục 40 thẻ/reviewer.

Xem [bản PDF đã biên dịch](build/main.pdf) hoặc chỉnh sửa [nguồn chính](main.tex). Thư mục `BrewLite-Report/tham_khao/` chỉ lưu tài liệu tham khảo cục bộ và được Git bỏ qua; không cần thư mục này để biên dịch.

## Biên dịch

Chọn **XeLaTeX** trên Overleaf/TeXstudio/VS Code. Cần TeX Live hoặc MiKTeX có các package trong `preamble/packages.tex`. Times New Roman được dùng nếu máy có font; nếu không sẽ dùng TeX Gyre Termes. Không biên dịch bằng pdfLaTeX và không cần `shell-escape`.

Từ thư mục `BrewLite-Report/report/`:

```powershell
latexmk -xelatex main.tex
```

Trên Windows, script tự tìm XeLaTeX từ PATH hoặc thư mục MiKTeX của người dùng:

```powershell
.\build.ps1
```

Kết quả: **`build/main.pdf`**. Nếu chạy engine trực tiếp, tạo thư mục `build` rồi chạy ba lượt:

```powershell
xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error -output-directory=build main.tex
```

## Chỉnh sửa nội dung

- `preamble/info.tex`: nhóm, thành viên/MSSV, giảng viên và thời gian. Danh sách sinh viên theo thông tin người dùng cung cấp; tên giảng viên giữ từ mẫu hiện có.
- `frontmatter/titlepage.tex`: bìa có tiêu đề xuống dòng trong minipage, font giữ nguyên tỷ lệ, logo giữ đúng tỷ lệ ảnh.
- `chapters/02-phan-tich-yeu-cau.tex`: User Story, FR, NFR và quy tắc nghiệp vụ.
- `chapters/03-thiet-ke-he-thong.tex`: sơ đồ TikZ, 18 model và API có thật.
- `chapters/04-hien-thuc.tex`: ma trận triển khai và phần còn thiếu.
- `chapters/05-kiem-thu.tex`: ca kiểm thử và số liệu từ audit đã lưu.
- `chapters/06-ket-luan.tex`: phân công, backlog, kết quả/hạn chế.
- `backmatter/appendix.tex`: hướng dẫn chạy và danh sách 40 thẻ/reviewer.
- `backmatter/references.tex`: nguồn tài liệu nội bộ và PDF tham khảo.

Các yêu cầu mô tả hành vi cần đạt, không tự xác nhận tất cả đã hoàn thành. Số liệu 369 test là kết quả **audit đã lưu**, không phải lần chạy lại khi soạn báo cáo. Chỉ tiêu hiệu năng là mục tiêu đề xuất chưa được đo. Bảng phân công ghi trách nhiệm, không suy tỷ lệ đóng góp theo số thẻ/commit. PDF tham khảo chỉ được dùng về cách trình bày; công nghệ, tồn nguyên liệu và trạng thái chức năng được đối chiếu với code.

Các tệp sinh ra và ảnh kiểm tra nằm trong `build/` và được `.gitignore` gốc bỏ qua. Riêng `build/main.pdf` đã được thêm vào repository; sau khi biên dịch lại, Git sẽ tiếp tục theo dõi thay đổi của PDF này.
