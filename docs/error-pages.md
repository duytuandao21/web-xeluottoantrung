# Giao diện thông báo lỗi

`components/errors/ErrorState.tsx` và `error-state.css` cung cấp chung bố cục, nội dung tiếng Việt, màu đỏ và font SF Pro Display local của website. Không lấy branding hoặc gọi API trong component lỗi.

## Điểm tích hợp

- `(website)/not-found.tsx`: fallback cho `notFound()`, kể cả đường dẫn không tồn tại được catch-all xử lý. Next quản lý HTTP status.
- `(website)/error.tsx`: lỗi render/tải nội dung, nút thử lại dùng `router.refresh()` và `reset()` như luồng trước.
- `app/global-error.tsx`: lỗi ngoài boundary trang, tự có html/body, font và bố cục độc lập; nút thử lại tải lại trang. Không hiển thị error message/digest nội bộ.
- `/401`, `/403`, `/429`, `/loi-he-thong` (giao diện 500), `/503`: **trang thông báo**, trả về trang thông thường khi mở trực tiếp; metadata `noindex, nofollow`. Chúng không phải route trả HTTP tương ứng hoặc cơ chế xác thực/phân quyền. API vẫn trả status và JSON theo luồng hiện tại. Không thêm middleware hay bật `authInterrupts` experimental.
- Không tạo route App Router `/500`: trùng đường dẫn với trang 500 mặc định trong bước export của Next.js 15.5.25, gây lỗi thiếu `.next/export/500.html`. Trang minh họa dùng `/loi-he-thong`; lỗi thực tế vẫn do `error.tsx` và `global-error.tsx` xử lý.
- `/401`: nút đăng nhập mở hộp đăng nhập Sale hiện có qua context.
- Sale login: `ErrorNotice` dùng cùng phong cách; lời nhắc 401 hết phiên và 403 thiếu quyền được phân biệt. Quy trình xác thực/retry không thay đổi.

Các lỗi do Cloudflare/Nginx trả trước Next.js cần cấu hình riêng ở hạ tầng. Các tiện ích và trình chiếu TV tiếp tục xử lý lỗi tại chỗ theo luồng của từng tính năng.

## Kiểm tra

- `npm.cmd run typecheck`: đạt.
- Build sạch bằng `npm.cmd run build`: đạt sau khi chuyển `/500` sang `/loi-he-thong`; Next tạo đủ 15/15 trang tĩnh và hoàn tất đóng gói. Lần kiểm tra này ghi đè `API_URL` và `NEXT_PUBLIC_API_URL` trong tiến trình build bằng `http://127.0.0.1:9`, không chỉnh `.env.local`. Cần build lại với cấu hình triển khai trước khi dùng artifact này để chạy/deploy. Các warning ESLint có sẵn ở component ảnh và VehicleModelOptions vẫn còn.
- Kiểm tra component bằng render HTML riêng và Chrome local ở 1440px/390px: sáu mã lỗi và hai trường hợp standalone, không tràn ngang, chiều cao nút tối thiểu 44px. Chỉ phục vụ CSS/font local, không gọi API hoặc đọc `.env`.
- Đã kiểm tra giao diện component và quá trình production build; chưa chạy kiểm thử toàn luồng trên Next server hoặc cấu hình proxy đang triển khai.
