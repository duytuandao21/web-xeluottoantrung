# Màn hình bảng giá `/TV`

- Mở **`/TV`** (chữ hoa), bật toàn màn hình trình duyệt bằng F11 nếu thiết bị hỗ trợ. Trang chiếm viewport; không tự ép fullscreen vì trình duyệt yêu cầu thao tác người dùng.
- Thiết kế chính cho TV ngang 16:9: hai cột, ba hàng, tối đa sáu xe/lượt. Có bố cục dọc dự phòng. Lượt cuối giữ đúng số xe còn lại, không nhân bản hoặc tạo xe để lấp chỗ.
- Logo mặc định lấy từ site settings; có thể đặt logo riêng trong TV Display. Hotline mặc định đồng bộ các liên hệ tư vấn bán hàng đang hoạt động từ Nút gọi, hoặc dùng danh sách riêng. Font SF Regular/Bold và chất lượng CDN dùng lại nguồn hiện có. QR được chép nguyên bản vào `public/TV/QR-xeluottoantrung.svg`; không gọi dịch vụ tạo QR ngoài.
- Header: **logo showroom | tiêu đề và hãng đang chiếu | Quét mã xem xe + QR**. Footer: **logo hãng và số xe | icon điện thoại → tiêu đề hotline → số luân phiên trên cùng một dòng**. Không còn dòng “Xem thêm xe tại xeluottoantrung.com”; không thay nội dung URL được mã hóa trong QR.
- Chỉ lấy xe public có trạng thái **active/đang bán**; loại xe ẩn, đã bán, đã nhận cọc. Lấy đủ các trang API, tối đa 100 xe/request; không gọi detail/gallery từng xe và không lộ biển số, SKU hay dữ liệu sale.

## Hiển thị theo hãng — 23/10/2026

