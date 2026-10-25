// Cloudflare Pages Function: mọi request /api/* được xử lý bởi Worker này
import { handle } from '../../src/api/router.js';

export const onRequest = ({ request, env }) => handle(request, env);
