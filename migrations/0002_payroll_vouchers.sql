-- Nâng cấp database ĐÃ CÓ DỮ LIỆU (không xoá dữ liệu cũ):
--   npx wrangler d1 execute lalida-db --remote --file=./migrations/0002_payroll_vouchers.sql
-- Cài mới thì không cần file này (schema.sql + seed.sql đã bao gồm).

ALTER TABLE staff ADD COLUMN monthly_salary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN allowance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS payroll (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id           INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month              TEXT NOT NULL,
  monthly_salary     INTEGER NOT NULL DEFAULT 0,
  hourly_rate        INTEGER NOT NULL DEFAULT 0,
  days_in_month      INTEGER NOT NULL DEFAULT 0,
  worked_days        INTEGER NOT NULL DEFAULT 0,
  worked_days_manual INTEGER,
  hours              REAL    NOT NULL DEFAULT 0,
  paid_leave_days    INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_days  INTEGER NOT NULL DEFAULT 0,
  base_pay           INTEGER NOT NULL DEFAULT 0,
  allowance          INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  note               TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid')),
  pay_date           TEXT,
  paid_at            TEXT,
  transaction_id     INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (staff_id, month)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  feedback_id     INTEGER REFERENCES feedback(id) ON DELETE SET NULL,
  source_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','used')),
  expires_at      TEXT NOT NULL,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id   INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  used_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vouchers_source ON vouchers(source_order_id);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('customer_ordering', '0'),
  ('feedback_reward_enabled', '1'),
  ('vouchers_per_order', '1'),
  ('voucher_valid_days', '30'),
  ('paid_leave_days', '2'),
  ('payday', '5');