- Header giữ chiều cao cũ, chia vùng giữa thành tiêu đề và dải đỏ có logo/tên hãng, không thêm tiền tố “Hãng”. Logo showroom, tiêu đề, QR, cụm hotline ở footer và các ô thẻ giữ vị trí cố định. Dải hãng fade cùng lượt xe khi chuyển hãng; khi còn cùng hãng thì giữ nguyên. Hotline vẫn chạy theo timer độc lập.
- Dải đỏ tự thu vừa hãng có nội dung rộng nhất trong snapshot đang chiếu (tính cả chỗ logo, khoảng cách và padding), giữ cùng chiều rộng qua các lượt. CSS grid dùng nhãn ẩn chồng cùng ô để tính kích thước, không tải logo ẩn hoặc đo DOM bằng JavaScript theo từng frame. Chiều cao header, chữ và vị trí thẻ xe không đổi.
- Footer chỉ hiện **logo hãng | số xe đang bán của hãng đang chiếu**, không thêm tên hãng hoặc chỉ báo trang hiện tại/tổng trang. Đếm toàn bộ xe active của hãng trong snapshot, không chỉ sáu xe ở lượt hiện tại và không tính xe nhận cọc. Logo được tăng kích thước nhưng khung footer/lưới xe giữ nguyên. Hai buffer footer chờ load/decode và fade cùng hãng; logo header/footer dùng cùng `srcset/sizes/currentSrc` để tái sử dụng candidate. Hãng thiếu logo vẫn giữ ô trống và số lượng; không thêm API read.
- QR dùng nguyên SVG và quiet zone có sẵn, không crop hoặc thay nội dung. QR hiện ở góc phải header, cạnh dòng “Quét mã xem xe”; kích thước hiện tại **14vh** ở màn ngang, **10vh** ở màn dọc (giới hạn theo chiều rộng cột, chú thích nằm dưới mã). Khung QR được phép tận dụng phần padding dọc của header, không ép grid tăng chiều cao. Hotline chuyển xuống footer, vẫn dùng cấu hình và hiệu ứng đổi số hiện có. Không tăng vùng header/footer hoặc lấn vào thẻ xe; chưa xác minh khoảng cách quét trên TV vật lý.
- Cụm hotline xếp một hàng icon → tiêu đề → số điện thoại, căn phải; lề phải footer màn ngang giảm 0,8vw để dịch cụm sang phải nhẹ (15,36 px ở Full HD). Production build (gồm lint/typecheck) và runner đầy đủ đạt sau chỉnh sửa: QR/hotline không tràn khung, không cắt chữ, vùng thẻ giữ kích thước cũ ở HD/Full HD/4K/dọc. Header/thẻ lệch 0 px qua các lần chuyển; đổi số 5s, cấu hình riêng, tiêu đề dài/số quốc tế, refresh, ảnh chậm/lỗi, reduced motion và vòng chiếu đều đạt. Kết quả hiện tại ở `artifacts/tv-display/results.json`; browser/server kiểm thử được đóng, không triển khai production.
- Tinh chỉnh sau lượt kiểm tra trên: lề phải footer màn ngang hiện còn **0,15vw**, dịch hotline thêm **0,65vw** (12,48 px ở Full HD). Tiếp tục thu phần trống của khung số từ 13ch xuống **12,5ch** để cả cụm tiến thêm sang phải mà không vượt mép màn hình; số dài vẫn dùng cơ chế tự fit hiện có. Chỉ kiểm tra diff cho các thay đổi khoảng cách này, không chạy lại build/runner; kết quả runner ở trên thuộc bản trước các lần dịch thêm.
- Sau khi tăng QR từ 12,5vh lên 14vh: build (gồm lint/typecheck) và `node scripts/tv-display-check.mjs --smoke` đạt trên HD/Full HD/4K/dọc. Full HD: QR **151,2 px** thay cho 135 px, header vẫn **162 px**. QR và chú thích nằm trọn trong header, vùng thẻ giữ nguyên, hotline một hàng không tràn/cắt chữ, không page error. Kết quả ở `artifacts/tv-display/smoke-results.json`; không chạy lại các ca quay vòng dài vì không đổi lifecycle. Browser/server kiểm thử đã đóng, chưa deploy.
- Nhóm theo `brand.slug` thực tế trong API, không suy ra từ chữ đầu tên xe. Thứ tự lấy đúng như bộ lọc: số xe public còn trong kho (**active + deposit**) giảm dần, rồi `sortOrder`, tên và ID hãng. Chỉ xe **active** được chiếu; hãng chỉ có xe nhận cọc sẽ không tạo lượt trống.
- Chiếu hết một hãng rồi mới sang hãng khác, giữ thứ tự xe hiện có bên trong mỗi hãng. Mỗi lượt tối đa sáu xe; lượt cuối ít xe giữ nguyên các ô còn lại trống, không bù bằng hãng khác hoặc nhân bản. Số lượt là `sum(ceil(activeCarsOfBrand / 6))`, khác với chia tổng kho xe cho sáu. Ví dụ 8/7/1 xe tạo các lượt **6 → 2 → 6 → 1 → 1** rồi quay về đầu.
- Vòng chiếu chạy liên tục từ lượt cuối về lượt đầu có xe active; bỏ hãng rỗng ở cả đầu/giữa/cuối catalog. Khi đồng bộ năm phút, tiếp tục theo hãng/lượt đang chiếu trong snapshot mới, không reset về đầu khiến vòng dài bị gián đoạn. Nếu hãng thu nhỏ thì giới hạn vị trí theo số lượt mới; nếu mất hết xe thì sang hãng còn xe tiếp theo hoặc quay về đầu. Không đổi lịch đọc API hoặc thêm request khi quay vòng.
- Sửa trường hợp effect khởi động lại khi nhận `initial` mới: state hai buffer cũ còn token của lượt đang chiếu nhưng trước đây hàm chuẩn bị luôn chờ token 0, khiến vòng chiếu dừng vô hạn. Lần khởi động lại giờ dùng token mới tăng liên tục và reset buffer khớp; cleanup xóa các style fade đang dở. Lần mở trang thông thường vẫn giữ buffer SSR/token 0, không tạo lại ảnh không cần thiết. Harness local dùng React production tái hiện trước sửa **a → b → c**, nhận props mới rồi **c → c → c → c**; sau sửa là **a → b → c → a** sau khi nhận props mới, không page error. Dữ liệu và tooling đối chứng nằm ở `artifacts/tv-cycle-lifecycle/before.json`, `after.json`, `check.mjs`; đây không phải trace trên TV production.
- Trang đầu vẫn dùng GET `/cars`, thêm `view=tv`; API trả `meta.tvBrands` gồm logo, thứ tự và số xe. Truy vấn tổng hợp theo hãng **thay thế SELECT count cũ**, không thêm SELECT hoặc request `/brands`. Các trang API sau không truyền `view`; public listing, Admin và Sale giữ response cũ khi không có `view=tv`. View này chỉ chấp nhận trang đầu public active không kèm bộ lọc.
- Vẫn hai SELECT/trang danh sách. Với 128 xe vẫn hai GET danh sách + bốn GET settings + một GET Nút gọi. Không đọc API/database khi chuyển hãng, chuyển lượt hoặc số điện thoại. Giữ refresh năm phút và cache settings/liên hệ hiện tại. Nhóm/phân trang trong bộ nhớ được tái sử dụng theo snapshot; không có vòng quét layout hay API mỗi frame. Đây là kiểm chứng **số request/SELECT**, không phải cam kết CPU query bằng tuyệt đối truy vấn count trước đó; chưa benchmark tải production.
- Chỉ chuẩn bị ảnh xe và logo hãng của lượt hiện tại/kế tiếp, chờ load/decode trước chuyển đồng thời. Logo lấy từ catalog hiện có, không gọi dịch vụ logo. Transform logo lỗi thử original; nếu vẫn lỗi chỉ ẩn logo, giữ tên hãng. Hãng không có ảnh chỉ hiện tên. Không tải ảnh/logo của toàn bộ kho trước khi mở màn hình.
- Nếu có hãng mới xuất hiện giữa hai trang dữ liệu đang đọc, giữ xe đó và nối hãng vào cuối snapshot thay vì gọi lại API hoặc làm mất xe; refresh kế tiếp khôi phục thứ tự đầy đủ. Snapshot phân trang vẫn có giới hạn nhất quán như trước, không phải transaction toàn kho.
- **Thứ tự cập nhật khi triển khai sau này: API trước, Web sau.** API mới vẫn tương thích Web cũ. Web mới cần `meta.tvBrands`; API cũ chưa hỗ trợ sẽ bị coi là dữ liệu chưa sẵn sàng, không tự gọi thêm `/brands`. Không có schema/migration, dependency hoặc env mới; không cần đổi Admin TV Display.

