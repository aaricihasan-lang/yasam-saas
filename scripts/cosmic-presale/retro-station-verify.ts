/**
 * scripts/cosmic-presale/retro-station-verify.ts
 *
 * §21 — RETRO STATION EXACT-TIME BAĞIMSIZ DOĞRULAMA (daha önce NOT VERIFIED).
 *
 * Zincir:
 *   1) python swe_retro_stations.py → swe-retro-stations.json (Swiss Ephemeris exact station'lar)
 *   2) Bu script AE ile BAĞIMSIZ station bulur (velocity işaret değişimi + bisection)
 *   3) SWE ↔ AE exact-time karşılaştırması: total / match / mismatch / max Δ / mean Δ
 *   4) Üretim (retro.ts RETRO_PERIODS) tarih tutarlılığı: her AE station'ın TR-tarihi
 *      RETRO_PERIODS start(R)/end(D) kümesinde var mı
 *
 * Merkür/Venüs/Mars/Jüpiter/Satürn · 2024-2050.
 * Çalıştırma: npx tsx scripts/cosmic-presale/retro-station-verify.ts
 */
import * as AE from "astronomy-engine";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETRO_PERIODS } from "../../lib/cosmic/retro";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.COSMIC_PY || "python";
const SWE_JSON = join(HERE, "swe-retro-stations.json");

// ── 1) SWE referansı üret ────────────────────────────────────────────────────
if (!process.argv.includes("--reuse") || !existsSync(SWE_JSON)) {
  console.log("· python swe_retro_stations.py çalıştırılıyor…");
  const r = spawnSync(`${PY} "${join(HERE, "swe_retro_stations.py")}"`, { shell: true, encoding: "utf-8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (r.status !== 0) { console.error("SWE üretimi başarısız:\n" + (r.stderr || r.stdout)); process.exit(2); }
  console.log("  " + (r.stdout || "").trim());
}
type Station = { planet: string; kind: "R" | "D"; iso_utc: string; ms?: number };
const sweStations: Station[] = JSON.parse(readFileSync(SWE_JSON, "utf-8")).map((s: Station) => ({ ...s, ms: Date.parse(s.iso_utc) }));

// ── 2) AE ile bağımsız station bulma ─────────────────────────────────────────
const AE_BODY: Record<string, AE.Body> = {
  "Merkür": AE.Body.Mercury, "Venüs": AE.Body.Venus, "Mars": AE.Body.Mars,
  "Jüpiter": AE.Body.Jupiter, "Satürn": AE.Body.Saturn,
};
const STEP_DAYS: Record<string, number> = { "Merkür": 2, "Venüs": 3, "Mars": 3, "Jüpiter": 5, "Satürn": 5 };
const FROM = Date.UTC(2024, 0, 1), TO = Date.UTC(2051, 0, 1);
const TR = 3 * 3_600_000;

function vel(body: AE.Body, ms: number): number {
  const h = 6 * 3_600_000;
  let d = AE.Ecliptic(AE.GeoVector(body, new Date(ms + h), true)).elon - AE.Ecliptic(AE.GeoVector(body, new Date(ms - h), true)).elon;
  if (d > 180) d -= 360; if (d < -180) d += 360;
  return d;
}
const aeStations: Station[] = [];
for (const [planet, body] of Object.entries(AE_BODY)) {
  const step = STEP_DAYS[planet]! * 86_400_000;
  let prev = vel(body, FROM);
  for (let t = FROM; t < TO; t += step) {
    const nt = Math.min(t + step, TO);
    const v = vel(body, nt);
    if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) {
      let lo = t, hi = nt;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (Math.sign(vel(body, mid)) === Math.sign(prev)) lo = mid; else hi = mid; }
      aeStations.push({ planet, kind: prev > 0 ? "R" : "D", iso_utc: new Date(hi).toISOString(), ms: hi });
    }
    prev = v;
  }
}

