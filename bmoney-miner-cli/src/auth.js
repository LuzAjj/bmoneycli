// ============================================================
//  src/auth.js — Auto-login & session management
// ============================================================
//
//  Modul ini menangani:
//  - Login otomatis pakai username & password
//  - Menyimpan cookie ke file session.json
//  - Re-login otomatis jika session expired
// ============================================================

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "..", "session.json");
const BASE_URL     = "https://b-money.replit.app";

// ── Simpan & baca session ─────────────────────────────────────

function saveSession(cookies) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies, savedAt: Date.now() }, null, 2));
  } catch {
    // Tidak masalah jika gagal simpan
  }
}

function loadSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    // Session dianggap valid selama 12 jam
    const AGE_LIMIT = 12 * 60 * 60 * 1000;
    if (Date.now() - (data.savedAt ?? 0) > AGE_LIMIT) return null;
    return data.cookies ?? null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch { /* ignore */ }
}

// ── Parse Set-Cookie header ───────────────────────────────────

function parseCookies(setCookieHeaders) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    // Ambil bagian pertama saja (nama=nilai), abaikan expires, path, dll
    const part = header.split(";")[0].trim();
    const eq   = part.indexOf("=");
    if (eq === -1) continue;
    const name  = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

// ── Login ke server ───────────────────────────────────────────

/**
 * Login dengan username & password.
 * Return: cookies object { "connect.sid": "...", "GAESA": "..." }
 * Throw jika login gagal.
 */
export async function login(username, password) {
  // Coba beberapa endpoint login yang umum
  const endpoints = [
    { path: "/api/auth/login",    body: { username, password } },
    { path: "/api/auth/signin",   body: { username, password } },
    { path: "/api/login",         body: { username, password } },
    { path: "/api/users/login",   body: { username, password } },
    { path: "/api/auth/login",    body: { email: username, password } },
  ];

  for (const ep of endpoints) {
    let res;
    try {
      res = await fetch(`${BASE_URL}${ep.path}`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":        "application/json",
          "Origin":        BASE_URL,
          "Referer":       `${BASE_URL}/login`,
          "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        body:    JSON.stringify(ep.body),
        redirect: "manual",
      });
    } catch {
      continue;
    }

    // Sukses jika 200 atau redirect (302) — keduanya bisa set cookie
    if (res.status === 200 || res.status === 201 || res.status === 302) {
      const setCookieRaw = res.headers.getSetCookie?.() ?? [];
      const cookies = parseCookies(setCookieRaw);

      // Cek apakah dapat cookie session
      if (cookies["connect.sid"] || cookies["session"]) {
        saveSession(cookies);
        return cookies;
      }

      // Coba baca body untuk info tambahan
      const ct   = res.headers.get("content-type") ?? "";
      const body = ct.includes("application/json") ? await res.json().catch(() => null) : null;

      // Beberapa server kembalikan token di body, bukan cookie
      if (body?.token || body?.sessionId) {
        const cookieFromBody = {
          "connect.sid": body.token ?? body.sessionId,
          ...(body.gaesa ? { "GAESA": body.gaesa } : {}),
        };
        saveSession(cookieFromBody);
        return cookieFromBody;
      }
    }
  }

  throw new Error("Login gagal — periksa username dan password kamu");
}

// ── Verifikasi session masih valid ────────────────────────────

async function isSessionValid(cookies) {
  try {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: {
        "Cookie":     cookieStr,
        "Accept":     "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ── Main: dapatkan cookie (dari cache atau login baru) ────────

/**
 * Ambil cookie yang valid.
 * - Coba dari session.json (cache) dulu
 * - Jika expired/tidak ada, login ulang otomatis
 * - Return: cookies object
 */
export async function getValidCookies(username, password, { forceLogin = false } = {}) {
  if (!forceLogin) {
    const cached = loadSession();
    if (cached) {
      const valid = await isSessionValid(cached);
      if (valid) return cached;
      // Session expired, hapus cache
      clearSession();
    }
  }

  // Login ulang
  return await login(username, password);
}