### Kiểm tra và rollback phần hãng

- Web: `node scripts/tv-pages-check.mjs` và production browser runner `node scripts/tv-display-check.mjs`. Runner hiện lưu ảnh/JSON/log vào **`artifacts/tv-display/`** (gitignore), thay vì ghi đè các capture lịch sử được track trong `.tmp/tv-display/`.
- Kiểm tra sửa vòng chiếu: build (gồm lint/typecheck), typecheck riêng và unit đạt. `node scripts/tv-display-check.mjs --rotation-only` đạt: ba vòng không thêm API read; hai vòng qua mười lần đồng bộ năm phút giả lập; nhận lại server props qua Next router không bị đứng; hãng rỗng đầu/giữa/cuối bị bỏ qua; ảnh/logo chậm/lỗi, cập nhật giá/cấu hình và giữ dữ liệu khi mất kết nối vẫn đạt. Header/thẻ/footer lệch 0 px qua 15.728 frame mẫu. Các ca bốn viewport cũng đạt trong lượt kiểm tra trước đó; không coi lượt full runner bị dừng vì harness là full PASS. Kết quả cuối tại `artifacts/tv-display/rotation-results.json`.
- Harness đã thay chờ `response.finished()` của Flight stream bằng chờ token buffer và DOM được commit, đồng thời chờ class footer active thay vì text đang fade. Thêm watchdog năm phút để đóng browser khi runner bị treo. Các điểm chờ này là lỗi kiểm thử được xử lý riêng; không quy chúng thành lỗi mạng/production. Browser và server do lần kiểm tra cuối tạo đã đóng; không deploy hoặc tăng tần suất refresh/API.
- API: `npx.cmd tsc -p tsconfig.test.json`, rồi `node --test .test-dist/test/tv-brand-view.test.js .test-dist/test/public-query-optimization.test.js .test-dist/test/cars.test.js`. PGlite tạm kiểm tra thứ tự khớp bộ lọc, deposit/sold/hidden/deleted/inactive, totals/pagination, logo, giới hạn view và đúng hai SELECT, HTTP DTO và contract thường không đổi. Không kết nối database thật.
- Kết quả: Web/API build, lint và typecheck đạt; Web còn bốn warning cũ ngoài TV. Năm bài API đạt; unit phân trang đạt; runner trình duyệt đầy đủ đạt ở 1366×768, 1920×1080, 3840×2160 và 1080×1920. Header/lưới/ô thẻ lệch **0 px**, không frame trống hay ảnh xe chưa sẵn sàng. Ca ba hãng qua 6/2/6/1/1 xe và quay về đầu đạt; giữ hãng trước khi logo sau tải chậm, logo lỗi vẫn hiện tên; hotline 5s, refresh cấu hình/giá/xe, lỗi kết nối, ảnh chậm/hỏng và reduced motion vẫn đạt. Không thêm API read khi chuyển hãng/lượt/số. Các ca dùng mock/PGlite local, chưa kiểm tra TV vật lý hoặc benchmark CPU database production. Server/browser kiểm thử đã đóng.
- Rollback riêng phần hãng: hoàn tác các thay đổi grouping/ribbon và snapshot trong Web (`TVDisplay.tsx`, `tv.css`, `tv-data.ts`, `tv-pages.ts`, `tv-images.ts`, `types/tv.ts`, fallback `TV/page.tsx`), build/cập nhật Web trước; sau đó có thể bỏ `view=tv`/aggregate trong API. Không xóa toàn bộ module TV, không hoàn tác quản lý TV Display/hotline, không đổi DB hoặc cấu hình CDN. API có thể giữ view khi quay lại Web cũ.

