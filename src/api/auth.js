// Xác thực Admin (mật khẩu) + bảo mật cấp 2 (mã PIN cho Thu chi & Lợi nhuận)
import { HttpError, clientIp } from './http.js';

export const ADMIN_COOKIE = 'lalida_admin';
export const FINANCE_COOKIE = 'lalida_fin';
export const ADMIN_TTL = 12 * 3600; // 12 giờ
export const FINANCE_TTL = 30 * 60; // 30 phút

const enc = new TextEncoder();
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 100000; // mức tối đa Workers hỗ trợ

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function sessionSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new HttpError(500, 'Chưa cấu hình SESSION_SECRET (tối thiểu 32 ký tự)');
  }
  return env.SESSION_SECRET;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function makeToken(env, scope, ttl) {
  const payload = b64url(enc.encode(JSON.stringify({ s: scope, e: Math.floor(Date.now() / 1000) + ttl })));
  return `${payload}.${await hmac(sessionSecret(env), payload)}`;
}

async function verifyToken(env, token, scope) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, await hmac(sessionSecret(env), payload))) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.s === scope && data.e > Date.now() / 1000;
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function cookie(request, name, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function isAdmin(request, env) {
  return verifyToken(env, getCookie(request, ADMIN_COOKIE), 'admin');
}

export async function isFinance(request, env) {
  return verifyToken(env, getCookie(request, FINANCE_COOKIE), 'finance');
}

// ---- Băm mật khẩu / PIN bằng PBKDF2-SHA256 ----
async function pbkdf2(secret, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashSecret(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

async function verifyHash(secret, stored) {
  const [algo, iter, salt, hash] = stored.split('$');
  if (algo !== 'pbkdf2') return false;
  const actual = await pbkdf2(secret, fromB64url(salt), Number(iter));
  return safeEqual(b64url(actual), hash);
}

const CREDENTIALS = {
  login: { setting: 'admin_password_hash', envKey: 'ADMIN_PASSWORD', label: 'mật khẩu Admin' },
  pin: { setting: 'finance_pin_hash', envKey: 'FINANCE_PIN', label: 'mã PIN cấp 2' },
};

// So khớp: ưu tiên giá trị đã đổi trong D1, nếu chưa đổi thì dùng secret ban đầu
export async function checkCredential(env, kind, input) {
  const c = CREDENTIALS[kind];
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(c.setting).first();
  if (row) return verifyHash(String(input), row.value);
  if (!env[c.envKey]) throw new HttpError(503, `Chưa cấu hình ${c.label} (biến ${c.envKey})`);
  return safeEqual(String(input), String(env[c.envKey]));
}

export async function saveCredential(env, kind, value) {
  const c = CREDENTIALS[kind];
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(c.setting, await hashSecret(String(value)))
    .run();
}

// ---- Chống dò mật khẩu: tối đa 5 lần sai / 15 phút / IP ----
export async function guardAttempts(request, env, kind) {
  const ip = clientIp(request);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND kind = ? AND created_at > datetime('now', ?)`
  )
    .bind(ip, kind, `-${LOCK_MINUTES} minutes`)
    .first();
  if (row.n >= MAX_FAILS) throw new HttpError(429, `Sai quá ${MAX_FAILS} lần. Vui lòng thử lại sau ${LOCK_MINUTES} phút`);
  return {
    fail: () =>
      env.DB.batch([
        env.DB.prepare('INSERT INTO login_attempts (ip, kind) VALUES (?, ?)').bind(ip, kind),
        env.DB.prepare(`DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')`),
      ]),
    success: () => env.DB.prepare('DELETE FROM login_attempts WHERE ip = ? AND kind = ?').bind(ip, kind).run(),
  };
}
