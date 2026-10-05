# CODEX IMPLEMENTATION PLAN — Tối ưu hiệu năng `web-xeluottoantrung`

## 0. MỤC TIÊU VÀ NGUYÊN TẮC BẤT BIẾN

Bạn đang làm việc trong repository:

`web-xeluottoantrung`

Backend tương ứng:

`api-xeluottoantrung`

Nhiệm vụ là tối ưu hiệu năng frontend dựa trên báo cáo audit `check.md`.

### MỤC TIÊU

Giảm:
- TTFB / thời gian chờ SSR.
- Request waterfall.
- Số request public không cần thiết tới API EC2.
- Payload initial page.
- Image/font/CSS/JS blocking.
- Hydration/client-side work không cần thiết.

Tăng:
- tốc độ hiển thị nội dung chính;
- tốc độ homepage, listing, detail và các route public;
- khả năng chịu latency khi API nằm trên EC2;
- cache hiệu quả nhưng vẫn đảm bảo dữ liệu đúng.

---

# RÀNG BUỘC QUAN TRỌNG NHẤT — KHÔNG ĐƯỢC THAY ĐỔI GIAO DIỆN HOẶC LOGIC

Website hiện tại đang hoạt động đúng.

Mọi tối ưu phải bảo toàn **100% behavior hiện hữu**.

## TUYỆT ĐỐI KHÔNG ĐƯỢC

- redesign UI;
- thay đổi layout;
- thay đổi màu sắc;
- thay đổi font-family hiển thị nếu chưa có phương án metric-compatible được xác minh;
- thay đổi spacing;
- thay đổi kích thước component;
- thay đổi responsive behavior;
- thay đổi animation/transition hiện tại;
- bỏ SiteIntro hoặc thay timing/UX của SiteIntro;
- thay đổi carousel behavior;
- thay đổi thứ tự section;
- thay đổi text/content;
- thay đổi filter behavior;
- thay đổi search behavior;
- thay đổi pagination/load-more behavior;
- thay đổi comparison behavior;
- thay đổi gallery/lightbox behavior;
- thay đổi sale/auth behavior;
- thay đổi URL/slug;
- thay đổi SEO semantics;
- thay đổi API contract;
- thay đổi database;
- thay đổi backend nếu phase đó không được yêu cầu;
- thay đổi admin;
- xóa legacy code chỉ vì trông không còn cần thiết;
- xóa CSS dựa trên phỏng đoán;
- xóa asset dựa trên phỏng đoán;
- đổi framework;
- thêm dependency lớn nếu không thực sự cần;
- thực hiện optimization mang tính speculative mà không có bằng chứng.

Nếu một optimization có nguy cơ thay đổi giao diện hoặc behavior, **không triển khai optimization đó**. Ghi nó vào báo cáo cuối cùng dưới mục `DEFERRED — REQUIRES MANUAL APPROVAL`.

### Quy tắc vàng

> Performance optimization phải trong suốt đối với người dùng.

Sau tối ưu, người dùng phải thấy và sử dụng website giống hiện tại, chỉ nhanh hơn.

---

# BASELINE TỪ `check.md`

Audit đã xác nhận các nhóm vấn đề chính:

1. Root layout chờ 11 public API requests.
2. Homepage có waterfall:
   `policies → cars → nhóm request → brands`.
3. Homepage cold có khoảng 25 unique GET kỳ vọng.
4. `generateMetadata` ở nhiều route gọi lại full page builder.
5. `no-store` được dùng quá rộng.
6. Server API wrapper không có deadline phù hợp.
7. Hero/banner/card/gallery còn tải nhiều image eager/original.
8. `images.unoptimized: true`.
9. Logo mặc định khoảng 4.1 MB.
10. SF Pro Regular + Bold khoảng 4.5 MB.
11. Gallery dùng cùng ảnh lớn cho main image và thumbnail.
12. 10 legacy CSS được load global.
13. Root/shared JS chứa dependency không cần cho mọi route.
14. Một số below-fold content vẫn block SSR.
15. Listing có lookup/facet request chưa tối ưu.
16. Detail page có các request nối tiếp và related content block body.
17. Có một số duplicate SSR/CSR request.
18. Legacy searchSnapshot có xử lý bị overwrite.

