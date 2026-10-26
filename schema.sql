-- =============================================================
-- LaLiDa - "Gà ba nuôi - Cơm mẹ nấu"
-- Cloudflare D1 (SQLite) schema
-- Thời gian lưu dạng UTC (datetime('now')); báo cáo quy đổi sang giờ VN (+7).
-- Tiền tệ: VND, lưu số nguyên.
-- =============================================================

DROP TABLE IF EXISTS vouchers;
DROP TABLE IF EXISTS payroll;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS tables;
DROP TABLE IF EXISTS settings;

-- Cấu hình chung (VAT, thông tin quán, mật khẩu/PIN đã băm, ...)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Bàn ăn. URL QR: https://lalida.net/order?table=<number>
CREATE TABLE tables (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  number     INTEGER NOT NULL UNIQUE,
  name       TEXT,
  seats      INTEGER NOT NULL DEFAULT 4,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Danh mục: Cơm, Đồ Ăn, Canh, Đồ Uống, Gọi Thêm
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  description  TEXT,
  price        INTEGER NOT NULL CHECK (price >= 0),
  image_url    TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- Mỗi bàn có tối đa 1 đơn 'open'; khách gọi thêm sẽ cộng vào đơn đang mở.
CREATE TABLE orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id       INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  table_number   INTEGER NOT NULL,                 -- đơn online: 0
  guest_no       INTEGER,                          -- đơn tại bàn: lượt khách trong bàn -> "Bàn 1-2"
  order_type     TEXT NOT NULL DEFAULT 'table' CHECK (order_type IN ('table','online')),
  customer_name    TEXT,                           -- đơn online: thông tin giao hàng
  customer_phone   TEXT,
  customer_address TEXT,
  access_token   TEXT,                             -- đơn online: mã để khách xem/sửa đơn trên máy của mình
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  note           TEXT,
  subtotal       INTEGER NOT NULL DEFAULT 0,
  vat_percent    REAL    NOT NULL DEFAULT 0,
  vat_amount     INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at        TEXT
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_table ON orders(table_number, status);
CREATE INDEX idx_orders_paid_at ON orders(paid_at);
-- Một bàn có thể có nhiều đơn mở (mỗi lượt quét QR một đơn: Bàn 1-1, 1-2...);
-- chỉ mục duy nhất chống trùng số thứ tự khi 2 máy cùng gửi
CREATE UNIQUE INDEX ux_orders_open_guest ON orders(table_number, guest_no) WHERE status = 'open' AND order_type = 'table';

-- Trạng thái món: pending (Đang chờ) -> cooking (Đang làm) -> served (Đã lên món)
CREATE TABLE order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  price        INTEGER NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cooking','served','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  served_at    TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Thu chi. txn_date là ngày theo giờ VN (YYYY-MM-DD).
CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK (type IN ('income','expense')),
  category    TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  description TEXT,
  txn_date    TEXT NOT NULL,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_transactions_date ON transactions(txn_date);

CREATE TABLE staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  position    TEXT,
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  monthly_salary INTEGER NOT NULL DEFAULT 0, -- Lương tháng (0 = trả theo giờ)
  allowance   INTEGER NOT NULL DEFAULT 0,    -- Trợ cấp mặc định mỗi tháng
  start_date  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chấm công: work_date theo giờ VN, check_in/check_out dạng HH:MM
CREATE TABLE attendance (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date  TEXT NOT NULL,
  check_in   TEXT,
  check_out  TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attendance_date ON attendance(work_date);
CREATE INDEX idx_attendance_staff ON attendance(staff_id, work_date);

-- Bảng lương tháng (trả vào ngày 5 tháng sau). Nghỉ tối đa 2 ngày/tháng vẫn hưởng lương.
CREATE TABLE payroll (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id           INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month              TEXT NOT NULL,              -- YYYY-MM
  monthly_salary     INTEGER NOT NULL DEFAULT 0, -- chốt tại thời điểm tính
  hourly_rate        INTEGER NOT NULL DEFAULT 0,
  days_in_month      INTEGER NOT NULL DEFAULT 0,
  worked_days        INTEGER NOT NULL DEFAULT 0,
  worked_days_manual INTEGER,                    -- NULL = lấy tự động từ chấm công
  hours              REAL    NOT NULL DEFAULT 0,
  paid_leave_days    INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_days  INTEGER NOT NULL DEFAULT 0,
  base_pay           INTEGER NOT NULL DEFAULT 0, -- lương theo ngày công
  allowance          INTEGER NOT NULL DEFAULT 0, -- trợ cấp
  total              INTEGER NOT NULL DEFAULT 0, -- thực lĩnh
  note               TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid')),
  pay_date           TEXT,                       -- ngày trả theo lịch (ngày 5 tháng sau)
  paid_at            TEXT,
  transaction_id     INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (staff_id, month)
);

-- Mã tặng 1 ly nước cho khách đã góp ý, dùng ở lần ăn sau
CREATE TABLE vouchers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  feedback_id     INTEGER REFERENCES feedback(id) ON DELETE SET NULL,
  source_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL, -- đơn lúc khách góp ý
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','used')),
  expires_at      TEXT NOT NULL,                                     -- YYYY-MM-DD (giờ VN)
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,  -- đơn đã dùng mã
  order_item_id   INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  used_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vouchers_source ON vouchers(source_order_id);

-- Góp ý & phản hồi của khách
CREATE TABLE feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number  INTEGER,
  customer_name TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content       TEXT,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chống dò mật khẩu / mã PIN
CREATE TABLE login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  kind       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts ON login_attempts(ip, kind, created_at);
