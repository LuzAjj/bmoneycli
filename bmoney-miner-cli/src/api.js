// ============================================================
//  src/api.js — Semua komunikasi HTTP ke server B-Money
// ============================================================

const BASE_URL = "https://b-money.replit.app";

function buildCookieString(cookieObj) {
  return Object.entries(cookieObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function apiFetch(path, cookieObj, options = {}) {
  const url         = `${BASE_URL}${path}`;
  const cookieString = buildCookieString(cookieObj);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Accept":        "application/json",
      "Content-Type":  "application/json",
      "Cookie":        cookieString,
      "Origin":        BASE_URL,
      "Referer":       `${BASE_URL}/mine`,
      "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Cache-Control": "no-cache",
      "Pragma":        "no-cache",
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { body = await res.json(); } catch { body = null; }
  } else {
    body = await res.text();
  }

  return { status: res.status, body, ok: res.ok, headers: res.headers };
}

// ── Auth ──────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Return: { id, username, accountIds: [412], ... } atau null
 */
export async function getMe(cookies) {
  const { status, body } = await apiFetch("/api/auth/me", cookies);
  if (status === 200 && body && typeof body === "object") return body;
  return null;
}

// ── Accounts ──────────────────────────────────────────────────────

/**
 * GET /api/accounts
 * Return: array of { id, name, balance, ... }
 */
export async function getAccounts(cookies) {
  const { status, body } = await apiFetch("/api/accounts", cookies);
  if (status === 200 && body) {
    if (Array.isArray(body))             return body;
    if (Array.isArray(body?.accounts))   return body.accounts;
    if (Array.isArray(body?.data))       return body.data;
    if (typeof body === "object")        return [body];
  }
  return [];
}

/**
 * GET /api/accounts/:id
 * Return: { id, name, balance, ... } atau null
 */
export async function getAccountById(cookies, accountId) {
  const { status, body } = await apiFetch(`/api/accounts/${accountId}`, cookies);
  if (status === 200 && body && typeof body === "object") return body;
  return null;
}

/**
 * Resolve akun dari data session getMe.
 * Menggunakan accountIds[] untuk fetch detail akun.
 * Return: { id: number, name: string, balance: string }
 */
export async function resolveAccount(cookies, meData) {
  // Kumpulkan semua kandidat accountId
  const ids = [
    ...(meData?.accountIds ?? []),
    ...(meData?.id   ? [meData.id]   : []),
    ...(meData?.accountId ? [meData.accountId] : []),
  ].filter((v, i, a) => v != null && a.indexOf(v) === i); // unique, non-null

  // Coba fetch tiap ID
  for (const id of ids) {
    const acc = await getAccountById(cookies, id);
    if (acc) {
      return {
        id:      Number(acc.id ?? id),
        name:    acc.name ?? acc.username ?? acc.accountName ?? String(id),
        balance: String(acc.balance ?? acc.amount ?? "0"),
      };
    }
  }

  // Fallback: GET /api/accounts
  const accounts = await getAccounts(cookies);
  if (accounts.length > 0) {
    const acc = accounts[0];
    return {
      id:      Number(acc.id ?? ids[0] ?? 0),
      name:    acc.name ?? acc.username ?? acc.accountName ?? String(acc.id ?? "unknown"),
      balance: String(acc.balance ?? acc.amount ?? "0"),
    };
  }

  return null;
}

// ── Mining ────────────────────────────────────────────────────────

/**
 * GET /api/mining/challenge
 * Return: { id, prefix, difficulty, reward, ... }
 */
export async function getChallenge(cookies) {
  const { status, body } = await apiFetch("/api/mining/challenge", cookies);
  if (status === 200) return body;
  if (status === 429) throw new Error("RATE_LIMITED");
  if (status === 401 || status === 403) throw new Error(`AUTH_FAILED:${status}`);
  throw new Error(`Challenge fetch failed: HTTP ${status}`);
}

/**
 * POST /api/mining/submit
 *
 * Payload (sesuai endpoint yang dikonfirmasi):
 *   { challengeId, accountId (number), nonce (number), hash }
 *
 * Return: { status, body }
 */
export async function submitProof(cookies, { accountId, nonce, hash, challengeId }) {
  const payload = {
    challengeId,
    accountId: Number(accountId),
    nonce:     Number(nonce),
    hash,
  };

  const { status, body } = await apiFetch("/api/mining/submit", cookies, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

  return { status, body };
}