Không được giả định rằng tất cả vấn đề trên đóng góp bằng nhau. Sau mỗi phase phải đo/kiểm tra lại.

---

# CHIẾN LƯỢC TRIỂN KHAI

Không tối ưu tất cả trong một lần.

Thực hiện lần lượt:

- Phase 0 — Baseline & safety
- Phase 1 — Cache public data
- Phase 2 — Homepage request parallelization
- Phase 3 — Root layout critical path
- Phase 4 — Metadata loaders
- Phase 5 — Defer non-critical SSR sections
- Phase 6 — Listing/filter/detail request optimization
- Phase 7 — Image/media optimization
- Phase 8 — Font optimization
- Phase 9 — JS/client boundary optimization
- Phase 10 — CSS optimization an toàn
- Phase 11 — Duplicate request/runtime cleanup
- Phase 12 — Final validation & report

**Hoàn thành và kiểm tra từng phase trước khi sang phase tiếp theo.**

Nếu một phase gây regression, revert phần regression trước khi tiếp tục.

---

# PHASE 0 — BASELINE & SAFETY

## Mục tiêu

Hiểu trạng thái trước tối ưu và tạo guardrails.

### 0.1 Đọc trước

Đọc:
- `check.md`
- `package.json`
- `next.config.*`
- `app/layout.tsx`
- `app/page.tsx`
- `app/[...slug]/page.tsx`
- `lib/public-api.ts`
- `lib/public-pages.ts`
- metadata helpers
- shared layout components
- car/listing/gallery components
- styles/fonts/image configuration

### 0.2 Không sửa UI

Chụp lại về mặt code/behavior các yếu tố:
- section order;
- className chính;
- markup cần cho CSS legacy;
- carousel settings;
- breakpoints;
- filter params;
- pagination;
- animation timing;
- SiteIntro timing;
- gallery behavior;
- compare behavior.

Không cần tạo screenshot nếu môi trường không hỗ trợ.

### 0.3 Baseline build

Chạy các lệnh project hiện có, ví dụ:

```bash
npm run build
```

Nếu có lint/typecheck/test script sẵn thì chạy.

Không cài dependency chỉ để benchmark.

Nếu build hiện tại fail do lỗi có sẵn:
- ghi nhận;
- không tự ý sửa lỗi không liên quan;
- tiếp tục những phần có thể xác minh an toàn.

### 0.4 Git safety

Trước thay đổi:

```bash
git status
```

Không commit/push.

---

# PHASE 1 — CACHE PUBLIC DATA

## Mục tiêu

Giảm việc mỗi SSR request lại gọi EC2 cho dữ liệu public ít thay đổi.

### 1.1 Phân loại dữ liệu

Giữ realtime/private:

- auth;
- sale/private;
- POST leads;
- newsletter;
- dữ liệu cá nhân;
- plate/private information;
- thao tác search/detail mang tính user-specific.

Không shared-cache các dữ liệu này.

### 1.2 Public inventory — cache ngắn hoặc invalidation-aware

Các nhóm:
- cars;
- car detail;
- accessories;
- accessory detail;
- related cars.

Nếu repo hiện chưa có invalidation mechanism từ admin/API, **không tự phát minh một cross-repo protocol có thể phá contract**.

Ưu tiên cơ chế an toàn:
- cache TTL ngắn;
- hoặc Next cache/tag nếu có thể triển khai hoàn toàn trong web mà không đổi contract.

Dữ liệu tồn kho/giá/status phải có freshness hợp lý.

Không để cache khiến xe đã bán vẫn hiển thị quá lâu.

