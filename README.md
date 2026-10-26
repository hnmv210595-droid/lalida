# LaLiDa — Gà ba nuôi · Cơm mẹ nấu

Ứng dụng gọi món qua QR tại bàn và quản lý quán cơm gà **LaLiDa** (`lalida.net`).
Chạy hoàn toàn trên Cloudflare: **Pages** (giao diện) + **Workers** (API, dạng Pages Functions) + **D1** (cơ sở dữ liệu SQLite).

## Cấu trúc thư mục

```
lalida/
├── wrangler.toml              # Cấu hình Cloudflare Pages + liên kết D1 (binding "DB")
├── package.json               # Lệnh dev / khởi tạo DB / deploy
├── schema.sql                 # Lược đồ D1: settings, tables, categories, menu_items, orders,
│                              #   order_items, transactions, staff, attendance, feedback, login_attempts
├── seed.sql                   # Dữ liệu mẫu: 5 danh mục, thực đơn, 6 bàn, VAT 8%
├── .dev.vars.example          # Mẫu biến bí mật khi chạy local
├── functions/
│   └── api/[[route]].js       # Cloudflare Worker: nhận mọi request /api/*
├── src/api/
│   ├── router.js              # Toàn bộ API (khách, admin, bếp, bàn, thực đơn, nhân sự, thu chi, báo cáo)
│   ├── auth.js                # Đăng nhập Admin + mã PIN cấp 2, băm PBKDF2, cookie HMAC, chống dò mật khẩu
│   ├── store.js               # Tính tiền + VAT, đơn hàng dùng chung
│   └── http.js                # Tiện ích HTTP, kiểm tra dữ liệu, giờ Việt Nam
└── public/                    # Cloudflare Pages (tĩnh)
    ├── order.html             # Trang khách:  /order?table=X
    ├── admin.html             # Trang quản trị: /admin
    ├── _headers, _redirects   # Header bảo mật; "/" chuyển về /order
    └── assets/
        ├── logo.webp          # Logo LaLiDa + slogan (cắt từ ảnh nhận diện)
        ├── favicon.png
        ├── tailwind-config.js # Màu thương hiệu
        ├── common.js          # Gọi API, định dạng tiền, toast
        ├── order.js           # Logic trang gọi món
        ├── admin.js           # Logic trang quản trị
        └── printer.js         # In hoá đơn 58/80mm (window.print) + máy in Bluetooth ESC/POS
```

## Tính năng

**Khách hàng** (`/order?table=X`, không cần đăng nhập)
- Quét QR tự nhận số bàn → **Trang chính** có nút **Menu**, bên dưới là **Góp ý & Phản hồi** kèm slogan *"Góp ý ngay - Tặng 1 ly nước cho hóa đơn lần sau"*.
- Bấm **Menu** mới hiện danh sách món theo tab `Cơm`, `Đồ Ăn`, `Canh`, `Đồ Uống`, `Gọi Thêm` → chọn món → **Đặt đơn**.
- Panel **Đơn đã đặt**: trạng thái từng món (*Đang chờ → Đang làm → Đã lên món*), tạm tính + VAT, tự cập nhật mỗi 5 giây. Khách **sửa đơn**: đổi số lượng hoặc bỏ món còn "Đang chờ" (bếp chưa làm); gọi thêm thì chọn món rồi bấm Đặt đơn (cộng vào cùng đơn).
- **Góp ý nhận quà**: khách đang dùng bữa (bàn có đơn đang mở) viết góp ý sẽ nhận mã `LLD-XXXXXX` tặng 1 ly nước cho **lần ăn sau** (mã hiện trên điện thoại khách, có hạn dùng; mặc định 1 mã/lượt ăn của bàn, 30 ngày).
- **Nhiều nhóm khách chung một bàn**: mỗi điện thoại quét QR có đơn riêng, đánh số **Bàn 1-1, Bàn 1-2, Bàn 1-3…**; mỗi khách chỉ xem/sửa đơn của mình. Khi các đơn của bàn đã thanh toán hết, số thứ tự bắt đầu lại từ 1. Nhân viên gọi món hộ thì chọn "Khách mới" hoặc thêm vào đơn Bàn X-n có sẵn.
  Nâng cấp database đã có dữ liệu: `npx wrangler d1 execute lalida-db --remote --file=./migrations/0004_table_guests.sql`

