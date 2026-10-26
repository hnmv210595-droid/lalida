-- Nâng cấp database ĐÃ CÓ DỮ LIỆU để hỗ trợ Đặt online (không xoá dữ liệu cũ):
--   npx wrangler d1 execute lalida-db --remote --file=./migrations/0003_online_orders.sql
-- Cài mới thì không cần file này (schema.sql + seed.sql đã bao gồm).

ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'table' CHECK (order_type IN ('table','online'));
ALTER TABLE orders ADD COLUMN customer_name TEXT;
ALTER TABLE orders ADD COLUMN customer_phone TEXT;
ALTER TABLE orders ADD COLUMN customer_address TEXT;
ALTER TABLE orders ADD COLUMN access_token TEXT;

-- Mỗi bàn 1 đơn mở; đơn online (table_number = 0) thì không giới hạn
DROP INDEX IF EXISTS ux_orders_open_table;
CREATE UNIQUE INDEX ux_orders_open_table ON orders(table_number) WHERE status = 'open' AND order_type = 'table';

INSERT OR IGNORE INTO settings (key, value) VALUES ('online_ordering', '1');