## Lịch tải và độ mới

- Giá cũ tạm ẩn riêng trên `/TV`; giá bán hiện tại vẫn hiển thị. Để bật lại, đổi `SHOW_ORIGINAL_PRICE` thành `true` trong `components/tv/TVDisplay.tsx` rồi build lại Web. Dữ liệu `originalPrice`, điều kiện giảm giá và style giá cũ vẫn được giữ.
- Chuẩn bị fonts, logo và sáu ảnh hiện tại trước khi mở bảng giá. Sau đó chuẩn bị lượt kế tiếp trong lớp ẩn. Chỉ hai lớp ảnh tồn tại; không tải trước ảnh của toàn bộ kho xe.
- Mỗi lượt mặc định hiển thị ít nhất 15 giây; Admin có thể đặt 5–300 giây. Nếu ảnh kế chưa tải/decode xong, giữ lượt hiện tại rồi mới chuyển bằng GSAP. Transform lỗi thử ảnh gốc; ảnh gốc lỗi dùng khung ảnh dự phòng có nhãn. Không tạo khoảng ảnh trống rồi chèn ảnh trễ sau chuyển cảnh.
- Giảm chuyển động: đổi lượt trực tiếp, vẫn chờ ảnh. Không có render loop liên tục; GSAP chỉ chạy khi đổi lượt. Timer/animation/request có cleanup khi rời trang.
- Kiểm tra lại toàn bộ dữ liệu mỗi **5 phút** khi tab đang hiển thị; không gọi API theo chu kỳ 15 giây. Request refresh có timeout 20 giây. Dữ liệu mới áp dụng ở lần chuyển kế tiếp sau khi ảnh sẵn sàng.
- Đây là snapshot phục vụ màn hình TV, **không phải giá/trạng thái realtime**: thay đổi Admin có thể chậm khoảng 5 phút cộng thời gian còn lại của lượt hiện tại và chuẩn bị lượt mới. Muốn thấy ngay thì tải lại `/TV`. Không thay cache HTML hoặc chính sách invalidation của website chính.
- Khi lỗi kết nối, giữ snapshot thành công cuối cùng trong bộ nhớ và hiện thời điểm dữ liệu. Không biến lỗi API thành thông báo kho xe trống. Tải lại trình duyệt khi đang offline sẽ không phục hồi được snapshot cũ; không có service worker/localStorage cache kho xe.
- Với N xe, một lần đọc cần `ceil(N/100)` request danh sách + bốn request settings + một request danh sách Nút gọi. Settings và danh sách liên hệ tận dụng cache/invalidation hiện có của NestJS. Các GET vẫn có chi phí, không tuyên bố tải database bằng 0. Không có warm-cache job hoặc polling mỗi xe/số điện thoại.

