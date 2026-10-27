// Trang công khai cho Google (SEO): Trang chủ, Về chúng tôi, Điều khoản, Bài viết, sitemap.xml.
// Dựng HTML ngay trên máy chủ (Google đọc được toàn bộ nội dung, không cần chạy JavaScript),
// thông tin quán lấy từ Cài đặt trong trang quản trị. HTML được lưu ở bộ nhớ đệm Cloudflare 5 phút
// và được xoá khi lưu Cài đặt / sửa Thực đơn (purgeSitePages).
import { getSettings } from '../api/store.js';
import { ARTICLES } from './articles.js';

const SITE = 'https://lalida.net';
const ASSET_V = '20261027c';
const CACHE_TTL = 300;
// Giá trị mẫu trong seed.sql - chưa nhập thật thì không hiện ra trang công khai
const PLACEHOLDERS = ['Địa chỉ quán', '0900 000 000'];

export const SITE_PATHS = ['/', '/ve-chung-toi', '/dieu-khoan', '/bai-viet', '/sitemap.xml', ...ARTICLES.map((a) => `/bai-viet/${a.slug}`)];

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
const viDate = (d) => d.split('-').reverse().join('/');
const ldJson = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function shopInfo(s) {
  const val = (k) => {
    const v = String(s[k] ?? '').trim();
    return PLACEHOLDERS.includes(v) ? '' : v;
  };
  const url = (k) => (/^https:\/\/\S+$/.test(val(k)) ? val(k) : '');
  return {
    name: val('shop_name') || 'LaLiDa - Cơm Gà',
    slogan: val('shop_slogan') || 'Gà ba nuôi - Cơm mẹ nấu',
    address: val('shop_address'),
    phone: val('shop_phone'),
    email: val('shop_email'),
    hours: val('opening_hours'),
    intro: val('shop_intro'),
    facebook: url('shop_facebook'),
    map: url('shop_map_url'),
    verification: val('google_site_verification'),
    base: SITE,
  };
}

// "10:00 - 21:00" -> "Mo-Su 10:00-21:00" (định dạng giờ mở cửa của schema.org); giờ ghi kiểu khác thì bỏ qua
function schemaHours(hours) {
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(hours);
  return m ? `Mo-Su ${m[1].padStart(2, '0')}:${m[2]}-${m[3].padStart(2, '0')}:${m[4]}` : null;
}

function restaurantLd(shop) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${shop.base}/#restaurant`,
    name: shop.name,
    slogan: shop.slogan,
    description: shop.intro || `${shop.name} - quán cơm gà Tam Kỳ: ${shop.slogan}.`,
    url: `${shop.base}/`,
    logo: `${shop.base}/assets/icon-512.png`,
    image: `${shop.base}/assets/og-image.jpg`,
    servesCuisine: ['Cơm gà Tam Kỳ', 'Món Việt'],
    hasMenu: `${shop.base}/online`,
    priceRange: '₫',
  };
  if (shop.phone) data.telephone = shop.phone;
  if (shop.email) data.email = shop.email;
  if (shop.address) data.address = { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'VN' };
  if (schemaHours(shop.hours)) data.openingHours = schemaHours(shop.hours);
  const same = [shop.facebook, shop.map].filter(Boolean);
  if (same.length) data.sameAs = same;
  return data;
}

const NAV = [
  ['/', 'Trang chủ'],
  ['/online', 'Thực đơn'],
  ['/bai-viet', 'Bài viết'],
  ['/ve-chung-toi', 'Về chúng tôi'],
];

