// Trang quản trị LaLiDa: /admin
(() => {
  const { api, money, esc, vnDateTime, vnToday, toast, storage, STATUS, CATEGORY_ICON, orderLabel } = window.LL;
  const P = window.LLPrint;
  const $ = (id) => document.getElementById(id);

  const TABS = [
    { key: 'orders', label: '🍳 Đơn hàng & Bếp' },
    { key: 'tables', label: '🪑 Bàn & QR' },
    { key: 'menu', label: '📖 Thực đơn' },
    { key: 'finance', label: '💰 Thu chi & Lợi nhuận' },
    { key: 'staff', label: '👥 Nhân sự & Chấm công' },
    { key: 'feedback', label: '💬 Góp ý' },
    { key: 'settings', label: '⚙️ Cài đặt' },
  ];

  const S = {
    tab: storage.get('lalida_admin_tab', 'orders'),
    settings: {},
    summary: {},
    lastItemId: null,
    poll: null,
    orderMode: 'open',
    paidDate: vnToday(),
    lastOrdersJson: '',
    orders: [],
    finance: { period: 'day', from: null, to: null, chart: null },
    attDate: vnToday(),
    attMonth: vnToday().slice(0, 7),
    payMonth: (() => {
      const [y, m] = vnToday().split('-').map(Number);
      return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    })(), // bảng lương tháng trước, trả vào ngày 5 tháng này
  };

  // ================= Tiện ích =================
  async function call(path, opts) {
    try {
      return await api(path, opts);
    } catch (e) {
      if (e.status === 401) showLogin();
      throw e;
    }
  }
  const formData = (form) => Object.fromEntries(new FormData(form).entries());
  const view = () => $('view');

  function openModal(title, html, onMount) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal').classList.remove('hidden');
    onMount?.($('modal-body'));
  }
  function closeModal() {
    $('modal').classList.add('hidden');
    $('modal-body').innerHTML = '';
  }
  $('modal-close').onclick = closeModal;
  $('modal').addEventListener('click', (e) => e.target.id === 'modal' && closeModal());

  // Gắn submit cho form, tự khoá nút và báo lỗi
  function onSubmit(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit], button:not([type])');
      if (btn) btn.disabled = true;
      try {
        await handler(formData(form), form);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch {
      /* trình duyệt chặn âm thanh */
    }
  }

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const chip = (status) => {
    const st = STATUS[status] || STATUS.pending;
    return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}">${st.label}</span>`;
  };

  // ================= Đăng nhập =================
  function showLogin() {
    clearInterval(S.poll);
    S.poll = null;
    $('app-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('login-password').focus();
  }

  onSubmit($('login-form'), async ({}) => {
    $('login-error').textContent = '';
    try {
      await api('/auth/login', { method: 'POST', body: { password: $('login-password').value } });
      $('login-password').value = '';
      await showApp();
    } catch (e) {
      $('login-error').textContent = e.message;
    }
  });

  $('logout-btn').onclick = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  };

  async function showApp() {
    S.settings = await call('/admin/settings');
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    renderNav();
    go(S.tab);
    pollTick();
    clearInterval(S.poll);
    S.poll = setInterval(pollTick, 4000);
  }

  // Cập nhật realtime (polling 4s): huy hiệu, chuông báo món mới, làm mới màn hình bếp
  async function pollTick() {
    try {
      S.summary = await call('/admin/summary');
      if (S.lastItemId !== null && S.summary.last_item_id > S.lastItemId) {
        beep();
        toast('🔔 Có món mới được gọi!');
      }
      S.lastItemId = S.summary.last_item_id;
      renderNav();
      if (S.tab === 'orders' && S.orderMode === 'open') loadOrders();
    } catch {
      /* lần sau thử lại */
    }
  }

  function renderNav() {
    const badge = { orders: S.summary.waiting_items, feedback: S.summary.unread_feedback, staff: S.summary.payroll_due };
    $('nav').innerHTML = TABS.map((t) => {
      const active = S.tab === t.key;
      const b = badge[t.key] ? `<span class="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px]">${badge[t.key]}</span>` : '';
      return `<button data-nav="${t.key}" class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition
        ${active ? 'bg-brand-700 text-white shadow' : 'bg-white text-brand-800 border border-cream-200 hover:bg-brand-50'}">${t.label}${b}</button>`;
    }).join('');
  }

  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (b) go(b.dataset.nav);
  });

  function go(tab) {
    if (!TABS.some((t) => t.key === tab)) tab = 'orders';
    S.tab = tab;
    storage.set('lalida_admin_tab', tab);
    S.lastOrdersJson = '';
    if (S.finance.chart) {
      S.finance.chart.destroy();
      S.finance.chart = null;
    }
    renderNav();
    view().innerHTML = '<div class="text-stone-500">Đang tải…</div>';
    ({ orders: renderOrdersView, tables: renderTables, menu: renderMenu, finance: renderFinance, staff: renderStaff, feedback: renderFeedback, settings: renderSettings })[tab]();
  }

  // ================= ĐƠN HÀNG & BẾP (KDS) =================
  function renderOrdersView() {
    view().innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button data-mode="open" class="btn ${S.orderMode === 'open' ? 'btn-primary' : 'btn-ghost'}">Đang phục vụ</button>
        <button data-mode="paid" class="btn ${S.orderMode === 'paid' ? 'btn-primary' : 'btn-ghost'}">Đã thanh toán</button>
        <input id="paid-date" type="date" value="${S.paidDate}" class="input !w-auto ${S.orderMode === 'paid' ? '' : 'hidden'}" />
        <button id="new-order" class="btn btn-accent ml-auto">＋ Tạo đơn / Gọi món cho bàn</button>
      </div>
      <div id="orders-list" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"></div>`;
    view().querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        S.orderMode = b.dataset.mode;
        renderOrdersView();
      })
    );
    $('paid-date').onchange = (e) => {
      S.paidDate = e.target.value || vnToday();
      loadOrders();
    };
    $('new-order').onclick = () => openCounterOrder();
    loadOrders();
  }

  async function loadOrders() {
    const q = S.orderMode === 'open' ? '?status=open' : `?status=paid&date=${S.paidDate}`;
    const { orders } = await call('/admin/orders' + q);
    const j = JSON.stringify(orders);
    if (j === S.lastOrdersJson || !$('orders-list')) return; // không đổi -> không vẽ lại
    S.lastOrdersJson = j;
    S.orders = orders;
    $('orders-list').innerHTML = orders.length
      ? orders.map(S.orderMode === 'open' ? openOrderCard : paidOrderCard).join('')
      : `<div class="text-stone-500 col-span-full">${S.orderMode === 'open' ? 'Chưa có đơn nào đang phục vụ.' : 'Không có đơn đã thanh toán trong ngày này.'}</div>`;
  }

  function openOrderCard(o) {
    const waiting = o.items.some((i) => i.status === 'pending' || i.status === 'cooking');
    const items = o.items
      .map((i) => {
        let actions = '';
        if (i.status === 'pending') actions += `<button data-item="${i.id}" data-status="cooking" class="text-xs btn-ghost rounded px-2 py-1">Làm</button>`;
        if (i.status === 'pending' || i.status === 'cooking')
          actions += `<button data-item="${i.id}" data-status="served" class="text-xs bg-emerald-600 text-white rounded px-2 py-1">Lên món</button>
                      <button data-item="${i.id}" data-status="cancelled" class="text-xs text-red-600 px-1" title="Huỷ món">✕</button>`;
        return `<div class="flex items-start gap-2 py-2 ${i.status === 'cancelled' ? 'opacity-50' : ''}">
          <div class="flex-1 min-w-0">
            <div class="font-semibold ${i.status === 'cancelled' ? 'line-through' : ''}">${i.quantity} × ${esc(i.name)}</div>
            ${i.note ? `<div class="text-xs text-clay-600">📝 ${esc(i.note)}</div>` : ''}
            <div class="text-[11px] text-stone-400">${vnDateTime(i.created_at, false)}</div>
          </div>
          <div class="flex flex-col items-end gap-1">${chip(i.status)}<div class="flex gap-1">${actions}</div></div>
        </div>`;
      })
      .join('');
    const online = o.order_type === 'online';
    return `<div class="card p-4 flex flex-col ${waiting ? 'ring-2 ring-amber-300' : ''} ${online ? 'border-l-4 !border-l-clay-500' : ''}">
      <div class="flex items-center justify-between">
        <div class="text-xl font-bold text-brand-800">${online ? '🛵 ' : ''}${orderLabel(o)}</div>
        <div class="text-xs text-stone-500">#${o.id} · ${vnDateTime(o.created_at, false)}</div>
      </div>
      ${online ? customerInfo(o) : ''}
      ${o.note ? `<div class="mt-1 text-sm bg-amber-50 text-amber-900 rounded px-2 py-1">📝 ${esc(o.note)}</div>` : ''}
      <div class="divide-y divide-stone-100 mt-2 flex-1">${items}</div>
      <div class="border-t border-stone-200 pt-2 mt-2 text-sm space-y-0.5">
        <div class="flex justify-between"><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
        ${o.vat_percent ? `<div class="flex justify-between"><span>VAT (${o.vat_percent}%)</span><span>${money(o.vat_amount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-base text-brand-800"><span>Tổng</span><span>${money(o.total)}</span></div>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-3">
        <button data-order="${o.id}" data-act="serve" class="btn bg-emerald-600 hover:bg-emerald-700 text-white" ${waiting ? '' : 'disabled'}>Đã lên món</button>
        <button data-order="${o.id}" data-act="print" class="btn btn-ghost">🖨️ In</button>
        <button data-order="${o.id}" data-act="pay" class="btn btn-accent">Đã thanh toán</button>
      </div>
      <div class="grid ${online ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mt-2">
        ${online ? '' : `<button data-order="${o.id}" data-act="add" class="btn btn-ghost">＋ Thêm món</button>`}
        <button data-order="${o.id}" data-act="voucher" class="btn btn-ghost">🎁 Mã tặng nước</button>
      </div>
      <button data-order="${o.id}" data-act="cancel" class="text-xs text-red-600 mt-2 self-end hover:underline">Huỷ đơn</button>
    </div>`;
  }

  // Thông tin giao hàng của đơn online (bấm số để gọi)
  function customerInfo(o) {
    return `<div class="mt-2 rounded-lg bg-cream-100 px-3 py-2 text-sm">
      <div class="font-semibold">${esc(o.customer_name)} · <a href="tel:${esc(o.customer_phone)}" class="text-brand-700 underline">${esc(o.customer_phone)}</a></div>
      <div class="text-stone-600">📍 ${esc(o.customer_address)}</div>
    </div>`;
  }

  function paidOrderCard(o) {
    const n = o.items.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.quantity, 0);
    return `<div class="card p-4">
      <div class="flex justify-between"><b class="text-brand-800">${o.order_type === 'online' ? '🛵 ' : ''}${orderLabel(o)}</b><span class="text-xs text-stone-500">#${o.id} · ${vnDateTime(o.paid_at, false)}</span></div>
      ${o.order_type === 'online' ? `<div class="text-xs text-stone-500 mt-1">${esc(o.customer_name)} · ${esc(o.customer_phone)}</div>` : ''}
      <div class="text-sm text-stone-600 mt-1">${n} món · ${P.PAY_LABEL[o.payment_method] || ''}</div>
      <div class="flex items-center justify-between mt-2">
        <span class="font-bold text-lg">${money(o.total)}</span>
        <button data-order="${o.id}" data-act="print" class="btn btn-ghost">🖨️ In lại</button>
      </div>
    </div>`;
  }

  view().addEventListener('click', async (e) => {
    const itemBtn = e.target.closest('[data-item]');
    const orderBtn = e.target.closest('[data-order]');
    try {
      if (itemBtn) {
        itemBtn.disabled = true;
        await call(`/admin/order-items/${itemBtn.dataset.item}`, { method: 'PATCH', body: { status: itemBtn.dataset.status } });
        S.lastOrdersJson = '';
        await loadOrders();
        pollTick();
      } else if (orderBtn) {
        const id = Number(orderBtn.dataset.order);
        const order = S.orders.find((o) => o.id === id);
        const act = orderBtn.dataset.act;
        if (act === 'serve') {
          await call(`/admin/orders/${id}/serve`, { method: 'POST' });
          toast(`${orderLabel(order)}: đã lên đủ món`);
        } else if (act === 'print') {
          await printOrder(order);
          return;
        } else if (act === 'pay') {
          return openPayModal(order);
        } else if (act === 'add') {
          return openCounterOrder(order.table_number);
        } else if (act === 'voucher') {
          return openVoucherModal(order);
        } else if (act === 'cancel') {
          if (!confirm(`Huỷ toàn bộ đơn #${id} của ${orderLabel(order)}?`)) return;
          await call(`/admin/orders/${id}/cancel`, { method: 'POST' });
          toast('Đã huỷ đơn');
        } else return;
        S.lastOrdersJson = '';
        await loadOrders();
        pollTick();
      }
    } catch (err) {
      if (itemBtn || orderBtn) toast(err.message, 'error');
    }
  });

  async function printOrder(order) {
    const mode = storage.get('lalida_print_mode', 'browser');
    try {
      if (mode === 'bluetooth') {
        await P.printBluetooth(order, S.settings);
        toast('Đã gửi lệnh in tới máy in Bluetooth');
      } else P.printBill(order, S.settings);
    } catch (e) {
      toast(`In Bluetooth lỗi: ${e.message}. Chuyển sang in qua trình duyệt.`, 'error');
      P.printBill(order, S.settings);
    }
  }

  function openPayModal(order) {
    openModal(
      `Thanh toán - ${orderLabel(order)}`,
      `<form id="pay-form" class="space-y-4">
        <div class="rounded-xl bg-cream-100 p-4 text-sm space-y-1">
          <div class="flex justify-between"><span>Tạm tính</span><span>${money(order.subtotal)}</span></div>
          ${order.vat_percent ? `<div class="flex justify-between"><span>VAT (${order.vat_percent}%)</span><span>${money(order.vat_amount)}</span></div>` : ''}
          <div class="flex justify-between font-bold text-xl text-brand-800 pt-1"><span>Khách cần trả</span><span>${money(order.total)}</span></div>
        </div>
        <div>
          <div class="text-sm font-medium mb-2">Hình thức thanh toán</div>
          <div class="grid grid-cols-3 gap-2">
            ${Object.entries(P.PAY_LABEL)
              .map(([k, v], i) => `<label class="border rounded-lg p-2 text-center text-sm cursor-pointer has-[:checked]:bg-brand-700 has-[:checked]:text-white">
                <input type="radio" name="payment_method" value="${k}" class="sr-only" ${i === 0 ? 'checked' : ''}/>${v}</label>`)
              .join('')}
          </div>
        </div>
        <div>
          <label class="text-sm font-medium">Khách đưa (tính tiền thừa)</label>
          <input id="cash-given" type="number" min="0" step="1000" class="input mt-1" placeholder="${order.total}" />
          <div id="change" class="text-sm text-stone-600 mt-1"></div>
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="print" checked /> In hoá đơn sau khi thanh toán</label>
        <button class="btn btn-accent w-full py-3">Xác nhận đã thanh toán ${money(order.total)}</button>
      </form>`,
      (root) => {
        root.querySelector('#cash-given').addEventListener('input', (e) => {
          const diff = Number(e.target.value) - order.total;
          root.querySelector('#change').textContent = e.target.value ? (diff >= 0 ? `Tiền thừa trả khách: ${money(diff)}` : `Còn thiếu: ${money(-diff)}`) : '';
        });
        onSubmit(root.querySelector('#pay-form'), async (d) => {
          const { order: paid } = await call(`/admin/orders/${order.id}/pay`, { method: 'POST', body: { payment_method: d.payment_method } });
          closeModal();
          toast(`${orderLabel(order)} đã thanh toán ${money(paid.total)}`);
          S.lastOrdersJson = '';
          loadOrders();
          pollTick();
          if (d.print) printOrder(paid);
        });
      }
    );
  }

  // Khách đưa mã tặng (nhận khi góp ý lần trước) -> chọn ly nước bất kỳ, thêm vào hoá đơn 0đ
  async function openVoucherModal(order) {
    const { categories, items } = await call('/admin/menu');
    const drinkCat = categories.find((c) => c.slug === 'do-uong');
    const drinks = items.filter((i) => drinkCat && i.category_id === drinkCat.id && i.is_available);
    if (!drinks.length) return toast('Chưa có đồ uống nào đang bán', 'error');
    openModal(
      `🎁 Mã tặng nước - ${orderLabel(order)}`,
      `<form id="voucher-form" class="space-y-4">
        <div><label class="text-sm font-medium">Mã tặng của khách</label>
          <input name="code" required maxlength="20" autocomplete="off" placeholder="LLD-XXXXXX" class="input mt-1 uppercase tracking-widest text-lg font-bold" /></div>
        <div>
          <div class="text-sm font-medium mb-2">Chọn ly nước tặng</div>
          <div class="grid grid-cols-2 gap-2">
            ${drinks
              .map((d, i) => `<label class="border rounded-lg p-2 text-sm cursor-pointer has-[:checked]:bg-brand-700 has-[:checked]:text-white">
                <input type="radio" name="menu_item_id" value="${d.id}" class="sr-only" ${i === 0 ? 'checked' : ''} />${esc(d.name)}
                <span class="block text-xs opacity-70 line-through">${money(d.price)}</span></label>`)
              .join('')}
          </div>
        </div>
        <p class="text-xs text-stone-500">Ly nước được thêm vào hoá đơn với giá 0đ và gửi xuống bếp. Mỗi mã dùng 1 lần, chỉ áp dụng cho lần ăn sau.</p>
        <button class="btn btn-accent w-full py-3">Áp dụng mã</button>
      </form>`,
      (root) =>
        onSubmit(root.querySelector('#voucher-form'), async (d) => {
          await call(`/admin/orders/${order.id}/voucher`, { method: 'POST', body: { code: d.code, menu_item_id: Number(d.menu_item_id) } });
          closeModal();
          toast('Đã thêm ly nước tặng vào hoá đơn 🎁');
          S.lastOrdersJson = '';
          loadOrders();
          pollTick();
        })
    );
  }

  async function openCounterOrder(presetTable) {
    const [{ tables }, { categories, items }] = await Promise.all([call('/admin/tables'), call('/admin/menu')]);
    if (!tables.length) return toast('Chưa có bàn nào. Hãy thêm bàn trước.', 'error');
    const groups = categories
      .map((c) => {
        const list = items.filter((i) => i.category_id === c.id && i.is_available);
        if (!list.length) return '';
        return `<div class="mt-3"><div class="font-semibold text-brand-800 text-sm mb-1">${CATEGORY_ICON[c.slug] || ''} ${esc(c.name)}</div>
          ${list.map((i) => `<div class="flex items-center gap-2 py-1 text-sm"><span class="flex-1">${esc(i.name)} <span class="text-stone-400">${money(i.price)}</span></span>
            <input type="number" min="0" max="50" value="0" data-menu="${i.id}" class="input !w-20 !py-1" /></div>`).join('')}</div>`;
      })
      .join('');
    openModal(
      presetTable ? `Thêm món - Bàn ${presetTable}` : 'Tạo đơn tại quầy',
      `<form id="counter-form" class="space-y-3">
        <div><label class="text-sm font-medium">Bàn</label>
          <select name="table" class="input mt-1">${tables.map((t) => `<option value="${t.number}" ${t.number === presetTable ? 'selected' : ''}>${esc(t.name || 'Bàn ' + t.number)}${t.open_order_id ? ' (đang có đơn)' : ''}</option>`).join('')}</select></div>
        ${groups}
        <div><label class="text-sm font-medium">Ghi chú</label><input name="note" maxlength="300" class="input mt-1" /></div>
        <button class="btn btn-primary w-full py-3">Gửi bếp</button>
      </form>`,
      (root) =>
        onSubmit(root.querySelector('#counter-form'), async (d) => {
          const lines = [...root.querySelectorAll('[data-menu]')]
            .map((inp) => ({ id: Number(inp.dataset.menu), quantity: Number(inp.value) }))
            .filter((l) => l.quantity > 0);
          if (!lines.length) throw new Error('Chưa nhập số lượng món nào');
          await call('/admin/orders', { method: 'POST', body: { table: Number(d.table), note: d.note, items: lines } });
          closeModal();
          toast('Đã gửi đơn xuống bếp');
          S.orderMode = 'open';
          if (S.tab === 'orders') renderOrdersView();
          pollTick();
        })
    );
  }

  // ================= BÀN & QR =================
  const baseUrl = () => (S.settings.public_base_url || location.origin).replace(/\/+$/, '');
  const tableUrl = (n) => `${baseUrl()}/order?table=${n}`;
  const onlineUrl = () => `${baseUrl()}/online`;

  async function renderTables() {
    const { tables } = await call('/admin/tables');
    view().innerHTML = `
      <div class="card p-4 mb-4">
        <form id="table-form" class="grid grid-cols-2 sm:grid-cols-[120px_1fr_120px_auto] gap-3 items-end">
          <div><label class="text-sm font-medium">Số bàn *</label><input name="number" type="number" min="1" required class="input mt-1" value="${(Math.max(0, ...tables.map((t) => t.number)) || 0) + 1}" /></div>
          <div><label class="text-sm font-medium">Tên bàn</label><input name="name" maxlength="50" class="input mt-1" placeholder="VD: Bàn VIP 1" /></div>
          <div><label class="text-sm font-medium">Số ghế</label><input name="seats" type="number" min="1" value="4" class="input mt-1" /></div>
          <button class="btn btn-primary h-[42px]">＋ Thêm bàn</button>
        </form>
      </div>
      <div class="card p-4 mb-4 flex flex-wrap items-center gap-4">
        <div class="qr" id="online-qr"></div>
        <div class="flex-1 min-w-[200px]">
          <div class="font-bold text-brand-800">🛵 Đặt online</div>
          <a href="${esc(onlineUrl())}" target="_blank" rel="noopener" class="text-sm text-brand-700 underline break-all">${esc(onlineUrl())}</a>
          <p class="text-xs text-stone-500 mt-1">Dán link lên Facebook / Zalo hoặc in mã QR này lên tờ rơi. Khách chọn món rồi điền Tên, SĐT, Địa chỉ để đặt.</p>
          <button id="print-online-qr" class="btn btn-ghost mt-2">🖨️ In QR đặt online</button>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="text-sm text-stone-600">Tổng số bàn: <b>${tables.length}</b> · Link QR: <code class="bg-white px-1 rounded">${esc(tableUrl('X'))}</code></div>
        <button id="print-all-qr" class="btn btn-ghost" ${tables.length ? '' : 'disabled'}>🖨️ In tất cả QR</button>
      </div>
      <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        ${tables
          .map(
            (t) => `<div class="card p-4 text-center" data-table-card="${t.number}">
            <div class="flex justify-between items-center">
              <b class="text-brand-800">${esc(t.name || 'Bàn ' + t.number)}</b>
              ${t.open_order_id ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Có khách</span>' : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">Trống</span>'}
            </div>
            <div class="qr flex justify-center my-3" data-qr="${t.number}"></div>
            <a href="${esc(tableUrl(t.number))}" target="_blank" rel="noopener" class="text-[11px] text-stone-500 break-all hover:underline">${esc(tableUrl(t.number))}</a>
            <div class="text-xs text-stone-500 mt-1">${t.seats} ghế</div>
            <div class="flex gap-2 mt-3">
              <button data-print-qr="${t.number}" class="btn btn-ghost flex-1">🖨️ In QR</button>
              <button data-del-table="${t.id}" data-label="${esc(t.name || 'Bàn ' + t.number)}" class="btn btn-danger">Xoá</button>
            </div>
          </div>`
          )
          .join('')}
      </div>`;

    view().querySelectorAll('[data-qr]').forEach((el) => {
      if (window.QRCode) new QRCode(el, { text: tableUrl(el.dataset.qr), width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
      else el.textContent = 'Không tải được thư viện QR';
    });
    if (window.QRCode) new QRCode($('online-qr'), { text: onlineUrl(), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
    $('print-online-qr').onclick = () => {
      const canvas = $('online-qr').querySelector('canvas');
      P.printHtml(
        `<div class="qr-sheet" style="grid-template-columns:1fr;max-width:110mm;margin:auto"><div class="qr-card">
          <img class="logo" src="/assets/logo.webp" alt="LaLiDa" />
          <div style="font-size:16pt;font-weight:700;color:#3b512a">🛵 Đặt món online</div>
          <div class="qr"><img src="${canvas ? canvas.toDataURL('image/png') : ''}" style="width:55mm;height:55mm" alt="QR" /></div>
          <div style="font-size:12pt;font-weight:600">Quét mã để đặt món - giao tận nơi</div>
          <div style="font-size:9pt;color:#666;margin-top:2mm">${esc(onlineUrl())}</div>
        </div></div>`,
        'A4'
      );
    };

    onSubmit($('table-form'), async (d) => {
      await call('/admin/tables', { method: 'POST', body: { number: Number(d.number), name: d.name, seats: Number(d.seats) } });
      toast('Đã thêm bàn');
      renderTables();
    });

    const qrCard = (t) => {
      const canvas = view().querySelector(`[data-qr="${t.number}"] canvas`);
      const src = canvas ? canvas.toDataURL('image/png') : '';
      return `<div class="qr-card">
        <img class="logo" src="/assets/logo.webp" alt="LaLiDa" />
        <div style="font-size:16pt;font-weight:700;color:#3b512a">${esc(t.name || 'Bàn ' + t.number)}</div>
        <div class="qr"><img src="${src}" style="width:55mm;height:55mm" alt="QR" /></div>
        <div style="font-size:12pt;font-weight:600">📱 Quét mã để xem thực đơn & gọi món</div>
        <div style="font-size:8pt;color:#666;margin-top:2mm">${esc(tableUrl(t.number))}</div>
      </div>`;
    };
    view().querySelectorAll('[data-print-qr]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = tables.find((x) => x.number === Number(b.dataset.printQr));
        P.printHtml(`<div class="qr-sheet" style="grid-template-columns:1fr;max-width:110mm;margin:auto">${qrCard(t)}</div>`, 'A4');
      })
    );
    $('print-all-qr').onclick = () => P.printHtml(`<div class="qr-sheet">${tables.map(qrCard).join('')}</div>`, 'A4');
    view().querySelectorAll('[data-del-table]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Xoá ${b.dataset.label}? Mã QR của bàn này sẽ không dùng được nữa.`)) return;
        try {
          await call(`/admin/tables/${b.dataset.delTable}`, { method: 'DELETE' });
          toast('Đã xoá bàn');
          renderTables();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
  }

  // ================= THỰC ĐƠN =================
  async function renderMenu() {
    const { categories, items } = await call('/admin/menu');
    view().innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-brand-800">Thực đơn (${items.length} món)</h2>
        <button id="add-item" class="btn btn-primary">＋ Thêm món</button>
      </div>
      ${categories
        .map((c) => {
          const list = items.filter((i) => i.category_id === c.id);
          return `<div class="card p-4 mb-4 overflow-x-auto">
            <h3 class="font-bold text-brand-800 mb-2">${CATEGORY_ICON[c.slug] || ''} ${esc(c.name)} <span class="text-stone-400 font-normal text-sm">(${list.length})</span></h3>
            <table class="tbl w-full text-sm min-w-[560px]">
              <thead><tr><th>Món</th><th class="text-right">Giá</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>${
                list
                  .map(
                    (i) => `<tr class="${i.is_available ? '' : 'bg-stone-50'}">
                  <td><div class="font-medium ${i.is_available ? '' : 'text-stone-400 line-through'}">${esc(i.name)}</div><div class="text-xs text-stone-500">${esc(i.description || '')}</div></td>
                  <td class="text-right font-semibold whitespace-nowrap">${money(i.price)}</td>
                  <td>${i.is_available ? '<span class="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">Đang bán</span>' : '<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Đã bán hết</span>'}</td>
                  <td class="text-right whitespace-nowrap">
                    ${
                      i.is_available
                        ? `<button data-toggle="${i.id}" class="btn !py-1 bg-red-600 hover:bg-red-700 text-white">Hết hàng</button>`
                        : `<button data-toggle="${i.id}" class="btn !py-1 bg-emerald-600 hover:bg-emerald-700 text-white">Bán lại</button>`
                    }
                    <button data-edit="${i.id}" class="btn btn-ghost !py-1">Sửa</button> <button data-del="${i.id}" class="btn btn-danger !py-1">Xoá</button></td>
                </tr>`
                  )
                  .join('') || '<tr><td colspan="4" class="text-stone-400">Chưa có món</td></tr>'
              }</tbody>
            </table>
          </div>`;
        })
        .join('')}`;

    const save = (id, body) => call(id ? `/admin/menu/${id}` : '/admin/menu', { method: id ? 'PUT' : 'POST', body });
    const edit = (item = {}) =>
      openModal(
        item.id ? 'Sửa món' : 'Thêm món',
        `<form id="menu-form" class="space-y-3">
          <div><label class="text-sm font-medium">Danh mục</label>
            <select name="category_id" class="input mt-1">${categories.map((c) => `<option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div><label class="text-sm font-medium">Tên món *</label><input name="name" required maxlength="100" value="${esc(item.name || '')}" class="input mt-1" /></div>
          <div><label class="text-sm font-medium">Mô tả</label><input name="description" maxlength="300" value="${esc(item.description || '')}" class="input mt-1" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-sm font-medium">Giá (đ) *</label><input name="price" type="number" min="0" step="1000" required value="${item.price ?? ''}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Thứ tự</label><input name="sort_order" type="number" min="0" value="${item.sort_order ?? 0}" class="input mt-1" /></div>
          </div>
          <div><label class="text-sm font-medium">Link ảnh (không bắt buộc)</label><input name="image_url" type="url" maxlength="500" value="${esc(item.image_url || '')}" class="input mt-1" placeholder="https://…" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_available" ${item.is_available === 0 ? '' : 'checked'} /> Đang bán (bỏ chọn = Đã bán hết)</label>
          <button class="btn btn-primary w-full py-3">Lưu</button>
        </form>`,
        (root) =>
          onSubmit(root.querySelector('#menu-form'), async (d) => {
            await save(item.id, { ...d, category_id: Number(d.category_id), price: Number(d.price), sort_order: Number(d.sort_order), is_available: !!d.is_available });
            closeModal();
            toast('Đã lưu món');
            renderMenu();
          })
      );

    $('add-item').onclick = () => edit();
    view().querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(items.find((i) => i.id === Number(b.dataset.edit)))));
    view().querySelectorAll('[data-toggle]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = items.find((x) => x.id === Number(b.dataset.toggle));
          b.disabled = true;
          try {
            await save(i.id, { ...i, is_available: !i.is_available });
            toast(i.is_available ? `${i.name}: đã bán hết - khách sẽ thấy "Đã bán hết"` : `${i.name}: đã mở bán lại`);
            renderMenu();
          } catch (e) {
            toast(e.message, 'error');
          }
        })
    );
    view().querySelectorAll('[data-del]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm('Xoá món này khỏi thực đơn?')) return;
          await call(`/admin/menu/${b.dataset.del}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
          renderMenu();
        })
    );
  }

  // ================= THU CHI & LỢI NHUẬN (mã PIN cấp 2) =================
  async function renderFinance() {
    const me = await call('/auth/me');
    if (!me.finance) return renderPinPad();
    const F = S.finance;
    if (!F.from) setFinanceRange('day');
    view().innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class="text-sm text-emerald-700 bg-emerald-50 rounded-full px-3 py-1">🔓 Đã mở khoá bảo mật cấp 2 (tự khoá sau 30 phút)</span>
        <button id="lock-fin" class="btn btn-ghost ml-auto">🔒 Khoá lại</button>
      </div>
      <div class="card p-4 mb-4">
        <form id="report-form" class="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div><label class="text-sm font-medium">Báo cáo theo</label>
            <select name="period" class="input mt-1">
              <option value="day" ${F.period === 'day' ? 'selected' : ''}>Ngày</option>
              <option value="month" ${F.period === 'month' ? 'selected' : ''}>Tháng</option>
              <option value="year" ${F.period === 'year' ? 'selected' : ''}>Năm</option>
            </select></div>
          <div><label class="text-sm font-medium">Từ ngày</label><input name="from" type="date" value="${F.from}" class="input mt-1" /></div>
          <div><label class="text-sm font-medium">Đến ngày</label><input name="to" type="date" value="${F.to}" class="input mt-1" /></div>
          <button class="btn btn-primary h-[42px]">Xem báo cáo</button>
        </form>
      </div>
      <div id="fin-report"></div>
      <div class="grid lg:grid-cols-[380px_1fr] gap-4 mt-4">
        <div class="card p-4 h-fit">
          <h3 class="font-bold text-brand-800 mb-3">Ghi nhận thu / chi</h3>
          <form id="txn-form" class="space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <label class="border rounded-lg p-2 text-center text-sm cursor-pointer has-[:checked]:bg-red-600 has-[:checked]:text-white"><input type="radio" name="type" value="expense" class="sr-only" checked />Chi</label>
              <label class="border rounded-lg p-2 text-center text-sm cursor-pointer has-[:checked]:bg-emerald-600 has-[:checked]:text-white"><input type="radio" name="type" value="income" class="sr-only" />Thu</label>
            </div>
            <div><label class="text-sm font-medium">Hạng mục *</label><input name="category" required maxlength="50" list="txn-cats" class="input mt-1" placeholder="VD: Nguyên liệu" />
              <datalist id="txn-cats">${['Nguyên liệu', 'Gà', 'Gạo', 'Rau củ', 'Gas', 'Điện nước', 'Mặt bằng', 'Lương nhân viên', 'Bao bì', 'Sửa chữa', 'Bán hàng', 'Thu khác'].map((c) => `<option value="${c}">`).join('')}</datalist></div>
            <div><label class="text-sm font-medium">Số tiền (đ) *</label><input name="amount" type="number" min="0" step="1000" required class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Ngày</label><input name="txn_date" type="date" value="${vnToday()}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Diễn giải</label><input name="description" maxlength="300" class="input mt-1" /></div>
            <button class="btn btn-primary w-full">Lưu</button>
          </form>
        </div>
        <div class="card p-4 overflow-x-auto">
          <h3 class="font-bold text-brand-800 mb-3">Sổ thu chi <span class="text-sm font-normal text-stone-500">(${F.from} → ${F.to})</span></h3>
          <div id="txn-list" class="text-sm text-stone-500">Đang tải…</div>
        </div>
      </div>
      <div class="card p-4 mt-4 max-w-md">
        <h3 class="font-bold text-brand-800 mb-3">Đổi mã PIN cấp 2</h3>
        <form id="pin-change" class="space-y-3">
          <input name="current" type="password" inputmode="numeric" required placeholder="Mã PIN hiện tại" class="input" />
          <input name="new_pin" type="password" inputmode="numeric" pattern="\\d{4,8}" required placeholder="Mã PIN mới (4-8 chữ số)" class="input" />
          <button class="btn btn-ghost w-full">Đổi mã PIN</button>
        </form>
      </div>`;

    $('lock-fin').onclick = async () => {
      await call('/auth/lock-finance', { method: 'POST' });
      renderFinance();
    };
    const reportForm = $('report-form');
    reportForm.period.onchange = (e) => {
      setFinanceRange(e.target.value);
      reportForm.from.value = F.from;
      reportForm.to.value = F.to;
    };
    onSubmit(reportForm, async (d) => {
      Object.assign(F, { period: d.period, from: d.from, to: d.to });
      renderFinance();
    });
    onSubmit($('txn-form'), async (d, form) => {
      await financeCall('/finance/transactions', { method: 'POST', body: { ...d, amount: Number(d.amount) } });
      form.amount.value = '';
      form.description.value = '';
      toast('Đã ghi nhận');
      loadFinanceData();
    });
    onSubmit($('pin-change'), async (d, form) => {
      await financeCall('/finance/pin', { method: 'PUT', body: d });
      form.reset();
      toast('Đã đổi mã PIN cấp 2');
    });
    loadFinanceData();
  }

  function setFinanceRange(period) {
    const t = vnToday();
    const F = S.finance;
    F.period = period;
    F.to = t;
    F.from = { day: t.slice(0, 8) + '01', month: t.slice(0, 4) + '-01-01', year: `${Number(t.slice(0, 4)) - 4}-01-01` }[period];
  }

  // Hết hạn PIN (403) -> quay lại màn hình nhập PIN
  async function financeCall(path, opts) {
    try {
      return await call(path, opts);
    } catch (e) {
      if (e.status === 403) {
        toast('Phiên bảo mật cấp 2 đã hết hạn, vui lòng nhập lại mã PIN', 'error');
        if (S.tab === 'staff') renderStaff();
        else renderPinPad();
      }
      throw e;
    }
  }

  async function loadFinanceData() {
    const F = S.finance;
    const q = `from=${F.from}&to=${F.to}`;
    const [rep, { transactions }] = await Promise.all([
      financeCall(`/finance/report?period=${F.period}&${q}`),
      financeCall(`/finance/transactions?${q}`),
    ]);
    const box = (label, value, cls) => `<div class="card p-4"><div class="text-xs text-stone-500">${label}</div><div class="text-xl sm:text-2xl font-bold mt-1 ${cls}">${value}</div></div>`;
    const periodLabel = { day: 'Ngày', month: 'Tháng', year: 'Năm' }[rep.period];
    const fmtPeriod = (p) => (rep.period === 'day' ? p.split('-').reverse().join('/') : rep.period === 'month' ? p.split('-').reverse().join('/') : p);
    const cat = (type) =>
      rep.by_category.filter((c) => c.type === type).map((c) => `<div class="flex justify-between py-1"><span>${esc(c.category)}</span><span class="font-medium">${money(c.amount)}</span></div>`).join('') ||
      '<div class="text-stone-400">Không có</div>';

    $('fin-report').innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${box('Doanh thu (Thu)', money(rep.totals.income), 'text-emerald-700')}
        ${box('Chi phí (Chi)', money(rep.totals.expense), 'text-red-600')}
        ${box(rep.totals.profit >= 0 ? 'Lợi nhuận (Lãi)' : 'Lợi nhuận (Lỗ)', money(rep.totals.profit), rep.totals.profit >= 0 ? 'text-brand-800' : 'text-red-700')}
        ${box('Đơn đã thanh toán', `${rep.paid_orders} đơn`, 'text-stone-800')}
      </div>
      <div class="card p-4 mt-4"><h3 class="font-bold text-brand-800 mb-2">Biểu đồ theo ${periodLabel.toLowerCase()}</h3><div class="h-72"><canvas id="fin-chart"></canvas></div></div>
      <div class="grid md:grid-cols-[1fr_1fr_1fr] gap-4 mt-4">
        <div class="card p-4 overflow-x-auto md:col-span-1">
          <h3 class="font-bold text-brand-800 mb-2">Chi tiết theo ${periodLabel.toLowerCase()}</h3>
          <table class="tbl w-full text-sm"><thead><tr><th>${periodLabel}</th><th class="text-right">Thu</th><th class="text-right">Chi</th><th class="text-right">Lãi/Lỗ</th></tr></thead>
          <tbody>${rep.series.map((r) => `<tr><td>${fmtPeriod(r.period)}</td><td class="text-right">${money(r.income)}</td><td class="text-right">${money(r.expense)}</td><td class="text-right font-semibold ${r.profit < 0 ? 'text-red-600' : 'text-brand-800'}">${money(r.profit)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-stone-400">Chưa có dữ liệu</td></tr>'}</tbody></table>
        </div>
        <div class="card p-4 text-sm"><h3 class="font-bold text-emerald-700 mb-2">Thu theo hạng mục</h3>${cat('income')}</div>
        <div class="card p-4 text-sm"><h3 class="font-bold text-red-600 mb-2">Chi theo hạng mục</h3>${cat('expense')}</div>
      </div>`;

    if (window.Chart) {
      if (F.chart) F.chart.destroy();
      F.chart = new Chart($('fin-chart'), {
        data: {
          labels: rep.series.map((r) => fmtPeriod(r.period)),
          datasets: [
            { type: 'bar', label: 'Thu', data: rep.series.map((r) => r.income), backgroundColor: '#5f8241', borderRadius: 4 },
            { type: 'bar', label: 'Chi', data: rep.series.map((r) => r.expense), backgroundColor: '#c9762f', borderRadius: 4 },
            { type: 'line', label: 'Lợi nhuận', data: rep.series.map((r) => r.profit), borderColor: '#28361f', backgroundColor: '#28361f', tension: 0.3 },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}` } } },
          scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString('vi-VN') } } },
        },
      });
    }

    $('txn-list').innerHTML = transactions.length
      ? `<table class="tbl w-full min-w-[520px]"><thead><tr><th>Ngày</th><th>Hạng mục</th><th>Diễn giải</th><th class="text-right">Số tiền</th><th></th></tr></thead><tbody>
        ${transactions
          .map(
            (t) => `<tr><td class="whitespace-nowrap">${t.txn_date.split('-').reverse().join('/')}</td><td>${esc(t.category)}</td><td class="text-stone-500">${esc(t.description || '')}</td>
          <td class="text-right font-semibold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-700' : 'text-red-600'}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</td>
          <td class="text-right"><button data-del-txn="${t.id}" class="text-xs text-red-600 hover:underline">Xoá</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : 'Chưa có khoản thu chi nào trong khoảng thời gian này.';
    $('txn-list').querySelectorAll('[data-del-txn]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm('Xoá khoản thu/chi này?')) return;
          await financeCall(`/finance/transactions/${b.dataset.delTxn}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
          loadFinanceData();
        })
    );
  }

  // Màn hình nhập PIN cấp 2; container mặc định là cả trang, after = màn hình mở sau khi đúng PIN
  function renderPinPad(after = renderFinance, container = view(), purpose = 'Thu chi & Lợi nhuận') {
    if (S.finance.chart) {
      S.finance.chart.destroy();
      S.finance.chart = null;
    }
    container.innerHTML = `
      <div class="max-w-xs mx-auto card p-6 text-center">
        <div class="text-4xl">🔒</div>
        <h2 class="font-bold text-brand-800 mt-2">Bảo mật cấp 2</h2>
        <p class="text-sm text-stone-500 mb-4">Nhập mã PIN để xem ${purpose}</p>
        <form id="pin-form">
          <input id="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required
            class="input text-center text-2xl tracking-[0.5em] font-bold" />
          <div class="grid grid-cols-3 gap-2 mt-4">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'OK']
              .map((k) => `<button type="${k === 'OK' ? 'submit' : 'button'}" data-key="${k}" class="h-14 rounded-xl text-lg font-semibold ${k === 'OK' ? 'bg-brand-700 text-white' : 'bg-cream-100 hover:bg-cream-200'}">${k}</button>`)
              .join('')}
          </div>
          <p id="pin-error" class="text-sm text-red-600 mt-3"></p>
        </form>
      </div>`;
    const input = $('pin-input');
    input.focus();
    $('pin-form').querySelectorAll('[data-key]').forEach((b) => {
      if (b.dataset.key === 'OK') return;
      b.onclick = () => {
        input.value = b.dataset.key === '⌫' ? input.value.slice(0, -1) : (input.value + b.dataset.key).slice(0, 8);
      };
    });
    $('pin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await call('/auth/pin', { method: 'POST', body: { pin: input.value } });
        after();
      } catch (err) {
        $('pin-error').textContent = err.message;
        input.value = '';
      }
    });
  }

  // ================= NHÂN SỰ & CHẤM CÔNG =================
  async function renderStaff() {
    const [{ staff }, att, sum] = await Promise.all([
      call('/admin/staff'),
      call(`/admin/attendance?date=${S.attDate}`),
      call(`/admin/attendance/summary?month=${S.attMonth}`),
    ]);
    const active = staff.filter((s) => s.is_active);
    const isToday = S.attDate === vnToday();
    const openShift = (id) => att.records.some((r) => r.staff_id === id && r.check_in && !r.check_out);

    view().innerHTML = `
      <div class="card p-4 mb-4 overflow-x-auto">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-bold text-brand-800">Danh sách nhân viên (${staff.length})</h3>
          <button id="add-staff" class="btn btn-primary">＋ Thêm nhân viên</button>
        </div>
        <table class="tbl w-full text-sm min-w-[640px]">
          <thead><tr><th>Họ tên</th><th>SĐT</th><th>Chức vụ</th><th class="text-right">Mức lương</th><th class="text-right">Trợ cấp</th><th>Ngày vào</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${
            staff
              .map(
                (s) => `<tr>
              <td class="font-medium">${esc(s.full_name)}${s.note ? `<div class="text-xs text-stone-500">${esc(s.note)}</div>` : ''}</td>
              <td>${esc(s.phone || '')}</td><td>${esc(s.position || '')}</td>
              <td class="text-right whitespace-nowrap">${s.monthly_salary > 0 ? `${money(s.monthly_salary)}<span class="text-xs text-stone-500">/tháng</span>` : `${money(s.hourly_rate)}<span class="text-xs text-stone-500">/giờ</span>`}</td>
              <td class="text-right">${money(s.allowance)}</td>
              <td>${s.start_date ? s.start_date.split('-').reverse().join('/') : ''}</td>
              <td>${s.is_active ? '<span class="text-emerald-700">Đang làm</span>' : '<span class="text-stone-400">Nghỉ việc</span>'}</td>
              <td class="text-right whitespace-nowrap"><button data-edit-staff="${s.id}" class="btn btn-ghost !py-1">Sửa</button> <button data-del-staff="${s.id}" class="btn btn-danger !py-1">Xoá</button></td>
            </tr>`
              )
              .join('') || '<tr><td colspan="8" class="text-stone-400">Chưa có nhân viên</td></tr>'
          }</tbody>
        </table>
      </div>

      <div class="card p-4 mb-4">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="font-bold text-brand-800 mr-auto">Bảng chấm công ngày</h3>
          <input id="att-date" type="date" value="${S.attDate}" class="input !w-auto" />
          <button id="add-att" class="btn btn-ghost">＋ Thêm thủ công</button>
        </div>
        ${
          isToday && active.length
            ? `<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">${active
                .map((s) => {
                  const on = openShift(s.id);
                  return `<div class="flex items-center gap-2 rounded-xl border border-cream-200 p-2">
                    <span class="w-2.5 h-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-stone-300'}"></span>
                    <span class="flex-1 text-sm font-medium truncate">${esc(s.full_name)}</span>
                    ${on ? `<button data-checkout="${s.id}" class="btn btn-accent !py-1">Ra ca</button>` : `<button data-checkin="${s.id}" class="btn btn-primary !py-1">Vào ca</button>`}
                  </div>`;
                })
                .join('')}</div>`
            : ''
        }
        <div class="overflow-x-auto">
        <table class="tbl w-full text-sm min-w-[560px]">
          <thead><tr><th>Nhân viên</th><th>Giờ vào</th><th>Giờ ra</th><th class="text-right">Số giờ</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>${
            att.records
              .map(
                (r) => `<tr><td class="font-medium">${esc(r.full_name)}</td><td>${r.check_in || '—'}</td><td>${r.check_out || '<span class="text-emerald-700">Đang làm</span>'}</td>
              <td class="text-right">${r.hours}</td><td class="text-stone-500">${esc(r.note || '')}</td>
              <td class="text-right whitespace-nowrap"><button data-edit-att="${r.id}" class="btn btn-ghost !py-1">Sửa</button> <button data-del-att="${r.id}" class="btn btn-danger !py-1">Xoá</button></td></tr>`
              )
              .join('') || '<tr><td colspan="6" class="text-stone-400">Chưa có dữ liệu chấm công</td></tr>'
          }</tbody>
        </table></div>
      </div>

      <div class="card p-4 overflow-x-auto">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="font-bold text-brand-800 mr-auto">Tổng hợp công tháng</h3>
          <input id="att-month" type="month" value="${S.attMonth}" class="input !w-auto" />
        </div>
        <table class="tbl w-full text-sm min-w-[480px]">
          <thead><tr><th>Nhân viên</th><th class="text-right">Số ngày</th><th class="text-right">Tổng giờ</th><th class="text-right">Lương theo giờ (ước tính)</th></tr></thead>
          <tbody>${
            sum.summary
              .map((r) => `<tr><td>${esc(r.full_name)}</td><td class="text-right">${r.days}</td><td class="text-right">${r.hours}</td><td class="text-right font-semibold">${r.wage === null ? '<span class="text-xs font-normal text-stone-500">Lương tháng - xem Bảng lương</span>' : money(r.wage)}</td></tr>`)
              .join('') || '<tr><td colspan="4" class="text-stone-400">Chưa có dữ liệu</td></tr>'
          }</tbody>
        </table>
      </div>

      <div id="payroll-box" class="card p-4 mt-4"></div>`;
    renderPayroll();

    const editStaff = (s = {}) =>
      openModal(
        s.id ? 'Sửa nhân viên' : 'Thêm nhân viên',
        `<form id="staff-form" class="space-y-3">
          <div><label class="text-sm font-medium">Họ tên *</label><input name="full_name" required maxlength="100" value="${esc(s.full_name || '')}" class="input mt-1" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-sm font-medium">Số điện thoại</label><input name="phone" maxlength="20" value="${esc(s.phone || '')}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Chức vụ</label><input name="position" maxlength="50" list="positions" value="${esc(s.position || '')}" class="input mt-1" />
              <datalist id="positions"><option value="Bếp"><option value="Phục vụ"><option value="Thu ngân"><option value="Quản lý"></datalist></div>
            <div><label class="text-sm font-medium">Lương tháng (đ)</label><input name="monthly_salary" type="number" min="0" step="100000" value="${s.monthly_salary ?? 0}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Trợ cấp/tháng (đ)</label><input name="allowance" type="number" min="0" step="10000" value="${s.allowance ?? 0}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Lương/giờ (đ)</label><input name="hourly_rate" type="number" min="0" step="1000" value="${s.hourly_rate ?? 0}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Ngày vào làm</label><input name="start_date" type="date" value="${s.start_date || ''}" class="input mt-1" /></div>
          </div>
          <p class="text-xs text-stone-500">Có lương tháng: được nghỉ ${esc(S.settings.paid_leave_days ?? '2')} ngày/tháng vẫn hưởng lương, nghỉ thêm trừ theo ngày. Để lương tháng = 0 nếu trả theo giờ. Trợ cấp là mức mặc định, có thể chỉnh từng tháng trong Bảng lương.</p>
          <div><label class="text-sm font-medium">Ghi chú</label><input name="note" maxlength="300" value="${esc(s.note || '')}" class="input mt-1" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" ${s.is_active === 0 ? '' : 'checked'} /> Đang làm việc</label>
          <button class="btn btn-primary w-full py-3">Lưu</button>
        </form>`,
        (root) =>
          onSubmit(root.querySelector('#staff-form'), async (d) => {
            await call(s.id ? `/admin/staff/${s.id}` : '/admin/staff', {
              method: s.id ? 'PUT' : 'POST',
              body: {
                ...d,
                hourly_rate: Number(d.hourly_rate || 0),
                monthly_salary: Number(d.monthly_salary || 0),
                allowance: Number(d.allowance || 0),
                is_active: !!d.is_active,
              },
            });
            closeModal();
            toast('Đã lưu nhân viên');
            renderStaff();
          })
      );

    const editAtt = (r = {}) =>
      openModal(
        r.id ? 'Sửa chấm công' : 'Thêm chấm công',
        `<form id="att-form" class="space-y-3">
          <div><label class="text-sm font-medium">Nhân viên</label>
            <select name="staff_id" class="input mt-1">${staff.map((s) => `<option value="${s.id}" ${s.id === r.staff_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="text-sm font-medium">Ngày</label><input name="work_date" type="date" required value="${r.work_date || S.attDate}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Giờ vào</label><input name="check_in" type="time" value="${r.check_in || ''}" class="input mt-1" /></div>
            <div><label class="text-sm font-medium">Giờ ra</label><input name="check_out" type="time" value="${r.check_out || ''}" class="input mt-1" /></div>
          </div>
          <div><label class="text-sm font-medium">Ghi chú</label><input name="note" maxlength="200" value="${esc(r.note || '')}" class="input mt-1" /></div>
          <button class="btn btn-primary w-full py-3">Lưu</button>
        </form>`,
        (root) =>
          onSubmit(root.querySelector('#att-form'), async (d) => {
            await call(r.id ? `/admin/attendance/${r.id}` : '/admin/attendance', { method: r.id ? 'PUT' : 'POST', body: { ...d, staff_id: Number(d.staff_id) } });
            closeModal();
            toast('Đã lưu chấm công');
            renderStaff();
          })
      );

    const act = async (fn) => {
      try {
        await fn();
        renderStaff();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    $('add-staff').onclick = () => editStaff();
    $('add-att').onclick = () => (staff.length ? editAtt() : toast('Chưa có nhân viên', 'error'));
    $('att-date').onchange = (e) => {
      S.attDate = e.target.value || vnToday();
      renderStaff();
    };
    $('att-month').onchange = (e) => {
      S.attMonth = e.target.value || vnToday().slice(0, 7);
      renderStaff();
    };
    view().querySelectorAll('[data-edit-staff]').forEach((b) => (b.onclick = () => editStaff(staff.find((s) => s.id === Number(b.dataset.editStaff)))));
    view().querySelectorAll('[data-del-staff]').forEach(
      (b) => (b.onclick = () => confirm('Xoá nhân viên này và toàn bộ dữ liệu chấm công?') && act(() => call(`/admin/staff/${b.dataset.delStaff}`, { method: 'DELETE' })))
    );
    view().querySelectorAll('[data-checkin]').forEach((b) => (b.onclick = () => act(() => call('/admin/attendance/check-in', { method: 'POST', body: { staff_id: Number(b.dataset.checkin) } }))));
    view().querySelectorAll('[data-checkout]').forEach((b) => (b.onclick = () => act(() => call('/admin/attendance/check-out', { method: 'POST', body: { staff_id: Number(b.dataset.checkout) } }))));
    view().querySelectorAll('[data-edit-att]').forEach((b) => (b.onclick = () => editAtt(att.records.find((r) => r.id === Number(b.dataset.editAtt)))));
    view().querySelectorAll('[data-del-att]').forEach(
      (b) => (b.onclick = () => confirm('Xoá bản ghi chấm công này?') && act(() => call(`/admin/attendance/${b.dataset.delAtt}`, { method: 'DELETE' })))
    );
  }

  // ================= BẢNG LƯƠNG (mã PIN cấp 2) =================
  const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '');
  const fmtMonth = (m) => m.split('-').reverse().join('/');

  async function renderPayroll() {
    const box = $('payroll-box');
    if (!box) return;
    const me = await call('/auth/me');
    if (!me.finance) {
      box.innerHTML = `<div class="flex flex-wrap items-center gap-3">
        <h3 class="font-bold text-brand-800 mr-auto">💵 Bảng lương tháng</h3>
        ${S.summary.payroll_due ? `<span class="text-sm text-red-600">Còn ${S.summary.payroll_due} nhân viên chưa nhận lương tháng ${fmtMonth(S.summary.payroll_month)}</span>` : ''}
        <button id="unlock-payroll" class="btn btn-primary">🔒 Nhập mã PIN cấp 2 để xem</button></div>`;
      $('unlock-payroll').onclick = () => renderPinPad(renderPayroll, box, 'Bảng lương');
      return;
    }
    let data;
    try {
      data = await financeCall(`/finance/payroll?month=${S.payMonth}`);
    } catch (e) {
      if (e.status !== 403) toast(e.message, 'error');
      return;
    }
    const due = vnToday() >= data.pay_date && data.rows.some((r) => r.status !== 'paid');
    box.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <h3 class="font-bold text-brand-800 mr-auto">💵 Bảng lương tháng ${fmtMonth(data.month)}</h3>
        <input id="pay-month" type="month" value="${data.month}" class="input !w-auto" />
      </div>
      <div class="text-sm mb-3 ${due ? 'text-red-600 font-semibold' : 'text-stone-600'}">
        📅 Ngày trả lương: <b>${fmtDate(data.pay_date)}</b>${due ? ' - đã đến hạn trả lương!' : ''}
        · Nghỉ có lương: <b>${data.paid_leave_days} ngày/tháng</b> · Ngày công tự lấy từ chấm công (có thể sửa).
      </div>
      <div class="overflow-x-auto">
      <table class="tbl w-full text-sm min-w-[900px]">
        <thead><tr><th>Nhân viên</th><th class="text-right">Mức lương</th><th class="text-center">Ngày công</th><th class="text-center">Nghỉ<br/>có lương / trừ lương</th>
          <th class="text-right">Lương theo công</th><th class="text-right">Trợ cấp</th><th class="text-right">Thực lĩnh</th><th></th></tr></thead>
        <tbody>${
          data.rows
            .map((r) => {
              const paid = r.status === 'paid';
              const rate = r.monthly_salary > 0 ? `${money(r.monthly_salary)}<div class="text-xs text-stone-500">/tháng</div>` : `${money(r.hourly_rate)}<div class="text-xs text-stone-500">/giờ · ${r.hours} giờ</div>`;
              return `<tr data-pay-row="${r.staff_id}">
                <td class="font-medium">${esc(r.full_name)}<div class="text-xs text-stone-500">${esc(r.position || '')}</div></td>
                <td class="text-right whitespace-nowrap">${rate}</td>
                <td class="text-center"><input name="worked_days" type="number" min="0" max="${r.days_in_month}" value="${r.worked_days_manual ?? ''}" placeholder="${r.auto_worked_days}" class="input !w-20 !py-1 text-center" ${paid ? 'disabled' : ''} />
                  <div class="text-xs text-stone-500">/ ${r.days_in_month} ngày</div></td>
                <td class="text-center">${r.monthly_salary > 0 ? `${r.paid_leave_days} / <span class="${r.unpaid_leave_days ? 'text-red-600 font-semibold' : ''}">${r.unpaid_leave_days}</span>` : '—'}</td>
                <td class="text-right">${money(r.base_pay)}</td>
                <td class="text-right"><input name="allowance" type="number" min="0" step="10000" value="${r.allowance}" class="input !w-28 !py-1 text-right" ${paid ? 'disabled' : ''} /></td>
                <td class="text-right font-bold text-brand-800 whitespace-nowrap">${money(r.total)}</td>
                <td class="text-right whitespace-nowrap">${
                  paid
                    ? `<div class="text-xs text-emerald-700 mb-1">✔ Đã trả ${vnDateTime(r.paid_at, true).split(' ').pop()}</div>
                       <button data-payslip="${r.staff_id}" class="btn btn-ghost !py-1">🖨️ Phiếu</button>
                       <button data-pay-revert="${r.id}" class="btn btn-danger !py-1">Hoàn tác</button>`
                    : `<button data-pay-save="${r.staff_id}" class="btn btn-ghost !py-1">Tính lại</button>
                       <button data-pay-confirm="${r.staff_id}" class="btn btn-accent !py-1">Đã trả lương</button>`
                }</td>
              </tr>`;
            })
            .join('') || '<tr><td colspan="8" class="text-stone-400">Chưa có nhân viên</td></tr>'
        }</tbody>
        <tfoot><tr class="font-bold"><td colspan="4">Tổng cộng</td><td class="text-right">${money(data.totals.base_pay)}</td>
          <td class="text-right">${money(data.totals.allowance)}</td><td class="text-right text-brand-800">${money(data.totals.total)}</td><td></td></tr></tfoot>
      </table></div>
      <p class="text-xs text-stone-500 mt-2">Bấm "Đã trả lương" sẽ chốt bảng lương và tự ghi khoản chi "Lương nhân viên" vào sổ Thu chi.</p>`;

    $('pay-month').onchange = (e) => {
      if (e.target.value) S.payMonth = e.target.value;
      renderPayroll();
    };
    const inputs = (staffId) => {
      const tr = box.querySelector(`[data-pay-row="${staffId}"]`);
      const wd = tr.querySelector('[name=worked_days]').value;
      return { month: data.month, staff_id: Number(staffId), worked_days: wd === '' ? null : Number(wd), allowance: Number(tr.querySelector('[name=allowance]').value || 0) };
    };
    const run = async (btn, fn) => {
      btn.disabled = true;
      try {
        await fn();
        pollTick();
        renderPayroll();
      } catch (e) {
        if (e.status !== 403) toast(e.message, 'error');
        btn.disabled = false;
      }
    };
    box.querySelectorAll('[data-pay-save]').forEach((b) => (b.onclick = () => run(b, () => financeCall('/finance/payroll', { method: 'PUT', body: inputs(b.dataset.paySave) }))));
    box.querySelectorAll('[data-pay-confirm]').forEach(
      (b) =>
        (b.onclick = () => {
          const r = data.rows.find((x) => x.staff_id === Number(b.dataset.payConfirm));
          const body = inputs(b.dataset.payConfirm);
          if (!confirm(`Xác nhận đã trả lương tháng ${fmtMonth(data.month)} cho ${r.full_name}?`)) return;
          run(b, async () => {
            await financeCall('/finance/payroll', { method: 'PUT', body });
            await financeCall('/finance/payroll/pay', { method: 'POST', body: { month: data.month, staff_id: body.staff_id } });
            toast(`Đã trả lương cho ${r.full_name}`);
          });
        })
    );
    box.querySelectorAll('[data-pay-revert]').forEach(
      (b) => (b.onclick = () => confirm('Hoàn tác trả lương? Khoản chi lương tương ứng sẽ bị xoá khỏi sổ thu chi.') && run(b, () => financeCall(`/finance/payroll/${b.dataset.payRevert}/revert`, { method: 'POST' })))
    );
    box.querySelectorAll('[data-payslip]').forEach((b) => (b.onclick = () => printPayslip(data.rows.find((x) => x.staff_id === Number(b.dataset.payslip)))));
  }

  function printPayslip(r) {
    const s = S.settings;
    const row = (l, v) => `<tr><td>${l}</td><td class="r">${v}</td></tr>`;
    P.printHtml(
      `<div class="bill w${s.paper_width === '58' ? '58' : '80'}">
        <img src="/assets/logo.webp" alt="LaLiDa" />
        <div class="c b">${esc(s.shop_name || 'LaLiDa')}</div>
        <hr /><div class="c b">PHIẾU LƯƠNG THÁNG ${fmtMonth(r.month)}</div>
        <div>Nhân viên: ${esc(r.full_name)}</div>
        <div>Chức vụ: ${esc(r.position || '')}</div>
        <hr /><table>
          ${r.monthly_salary > 0 ? row('Lương tháng', money(r.monthly_salary)) : row(`Lương giờ (${r.hours}h x ${money(r.hourly_rate)})`, '')}
          ${row('Ngày công', `${r.worked_days}/${r.days_in_month}`)}
          ${r.monthly_salary > 0 ? row('Nghỉ có lương', `${r.paid_leave_days} ngày`) + row('Nghỉ trừ lương', `${r.unpaid_leave_days} ngày`) : ''}
          ${row('Lương theo công', money(r.base_pay))}
          ${row('Trợ cấp', money(r.allowance))}
          <tr class="b"><td>THỰC LĨNH</td><td class="r">${money(r.total)}</td></tr>
        </table><hr />
        <div>Ngày trả: ${r.paid_at ? vnDateTime(r.paid_at) : fmtDate(r.pay_date)}</div>
        <table style="margin-top:8px"><tr><td class="c">Người nhận</td><td class="c">Quản lý</td></tr></table>
        <div style="height:14mm"></div>
      </div>`,
      s.paper_width === '58' ? '58mm' : '80mm'
    );
  }

  // ================= GÓP Ý =================
  async function renderFeedback() {
    const { feedback } = await call('/admin/feedback');
    const avg = feedback.length ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1) : '—';
    view().innerHTML = `
      <div class="flex items-center gap-3 mb-4">
        <h2 class="text-lg font-bold text-brand-800">Góp ý & Phản hồi</h2>
        <span class="text-sm text-stone-500">${feedback.length} góp ý · Trung bình <b class="text-amber-500">${avg} ★</b></span>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        ${
          feedback
            .map(
              (f) => `<div class="card p-4 ${f.is_read ? '' : 'ring-2 ring-amber-300'}">
            <div class="flex justify-between items-start">
              <div class="text-amber-500 text-lg">${stars(f.rating)}</div>
              <div class="text-xs text-stone-400">${vnDateTime(f.created_at)}</div>
            </div>
            <div class="text-sm text-stone-600 mt-1">${esc(f.customer_name || 'Khách')}${f.table_number ? ` · Bàn ${f.table_number}` : ''}</div>
            <p class="mt-2 whitespace-pre-line">${esc(f.content || '(Không có nội dung)')}</p>
            ${
              f.voucher_code
                ? `<div class="mt-2 text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 ${f.voucher_status === 'used' ? 'bg-stone-100 text-stone-500' : 'bg-amber-50 text-amber-800'}">
                    🎁 ${esc(f.voucher_code)} · ${f.voucher_status === 'used' ? 'Đã dùng' : `Hạn ${f.voucher_expires_at.split('-').reverse().join('/')}`}</div>`
                : ''
            }
            <div class="flex gap-2 justify-end mt-3">
              ${f.is_read ? '' : `<button data-read="${f.id}" class="btn btn-ghost !py-1">Đánh dấu đã đọc</button>`}
              <button data-del-fb="${f.id}" class="btn btn-danger !py-1">Xoá</button>
            </div>
          </div>`
            )
            .join('') || '<div class="text-stone-500">Chưa có góp ý nào.</div>'
        }
      </div>`;
    view().querySelectorAll('[data-read]').forEach(
      (b) =>
        (b.onclick = async () => {
          await call(`/admin/feedback/${b.dataset.read}/read`, { method: 'POST' });
          pollTick();
          renderFeedback();
        })
    );
    view().querySelectorAll('[data-del-fb]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm('Xoá góp ý này?')) return;
          await call(`/admin/feedback/${b.dataset.delFb}`, { method: 'DELETE' });
          pollTick();
          renderFeedback();
        })
    );
  }

  // ================= CÀI ĐẶT =================
  async function renderSettings() {
    const s = (S.settings = await call('/admin/settings'));
    const mode = storage.get('lalida_print_mode', 'browser');
    const field = (name, label, attrs = '') =>
      `<div><label class="text-sm font-medium">${label}</label><input name="${name}" value="${esc(s[name] || '')}" class="input mt-1" ${attrs} /></div>`;
    view().innerHTML = `
      <div class="grid lg:grid-cols-2 gap-4">
        <form id="settings-form" class="card p-4 space-y-3">
          <h3 class="font-bold text-brand-800">Thông tin quán & hoá đơn</h3>
          ${field('shop_name', 'Tên quán', 'maxlength="100"')}
          ${field('shop_slogan', 'Slogan', 'maxlength="100"')}
          ${field('shop_address', 'Địa chỉ', 'maxlength="200"')}
          ${field('shop_phone', 'Số điện thoại', 'maxlength="30"')}
          ${field('public_base_url', 'Tên miền dùng cho mã QR', 'placeholder="https://lalida.net"')}
          ${field('bill_footer', 'Lời chào cuối hoá đơn', 'maxlength="200"')}
          <div><label class="text-sm font-medium">Khổ giấy in hoá đơn</label>
            <select name="paper_width" class="input mt-1">
              <option value="80" ${s.paper_width !== '58' ? 'selected' : ''}>80mm</option>
              <option value="58" ${s.paper_width === '58' ? 'selected' : ''}>58mm</option>
            </select></div>
          <div class="rounded-xl bg-cream-100 p-3 space-y-2">
            <label class="flex items-center gap-2 font-medium"><input type="checkbox" name="vat_enabled" ${s.vat_enabled === '1' ? 'checked' : ''} /> Tính phí VAT</label>
            <div class="flex items-center gap-2"><input name="vat_percent" type="number" min="0" max="100" step="0.5" value="${esc(s.vat_percent || '0')}" class="input !w-28" /><span>%</span></div>
            <p class="text-xs text-stone-500">Áp dụng cho các đơn đang mở và đơn mới; đơn đã thanh toán giữ nguyên.</p>
          </div>
          <div class="rounded-xl bg-cream-100 p-3 space-y-2">
            <div class="font-medium">Khách quét QR & quà tặng góp ý</div>
            <label class="flex items-start gap-2 text-sm"><input type="checkbox" name="customer_ordering" class="mt-1" ${s.customer_ordering === '1' ? 'checked' : ''} />
              <span>Cho phép khách tự gọi món qua QR <span class="block text-xs text-stone-500">Bật (mặc định): khách chọn món, đặt đơn, xem và sửa đơn. Tắt: khách chỉ xem Thực đơn và Góp ý & Phản hồi; nhân viên gọi món cho bàn.</span></span></label>
            <label class="flex items-start gap-2 text-sm"><input type="checkbox" name="online_ordering" class="mt-1" ${s.online_ordering === '1' ? 'checked' : ''} />
              <span>Nhận đơn Đặt online <span class="block text-xs text-stone-500">Trang đặt món: <b>${esc((s.public_base_url || location.origin).replace(/\/+$/, ''))}/online</b> - khách điền Tên, SĐT, Địa chỉ khi đặt.</span></span></label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="feedback_reward_enabled" ${s.feedback_reward_enabled === '1' ? 'checked' : ''} /> Tặng 1 ly nước (lần sau) cho khách góp ý</label>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-xs font-medium">Số mã tặng / lượt ăn của bàn</label><input name="vouchers_per_order" type="number" min="1" max="20" value="${esc(s.vouchers_per_order || '1')}" class="input mt-1" /></div>
              <div><label class="text-xs font-medium">Hạn dùng mã (ngày)</label><input name="voucher_valid_days" type="number" min="1" max="365" value="${esc(s.voucher_valid_days || '30')}" class="input mt-1" /></div>
            </div>
          </div>
          <div class="rounded-xl bg-cream-100 p-3 space-y-2">
            <div class="font-medium">Lương nhân viên</div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-xs font-medium">Số ngày nghỉ có lương / tháng</label><input name="paid_leave_days" type="number" min="0" max="31" value="${esc(s.paid_leave_days ?? '2')}" class="input mt-1" /></div>
              <div><label class="text-xs font-medium">Ngày trả lương hàng tháng</label><input name="payday" type="number" min="1" max="28" value="${esc(s.payday || '5')}" class="input mt-1" /></div>
            </div>
          </div>
          <button class="btn btn-primary w-full">Lưu cài đặt</button>
        </form>

        <div class="space-y-4">
          <div class="card p-4 space-y-3">
            <h3 class="font-bold text-brand-800">Máy in hoá đơn (thiết bị này)</h3>
            <label class="flex items-center gap-2 text-sm"><input type="radio" name="pmode" value="browser" ${mode === 'browser' ? 'checked' : ''} /> In qua trình duyệt (window.print, máy in USB/WiFi)</label>
            <label class="flex items-center gap-2 text-sm"><input type="radio" name="pmode" value="bluetooth" ${mode === 'bluetooth' ? 'checked' : ''} ${P.supported() ? '' : 'disabled'} /> Máy in nhiệt Bluetooth (ESC/POS) ${P.supported() ? '' : '<span class="text-red-600">- trình duyệt không hỗ trợ</span>'}</label>
            <div class="flex gap-2">
              <button id="bt-connect" class="btn btn-ghost" ${P.supported() ? '' : 'disabled'}>🔵 Kết nối máy in Bluetooth</button>
              <button id="test-print" class="btn btn-ghost">🖨️ In thử</button>
            </div>
            <p id="bt-status" class="text-xs text-stone-500">${P.connected() ? 'Đã kết nối' : 'Chưa kết nối'}</p>
          </div>
          <form id="password-form" class="card p-4 space-y-3">
            <h3 class="font-bold text-brand-800">Đổi mật khẩu Admin</h3>
            <input name="current" type="password" autocomplete="current-password" required placeholder="Mật khẩu hiện tại" class="input" />
            <input name="new_password" type="password" autocomplete="new-password" minlength="8" required placeholder="Mật khẩu mới (tối thiểu 8 ký tự)" class="input" />
            <button class="btn btn-ghost w-full">Đổi mật khẩu</button>
            <p class="text-xs text-stone-500">Mã PIN cấp 2 được đổi trong mục Thu chi & Lợi nhuận.</p>
          </form>
        </div>
      </div>`;

    onSubmit($('settings-form'), async (d) => {
      S.settings = await call('/admin/settings', {
        method: 'PUT',
        body: {
          ...d,
          vat_enabled: d.vat_enabled ? '1' : '0',
          customer_ordering: d.customer_ordering ? '1' : '0',
          online_ordering: d.online_ordering ? '1' : '0',
          feedback_reward_enabled: d.feedback_reward_enabled ? '1' : '0',
        },
      });
      toast('Đã lưu cài đặt');
    });
    onSubmit($('password-form'), async (d, form) => {
      await call('/admin/password', { method: 'PUT', body: d });
      form.reset();
      toast('Đã đổi mật khẩu Admin');
    });
    view().querySelectorAll('[name=pmode]').forEach((r) => (r.onchange = () => storage.set('lalida_print_mode', r.value)));
    $('bt-connect').onclick = async () => {
      try {
        const name = await P.connect();
        $('bt-status').textContent = `Đã kết nối: ${name}`;
        storage.set('lalida_print_mode', 'bluetooth');
        view().querySelector('[name=pmode][value=bluetooth]').checked = true;
      } catch (e) {
        $('bt-status').textContent = e.message;
      }
    };
    $('test-print').onclick = () =>
      printOrder({
        id: 0, table_number: 0, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), paid_at: null,
        items: [{ name: 'Cơm gà luộc', price: 45000, quantity: 2, status: 'served' }, { name: 'Trà đá', price: 5000, quantity: 2, status: 'served' }],
        subtotal: 100000, vat_percent: Number(s.vat_enabled === '1' ? s.vat_percent : 0),
        vat_amount: s.vat_enabled === '1' ? Math.round(100000 * Number(s.vat_percent) / 100) : 0,
        total: 100000 + (s.vat_enabled === '1' ? Math.round(100000 * Number(s.vat_percent) / 100) : 0),
      });
  }

  // ================= Khởi động =================
  api('/auth/me')
    .then((me) => (me.admin ? showApp() : showLogin()))
    .catch(showLogin);
})();
