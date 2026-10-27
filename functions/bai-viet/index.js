// Danh sách bài viết
import { servePage } from '../../src/site/pages.js';
export const onRequest = (context) => servePage(context, 'blog');