function layout(shop, { path, title, description, body, ld = [], type = 'website', robots = 'index, follow, max-image-preview:large' }) {
  const canonical = `${shop.base}${path}`;
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const link = (cls) => ([href, label]) =>
    `<a href="${href}" class="${cls} ${active(href) ? 'bg-brand-700 text-white' : 'text-brand-800 hover:bg-cream-200'}">${label}</a>`;
  const contact = [
    shop.address && `<li>📍 ${esc(shop.address)}</li>`,
    shop.phone && `<li>📞 <a href="tel:${esc(shop.phone.replace(/[^\d+]/g, ''))}" class="underline">${esc(shop.phone)}</a></li>`,
    shop.email && `<li>✉️ <a href="mailto:${esc(shop.email)}" class="underline">${esc(shop.email)}</a></li>`,
    shop.hours && `<li>🕒 ${esc(shop.hours)}</li>`,
    shop.facebook && `<li>👍 <a href="${esc(shop.facebook)}" rel="noopener" target="_blank" class="underline">Facebook</a></li>`,
    shop.map && `<li>🗺️ <a href="${esc(shop.map)}" rel="noopener" target="_blank" class="underline">Chỉ đường (Google Maps)</a></li>`,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="${robots}" />
  <link rel="canonical" href="${esc(canonical)}" />
  ${shop.verification ? `<meta name="google-site-verification" content="${esc(shop.verification)}" />` : ''}
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="${esc(shop.name)}" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${shop.base}/assets/og-image.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#3b512a" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/png" href="/assets/favicon.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
  <link rel="stylesheet" href="/assets/app.css?v=${ASSET_V}" />
  ${ld.map(ldJson).join('\n  ')}
</head>
<body class="bg-cream-50 text-stone-800 font-sans min-h-screen flex flex-col">
  <header class="sticky top-0 z-30 bg-cream-100/95 backdrop-blur border-b border-cream-200 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
      <a href="/" class="shrink-0" aria-label="Trang chủ ${esc(shop.name)}">
        <img src="/assets/logo.webp" alt="LaLiDa - Gà ba nuôi - Cơm mẹ nấu" width="283" height="256" class="h-14 sm:h-16 w-auto" />
      </a>
      <nav class="hidden md:flex items-center gap-1 ml-2 text-sm font-semibold">${NAV.map(link('rounded-full px-3 py-1.5')).join('')}</nav>
      <a href="/online" class="btn btn-primary ml-auto whitespace-nowrap">🛵 Đặt món online</a>
    </div>
    <nav class="md:hidden flex gap-1 overflow-x-auto no-scrollbar px-4 pb-2 text-sm font-semibold">${NAV.map(link('rounded-full px-3 py-1 whitespace-nowrap')).join('')}</nav>
  </header>

  <main class="flex-1">${body}</main>

  <footer class="bg-brand-800 text-cream-100 mt-12">
    <div class="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-3 text-sm">
      <div>
        <div class="text-lg font-bold text-white">${esc(shop.name)}</div>
        <p class="italic mt-1">${esc(shop.slogan)}</p>
        <p class="mt-3 text-cream-200">Quán cơm gà Tam Kỳ gia đình - gà nhà nuôi, cơm nấu bằng nước luộc gà, gỏi và tương ớt làm mỗi ngày.</p>
      </div>
      <div>
        <div class="font-semibold text-white mb-2">Liên hệ</div>
        <ul class="space-y-1.5">${contact.join('') || '<li>Thông tin đang được cập nhật.</li>'}</ul>
      </div>
      <div>
        <div class="font-semibold text-white mb-2">Liên kết</div>
        <ul class="space-y-1.5">
          <li><a href="/online" class="underline">Thực đơn &amp; đặt món online</a></li>
          <li><a href="/bai-viet" class="underline">Bài viết về cơm gà Tam Kỳ</a></li>
          <li><a href="/ve-chung-toi" class="underline">Về chúng tôi</a></li>
          <li><a href="/dieu-khoan" class="underline">Điều khoản &amp; điều kiện</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-brand-700 py-4 text-center text-xs text-cream-200">© ${new Date().getFullYear()} ${esc(shop.name)} · ${esc(shop.slogan)}</div>
  </footer>
</body>
</html>`;
}

const articleCard = (a) => `
  <a href="/bai-viet/${a.slug}" class="card p-5 block hover:shadow-md transition-shadow">
    <div class="text-xs text-stone-500">${viDate(a.date)} · ${a.minutes} phút đọc</div>
    <h3 class="font-bold text-brand-800 text-lg mt-1 leading-snug">${esc(a.title)}</h3>
    <p class="text-sm text-stone-600 mt-2">${esc(a.excerpt)}</p>
    <span class="inline-block mt-3 text-sm font-semibold text-clay-600">Đọc tiếp →</span>
  </a>`;

const breadcrumbLd = (shop, items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${shop.base}${path}` })),
});

