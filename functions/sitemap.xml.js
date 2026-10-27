// Sơ đồ trang cho Google: /sitemap.xml
import { servePage } from '../src/site/pages.js';
export const onRequest = (context) => servePage(context, 'sitemap');
