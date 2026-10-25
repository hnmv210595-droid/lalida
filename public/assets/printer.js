// In hoá đơn: (1) trình duyệt window.print() khổ 58/80mm, (2) máy in nhiệt Bluetooth (ESC/POS qua Web Bluetooth)
window.LLPrint = (() => {
  const { money, esc, vnDateTime } = window.LL;
  const PAY_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ' };

  function activeItems(order) {
    return order.items.filter((i) => i.status !== 'cancelled');
  }

  // ---------- In qua trình duyệt ----------
  function billHtml(order, s) {
    const w = s.paper_width === '58' ? '58' : '80';
    const rows = activeItems(order)
      .map(
        (i) => `<tr><td colspan="3">${esc(i.name)}</td></tr>
        <tr><td>${i.quantity} x ${money(i.price)}</td><td></td><td class="r">${money(i.price * i.quantity)}</td></tr>`
      )
      .join('');
    return `<div class="bill w${w}">
      <img src="/assets/logo.webp" alt="LaLiDa" />
      <div class="c b">${esc(s.shop_name || 'LaLiDa')}</div>
      <div class="c">${esc(s.shop_slogan || '')}</div>
      <div class="c">${esc(s.shop_address || '')}</div>
      <div class="c">ĐT: ${esc(s.shop_phone || '')}</div>
      <hr />
      <div class="c b">HOÁ ĐƠN BÁN HÀNG</div>
      <div>Số HĐ: #${order.id} &nbsp; Bàn: ${order.table_number}</div>
      <div>Giờ vào: ${vnDateTime(order.created_at)}</div>
      ${order.paid_at ? `<div>Thanh toán: ${vnDateTime(order.paid_at)}</div>` : '<div><i>(Phiếu tạm tính)</i></div>'}
      <hr />
      <table>${rows}</table>
      <hr />
      <table>
        <tr><td>Tạm tính</td><td class="r">${money(order.subtotal)}</td></tr>
        ${order.vat_percent ? `<tr><td>VAT (${order.vat_percent}%)</td><td class="r">${money(order.vat_amount)}</td></tr>` : ''}
        <tr class="b"><td>TỔNG CỘNG</td><td class="r">${money(order.total)}</td></tr>
        ${order.payment_method ? `<tr><td>Hình thức</td><td class="r">${PAY_LABEL[order.payment_method] || ''}</td></tr>` : ''}
      </table>
      <hr />
      <div class="c">${esc(s.bill_footer || 'Cảm ơn quý khách!')}</div>
      <div class="c" style="margin-top:2px">lalida.net</div>
    </div>`;
  }

  // In nội dung HTML với khổ giấy chỉ định ('58mm' | '80mm' | 'A4')
  function printHtml(html, pageSize) {
    const area = document.getElementById('print-area');
    area.innerHTML = html;
    let style = document.getElementById('page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-style';
      document.head.appendChild(style);
    }
    style.textContent = pageSize === 'A4' ? '@page { size: A4; margin: 10mm; }' : `@page { size: ${pageSize} auto; margin: 0; }`;
    const imgs = [...area.querySelectorAll('img')].filter((img) => !img.complete);
    Promise.race([
      Promise.all(imgs.map((img) => new Promise((r) => (img.onload = img.onerror = r)))),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(() => window.print());
  }

  function printBill(order, settings) {
    printHtml(billHtml(order, settings), settings.paper_width === '58' ? '58mm' : '80mm');
  }

  // ---------- Máy in Bluetooth ESC/POS ----------
  // Dịch vụ GATT phổ biến của máy in nhiệt Bluetooth giá rẻ
  const SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
  ];
  const bt = { device: null, char: null };

  const supported = () => 'bluetooth' in navigator;
  const connected = () => !!(bt.char && bt.device?.gatt?.connected);

  async function connect() {
    if (!supported()) throw new Error('Trình duyệt không hỗ trợ Web Bluetooth (dùng Chrome trên Android/Windows/macOS)');
    bt.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const server = await bt.device.gatt.connect();
    for (const service of await server.getPrimaryServices()) {
      for (const c of await service.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          bt.char = c;
          return bt.device.name || 'Máy in';
        }
      }
    }
    throw new Error('Không tìm thấy cổng ghi dữ liệu trên máy in này');
  }

  // Máy in nhiệt thường không có font tiếng Việt: chuyển về không dấu
  const plain = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^\x20-\x7E]/g, '');

  function escposBill(order, s) {
    const cols = s.paper_width === '58' ? 32 : 48;
    const out = [];
    const enc = new TextEncoder();
    const cmd = (...b) => out.push(...b);
    const text = (t) => out.push(...enc.encode(plain(t) + '\n'));
    const lr = (l, r) => {
      l = plain(l);
      r = plain(r);
      const space = Math.max(1, cols - l.length - r.length);
      text(l.length + r.length + 1 > cols ? `${l}\n${' '.repeat(Math.max(0, cols - r.length))}${r}` : l + ' '.repeat(space) + r);
    };
    const line = () => text('-'.repeat(cols));
    const m = (n) => money(n).replace('đ', 'd');

    cmd(0x1b, 0x40); // khởi tạo
    cmd(0x1b, 0x61, 1); // căn giữa
    cmd(0x1d, 0x21, 0x11); // chữ to
    text(s.shop_name || 'LaLiDa');
    cmd(0x1d, 0x21, 0x00);
    text(s.shop_slogan || '');
    if (s.shop_address) text(s.shop_address);
    if (s.shop_phone) text('DT: ' + s.shop_phone);
    line();
    cmd(0x1b, 0x45, 1);
    text('HOA DON BAN HANG');
    cmd(0x1b, 0x45, 0);
    cmd(0x1b, 0x61, 0); // căn trái
    text(`So HD: #${order.id}   Ban: ${order.table_number}`);
    text('Gio vao: ' + vnDateTime(order.created_at));
    text(order.paid_at ? 'Thanh toan: ' + vnDateTime(order.paid_at) : '(Phieu tam tinh)');
    line();
    for (const i of activeItems(order)) {
      text(i.name);
      lr(`  ${i.quantity} x ${m(i.price)}`, m(i.price * i.quantity));
    }
    line();
    lr('Tam tinh', m(order.subtotal));
    if (order.vat_percent) lr(`VAT (${order.vat_percent}%)`, m(order.vat_amount));
    cmd(0x1b, 0x45, 1);
    lr('TONG CONG', m(order.total));
    cmd(0x1b, 0x45, 0);
    if (order.payment_method) lr('Hinh thuc', PAY_LABEL[order.payment_method] || '');
    line();
    cmd(0x1b, 0x61, 1);
    text(s.bill_footer || 'Cam on quy khach!');
    text('lalida.net');
    cmd(0x1b, 0x64, 4); // đẩy giấy
    cmd(0x1d, 0x56, 0x42, 0x00); // cắt giấy (nếu máy hỗ trợ)
    return new Uint8Array(out);
  }

  async function printBluetooth(order, settings) {
    if (!connected()) await connect();
    const data = escposBill(order, settings);
    for (let i = 0; i < data.length; i += 100) {
      const chunk = data.slice(i, i + 100);
      if (bt.char.properties.writeWithoutResponse) await bt.char.writeValueWithoutResponse(chunk);
      else await bt.char.writeValue(chunk);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { printBill, printHtml, printBluetooth, connect, connected, supported, PAY_LABEL };
})();