// ===================== TRANG CHỦ =====================
async function homePage(env) {
  const [cats, items, settings] = await env.DB.batch([
    env.DB.prepare('SELECT id, name FROM categories ORDER BY sort_order, id'),
    env.DB.prepare('SELECT category_id, name, description, price, image_url FROM menu_items ORDER BY sort_order, id'),
    env.DB.prepare('SELECT key, value FROM settings'),
  ]);
  const shop = shopInfo(Object.fromEntries(settings.results.map((r) => [r.key, r.value])));
  const menu = cats.results
    .map((c) => {
      const list = items.results.filter((i) => i.category_id === c.id);
      if (!list.length) return '';
      return `
      <div>
        <h3 class="font-bold text-brand-800 text-lg mb-3">${esc(c.name)}</h3>
        <ul class="grid sm:grid-cols-2 gap-3">${list
          .map(
            (i) => `
          <li class="card p-3 flex gap-3 items-center">
            ${i.image_url ? `<img src="${esc(i.image_url)}" alt="${esc(i.name)} - cơm gà LaLiDa" width="72" height="72" loading="lazy" class="w-[72px] h-[72px] rounded-xl object-cover shrink-0" />` : ''}
            <div class="min-w-0 flex-1">
              <div class="font-semibold">${esc(i.name)}</div>
              ${i.description ? `<div class="text-xs text-stone-500 mt-0.5">${esc(i.description)}</div>` : ''}
            </div>
            <div class="font-bold text-clay-600 whitespace-nowrap">${money(i.price)}</div>
          </li>`
          )
          .join('')}
        </ul>
      </div>`;
    })
    .join('');

  const intro =
    shop.intro ||
    'LaLiDa là quán cơm gà Tam Kỳ mang hương vị bữa cơm gia đình: gà ta nhà nuôi luộc vừa tới, cơm vàng thơm nấu bằng nước luộc gà, gỏi gà rau răm, đồ chua và tương ớt làm mỗi ngày.';
  const body = `
  <section class="bg-gradient-to-b from-cream-100 to-cream-50">
    <div class="max-w-6xl mx-auto px-4 py-10 md:py-16 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <p class="text-clay-600 font-semibold">${esc(shop.slogan)}</p>
        <h1 class="text-3xl md:text-5xl font-bold text-brand-800 leading-tight mt-2">Cơm gà Tam Kỳ LaLiDa</h1>
        <p class="mt-4 text-lg text-stone-700">${esc(intro)}</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a href="/online" class="btn btn-primary !px-6 !py-3 !text-base">🍗 Xem thực đơn &amp; đặt món</a>
          ${shop.phone ? `<a href="tel:${esc(shop.phone.replace(/[^\d+]/g, ''))}" class="btn btn-ghost !px-6 !py-3 !text-base">📞 ${esc(shop.phone)}</a>` : ''}
        </div>
        ${shop.address ? `<p class="mt-4 text-sm text-stone-600">📍 ${esc(shop.address)}${shop.hours ? ` · 🕒 ${esc(shop.hours)}` : ''}</p>` : ''}
      </div>
      <img src="/assets/logo-lg.webp" alt="Logo LaLiDa - Gà ba nuôi, Cơm mẹ nấu - cơm gà Tam Kỳ" width="531" height="480" class="w-full max-w-md mx-auto h-auto" />
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-4 py-10">
    <h2 class="text-2xl font-bold text-brand-800 text-center">Vì sao chọn cơm gà LaLiDa?</h2>
    <div class="grid md:grid-cols-3 gap-4 mt-6">
      <div class="card p-5"><div class="text-3xl">🐓</div><h3 class="font-bold text-brand-800 mt-2">Gà ba nuôi</h3><p class="text-sm text-stone-600 mt-1">Gà ta được chăm kỹ, thịt săn chắc, da vàng giòn, ngọt tự nhiên - đúng chất cơm gà Tam Kỳ.</p></div>
      <div class="card p-5"><div class="text-3xl">🍚</div><h3 class="font-bold text-brand-800 mt-2">Cơm mẹ nấu</h3><p class="text-sm text-stone-600 mt-1">Cơm nấu bằng nước luộc gà, vàng thơm, tơi hạt như bữa cơm ở nhà.</p></div>
      <div class="card p-5"><div class="text-3xl">🌶️</div><h3 class="font-bold text-brand-800 mt-2">Làm mới mỗi ngày</h3><p class="text-sm text-stone-600 mt-1">Gỏi gà rau răm, đồ chua, tương ớt và canh nóng chuẩn bị trong ngày.</p></div>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-4 py-6">
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <h2 class="text-2xl font-bold text-brand-800">Thực đơn cơm gà LaLiDa</h2>
      <a href="/online" class="text-sm font-semibold text-clay-600">Đặt món ngay →</a>
    </div>
    <div class="space-y-8 mt-6">${menu || '<p class="text-stone-500">Thực đơn đang được cập nhật.</p>'}</div>
  </section>

  <section class="max-w-6xl mx-auto px-4 py-10">
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <h2 class="text-2xl font-bold text-brand-800">Chuyện cơm gà Tam Kỳ</h2>
      <a href="/bai-viet" class="text-sm font-semibold text-clay-600">Tất cả bài viết →</a>
    </div>
    <div class="grid md:grid-cols-3 gap-4 mt-6">${ARTICLES.map(articleCard).join('')}</div>
  </section>

  <section class="max-w-6xl mx-auto px-4">
    <div class="card p-6 md:p-8 bg-brand-50 text-center">
      <h2 class="text-2xl font-bold text-brand-800">Góp ý được tặng 1 ly nước cho hoá đơn lần sau</h2>
      <p class="mt-2 text-stone-600">Quét mã QR tại bàn hoặc vào trang đặt món, chọn <b>Góp ý &amp; Phản hồi</b> để gửi ý kiến cho LaLiDa.</p>
      <a href="/online#gop-y" class="btn btn-accent mt-4 inline-block">💬 Gửi góp ý</a>
    </div>
  </section>`;

  const websiteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: shop.name, alternateName: 'LaLiDa', url: `${shop.base}/`, inLanguage: 'vi' };
  return layout(shop, {
    path: '/',
    title: 'Cơm gà Tam Kỳ LaLiDa - Gà ba nuôi, Cơm mẹ nấu | Đặt cơm gà online',
    description:
      'LaLiDa - quán cơm gà Tam Kỳ: gà ta nhà nuôi, cơm vàng nấu nước luộc gà, gỏi gà rau răm, tương ớt. Xem thực đơn, gọi món bằng mã QR và đặt cơm gà online tại lalida.net.',
    body,
    ld: [restaurantLd(shop), websiteLd],
  });
}