### 1.3 Public stable data — cache lâu hơn

Ứng viên:
- brands;
- models;
- versions;
- body styles;
- transmissions;
- colors;
- branches;
- regions;
- services;
- slides;
- testimonials;
- site settings;
- branding;
- SEO;
- content groups;
- FAQs;
- recruitment;
- published informational content.

Ưu tiên cache theo URL/query/key chính xác.

Không cache nhầm giữa:
- brand khác nhau;
- model khác nhau;
- query/filter khác nhau;
- pagination khác nhau.

### 1.4 React cache vs Data Cache

Không nhầm:
- React `cache()` chỉ dedupe trong phạm vi phù hợp;
- persistent/revalidation cache giữa request là vấn đề khác.

Thiết kế rõ helper.

### 1.5 Cache failure behavior

Cache không được:
- nuốt lỗi giá/tồn kho critical;
- trả dữ liệu private cho user khác;
- dùng key thiếu query parameter.

### Validation Phase 1

Kiểm tra:
- homepage;
- listing;
- car detail;
- accessories;
- utility;
- metadata.

Đảm bảo dữ liệu đúng và UI không thay đổi.

---

# PHASE 2 — HOMEPAGE REQUEST PARALLELIZATION

## Mục tiêu

Loại waterfall không có dependency thật.

Audit đã phát hiện luồng gần như:

```text
policies
   ↓
snapshot
   ↓
cars
   ↓
slides/lookups/content/testimonials...
   ↓
brands
```

### 2.1 Phân tích dependency trước khi sửa

Với từng request:
- request nào thật sự cần kết quả trước;
- request nào độc lập;
- request nào chỉ dùng below fold.

Chỉ parallel request độc lập.

### 2.2 Khởi tạo request độc lập sớm

Các dữ liệu như:
- hero slides;
- content groups;
- testimonials;
- lookup stable;
- brands;
- banner;
- steps;

không được chờ `cars` nếu không phụ thuộc cars.

Dùng `Promise.all`/promise reuse phù hợp.

### 2.3 Không làm tăng fan-out mất kiểm soát

Parallelization không có nghĩa phát hàng trăm request đồng thời.

Giữ pagination/concurrency hợp lý.

### 2.4 Preserve exact output

Kết quả HTML/data cuối cùng phải tương đương trước tối ưu:
- cùng section;
- cùng order;
- cùng dữ liệu;
- cùng fallback.

Không đổi UI để tối ưu.

### Validation Phase 2

So sánh trước/sau:
- request count;
- server render timing nếu đo được;
- homepage content;
- hero;
- cars;
- filters;
- testimonials;
- accessories;
- footer.

---

# PHASE 3 — ROOT LAYOUT CRITICAL PATH

## Mục tiêu

Không để dữ liệu footer/non-critical giữ toàn bộ route chờ không cần thiết.

Audit cho thấy root layout hiện đợi khoảng 11 request.

### 3.1 Phân loại root data

Critical:
- dữ liệu thực sự cần để render header/navigation/logo/contact ban đầu.

Non-critical:
- footer-only;
- showroom/footer branches;
- regions;
- social links;
- app links;
- các nội dung chỉ xuất hiện cuối trang.

### 3.2 Ưu tiên cache trước khi tái cấu trúc

Nếu cache stable data đủ giải quyết latency, chọn giải pháp ít invasive nhất.

### 3.3 Streaming/defer chỉ khi giữ nguyên UI

Có thể dùng Suspense/server component boundary nếu:
- layout cuối cùng giống hệt;
- không gây CLS đáng kể;
- không flash content;
- không thay animation;
- không đổi DOM contract mà legacy JS/CSS phụ thuộc.

Nếu không đảm bảo, giữ cấu trúc UI và chỉ cache/parallel.

### 3.4 Không thay footer/header

Không redesign hoặc thay markup/class nếu không cần thiết.

---

# PHASE 4 — METADATA LOADERS

## Mục tiêu

