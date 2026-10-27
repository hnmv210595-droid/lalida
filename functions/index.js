// Trang chủ lalida.net (SEO) - nội dung dựng ở src/site/pages.js
import { servePage } from '../src/site/pages.js';
export const onRequest = (context) => servePage(context, 'home');