// ===================== VỀ CHÚNG TÔI =====================
async function aboutPage(env) {
  const shop = shopInfo(await getSettings(env));
  const row = (label, value) => (value ? `<div class="py-2 grid grid-cols-3 gap-3 border-b border-cream-200 last:border-0"><dt class="text-stone-500">${label}</dt><dd class="col-span-2 font-medium">${value}</dd></div>` : '');
  const body = `
  <article class="max-w-3xl mx-auto px-4 py-10">
    <h1 class="text-3xl md:text-4xl font-bold text-brand-800">Về chúng tôi</h1>
    <p class="text-clay-600 font-semibold mt-2">${esc(shop.name)} · ${esc(shop.slogan)}</p>
    <div class="prose-lalida mt-6">
      ${shop.intro ? `<p>${esc(shop.intro)}</p>` : ''}
      <p><strong>LaLiDa</strong> là quán <strong>cơm gà Tam Kỳ</strong> do một gia đình cùng nhau gầy dựng. Câu slogan "<em>Gà ba nuôi – Cơm mẹ nấu</em>" là lời hứa của quán: gà ta được chăm kỹ, cơm được nấu bằng cả tấm lòng như bữa cơm ở nhà.</p>
      <h2>Điều chúng tôi theo đuổi</h2>
      <ul>
        <li><strong>Nguyên liệu tươi:</strong> gà ta, rau thơm và đồ chua được chuẩn bị mỗi ngày.</li>
        <li><strong>Đúng vị cơm gà Tam Kỳ:</strong> cơm vàng nấu nước luộc gà, gỏi gà rau răm, tương ớt cay nồng và chén canh nóng.</li>
        <li><strong>Phục vụ nhanh, rõ ràng:</strong> mỗi bàn có mã QR để gọi món, giá niêm yết trên thực đơn, hoá đơn in rõ từng món.</li>
        <li><strong>Lắng nghe khách hàng:</strong> mỗi góp ý đều được đọc kỹ - và khách góp ý được tặng 1 ly nước cho lần sau.</li>
      </ul>
      <h2>Thông tin quán</h2>
    </div>
    <dl class="card p-5 mt-4 text-sm">
      ${row('Tên quán', esc(shop.name))}
      ${row('Slogan', esc(shop.slogan))}
      ${row('Địa chỉ', esc(shop.address))}
      ${row('Điện thoại', shop.phone && `<a href="tel:${esc(shop.phone.replace(/[^\d+]/g, ''))}" class="text-brand-700 underline">${esc(shop.phone)}</a>`)}
      ${row('Email', shop.email && `<a href="mailto:${esc(shop.email)}" class="text-brand-700 underline">${esc(shop.email)}</a>`)}
      ${row('Giờ mở cửa', esc(shop.hours))}
      ${row('Facebook', shop.facebook && `<a href="${esc(shop.facebook)}" rel="noopener" target="_blank" class="text-brand-700 underline">${esc(shop.facebook.replace(/^https:\/\/(www\.)?/, ''))}</a>`)}
      ${row('Bản đồ', shop.map && `<a href="${esc(shop.map)}" rel="noopener" target="_blank" class="text-brand-700 underline">Xem chỉ đường trên Google Maps</a>`)}
      ${row('Website', `<a href="${shop.base}/" class="text-brand-700 underline">${shop.base.replace(/^https:\/\//, '')}</a>`)}
    </dl>
    <div class="mt-8 flex flex-wrap gap-3">
      <a href="/online" class="btn btn-primary">🍗 Xem thực đơn &amp; đặt món</a>
      <a href="/bai-viet/com-ga-lalida-ga-ba-nuoi-com-me-nau" class="btn btn-ghost">Câu chuyện cơm gà LaLiDa</a>
    </div>
  </article>`;
  return layout(shop, {
    path: '/ve-chung-toi',
    title: `Về chúng tôi - ${shop.name} | Quán cơm gà Tam Kỳ gia đình`,
    description: `Giới thiệu ${shop.name} - quán cơm gà Tam Kỳ gia đình "${shop.slogan}". Địa chỉ, số điện thoại, giờ mở cửa và cách đặt món.`,
    body,
    ld: [
      { '@context': 'https://schema.org', '@type': 'AboutPage', name: `Về chúng tôi - ${shop.name}`, url: `${shop.base}/ve-chung-toi`, about: { '@id': `${shop.base}/#restaurant` } },
      restaurantLd(shop),
      breadcrumbLd(shop, [['Trang chủ', '/'], ['Về chúng tôi', '/ve-chung-toi']]),
    ],
  });
}