## Quản lý trong Admin — TV Display

- Mục **TV Display** trên sidebar, URL Admin **`/tv-display`**. Giao diện dùng cùng PageHeader, Button, Input, ImageUpload, màu/theme/card và hệ thống phân quyền hiện tại.
- Quản lý logo riêng, tiêu đề bảng giá, tiêu đề hotline, thời gian chuyển xe, thời gian chuyển số và danh sách hotline có thứ tự. Để trống logo riêng sẽ dùng logo Web. Thay/xóa logo riêng giữ quy trình nhấn ×, lưu và cleanup hiện có; không xóa logo dùng chung nếu vẫn được tham chiếu.
- Mặc định đồng bộ **tất cả số hợp lệ của liên hệ active có mô tả “Tư vấn bán hàng”** trong Nút gọi, giữ thứ tự nguồn, bỏ số trùng. Không gộp thu mua/thẩm định/khiếu nại hoặc liên hệ ẩn. Không có số phù hợp thì dùng hotline chung của Web; có fallback cuối khi dữ liệu cũ không hợp lệ.
- Có thể tắt đồng bộ để sửa/thêm/xóa/sắp xếp danh sách riêng cho TV (tối đa 30 số, 9–12 chữ số, hỗ trợ dấu +). Khi tắt lần đầu, tự điền danh sách tư vấn hiện có để Admin chỉnh tiếp. Thay danh sách riêng không sửa Nút gọi.
- Hotline mặc định chuyển **mỗi 5 giây**, có thể đặt **2–120 giây**. Component GSAP và timer tách riêng với xe; không gọi API hoặc dựng lại thẻ xe mỗi lần đổi số. Khung số cố định, hỗ trợ reduced motion và dừng timer/animation khi unmount; tab ẩn không chạy chuyển số.
- Tiêu đề dài tự co trong vùng header khi cần, sau khi font sẵn sàng hoặc đổi kích thước; không tạo vòng đo layout theo animation/frame. Không thay font hoặc chiều cao header. Tên xe trên thẻ giữ cách hiển thị hiện có.
- Cấu hình lưu nguyên khối JSON tại **`site_settings` group `tv-display`, key `config`** qua `GET /admin/site-settings/tv-display`, `PUT /admin/site-settings/tv-display/config`. Chỉ cần `content.read` để xem, `content.update` để sửa. API kiểm tra đầy đủ cấu hình trước giao dịch; lưu sai không thay dữ liệu hiện tại. Upload logo tận dụng endpoint media hiện có.
- Public Web đọc `GET /site-settings/tv-display` cùng danh sách liên hệ khi SSR hoặc refresh 5 phút. Không đọc cấu hình theo chu kỳ chuyển số/chuyển xe. API memory cache 5 phút, HTTP `no-store`; mutation Admin vẫn invalidation theo interceptor hiện có. Lỗi cấu hình/API trong refresh giữ snapshot tốt trước đó, không thay bằng kho xe trống.
- Lưu Admin chưa tác động ngay tới TV đang mở: đợi lần refresh kế tiếp, thời gian còn lại của lượt hiện tại và chuẩn bị ảnh. Tải lại `/TV` để đọc ngay. Việc lưu cấu hình không đổi trang Web thường, giá xe, danh sách xe hoặc lịch gọi API của các module khác.
- Không thêm schema, migration, dependency hoặc env. Chưa ghi cấu hình vào database thật hoặc deploy; khi triển khai cần build/cập nhật API, Admin và Web. Lần đầu chưa có setting vẫn dùng mặc định 15s/5s, logo Web và danh sách tư vấn bán hàng.

