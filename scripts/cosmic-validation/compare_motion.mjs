/**
 * FAZ 2C / Adım 2 — applying/separating + üçlü-geçiş BAĞIMSIZ DOĞRULAMASI.
 *
 * Üretim motorunun (ae-passes.json) üçlü-geçiş gruplamasını ve yön (signedSpeed işareti)
 * bilgisini, Swiss Ephemeris referansından (swe-reference.json) BAĞIMSIZ olarak yeniden
 * türetilen aynı bilgilerle kıyaslar.
 *
 * SWE tarafı: her exact için signedSpeed = speedA − speedB (pyswisseph hızları). Aynı
 * hedef-bazlı + işaret-değişimi kuralıyla gruplanır → passNumber/totalPassCount.
 *
 * Çalıştır:  node scripts/cosmic-validation/compare_motion.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_EPISODE_GAP_DAYS = 300;

function load(name) {
  const p = join(HERE, name);
  if (!existsSync(p)) { console.error(`HATA: ${name} yok. Önce üreticileri çalıştırın.`); process.exit(1); }
  return JSON.parse(readFileSync(p, "utf-8"));
}

const norm360 = (x) => ((x % 360) + 360) % 360;
const angDist = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; };
function targetsFor(angle) { if (angle === 0) return [0]; if (angle === 180) return [180]; return [angle, 360 - angle]; }
function targetOf(angle, lonA, lonB) {
  const raw = norm360(lonA - lonB);
  let best = 0, bd = Infinity;
  for (const t of targetsFor(angle)) { const d = angDist(raw, t); if (d < bd) { bd = d; best = t; } }
  return best;
}

// SWE olaylarını hedef-bazlı grupla (üretim motoruyla AYNI kural) → passNumber/totalPassCount
function groupSwe(events) {
  const byKey = new Map(); // bodyA|bodyB|angle|target
  for (const e of events) {
    const target = targetOf(e.angle, e.lonA, e.lonB);
    const k = `${e.bodyA}|${e.bodyB}|${e.angle}|${target}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ ...e, signedSpeed: e.speedA - e.speedB });
  }
  const annotated = []; // her olaya passNumber/totalPassCount eklenmiş
  for (const list of byKey.values()) {
    list.sort((a, b) => a.jd - b.jd);
    const groups = [];
    let cur = [];
    for (const r of list) {
      if (cur.length === 0) { cur = [r]; continue; }
      const prev = cur[cur.length - 1];
      const gap = r.jd - prev.jd;
      const reversal = Math.sign(r.signedSpeed) !== Math.sign(prev.signedSpeed);
      if (reversal && gap < MAX_EPISODE_GAP_DAYS) cur.push(r);
      else { groups.push(cur); cur = [r]; }
    }
    if (cur.length) groups.push(cur);
    for (const g of groups) g.forEach((r, idx) => annotated.push({ ...r, passNumber: idx + 1, totalPassCount: g.length }));
  }
  return annotated;
}

function main() {
  const swe = load("swe-reference.json");
  const ae = load("ae-passes.json");

  const sweAnn = groupSwe(swe.events);
  // key0 bazında SWE listesi (zaman ile eşleme)
  const sweByKey = new Map();
  for (const e of sweAnn) {
    const k = `${e.bodyA}|${e.bodyB}|${e.angle}`;
    if (!sweByKey.has(k)) sweByKey.set(k, []);
    sweByKey.get(k).push(e);
  }

  let matched = 0, signMismatch = 0, totalMismatch = 0, passNumMismatch = 0;
  const mismatchSamples = [];
  for (const a of ae.events) {
    const k = `${a.bodyA}|${a.bodyB}|${a.angle}`;
    const cands = sweByKey.get(k) || [];
    let best = null, bd = Infinity;
    for (const s of cands) { const d = Math.abs(s.jd - a.jd); if (d < bd) { bd = d; best = s; } }
    if (!best || bd > 0.5) continue; // 12 saat içinde eşleşme
    matched++;
    const sSign = Math.sign(best.signedSpeed), aSign = Math.sign(a.signedSpeed);
    if (sSign !== aSign) { signMismatch++; if (mismatchSamples.length < 6) mismatchSamples.push(`SIGN ${k} @${a.iso}`); }
    if (best.totalPassCount !== a.totalPassCount) { totalMismatch++; if (mismatchSamples.length < 6) mismatchSamples.push(`TOTAL ${k} swe=${best.totalPassCount} ae=${a.totalPassCount} @${a.iso}`); }
    if (best.passNumber !== a.passNumber) { passNumMismatch++; }
  }

  // Üçlü-geçiş dağılımı
  const dist = {};
  for (const a of ae.events) { const t = a.totalPassCount; dist[t] = (dist[t] || 0) + 1; }
  const triples = ae.events.filter(e => e.totalPassCount === 3);
  const tripleEpisodes = new Set(triples.map(e => `${e.bodyA}|${e.bodyB}|${e.angle}|${Math.round(e.jd / 30)}`)).size;
  const stationFlagged = ae.events.filter(e => e.isStationNearby).length;

  console.log("\n=== FAZ 2C / Adım 2 — APPLYING/SEPARATING + ÜÇLÜ GEÇİŞ DOĞRULAMASI ===");
  console.log(`AE geçiş: ${ae.events.length} | SWE referans: ${swe.events.length} | eşleşen: ${matched}`);
  console.log(`Self-check (exact±30dk yön): ${ae.selfCheck.checked - ae.selfCheck.violations}/${ae.selfCheck.checked} doğru, ${ae.selfCheck.violations} ihlal`);
  console.log("");
  console.log("totalPassCount dağılımı (AE):");
  Object.keys(dist).sort((a, b) => a - b).forEach(t => console.log(`   ${t}-geçiş: ${dist[t]} olay`));
  console.log(`Üçlü-geçiş epizodu (yaklaşık): ${tripleEpisodes} | istasyon-yakını işaretli geçiş: ${stationFlagged}`);
  console.log("");
  console.log("AE vs SWE (bağımsız yeniden türetme) uyumu:");
  console.log(`   signedSpeed işaret uyumu : ${matched - signMismatch}/${matched}  (uyumsuz: ${signMismatch})`);
  console.log(`   totalPassCount uyumu     : ${matched - totalMismatch}/${matched}  (uyumsuz: ${totalMismatch})`);
  console.log(`   passNumber uyumu         : ${matched - passNumMismatch}/${matched}  (uyumsuz: ${passNumMismatch})`);
  if (mismatchSamples.length) { console.log("   örnek uyumsuzluklar:"); mismatchSamples.forEach(s => console.log("     " + s)); }

  const pass = ae.selfCheck.violations === 0 && signMismatch === 0 && totalMismatch === 0 && passNumMismatch === 0;
  console.log(`\nGENEL: ${pass ? "GEÇTİ" : "BAŞARISIZ"} (self-check + işaret + üçlü-geçiş gruplaması)`);
}

main();
