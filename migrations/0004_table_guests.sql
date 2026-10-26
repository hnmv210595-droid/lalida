-- Nâng cấp database ĐÃ CÓ DỮ LIỆU: mỗi lượt quét QR tại bàn là một đơn riêng (Bàn 1-1, Bàn 1-2...)
--   npx wrangler d1 execute lalida-db --remote --file=./migrations/0004_table_guests.sql
-- Cài mới thì không cần file này (schema.sql đã bao gồm).

ALTER TABLE orders ADD COLUMN guest_no INTEGER;
UPDATE orders SET guest_no = 1 WHERE order_type = 'table' AND guest_no IS NULL;

DROP INDEX IF EXISTS ux_orders_open_table;
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_open_guest ON orders(table_number, guest_no) WHERE status = 'open' AND order_type = 'table';