// ===================== ĐIỀU KHOẢN & ĐIỀU KIỆN =====================
async function termsPage(env) {
  const s = await getSettings(env);
  const shop = shopInfo(s);
  const vat = s.vat_enabled === '1' ? `Giá chưa gồm thuế VAT; VAT ${esc(s.vat_percent || '0')}% được cộng vào hoá đơn.` : 'Giá trên thực đơn là giá bán cuối cùng.';
  const contact = [shop.phone && `điện thoại ${esc(shop.phone)}`, shop.email && `email ${esc(shop.email)}`, shop.address && `địa chỉ ${esc(shop.address)}`].filter(Boolean).join(', ');
  const body = `
  <article class="max-w-3xl mx-auto px-4 py-10">
    <h1 class="text-3xl md:text-4xl font-bold text-brand-800">Điều khoản &amp; điều kiện</h1>
    <p class="text-sm text-stone-500 mt-2">Áp dụng cho website ${shop.base.replace(/^https:\/\//, '')} và dịch vụ gọi món, đặt món của ${esc(shop.name)}.</p>
    <div class="prose-lalida mt-6">
      <h2>1. Phạm vi áp dụng</h2>
      <p>Khi sử dụng website, quét mã QR tại bàn hoặc đặt món online, bạn đồng ý với các điều khoản dưới đây. ${esc(shop.name)} có thể cập nhật điều khoản khi cần; phiên bản mới có hiệu lực ngay khi đăng trên trang này.</p>

      <h2>2. Gọi món tại bàn bằng mã QR</h2>
      <ul>
        <li>Mỗi lần quét mã QR tạo một đơn riêng cho bàn (ví dụ Bàn 1-1, Bàn 1-2), giúp nhiều nhóm khách ngồi chung bàn gọi món độc lập.</li>
        <li>Bạn có thể xem trạng thái và sửa số lượng các món <strong>chưa được bếp chế biến</strong>. Món đã làm hoặc đã lên bàn không thể huỷ trên website; vui lòng báo nhân viên nếu có sai sót.</li>
        <li>Món hiển thị "Đã bán hết" tạm thời không thể đặt.</li>
      </ul>

      <h2>3. Đặt món online</h2>
      <ul>
        <li>Khi đặt online, bạn cần cung cấp <strong>họ tên, số điện thoại và địa chỉ</strong> chính xác để quán xác nhận và giao/chuẩn bị món.</li>
        <li>Đơn chỉ được chuẩn bị sau khi quán xác nhận. Quán có quyền từ chối hoặc huỷ đơn khi không liên hệ được với khách, thông tin không chính xác hoặc hết món.</li>
        <li>Để tránh đơn ảo, mỗi thiết bị/mạng chỉ được gửi số lượng đơn giới hạn trong một khoảng thời gian.</li>
      </ul>

      <h2>4. Giá và thanh toán</h2>
      <ul>
        <li>Giá món được niêm yết trên thực đơn bằng Việt Nam đồng (VNĐ) và có thể thay đổi; giá áp dụng là giá tại thời điểm đặt món. ${vat}</li>
        <li>Thanh toán trực tiếp tại quán hoặc khi nhận món. Hoá đơn được in sau khi thanh toán.</li>
      </ul>

      <h2>5. Góp ý &amp; quà tặng 1 ly nước</h2>
      <ul>
        <li>Khách gửi góp ý trong mục <strong>Góp ý &amp; Phản hồi</strong> sau khi dùng bữa có thể nhận mã tặng <strong>1 ly nước</strong> cho hoá đơn lần sau (theo chương trình quán đang áp dụng).</li>
        <li>Mã tặng có hạn sử dụng ${esc(s.voucher_valid_days || '30')} ngày kể từ ngày nhận, chỉ dùng một lần, không quy đổi thành tiền. Nhân viên thu ngân sẽ chọn đồ uống và áp dụng mã vào hoá đơn.</li>
        <li>Quán có thể thay đổi hoặc kết thúc chương trình mà không cần báo trước; mã đã phát vẫn được dùng đến hết hạn.</li>
      </ul>

      <h2>6. Bảo vệ thông tin cá nhân</h2>
      <ul>
        <li>Thông tin bạn cung cấp (họ tên, số điện thoại, địa chỉ, nội dung góp ý) chỉ được dùng để xử lý đơn hàng, liên hệ với bạn và cải thiện chất lượng phục vụ.</li>
        <li>${esc(shop.name)} không bán hay chia sẻ thông tin cá nhân của bạn cho bên thứ ba, trừ khi pháp luật yêu cầu.</li>
        <li>Website lưu giỏ hàng và đơn đang theo dõi trong bộ nhớ trình duyệt trên điện thoại của bạn để tiện sử dụng; bạn có thể xoá bằng cách xoá dữ liệu trang web trong trình duyệt.</li>
        <li>Bạn có quyền yêu cầu xem, sửa hoặc xoá thông tin cá nhân của mình bằng cách liên hệ với quán.</li>
      </ul>

      <h2>7. Sử dụng website</h2>
      <p>Không sử dụng website để gửi đơn giả, nội dung xúc phạm hoặc can thiệp vào hệ thống. Hình ảnh, logo và nội dung trên website thuộc quyền sở hữu của ${esc(shop.name)}.</p>

      <h2>8. Liên hệ</h2>
      <p>Mọi thắc mắc về điều khoản, đơn hàng hoặc thông tin cá nhân, vui lòng liên hệ ${esc(shop.name)}${contact ? `: ${contact}` : ' trực tiếp tại quán'}.</p>
    </div>
  </article>`;
  return layout(shop, {
    path: '/dieu-khoan',
    title: `Điều khoản & điều kiện - ${shop.name}`,
    description: `Điều khoản sử dụng, đặt món online, gọi món QR, thanh toán, quà tặng góp ý và chính sách bảo vệ thông tin cá nhân của ${shop.name}.`,
    body,
    ld: [breadcrumbLd(shop, [['Trang chủ', '/'], ['Điều khoản & điều kiện', '/dieu-khoan']])],
  });
}

