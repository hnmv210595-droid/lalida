// LaLiDa API - chạy trên Cloudflare Workers (Pages Functions), dữ liệu trên D1
import { HttpError, json, readJson, int, str, oneOf, dateStr, timeStr, vnToday, vnTime, clientIp } from './http.js';
import {
  ADMIN_COOKIE, FINANCE_COOKIE, ADMIN_TTL, FINANCE_TTL,
  makeToken, cookie, isAdmin, isFinance, checkCredential, saveCredential, guardAttempts, safeEqual,
} from './auth.js';
import {
  getSettings, attachItems, getOrder, createTableOrder, prepareItems, insertItems, newAccessToken,
  computeTotals, vatPercent, calcPay,
} from './store.js';

const routes = [];
// access: 'public' | 'admin' | 'finance' (finance = admin + mã PIN cấp 2)
function route(method, pattern, access, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
  routes.push({ method, re, keys, access, handler });
}

const PUBLIC_SETTING_KEYS = [
  'shop_name', 'shop_slogan', 'shop_address', 'shop_phone', 'vat_enabled', 'vat_percent',
  'customer_ordering', 'online_ordering', 'feedback_reward_enabled', 'voucher_valid_days',
];
const EDITABLE_SETTING_KEYS = [
  'shop_name', 'shop_slogan', 'shop_address', 'shop_phone', 'public_base_url',
  'vat_enabled', 'vat_percent', 'paper_width', 'bill_footer',
  'customer_ordering', 'online_ordering', 'feedback_reward_enabled', 'vouchers_per_order', 'voucher_valid_days',
  'paid_leave_days', 'payday',
];
const BOOLEAN_SETTINGS = ['vat_enabled', 'customer_ordering', 'online_ordering', 'feedback_reward_enabled'];
const INT_SETTINGS = {
  vouchers_per_order: [1, 20, 'Số mã tặng mỗi lượt ăn'],
  voucher_valid_days: [1, 365, 'Hạn dùng mã tặng'],
  paid_leave_days: [0, 31, 'Số ngày nghỉ có lương'],
  payday: [1, 28, 'Ngày trả lương'],
};

// Khách tự gọi món qua QR chỉ hoạt động khi bật trong Cài đặt (mặc định tắt: khách chỉ xem thực đơn & góp ý)
async function requireCustomerOrdering(env) {
  if ((await getSettings(env)).customer_ordering !== '1') {
    throw new HttpError(403, 'Vui lòng gọi nhân viên để đặt món');
  }
}

async function requireOnlineOrdering(env) {
  if ((await getSettings(env)).online_ordering !== '1') throw new HttpError(403, 'Quán tạm ngừng nhận đơn online');
}

// Mỗi khách (mỗi điện thoại) giữ access_token của đơn mình để xem / sửa / gọi thêm - cả đơn tại bàn và đơn online
async function findOwnedOrder(env, orderId, token, type) {
  const id = int(orderId, { min: 1, name: 'Mã đơn' });
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND order_type = ?').bind(id, type).first();
  if (!o || !token || !safeEqual(String(token), o.access_token || '')) throw new HttpError(404, 'Không tìm thấy đơn của bạn');
  return o;
}

const PHONE_RE = /^(0|\+84)\d{9,10}$/;
const ONLINE_ORDERS_PER_HOUR = 5; // chống spam: tối đa 5 đơn online mới / giờ / IP

// Mã tặng nước: LLD-XXXXXX (bỏ ký tự dễ nhầm 0/O, 1/I)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function voucherCode() {
  return 'LLD-' + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % 32]).join('');
}
const addDays = (date, n) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
const ITEM_STATUSES = ['pending', 'cooking', 'served', 'cancelled'];
const PAYMENT_METHODS = ['cash', 'transfer', 'card'];

// =============================================================
// KHÁCH HÀNG (không cần đăng nhập)
// =============================================================
route('GET', '/public/menu', 'public', async ({ env }) => {
  const [cats, items, settings] = await Promise.all([
    env.DB.prepare('SELECT id, slug, name FROM categories ORDER BY sort_order, id').all(),
    // Gồm cả món hết hàng (is_available = 0) để khách thấy "Đã bán hết"; đặt món hết hàng bị chặn ở prepareItems
    env.DB.prepare(
      'SELECT id, category_id, name, description, price, image_url, is_available FROM menu_items ORDER BY sort_order, id'
    ).all(),
    getSettings(env),
  ]);
  const pub = Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, settings[k] ?? '']));
  return { categories: cats.results, items: items.results, settings: pub };
});

route('GET', '/public/tables/:number', 'public', async ({ env, params }) => {
  const t = await env.DB.prepare('SELECT number, name FROM tables WHERE number = ? AND is_active = 1').bind(params.number).first();
  if (!t) throw new HttpError(404, 'Bàn không tồn tại');
  return t;
});

// Gọi món tại bàn: mỗi điện thoại quét QR có đơn riêng (Bàn 1-1, Bàn 1-2...).
// Gửi kèm order_id + token của đơn mình đang mở ở bàn này -> gọi thêm vào đơn đó; ngược lại tạo đơn mới.
route('POST', '/public/orders', 'public', async ({ env, body }) => {
  await requireCustomerOrdering(env);
  const table = int(body.table, { min: 1, max: 100000, name: 'Số bàn' });
  const prepared = await prepareItems(env, body);
  if (body.order_id && body.token) {
    const o = await findOwnedOrder(env, body.order_id, body.token, 'table').catch(() => null);
    if (o && o.status === 'open' && o.table_number === table) return { order: await insertItems(env, o, prepared), token: body.token };
  }
  return createTableOrder(env, table, prepared);
});

route('GET', '/public/orders/:id', 'public', async ({ env, params, url }) => {
  await requireCustomerOrdering(env);
  const o = await findOwnedOrder(env, params.id, url.searchParams.get('token'), 'table');
  return { order: (await attachItems(env, [o]))[0] };
});

