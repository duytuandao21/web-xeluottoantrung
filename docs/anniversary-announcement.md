# Thanh thông báo kỷ niệm 4 năm

## Bật / tắt

Trong Admin, vào **Thiết lập → Thông tin → Thanh kỷ niệm 4 năm**:

- **Bật**: hiện thanh phía trên Header. Chiều cao desktop linh hoạt 34–44px theo độ rộng màn hình (34px tại 1440px), mobile 32px với nội dung hai dòng. Huy hiệu chỉ còn số 4 giữa nguyệt quế đối xứng; chữ, khoảng cách và trang trí được thu nhỏ tương ứng.
- **Tắt**: bỏ thanh và khoảng trống tương ứng, trả Header về giao diện thông thường.
- Nhấn **Lưu thay đổi**, sau đó tải lại trang website để xem kết quả. Trang đã mở không tự polling cấu hình.

Thiết lập lưu dưới khóa `anniversaryBarEnabled` (`"true"` / `"false"`) trong nhóm `thiet-lap-thong-tin`. Nếu chưa có khóa, mặc định bật cho sự kiện hiện tại. Cấu hình này độc lập với chủ đề kỷ niệm trên `/TV`.

## Vận hành

Triển khai Web và Admin đã build; không cần migration, biến môi trường hay thư viện mới. Dùng endpoint/cơ chế lưu và vô hiệu hóa cache thiết lập hiện có.

Thanh được render từ server bằng kết quả `getSiteInfo()` đã có trong layout; không thêm lượt fetch hoặc truy vấn database khi khách xem trang. Bản hiện tại giữ nền đỏ đô, huy hiệu số 4/nguyệt quế SVG inline và chữ champagne; đã bỏ lụa góc, bụi vàng quanh lụa và hai đường gạch vàng hai bên. Font serif có sẵn trên hệ thống, không tải font, ảnh hoặc chạy animation mới.

Hai phiên bản Header có ID SVG riêng để gradient/nguyệt quế không tham chiếu nhầm vào phần tử đang ẩn, đặc biệt trên Safari.

Khoảng cách Header, các khối sticky liên quan và điểm cuộn đến nội dung được bù chiều cao thanh khi bật; khi tắt dùng lại khoảng cách cũ. Menu và tìm kiếm tiếp tục đo chiều cao Header hiện có.

## Kiểm chứng tại local

- Web: typecheck, lint và production build đạt; còn các warning có sẵn về ảnh và hook ở những component khác.
- Admin: typecheck, lint file thiết lập và production build đạt.
- Chrome headless với API giả trên loopback, chặn request ngoài từ browser: 24 trường hợp mở trang riêng ở 320/390/640/768/960/1024/1440/1920px, với cấu hình chưa có / tắt / bật. Kiểm tra chữ không tràn, logo không bị che, khoảng cách nội dung, menu mobile/desktop và vị trí khi cuộn.
- Kiểm tra riêng các offset sticky, scroll anchor, cuộn đến nhân viên, render không JavaScript và số lượt đọc API giữa bật/tắt. Lượt đọc nhóm thông tin vẫn là một lần trong mỗi render trang chủ ở fixture, không phát sinh endpoint mới.
- Regression tìm kiếm trang chủ đạt với viewport bàn phím mô phỏng: resize/pan, lớp nền làm mờ, gõ từ khóa, đóng/mở bàn phím và mở lại tìm kiếm.
- Có ghi nhận React hydration error #418 trong chuỗi đổi viewport và tải lại liên tiếp trên cùng tab. 24 phiên riêng và lần đối chứng sau với cả bật/tắt không tái hiện lỗi; chưa xác định được nguyên nhân và không coi đây là lỗi đã được sửa. Không sửa các luồng ngoài phạm vi để che lỗi.

Đây là kiểm tra trình duyệt mô phỏng; chưa kiểm tra trên thiết bị Safari/iPhone thật. Không dùng dữ liệu hoặc API production cho fixture Web.

## Đối chiếu bản thiết kế theo ảnh mẫu — 30/10/2026