**Đặt online** (`lalida.net/online`, trang chủ `lalida.net` cũng chuyển về đây)
- Giống trang quét QR: trang chính có **Menu** và **Góp ý & Phản hồi**; khách chọn món rồi bấm **Đặt đơn** → hiện form **Tên, SĐT, Địa chỉ** → Xác nhận đặt đơn. Thông tin được nhớ cho lần đặt sau.
- Khách xem trạng thái, sửa món còn "Đang chờ", gọi thêm vào đơn đang giao; đơn đã thanh toán thì lần sau tạo đơn mới. Góp ý sau khi đặt online cũng được tặng mã 1 ly nước.
- Trang Admin: đơn online nằm ở tab riêng **🛵 Online**, tách khỏi tab **🍽️ Tại quán**; đơn đặt trước hiện trên đầu. Thẻ **🛵 Đơn online** kèm tên, SĐT (bấm để gọi), địa chỉ; hoá đơn in kèm thông tin giao hàng. Mã QR đặt online in ở mục **Bàn & QR**. Bật/tắt nhận đơn online trong Cài đặt. Chống spam: tối đa 5 đơn mới/giờ/IP.
- Nâng cấp database đã có dữ liệu: `npx wrangler d1 execute lalida-db --remote --file=./migrations/0003_online_orders.sql`

- Có thể tắt khách tự đặt món trong Cài đặt → "Cho phép khách tự gọi món qua QR" (khi đó khách chỉ xem Menu và Góp ý, nhân viên gọi món cho bàn).

**Quản trị** (`/admin`)
- Đăng nhập bằng mật khẩu; **Thu chi & Lợi nhuận** yêu cầu thêm **mã PIN cấp 2** (phiên 30 phút, có nút khoá lại). Sai 5 lần sẽ bị khoá 15 phút.
- **Đơn hàng & Bếp (KDS)**: đơn realtime (polling 4 giây, chuông báo món mới), nút *Làm / Lên món* từng món, **Đã lên món**, **Đã thanh toán** (chọn tiền mặt/chuyển khoản/thẻ, tính tiền thừa, tự ghi khoản thu), huỷ món/đơn, tạo đơn / thêm món cho bàn, xem đơn đã thanh toán theo ngày.
- **🎁 Mã tặng nước**: trên đơn của bàn, nhập mã khách đưa → chọn ly nước bất kỳ trong mục Đồ Uống → món được thêm vào hoá đơn giá 0đ và gửi xuống bếp. Mã chỉ dùng 1 lần, không dùng được ngay trong lượt ăn đã góp ý; huỷ món tặng thì mã được trả lại.
- **In hoá đơn** khổ 58mm/80mm qua `window.print()` hoặc máy in nhiệt **Bluetooth (Web Bluetooth, ESC/POS)**.
- **Bàn & QR**: thêm/xoá bàn, QR tự sinh `https://lalida.net/order?table=X`, in từng mã hoặc cả tờ.
- **Thực đơn**: thêm/sửa/xoá món; nút **Hết hàng** / **Bán lại** ở từng món — món hết hàng vẫn hiện trên menu của khách với nhãn **"Đã bán hết"** và không đặt được.
- **Thu chi & Lợi nhuận**: ghi thu/chi, báo cáo theo **Ngày / Tháng / Năm**, biểu đồ, Lợi nhuận = Doanh thu − Chi phí, phân tích theo hạng mục, đổi mã PIN.
- **Nhân sự & Chấm công**: CRUD nhân viên (lương tháng, trợ cấp, hoặc lương giờ), vào ca/ra ca 1 chạm, sửa tay, tổng hợp giờ công theo tháng.
- **💵 Bảng lương** (cần mã PIN cấp 2): trả vào **ngày 5** tháng sau (có nhắc trên menu khi đến hạn).
  - Lương tháng: được **nghỉ 2 ngày/tháng vẫn hưởng lương**; nghỉ thêm trừ `lương tháng ÷ số ngày trong tháng` mỗi ngày.
  - Ngày công tự lấy từ chấm công (sửa tay được); **trợ cấp nhập theo từng tháng**. Thực lĩnh = lương theo công + trợ cấp.
  - Lương giờ: tổng giờ × lương/giờ + trợ cấp.
  - "Đã trả lương" chốt bảng lương và tự ghi khoản chi *Lương nhân viên*; có in phiếu lương và hoàn tác.
  - Số ngày nghỉ có lương và ngày trả lương chỉnh trong Cài đặt.
- **Góp ý**, **Cài đặt** (thông tin quán, bật/tắt & % VAT, khổ giấy, tên miền QR, đổi mật khẩu).

---

## Hướng dẫn deploy lên Cloudflare (từng bước)

### Bước 0 — Chuẩn bị
- Tài khoản Cloudflare (miễn phí) và tên miền `lalida.net` đã thêm vào Cloudflare.
- Cài **Node.js 18+**.

```bash
npm install
```

```bash
npx wrangler login
```

### Bước 1 — Tạo database D1

```bash
npx wrangler d1 create lalida-db
```

Lệnh in ra `database_id`. Mở `wrangler.toml`, thay dòng `database_id = "0000…"` bằng ID vừa nhận.

### Bước 2 — Tạo bảng và dữ liệu mẫu trên D1 thật

