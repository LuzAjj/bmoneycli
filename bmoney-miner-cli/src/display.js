// ============================================================
//  src/display.js — Log berjalan (scrolling log style)
// ============================================================

// ── Warna & format ANSI ──────────────────────────────────────
export const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[92m",
  yellow: "\x1b[93m",
  red:    "\x1b[91m",
  cyan:   "\x1b[96m",
  blue:   "\x1b[94m",
  magenta:"\x1b[95m",
  white:  "\x1b[97m",
};

// ── Timestamp ────────────────────────────────────────────────
function ts() {
  return `${C.dim}[${new Date().toTimeString().slice(0, 8)}]${C.reset}`;
}

// ── Banner awal ──────────────────────────────────────────────
export function printBanner() {
  console.clear();
  console.log(`${C.green}${C.bold}
 ██████╗       ███╗   ███╗ ██████╗ ███╗   ██╗███████╗██╗   ██╗
 ██╔══██╗      ████╗ ████║██╔═══██╗████╗  ██║██╔════╝╚██╗ ██╔╝
 ██████╔╝█████╗██╔████╔██║██║   ██║██╔██╗ ██║█████╗   ╚████╔╝
 ██╔══██╗╚════╝██║╚██╔╝██║██║   ██║██║╚██╗██║██╔══╝    ╚██╔╝
 ██████╔╝      ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║███████╗   ██║
 ╚═════╝       ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝
${C.reset}${C.dim}         B-Money Protocol v0.1.0  —  CLI Mining Bot${C.reset}
`);
}

// ── Log satu baris (dipakai di mana-mana) ────────────────────
export function log(msg, level = "INFO") {
  const colors = { INFO: C.cyan, OK: C.green, WARN: C.yellow, ERR: C.red };
  const c = colors[level] ?? C.reset;
  // Bersihkan progress bar inline sebelum print
  process.stdout.write("\r\x1b[2K");
  console.log(`${ts()} ${c}${C.bold}[${level}]${C.reset} ${msg}`);
}

// ── Progress bar inline (overwrite baris yang sama) ──────────
let _lastProgressLine = "";
export function logProgress(nonce, hps, attempts) {
  const bar = `${ts()} ${C.cyan}${C.bold}[MINING]${C.reset} ` +
    `nonce: ${C.yellow}${String(nonce).padStart(9)}${C.reset}` +
    `  hashrate: ${C.green}${Math.round(hps).toLocaleString().padStart(10)} H/s${C.reset}` +
    `  attempts: ${C.dim}${attempts.toLocaleString()}${C.reset}`;

  // Overwrite baris ini saja (tidak scroll)
  process.stdout.write(`\r\x1b[2K${bar}`);
  _lastProgressLine = bar;
}

// ── Render dashboard — sekarang cukup log beberapa baris kunci
// dipanggil tiap round (bukan tiap hash), jadi tidak spam
let _lastRound = -1;

export function renderDashboard(data) {
  const {
    account = {},
    networkCalib = {},
    miningInterface = {},
    telemetry = {},
    currentNonce = 0,
    status = "IDLE",
    stats = { solved: 0, failed: 0, earned: 0 },
    round = 1,
  } = data;

  const statusColor =
    String(status).startsWith("SOLVED")     ? C.green  :
    status === "SUBMITTING"                  ? C.yellow :
    status === "COMPUTING"                   ? C.cyan   :
    status === "FETCHING CHALLENGE"          ? C.blue   : C.dim;

  // Saat mulai round baru — cetak separator + info round
  if (round !== _lastRound) {
    _lastRound = round;
    process.stdout.write("\r\x1b[2K"); // bersihkan progress bar
    console.log(
      `\n${C.dim}${"─".repeat(70)}${C.reset}\n` +
      `${ts()} ${C.magenta}${C.bold}[ROUND ${round}]${C.reset}` +
      `  akun: ${C.green}${account.name ?? "─"}${C.reset}` +
      `  balance: ${C.yellow}${account.balance ?? "─"} MU${C.reset}` +
      `  difficulty: ${C.cyan}${networkCalib.difficulty ?? "─"} zeros${C.reset}`
    );
    if (miningInterface.prefix) {
      console.log(
        `${ts()} ${C.blue}${C.bold}[CHALLENGE]${C.reset}` +
        `  prefix: ${C.dim}${miningInterface.prefix}${C.reset}` +
        `  reward: ${C.yellow}${miningInterface.reward ?? "?"} MU${C.reset}`
      );
    }
  }

  // Status update — hanya print saat status BERUBAH atau submit/solved
  if (
    status === "SUBMITTING"               ||
    String(status).startsWith("SOLVED")  ||
    String(status).startsWith("FAILED")  ||
    String(status).startsWith("ERROR")   ||
    status === "FETCHING CHALLENGE"
  ) {
    process.stdout.write("\r\x1b[2K");
    console.log(
      `${ts()} ${statusColor}${C.bold}[${status}]${C.reset}` +
      (String(status).startsWith("SOLVED") || String(status).startsWith("FAILED")
        ? `  solved: ${C.green}${stats.solved}${C.reset}  failed: ${C.red}${stats.failed}${C.reset}  earned: ${C.yellow}${stats.earned.toFixed(2)} MU${C.reset}`
        : "")
    );
  }

  // Progress bar live saat COMPUTING
  if (status === "COMPUTING") {
    logProgress(currentNonce, telemetry.hashRate, telemetry.attempts);
  }
}