Không dựng toàn bộ page chỉ để lấy metadata.

### 4.1 Tách metadata data requirement

`generateMetadata` chỉ nên lấy dữ liệu cần cho:
- title;
- description;
- canonical;
- robots nếu có;
- OpenGraph;
- image;
- SEO settings.

### 4.2 Không gọi full page builder nếu không cần

Tạo loader tối thiểu hoặc reuse data loader nhẹ.

### 4.3 Dedupe theo request

Nếu page và metadata cần cùng một entity:
- chia sẻ loader/cache theo key ổn định;
- không fetch cùng car/article/accessory hai lần nếu tránh được.

### 4.4 Preserve SEO

Phải đảm bảo metadata trước/sau tương đương về ý nghĩa.

Không thay:
- title logic;
- description logic;
- canonical logic;
- OG image selection;
- index/noindex;
- route semantics.

---

# PHASE 5 — DEFER NON-CRITICAL SSR CONTENT

## Mục tiêu

Below-fold content không được giữ critical render lâu hơn cần thiết.

Ứng viên từ audit:
- reviews;
- accessories carousel;
- news;
- related cars;
- hidden tabs;
- footer-only content.

### Quy tắc

Không chuyển bừa toàn bộ sang CSR.

Ưu tiên:
1. cache;
2. parallel;
3. streaming/defer;
4. CSR chỉ khi thật sự phù hợp.

Giữ SEO content cần thiết trên server.

### Homepage accessories

Audit ghi nhận có thể lấy tới `limit=100`.

Không được thay behavior carousel.

Có thể giảm initial payload chỉ nếu:
- carousel vẫn hiển thị chính xác;
- user vẫn truy cập được toàn bộ item theo behavior cũ;
- không làm mất item;
- có cơ chế progressive/load bổ sung tương đương.

Nếu chưa chắc, chỉ cache/defer, không giảm limit.

---

# PHASE 6 — LISTING / FILTER / DETAIL REQUEST OPTIMIZATION

## 6.1 Listing/filter

Audit phát hiện:
- nhiều lookup;
- model/version chain;
- có nhánh fetch nhiều cars để tính distinct year.

Tối ưu:
- cache lookup;
- reuse lookup;
- parallel những gì không phụ thuộc;
- không fetch lại data đã có;
- kiểm soát pagination concurrency.

Không thay:
- filter options;
- filter semantics;
- query URL;
- sort;
- pagination;
- result order.

### Year facet

Không thay backend/API contract trong task frontend.

Nếu không thể tối ưu year facet mà không đổi backend:
- giữ nguyên;
- ghi `DEFERRED — BACKEND OPTIMIZATION`.

## 6.2 Car detail

Audit phát hiện:
- article 404 probe trước car ở một số route;
- installment config;
- site info/branding;
- related cars nối tiếp.

Tối ưu:
- parallel request độc lập;
- defer related;
- reuse detail loader page/metadata.

Không thay slug resolver nếu có nguy cơ article/car collision.

Nếu cần đổi namespace/backend contract:
- defer.

## 6.3 Accessory detail

Related/latest/contact/store không được block critical detail nếu có thể stream/cache mà không đổi UI.

---

# PHASE 7 — IMAGE / MEDIA OPTIMIZATION

## Mục tiêu

Giảm mạnh transferred bytes nhưng **không làm giảm chất lượng cảm nhận hoặc thay layout**.

### 7.1 Không xóa original

Original phải được giữ cho:
- zoom;
- lightbox;
- admin/reference nếu cần.

### 7.2 Logo

Logo hiện rất lớn.

Tạo/use optimized variant nếu có thể mà:
- pixel appearance tương đương;
- transparency đúng;
- aspect ratio giữ nguyên;
- dimensions layout giữ nguyên.

Không thay thiết kế logo.

### 7.3 Hero

Chỉ ảnh thực sự là LCP/slide đầu:
- eager/high priority phù hợp.