// ---------- ĐẶT ONLINE (lalida.net/online): khách điền Tên, SĐT, Địa chỉ ----------
// Có order_id + token của đơn còn mở -> gọi thêm vào đơn đó; ngược lại tạo đơn online mới
route('POST', '/public/online-orders', 'public', async ({ env, request, body }) => {
  await requireOnlineOrdering(env);
  if (body.order_id && body.token) {
    const o = await findOwnedOrder(env, body.order_id, body.token, 'online');
    if (o.status === 'open') return { order: await insertItems(env, o, await prepareItems(env, body)), token: body.token };
  }
  const name = str(body.customer_name, { max: 80, required: true, name: 'Tên' });
  const phone = String(body.customer_phone ?? '').replace(/[\s.-]/g, '');
  if (!PHONE_RE.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ');
  const address = str(body.customer_address, { max: 300, required: true, name: 'Địa chỉ' });
  const prepared = await prepareItems(env, body);

  const ip = clientIp(request);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND kind = 'online_order' AND created_at > datetime('now', '-60 minutes')"
  )
    .bind(ip)
    .first();
  if (recent.n >= ONLINE_ORDERS_PER_HOUR) throw new HttpError(429, 'Bạn đã đặt nhiều đơn liên tiếp, vui lòng gọi điện cho quán');

  const token = newAccessToken();
  const res = await env.DB.prepare(
    `INSERT INTO orders (table_number, order_type, customer_name, customer_phone, customer_address, access_token, status)
     VALUES (0, 'online', ?, ?, ?, ?, 'open')`
  )
    .bind(name, phone, address, token)
    .run();
  await env.DB.prepare("INSERT INTO login_attempts (ip, kind) VALUES (?, 'online_order')").bind(ip).run();
  const order = await insertItems(env, { id: res.meta.last_row_id, note: null }, prepared);
  return { order, token };
});

route('GET', '/public/online-orders/:id', 'public', async ({ env, params, url }) => {
  const o = await findOwnedOrder(env, params.id, url.searchParams.get('token'), 'online');
  return { order: (await attachItems(env, [o]))[0] };
});

// Khách sửa đơn của mình: đổi số lượng hoặc bỏ món (quantity = 0) - chỉ với món bếp chưa làm ("Đang chờ").
// Gửi { order_id, token } của đơn (tại bàn hoặc online).
route('PATCH', '/public/order-items/:id', 'public', async ({ env, params, body }) => {
  const quantity = int(body.quantity, { min: 0, max: 50, name: 'Số lượng' });
  const item = await env.DB.prepare(
    `SELECT i.id, i.status, i.order_id, o.order_type, o.access_token, o.status AS order_status,
       EXISTS (SELECT 1 FROM vouchers v WHERE v.order_item_id = i.id) AS is_gift
     FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ?`
  )
    .bind(params.id)
    .first();
  if (item?.order_type === 'online') await requireOnlineOrdering(env);
  else await requireCustomerOrdering(env);
  const owns = !!item && item.order_id === Number(body.order_id) && !!body.token && safeEqual(String(body.token), item.access_token || '');
  if (!owns || item.order_status !== 'open') throw new HttpError(404, 'Không tìm thấy món trong đơn của bạn');
  if (item.is_gift) throw new HttpError(409, 'Không sửa được ly nước tặng, vui lòng báo nhân viên');
  if (item.status !== 'pending') throw new HttpError(409, 'Bếp đã bắt đầu làm món này, vui lòng báo nhân viên nếu cần đổi');
  const res = await env.DB.prepare(
    quantity === 0
      ? "UPDATE order_items SET status = 'cancelled' WHERE id = ? AND status = 'pending'"
      : "UPDATE order_items SET quantity = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(...(quantity === 0 ? [item.id] : [quantity, item.id]))
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'Bếp đã bắt đầu làm món này, vui lòng báo nhân viên nếu cần đổi');
  await env.DB.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").bind(item.order_id).run();
  return { order: await getOrder(env, item.order_id) };
});

// Góp ý: khách đang dùng bữa tại bàn (bàn có đơn đang mở) được tặng mã 1 ly nước cho lần sau
route('POST', '/public/feedback', 'public', async ({ env, body }) => {
  const rating = int(body.rating, { min: 1, max: 5, name: 'Số sao đánh giá' });
  const content = str(body.content, { max: 1000, name: 'Nội dung' });
  const name = str(body.customer_name, { max: 80, name: 'Tên' });
  const table = int(body.table, { min: 1, required: false, name: 'Số bàn' });
  const fb = await env.DB.prepare('INSERT INTO feedback (table_number, customer_name, rating, content) VALUES (?, ?, ?, ?)')
    .bind(table, name, rating, content)
    .run();

  const s = await getSettings(env);
  if (s.feedback_reward_enabled !== '1') return { ok: true, voucher: null };
  let reason = null;
  let order = null;
  if (body.order_id && body.token) {
    // Đơn của chính khách (tại bàn hoặc online): đang mở hoặc đã thanh toán đều được nhận quà
    const o = await env.DB.prepare('SELECT id, access_token, status FROM orders WHERE id = ?').bind(int(body.order_id, { min: 1 })).first();
    if (o && o.status !== 'cancelled' && safeEqual(String(body.token), o.access_token || '')) order = o;
  } else if (table) {
    // Khách gọi món qua nhân viên (không có đơn trên máy): lấy đơn mở gần nhất của bàn
    order = await env.DB.prepare(
      "SELECT id FROM orders WHERE table_number = ? AND status = 'open' AND order_type = 'table' ORDER BY id DESC LIMIT 1"
    )
      .bind(table)
      .first();
  }
  if (!table && !body.order_id) reason = 'Quét mã QR tại bàn hoặc đặt online để nhận quà tặng';
  else if (!content || content.length < 5) reason = 'Hãy viết vài dòng góp ý để nhận quà tặng';
  else if (!order) reason = 'Quà tặng dành cho khách đã đặt món';
  else {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE source_order_id = ?').bind(order.id).first();
    if (n >= (Number(s.vouchers_per_order) || 1)) reason = 'Bạn đã nhận quà tặng cho đơn này';
  }
  if (reason) return { ok: true, voucher: null, voucher_note: reason };

  const expires = addDays(vnToday(), Number(s.voucher_valid_days) || 30);
  for (let i = 0; i < 5; i++) {
    const code = voucherCode();
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO vouchers (code, feedback_id, source_order_id, expires_at) VALUES (?, ?, ?, ?)'
    )
      .bind(code, fb.meta.last_row_id, order.id, expires)
      .run();
    if (res.meta.changes) return { ok: true, voucher: { code, expires_at: expires } };
  }
  throw new HttpError(500, 'Không tạo được mã quà tặng, vui lòng thử lại');
});

