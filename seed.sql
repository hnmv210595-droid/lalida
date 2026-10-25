-- Dữ liệu mẫu ban đầu cho LaLiDa. Chạy sau schema.sql.

INSERT INTO settings (key, value) VALUES
  ('shop_name',      'LaLiDa - Cơm Gà'),
  ('shop_slogan',    'Gà ba nuôi - Cơm mẹ nấu'),
  ('shop_address',   'Địa chỉ quán'),
  ('shop_phone',     '0900 000 000'),
  ('public_base_url','https://lalida.net'),
  ('vat_enabled',    '1'),
  ('vat_percent',    '8'),
  ('paper_width',    '80'),
  ('bill_footer',    'Cảm ơn quý khách - Hẹn gặp lại!'),
  ('customer_ordering',       '0'),  -- 0: khách quét QR chỉ xem thực đơn & góp ý
  ('feedback_reward_enabled', '1'),  -- tặng 1 ly nước cho lần sau khi góp ý
  ('vouchers_per_order',      '1'),
  ('voucher_valid_days',      '30'),
  ('paid_leave_days',         '2'),  -- số ngày nghỉ có lương mỗi tháng
  ('payday',                  '5');  -- ngày trả lương hàng tháng

INSERT INTO categories (slug, name, sort_order) VALUES
  ('com',      'Cơm',      1),
  ('do-an',    'Đồ Ăn',    2),
  ('canh',     'Canh',     3),
  ('do-uong',  'Đồ Uống',  4),
  ('goi-them', 'Gọi Thêm', 5);

INSERT INTO menu_items (category_id, name, description, price, sort_order) VALUES
  ((SELECT id FROM categories WHERE slug='com'), 'Cơm gà luộc',           'Gà ta luộc, cơm nấu nước gà, nước mắm gừng', 45000, 1),
  ((SELECT id FROM categories WHERE slug='com'), 'Cơm gà xé phay',        'Gà xé trộn hành tây, rau răm',               45000, 2),
  ((SELECT id FROM categories WHERE slug='com'), 'Cơm gà chiên mắm',      'Đùi gà chiên giòn sốt mắm tỏi',              50000, 3),
  ((SELECT id FROM categories WHERE slug='com'), 'Cơm gà quay',           'Gà quay da giòn',                            55000, 4),
  ((SELECT id FROM categories WHERE slug='do-an'), 'Gà luộc nửa con',      'Gà ta thả vườn',                            160000, 1),
  ((SELECT id FROM categories WHERE slug='do-an'), 'Gỏi gà bắp cải',       'Phần 2 người',                               70000, 2),
  ((SELECT id FROM categories WHERE slug='do-an'), 'Lòng gà xào mướp',     NULL,                                         60000, 3),
  ((SELECT id FROM categories WHERE slug='canh'), 'Canh bí đỏ',            NULL,                                         15000, 1),
  ((SELECT id FROM categories WHERE slug='canh'), 'Canh rau ngót',         NULL,                                         15000, 2),
  ((SELECT id FROM categories WHERE slug='canh'), 'Canh chua',             NULL,                                         25000, 3),
  ((SELECT id FROM categories WHERE slug='do-uong'), 'Trà đá',             NULL,                                          5000, 1),
  ((SELECT id FROM categories WHERE slug='do-uong'), 'Trà tắc',            NULL,                                         15000, 2),
  ((SELECT id FROM categories WHERE slug='do-uong'), 'Nước ngọt lon',      NULL,                                         15000, 3),
  ((SELECT id FROM categories WHERE slug='do-uong'), 'Nước sâm',           NULL,                                         15000, 4),
  ((SELECT id FROM categories WHERE slug='goi-them'), 'Thêm cơm',          NULL,                                         10000, 1),
  ((SELECT id FROM categories WHERE slug='goi-them'), 'Thêm trứng ốp la',  NULL,                                         10000, 2),
  ((SELECT id FROM categories WHERE slug='goi-them'), 'Thêm đùi gà',       NULL,                                         30000, 3),
  ((SELECT id FROM categories WHERE slug='goi-them'), 'Thêm dưa leo',      NULL,                                          5000, 4);

INSERT INTO tables (number, name, seats) VALUES
  (1, 'Bàn 1', 4), (2, 'Bàn 2', 4), (3, 'Bàn 3', 4),
  (4, 'Bàn 4', 6), (5, 'Bàn 5', 6), (6, 'Bàn 6', 2);
