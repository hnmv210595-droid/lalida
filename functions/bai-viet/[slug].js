// Một bài viết: /bai-viet/<slug>
import { servePage } from '../../src/site/pages.js';
export const onRequest = (context) => servePage(context, 'article');
