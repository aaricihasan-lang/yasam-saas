/**
 * FAZ 3C / Adim 1 — Lunar Orbit karsilastirma harness'i (AE vs Swiss Ephemeris).
 *   1A: mesafe ornekleri + apsis (perigee/apogee) zaman+mesafe.
 *   1B: syzygy (yeniay/dolunay) zaman+mesafe + supermoon/micromoon siniflandirma + sabit esik.
 *
 * Calistir:  node scripts/cosmic-validation/lunarorbit/compare_lunarorbit.mjs [ae-dosya]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (n) => { const p = join(HERE, n); if (!existsSync(p)) { console.error(`HATA: ${n} yok.`); process.exit(1); } return JSON.parse(readFileSync(p, "utf-8")); };
const ms = (iso) => Date.parse(iso);
const minDiff = (a, b) => Math.abs(ms(a) - ms(b)) / 60000;

const APSIS_MATCH_HR = 24;     // ayni apsis (~13.8 gun arayla)
const SYZYGY_MATCH_HR = 12;
// Apsis zamani DUZ ekstremumdur (d(dist)/dt=0): ~27km model farki dakikalik zaman
// farkina donusur. APOGEE en duz (Ay en yavas) -> ~17dk; perigee daha keskin -> ~10dk.
// Mesafe/tur/kume kesin uyusur; yalniz zaman "yumusak". Tolerans apogee gercegine gore 20dk.
const APSIS_TIME_TOL_MIN = 20;
const SYZYGY_TIME_TOL_MIN = 2; // syzygy ~saniye
const DIST_TOL_KM = 100;       // mesafe km duzeyi

function stat(arr) {
  if (!arr.length) return { max: 0, mean: 0 };
  return { max: Math.max(...arr), mean: arr.reduce((a, b) => a + b, 0) / arr.length };
}
const secOrMin = (m) => (m < 1 ? `${(m * 60).toFixed(1)}sn` : `${m.toFixed(2)}dk`);

function main() {
  const aeFile = process.argv[2] || "ae-lunarorbit.json";
  const ae = load(aeFile), swe = load("swe-lunarorbit.json");
  console.log(`=== LUNAR ORBIT: ${aeFile} vs Swiss Ephemeris ===`);

  // toplulastir
  let distDiffs = [], apTimeDiffs = [], apDistDiffs = [], apKindMis = 0, apMatched = 0, apAeOnly = 0, apSweOnly = 0;
  let syTimeDiffs = [], syDistDiffs = [], syMatched = 0, superMis = 0, microMis = 0, nolleVsFixedSuper = 0, nolleVsFixedMicro = 0;
  let superCount = 0, microCount = 0, closeDiffs = [], farDiffs = [];
  const samples = [];

  const sweW = Object.fromEntries(swe.windows.map(w => [w.id, w]));
  for (const aw of ae.windows) {
    const sw = sweW[aw.id]; if (!sw) continue;
    // mesafe ornekleri (zaman birebir hizali)
    aw.distanceSamples.forEach((a, i) => { const s = sw.distanceSamples[i]; if (s) distDiffs.push(Math.abs(a.distKm - s.distKm)); });
    // en yakin / en uzak
    if (aw.closestKm != null && sw.closestKm != null) closeDiffs.push(Math.abs(aw.closestKm - sw.closestKm));
    if (aw.farthestKm != null && sw.farthestKm != null) farDiffs.push(Math.abs(aw.farthestKm - sw.farthestKm));
    // apsisler
    const usedA = new Set();
    for (const a of aw.apsides) {
      let best = -1, bd = Infinity;
      sw.apsides.forEach((s, i) => { if (usedA.has(i)) return; const d = minDiff(a.timeUTC, s.timeUTC); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > APSIS_MATCH_HR * 60) { apAeOnly++; continue; }
      usedA.add(best); apMatched++;
      const s = sw.apsides[best];
      apTimeDiffs.push(bd); apDistDiffs.push(Math.abs(a.distKm - s.distKm));
      if (a.kind !== s.kind) apKindMis++;
    }
    apSweOnly += sw.apsides.length - usedA.size;
    // syzygy
    const usedS = new Set();
    for (const a of aw.syzygies) {
      let best = -1, bd = Infinity;
      sw.syzygies.forEach((s, i) => { if (usedS.has(i) || s.phase !== a.phase) return; const d = minDiff(a.timeUTC, s.timeUTC); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > SYZYGY_MATCH_HR * 60) continue;
      usedS.add(best); syMatched++;
      const s = sw.syzygies[best];
      syTimeDiffs.push(bd); syDistDiffs.push(Math.abs(a.distKm - s.distKm));
      if (Boolean(a.supermoon) !== Boolean(s.supermoon)) superMis++;
      if (Boolean(a.micromoon) !== Boolean(s.micromoon)) microMis++;
      if (a.supermoon) superCount++;
      if (a.micromoon) microCount++;
      // Nolle vs sabit esik (AE tarafi)
      if (Boolean(a.supermoon) !== Boolean(a.fixedSuper)) nolleVsFixedSuper++;
      if (Boolean(a.micromoon) !== Boolean(a.fixedMicro)) nolleVsFixedMicro++;
      samples.push({ phase: a.phase, t: a.timeUTC, aeDist: a.distKm, sweDist: s.distKm, super: a.supermoon, micro: a.micromoon, pct: a.nollePct });
    }
  }

  const sDist = stat(distDiffs), sApT = stat(apTimeDiffs), sApD = stat(apDistDiffs), sSyT = stat(syTimeDiffs), sSyD = stat(syDistDiffs);
  console.log(`\n-- 1A: MESAFE + APSIS --`);
  console.log(`  anlik mesafe ornegi  : ${distDiffs.length} | max|d| ${sDist.max.toFixed(1)}km · ort ${sDist.mean.toFixed(1)}km  (tol ${DIST_TOL_KM}km)`);
  console.log(`  en yakin Ay (yil)    : max|d| ${(closeDiffs.length ? Math.max(...closeDiffs) : 0).toFixed(1)}km`);
  console.log(`  en uzak Ay (yil)     : max|d| ${(farDiffs.length ? Math.max(...farDiffs) : 0).toFixed(1)}km`);
  console.log(`  apsis eslesen        : ${apMatched} (AE-only ${apAeOnly}, SWE-only ${apSweOnly}) | tur uyumu ${apMatched - apKindMis}/${apMatched}`);
  console.log(`  apsis zaman max|d|   : ${secOrMin(sApT.max)} · ort ${secOrMin(sApT.mean)}  (tol ${APSIS_TIME_TOL_MIN}dk; saniye iddia edilmez)`);
  console.log(`  apsis mesafe max|d|  : ${sApD.max.toFixed(1)}km · ort ${sApD.mean.toFixed(1)}km`);
  console.log(`\n-- 1B: SYZYGY + SUPERMOON/MICROMOON --`);
  console.log(`  syzygy eslesen       : ${syMatched}`);
  console.log(`  syzygy zaman max|d|  : ${secOrMin(sSyT.max)} · ort ${secOrMin(sSyT.mean)}  (tol ${SYZYGY_TIME_TOL_MIN}dk)`);
  console.log(`  syzygy mesafe max|d| : ${sSyD.max.toFixed(1)}km · ort ${sSyD.mean.toFixed(1)}km`);
  console.log(`  Supermoon (AE)       : ${superCount} | AE-SWE etiket uyumsuz ${superMis}`);
  console.log(`  Micromoon (AE)       : ${microCount} | AE-SWE etiket uyumsuz ${microMis}`);
  console.log(`  Nolle vs sabit esik  : super farkli ${nolleVsFixedSuper}, micro farkli ${nolleVsFixedMicro} (capraz kontrol; ayni olmasi BEKLENMEZ)`);

  console.log(`\n  Ornek supermoon/micromoon:`);
  samples.filter(s => s.super || s.micro).slice(0, 6).forEach(s =>
    console.log(`    ${s.super ? "SUPER" : "MICRO"} ${s.phase} ${s.t}  AE ${s.aeDist}km / SWE ${s.sweDist}km  (nolle ${(s.pct * 100).toFixed(1)}%)`));

  const distPass = sDist.max <= DIST_TOL_KM && sApD.max <= DIST_TOL_KM && sSyD.max <= DIST_TOL_KM;
  const apsisPass = sApT.max <= APSIS_TIME_TOL_MIN && apKindMis === 0 && apAeOnly === 0 && apSweOnly === 0;
  const syzPass = sSyT.max <= SYZYGY_TIME_TOL_MIN;
  const classPass = superMis === 0 && microMis === 0;
  console.log(`\n=== GENEL ===`);
  console.log(`  Mesafe (<=${DIST_TOL_KM}km)        : ${distPass ? "GECTI" : "INCELE"}`);
  console.log(`  Apsis (zaman<=${APSIS_TIME_TOL_MIN}dk, tur, kume): ${apsisPass ? "GECTI" : "INCELE"}`);
  console.log(`  Syzygy (zaman<=${SYZYGY_TIME_TOL_MIN}dk)       : ${syzPass ? "GECTI" : "INCELE"}`);
  console.log(`  Supermoon/Micromoon etiket : ${classPass ? "GECTI" : "INCELE"}`);

  writeFileSync(join(HERE, "lunarorbit-report.json"), JSON.stringify({
    dist: sDist, apsisTime: sApT, apsisDist: sApD, apMatched, apKindMis, apAeOnly, apSweOnly,
    syzygyTime: sSyT, syzygyDist: sSyD, syMatched, superCount, microCount, superMis, microMis,
    nolleVsFixedSuper, nolleVsFixedMicro, samples,
  }, null, 1), "utf-8");
  console.log(`\nAyrinti -> ${join(HERE, "lunarorbit-report.json")}`);
}

main();
