// Phát ảnh món ăn từ Cloudflare R2: /images/menu/<id>-<thời điểm>.webp
// Mỗi lần tải ảnh mới có tên mới -> cho trình duyệt và CDN lưu 1 năm.
export async function onRequestGet({ request, env, params, waitUntil }) {
  const key = (params.path || []).join('/');
  if (!/^menu\/[\w-]+\.(webp|jpg)$/.test(key) || !env.IMAGES) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const res = new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
    },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
