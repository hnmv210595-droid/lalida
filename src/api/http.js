// Tiện ích HTTP, kiểm tra dữ liệu và thời gian (giờ Việt Nam)

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ');
  }
}

export function int(value, { min = -Infinity, max = Infinity, name = 'Giá trị', required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new HttpError(400, `${name} là bắt buộc`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} không hợp lệ`);
  return n;
}

export function str(value, { max = 255, name = 'Giá trị', required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(400, `${name} là bắt buộc`);
    return null;
  }
  const s = String(value).trim();
  if (s.length > max) throw new HttpError(400, `${name} quá dài (tối đa ${max} ký tự)`);
  return s;
}

export function oneOf(value, list, name = 'Giá trị') {
  if (!list.includes(value)) throw new HttpError(400, `${name} không hợp lệ`);
  return value;
}

export function dateStr(value, { name = 'Ngày', required = true } = {}) {
  if (!value) {
    if (!required) return null;
    throw new HttpError(400, `${name} là bắt buộc`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) throw new HttpError(400, `${name} không hợp lệ`);
  return value;
}

export function timeStr(value, { name = 'Giờ', required = false } = {}) {
  if (!value) {
    if (required) throw new HttpError(400, `${name} là bắt buộc`);
    return null;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, `${name} không hợp lệ (HH:MM)`);
  return value;
}

// Giờ Việt Nam (UTC+7), dùng getter UTC trên Date đã dịch
const vnNow = () => new Date(Date.now() + 7 * 3600 * 1000);
export const vnToday = () => vnNow().toISOString().slice(0, 10);
export const vnTime = () => vnNow().toISOString().slice(11, 16);

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
}
