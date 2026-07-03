/**
 * FAZ 5 / P5e-2 — GLOBAL yerel güneş tutulması karşılaştırma harness'i.
 * Production (getSolarCityVisibility + WORLD_LOCATIONS)  vs  Swiss Ephemeris.
 *
 * SELF-CONTAINED: FAZ 3A eclipses/ klasöründen HİÇBİR import yok. run-all'a BAĞLI DEĞİL.
 *
 * Kıyaslanan (şehir bazlı, id anahtarlı):
 *   - peak UTC farkı  (yalnız iki motorda da ufuk üstü olaylarda)   tolerans ≤ 2 dk
 *   - altitude farkı  (iki motorda da alt>0)                        tolerans ≤ 0.5°
 *   - obscuration farkı (iki motorda da alt>0)                      tolerans ≤ 0.02
 *   - görünürlük uyumu (alt>0 işareti; ufuk-yakını marjinal sayılır)  hard mismatch = 0
 *   - şehir sayısı (10 = 10)
 *
 * Çalıştır:  node scripts/cosmic-validation/global/compare_global_eclipses.mjs
 * Çıktı: konsol raporu + global-eclipse-report.json; exit 0 (PASS) / 1 (FAIL).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (n) => {
  const p = join(HERE, n);
  if (!existsSync(p)) {
    console.error(`HATA: ${n} yok. Önce üreticileri çalıştırın (swe_global_eclipses.py + prod_global_runner.ts).`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, "utf-8"));
};
const ms = (iso) => Date.parse(iso);

const PEAK_MATCH_HR = 6;        // aynı olayı eşleştirme penceresi
const PEAK_TOL_MIN = 2;         // görünür peak zaman toleransı (dk)
const ALT_TOL_DEG = 0.5;        // altitude toleransı (derece)
const OBSC_TOL = 0.02;          // obscuration (alan) toleransı
const HORIZON_MARGIN_DEG = 0.5; // ufuk-yakını marjinal bant (görünürlük uyumu için)

// Bir şehir için SWE olaylarını production olaylarına en yakın peak ile eşle.
function compareCity(prodArr, sweArr, label) {
  const used = new Set();
  let matched = 0, marginal = 0, totalEvents = 0;
  const visiblePeak = [], altDiffs = [], obscDiffs = [], visMismatch = [];

  for (const s of sweArr) {
    const st = ms(s.peakUTC);
    let best = -1, bd = Infinity;
    prodArr.forEach((p, i) => {
      if (used.has(i)) return;
      const d = Math.abs(ms(p.peakUTC) - st);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0 || bd > PEAK_MATCH_HR * 3600_000) continue; // SWE-only
    used.add(best); matched++;
    const p = prodArr[best];
    const dMin = (ms(p.peakUTC) - st) / 60000;

    const sVis = s.altitude > 0, pVis = p.altitude > 0;
    const bothVisible = sVis && pVis;
    // TOTAL tutulmada obscuration definisyonel olarak 1.0 (güneş %100 örtülü). SWE ham
    // attr[2] burada >1 verir (klamplenmemiş geometrik oran); production 1.0 raporlar →
    // ikisi de "tam örtülü" demektir. Bu yüzden obscuration farkı TOTAL olaylarda ölçülmez.
    const isTotal = s.kind === "total" || p.kind === "total";
    if (isTotal) totalEvents++;
    if (bothVisible) {
      visiblePeak.push(Math.abs(dMin));
      altDiffs.push(Math.abs(p.altitude - s.altitude));
      if (!isTotal && s.obscuration != null && p.obscuration != null) {
        obscDiffs.push(Math.abs(p.obscuration - s.obscuration));
      }
    } else {
      marginal++;
    }
    // Görünürlük uyumu: alt>0 işareti; ufuk-yakını (min|alt|≤margin) fark → marjinal, gerçek değil.
    if (sVis !== pVis) {
      const nearHorizon = Math.min(Math.abs(s.altitude), Math.abs(p.altitude)) <= HORIZON_MARGIN_DEG;
      if (!nearHorizon) visMismatch.push(`${s.peakUTC} SWEalt=${s.altitude}° PRODalt=${p.altitude}°`);
    }
  }

  const sweOnly = sweArr.length - matched;
  const prodOnly = prodArr.length - used.size;
  const mx = (a) => (a.length ? Math.max(...a) : null);
  const maxPeak = mx(visiblePeak), maxAlt = mx(altDiffs), maxObsc = mx(obscDiffs);
  return {
    label, prod: prodArr.length, swe: sweArr.length, matched,
    visible: visiblePeak.length, marginal, totalEvents, sweOnly, prodOnly,
    maxPeakMin: maxPeak != null ? +maxPeak.toFixed(3) : null,
    maxPeakSec: maxPeak != null ? +(maxPeak * 60).toFixed(1) : null,
    maxAltDeg: maxAlt != null ? +maxAlt.toFixed(3) : null,
    maxObsc: maxObsc != null ? +maxObsc.toFixed(4) : null,
    visMismatch,
  };
}

function main() {
  const prod = load("ae-prod-global-eclipses.json");
  const swe = load("swe-global-eclipses.json");
  console.log("=== GLOBAL ECLIPSE: PRODUCTION vs Swiss Ephemeris ===");
  console.log(`Aralık ${swe.range?.startYear}-${swe.range?.endYear} · şehir: PROD ${prod.cityCount} / SWE ${swe.cityCount}\n`);

  const cityIds = Object.keys(swe.localSolar);
  const cityRes = [];
  console.log("── ŞEHİR BAZLI YEREL GÜNEŞ GÖRÜNÜRLÜĞÜ ──");
  for (const id of cityIds) {
    const r = compareCity(prod.localSolar[id] || [], swe.localSolar[id] || [], id);
    cityRes.push(r);
    const dt = r.maxPeakMin == null ? "-" : (r.maxPeakMin < 1 ? `${r.maxPeakSec}sn` : `${r.maxPeakMin}dk`);
    console.log(
      `  ${id.padEnd(15)} eşleşen ${String(r.matched).padStart(2)} | görünür ${String(r.visible).padStart(2)}` +
      ` | marjinal ${r.marginal} | SWE-only ${r.sweOnly} | PROD-only ${r.prodOnly}` +
      ` | peakΔ ${dt} | altΔ ${r.maxAltDeg ?? "-"}° | obscΔ ${r.maxObsc ?? "-"} | vis-uyumsuz ${r.visMismatch.length}`,
    );
  }

  // Genel istatistik
  const collect = (key) => cityRes.map((c) => c[key]).filter((v) => v != null);
  const overallMaxPeak = collect("maxPeakMin").length ? Math.max(...collect("maxPeakMin")) : null;
  const overallMaxAlt = collect("maxAltDeg").length ? Math.max(...collect("maxAltDeg")) : null;
  const overallMaxObsc = collect("maxObsc").length ? Math.max(...collect("maxObsc")) : null;
  const totalVisMismatch = cityRes.reduce((n, c) => n + c.visMismatch.length, 0);
  const totalMarginal = cityRes.reduce((n, c) => n + c.marginal, 0);
  const totalMatched = cityRes.reduce((n, c) => n + c.matched, 0);
  const totalTotalEvents = cityRes.reduce((n, c) => n + c.totalEvents, 0);

  const cityCountPass = prod.cityCount === 10 && swe.cityCount === 10 && cityIds.length === 10;
  const peakPass = overallMaxPeak == null || overallMaxPeak <= PEAK_TOL_MIN;
  const altPass = overallMaxAlt == null || overallMaxAlt <= ALT_TOL_DEG;
  const obscPass = overallMaxObsc == null || overallMaxObsc <= OBSC_TOL;
  const visPass = totalVisMismatch === 0;
  const PASS = cityCountPass && peakPass && altPass && obscPass && visPass;

  const fmtPeak = overallMaxPeak == null ? "-" : (overallMaxPeak < 1 ? `${(overallMaxPeak * 60).toFixed(1)}sn` : `${overallMaxPeak}dk`);
  console.log("\n=== GENEL ===");
  console.log(`  Şehir sayısı (10=10)          : ${cityCountPass ? "GEÇTİ" : "İNCELE"} (PROD ${prod.cityCount} / SWE ${swe.cityCount})`);
  console.log(`  Eşleşen olay / marjinal        : ${totalMatched} / ${totalMarginal}`);
  console.log(`  Peak zaman  (≤${PEAK_TOL_MIN}dk)          : ${peakPass ? "GEÇTİ" : "İNCELE"} (max ${fmtPeak})`);
  console.log(`  Altitude    (≤${ALT_TOL_DEG}°)          : ${altPass ? "GEÇTİ" : "İNCELE"} (max ${overallMaxAlt ?? "-"}°)`);
  console.log(`  Obscuration (≤${OBSC_TOL})       : ${obscPass ? "GEÇTİ" : "İNCELE"} (max ${overallMaxObsc ?? "-"}; total olaylar hariç: ${totalTotalEvents})`);
  console.log(`  Görünürlük uyumu (hard=0)      : ${visPass ? "GEÇTİ" : "İNCELE"} (uyumsuz ${totalVisMismatch})`);
  if (totalVisMismatch) {
    cityRes.filter((c) => c.visMismatch.length).forEach((c) => {
      console.log(`     [${c.label}]`); c.visMismatch.slice(0, 4).forEach((m) => console.log(`        ${m}`));
    });
  }

  const report = {
    range: swe.range,
    tolerances: { peakMin: PEAK_TOL_MIN, altDeg: ALT_TOL_DEG, obsc: OBSC_TOL, horizonMarginDeg: HORIZON_MARGIN_DEG },
    overall: {
      cityCount: { prod: prod.cityCount, swe: swe.cityCount, pass: cityCountPass },
      maxPeakMin: overallMaxPeak, maxAltDeg: overallMaxAlt, maxObsc: overallMaxObsc,
      totalMatched, totalMarginal, totalVisMismatch, totalEclipseEvents: totalTotalEvents,
      pass: { peak: peakPass, altitude: altPass, obscuration: obscPass, visibility: visPass, overall: PASS },
    },
    cities: cityRes,
  };
  writeFileSync(join(HERE, "global-eclipse-report.json"), JSON.stringify(report, null, 1), "utf-8");
  console.log(`\nAyrıntı -> ${join(HERE, "global-eclipse-report.json")}`);
  console.log(PASS ? "\nSONUÇ: ✅ PASS (exit 0)" : "\nSONUÇ: ❌ FAIL — incele (exit 1)");
  process.exit(PASS ? 0 : 1);
}

main();
