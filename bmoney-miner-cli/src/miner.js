// ============================================================
//  src/miner.js — SHA-256 Mining Engine (Worker Threads)
// ============================================================
//
//  Cara kerja:
//  - Main thread membagi pekerjaan ke beberapa Worker
//  - Setiap Worker mencoba nonce yang berbeda (tidak tumpang tindih)
//  - Worker pertama yang menemukan hash valid menang
//  - Semua worker lain langsung dihentikan
//
//  Contoh:
//    4 thread, nonce dimulai dari 0:
//    Thread 0 → 0, 4, 8, 12, ...
//    Thread 1 → 1, 5, 9, 13, ...
//    Thread 2 → 2, 6, 10, 14, ...
//    Thread 3 → 3, 7, 11, 15, ...
// ============================================================

import crypto from "crypto";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

// ── WORKER CODE — hanya jalan jika file ini dijalankan sebagai worker ──
if (!isMainThread) {
  const { prefix, difficulty, startNonce, step } = workerData;
  const target = "0".repeat(difficulty); // contoh difficulty 4 → "0000"

  let nonce = startNonce;
  let count = 0;

  while (true) {
    // Hitung SHA256(prefix + nonce)
    const input = `${prefix}${nonce}`;
    const hash = crypto.createHash("sha256").update(input).digest("hex");
    count++;

    // Cek apakah hash dimulai dengan 'difficulty' buah angka 0
    if (hash.startsWith(target)) {
      parentPort.postMessage({ found: true, nonce, hash, count });
      break;
    }

    // Kirim progress setiap 10.000 hash
    if (count % 10_000 === 0) {
      parentPort.postMessage({ found: false, count });
      count = 0; // reset counter lokal (sudah dikirim)
    }

    nonce += step;
  }
}

// ── MAIN THREAD FUNCTION ──────────────────────────────────────

/**
 * Jalankan mining dengan multi-thread
 * @param {string} prefix      - challenge prefix dari server
 * @param {number} difficulty  - jumlah leading zeros yang dibutuhkan
 * @param {number} numThreads  - jumlah CPU thread
 * @param {function} onProgress - callback(totalHashes, elapsedSec)
 * @returns {{ nonce, hash, elapsed, totalHashes }}
 */
export function mine(prefix, difficulty, numThreads, onProgress) {
  return new Promise((resolve, reject) => {
    const workers = [];
    let totalHashes = 0;
    const startTime = Date.now();
    let resolved = false;

    // Progress ticker setiap 500ms
    const ticker = setInterval(() => {
      if (onProgress) {
        const elapsed = (Date.now() - startTime) / 1000;
        onProgress(totalHashes, elapsed);
      }
    }, 500);

    function cleanup() {
      clearInterval(ticker);
      workers.forEach(w => w.terminate());
    }

    // Buat worker per thread
    for (let i = 0; i < numThreads; i++) {
      const worker = new Worker(__filename, {
        workerData: {
          prefix,
          difficulty,
          startNonce: i,       // mulai dari nonce yang berbeda
          step: numThreads,    // loncat sebesar jumlah thread
        },
      });

      worker.on("message", (msg) => {
        totalHashes += msg.count;

        if (msg.found && !resolved) {
          resolved = true;
          cleanup();

          const elapsed = (Date.now() - startTime) / 1000;
          resolve({
            nonce:       msg.nonce,
            hash:        msg.hash,
            elapsed,
            totalHashes,
            hps: totalHashes / Math.max(elapsed, 0.001),
          });
        }
      });

      worker.on("error", (err) => {
        if (!resolved) {
          cleanup();
          reject(err);
        }
      });

      workers.push(worker);
    }
  });
}