Slide chưa nhìn thấy:
- lazy/defer phù hợp.

Không thay:
- autoplay;
- fade;
- transition;
- timing;
- slide order.

### 7.4 Car cards

Giữ cover image hiện tại.

Ảnh card dưới fold:
- `loading="lazy"` phù hợp;
- `decoding="async"` nếu an toàn.

Không lazy LCP image.

Không thay card dimensions/crop.

### 7.5 Gallery

Mục tiêu:
- main display dùng variant phù hợp viewport;
- thumbnail dùng thumbnail nhỏ;
- original chỉ cần khi zoom/lightbox;
- slide ngoài viewport lazy nếu library hỗ trợ ổn định.

Không thay:
- số ảnh;
- thứ tự ảnh;
- swipe;
- arrows;
- thumbnail interaction;
- lightbox;
- zoom.

### 7.6 Responsive media

Nếu có hạ tầng variant:
- dùng `srcset`/`sizes` hoặc Next Image phù hợp.

Không bật Next image optimization toàn cục một cách mù quáng.

Phải kiểm tra:
- R2 domains;
- public assets;
- GIF/SVG;
- remote URL;
- cache headers;
- crop.

Nếu cần backend/R2 image pipeline mới:
- không tự sửa backend trong phase này;
- triển khai phần frontend an toàn có thể làm;
- ghi phần còn lại vào deferred.

### 7.7 Banner

Không predecode tất cả slide nếu chưa cần, nhưng behavior cuối phải giữ nguyên.

---

# PHASE 8 — FONT OPTIMIZATION

## Mục tiêu

Giảm tải font lớn mà không làm thay đổi typography cảm nhận.

Audit:
- SF Pro Regular ~2.23MB.
- SF Pro Bold ~2.30MB.

### 8.1 Ưu tiên WOFF2

Chỉ tạo/subset font nếu:
- tooling hiện có hoặc phương pháp đáng tin cậy;
- license cho phép;
- đầy đủ Vietnamese glyph;
- weights dùng thật.

### 8.2 `font-display`

Dùng `font-display: swap` hoặc chiến lược phù hợp nếu không gây regression nghiêm trọng.

### 8.3 Không đổi font-family

Không thay SF Pro bằng font khác chỉ để giảm bytes.

### 8.4 Layout stability

Kiểm tra:
- Vietnamese diacritics;
- heading;
- buttons;
- prices;
- nav;
- mobile wrapping.

Nếu WOFF2/subset có nguy cơ thay metrics/layout:
- giữ font hiện tại;
- ghi deferred.

---

# PHASE 9 — JAVASCRIPT / CLIENT BOUNDARY OPTIMIZATION

## Mục tiêu

Giảm JS parse/evaluate/hydration mà không thay behavior.

### 9.1 Dynamic import ứng viên

Kiểm tra:
- comparison;
- lightbox;
- login/auth;
- Supabase auth;
- route-specific interactions.

Chỉ dynamic import nếu:
- component không cần trước interaction/viewport;
- không gây flash;
- không phá SSR;
- không làm modal/carousel chậm bất thường.

### 9.2 SaleAccess/Supabase

Không phá auth/session.

Nếu provider cần global để behavior đúng, giữ nguyên.

Chỉ lazy SDK nếu lifecycle/session vẫn chính xác.

### 9.3 Legacy Markup

Không rewrite toàn bộ legacy HTML parser trong phase này nếu regression risk cao.

Có thể tách client island nhỏ chỉ khi mapping behavior rõ ràng.

### 9.4 SiteInteractions

Không xóa delegated event/observer nếu chưa chứng minh không dùng.

---

# PHASE 10 — CSS OPTIMIZATION AN TOÀN

## Mục tiêu

Giảm render-blocking CSS nhưng tuyệt đối không làm lệch giao diện.

