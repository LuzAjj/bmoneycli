// ============================================================
//  index.js — Entry point utama B-Money Mining Bot
// ============================================================
//
//  Jalankan dengan:
//    node index.js
//    node index.js --threads 8
//    node index.js --threads 4 --loops 10
// ============================================================

import { parseArgs }  from "util";
import { getMe, resolveAccount, getChallenge, submitProof } from "./src/api.js";
import { getValidCookies } from "./src/auth.js";
import { mine }       from "./src/miner.js";
import { printBanner, renderDashboard, logProgress, log, C } from "./src/display.js";

// ── Load credentials (username & password) ───────────────────
let CREDENTIALS = null;
try {
  const mod = await import("./credentials.js");
  CREDENTIALS = mod.CREDENTIALS ?? null;
} catch {
  // credentials.js tidak ada — akan fallback ke cookies.js
}

// Fallback ke cookies.js lama jika credentials.js tidak ada
let STATIC_COOKIES = null;
if (!CREDENTIALS) {
  try {
    const mod = await import("./cookies.js");
    STATIC_COOKIES = mod.COOKIES ?? null;
  } catch { /* tidak ada keduanya */ }
}

// Cookie aktif (akan diisi saat startup / re-login)
let COOKIES = STATIC_COOKIES ?? {};

// ── Parse argumen CLI ────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    threads: { type: "string",  default: "4" },
    loops:   { type: "string",  default: "0" },
    delay:   { type: "string",  default: "2" },
    help:    { type: "boolean", short: "h"   },
  },
  allowPositionals: false,
});

if (args.help) {
  console.log(`
${C.bold}B-Money Mining Bot${C.reset}

Penggunaan:
  node index.js [opsi]

Opsi:
  --threads  Jumlah CPU thread (default: 4)
  --loops    Berapa kali mining, 0 = terus menerus (default: 0)
  --delay    Jeda antar round dalam detik (default: 2)
  --help     Tampilkan bantuan ini

Setup:
  Buat file credentials.js (disarankan):
    cp credentials.example.js credentials.js
    # lalu isi username & password

  Atau buat file cookies.js (cara lama):
    cp cookies.example.js cookies.js
    # lalu isi cookie manual dari browser
`);
  process.exit(0);
}

const NUM_THREADS = parseInt(args.threads);
const MAX_LOOPS   = parseInt(args.loops);
const DELAY_MS    = parseFloat(args.delay) * 1000;

// ── State dashboard ──────────────────────────────────────────
const dashState = {
  account:         { id: 0, name: "─", balance: "─" },
  networkCalib:    { targetSolveTime: "─", networkAvgSolve: "─", difficulty: "─", networkTotal: "─", status: "─" },
  miningInterface: { minerAccount: "─", prefix: "─", reward: "─" },
  telemetry:       { hashRate: 0, attempts: 0 },
  currentNonce:    0,
  status:          "IDLE",
  stats:           { solved: 0, failed: 0, earned: 0 },
  round:           0,
};

function render() { renderDashboard(dashState); }

// ── Auto re-login jika session expired ───────────────────────
async function ensureValidSession() {
  if (!CREDENTIALS) return; // pakai cookies statis, tidak bisa re-login

  log("Memeriksa session...", "INFO");
  try {
    COOKIES = await getValidCookies(CREDENTIALS.username, CREDENTIALS.password);
    log("Session OK", "OK");
  } catch (err) {
    log(`Login gagal: ${err.message}`, "ERR");
    process.exit(1);
  }
}

