# PERF_DIAGNOSTICS

## Bật/tắt

Đặt `PERF_DIAGNOSTICS=true` trong môi trường **web và API**, sau đó khởi động lại đúng hai process hiện có. Mặc định tắt; giá trị khác `true` không bật instrumentation. Cờ server không dùng tiền tố NEXT_PUBLIC và không được gửi xuống trình duyệt. Instrumentation đã có trong bản build; đổi cờ runtime không đổi cache policy hay API contract.

Không đổi RATE_LIMIT_MAX, số slot API, cache TTL hoặc topology để chạy phép đo. Không có endpoint debug hoặc header Server-Timing mới.

## Những gì được đo

| Metric | Ý nghĩa |
| --- | --- |
| `ssr.http` | Từ Node HTTP request start đến response finish, gồm SSR/framework/stream/backpressure; không phải riêng thời gian CPU React hay TTFB. Bỏ qua assets và Next API routes. |
| `ssr.prepare` | Resolver `getRequestPublicPage`, gồm API và dựng trang legacy; metadata/page vẫn chia sẻ React memoization. |
| `ssr.component` | Hàm trang chủ và root layout đến khi trả React elements; việc render children diễn ra sau đó. |
| `api.queue` | Chờ trước khi nhận một trong **8 slot hiện có**, tính mỗi attempt. |
| `api.fetch` | Fetch đến khi có response headers; gồm transport, API xử lý và lịch event loop web. |
| `api.body` | Đọc body + `response.json()`, không phải riêng CPU JSON.parse. |
| `api.read` | Một logical read, gồm queue, attempts, body và backoff. |
| `api.http` | Fastify elapsedTime ở onResponse, gồm guard/cache/controller/serialization. Không log SQL và không đo PostgreSQL pool wait. |
| `cheerio.parse` | Các lệnh load ở public page resolver, trang chủ, LegacyPage, service steps và safeHtml. |
| `cheerio.serialize` | `CheerioAPI.html()` của những document trên; giữ nguyên args, this và kết quả. Không bao gồm mọi lời gọi `$(...).html(...)` dùng để chỉnh DOM. |
| `cheerio.transform` | Các khối DOM đồng bộ của public homepage, HomePage và LegacyPage. Có chứa parse/serialize bên trong. |
| `html.react_parse` | html-react-parser trong Markup khi SSR; browser không có observer nên không ghi log. Không bao gồm render tất cả React children. |
| `legacy.read` | Đọc JSON template từ filesystem; không cache thêm template. |

Các trang không đi qua legacy resolver vẫn có metric HTTP; không giả định tất cả xử lý Cheerio ở mọi trang đều đã được đo riêng. Kịch bản k6 hiện tại chỉ request trang chủ HTML.

## Log và giới hạn

Mỗi process bật cờ phát một JSON `event=perf_diagnostics` mỗi **30 giây**. API flush thêm một lần khi đóng bình thường. Không có log theo từng request/span. Cửa sổ idle có thể phát runtime counters để xác nhận observer còn hoạt động.

- Tối đa 96 histogram/cửa sổ, nhãn thuộc allowlist cố định. Nhãn vượt giới hạn bị bỏ và tăng `dropped`; nhãn không hợp lệ không được giữ lại.
- Không lưu samples dạng mảng. Histogram HDR hai chữ số có p50/p95 **xấp xỉ**, miền tối đa 120 giây. Samples vượt miền vẫn vào count/sum/max và tăng `clipped`; percentile bị chặn ở trần đó.
- Mỗi row: metric, label, count, errors, status429, status503, sumMs, avgMs, maxMs, p50Ms, p95Ms, clipped.
- Counters status429/status503 chỉ có ý nghĩa ở `api.fetch` và `api.http`, nơi nhận được HTTP status thực tế. Các span logical/component chỉ tăng `errors` khi công việc throw.
- `peaks.api.active` / `peaks.api.waiting`: mức cao nhất của slot/queue trong cửa sổ. Cơ chế acquire/transfer/release và concurrency không đổi.
- Runtime: process CPU milliseconds, event loop utilization, p95 monitorEventLoopDelay, RSS và heap. Đây là số process, không phải toàn VPS hay PostgreSQL. Monitor dùng resolution 20 ms; baseline khoảng 20 ms không có nghĩa mỗi request bị block 20 ms.
- Không log URL, query, tên/ID/slug xe, user, token, cookie, IP, request/response body, SQL, error message hay stack. Request chứa dữ liệu đó chỉ đóng góp duration/count dưới nhãn cố định.
- Khi tắt: không subscribe HTTP channels, không khởi tạo timer/monitor/histogram cho web; API không cài hooks hiệu năng. Các log vận hành có sẵn trước thay đổi này giữ nguyên.

**Không cộng các span chồng nhau.** `api.read` chứa queue/fetch/body; prepare chứa API; transform chứa parse/serialize; HTTP chứa các pha SSR. API đọc song song nên tổng elapsed của API calls có thể lớn hơn elapsed một trang. Không lấy trung bình các p95 window để gọi là p95 toàn run.

Next khởi tạo instrumentation khi request đầu đến. Lượt warmup đầu có thể chưa có `ssr.http`; runner gửi hai warmup và xác minh đủ metric trước khi chạy k6.

## Chạy local cô lập

Yêu cầu Node 22+, k6 và dependencies hai dự án đã cài:

```powershell
# API
npx.cmd tsc -p tsconfig.test.json
# Web
npm.cmd run build
node scripts/perf-local-run.mjs
```

`K6_BIN` có thể trỏ tới executable k6. Runner tự tạo API chỉ bind loopback, database PGlite memory với dữ liệu tổng hợp, controller/service/guard/cache thật, limiter 500/60 giây, TTL thực. Không đọc `.env` database và không gọi database remote. Public fixture không cung cấp các chức năng ghi khách hàng/Admin; không dùng nó để triển khai production.

Ba mức **10, 20, 30 VUs** chạy tuần tự, mỗi mức có API và Next process mới, warmup trước tải, rồi cùng profile 30s ramp/60s hold/30s ramp-down, nghỉ 2–5s. Không tải ảnh/JS/CSS hay chạy browser JavaScript. Runner đợi thêm 31s để flush window cuối; tổng thời gian gồm startup, warmup và flush lớn hơn 6 phút.

Artifacts ở `../docs/artifacts/perf-local-2026-10-15`: summary k6, log JSONL đã lọc chỉ perf events, thời điểm từng phase và mô tả máy. Không ghi toàn bộ stdout/stderr ứng dụng. Exit k6 99 biểu thị threshold thất bại; phải đọc summary, không gọi là đạt chỉ vì runner chạy hết.

PGlite cùng máy với generator khác PostgreSQL/network/logging/CPU/RAM của VPS. Kết quả local dùng để xác định hướng điều tra; không dùng làm cam kết sức tải VPS 2 vCPU/4 GB hoặc so trực tiếp với các JSON benchmark production cũ.

## Regression

Web: `node scripts/perf-diagnostics-check.mjs` kiểm tra off không log/timer, giữ return/error identity, Cheerio HTML/context, bounded labels và privacy. Các scripts resilience/cache cũ tiếp tục kiểm tra fetch/retry/concurrency/invalidation.

API: `node --test .test-dist/test/perf-diagnostics.test.js` kiểm tra no-op khi off, không giữ nhãn/query/body nhạy cảm, giữ nguyên payload/status/cache headers. Guard/cache regression giữ nguyên.
