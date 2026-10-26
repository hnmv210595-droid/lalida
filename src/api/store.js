// Truy vấn dùng chung: cài đặt, tính tiền (VAT), đơn hàng
import { HttpError, int, str } from './http.js';

const SECRET_KEYS = ['admin_password_hash', 'finance_pin_hash'];

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of results) if (!SECRET_KEYS.includes(r.key)) s[r.key] = r.value;
  return s;
}

export function vatPercent(settings) {
  return settings.vat_enabled === '1' ? Number(settings.vat_percent) || 0 : 0;
}

// Tính tiền: tạm tính (bỏ món đã huỷ) + VAT
export function computeTotals(items, percent) {
  const subtotal = items.filter((i) => i.status !== 'cancelled').reduce((sum, i) => sum + i.price * i.quantity, 0);
  const vat_amount = Math.round((subtotal * percent) / 100);
  return { subtotal, vat_percent: percent, vat_amount, total: subtotal + vat_amount };
}

// Gắn danh sách món cho các đơn; đơn đang mở được tính lại theo VAT hiện hành
export async function attachItems(env, orders) {
  if (!orders.length) return orders;
  const { results } = await env.DB.prepare(
    'SELECT * FROM order_items WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY id'
  )
    .bind(JSON.stringify(orders.map((o) => o.id)))
    .all();
  const percent = vatPercent(await getSettings(env));
  return orders.map((o) => {
    const items = results.filter((i) => i.order_id === o.id);
    const totals = o.status === 'open' ? computeTotals(items, percent) : {};
    const { access_token, ...rest } = o; // không bao giờ trả mã truy cập đơn online ra ngoài
    return { ...rest, ...totals, items };
  });
}

export async function getOrder(env, id) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng');
  return (await attachItems(env, [order]))[0];
}

// ---------- Lương ----------
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Lương tháng: nghỉ trong hạn mức (mặc định 2 ngày) vẫn hưởng lương; nghỉ vượt thì trừ theo ngày.
// Nhân viên không có lương tháng (= 0) thì tính theo giờ công x lương/giờ. Thực lĩnh = lương + trợ cấp.
export function calcPay(staff, { month, workedDays, hours, allowance, paidLeaveLimit }) {
  const days = daysInMonth(month);
  const worked = Math.min(days, Math.max(0, workedDays));
  const leave = days - worked;
  const unpaid = Math.max(0, leave - paidLeaveLimit);
  const monthly = staff.monthly_salary > 0;
  const base_pay = monthly
    ? Math.max(0, Math.round(staff.monthly_salary - (unpaid * staff.monthly_salary) / days))
    : Math.round(hours * staff.hourly_rate);
  return {
    method: monthly ? 'monthly' : 'hourly',
    monthly_salary: staff.monthly_salary,
    hourly_rate: staff.hourly_rate,
    days_in_month: days,
    worked_days: worked,
    hours: Math.round(hours * 100) / 100,
    paid_leave_days: Math.min(leave, paidLeaveLimit),
    unpaid_leave_days: monthly ? unpaid : 0,
    base_pay,
    allowance,
    total: base_pay + allowance,
  };
}

// Kiểm tra danh sách món khách gửi; giá lấy từ DB, không tin client. Món hết hàng bị từ chối.
export async function prepareItems(env, body) {
  if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, 'Vui lòng chọn ít nhất 1 món');
  if (body.items.length > 50) throw new HttpError(400, 'Quá nhiều món trong 1 lần gọi');
  const lines = body.items.map((it) => ({
    id: int(it.id, { min: 1, name: 'Mã món' }),
    quantity: int(it.quantity, { min: 1, max: 50, name: 'Số lượng' }),
    note: str(it.note, { max: 200, name: 'Ghi chú món' }),
  }));
  const note = str(body.note, { max: 300, name: 'Ghi chú' });

  const { results: menu } = await env.DB.prepare(
    'SELECT id, name, price FROM menu_items WHERE is_available = 1 AND id IN (SELECT value FROM json_each(?))'
  )
    .bind(JSON.stringify(lines.map((l) => l.id)))
    .all();
  const byId = new Map(menu.map((m) => [m.id, m]));
  for (const l of lines) if (!byId.has(l.id)) throw new HttpError(409, 'Có món đã bán hết, vui lòng kiểm tra lại giỏ hàng');
  return { lines: lines.map((l) => ({ ...l, menu: byId.get(l.id) })), note };
}

// Ghi các món đã kiểm tra vào đơn, nối thêm ghi chú
export async function insertItems(env, order, prepared) {
  const stmts = prepared.lines.map((l) =>
    env.DB.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, note) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(order.id, l.menu.id, l.menu.name, l.menu.price, l.quantity, l.note)
  );
  const note = prepared.note ? [order.note, prepared.note].filter(Boolean).join(' | ').slice(0, 1000) : order.note;
  stmts.push(env.DB.prepare("UPDATE orders SET note = ?, updated_at = datetime('now') WHERE id = ?").bind(note ?? null, order.id));
  await env.DB.batch(stmts);
  return getOrder(env, order.id);
}

// Thêm món vào đơn đang mở của bàn (tạo đơn mới nếu chưa có)
export async function addItemsToTable(env, body) {
  const tableNumber = int(body.table, { min: 1, max: 100000, name: 'Số bàn' });
  const table = await env.DB.prepare('SELECT * FROM tables WHERE number = ? AND is_active = 1').bind(tableNumber).first();
  if (!table) throw new HttpError(404, `Bàn ${tableNumber} không tồn tại`);
  const prepared = await prepareItems(env, body);

  // Chỉ mục duy nhất ux_orders_open_table đảm bảo không tạo trùng đơn mở
  await env.DB.prepare("INSERT OR IGNORE INTO orders (table_id, table_number, status, order_type) VALUES (?, ?, 'open', 'table')")
    .bind(table.id, table.number)
    .run();
  const order = await env.DB.prepare("SELECT id, note FROM orders WHERE table_number = ? AND status = 'open' AND order_type = 'table'")
    .bind(table.number)
    .first();
  return insertItems(env, order, prepared);
}