// =============================================================
// ĐĂNG NHẬP ADMIN + MÃ PIN CẤP 2
// =============================================================
route('POST', '/auth/login', 'public', async ({ env, request, body }) => {
  const guard = await guardAttempts(request, env, 'login');
  const password = str(body.password, { max: 200, required: true, name: 'Mật khẩu' });
  if (!(await checkCredential(env, 'login', password))) {
    await guard.fail();
    throw new HttpError(401, 'Mật khẩu không đúng');
  }
  await guard.success();
  return json({ ok: true }, 200, { 'set-cookie': cookie(request, ADMIN_COOKIE, await makeToken(env, 'admin', ADMIN_TTL), ADMIN_TTL) });
});

route('POST', '/auth/logout', 'public', async ({ request }) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', cookie(request, ADMIN_COOKIE, '', 0));
  headers.append('set-cookie', cookie(request, FINANCE_COOKIE, '', 0));
  return new Response(JSON.stringify({ ok: true }), { headers });
});

route('GET', '/auth/me', 'public', async ({ env, request }) => {
  const admin = await isAdmin(request, env);
  return { admin, finance: admin && (await isFinance(request, env)) };
});

route('POST', '/auth/pin', 'admin', async ({ env, request, body }) => {
  const guard = await guardAttempts(request, env, 'pin');
  const pin = str(body.pin, { max: 20, required: true, name: 'Mã PIN' });
  if (!(await checkCredential(env, 'pin', pin))) {
    await guard.fail();
    throw new HttpError(401, 'Mã PIN cấp 2 không đúng');
  }
  await guard.success();
  return json({ ok: true }, 200, {
    'set-cookie': cookie(request, FINANCE_COOKIE, await makeToken(env, 'finance', FINANCE_TTL), FINANCE_TTL),
  });
});

route('POST', '/auth/lock-finance', 'admin', async ({ request }) =>
  json({ ok: true }, 200, { 'set-cookie': cookie(request, FINANCE_COOKIE, '', 0) })
);

route('PUT', '/admin/password', 'admin', async ({ env, body }) => {
  if (!(await checkCredential(env, 'login', String(body.current ?? '')))) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  const next = str(body.new_password, { max: 200, required: true, name: 'Mật khẩu mới' });
  if (next.length < 8) throw new HttpError(400, 'Mật khẩu mới tối thiểu 8 ký tự');
  await saveCredential(env, 'login', next);
  return { ok: true };
});

route('PUT', '/finance/pin', 'finance', async ({ env, body }) => {
  if (!(await checkCredential(env, 'pin', String(body.current ?? '')))) throw new HttpError(400, 'Mã PIN hiện tại không đúng');
  const next = String(body.new_pin ?? '');
  if (!/^\d{4,8}$/.test(next)) throw new HttpError(400, 'Mã PIN mới phải gồm 4-8 chữ số');
  await saveCredential(env, 'pin', next);
  return { ok: true };
});

// =============================================================
// ĐƠN HÀNG / BẾP (KDS) / THU NGÂN
// =============================================================
route('GET', '/admin/summary', 'admin', async ({ env }) => {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE status = 'open') AS open_orders,
       (SELECT COUNT(*) FROM orders WHERE status = 'open' AND order_type = 'table') AS open_table_orders,
       (SELECT COUNT(*) FROM orders WHERE status = 'open' AND order_type = 'online') AS open_online_orders,
       (SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE o.status = 'open' AND i.status IN ('pending','cooking')) AS waiting_items,
       (SELECT COUNT(*) FROM feedback WHERE is_read = 0) AS unread_feedback,
       (SELECT COALESCE(MAX(id), 0) FROM order_items) AS last_item_id`
  ).first();
  // Nhắc trả lương: từ ngày trả lương (mặc định ngày 5), đếm nhân viên chưa được trả lương tháng trước
  const today = vnToday();
  const payday = Number((await getSettings(env)).payday) || 5;
  row.payroll_due = 0;
  if (Number(today.slice(8)) >= payday) {
    const month = prevMonth(today.slice(0, 7));
    const due = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM staff s
         WHERE s.is_active = 1 AND (s.monthly_salary > 0 OR s.hourly_rate > 0)
           AND date(s.created_at, '+7 hours') < ?
           AND NOT EXISTS (SELECT 1 FROM payroll p WHERE p.staff_id = s.id AND p.month = ? AND p.status = 'paid')`
    )
      .bind(today.slice(0, 7) + '-01', month)
      .first();
    row.payroll_due = due.n;
    row.payroll_month = month;
  }
  return row;
});

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// Danh sách đơn: đơn đặt trước hiện trước (sắp xếp theo giờ tạo tăng dần).
// type = table (đang phục vụ tại quán) | online (đơn online) | bỏ trống = tất cả
route('GET', '/admin/orders', 'admin', async ({ env, url }) => {
  const status = oneOf(url.searchParams.get('status') || 'open', ['open', 'paid', 'cancelled'], 'Trạng thái');
  const type = url.searchParams.get('type') ? oneOf(url.searchParams.get('type'), ['table', 'online'], 'Loại đơn') : null;
  const where = ['status = ?'];
  const binds = [status];
  if (type) {
    where.push('order_type = ?');
    binds.push(type);
  }
  if (status !== 'open') {
    where.push("date(COALESCE(paid_at, updated_at), '+7 hours') = ?");
    binds.push(dateStr(url.searchParams.get('date') || vnToday()));
  }
  const { results } = await env.DB.prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at, id`)
    .bind(...binds)
    .all();
  return { orders: await attachItems(env, results) };
});

// Nhân viên gọi món: có order_id -> thêm vào đơn đó (vd. Bàn 1-2); không có -> tạo lượt khách mới cho bàn
route('POST', '/admin/orders', 'admin', async ({ env, body }) => {
  const prepared = await prepareItems(env, body);
  if (body.order_id) {
    const o = await requireOpenOrder(env, int(body.order_id, { min: 1, name: 'Đơn' }));
    return { order: await insertItems(env, o, prepared) };
  }
  const { order } = await createTableOrder(env, int(body.table, { min: 1, max: 100000, name: 'Số bàn' }), prepared);
  return { order };
});

route('GET', '/admin/orders/:id', 'admin', async ({ env, params }) => ({ order: await getOrder(env, params.id) }));

async function requireOpenOrder(env, id) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng');
  if (order.status !== 'open') throw new HttpError(409, 'Đơn hàng đã đóng');
  return order;
}

route('PATCH', '/admin/order-items/:id', 'admin', async ({ env, params, body }) => {
  const status = oneOf(body.status, ITEM_STATUSES, 'Trạng thái món');
  const item = await env.DB.prepare('SELECT order_id FROM order_items WHERE id = ?').bind(params.id).first();
  if (!item) throw new HttpError(404, 'Không tìm thấy món');
  await requireOpenOrder(env, item.order_id);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE order_items SET status = ?, served_at = CASE WHEN ? = 'served' THEN datetime('now') ELSE NULL END WHERE id = ?`
    ).bind(status, status, params.id),
    env.DB.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").bind(item.order_id),
    // Huỷ món tặng -> trả lại mã cho khách dùng lần khác
    env.DB.prepare(
      `UPDATE vouchers SET status = 'active', order_id = NULL, order_item_id = NULL, used_at = NULL
         WHERE order_item_id = ? AND ? = 'cancelled'`
    ).bind(params.id, status),
  ]);
  return { order: await getOrder(env, item.order_id) };
});