// ── 3) SWE ↔ AE exact-time karşılaştırma ─────────────────────────────────────
let matched = 0, sweOnly = 0; let maxDeltaMin = 0, sumDeltaMin = 0;
const WINDOW = 2 * 86_400_000; // eşleştirme penceresi
const aeUsed = new Set<number>();
for (const s of sweStations) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < aeStations.length; i++) {
    if (aeUsed.has(i)) continue;
    const a = aeStations[i]!;
    if (a.planet !== s.planet || a.kind !== s.kind) continue;
    const d = Math.abs(a.ms! - s.ms!);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0 && bestD <= WINDOW) {
    matched++; aeUsed.add(best);
    const dm = bestD / 60000; maxDeltaMin = Math.max(maxDeltaMin, dm); sumDeltaMin += dm;
  } else sweOnly++;
}
const aeOnly = aeStations.length - aeUsed.size;

// ── 4) Üretim retro.ts tarih tutarlılığı ─────────────────────────────────────
// retro.ts, station'lardan PERİYOT kurar: her R'yi SONRAKİ D ile eşler; eşi pencere içinde
// yoksa (pencere sonundaki yarım R, veya pencere başındaki başıboş D) periyot ÜRETİLMEZ.
// Doğru "apples-to-apples" için AE station'larından AYNI eşleme mantığıyla periyot kurup
// RETRO_PERIODS ile karşılaştırırız (station ZAMANLARI SWE ile zaten 332/332 doğrulandı).
const trDate = (ms: number) => { const d = new Date(ms + TR); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; };
const aePeriods = new Set<string>();
for (const planet of Object.keys(AE_BODY)) {
  const st = aeStations.filter(s => s.planet === planet).sort((a, b) => a.ms! - b.ms!);
  for (let i = 0; i < st.length; i++) {
    if (st[i]!.kind !== "R") continue;
    const dir = st.slice(i + 1).find(s => s.kind === "D");
    if (!dir) continue; // pencere sonunda yarım kalan R → periyot yok (retro.ts ile aynı)
    aePeriods.add(`${planet}|${trDate(st[i]!.ms!)}|${trDate(dir.ms!)}`);
  }
}
const prodPeriods = new Set(RETRO_PERIODS.map(p => `${p.planet}|${p.start}|${p.end}`));
let prodMatch = 0, prodMiss = 0; const missSamples: string[] = [];
for (const k of aePeriods) { if (prodPeriods.has(k)) prodMatch++; else { prodMiss++; if (missSamples.length < 8) missSamples.push("AE-only " + k); } }
for (const k of prodPeriods) if (!aePeriods.has(k)) { prodMiss++; if (missSamples.length < 8) missSamples.push("PROD-only " + k); }

console.log("\n=== §21 Retro Station SWE ↔ AE Exact-Time ===");
console.log(`SWE station: ${sweStations.length} · AE station: ${aeStations.length}`);
console.log(`Eşleşen: ${matched} · SWE-only: ${sweOnly} · AE-only: ${aeOnly}`);
console.log(`Zaman farkı: max ${maxDeltaMin.toFixed(2)} dk · ort ${matched ? (sumDeltaMin/matched).toFixed(2) : "—"} dk`);
console.log("\n=== Üretim retro.ts tarih tutarlılığı (AE station → RETRO_PERIODS) ===");
console.log(`Eşleşen tarih: ${prodMatch} · Eşleşmeyen: ${prodMiss}`);
for (const m of missSamples) console.log("   miss: " + m);

// GEÇME ölçütü: küme tamlığı (SWE-only=0, AE-only=0), exact-time maxΔ ≤ 60 dk (station civarı
// yavaş hareket → dakika farkı ephemeris farkını büyütür; konum bazında ≪1° kalır), üretim
// tarih uyumu tam (prodMiss=0).
const pass = sweOnly === 0 && aeOnly === 0 && maxDeltaMin <= 60 && prodMiss === 0;
console.log(`\n=== SONUÇ: ${pass ? "✅ RETRO STATION BAĞIMSIZ DOĞRULANDI" : "❌ SAPMA VAR"} ===`);
process.exit(pass ? 0 : 1);
