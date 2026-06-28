/**
 * FAZ 3A / Adım 1A — ASTRONOMY ENGINE eclipse üreticisi.
 * swe_eclipses.py ile AYNI test setini üretir; compare_eclipses.mjs kıyaslar.
 *
 * NOT: Doğrulama scaffold'u — production DEĞİL. lib/cosmic'e dokunmaz.
 * AE'de Hybrid YOK (kind: penumbral/partial/annular/total); hibritler total/annular görünür.
 * AE obscuration = disk ALAN oranı; magnitude (çap) VERMEZ (yalnız obscuration kaydedilir).
 *
 * Çalıştır:  node scripts/cosmic-validation/eclipses/ae_eclipses.mjs
 */
import * as AE from "astronomy-engine";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const isoZ = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const trISO = (d) => isoZ(new Date(d.getTime() + 3 * 3600_000));

function enumerateSolarGlobal(startY, endY) {
  const out = [];
  const endMs = Date.UTC(endY + 1, 0, 1);
  let e = AE.SearchGlobalSolarEclipse(new Date(Date.UTC(startY, 0, 1)));
  while (e.peak.date.getTime() < endMs && out.length < 400) {
    out.push({
      kind: e.kind, peakUTC: isoZ(e.peak.date), peakTR: trISO(e.peak.date),
      centerLat: e.latitude ?? null, centerLon: e.longitude ?? null,
      obscuration: e.obscuration ?? null, distanceKm: e.distance ?? null,
    });
    e = AE.NextGlobalSolarEclipse(e.peak);
  }
  return out;
}

function enumerateLunar(startY, endY) {
  const out = [];
  const endMs = Date.UTC(endY + 1, 0, 1);
  let e = AE.SearchLunarEclipse(new Date(Date.UTC(startY, 0, 1)));
  while (e.peak.date.getTime() < endMs && out.length < 400) {
    // AE: sd_* yarı-süreler (dk). Tam süre = 2*sd.
    out.push({
      kind: e.kind, peakUTC: isoZ(e.peak.date), peakTR: trISO(e.peak.date),
      obscuration: e.obscuration ?? null,
      durPenumMin: e.sd_penum ? +(2 * e.sd_penum).toFixed(1) : null,
      durPartialMin: e.sd_partial ? +(2 * e.sd_partial).toFixed(1) : null,
      durTotalMin: e.sd_total ? +(2 * e.sd_total).toFixed(1) : null,
    });
    e = AE.NextLunarEclipse(e.peak);
  }
  return out;
}

function enumerateLocalSolar(startY, endY, city) {
  const out = [];
  const endMs = Date.UTC(endY + 1, 0, 1);
  const obs = new AE.Observer(city.lat, city.lon, city.elev);
  let e;
  try { e = AE.SearchLocalSolarEclipse(new Date(Date.UTC(startY, 0, 1)), obs); }
  catch { return out; }
  while (e.peak.time.date.getTime() < endMs && out.length < 250) {
    out.push({
      kind: e.kind, peakUTC: isoZ(e.peak.time.date), peakTR: trISO(e.peak.time.date),
      altitude: +e.peak.altitude.toFixed(2),
      obscuration: +e.obscuration.toFixed(4),
      visible: e.peak.altitude > 0,           // peak anında Güneş ufkun üstünde mi
    });
    try { e = AE.NextLocalSolarEclipse(e.peak.time, obs); }
    catch { break; }
  }
  return out;
}

function main() {
  const ts = JSON.parse(readFileSync(join(HERE, "eclipse-testset.json"), "utf-8"));
  const solar = enumerateSolarGlobal(ts.startYear, ts.endYear);
  const lunar = enumerateLunar(ts.startYear, ts.endYear);
  const local = {};
  for (const c of ts.cities) {
    local[c.name] = enumerateLocalSolar(ts.startYear, ts.endYear, c);
    console.log(`  [${c.name}] ${local[c.name].length} yerel güneş tutulması`);
  }
  const out = { engine: "astronomy-engine (Search/Next Global+Local SolarEclipse, LunarEclipse)", solarGlobal: solar, lunar, localSolar: local };
  writeFileSync(join(HERE, "ae-eclipses.json"), JSON.stringify(out, null, 1), "utf-8");
  console.log(`AE: ${solar.length} global güneş, ${lunar.length} ay tutulması -> ae-eclipses.json`);
}

main();
