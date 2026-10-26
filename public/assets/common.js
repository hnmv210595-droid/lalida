// Tiện ích dùng chung cho trang khách (/order) và trang quản trị (/admin)
window.LL = (() => {
  async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (method !== 'GET') {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch {
      throw Object.assign(new Error('Mất kết nối mạng, vui lòng thử lại'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Lỗi ${res.status}`), { status: res.status });
    return data;
  }

  const money = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Thời gian UTC từ D1 ("YYYY-MM-DD HH:MM:SS") -> giờ Việt Nam
  function vnDateTime(s, withDate = true) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + 'Z');
    const opt = { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' };
    if (withDate) Object.assign(opt, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d.toLocaleString('vi-VN', opt);
  }

  const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

  function toast(msg, type = 'ok') {
    let box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-[92%] max-w-sm pointer-events-none';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className =
      'px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white w-full text-center transition-opacity ' +
      (type === 'error' ? 'bg-red-600' : 'bg-brand-700');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* chế độ ẩn danh / bị chặn lưu trữ */
      }
    },
  };

  const STATUS = {
    pending: { label: 'Đang chờ', cls: 'bg-amber-100 text-amber-800' },
    cooking: { label: 'Đang làm', cls: 'bg-sky-100 text-sky-800' },
    served: { label: 'Đã lên món', cls: 'bg-emerald-100 text-emerald-800' },
    cancelled: { label: 'Đã huỷ', cls: 'bg-stone-200 text-stone-500 line-through' },
  };

  const CATEGORY_ICON = { com: '🍚', 'do-an': '🍗', canh: '🍲', 'do-uong': '🥤', 'goi-them': '➕' };

  // Tên hiển thị của đơn: "Bàn 1-2" (bàn 1, lượt khách thứ 2) hoặc "Đơn online"
  const orderLabel = (o) =>
    o.order_type === 'online' ? 'Đơn online' : `Bàn ${o.table_number}${o.guest_no ? '-' + o.guest_no : ''}`;

  return { api, money, esc, vnDateTime, vnToday, toast, storage, STATUS, CATEGORY_ICON, orderLabel };
})();