// Nút "Đã lên món": đánh dấu toàn bộ món của đơn đã phục vụ
route('POST', '/admin/orders/:id/serve', 'admin', async ({ env, params }) => {
  await requireOpenOrder(env, params.id);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE order_items SET status = 'served', served_at = datetime('now') WHERE order_id = ? AND status IN ('pending','cooking')"
    ).bind(params.id),
    env.DB.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").bind(params.id),
  ]);
  return { order: await getOrder(env, params.id) };
});

// Nút "Đã thanh toán": chốt tiền (kèm VAT), đóng đơn, tự ghi khoản thu
route('POST', '/admin/orders/:id/pay', 'admin', async ({ env, params, body }) => {
  const method = oneOf(body.payment_method || 'cash', PAYMENT_METHODS, 'Hình thức thanh toán');
  await requireOpenOrder(env, params.id);
  const { results: items } = await env.DB.prepare('SELECT price, quantity, status FROM order_items WHERE order_id = ?')
    .bind(params.id)
    .all();
  const t = computeTotals(items, vatPercent(await getSettings(env)));
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', subtotal = ?, vat_percent = ?, vat_amount = ?, total = ?, payment_method = ?,
       paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'open'`
  )
    .bind(t.subtotal, t.vat_percent, t.vat_amount, t.total, method, params.id)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(409, 'Đơn hàng đã được thanh toán');
  const order = await getOrder(env, params.id);
  await env.DB.prepare(
    "INSERT INTO transactions (type, category, amount, description, txn_date, order_id) VALUES ('income', 'Bán hàng', ?, ?, ?, ?)"
  )
    .bind(t.total, `Đơn #${order.id} - Bàn ${order.table_number}`, vnToday(), order.id)
    .run();
  return { order };
});

route('POST', '/admin/orders/:id/cancel', 'admin', async ({ env, params }) => {
  await requireOpenOrder(env, params.id);
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(params.id),
    env.DB.prepare(
      "UPDATE vouchers SET status = 'active', order_id = NULL, order_item_id = NULL, used_at = NULL WHERE order_id = ?"
    ).bind(params.id),
  ]);
  return { ok: true };
});

// Dùng mã tặng: thu ngân chọn ly nước bất kỳ trong mục Đồ Uống, thêm vào hoá đơn với giá 0đ
route('POST', '/admin/orders/:id/voucher', 'admin', async ({ env, params, body }) => {
  const order = await requireOpenOrder(env, params.id);
  let code = str(body.code, { max: 20, required: true, name: 'Mã tặng' }).toUpperCase().replace(/\s+/g, '');
  if (!code.startsWith('LLD-')) code = 'LLD-' + code.replace(/^LLD/, '');
  const v = await env.DB.prepare('SELECT * FROM vouchers WHERE code = ?').bind(code).first();
  if (!v) throw new HttpError(404, 'Mã tặng không tồn tại');
  if (v.status === 'used') throw new HttpError(409, 'Mã tặng đã được sử dụng');
  if (v.expires_at < vnToday()) throw new HttpError(409, `Mã tặng đã hết hạn (${v.expires_at.split('-').reverse().join('/')})`);
  if (v.source_order_id === order.id) throw new HttpError(409, 'Mã tặng chỉ áp dụng cho lần ăn sau');
  const drink = await env.DB.prepare(
    `SELECT m.id, m.name FROM menu_items m JOIN categories c ON c.id = m.category_id WHERE m.id = ? AND c.slug = 'do-uong'`
  )
    .bind(int(body.menu_item_id, { min: 1, name: 'Đồ uống' }))
    .first();
  if (!drink) throw new HttpError(400, 'Vui lòng chọn một món trong mục Đồ Uống');

  const claim = await env.DB.prepare(
    "UPDATE vouchers SET status = 'used', used_at = datetime('now'), order_id = ? WHERE id = ? AND status = 'active'"
  )
    .bind(order.id, v.id)
    .run();
  if (claim.meta.changes !== 1) throw new HttpError(409, 'Mã tặng đã được sử dụng');
  const item = await env.DB.prepare(
    'INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, note) VALUES (?, ?, ?, 0, 1, ?)'
  )
    .bind(order.id, drink.id, `${drink.name} (Tặng)`, `Quà góp ý - mã ${code}`)
    .run();
  await env.DB.batch([
    env.DB.prepare('UPDATE vouchers SET order_item_id = ? WHERE id = ?').bind(item.meta.last_row_id, v.id),
    env.DB.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").bind(order.id),
  ]);
  return { order: await getOrder(env, order.id) };
});

