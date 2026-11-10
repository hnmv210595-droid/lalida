// Service worker của trang quản trị LaLiDa: nhận thông báo đẩy khi khách đặt đơn và hiện thông báo
// có âm thanh / rung của hệ điều hành - kể cả khi màn hình tắt hoặc đã đóng trang quản trị.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function describe(o) {
  if (!o) return { title: '🔔 LaLiDa: Có đơn mới', body: 'Mở trang quản trị để xem đơn.' };
  const qty = o.quantity ? ` · ${o.quantity} món` : '';
  if (o.order_type === 'online') {
    return { title: '🛵 Đơn online mới!', body: `${o.customer_name || 'Khách'}${qty} - mở để xem và gọi xác nhận` };
  }
  const label = `Bàn ${o.table_number}${o.guest_no ? '-' + o.guest_no : ''}`;
  return { title: `🍽️ ${label} gọi món`, body: `${o.batch} món mới${qty ? ` (tổng${qty})` : ''}` };
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let order = null;
      try {
        const res = await fetch('/api/admin/notifications/latest', { credentials: 'include', cache: 'no-store' });
        if (res.ok) order = (await res.json()).order;
      } catch {
        /* chưa đăng nhập / mất mạng: hiện thông báo chung */
      }
      const { title, body } = describe(order);
      // Trang quản trị đang mở -> báo để trang phát chuông và tải lại đơn ngay
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      tabs.forEach((c) => c.postMessage({ type: 'new-order' }));
      await self.registration.showNotification(title, {
        body,
        icon: '/assets/favicon.png',
        badge: '/assets/favicon.png',
        tag: 'lalida-order',
        renotify: true, // đơn mới thay thông báo cũ nhưng vẫn kêu / rung lại
        requireInteraction: true, // máy tính: giữ thông báo trên màn hình đến khi bấm
        vibrate: [300, 150, 300, 150, 300],
        data: { url: '/admin' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const admin = tabs.find((c) => new URL(c.url).pathname.startsWith('/admin'));
      if (admin) return admin.focus();
      return self.clients.openWindow(url);
    })()
  );
});
