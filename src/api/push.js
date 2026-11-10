// Thông báo đẩy (Web Push) tới máy của nhân viên khi khách đặt đơn - kêu cả khi tắt màn hình / đóng trang.
// Gửi "push không kèm nội dung" nên không cần mã hoá; chỉ ký VAPID (ES256) bằng WebCrypto.
// Service worker (public/sw.js) nhận push rồi tự hỏi /api/admin/notifications/latest để hiện nội dung đơn.
// Cặp khoá VAPID tự tạo lần đầu và lưu trong bảng settings (khoá riêng không bao giờ trả ra ngoài).

const VAPID_KEY = 'vapid_keys';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

async function vapidKeys(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(VAPID_KEY).first();
  if (row) return JSON.parse(row.value);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = { jwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)) };
  // Hai yêu cầu cùng lúc: chỉ bản ghi đầu tiên được lưu, đọc lại để mọi nơi dùng chung một cặp khoá
  await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(VAPID_KEY, JSON.stringify(keys)).run();
  return JSON.parse((await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(VAPID_KEY).first()).value);
}

export async function vapidPublicKey(env) {
  return (await vapidKeys(env)).pub;
}

async function vapidAuth(keys, endpoint, subject) {
  const key = await crypto.subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64urlText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64urlText(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${keys.pub}`;
}

// Gửi tới mọi máy đã bật thông báo; máy đã huỷ đăng ký (404/410) thì xoá khỏi danh sách
export async function notifyStaff(env, subject = 'https://lalida.net') {
  const { results } = await env.DB.prepare('SELECT id, endpoint FROM push_subscriptions').all();
  if (!results.length) return;
  const keys = await vapidKeys(env);
  await Promise.all(
    results.map(async (s) => {
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          headers: { authorization: await vapidAuth(keys, s.endpoint, subject), ttl: '3600', urgency: 'high', 'content-length': '0' },
        });
        if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
      } catch {
        /* lỗi mạng tạm thời: bỏ qua, lần đặt đơn sau gửi lại */
      }
    })
  );
}