// =============================================================
// BÀN & QR
// =============================================================
route('GET', '/admin/tables', 'admin', async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM orders o WHERE o.table_number = t.number AND o.status = 'open' AND o.order_type = 'table') AS open_orders
     FROM tables t ORDER BY t.number`
  ).all();
  return { tables: results };
});

route('POST', '/admin/tables', 'admin', async ({ env, body }) => {
  const number = int(body.number, { min: 1, max: 100000, name: 'Số bàn' });
  const name = str(body.name, { max: 50, name: 'Tên bàn' }) || `Bàn ${number}`;
  const seats = int(body.seats ?? 4, { min: 1, max: 100, name: 'Số ghế' });
  const exists = await env.DB.prepare('SELECT 1 FROM tables WHERE number = ?').bind(number).first();
  if (exists) throw new HttpError(409, `Bàn số ${number} đã tồn tại`);
  await env.DB.prepare('INSERT INTO tables (number, name, seats) VALUES (?, ?, ?)').bind(number, name, seats).run();
  return { ok: true };
});

route('DELETE', '/admin/tables/:id', 'admin', async ({ env, params }) => {
  const t = await env.DB.prepare('SELECT number FROM tables WHERE id = ?').bind(params.id).first();
  if (!t) throw new HttpError(404, 'Không tìm thấy bàn');
  const open = await env.DB.prepare("SELECT 1 FROM orders WHERE table_number = ? AND status = 'open'").bind(t.number).first();
  if (open) throw new HttpError(409, 'Bàn đang có đơn chưa thanh toán, không thể xoá');
  await env.DB.prepare('DELETE FROM tables WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// =============================================================
// THỰC ĐƠN
// =============================================================
route('GET', '/admin/menu', 'admin', async ({ env }) => {
  const [cats, items] = await Promise.all([
    env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, id').all(),
    env.DB.prepare('SELECT * FROM menu_items ORDER BY category_id, sort_order, id').all(),
  ]);
  return { categories: cats.results, items: items.results };
});

function menuFields(body) {
  return [
    int(body.category_id, { min: 1, name: 'Danh mục' }),
    str(body.name, { max: 100, required: true, name: 'Tên món' }),
    str(body.description, { max: 300, name: 'Mô tả' }),
    int(body.price, { min: 0, max: 100000000, name: 'Giá' }),
    str(body.image_url, { max: 500, name: 'Link ảnh' }),
    body.is_available === false || body.is_available === 0 ? 0 : 1,
    int(body.sort_order ?? 0, { min: 0, max: 10000, name: 'Thứ tự' }),
  ];
}

route('POST', '/admin/menu', 'admin', async ({ env, body }) => {
  await env.DB.prepare(
    'INSERT INTO menu_items (category_id, name, description, price, image_url, is_available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(...menuFields(body))
    .run();
  return { ok: true };
});

route('PUT', '/admin/menu/:id', 'admin', async ({ env, params, body }) => {
  const res = await env.DB.prepare(
    'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, is_available = ?, sort_order = ? WHERE id = ?'
  )
    .bind(...menuFields(body), params.id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'Không tìm thấy món');
  return { ok: true };
});

route('DELETE', '/admin/menu/:id', 'admin', async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM menu_items WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// =============================================================
// NHÂN SỰ & CHẤM CÔNG
// =============================================================
route('GET', '/admin/staff', 'admin', async ({ env }) => {
  const { results } = await env.DB.prepare('SELECT * FROM staff ORDER BY is_active DESC, full_name').all();
  return { staff: results };
});

function staffFields(body) {
  return [
    str(body.full_name, { max: 100, required: true, name: 'Họ tên' }),
    str(body.phone, { max: 20, name: 'Số điện thoại' }),
    str(body.position, { max: 50, name: 'Chức vụ' }),
    int(body.hourly_rate ?? 0, { min: 0, max: 10000000, name: 'Lương/giờ' }),
    int(body.monthly_salary ?? 0, { min: 0, max: 1000000000, name: 'Lương tháng' }),
    int(body.allowance ?? 0, { min: 0, max: 1000000000, name: 'Trợ cấp' }),
    dateStr(body.start_date, { name: 'Ngày vào làm', required: false }),
    body.is_active === false || body.is_active === 0 ? 0 : 1,
    str(body.note, { max: 300, name: 'Ghi chú' }),
  ];
}

route('POST', '/admin/staff', 'admin', async ({ env, body }) => {
  await env.DB.prepare(
    `INSERT INTO staff (full_name, phone, position, hourly_rate, monthly_salary, allowance, start_date, is_active, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(...staffFields(body))
    .run();
  return { ok: true };
});

route('PUT', '/admin/staff/:id', 'admin', async ({ env, params, body }) => {
  const res = await env.DB.prepare(
    `UPDATE staff SET full_name = ?, phone = ?, position = ?, hourly_rate = ?, monthly_salary = ?, allowance = ?,
       start_date = ?, is_active = ?, note = ? WHERE id = ?`
  )
    .bind(...staffFields(body), params.id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'Không tìm thấy nhân viên');
  return { ok: true };
});

