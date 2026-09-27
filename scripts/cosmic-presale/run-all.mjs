#!/usr/bin/env node
/**
 * scripts/cosmic-presale/run-all.mjs
 * Kozmik Ajanda SATIŞ ÖNCESİ regresyon süiti orkestratörü.
 * Tüm presale harness'lerini sırayla çalıştırır; herhangi biri fail ederse exit 1.
 *
 * Çalıştırma: node scripts/cosmic-presale/run-all.mjs
 *             (veya npm run test:cosmic:presale)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STEPS = [
  ["tsx",  "planetary-hours-invariants.ts", "§18A Gezegen Saatleri değişmezleri (KAJ-P1-01)"],
  ["tsx",  "logic-guards.ts",               "§18F/§18J Tarih aralığı + rapor doğrulama"],
  ["tsx",  "hijri-fixtures.ts",             "§18E/§9 Hicri + Diyanet"],
  ["tsx",  "sun-sign-cusp.ts",              "§18C Güneş burcu cusp"],
  ["tsx",  "golden-verify.ts",              "§19 Golden dataset (SWE bağımsız)"],
  ["node", "security-static.mjs",           "§18G/H/§28 Güvenlik sözleşmesi"],
  ["tsx",  "hacamat-tenant-init.ts",        "§KAJ-P1-04/B Hacamat B-modeli + cosmic gerçek kapı"],
  ["tsx",  "full-sweep.ts",                 "§22/§18B Tam sweep + sunrise oracle"],
  ["tsx",  "retro-station-verify.ts",       "§21 Retro station SWE↔AE"],
];

const results = [];
for (const [runner, file, label] of STEPS) {
  console.log(`\n─── ${label} ───`);
  const cmd = runner === "tsx" ? `npx tsx "${join(HERE, file)}"` : `node "${join(HERE, file)}"`;
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  results.push({ label, ok: r.status === 0 });
}

console.log("\n\n=== SATIŞ ÖNCESİ SÜİT ÖZETİ ===");
let anyFail = false;
for (const r of results) { console.log(`  ${r.ok ? "✅" : "❌"} ${r.label}`); if (!r.ok) anyFail = true; }
console.log(`\nSONUÇ: ${anyFail ? "❌ EN AZ BİR HARNESS BAŞARISIZ" : "✅ TÜM PRESALE HARNESS'LERİ GEÇTİ"}`);
process.exit(anyFail ? 1 : 0);