### Kiểm tra và rollback cấu hình quản lý

- API: `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint`; `npx.cmd tsc -p tsconfig.test.json` rồi `node --test .test-dist/test/tv-display.test.js`. Tests dùng PostgreSQL PGlite tạm trong bộ nhớ, không gọi database/R2 thật; kiểm tra validation, lưu nguyên khối, giữ dữ liệu khi lỗi, audit, cleanup logo, permission metadata và cache policy.
- Admin: build/lint/typecheck; `node scripts/tv-display-admin-check.mjs` dùng production build ở cổng 3102, mock auth/API/upload. Kiểm tra 390/768/1440 px, thứ tự số, nguồn sale, chống trùng, lưu/tải lại, retry giữ form/file và không upload trùng, xóa logo theo dấu ×, quyền chỉ xem. Artifacts tại `../.tmp/tv-display-admin/`. Không dùng token đăng nhập thật.
- Web: runner TV kiểm tra 5s riêng, 8s/3s cấu hình mẫu, header dài, cấu hình/ảnh logo mới trong refresh, và các ca TV trước đó. Artifacts tại `.tmp/tv-display/`. Không coi các fixture này là benchmark production hoặc kiểm tra Smart TV vật lý.
- Rollback phần quản lý: hoàn tác riêng page/API helper và dòng sidebar TV Display của Admin, validator/hook/allowlist `tv-display` của API, các phần cấu hình/hotline của Web về bản trước tính năng này; build lại từng ứng dụng. Giữ các thay đổi TV trước đó. Setting JSON có thể để lại không dùng; không cần xóa bảng hay rollback migration. Nếu chỉ đổi cấu hình, sửa lại các trường trong Admin rồi lưu, không cần rollback code.

Kết quả kiểm tra phần quản lý ngày **23/10/2026**: build/lint/typecheck cả ba repository đạt (Web còn bốn warning cũ, Admin còn 12 warning cũ, API không warning). Ba bài API test đạt. Admin browser test đạt ở 390/768/1440 px. Web runner cuối đạt toàn bộ, gồm 5s độc lập, cấu hình 8s/3s, tiêu đề dài/số quốc tế, cập nhật cấu hình và fallback logo lỗi, ảnh chậm/hỏng, refresh lỗi, reduced motion và vòng cuối ít xe. Qua bốn lần chuyển ở HD/Full HD/4K/dọc, header và thẻ xe lệch **0 px**; không có frame trống/ảnh chưa sẵn sàng hoặc API read theo mỗi lần chuyển. Chỉ mock/PGlite local; không triển khai hoặc ghi database production. Browser và server kiểm thử được đóng sau khi chạy.

## Tách layout

Các route website được chuyển nguyên nội dung vào `app/(website)/`; URL vẫn giữ nguyên. Root layout cũ giữ nguyên khung/stylesheet/provider, chỉ chỉnh đường import `../globals.css`. `/TV` dùng root layout riêng `app/(display)/layout.tsx`, không nạp khung header/footer, sale provider, popup, chatbot hoặc 14 CSS legacy.