// ===================== BÀI VIẾT =====================
async function blogPage(env) {
  const shop = shopInfo(await getSettings(env));
  const body = `
  <section class="max-w-6xl mx-auto px-4 py-10">
    <h1 class="text-3xl md:text-4xl font-bold text-brand-800">Bài viết về cơm gà Tam Kỳ</h1>
    <p class="mt-2 text-stone-600">Chuyện cơm gà xứ Quảng, câu chuyện của LaLiDa và bí quyết thưởng thức cơm gà Tam Kỳ ngon đúng điệu.</p>
    <div class="grid md:grid-cols-3 gap-4 mt-8">${ARTICLES.map(articleCard).join('')}</div>
  </section>`;
  return layout(shop, {
    path: '/bai-viet',
    title: `Bài viết về cơm gà Tam Kỳ - ${shop.name}`,
    description: 'Tổng hợp bài viết về cơm gà Tam Kỳ, đặc sản xứ Quảng, cách ăn cơm gà đúng điệu và câu chuyện quán cơm gà LaLiDa.',
    body,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `Bài viết - ${shop.name}`,
        url: `${shop.base}/bai-viet`,
        blogPost: ARTICLES.map((a) => ({ '@type': 'BlogPosting', headline: a.title, url: `${shop.base}/bai-viet/${a.slug}`, datePublished: a.date })),
      },
      breadcrumbLd(shop, [['Trang chủ', '/'], ['Bài viết', '/bai-viet']]),
    ],
  });
}

