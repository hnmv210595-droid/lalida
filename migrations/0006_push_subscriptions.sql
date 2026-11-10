-- Nâng cấp database ĐÃ CÓ DỮ LIỆU: thông báo đẩy (chuông báo đơn mới) tới điện thoại / máy tính của nhân viên
--   npx wrangler d1 execute lalida-db --remote --file=./migrations/0006_push_subscriptions.sql
-- Cài mới thì không cần file này (schema.sql đã bao gồm).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,      -- địa chỉ nhận thông báo do trình duyệt cấp (mỗi máy một địa chỉ)
  device     TEXT,                      -- tên thiết bị để dễ nhận biết (Android, iPhone, Windows...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