```bash
npm run db:init:remote
```

> ⚠️ `schema.sql` có lệnh `DROP TABLE` — **chỉ chạy một lần** lúc khởi tạo. Chạy lại sẽ xoá toàn bộ dữ liệu.
>
> Nếu database đã có dữ liệu từ bản trước (chưa có lương / mã tặng), **không** chạy lại schema mà chạy file nâng cấp:
> `npx wrangler d1 execute lalida-db --remote --file=./migrations/0002_payroll_vouchers.sql`

### Bước 3 — Tạo project Pages

```bash
npx wrangler pages project create lalida --production-branch main
```

### Bước 4 — Đặt các biến bí mật

```bash
npx wrangler pages secret put SESSION_SECRET --project-name lalida
```

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name lalida
```

```bash
npx wrangler pages secret put FINANCE_PIN --project-name lalida
```

- `SESSION_SECRET`: chuỗi ngẫu nhiên **≥ 32 ký tự** (dùng để ký phiên đăng nhập).
- `ADMIN_PASSWORD`: mật khẩu Admin ban đầu.
- `FINANCE_PIN`: mã PIN cấp 2 ban đầu (4–8 chữ số).

Sau khi đổi mật khẩu / PIN trong trang Admin, giá trị mới (đã băm) được lưu trong D1 và được ưu tiên dùng.

### Bước 5 — Deploy

```bash
npm run deploy
```

Wrangler đọc `wrangler.toml` (thư mục `public` + `functions` + binding D1) và in ra địa chỉ `https://lalida.pages.dev`.

### Bước 6 — Gắn tên miền lalida.net
Cloudflare Dashboard → **Workers & Pages** → `lalida` → **Custom domains** → **Set up a custom domain** → nhập `lalida.net` (và `www.lalida.net` nếu cần) → xác nhận. Cloudflare tự tạo bản ghi DNS và chứng chỉ SSL.

### Bước 7 — Vận hành
1. Vào `https://lalida.net/admin`, đăng nhập bằng `ADMIN_PASSWORD`.
2. **Cài đặt**: nhập địa chỉ, số điện thoại, % VAT, khổ giấy; kiểm tra "Tên miền dùng cho mã QR" là `https://lalida.net`.
3. **Thực đơn**: sửa giá / thêm món thật của quán.
4. **Bàn & QR**: thêm/xoá bàn đúng thực tế → **In tất cả QR** → dán lên bàn.
5. Mở **Đơn hàng & Bếp** trên máy tính bảng ở bếp/quầy để nhận đơn.
6. Lần đầu nên đổi ngay mật khẩu Admin (Cài đặt) và mã PIN (Thu chi & Lợi nhuận).

### Tự deploy khi đẩy code lên GitHub
File `.github/workflows/deploy.yml` tự chạy `wrangler pages deploy` mỗi khi có code mới trên nhánh `main`.
Repo cần 2 secret (GitHub → **Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_ACCOUNT_ID`: ID tài khoản Cloudflare.
- `CLOUDFLARE_API_TOKEN`: tạo ở Cloudflare Dashboard → **My Profile → API Tokens → Create Token → Create Custom Token** → Permissions: `Account` · `Cloudflare Pages` · `Edit` → Create.

Workflow **không** chạy `schema.sql` hay migration; thay đổi database vẫn làm bằng lệnh `wrangler d1 execute`.

---

## Chạy thử trên máy (local)

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run db:init:local
```

```bash
npm run dev
```

Mở `http://localhost:8788/order?table=1` và `http://localhost:8788/admin`.

## Ghi chú kỹ thuật
- **Realtime**: dùng polling (bếp 4s, khách 5s) — đơn giản, nằm trong gói miễn phí. Có thể nâng cấp lên WebSocket bằng Durable Objects.
- **Giờ**: D1 lưu UTC; báo cáo và chấm công quy đổi theo giờ Việt Nam (UTC+7).
- **Giá món** luôn lấy từ DB phía máy chủ, không tin giá gửi từ trình duyệt; giá được "chốt" vào `order_items` tại thời điểm gọi.
- **VAT** được tính lại cho đơn đang mở theo cài đặt hiện hành và chốt cố định khi bấm *Đã thanh toán*.
- **Bluetooth**: cần Chrome/Edge (Android, Windows, macOS) và HTTPS; iOS Safari không hỗ trợ Web Bluetooth → dùng in qua trình duyệt. Máy in nhiệt thường không có font tiếng Việt nên hoá đơn Bluetooth in **không dấu**; bản in qua trình duyệt giữ đầy đủ dấu.
- **Tailwind** nạp qua CDN để không cần bước build. Nếu muốn tối ưu, có thể chuyển sang Tailwind CLI để sinh file CSS tĩnh.
- Sao lưu D1: `npx wrangler d1 export lalida-db --remote --output backup.sql`.