- Dựng lại lụa vàng hai đầu, các vệt sáng và bụi vàng, huy hiệu số 4/nguyệt quế, vạch phân cách, chữ serif và năm bằng HTML/CSS/SVG tĩnh.
- [Ảnh desktop](previews/anniversary-bar-desktop.png) · [Ảnh mobile](previews/anniversary-bar-mobile.png): bản xem trước cập nhật từ component/CSS hiện hành trong fixture local.
- Typecheck, lint các file thay đổi và production build đạt; warning ảnh/hook cũ vẫn giữ nguyên.
- Đã đối chiếu 24 tổ hợp kích thước/trạng thái bật tắt và các điểm chuyển bố cục 640/641px, 960/961px: không tràn chữ, không che logo, không có ID SVG trùng.
- Sau khi đổi chiều cao thành giá trị linh hoạt, sửa thao tác cuộn đến nhân viên sang đo chiều cao thanh thực tế. Kiểm tra lại sticky/anchor/cuộn, cả bật/tắt trên 390px và 1440px đạt; SSR không JavaScript và số lượt gọi API trước/sau vẫn đúng. Regression tìm kiếm với bàn phím mobile mô phỏng đạt.

### Điều chỉnh thu gọn

Giảm chiều cao desktop khoảng 10–13% và mobile 10%, thu nhỏ huy hiệu/chữ desktop/khoảng cách tương ứng. Giữ cỡ chữ mobile để dễ đọc. Chỉ đổi CSS kích thước và ảnh xem trước; kiểm tra render component với CSS hiện hành tại 11 độ rộng 320–1920px: chữ không tràn hoặc bị cắt, logo nằm dưới thanh. Không chạy lại build cho lần chỉnh kích thước thuần CSS này.

### Thu gọn thêm và bỏ chữ trong huy hiệu

Theo yêu cầu tiếp theo, thu thanh về 34–44px desktop / 32px mobile, giảm chữ/khoảng cách/đường trang trí. Bỏ chữ “NĂM” trong huy hiệu, thu khung và đặt số 4 ở giữa hai nhánh nguyệt quế đối xứng; giữ nội dung “4 NĂM” ở dòng thông báo chính. Cập nhật hai ảnh xem trước. Typecheck, lint component và kiểm tra render tại 11 độ rộng đạt: huy hiệu chỉ có số 4, chữ nằm trong thanh, không che logo. Chưa chạy lại production build cho lần thu gọn này.

### Lụa vàng ở góc dưới

Thay lụa gấp lớn bằng một đường cong satin thấp ở mỗi góc, vàng champagne dịu và mờ dần vào nền đỏ. Thu vùng lụa từ khoảng 254 xuống 154 đơn vị SVG, giảm bụi vàng từ 28 còn 6 hạt cho mỗi góc và chỉ giữ một vệt sáng nền mảnh. Biên lụa nằm trong chiều cao viewBox để không bị cắt trên/dưới. Giữ nguyên kích thước thanh, huy hiệu và nội dung giữa. Cập nhật ảnh xem trước; kiểm tra render desktop/mobile, biên hình SVG, typecheck và lint component. Không thêm animation, thư viện hoặc request.

### Bỏ lụa và hai đường gạch vàng

Theo yêu cầu mới nhất, bỏ toàn bộ SVG lụa góc cùng CSS và hai pseudo-element tạo gạch vàng hai bên cụm nội dung. Cụm huy hiệu/nội dung tiếp tục căn giữa; giữ kích thước thanh hiện tại. Kiểm tra render desktop/mobile và cập nhật ảnh xem trước.

### Nội dung thành lập Toàn Trung TP.HCM

Đổi dòng thông báo thành “KỶ NIỆM 4 NĂM THÀNH LẬP TOÀN TRUNG TP.HCM” trên desktop, chia hai dòng tương ứng trên mobile và cập nhật nhãn truy cập. Nhích riêng số 4 lên thêm 4 đơn vị SVG để cân với vòng nguyệt quế. Đã kiểm tra render tại 11 độ rộng 320–1920px: dòng chữ mới không tràn, logo không bị che; cập nhật ảnh xem trước.