route('DELETE', '/admin/staff/:id', 'admin', async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM staff WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// Số giờ làm (xử lý ca qua đêm)
function hoursBetween(a, b) {
  if (!a || !b) return 0;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let diff = toMin(b) - toMin(a);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

route('GET', '/admin/attendance', 'admin', async ({ env, url }) => {
  const date = dateStr(url.searchParams.get('date') || vnToday());
  const { results } = await env.DB.prepare(
    `SELECT a.*, s.full_name, s.position, s.hourly_rate FROM attendance a JOIN staff s ON s.id = a.staff_id
       WHERE a.work_date = ? ORDER BY a.check_in, a.id`
  )
    .bind(date)
    .all();
  return { date, records: results.map((r) => ({ ...r, hours: hoursBetween(r.check_in, r.check_out) })) };
});

// Tổng hợp công theo tháng (YYYY-MM)
route('GET', '/admin/attendance/summary', 'admin', async ({ env, url }) => {
  const month = url.searchParams.get('month') || vnToday().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Tháng không hợp lệ');
  const { results } = await env.DB.prepare(
    `SELECT a.staff_id, a.work_date, a.check_in, a.check_out, s.full_name, s.hourly_rate, s.monthly_salary
       FROM attendance a JOIN staff s ON s.id = a.staff_id WHERE substr(a.work_date, 1, 7) = ?`
  )
    .bind(month)
    .all();
  const map = new Map();
  for (const r of results) {
    const e = map.get(r.staff_id) || {
      staff_id: r.staff_id, full_name: r.full_name, hourly_rate: r.hourly_rate, monthly_salary: r.monthly_salary, days: new Set(), hours: 0,
    };
    e.days.add(r.work_date);
    e.hours += hoursBetween(r.check_in, r.check_out);
    map.set(r.staff_id, e);
  }
  const summary = [...map.values()].map((e) => ({
    ...e,
    days: e.days.size,
    hours: Math.round(e.hours * 100) / 100,
    // Nhân viên lương tháng: xem chi tiết ở Bảng lương
    wage: e.monthly_salary > 0 ? null : Math.round(e.hours * e.hourly_rate),
  }));
  return { month, summary };
});

// =============================================================
// BẢNG LƯƠNG (yêu cầu mã PIN cấp 2) - trả vào ngày "payday" (mặc định 5) của tháng sau
// =============================================================
async function payrollContext(env, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError(400, 'Tháng không hợp lệ');
  const s = await getSettings(env);
  const payday = Number(s.payday) || 5;
  return {
    month,
    paidLeaveLimit: Number(s.paid_leave_days ?? 2),
    payday,
    pay_date: `${nextMonth(month)}-${String(payday).padStart(2, '0')}`,
  };
}

// Ngày công (số ngày có chấm công vào) và tổng giờ của từng nhân viên trong tháng
async function attendanceStats(env, month) {
  const { results } = await env.DB.prepare(
    'SELECT staff_id, work_date, check_in, check_out FROM attendance WHERE substr(work_date, 1, 7) = ? AND check_in IS NOT NULL'
  )
    .bind(month)
    .all();
  const map = new Map();
  for (const r of results) {
    const e = map.get(r.staff_id) || { days: new Set(), hours: 0 };
    e.days.add(r.work_date);
    e.hours += hoursBetween(r.check_in, r.check_out);
    map.set(r.staff_id, e);
  }
  return map;
}

function buildPayrollRow(ctx, staff, saved, stats) {
  if (saved?.status === 'paid') return { ...saved, full_name: staff.full_name, position: staff.position, auto_worked_days: stats?.days.size ?? 0 };
  const auto = stats?.days.size ?? 0;
  const manual = saved?.worked_days_manual ?? null;
  const pay = calcPay(staff, {
    month: ctx.month,
    workedDays: manual ?? auto,
    hours: stats?.hours ?? 0,
    allowance: saved ? saved.allowance : staff.allowance,
    paidLeaveLimit: ctx.paidLeaveLimit,
  });
  return {
    id: saved?.id ?? null,
    staff_id: staff.id,
    full_name: staff.full_name,
    position: staff.position,
    month: ctx.month,
    ...pay,
    auto_worked_days: auto,
    worked_days_manual: manual,
    note: saved?.note ?? null,
    status: 'draft',
    pay_date: ctx.pay_date,
  };
}

route('GET', '/finance/payroll', 'finance', async ({ env, url }) => {
  const ctx = await payrollContext(env, url.searchParams.get('month') || prevMonth(vnToday().slice(0, 7)));
  const [{ results: staff }, { results: saved }, stats] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM staff WHERE is_active = 1 OR id IN (SELECT staff_id FROM payroll WHERE month = ?) ORDER BY full_name'
    ).bind(ctx.month).all(),
    env.DB.prepare('SELECT * FROM payroll WHERE month = ?').bind(ctx.month).all(),
    attendanceStats(env, ctx.month),
  ]);
  const rows = staff.map((s) => buildPayrollRow(ctx, s, saved.find((p) => p.staff_id === s.id), stats.get(s.id)));
  const totals = rows.reduce(
    (t, r) => ({ base_pay: t.base_pay + r.base_pay, allowance: t.allowance + r.allowance, total: t.total + r.total }),
    { base_pay: 0, allowance: 0, total: 0 }
  );
  return { month: ctx.month, pay_date: ctx.pay_date, paid_leave_days: ctx.paidLeaveLimit, rows, totals };
});

async function loadPayrollInput(env, body) {
  const ctx = await payrollContext(env, body.month);
  const staffId = int(body.staff_id, { min: 1, name: 'Nhân viên' });
  const staff = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(staffId).first();
  if (!staff) throw new HttpError(404, 'Không tìm thấy nhân viên');
  const saved = await env.DB.prepare('SELECT * FROM payroll WHERE staff_id = ? AND month = ?').bind(staffId, ctx.month).first();
  if (saved?.status === 'paid') throw new HttpError(409, 'Đã trả lương tháng này, hãy hoàn tác trước khi sửa');
  return { ctx, staff, saved };
}

function payrollUpsert(env, row, status) {
  return env.DB.prepare(
    `INSERT INTO payroll (staff_id, month, monthly_salary, hourly_rate, days_in_month, worked_days, worked_days_manual, hours,
       paid_leave_days, unpaid_leave_days, base_pay, allowance, total, note, status, pay_date, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'paid' THEN datetime('now') END)
     ON CONFLICT (staff_id, month) DO UPDATE SET
       monthly_salary = excluded.monthly_salary, hourly_rate = excluded.hourly_rate, days_in_month = excluded.days_in_month,
       worked_days = excluded.worked_days, worked_days_manual = excluded.worked_days_manual, hours = excluded.hours,
       paid_leave_days = excluded.paid_leave_days, unpaid_leave_days = excluded.unpaid_leave_days, base_pay = excluded.base_pay,
       allowance = excluded.allowance, total = excluded.total, note = excluded.note, status = excluded.status,
       pay_date = excluded.pay_date, paid_at = excluded.paid_at
     WHERE payroll.status <> 'paid'`
  ).bind(
    row.staff_id, row.month, row.monthly_salary, row.hourly_rate, row.days_in_month, row.worked_days, row.worked_days_manual,
    row.hours, row.paid_leave_days, row.unpaid_leave_days, row.base_pay, row.allowance, row.total, row.note, status, row.pay_date, status
  );
}