Audit có các global styles:
- bootstrap;
- Font Awesome;
- fancybox;
- slick;
- slick-theme;
- magiczoomplus;
- style;
- jquery-ui;
- media;
- login;
- globals.

### QUY TẮC

Không xóa CSS chỉ vì:
- tên library cũ;
- không thấy JS library;
- tưởng selector không dùng.

Legacy markup có thể phụ thuộc class đó.

### Thực hiện

1. Xác định stylesheet thực sự cần global.
2. Nếu chắc chắn stylesheet chỉ dùng route/component cụ thể, có thể route-scope.
3. Giữ cascade/order tương đương.
4. Không thay specificity ngoài ý muốn.
5. Không minify thủ công source.

Nếu không chứng minh được an toàn:
- giữ nguyên CSS;
- ghi deferred.

---

# PHASE 11 — DUPLICATE REQUEST / RUNTIME CLEANUP

## 11.1 Auspicious Date

Audit thấy config được fetch SSR cho metadata rồi fetch CSR lại.

Nếu an toàn:
- truyền initial config server → client;
- client chỉ refresh theo policy phù hợp.

Không cache shared:
- user search;
- personal result;
- private data.

## 11.2 Comparison

Không refetch car detail đã có trong cache/state nếu vẫn fresh.

Không thay comparison UI/logic.

## 11.3 Card gallery

Reuse detail theo slug nếu có cache phù hợp.

Không preload full gallery.

## 11.4 Legacy searchSnapshot

Audit phát hiện xử lý inventory cũ rồi kết quả bị API overwrite.

Chỉ bỏ nếu chứng minh:
- output HTML/template/filter hoàn toàn không phụ thuộc side effect;
- search/filter behavior không đổi.

Nếu không chắc:
- giữ nguyên;
- deferred.

---

# PHASE 12 — DEADLINE / RESILIENCE

Audit phát hiện server public API wrapper thiếu deadline.

Có thể thêm timeout/deadline có kiểm soát cho **non-critical public content**.

Không áp timeout ngắn tùy tiện cho:
- critical inventory;
- price;
- detail;
- auth/private operations.

Fallback phải giữ behavior hiện có.

Không được biến lỗi thật thành empty state sai nghĩa.

---

# PHASE 13 — FINAL VALIDATION

Sau tất cả thay đổi:

## Build

Chạy:

```bash
npm run build
```

và các lint/typecheck/test script hiện có.

Không sửa unrelated warnings chỉ để report đẹp.

## Route regression

Kiểm tra ít nhất:

- `/`
- `/san-pham`
- `/tim-kiem-nang-cao`
- brand/model/style listing nếu có
- một car detail
- `/phu-kien-o-to`
- một accessory detail
- `/bai-viet`
- FAQ/article/service/recruitment detail
- `/ban-xe`
- `/len-doi`
- `/tien-ich/xem-ngay-mua-xe`
- `/tien-ich/xem-gia-xang-dau`
- redirect/404 cơ bản

## UI regression checklist

Xác nhận:
- header giống;
- footer giống;
- logo giống;
- section order giống;
- colors giống;
- typography giống;
- desktop responsive giống;
- mobile responsive giống;
- carousel giống;
- SiteIntro giống;
- animations giống;
- filters giống;
- pagination/load more giống;
- gallery giống;
- lightbox giống;
- compare giống;
- form submit giống;
- auth/sale behavior giống.

## Data regression

Xác nhận:
- cars không mất;
- sold/deposit/active semantics không đổi;
- filters không sai;
- price không stale quá policy;
- metadata đúng;
- SEO canonical đúng;
- content admin vẫn xuất hiện;
- settings/contact đúng.

---

# ĐO HIỆU NĂNG SAU THAY ĐỔI

Nếu môi trường cho phép, đo production-like, không lấy `next dev` làm kết luận cuối.

Ghi:
- request count;
- transferred bytes;
- document TTFB;
- DOMContentLoaded;
- Load;
- LCP;
- CLS;
- INP nếu đo được;
- server-side API request count;
- cold/warm behavior.

