# Hai banner trang chủ — 12/10/2026

## Thiết kế và file

Hai banner được chỉnh bằng **image_gen tích hợp**, dùng ảnh gốc làm đầu vào.
Nền được dàn lại kín chiều ngang; xe, tiêu đề và nút được đặt lại trong dải
ảnh rộng. Nội dung tiếng Việt và loại xe được đối chiếu trực quan với ảnh gốc.

Đo thực tế trước khi chỉnh: khung desktop 1440px có kích thước 800 × 80,36px,
tức gần 10:1. Tỷ lệ xuất cuối cùng được chốt theo khung này thay vì 8:1 ước
lượng từ ảnh chụp trước đó. Khung hiển thị dùng đúng tỷ lệ của hai bản WebP,
giữ toàn bộ ảnh và bỏ lớp nền mờ; mobile thu gọn theo cùng tỷ lệ.

| File trong `public/images/home-banners/` | Kích thước | Mục đích |
| --- | --- | --- |
| `ban-xe-banner-wide-v1.png` | 2172 × 214 | Bản PNG để kiểm tra/tải về |
| `mua-xe-banner-wide-v1.png` | 2172 × 214 | Bản PNG để kiểm tra/tải về |
| `ban-xe-banner-wide-v1.webp` | 1600 × 158 | Ảnh lớn trên website |
| `mua-xe-banner-wide-v1.webp` | 1600 × 158 | Ảnh lớn trên website |
| `ban-xe-banner-wide-v1-960.webp` | 960 × 95 | Nguồn responsive |
| `mua-xe-banner-wide-v1-960.webp` | 960 × 95 | Nguồn responsive |
| `ban-xe-banner-wide-v1-480.webp` | 480 × 47 | Nguồn responsive |
| `mua-xe-banner-wide-v1-480.webp` | 480 × 47 | Nguồn responsive |

WebP được xuất đồng tỷ lệ bằng Sharp, chất lượng 85 cho bản lớn và 90 cho
bản 480/960. Chỉ bỏ phần nền xám tạm của canvas làm việc trước khi xuất;
không dùng kéo giãn riêng chiều ngang để ép xe/chữ vừa ảnh.
Prompt qua từng lần chỉnh được lưu đầy đủ trong [prompts.json](prompts.json).

## Áp dụng

- `lib/home-banner-artwork.ts` chỉ nhận diện hai ảnh gốc qua đường dẫn và
  khóa CDN của ảnh. Banner khác được admin tải lên vẫn dùng ảnh của nó.
- Trang chủ thay URL của hai ảnh này bằng các bản mới và thêm `srcset`.
- Giữ thứ tự, link, tên banner và chu kỳ tự chuyển 7 giây đang có.
- Nguồn responsive được dùng cả khi hiển thị và khi chờ decode để autoplay.
- Bản gốc `/images/ban-xe-banner.png` và `/images/mua-xe-banner.png` vẫn có
  SHA-256 đúng như manifest ban đầu. Không cập nhật database hoặc CDN.

## Kiểm tra

- Lint các file TypeScript đã sửa: đạt.
- Typecheck toàn frontend: đạt.
- Chromium 13 viewport từ 320 đến 1920px: đạt; tổng chiều cao khung không
  tăng, hàng giá không tràn chữ, link/focus đúng, banner nằm dưới tìm kiếm.
- Hai ảnh mới tải được, tỷ lệ khung đúng, lớp nền mờ ẩn, có nguồn responsive.
- Autoplay chuyển ảnh sau khi decode; link của ảnh Bán xe vẫn là `/ban-xe`.
- Kiểm tra trực quan PNG và ảnh chụp trang tại 1440, 1024, 390px.

Chưa kiểm tra trên iPhone/Android thật. Trong kiểm thử trình duyệt, tài
nguyên CDN bên ngoài được chặn; xác minh tải ảnh ở đây áp dụng cho hai ảnh
banner mới được phục vụ từ frontend local.