async function articlePage(env, slug) {
  const a = ARTICLES.find((x) => x.slug === slug);
  if (!a) return null;
  const shop = shopInfo(await getSettings(env));
  const others = ARTICLES.filter((x) => x !== a);
  const path = `/bai-viet/${a.slug}`;
  const body = `
  <article class="max-w-3xl mx-auto px-4 py-10">
    <nav class="text-sm text-stone-500" aria-label="breadcrumb"><a href="/" class="hover:underline">Trang chủ</a> › <a href="/bai-viet" class="hover:underline">Bài viết</a></nav>
    <h1 class="text-3xl md:text-4xl font-bold text-brand-800 leading-tight mt-3">${esc(a.title)}</h1>
    <div class="text-sm text-stone-500 mt-3">${esc(shop.name)} · ${viDate(a.date)} · ${a.minutes} phút đọc</div>
    <div class="prose-lalida mt-6">${a.html}</div>
    <div class="card p-5 mt-10 bg-brand-50 flex flex-wrap items-center gap-4">
      <img src="/assets/logo.webp" alt="LaLiDa" width="283" height="256" loading="lazy" class="h-16 w-auto" />
      <div class="flex-1 min-w-[12rem]"><div class="font-bold text-brand-800">Thèm cơm gà Tam Kỳ?</div><div class="text-sm text-stone-600">Xem thực đơn LaLiDa và đặt món online chỉ trong 1 phút.</div></div>
      <a href="/online" class="btn btn-primary">Đặt món ngay</a>
    </div>
  </article>
  <section class="max-w-6xl mx-auto px-4">
    <h2 class="text-xl font-bold text-brand-800">Bài viết khác</h2>
    <div class="grid md:grid-cols-2 gap-4 mt-4">${others.map(articleCard).join('')}</div>
  </section>`;
  return layout(shop, {
    path,
    type: 'article',
    title: `${a.title} | ${shop.name}`,
    description: a.description,
    body,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: a.title,
        description: a.description,
        keywords: a.keywords,
        inLanguage: 'vi',
        datePublished: a.date,
        dateModified: a.date,
        image: `${shop.base}/assets/og-image.jpg`,
        mainEntityOfPage: `${shop.base}${path}`,
        author: { '@type': 'Organization', name: shop.name, url: `${shop.base}/` },
        publisher: { '@type': 'Organization', name: shop.name, logo: { '@type': 'ImageObject', url: `${shop.base}/assets/icon-512.png` } },
      },
      breadcrumbLd(shop, [['Trang chủ', '/'], ['Bài viết', '/bai-viet'], [a.title, path]]),
    ],
  });
}

