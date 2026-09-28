#!/usr/bin/env node
/**
 * scripts/cosmic-longrange/run-all.mjs — Kozmik Ajanda 01.01.2026–31.12.2100 UZUN DÖNEM DOĞRULAMA.
 *
 * Zincir: (1) Swiss Ephemeris referans burç kalışları → (2) production dump'ları (paralel, 4 tarayıcı
 * saat dilimi) → (3) JPL Horizons indir + karşılaştır → (4) compare.py (SWE/UQ/USNO-kalibreli toleranslar).
 * Gereksinim: Python 3 + pyswisseph + hijridate, SE_EPHE_PATH (Swiss Ephemeris .se1), HIJRIDATE_PATH (opsiyonel).
 * Çıktı: <outDir>/results.json + jpl_results.json (gitignore). exit 0 = PASS, 1 = FAIL.
 *
 * Kullanım: node scripts/cosmic-longrange/run-all.mjs [outDir] [--skip-jpl]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(HERE, "out"));
const SKIP_JPL = process.argv.includes("--skip-jpl");
fs.mkdirSync(OUT, { recursive: true });
const TSX = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const DUMP = path.join(HERE, "prod_dump.ts");

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, PYTHONIOENCODING: "utf-8", ...env } });
    p.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → ${code}`))));
  });
}
const q = s => (process.platform === "win32" ? `"${s}"` : s);
const t0 = Date.now();
await run("python", [q(path.join(HERE, "compare.py")), "ref-stays", q(OUT)]);
await Promise.all([
  run(TSX, [q(DUMP), "positions", "2026", "2050", q(OUT)]),
  run(TSX, [q(DUMP), "positions", "2051", "2075", q(OUT)]),
  run(TSX, [q(DUMP), "positions", "2076", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "moonevents", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "retro", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "signperiod", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "phours", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "eclipses", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "aspects", "2026", "2100", q(OUT)]),
  run(TSX, [q(DUMP), "hacamat", "2026", "2100", q(OUT)]),
]);
for (const tz of ["Europe/Istanbul", "UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
  await run(TSX, [q(DUMP), "hijri", "2026", "2100", q(OUT)], { TZ: tz });
}
let jplOk = true;
if (!SKIP_JPL) {
  await run("python", [q(path.join(HERE, "fetch_jpl.py")), q(OUT)]);
  try { await run(TSX, [q(path.join(HERE, "jpl_cmp.ts")), q(path.join(OUT, "jpl")), q(path.join(OUT, "jpl_results.json"))]); }
  catch { jplOk = false; }
}
let cmpOk = true;
try { await run("python", [q(path.join(HERE, "compare.py")), "all", q(OUT)]); } catch { cmpOk = false; }
console.log(`\n=== cosmic-longrange 2026–2100: compare ${cmpOk ? "PASS" : "FAIL"} · JPL ${SKIP_JPL ? "atlandı" : jplOk ? "PASS" : "FAIL"} · ${((Date.now() - t0) / 1000).toFixed(0)} sn ===`);
process.exit(cmpOk && jplOk ? 0 : 1);