// ── Validasi setup awal ──────────────────────────────────────
function validateSetup() {
  if (CREDENTIALS) {
    if (
      CREDENTIALS.username === "USERNAME_KAMU" ||
      CREDENTIALS.password === "PASSWORD_KAMU"
    ) {
      console.error(`\n${C.red}${C.bold}[ERROR]${C.reset} credentials.js belum diisi!\n\nBuka file ${C.yellow}credentials.js${C.reset} dan isi username & password kamu.\n`);
      process.exit(1);
    }
    return;
  }

  if (STATIC_COOKIES) {
    if (
      STATIC_COOKIES["connect.sid"] === "PASTE_CONNECT_SID_DISINI" ||
      STATIC_COOKIES["GAESA"]       === "PASTE_GAESA_DISINI"
    ) {
      console.error(`\n${C.red}${C.bold}[ERROR]${C.reset} cookies.js belum diisi!\n\nDisarankan: buat ${C.yellow}credentials.js${C.reset} pakai username & password (auto-login).\n  cp credentials.example.js credentials.js\n`);
      process.exit(1);
    }
    return;
  }

  console.error(`\n${C.red}${C.bold}[ERROR]${C.reset} Tidak ada credentials atau cookies!\n\nBuat file ${C.yellow}credentials.js${C.reset}:\n  cp credentials.example.js credentials.js\n  # lalu isi username & password\n`);
  process.exit(1);
}

// ── Satu siklus mining ───────────────────────────────────────
async function runOneRound() {
  dashState.round++;
  dashState.status = "FETCHING CHALLENGE";
  render();

  // 1. Ambil challenge
  let challenge;
  try {
    challenge = await getChallenge(COOKIES);
  } catch (err) {
    if (err.message === "RATE_LIMITED") {
      log("Rate limited — tunggu 5 detik...", "WARN");
      await sleep(5000);
      return false;
    }
    // Jika 401, coba re-login
    if (err.message.includes("401") || err.message.includes("403")) {
      log("Session expired — login ulang...", "WARN");
      await ensureValidSession();
      return false;
    }
    throw err;
  }

  // Parse data challenge
  const prefix      = challenge.prefix      ?? challenge.challenge ?? "";
  const difficulty  = challenge.difficulty  ?? 4;
  const reward      = challenge.reward      ?? "?";
  const challengeId = challenge.id          ?? challenge.challengeId ?? null;

  dashState.networkCalib = {
    targetSolveTime: challenge.targetSolveTime ?? challenge.target_time ?? 60,
    networkAvgSolve: challenge.networkAvgSolve ?? challenge.avg_time    ?? "─",
    difficulty,
    networkTotal:    challenge.networkTotal    ?? challenge.total_solved ?? "─",
    status:          challenge.calibrationStatus ?? deriveCalibStatus(challenge),
  };
  dashState.miningInterface = { minerAccount: dashState.account.name, prefix, reward };
  dashState.telemetry  = { hashRate: 0, attempts: 0 };
  dashState.currentNonce = 0;
  dashState.status     = "COMPUTING";
  render();

  // 2. Mining — progress bar inline
  const result = await mine(prefix, difficulty, NUM_THREADS, (totalHashes, elapsed) => {
    const hps = totalHashes / Math.max(elapsed, 0.001);
    logProgress(Math.round(totalHashes / NUM_THREADS), Math.round(hps), totalHashes);
  });

  // Bersihkan progress bar, log hasil solve
  process.stdout.write("\r\x1b[2K");
  log(`Solved! nonce: ${C.yellow}${result.nonce}${C.reset}  hash: ${C.dim}${result.hash}${C.reset}`, "OK");

  // 3. Submit
  log("Mengirim proof ke server...", "INFO");
  const { status: httpStatus, body } = await submitProof(COOKIES, {
    accountId:   dashState.account.id,
    nonce:       result.nonce,
    hash:        result.hash,
    challengeId,
  });

  if (httpStatus === 200) {
    const earned = parseFloat(
      String(body?.reward ?? body?.amount ?? reward).replace(/[^0-9.]/g, "") || "0"
    );
    dashState.stats.solved++;
    dashState.stats.earned += earned;
    dashState.status = `SOLVED ✓ (+${earned} MU)`;
    log(`Submit berhasil! +${earned} MU  |  Total: ${dashState.stats.earned.toFixed(2)} MU  |  Solved: ${dashState.stats.solved}`, "OK");
    await refreshAccount();
    log(`Balance: ${C.yellow}${dashState.account.balance} MU${C.reset}`, "INFO");
  } else if (httpStatus === 401 || httpStatus === 403) {
    log("Session expired saat submit — login ulang...", "WARN");
    await ensureValidSession();
    dashState.stats.failed++;
    dashState.status = "SESSION EXPIRED — re-login OK";
  } else {
    dashState.stats.failed++;
    const errMsg = body?.error ?? body?.message ?? JSON.stringify(body);
    dashState.status = `FAILED (${httpStatus})`;
    log(`Submit gagal HTTP ${httpStatus}: ${errMsg}`, "ERR");
  }

  return true;
}

