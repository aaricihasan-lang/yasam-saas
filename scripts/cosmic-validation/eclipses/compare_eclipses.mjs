/**
 * FAZ 3A / Adım 1A — Eclipse karşılaştırma harness'i (AE vs Swiss Ephemeris).
 * Peak time (dakika), tür (birebir), altitude (raporlu), obscuration (obscuration olarak).
 * Hybrid: AE'de yok → SWE hibritleri ayrıca işaretlenir.
 *
 * Çalıştır:  node scripts/cosmic-validation/eclipses/compare_eclipses.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (n) => {
  const p = join(HERE, n);
  if (!existsSync(p)) { console.error(`HATA: ${n} yok. Önce üreticileri çalıştırın.`); process.exit(1); }
  return JSON.parse(readFileSync(p, "utf-8"));
};
const ms = (iso) => Date.parse(iso);
const PEAK_MATCH_HR = 6;        // aynı tutulmayı eşleştirme penceresi
const PEAK_TOL_MIN = 2;         // tür-içi peak tolerans (dakika)

// SWE türü AE'ye indir: AE hibridi total/annular görür → karşılaştırmada "hibrit" özel.
function compareList(aeArr, sweArr, label, opts = {}) {
  const used = new Set();
  let matched = 0, typeOk = 0, typeMismatch = [], peakDiffs = [], altDiffs = [], hybrids = [];
  // Şehir modunda: yalnız İKİ motorda da ufuk üstü (alt>0) olaylar zaman toleransına girer.
  let visiblePeak = [], marginal = 0;
  for (const s of sweArr) {
    const st = ms(s.peakUTC);
    let best = -1, bd = Infinity;
    aeArr.forEach((a, i) => { if (used.has(i)) return; const d = Math.abs(ms(a.peakUTC) - st); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > PEAK_MATCH_HR * 3600_000) { typeMismatch.push(`SWE-only ${s.kind} @${s.peakUTC}`); continue; }
    used.add(best); matched++;
    const a = aeArr[best];
    const dMin = (ms(a.peakUTC) - st) / 60000;
    peakDiffs.push(dMin);
    if (s.kind === "hybrid") {
      hybrids.push(`${s.peakUTC} SWE=hybrid AE=${a.kind}`);
      // Kabul: production "hybrid" (katalog) VEYA AE-ham "total/annular" (hibrit AE'de yok)
      if (a.kind === "hybrid" || a.kind === "total" || a.kind === "annular") typeOk++;
      else typeMismatch.push(`HYBRID-FARK ${s.peakUTC} AE=${a.kind}`);
    } else if (a.kind === s.kind) {
      typeOk++;
    } else {
      typeMismatch.push(`TÜR ${s.peakUTC} SWE=${s.kind} AE=${a.kind}`);
    }
    if (opts.alt) {
      const bothVisible = a.altitude > 0 && s.altitude > 0;
      if (bothVisible) { visiblePeak.push(dMin); altDiffs.push(Math.abs(a.altitude - s.altitude)); }
      else marginal++;   // ufuk-altı / marjinal: zaman tanımı motora göre değişir
    }
  }
  const aeOnly = aeArr.length - used.size;
  // Şehir modunda zaman = yalnız görünür olaylar; aksi halde tüm eşleşenler
  const peakSet = opts.alt ? visiblePeak : peakDiffs;
  const absPeak = peakSet.map(Math.abs);
  const maxPeak = absPeak.length ? Math.max(...absPeak) : 0;
  const meanPeak = absPeak.length ? absPeak.reduce((x, y) => x + y, 0) / absPeak.length : 0;
  const maxAlt = altDiffs.length ? Math.max(...altDiffs) : null;
  return { label, ae: aeArr.length, swe: sweArr.length, matched, typeOk, aeOnly,
    visible: opts.alt ? visiblePeak.length : matched, marginal,
    maxPeakMin: +maxPeak.toFixed(3), meanPeakMin: +meanPeak.toFixed(3),
    maxPeakSec: +(maxPeak * 60).toFixed(1), maxAltDeg: maxAlt != null ? +maxAlt.toFixed(2) : null,
    typeMismatch, hybrids };
}

function printBlock(r) {
  console.log(`\n── ${r.label} ──`);
  console.log(`  AE ${r.ae} | SWE ${r.swe} | eşleşen ${r.matched} | AE-only ${r.aeOnly}`);
  const dt = r.maxPeakMin < 1 ? `${r.maxPeakSec}sn` : `${r.maxPeakMin}dk`;
  console.log(`  peak max|Δ| ${dt} · ort ${r.meanPeakMin}dk  (tolerans ${PEAK_TOL_MIN}dk)`);
  console.log(`  tür uyumu ${r.typeOk}/${r.matched}` + (r.maxAltDeg != null ? ` · altitude max|Δ| ${r.maxAltDeg}°` : ""));
  if (r.hybrids.length) { console.log(`  HİBRİT (SWE hibrit, AE'de yok) ${r.hybrids.length}:`); r.hybrids.slice(0, 6).forEach(h => console.log(`     ${h}`)); }
  if (r.typeMismatch.length) { console.log(`  UYUMSUZ ${r.typeMismatch.length}:`); r.typeMismatch.slice(0, 6).forEach(m => console.log(`     ${m}`)); }
}

function main() {
  const aeFile = process.argv[2] || "ae-eclipses.json"; // ör: compare_eclipses.mjs ae-prod-eclipses.json
  const ae = load(aeFile), swe = load("swe-eclipses.json");
  console.log(`=== ECLIPSE: ${aeFile} vs Swiss Ephemeris ===`);

  const rGlob = compareList(ae.solarGlobal, swe.solarGlobal, "GÜNEŞ (global)");
  printBlock(rGlob);
  const rLun = compareList(ae.lunar, swe.lunar, "AY");
  printBlock(rLun);

  console.log("\n── ŞEHİR BAZLI YEREL GÜNEŞ GÖRÜNÜRLÜĞÜ ──");
  const cityRes = [];
  for (const city of Object.keys(swe.localSolar)) {
    const r = compareList(ae.localSolar[city] || [], swe.localSolar[city] || [], city, { alt: true });
    cityRes.push(r);
    const dt = r.maxPeakMin < 1 ? `${r.maxPeakSec}sn` : `${r.maxPeakMin}dk`;
    console.log(`  ${city.padEnd(11)} eşleşen ${String(r.matched).padStart(2)} | görünür(alt>0) ${String(r.visible).padStart(2)} | marjinal ${r.marginal} | tür ${r.typeOk}/${r.matched} | görünür peakΔ ${dt} | altΔ ${r.maxAltDeg ?? "-"}°`);
  }

  const allHybrids = [...rGlob.hybrids, ...cityRes.flatMap(c => c.hybrids)];
  const peakPass = rGlob.maxPeakMin <= PEAK_TOL_MIN && rLun.maxPeakMin <= PEAK_TOL_MIN && cityRes.every(c => c.matched === 0 || c.maxPeakMin <= PEAK_TOL_MIN);
  const typePass = rGlob.typeOk === rGlob.matched && rLun.typeOk === rLun.matched && cityRes.every(c => c.typeOk === c.matched);

  console.log("\n=== GENEL ===");
  console.log(`  Peak zaman (≤${PEAK_TOL_MIN}dk)         : ${peakPass ? "GEÇTİ" : "İNCELE"}`);
  console.log(`  Tür uyumu (hibrit hariç)     : ${typePass ? "GEÇTİ" : "İNCELE"}`);
  console.log(`  SWE hibrit olay sayısı       : ${allHybrids.length} (AE'de yok → Adım 1B kararı)`);
  console.log(`  Obscuration                  : obscuration olarak kalır (magnitude ile karıştırılmaz)`);

  writeFileSync(join(HERE, "eclipse-report.json"), JSON.stringify({ solarGlobal: rGlob, lunar: rLun, cities: cityRes, hybrids: allHybrids }, null, 1), "utf-8");
  console.log(`\nAyrıntı -> ${join(HERE, "eclipse-report.json")}`);
}

main();
