// Màu thương hiệu LaLiDa (xanh lá rêu + kem + cam đất) cho Tailwind CDN
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f6ef', 100: '#e3ebd9', 200: '#c7d7b4', 300: '#a3bd86', 400: '#7f9f5e',
          500: '#5f8241', 600: '#4a6733', 700: '#3b512a', 800: '#304124', 900: '#28361f',
        },
        cream: { 50: '#fdfaf3', 100: '#f8f1e2', 200: '#efe2c4' },
        clay: { 500: '#c9762f', 600: '#a95f22' },
      },
      fontFamily: { sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'] },
    },
  },
};