// Lưu nháp: nhập trợ cấp, sửa ngày công (để trống = tự động theo chấm công), ghi chú
route('PUT', '/finance/payroll', 'finance', async ({ env, body }) => {
  const { ctx, staff, saved } = await loadPayrollInput(env, body);
  const stats = (await attendanceStats(env, ctx.month)).get(staff.id);
  const draft = {
    ...(saved || {}),
    allowance: int(body.allowance ?? 0, { min: 0, max: 1000000000, name: 'Trợ cấp' }),
    worked_days_manual: int(body.worked_days, { min: 0, max: 31, required: false, name: 'Ngày công' }),
    note: str(body.note, { max: 200, name: 'Ghi chú' }),
    status: 'draft',
  };
  const row = buildPayrollRow(ctx, staff, draft, stats);
  await payrollUpsert(env, row, 'draft').run();
  return { row };
});

// Xác nhận đã trả lương -> chốt bảng lương và tự ghi khoản chi "Lương nhân viên"
route('POST', '/finance/payroll/pay', 'finance', async ({ env, body }) => {
  const { ctx, staff, saved } = await loadPayrollInput(env, body);
  const row = buildPayrollRow(ctx, staff, saved, (await attendanceStats(env, ctx.month)).get(staff.id));
  const res = await payrollUpsert(env, row, 'paid').run();
  if (!res.meta.changes) throw new HttpError(409, 'Đã trả lương tháng này');
  const [y, m] = ctx.month.split('-');
  const txn = await env.DB.prepare(
    "INSERT INTO transactions (type, category, amount, description, txn_date) VALUES ('expense', 'Lương nhân viên', ?, ?, ?)"
  )
    .bind(row.total, `Lương tháng ${m}/${y} - ${staff.full_name}`, vnToday())
    .run();
  await env.DB.prepare('UPDATE payroll SET transaction_id = ? WHERE staff_id = ? AND month = ?')
    .bind(txn.meta.last_row_id, staff.id, ctx.month)
    .run();
  return { ok: true };
});

// Hoàn tác trả lương (bấm nhầm): xoá khoản chi đã ghi, đưa về nháp
route('POST', '/finance/payroll/:id/revert', 'finance', async ({ env, params }) => {
  const p = await env.DB.prepare('SELECT * FROM payroll WHERE id = ?').bind(params.id).first();
  if (!p || p.status !== 'paid') throw new HttpError(404, 'Không có bảng lương đã trả để hoàn tác');
  await env.DB.batch([
    env.DB.prepare("UPDATE payroll SET status = 'draft', paid_at = NULL, transaction_id = NULL WHERE id = ?").bind(p.id),
    env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(p.transaction_id),
  ]);
  return { ok: true };
});

route('POST', '/admin/attendance/check-in', 'admin', async ({ env, body }) => {
  const staffId = int(body.staff_id, { min: 1, name: 'Nhân viên' });
  const open = await env.DB.prepare('SELECT 1 FROM attendance WHERE staff_id = ? AND check_out IS NULL AND check_in IS NOT NULL')
    .bind(staffId)
    .first();
  if (open) throw new HttpError(409, 'Nhân viên đang trong ca, hãy chấm giờ ra trước');
  await env.DB.prepare('INSERT INTO attendance (staff_id, work_date, check_in) VALUES (?, ?, ?)').bind(staffId, vnToday(), vnTime()).run();
  return { ok: true };
});

route('POST', '/admin/attendance/check-out', 'admin', async ({ env, body }) => {
  const staffId = int(body.staff_id, { min: 1, name: 'Nhân viên' });
  const res = await env.DB.prepare(
    `UPDATE attendance SET check_out = ? WHERE id = (
       SELECT id FROM attendance WHERE staff_id = ? AND check_out IS NULL AND check_in IS NOT NULL ORDER BY id DESC LIMIT 1)`
  )
    .bind(vnTime(), staffId)
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'Nhân viên chưa chấm giờ vào');
  return { ok: true };
});

function attendanceFields(body) {
  return [
    int(body.staff_id, { min: 1, name: 'Nhân viên' }),
    dateStr(body.work_date, { name: 'Ngày làm' }),
    timeStr(body.check_in, { name: 'Giờ vào' }),
    timeStr(body.check_out, { name: 'Giờ ra' }),
    str(body.note, { max: 200, name: 'Ghi chú' }),
  ];
}

route('POST', '/admin/attendance', 'admin', async ({ env, body }) => {
  await env.DB.prepare('INSERT INTO attendance (staff_id, work_date, check_in, check_out, note) VALUES (?, ?, ?, ?, ?)')
    .bind(...attendanceFields(body))
    .run();
  return { ok: true };
});

route('PUT', '/admin/attendance/:id', 'admin', async ({ env, params, body }) => {
  await env.DB.prepare('UPDATE attendance SET staff_id = ?, work_date = ?, check_in = ?, check_out = ?, note = ? WHERE id = ?')
    .bind(...attendanceFields(body), params.id)
    .run();
  return { ok: true };
});