// ── Refresh info akun ────────────────────────────────────────
async function refreshAccount() {
  try {
    const me = await getMe(COOKIES);
    if (!me) return;
    const acc = await resolveAccount(COOKIES, me);
    if (acc) {
      dashState.account = { id: acc.id, name: acc.name, balance: acc.balance };
      dashState.miningInterface.minerAccount = acc.name;
    }
  } catch { /* silent */ }
}

// ── Derive calibration status ────────────────────────────────
function deriveCalibStatus(challenge) {
  const avg    = challenge.networkAvgSolve ?? challenge.avg_time;
  const target = challenge.targetSolveTime ?? challenge.target_time ?? 60;
  if (!avg) return "─";
  if (avg < target * 0.8) return "TOO FAST";
  if (avg > target * 1.2) return "TOO SLOW";
  return "ON TARGET";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────
async function main() {
  printBanner();
  validateSetup();

  // Login / ambil session
  if (CREDENTIALS) {
    log(`Login sebagai ${C.cyan}${CREDENTIALS.username}${C.reset}...`, "INFO");
    try {
      COOKIES = await getValidCookies(CREDENTIALS.username, CREDENTIALS.password);
      log("Login berhasil!", "OK");
    } catch (err) {
      log(`Login gagal: ${err.message}`, "ERR");
      log("Periksa username & password di credentials.js", "ERR");
      process.exit(1);
    }
  } else {
    log("Menggunakan cookies.js (mode lama)...", "INFO");
    const me = await getMe(COOKIES);
    if (!me) {
      log("Cookie tidak valid atau sudah expired!", "ERR");
      log("Disarankan: gunakan credentials.js untuk auto-login.", "ERR");
      process.exit(1);
    }
    log(`Session valid — ${JSON.stringify(me)}`, "OK");
  }

  // Resolve akun
  const me = await getMe(COOKIES);
  if (me) {
    log(`Raw session: ${JSON.stringify(me)}`, "INFO");
    const acc = await resolveAccount(COOKIES, me);
    if (acc) {
      dashState.account = { id: acc.id, name: acc.name, balance: acc.balance };
      log(`Akun: ${C.green}${acc.name}${C.reset} | Balance: ${acc.balance} MU`, "OK");
    } else {
      log("Akun tidak ditemukan — lanjut mining dengan nama '─'", "WARN");
    }
  }

  log(`Threads : ${NUM_THREADS}`, "INFO");
  log(`Loops   : ${MAX_LOOPS === 0 ? "∞ (terus menerus)" : MAX_LOOPS}`, "INFO");
  log("Memulai mining dalam 2 detik...", "INFO");
  await sleep(2000);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log(`\n\n${C.yellow}Bot dihentikan.${C.reset}`);
    console.log(`  Total solved : ${dashState.stats.solved}`);
    console.log(`  Total failed : ${dashState.stats.failed}`);
    console.log(`  Total earned : ${dashState.stats.earned.toFixed(2)} MU\n`);
    process.exit(0);
  });

  // ── Loop utama ──────────────────────────────────────────────
  let rounds = 0;
  while (true) {
    rounds++;
    try {
      await runOneRound();
    } catch (err) {
      dashState.status = `ERROR: ${err.message}`;
      render();
      log(`Error: ${err.message}`, "ERR");
      await sleep(5000);
    }
    if (MAX_LOOPS > 0 && rounds >= MAX_LOOPS) break;
    await sleep(DELAY_MS);
  }

  console.log(`\n${C.green}${C.bold}Mining selesai!${C.reset}`);
  console.log(`  Total solved : ${dashState.stats.solved}`);
  console.log(`  Total failed : ${dashState.stats.failed}`);
  console.log(`  Total earned : ${dashState.stats.earned.toFixed(2)} MU\n`);
}

main().catch(err => {
  log(`Fatal: ${err.message}`, "ERR");
  console.error(err);
  process.exit(1);
});