async function notFoundPage(env) {
  const shop = shopInfo(await getSettings(env));
  return layout(shop, {
    path: '/404',
    title: `Không tìm thấy trang - ${shop.name}`,
    description: 'Trang bạn tìm không tồn tại.',
    robots: 'noindex',
    body: `<section class="max-w-3xl mx-auto px-4 py-20 text-center"><div class="text-6xl">🐔</div><h1 class="text-2xl font-bold text-brand-800 mt-4">Không tìm thấy trang</h1><p class="mt-2 text-stone-600">Trang này không tồn tại hoặc đã được chuyển.</p><a href="/" class="btn btn-primary inline-block mt-6">Về trang chủ</a></section>`,
  });
}

function sitemap() {
  const urls = [
    ['/', '1.0', 'weekly'],
    ['/online', '0.9', 'daily'],
    ['/bai-viet', '0.8', 'weekly'],
    ...ARTICLES.map((a) => [`/bai-viet/${a.slug}`, '0.7', 'monthly', a.date]),
    ['/ve-chung-toi', '0.6', 'monthly'],
    ['/dieu-khoan', '0.3', 'yearly'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, prio, freq, mod]) => `  <url><loc>${SITE}${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${prio}</priority></url>`).join('\n')}
</urlset>`;
}

// Bảng định tuyến: đường dẫn -> hàm dựng trang (trả về HTML, hoặc null = 404)
export const PAGES = {
  home: homePage,
  about: aboutPage,
  terms: termsPage,
  blog: blogPage,
  article: (env, params) => articlePage(env, params.slug),
};

// Dùng chung cho các file trong functions/: lấy từ bộ nhớ đệm nếu có, không thì dựng trang và lưu lại 5 phút
export async function servePage(context, page) {
  const { request, env, params, waitUntil } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const key = new Request(url.origin + url.pathname);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let status = 200;
  let type = 'text/html; charset=utf-8';
  let html;
  if (page === 'sitemap') {
    html = sitemap();
    type = 'application/xml; charset=utf-8';
  } else {
    html = await PAGES[page](env, params || {});
    if (html == null) {
      status = 404;
      html = await notFoundPage(env);
    }
  }
  const headers = {
    'content-type': type,
    'cache-control': status === 200 ? `public, max-age=${CACHE_TTL}` : 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  // Bản *.pages.dev là bản sao của lalida.net -> không cho Google lập chỉ mục để tránh trùng lặp nội dung
  if (url.hostname.endsWith('.pages.dev')) headers['x-robots-tag'] = 'noindex';
  const res = new Response(html, { status, headers });
  if (status === 200) waitUntil(cache.put(key, res.clone()));
  return request.method === 'HEAD' ? new Response(null, { status, headers }) : res;
}

// Xoá bản lưu đệm của các trang công khai (gọi sau khi sửa Cài đặt / Thực đơn) để nội dung mới hiện ngay
export async function purgeSitePages(origin) {
  await Promise.all(SITE_PATHS.map((p) => caches.default.delete(new Request(origin + p)).catch(() => false)));
}
