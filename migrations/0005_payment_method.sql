-- Nâng cấp database ĐÃ CÓ DỮ LIỆU: tách thu chi theo Chuyển khoản (CK) / Tiền mặt (TM)
--   npx wrangler d1 execute lalida-db --remote --file=./migrations/0005_payment_method.sql
-- Cài mới thì không cần file này (schema.sql đã bao gồm).

ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';
-- Khoản thu bán hàng cũ: lấy theo hình thức của đơn (thẻ tính như chuyển khoản); khoản khác mặc định tiền mặt
UPDATE transactions SET payment_method = 'transfer'
  WHERE order_id IN (SELECT id FROM orders WHERE payment_method IN ('transfer', 'card'));
UPDATE orders SET payment_method = 'transfer' WHERE payment_method = 'card';
