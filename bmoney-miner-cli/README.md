# ⛏ B-Money CLI Mining Bot

> Bot mining otomatis untuk [B-Money Protocol](https://b-money.replit.app) — SHA-256 proof-of-work dengan dashboard real-time di terminal.

---

## 📁 Struktur File

```
bmoney-miner/
├── index.js              ← Entry point — jalankan ini
├── cookies.example.js    ← Contoh format cookie (aman untuk GitHub)
├── cookies.js            ← Cookie kamu (dibuat sendiri, TIDAK diupload)
├── package.json
├── .gitignore
├── README.md
└── src/
    ├── api.js            ← Komunikasi HTTP ke server B-Money
    ├── miner.js          ← SHA-256 mining engine (multi-thread)
    └── display.js        ← Tampilan dashboard CLI
```

---

## 🚀 Setup Pertama Kali

### 1. Clone repo
```bash
git clone https://github.com/USERNAME/bmoney-miner.git
cd bmoney-miner
```

### 2. Buat file cookies.js
```bash
cp cookies.example.js cookies.js
```

### 3. Isi cookie di `cookies.js`

Cara dapat cookie:
1. Buka https://b-money.replit.app → login
2. Tekan **F12** → **Application** → **Cookies** → klik domain `b-money.replit.app`
3. Copy nilai `connect.sid` dan `GAESA`
4. Paste ke `cookies.js`

```js
export const COOKIES = {
  "connect.sid": "s%3AEuuckXXRATmwTLwep1...",
  "GAESA":       "Cp4BMDAwN2I3MzRkOTQ3...",
};
```

### 4. Jalankan
```bash
node index.js
```

> Node.js v18+ — tidak perlu npm install!

---

## 💻 Cara Pakai

```bash
node index.js                          # mining terus
node index.js --threads 8              # pakai 8 CPU thread
node index.js --threads 4 --loops 10  # 10 round lalu berhenti
node index.js --help                   # lihat semua opsi
```

| Flag | Default | Keterangan |
|------|---------|------------|
| `--threads` | `4` | Jumlah CPU thread |
| `--loops` | `0` (∞) | Berapa round |
| `--delay` | `2` | Jeda antar round (detik) |

---

## 📊 Dashboard Terminal

```
┌────────────────────────────────────────────────────────────┐
│              ⛏  B-MONEY MINING BOT  —  Round 3            │
├────────────────────────────────────────────────────────────┤
│  👤 AKUN                                        Timoculz  │
│  💰 BALANCE                                     17.50 MU  │
├── NETWORK CALIBRATION  ON TARGET ──────────────────────────┤
│  TARGET SOLVE TIME                                    60s  │
│  NETWORK AVG SOLVE                                  48.3s  │
│  DIFFICULTY                                       4 ZEROS  │
│  NETWORK TOTAL                         401 challenges      │
├── MINING INTERFACE ────────────────────────────────────────┤
│  MINER ACCOUNT                                  Timoculz  │
│  PREFIX                           bmoney-challenge-abc...  │
│  REWARD                        12.5 MU (scales with diff) │
├── # TELEMETRY ─────────────────────────────────────────────┤
│  HASH RATE                                     6,100 H/s  │
│  ATTEMPTS                                        143,000  │
├── CURRENT NONCE ───────────────────────────────────────────┤
│                          143000                            │
├────────────────────────────────────────────────────────────┤
│  STATUS                                         COMPUTING  │
│  SOLVED                                               2   │
│  EARNED                                        25.00 MU   │
└────────────────────────────────────────────────────────────┘
```

---

## 🔧 Cara Kerja

```
1. GET  /api/mining/challenge  → dapat prefix + difficulty
2. SHA256(prefix + nonce) sampai hash mulai dengan "00000..."
3. POST /api/mining/submit     → kirim nonce & hash → dapat reward!
```

---

## ⚠️ Keamanan

`cookies.js` otomatis di-ignore oleh `.gitignore` — tidak akan terupload ke GitHub.

---

## 📄 Lisensi MIT
