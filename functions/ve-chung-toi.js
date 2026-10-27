// Trang Về chúng tôi - thông tin quán lấy từ Cài đặt
import { servePage } from '../src/site/pages.js';
export const onRequest = (context) => servePage(context, 'about');