So sánh cùng:
- route;
- viewport;
- API endpoint;
- cache state;
- environment.

Không hứa con số nếu chưa đo.

---

# CÁCH LÀM VIỆC VỚI GIT

Không commit.
Không push.

Không sửa backend/admin.

Sau mỗi phase:

```bash
git diff
```

Đảm bảo diff chỉ liên quan optimization phase hiện tại.

Không format toàn repo.

Không đổi line endings hàng loạt.

Không sửa unrelated files.

---

# OUTPUT BẮT BUỘC

Ngoài source code cần thiết cho optimization, tạo:

`optimization-report.md`

ở root repo.

Báo cáo phải có:

```md
# Frontend Performance Optimization Report

## 1. Summary

## 2. Baseline

## 3. Phase 1 — Public Data Cache
### Changed
### Why
### Behavior preserved
### Validation

## 4. Phase 2 — Homepage Parallelization
...

## 5. Phase 3 — Root Layout
...

## 6. Phase 4 — Metadata
...

## 7. Phase 5 — Deferred SSR Content
...

## 8. Phase 6 — Listing/Detail
...

## 9. Phase 7 — Media
...

## 10. Phase 8 — Fonts
...

## 11. Phase 9 — JavaScript
...

## 12. Phase 10 — CSS
...

## 13. Phase 11 — Runtime Cleanup
...

## 14. Regression Validation

## 15. Performance Results

## 16. Deferred — Requires Manual Approval

## 17. Files Changed
```

Với mỗi thay đổi ghi:
- file;
- function/component;
- before;
- after;
- lý do;
- performance benefit;
- regression risk;
- cách đã kiểm tra.

---

# STOP CONDITIONS

Nếu gặp một trong các tình huống sau, KHÔNG tự quyết định thay đổi lớn:

1. cần đổi API contract;
2. cần migration database;
3. cần sửa backend;
4. cần sửa admin;
5. cần thay UI;
6. cần thay UX;
7. cần bỏ animation;
8. cần đổi carousel;
9. cần đổi font-family;
10. cần xóa legacy CSS nhưng chưa chứng minh an toàn;
11. cần xóa asset đang có khả năng được tham chiếu;
12. cần đổi slug/route;
13. cache có thể làm sai tồn kho/giá;
14. SEO output có thể thay đổi;
15. auth/sale behavior có thể thay đổi.

Ghi vấn đề vào:

`optimization-report.md → Deferred — Requires Manual Approval`

và tiếp tục các optimization an toàn khác.

---

# NGUYÊN TẮC ƯU TIÊN KHI CÓ NHIỀU GIẢI PHÁP

Luôn chọn giải pháp:

1. ít thay đổi source nhất;
2. regression risk thấp nhất;
3. không thay UI;
4. không thay business logic;
5. không thay API contract;
6. dễ revert;
7. có thể đo được;
8. mang lại performance benefit rõ ràng.

Không chọn refactor lớn chỉ vì code "đẹp hơn".

---

# DEFINITION OF DONE

Task chỉ hoàn thành khi:

- Website build được như baseline hoặc tốt hơn.
- Không có TypeScript/build error mới.
- Không thay đổi UI có chủ đích.
- Không thay đổi business logic.
- Không thay đổi route/slug.
- Không thay API contract.
- Không thay database.
- Không thay backend/admin.
- Các optimization có lý do và evidence.
- Những thay đổi rủi ro được defer thay vì tự triển khai.
- `optimization-report.md` mô tả đầy đủ.
- `git diff` không chứa unrelated change.
- Không commit.
- Không push.

---

# LỆNH CUỐI

Sau khi hoàn thành:

```bash
git status
git diff --stat
```

Sau đó dừng lại.

Không tự deploy.

Không commit.

Không push.

Tôi sẽ đọc `optimization-report.md`, kiểm tra website và quyết định bước deploy tiếp theo.
