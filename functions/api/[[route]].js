// Cloudflare Pages Function: mọi request /api/* được xử lý bởi Worker này
import { handle } from '../../src/api/router.js';

// waitUntil: gửi thông báo đẩy cho nhân viên sau khi đã trả kết quả cho khách (khách không phải chờ)
export const onRequest = ({ request, env, waitUntil }) => handle(request, env, waitUntil);
