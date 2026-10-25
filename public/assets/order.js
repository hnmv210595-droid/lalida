// Trang gọi món cho khách: /order?table=X
(() => {
  const { api, money, esc, toast, storage, STATUS, CATEGORY_ICON } = window.LL;
  const $ = (id) => document.getElementById(id);

  const tableParam = new URLSearchParams(location.search).get('table');
  const tableNumber = /^\d+$/.test(tableParam || '') ? Number(tableParam) : null;
  const CART_KEY = `lalida_cart_${tableNumber || 0}`;
  const VOUCHER_KEY = 'lalida_vouchers';

  const state = {
    categories: [],
    items: [],
    settings: {},
    tab: null, // slug danh mục hoặc 'feedback'
    cart: storage.get(CART_KEY, {}), // { [menuItemId]: { qty, note } }
    tableOk: false,
    order: null,
    rating: 5,
    ordering: false, // khách tự gọi món (bật/tắt trong Cài đặt Admin)
    vouchers: storage.get(VOUCHER_KEY, []), // mã tặng nước đã nhận trên máy này
  };

  // ---------- Bàn ----------
  async function initTable() {
    if (!tableNumber) {
      $('table-badge').textContent = 'Chưa chọn bàn';
      $('table-badge').classList.replace('bg-brand-700', 'bg-stone-500');
      $('no-table').classList.remove('hidden');
      return;
    }
    try {
      const t = await api(`/public/tables/${tableNumber}`);
      state.tableOk = true;
      renderCart();
      $('table-badge').innerHTML = `🍽️ ${esc(t.name || 'Bàn ' + t.number)}`;
      document.title = `LaLiDa - ${t.name || 'Bàn ' + t.number}`;
      if (state.ordering) {
        loadOrder();
        setInterval(loadOrder, 5000);
      }
    } catch (e) {
      $('table-badge').textContent = `Bàn ${tableNumber} không hợp lệ`;
      $('table-badge').classList.replace('bg-brand-700', 'bg-red-600');
      $('no-table').classList.remove('hidden');
    }
  }

  // ---------- Thực đơn ----------
  async function loadMenu() {
    try {
      const data = await api('/public/menu');
      Object.assign(state, { categories: data.categories, items: data.items, settings: data.settings });
      applyMode();
      // Bỏ món trong giỏ không còn phục vụ
      for (const id of Object.keys(state.cart)) if (!state.items.some((i) => i.id === Number(id))) delete state.cart[id];
      state.tab = location.hash === '#gop-y' ? 'feedback' : state.categories[0]?.slug;
      renderTabs();
      renderMenu();
      renderCart();
    } catch (e) {
      $('menu-grid').innerHTML = `<div class="text-red-600">${esc(e.message)}</div>`;
    }
  }

  // Chế độ chỉ xem: ẩn giỏ hàng / đơn đã đặt, khách chỉ xem thực đơn & góp ý
  function applyMode() {
    state.ordering = state.settings.customer_ordering === '1';
    const reward = state.settings.feedback_reward_enabled === '1';
    $('side').classList.toggle('hidden', !state.ordering);
    $('bottom-bar').classList.toggle('hidden', !state.ordering);
    $('sheet-backdrop').classList.add('hidden');
    $('main').classList.toggle('lg:grid', state.ordering);
    $('main').classList.toggle('pb-28', state.ordering);
    $('ordering-note').classList.toggle('hidden', state.ordering);
    document.querySelectorAll('.reward-hint').forEach((el) => el.classList.toggle('hidden', !reward));
    $('reward-banner').classList.toggle('hidden', !reward);
    if (!state.ordering) {
      state.cart = {};
      $('no-table').querySelector('div').innerHTML = '📱 Vui lòng <b>quét mã QR trên bàn</b> để gửi góp ý nhận quà.';
    }
  }

  function renderTabs() {
    const btn = (key, label, extra = '') => {
      const active = state.tab === key;
      return `<button role="tab" data-tab="${esc(key)}" aria-selected="${active}"
        class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ${extra}
        ${active ? 'bg-brand-700 text-white shadow' : 'bg-white text-brand-800 border border-cream-200 hover:bg-brand-50'}">${label}</button>`;
    };
    $('tabs').innerHTML =
      state.categories.map((c) => btn(c.slug, `${CATEGORY_ICON[c.slug] || ''} ${esc(c.name)}`)).join('') +
      btn('feedback', '💬 Góp ý & Phản hồi', 'sm:ml-auto');
  }

  function renderMenu() {
    const isFeedback = state.tab === 'feedback';
    $('menu-section').classList.toggle('hidden', isFeedback);
    $('feedback-section').classList.toggle('hidden', !isFeedback);
    if (isFeedback) return;

    const cat = state.categories.find((c) => c.slug === state.tab);
    if (!cat) return;
    $('cat-title').textContent = cat.name;
    const list = state.items.filter((i) => i.category_id === cat.id);
    if (!list.length) {
      $('menu-grid').innerHTML = '<div class="text-stone-500">Danh mục này chưa có món.</div>';
      return;
    }
    $('menu-grid').innerHTML = list
      .map((i) => {
        const qty = state.cart[i.id]?.qty || 0;
        const img = i.image_url
          ? `<img src="${esc(i.image_url)}" alt="" loading="lazy" class="w-full h-full object-cover" />`
          : `<span class="text-4xl">${CATEGORY_ICON[cat.slug] || '🍽️'}</span>`;
        return `<article class="bg-white rounded-2xl border border-cream-200 shadow-sm p-3 flex gap-3">
          <div class="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl bg-cream-100 overflow-hidden flex items-center justify-center">${img}</div>
          <div class="flex-1 min-w-0 flex flex-col">
            <h3 class="font-semibold leading-snug">${esc(i.name)}</h3>
            ${i.description ? `<p class="text-xs text-stone-500 mt-0.5 line-clamp-2">${esc(i.description)}</p>` : ''}
            <div class="mt-auto flex items-center justify-between pt-2">
              <span class="font-bold text-clay-600">${money(i.price)}</span>
              ${qtyControl(i.id, qty)}
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  function qtyControl(id, qty) {
    if (!state.ordering) return '';
    if (!qty) {
      return `<button data-add="${id}" class="rounded-full bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-1.5">+ Thêm</button>`;
    }
    return `<div class="flex items-center gap-2">
      <button data-dec="${id}" class="w-8 h-8 rounded-full border border-brand-700 text-brand-800 font-bold" aria-label="Bớt">−</button>
      <span class="w-5 text-center font-semibold">${qty}</span>
      <button data-add="${id}" class="w-8 h-8 rounded-full bg-brand-700 text-white font-bold" aria-label="Thêm">+</button>
    </div>`;
  }

  // ---------- Giỏ hàng ----------
  function changeQty(id, delta) {
    const line = state.cart[id] || { qty: 0, note: '' };
    line.qty = Math.max(0, Math.min(50, line.qty + delta));
    if (line.qty === 0) delete state.cart[id];
    else state.cart[id] = line;
    storage.set(CART_KEY, state.cart);
    renderMenu();
    renderCart();
  }

  function cartLines() {
    return Object.entries(state.cart)
      .map(([id, l]) => ({ item: state.items.find((i) => i.id === Number(id)), ...l }))
      .filter((l) => l.item);
  }

  function renderCart() {
    const lines = cartLines();
    const total = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
    const count = lines.reduce((s, l) => s + l.qty, 0);
    $('cart-lines').innerHTML = lines.length
      ? lines
          .map(
            (l) => `<div class="py-2">
            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0"><div class="font-medium truncate">${esc(l.item.name)}</div>
                <div class="text-xs text-stone-500">${money(l.item.price)}</div></div>
              ${qtyControl(l.item.id, l.qty)}
            </div>
            <input data-note="${l.item.id}" value="${esc(l.note || '')}" maxlength="200" placeholder="Ghi chú món…"
              class="mt-1 w-full text-xs rounded-md border border-stone-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>`
          )
          .join('')
      : '<div class="text-stone-500 py-2">Chưa chọn món nào.</div>';
    $('cart-total').textContent = money(total);
    $('bar-count').textContent = count;
    $('bar-total').textContent = money(total);
    const btn = $('submit-order');
    btn.disabled = !lines.length || !state.tableOk;
    btn.textContent = state.tableOk ? 'Gửi đơn cho bếp' : 'Quét QR tại bàn để gọi món';
  }

  async function submitOrder() {
    const lines = cartLines();
    if (!lines.length || !state.tableOk) return;
    const btn = $('submit-order');
    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    try {
      const { order } = await api('/public/orders', {
        method: 'POST',
        body: {
          table: tableNumber,
          note: $('order-note').value,
          items: lines.map((l) => ({ id: l.item.id, quantity: l.qty, note: l.note })),
        },
      });
      state.cart = {};
      storage.set(CART_KEY, state.cart);
      $('order-note').value = '';
      state.order = order;
      renderMenu();
      renderCart();
      renderOrder();
      toast('Đã gửi đơn! Bếp đang chuẩn bị món cho bạn 🍗');
      $('order-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409) loadMenu();
    } finally {
      renderCart();
    }
  }

  // ---------- Đơn đã đặt ----------
  async function loadOrder() {
    try {
      const { order } = await api(`/public/orders?table=${tableNumber}`);
      state.order = order;
      renderOrder();
    } catch {
      /* thử lại ở lần cập nhật sau */
    }
  }

  function renderOrder() {
    const o = state.order;
    if (!o || !o.items.length) {
      $('order-body').innerHTML = 'Chưa có món nào được gửi.';
      return;
    }
    const rows = o.items
      .map((i) => {
        const st = STATUS[i.status] || STATUS.pending;
        return `<div class="flex items-start gap-2 py-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-stone-800 ${i.status === 'cancelled' ? 'line-through text-stone-400' : ''}">${i.quantity} × ${esc(i.name)}</div>
            ${i.note ? `<div class="text-xs text-stone-500">${esc(i.note)}</div>` : ''}
          </div>
          <span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}">${st.label}</span>
          <span class="shrink-0 w-20 text-right text-stone-700">${money(i.price * i.quantity)}</span>
        </div>`;
      })
      .join('');
    $('order-body').innerHTML = `
      <div class="text-xs text-stone-400 mb-1">Đơn #${o.id}</div>
      <div class="divide-y divide-stone-100">${rows}</div>
      <div class="border-t border-stone-200 mt-2 pt-2 space-y-1 text-stone-700">
        <div class="flex justify-between"><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
        ${o.vat_percent ? `<div class="flex justify-between"><span>VAT (${o.vat_percent}%)</span><span>${money(o.vat_amount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-brand-800 text-base"><span>Tổng tạm tính</span><span>${money(o.total)}</span></div>
      </div>
      <p class="text-xs text-stone-400 mt-2">Vui lòng thanh toán tại quầy thu ngân khi dùng bữa xong.</p>`;
  }

  // ---------- Góp ý ----------
  function renderStars() {
    $('stars').innerHTML = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" data-star="${n}" aria-label="${n} sao" class="${n <= state.rating ? 'text-amber-400' : 'text-stone-300'}">★</button>`)
      .join('');
  }

  async function submitFeedback(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button:not([type=button])');
    btn.disabled = true;
    try {
      const res = await api('/public/feedback', {
        method: 'POST',
        body: { rating: state.rating, content: $('fb-content').value, customer_name: $('fb-name').value, table: tableNumber },
      });
      e.target.reset();
      state.rating = 5;
      renderStars();
      if (res.voucher) {
        state.vouchers.unshift({ ...res.voucher, received: new Date().toISOString() });
        storage.set(VOUCHER_KEY, state.vouchers.slice(0, 10));
        renderVouchers();
        $('my-vouchers').scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('Cảm ơn bạn! LaLiDa tặng bạn 1 ly nước cho lần sau 🎁');
      } else {
        toast('Cảm ơn bạn đã góp ý cho LaLiDa! ❤️');
        if (res.voucher_note && state.settings.feedback_reward_enabled === '1') setTimeout(() => toast(res.voucher_note), 1500);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // Mã tặng nước đã nhận (lưu trên điện thoại của khách) - đưa thu ngân ở lần ăn sau
  function renderVouchers() {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const list = state.vouchers.filter((v) => v.expires_at >= today);
    $('my-vouchers').innerHTML = list
      .map(
        (v) => `<div class="rounded-2xl border-2 border-dashed border-clay-500 bg-white p-4 flex items-center gap-4">
          <div class="text-4xl">🥤</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-stone-500">Phiếu tặng 1 ly nước · dùng cho lần sau</div>
            <div class="text-2xl font-bold tracking-widest text-clay-600 select-all">${esc(v.code)}</div>
            <div class="text-xs text-stone-500">Hạn dùng đến ${esc(v.expires_at.split('-').reverse().join('/'))} · Đưa mã này cho thu ngân</div>
          </div>
        </div>`
      )
      .join('');
  }

  // ---------- Bottom sheet (mobile) ----------
  function openSheet(target) {
    $('side').classList.remove('translate-y-full');
    $('sheet-backdrop').classList.remove('hidden');
    $(target).scrollIntoView({ block: 'start' });
  }
  function closeSheet() {
    $('side').classList.add('translate-y-full');
    $('sheet-backdrop').classList.add('hidden');
  }

  // ---------- Sự kiện ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) {
      state.tab = t.dataset.tab;
      renderTabs();
      renderMenu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (t.dataset.add) changeQty(t.dataset.add, 1);
    else if (t.dataset.dec) changeQty(t.dataset.dec, -1);
    else if (t.dataset.star) {
      state.rating = Number(t.dataset.star);
      renderStars();
    }
  });
  $('cart-lines').addEventListener('input', (e) => {
    const id = e.target.dataset.note;
    if (id && state.cart[id]) {
      state.cart[id].note = e.target.value;
      storage.set(CART_KEY, state.cart);
    }
  });
  $('submit-order').addEventListener('click', submitOrder);
  $('feedback-form').addEventListener('submit', submitFeedback);
  $('open-cart').addEventListener('click', () => openSheet('cart-card'));
  $('open-order').addEventListener('click', () => openSheet('order-card'));
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', closeSheet);

  renderStars();
  renderVouchers();
  renderCart();
  loadMenu().then(initTable);
})();
