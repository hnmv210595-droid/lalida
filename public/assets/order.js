// Trang gọi món cho khách: /order?table=X
(() => {
  const { api, money, esc, toast, storage, STATUS, CATEGORY_ICON, orderLabel } = window.LL;
  const $ = (id) => document.getElementById(id);

  // Hai chế độ dùng chung trang này: gọi món tại bàn (/order?table=X) và Đặt online (/online)
  const ONLINE = /^\/online\/?$/.test(location.pathname);
  const tableParam = new URLSearchParams(location.search).get('table');
  const tableNumber = !ONLINE && /^\d+$/.test(tableParam || '') ? Number(tableParam) : null;
  const CART_KEY = ONLINE ? 'lalida_cart_online' : `lalida_cart_${tableNumber || 0}`;
  const VOUCHER_KEY = 'lalida_vouchers';
  // { id, token } đơn của chính khách trên máy này: mỗi bàn một khoá riêng, đơn online một khoá
  const MINE_KEY = ONLINE ? 'lalida_online_order' : `lalida_table_order_${tableNumber || 0}`;
  const CUSTOMER_KEY = 'lalida_customer'; // nhớ Tên / SĐT / Địa chỉ cho lần đặt sau

  const state = {
    categories: [],
    items: [],
    settings: {},
    view: 'home', // home (trang chính) | menu | feedback - theo hash URL: '' | #menu | #gop-y (#don-da-dat = menu + mở đơn)
    tab: null, // slug danh mục đang xem trong Menu
    cart: storage.get(CART_KEY, {}), // { [menuItemId]: { qty, note } }
    tableOk: false,
    order: null,
    rating: 5,
    ordering: false, // khách tự gọi món (bật/tắt trong Cài đặt Admin)
    vouchers: storage.get(VOUCHER_KEY, []), // mã tặng nước đã nhận trên máy này
    mine: storage.get(MINE_KEY, null),
  };

  // Tham số nhận diện đơn của khách khi gọi API: bàn hoặc đơn online
  const owner = () => (state.mine ? { order_id: state.mine.id, token: state.mine.token } : {});

  // ---------- Bàn / Đặt online ----------
  async function initTable() {
    if (ONLINE) {
      state.tableOk = true;
      $('table-badge').innerHTML = '🛵 Đặt online';
      $('welcome').textContent = 'Đặt món online - LaLiDa giao tận nơi! 🛵';
      document.title = 'Đặt món online - Cơm gà Tam Kỳ LaLiDa';
      renderCart();
      if (state.ordering) {
        loadOrder();
        setInterval(loadOrder, 10000);
      }
      return;
    }
    if (!tableNumber) {
      $('table-badge').textContent = 'Chưa chọn bàn';
      $('table-badge').classList.replace('bg-brand-700', 'bg-stone-500');
      $('no-table').classList.remove('hidden');
      return;
    }
    try {
      // Thông tin bàn đã có sẵn trong kết quả thực đơn (không cần gọi thêm API)
      const t = state.tableInfo !== undefined ? state.tableInfo : await api(`/public/tables/${tableNumber}`);
      if (!t) throw new Error('Bàn không tồn tại');
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
  // Thực đơn lần trước lưu trên máy: hiện ngay lập tức khi mở lại trang, rồi cập nhật khi có dữ liệu mới
  const MENU_CACHE_KEY = 'lalida_menu_cache';
  function showCachedMenu() {
    const cached = storage.get(MENU_CACHE_KEY, null);
    if (!cached?.categories?.length) return false;
    Object.assign(state, { categories: cached.categories, items: cached.items, settings: cached.settings });
    applyMode();
    state.tab = state.categories[0]?.slug;
    renderTabs();
    renderMenu();
    renderCart();
    route();
    return true;
  }

  // Tải thực đơn; gọi lại mỗi 30 giây để cập nhật món "Đã bán hết" mà không đổi màn hình đang xem.
  // Lần đầu dùng yêu cầu đã được gửi sẵn trong order.html (window.__menuRequest).
  // quiet = đã hiện bản lưu trên máy, chỉ cập nhật mà không cuộn / đổi màn hình.
  async function loadMenu(refresh = false, quiet = false) {
    try {
      const early = !refresh && window.__menuRequest;
      window.__menuRequest = null;
      const data = early ? await early : await api(`/public/menu${tableNumber ? '?table=' + tableNumber : ''}`);
      if (!refresh) state.tableInfo = data.table;
      storage.set(MENU_CACHE_KEY, { categories: data.categories, items: data.items, settings: data.settings });
      Object.assign(state, { categories: data.categories, items: data.items, settings: data.settings });
      applyMode();
      // Bỏ khỏi giỏ các món đã bán hết / không còn phục vụ
      const soldOut = [];
      for (const id of Object.keys(state.cart)) {
        const item = state.items.find((i) => i.id === Number(id));
        if (!item?.is_available) {
          if (item) soldOut.push(item.name);
          delete state.cart[id];
        }
      }
      if (soldOut.length) {
        storage.set(CART_KEY, state.cart);
        toast(`${soldOut.join(', ')} đã bán hết, đã bỏ khỏi giỏ`, 'error');
      }
      if (!state.categories.some((c) => c.slug === state.tab)) state.tab = state.categories[0]?.slug;
      renderTabs();
      renderMenu();
      renderCart();
    } catch (e) {
      if (!refresh && !quiet) $('menu-grid').innerHTML = `<div class="text-red-600">${esc(e.message)}</div>`;
    }
    if (!refresh) route(quiet);
  }

  // Khách tự gọi món (bật/tắt trong Cài đặt Admin); tắt thì chỉ xem thực đơn & góp ý
  function applyMode() {
    state.ordering = ONLINE ? state.settings.online_ordering === '1' : state.settings.customer_ordering === '1';
    const reward = state.settings.feedback_reward_enabled === '1';
    document.querySelectorAll('.reward-hint').forEach((el) => el.classList.toggle('hidden', !reward));
    $('reward-banner').classList.toggle('hidden', !reward);
    if (ONLINE && !state.ordering) {
      $('ordering-note').querySelector('div').innerHTML = '🙏 Quán tạm ngừng nhận đơn online. Vui lòng gọi điện cho quán để đặt món.';
    }
    if (!state.ordering && !ONLINE) {
      state.cart = {};
      $('no-table').querySelector('div').innerHTML = '📱 Vui lòng <b>quét mã QR trên bàn</b> để gửi góp ý nhận quà.';
    }
  }

  // Điều hướng giữa Trang chính / Menu / Góp ý theo hash (nút Back của điện thoại vẫn dùng được).
  // keepScroll = chỉ cập nhật bố cục, không cuộn trang / đóng bảng đang mở.
  function route(keepScroll = false) {
    if (keepScroll === true) return applyLayout(state.view);
    const hash = location.hash;
    const view = hash === '#gop-y' ? 'feedback' : hash === '#menu' || hash === '#don-da-dat' ? 'menu' : 'home';
    applyLayout(view);
    closeSheet();
    const showSide = view === 'menu' && state.ordering;
    if (hash === '#don-da-dat' && showSide) {
      if (window.innerWidth < 1024) openSheet('order-card');
      else $('order-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function applyLayout(view) {
    state.view = view;
    const inMenu = view === 'menu';
    const showSide = inMenu && state.ordering;
    $('home-view').classList.toggle('hidden', view !== 'home');
    $('main').classList.toggle('hidden', view === 'home');
    $('tabs-nav').classList.toggle('hidden', !inMenu);
    $('menu-section').classList.toggle('hidden', !inMenu);
    $('feedback-section').classList.toggle('hidden', view !== 'feedback');
    $('side').classList.toggle('hidden', !showSide);
    $('bottom-bar').classList.toggle('hidden', !showSide);
    $('main').classList.toggle('lg:grid', showSide);
    $('main').classList.toggle('pb-28', showSide);
    $('ordering-note').classList.toggle('hidden', !inMenu || state.ordering);
  }

  function renderTabs() {
    $('tabs').innerHTML = state.categories
      .map((c) => {
        const active = state.tab === c.slug;
        return `<button role="tab" data-tab="${esc(c.slug)}" aria-selected="${active}"
          class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition
          ${active ? 'bg-brand-700 text-white shadow' : 'bg-white text-brand-800 border border-cream-200 hover:bg-brand-50'}">${CATEGORY_ICON[c.slug] || ''} ${esc(c.name)}</button>`;
      })
      .join('');
  }

  function renderMenu() {
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
          ? `<img src="${esc(i.image_url)}" alt="${esc(i.name)}" loading="lazy" decoding="async" width="96" height="96" class="w-full h-full object-cover" />`
          : `<span class="text-4xl">${CATEGORY_ICON[cat.slug] || '🍽️'}</span>`;
        const soldOut = !i.is_available;
        return `<article class="rounded-2xl border shadow-sm p-3 flex gap-3 ${soldOut ? 'bg-stone-100 border-stone-200' : 'bg-white border-cream-200'}">
          <div class="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl bg-cream-100 overflow-hidden flex items-center justify-center ${soldOut ? 'grayscale opacity-60' : ''}">${img}</div>
          <div class="flex-1 min-w-0 flex flex-col">
            <h3 class="font-semibold leading-snug ${soldOut ? 'text-stone-400' : ''}">${esc(i.name)}</h3>
            ${i.description ? `<p class="text-xs text-stone-500 mt-0.5 line-clamp-2">${esc(i.description)}</p>` : ''}
            <div class="mt-auto flex items-center justify-between pt-2">
              <span class="font-bold ${soldOut ? 'text-stone-400 line-through' : 'text-clay-600'}">${money(i.price)}</span>
              ${soldOut ? '<span class="rounded-full bg-red-600 text-white text-xs font-bold px-3 py-1.5">Đã bán hết</span>' : qtyControl(i.id, qty)}
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
    btn.textContent = state.tableOk ? 'Đặt đơn' : 'Quét QR tại bàn để gọi món';
  }

  // Đặt online: đơn trước còn mở thì gọi thêm vào đơn đó, chưa có thì hiện form Tên / SĐT / Địa chỉ
  function submitClick() {
    if (!cartLines().length || !state.tableOk) return;
    if (ONLINE && !(state.mine && state.order?.status === 'open')) return openOnlineForm();
    submitOrder().catch(() => {});
  }

  function openOnlineForm() {
    const c = storage.get(CUSTOMER_KEY, {});
    $('ol-name').value = c.customer_name || '';
    $('ol-phone').value = c.customer_phone || '';
    $('ol-address').value = c.customer_address || '';
    const lines = cartLines();
    $('ol-summary').innerHTML =
      lines.map((l) => `<div class="flex justify-between"><span>${l.qty} × ${esc(l.item.name)}</span><span>${money(l.item.price * l.qty)}</span></div>`).join('') +
      `<div class="flex justify-between font-bold border-t border-cream-200 mt-1 pt-1"><span>Cộng</span><span>${money(lines.reduce((s, l) => s + l.item.price * l.qty, 0))}</span></div>`;
    $('online-modal').classList.remove('hidden');
    (c.customer_name ? $('ol-address') : $('ol-name')).focus();
  }

  async function submitOrder(customer = null) {
    const lines = cartLines();
    if (!lines.length || !state.tableOk) return;
    const btn = $('submit-order');
    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    try {
      const body = {
        note: $('order-note').value,
        items: lines.map((l) => ({ id: l.item.id, quantity: l.qty, note: l.note })),
      };
      // Đơn của mình còn mở -> gọi thêm vào đó; chưa có / đã thanh toán -> máy chủ tạo đơn mới (Bàn X-n hoặc đơn online)
      const mineOpen = state.order?.status === 'open' ? owner() : {};
      const res = ONLINE
        ? await api('/public/online-orders', { method: 'POST', body: { ...body, ...(customer || mineOpen) } })
        : await api('/public/orders', { method: 'POST', body: { ...body, table: tableNumber, ...mineOpen } });
      const order = res.order;
      state.mine = { id: order.id, token: res.token };
      storage.set(MINE_KEY, state.mine);
      state.cart = {};
      storage.set(CART_KEY, state.cart);
      $('order-note').value = '';
      state.order = order;
      renderMenu();
      renderCart();
      renderOrder();
      toast('Đã đặt đơn! Bạn có thể xem và sửa đơn bên dưới 🍗');
      $('order-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409) loadMenu(true);
      throw e;
    } finally {
      renderCart();
    }
  }

  async function submitOnlineForm(e) {
    e.preventDefault();
    const form = e.target;
    const customer = {
      customer_name: $('ol-name').value.trim(),
      customer_phone: $('ol-phone').value.trim(),
      customer_address: $('ol-address').value.trim(),
    };
    const btn = form.querySelector('button:not([type=button])');
    btn.disabled = true;
    try {
      await submitOrder(customer);
      storage.set(CUSTOMER_KEY, customer);
      $('online-modal').classList.add('hidden');
    } catch {
      /* lỗi đã được báo bằng toast, giữ form để khách sửa */
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Đơn đã đặt ----------
  async function loadOrder() {
    try {
      if (!state.mine) return renderOrder();
      const path = ONLINE ? '/public/online-orders/' : '/public/orders/';
      const { order } = await api(`${path}${state.mine.id}?token=${encodeURIComponent(state.mine.token)}`);
      state.order = order;
      renderOrder();
    } catch (e) {
      if (e.status === 404) {
        // Đơn không còn (bị xoá) -> quên đơn cũ, lần sau đặt đơn mới
        state.mine = null;
        state.order = null;
        storage.set(MINE_KEY, null);
        renderOrder();
      }
    }
  }

  function renderOrder() {
    const o = state.order;
    if (o && o.status !== 'open') return renderClosedOrder(o);
    const active = o ? o.items.filter((i) => i.status !== 'cancelled') : [];
    $('home-order').classList.toggle('hidden', !active.length);
    $('home-order-count').textContent = active.length ? `(${active.reduce((s, i) => s + i.quantity, 0)} món)` : '';
    if (!o || !o.items.length) {
      $('order-body').innerHTML = 'Chưa có món nào được đặt.';
      return;
    }
    const rows = o.items
      .map((i) => {
        const st = STATUS[i.status] || STATUS.pending;
        // Món "Đang chờ" (bếp chưa làm) khách được đổi số lượng / bỏ món; ly nước tặng (0đ) không sửa
        const editable = i.status === 'pending' && i.price > 0;
        const qty = editable
          ? `<div class="flex items-center gap-1.5 mt-1">
              <button data-oi="${i.id}" data-qty="${i.quantity - 1}" class="w-7 h-7 rounded-full border border-brand-700 text-brand-800 font-bold" aria-label="Bớt">−</button>
              <span class="w-5 text-center font-semibold">${i.quantity}</span>
              <button data-oi="${i.id}" data-qty="${i.quantity + 1}" class="w-7 h-7 rounded-full bg-brand-700 text-white font-bold" aria-label="Thêm" ${i.quantity >= 50 ? 'disabled' : ''}>+</button>
              <button data-oi="${i.id}" data-qty="0" class="ml-1 text-xs text-red-600 hover:underline">Bỏ món</button>
            </div>`
          : '';
        return `<div class="flex items-start gap-2 py-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-stone-800 ${i.status === 'cancelled' ? 'line-through text-stone-400' : ''}">${editable ? '' : i.quantity + ' × '}${esc(i.name)}</div>
            ${i.note ? `<div class="text-xs text-stone-500">${esc(i.note)}</div>` : ''}
            ${qty}
          </div>
          <span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}">${st.label}</span>
          <span class="shrink-0 w-20 text-right text-stone-700">${money(i.price * i.quantity)}</span>
        </div>`;
      })
      .join('');
    $('order-body').innerHTML = `
      ${ONLINE ? customerBlock(o) : ''}
      ${ONLINE ? '' : `<div class="inline-block rounded-full bg-brand-700 text-white text-sm font-bold px-3 py-1 mb-1">Đơn của bạn: ${esc(orderLabel(o))}</div>`}
      <div class="text-xs text-stone-400 mb-1">Đơn #${o.id} · Món "Đang chờ" có thể sửa số lượng hoặc bỏ. Muốn gọi thêm, chọn món ở Menu rồi bấm Đặt đơn.</div>
      <div class="divide-y divide-stone-100">${rows}</div>
      <div class="border-t border-stone-200 mt-2 pt-2 space-y-1 text-stone-700">
        <div class="flex justify-between"><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
        ${o.vat_percent ? `<div class="flex justify-between"><span>VAT (${o.vat_percent}%)</span><span>${money(o.vat_amount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-brand-800 text-base"><span>Tổng tạm tính</span><span>${money(o.total)}</span></div>
      </div>
      <p class="text-xs text-stone-400 mt-2">${
        ONLINE ? 'Quán sẽ gọi điện xác nhận và giao hàng. Thanh toán khi nhận hàng.' : 'Vui lòng thanh toán tại quầy thu ngân khi dùng bữa xong.'
      }</p>`;
  }

  function customerBlock(o) {
    return `<div class="rounded-xl bg-cream-100 px-3 py-2 mb-2 text-xs text-stone-700">
      🛵 Giao đến: <b>${esc(o.customer_name)}</b> · ${esc(o.customer_phone)}<br />${esc(o.customer_address)}</div>`;
  }

  // Đơn của khách đã thanh toán / đã huỷ: chỉ xem, lần đặt sau sẽ tạo đơn mới
  function renderClosedOrder(o) {
    $('home-order').classList.add('hidden');
    const paid = o.status === 'paid';
    $('order-body').innerHTML = `
      <div class="rounded-xl px-3 py-2 mb-2 text-sm font-semibold ${paid ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}">
        ${paid ? '✅ ' + esc(ONLINE ? 'Đơn #' + o.id : orderLabel(o)) + ' đã hoàn tất. Cảm ơn bạn đã đặt món tại LaLiDa!' : '❌ ' + esc(ONLINE ? 'Đơn #' + o.id : orderLabel(o)) + ' đã bị huỷ.'}
      </div>
      <div class="text-sm text-stone-600">${o.items
        .filter((i) => i.status !== 'cancelled')
        .map((i) => `${i.quantity} × ${esc(i.name)}`)
        .join('<br />')}</div>
      ${paid ? `<div class="font-bold text-brand-800 mt-2">Tổng: ${money(o.total)}</div>` : ''}
      <p class="text-xs text-stone-400 mt-2">Chọn món ở Menu rồi bấm Đặt đơn để đặt đơn mới.</p>`;
  }

  async function editOrderItem(btn) {
    const quantity = Number(btn.dataset.qty);
    if (quantity === 0 && !confirm('Bỏ món này khỏi đơn?')) return;
    btn.disabled = true;
    try {
      const { order } = await api(`/public/order-items/${btn.dataset.oi}`, { method: 'PATCH', body: { ...owner(), quantity } });
      state.order = order;
      renderOrder();
      toast(quantity === 0 ? 'Đã bỏ món khỏi đơn' : 'Đã cập nhật số lượng');
    } catch (e) {
      toast(e.message, 'error');
      loadOrder();
    }
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
        body: {
          rating: state.rating,
          content: $('fb-content').value,
          customer_name: $('fb-name').value,
          ...(ONLINE ? {} : { table: tableNumber }),
          ...owner(),
        },
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
    } else if (t.dataset.oi) editOrderItem(t);
    else if (t.dataset.add) changeQty(t.dataset.add, 1);
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
  $('submit-order').addEventListener('click', submitClick);
  $('online-form').addEventListener('submit', submitOnlineForm);
  $('online-cancel').addEventListener('click', () => $('online-modal').classList.add('hidden'));
  $('feedback-form').addEventListener('submit', submitFeedback);
  $('open-cart').addEventListener('click', () => openSheet('cart-card'));
  $('open-order').addEventListener('click', () => openSheet('order-card'));
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', closeSheet);
  window.addEventListener('hashchange', route);

  renderStars();
  renderVouchers();
  renderCart();
  const shownCached = showCachedMenu();
  loadMenu(false, shownCached).then(initTable); // đã hiện bản lưu trên máy -> cập nhật lặng lẽ, không cuộn lại trang
  setInterval(() => loadMenu(true), 30000);
  window.LLOrderReady = true; // báo cho đoạn dự phòng trong order.html là script đã chạy
})();