Đây là [route groups của Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups); chuyển giữa hai root layout là navigation toàn trang. Hiệu ứng dùng [GSAP timeline](https://gsap.com/docs/v3/GSAP/Timeline/). Không thêm dependency mới. `/TV` có `noindex,nofollow` và không thêm vào sitemap.

## Kiểm tra local

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
node scripts/tv-display-check.mjs
```

Runner dùng production build ở cổng 3117 và mock API local cổng 4127, ảnh fixture local; không ghi database hoặc gọi origin R2. Tự đóng browser/server khi xong. Không chạy runner nếu hai cổng này đang được dùng. Ảnh fixture không phải kiểm chứng toàn bộ dữ liệu xe thực.

Kiểm tra: Full HD/HD/4K/dọc; phân trang API vượt 100 xe; ảnh sẵn sàng trước chuyển; mạng ảnh chậm; ảnh hỏng; không gọi API khi đổi lượt; refresh giá/xe sau năm phút; mất kết nối giữ dữ liệu cũ; reduced motion; khung trang Giới thiệu vẫn có header/CSS website. Screenshots và JSON tại `.tmp/tv-display/`. Không phải benchmark production, PSI hay kiểm tra trên Smart TV thật.

Một số script hiệu năng lịch sử đã được cập nhật đường đọc source theo route group. Riêng `css-build-baseline.mjs` chặn dùng artifact root layout cũ để tránh so sai hoặc tạo layout lồng; cần baseline mới nếu mở lại thí nghiệm CSS.

## Rollback riêng tính năng

1. Gỡ `app/(display)`, `app/api/tv`, `components/tv`, `lib/tv-data.ts`, `lib/tv-images.ts`, `types/tv.ts`, `public/TV` và runner/tài liệu TV.
2. Chuyển **các route hiện hành** từ `app/(website)/` về `app/`, đổi import layout về `./globals.css`. Không ghi đè file hoặc khôi phục từ HEAD vì có thay đổi Giới thiệu và công việc khác từ trước.
3. Hoàn tác riêng thay đổi đường đọc source của các script rồi build lại. Không có migration, env hay cấu hình CDN/R2 phải rollback.

Chưa deploy production.

## Kết quả kiểm tra — 23/10/2026

- Production build, lint và typecheck đạt; lint còn bốn warning có sẵn ngoài module TV.
- 1366×768, 1920×1080, 3840×2160 và 1080×1920: sáu thẻ, ảnh sẵn sàng, không tràn khung/cắt ngang chữ, không có khung website hoặc CSS legacy.
- Fixture 128 xe được lấy bằng hai trang API. Khi có quản lý TV Display, mỗi lượt render dùng hai GET danh sách + bốn GET settings + một GET liên hệ; không có GET chi tiết xe hoặc request API do chuyển lượt/đổi số.
- Ảnh lượt sau bị giữ quá 15 giây: lượt hiện tại tiếp tục hiển thị; chỉ chuyển khi ảnh được giải phóng và decode xong. Transform/original trả lỗi dùng ảnh dự phòng.
- Refresh năm phút cập nhật giá và loại xe đã gỡ; API lỗi giữ snapshot trước và hiện nhãn thời điểm. Đồng hồ kiểm thử được tăng tốc riêng cho ca năm phút; chờ HTTP/body/React commit tách riêng để không nhầm response headers với UI đã cập nhật.
- Quay đủ 13 xe qua ba lượt, gồm lượt cuối một xe, rồi quay về đầu; danh sách rỗng và reduced motion đạt. Trang `/ve-chung-toi` vẫn có header và CSS website sau khi tách root layout.
- Các bài kiểm tra nội dung Giới thiệu và các invariant rollback/limiter/no-store/hero hiện có đạt. Bản build cuối dùng cấu hình API thật trong `.env.local`, không giữ rewrite tới mock server; không chỉnh `.env.local`.
- Các browser/server test đã được đóng; không chạy benchmark tải hoặc triển khai production. Chưa kiểm tra trên Smart TV vật lý.

### Header ổn định khi chuyển lượt

- Bỏ dòng tên/khẩu hiệu trên tiêu đề. Chỉ giữ “Bảng giá xe đang bán”, căn giữa trong khung header có chiều cao cố định theo viewport.
- Masthead được memo hóa riêng; thay lượt xe không dựng lại logo hoặc tiêu đề. Component hotline chỉ đổi hai lớp số trong khung cố định theo timer riêng. Khi cấu hình logo/hotline thực sự thay đổi, dữ liệu vẫn được cập nhật qua cơ chế refresh hiện có.
- Phép kiểm tra header ban đầu chỉ đo header/logo/tiêu đề/hotline qua hai lần chuyển, chưa đo chuyển động của thẻ xe. Kết quả 0 px của phép kiểm tra đó không chứng minh thẻ xe đứng yên.
- Production build/typecheck đạt sau thay đổi; không sửa API, lịch tải ảnh hoặc chu kỳ cập nhật dữ liệu.

### Giữ nguyên vị trí thẻ xe và nhấn tên hãng — 23/10/2026

- Tái hiện trên bản build trước sửa: header không dịch chuyển, nhưng thẻ xe nhìn thấy lệch tối đa **27,523 px** trong 656 frame mẫu ở 1920×1080. Timeline cũ có `y: -12` cho bảng cũ, `x: 28` cho bảng mới và `y: 18` cho từng thẻ. Đây là chuyển động được đặt trong GSAP; không có bằng chứng header bị tải lại trong ca này.
- Cố định masthead, vùng thẻ và footer vào các vùng viewport riêng. Hai lớp thẻ luôn dùng cùng lưới kích thước cố định, kể cả lượt cuối chỉ còn một xe.
- Chỉ fade opacity của bảng mới, không dịch chuyển hoặc stagger vị trí các thẻ. Bảng mới nằm trên bảng cũ trong cả hai hướng đổi buffer; bảng cũ giữ nguyên phía dưới tới khi fade xong. Commit lớp active trước khi xóa riêng các thuộc tính animation; không xóa toàn bộ inline style hoặc tạo transform cache dư.
- Lấy từ đầu tiên trong tên xe làm tên hãng, hiển thị lớn hơn **18%** và tăng nét nhẹ trên font Bold hiện có. Không đổi tên đã lưu, alt, title, API hoặc dữ liệu xe; phần tên còn lại hiển thị đầy đủ và được xuống dòng khi dài.
- Runner mở rộng đo header, stage, footer và từng ô thẻ trong từng frame, qua bốn lần chuyển để tái sử dụng cả hai buffer; kiểm tra cả chiều x/y và kích thước, không chỉ screenshot cuối. Đồng thời kiểm tra không có frame trống, ảnh chưa tải xong hoặc bảng mới bị lớp cũ che trong lúc fade.
- Lệnh đầy đủ `node scripts/tv-display-check.mjs` gồm phép kiểm tra vị trí ở cả bốn viewport và các ca ảnh chậm/lỗi, refresh, reduced motion, hết danh sách và quay lại đầu. `--header-only` chỉ chạy phần viewport/chuyển cảnh. JSON tại `.tmp/tv-display/results.json` và `header-results.json`; screenshot dùng ảnh fixture, chưa thay thế kiểm tra trên Smart TV thật.
- Bản cuối: build, lint, typecheck và runner đầy đủ đạt. Bốn viewport có 657–659 frame mẫu/ca qua bốn lần chuyển; header/stage/footer và thẻ xe lệch **0 px**. Ca quay vòng 13 xe có 4.179 frame mẫu, lượt cuối một xe rồi quay về đầu vẫn lệch **0 px**. Không ghi nhận frame trống, ảnh chưa sẵn sàng, fade bị che, tràn tên xe hoặc page error trong các ca này. Lint còn bốn warning có sẵn ngoài module TV; không có thay đổi production.