route('DELETE', '/admin/attendance/:id', 'admin', async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM attendance WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// =============================================================
// GÓP Ý
// =============================================================
route('GET', '/admin/feedback', 'admin', async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT f.*, v.code AS voucher_code, v.status AS voucher_status, v.expires_at AS voucher_expires_at
       FROM feedback f LEFT JOIN vouchers v ON v.feedback_id = f.id ORDER BY f.id DESC LIMIT 200`
  ).all();
  return { feedback: results };
});

route('POST', '/admin/feedback/:id/read', 'admin', async ({ env, params }) => {
  await env.DB.prepare('UPDATE feedback SET is_read = 1 WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

route('DELETE', '/admin/feedback/:id', 'admin', async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// =============================================================
// CÀI ĐẶT (VAT, thông tin quán, khổ giấy in)
// =============================================================
route('GET', '/admin/settings', 'admin', async ({ env }) => getSettings(env));

route('PUT', '/admin/settings', 'admin', async ({ env, body }) => {
  const stmts = [];
  for (const key of EDITABLE_SETTING_KEYS) {
    if (!(key in body)) continue;
    let value = String(body[key] ?? '').trim();
    if (BOOLEAN_SETTINGS.includes(key)) value = body[key] === true || value === '1' ? '1' : '0';
    if (key in INT_SETTINGS) {
      const [min, max, name] = INT_SETTINGS[key];
      value = String(int(value, { min, max, name }));
    }
    if (key === 'vat_percent') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, '% VAT phải từ 0 đến 100');
      value = String(n);
    }
    if (key === 'paper_width') value = oneOf(value, ['58', '80'], 'Khổ giấy');
    if (key === 'public_base_url') {
      if (!/^https?:\/\/[^\s/]+$/.test(value.replace(/\/+$/, ''))) throw new HttpError(400, 'Tên miền không hợp lệ (vd: https://lalida.net)');
      value = value.replace(/\/+$/, '');
    }
    if (value.length > 300) throw new HttpError(400, 'Giá trị cài đặt quá dài');
    stmts.push(
      env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return getSettings(env);
});

// =============================================================
// THU CHI & LỢI NHUẬN (yêu cầu mã PIN cấp 2)
// =============================================================
route('GET', '/finance/transactions', 'finance', async ({ env, url }) => {
  const from = dateStr(url.searchParams.get('from') || vnToday(), { name: 'Từ ngày' });
  const to = dateStr(url.searchParams.get('to') || vnToday(), { name: 'Đến ngày' });
  const { results } = await env.DB.prepare(
    'SELECT * FROM transactions WHERE txn_date BETWEEN ? AND ? ORDER BY txn_date DESC, id DESC LIMIT 1000'
  )
    .bind(from, to)
    .all();
  return { transactions: results };
});

function txnFields(body) {
  return [
    oneOf(body.type, ['income', 'expense'], 'Loại'),
    str(body.category, { max: 50, required: true, name: 'Hạng mục' }),
    int(body.amount, { min: 0, max: 100000000000, name: 'Số tiền' }),
    str(body.description, { max: 300, name: 'Diễn giải' }),
    dateStr(body.txn_date || vnToday()),
  ];
}

route('POST', '/finance/transactions', 'finance', async ({ env, body }) => {
  await env.DB.prepare('INSERT INTO transactions (type, category, amount, description, txn_date) VALUES (?, ?, ?, ?, ?)')
    .bind(...txnFields(body))
    .run();
  return { ok: true };
});

route('PUT', '/finance/transactions/:id', 'finance', async ({ env, params, body }) => {
  await env.DB.prepare('UPDATE transactions SET type = ?, category = ?, amount = ?, description = ?, txn_date = ? WHERE id = ?')
    .bind(...txnFields(body), params.id)
    .run();
  return { ok: true };
});

route('DELETE', '/finance/transactions/:id', 'finance', async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(params.id).run();
  return { ok: true };
});

// Báo cáo theo Ngày / Tháng / Năm: Lợi nhuận = Doanh thu - Chi phí
route('GET', '/finance/report', 'finance', async ({ env, url }) => {
  const period = oneOf(url.searchParams.get('period') || 'day', ['day', 'month', 'year'], 'Kỳ báo cáo');
  const len = { day: 10, month: 7, year: 4 }[period];
  const today = vnToday();
  const defaultFrom = { day: today.slice(0, 8) + '01', month: today.slice(0, 4) + '-01-01', year: `${Number(today.slice(0, 4)) - 4}-01-01` }[period];
  const from = dateStr(url.searchParams.get('from') || defaultFrom, { name: 'Từ ngày' });
  const to = dateStr(url.searchParams.get('to') || today, { name: 'Đến ngày' });

  const [rows, cats, orders] = await env.DB.batch([
    env.DB.prepare(
      `SELECT substr(txn_date, 1, ${len}) AS period,
         SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
       FROM transactions WHERE txn_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`
    ).bind(from, to),
    env.DB.prepare(
      `SELECT type, category, SUM(amount) AS amount FROM transactions
       WHERE txn_date BETWEEN ? AND ? GROUP BY type, category ORDER BY amount DESC`
    ).bind(from, to),
    env.DB.prepare(
      `SELECT COUNT(*) AS paid_orders, COALESCE(SUM(total), 0) AS sales FROM orders
       WHERE status = 'paid' AND date(paid_at, '+7 hours') BETWEEN ? AND ?`
    ).bind(from, to),
  ]);
  const series = rows.results.map((r) => ({ ...r, profit: r.income - r.expense }));
  const totals = series.reduce(
    (t, r) => ({ income: t.income + r.income, expense: t.expense + r.expense, profit: t.profit + r.profit }),
    { income: 0, expense: 0, profit: 0 }
  );
  return { period, from, to, series, totals, by_category: cats.results, ...orders.results[0] };
});

// =============================================================
// ĐIỀU PHỐI
// =============================================================
export async function handle(request, env) {
  try {
    if (!env.DB) throw new HttpError(500, 'Chưa gắn D1 database (binding "DB")');
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const method = request.method;

    let match = null;
    let pathMatched = false;
    for (const r of routes) {
      const m = path.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method === method) {
        match = { r, m };
        break;
      }
    }
    if (!match) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Phương thức không được hỗ trợ' : 'Không tìm thấy API');

    let body = {};
    if (method !== 'GET') {
      // Chống CSRF: chỉ nhận JSON (form từ trang khác không gửi được JSON mà không qua CORS)
      if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Yêu cầu phải là JSON');
      body = await readJson(request);
    }

    const { r, m } = match;
    if (r.access !== 'public') {
      if (!(await isAdmin(request, env))) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
      if (r.access === 'finance' && !(await isFinance(request, env))) throw new HttpError(403, 'Cần nhập mã PIN cấp 2');
    }

    const params = Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])]));
    const result = await r.handler({ request, env, url, params, body });
    return result instanceof Response ? result : json(result);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Lỗi máy chủ, vui lòng thử lại' }, 500);
  }
}
