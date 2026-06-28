/**
 * FAZ 3A / Adım 2 — PRODUCTION eclipse motoru doğrulama koşucusu.
 *
 * lib/cosmic/eclipses.ts'i Adım 1 harness şemasına (ae-eclipses.json) eşler ve
 * ae-prod-eclipses.json yazar; compare_eclipses.mjs bunu Swiss Ephemeris ile kıyaslar.
 *
 * Çalıştır:  npx tsx scripts/cosmic-validation/eclipses/prod_runner.ts
 *            node scripts/cosmic-validation/eclipses/compare_eclipses.mjs ae-prod-eclipses.json
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getSolarEclipses, getLunarEclipses, getSolarCityVisibility, TR_CITIES,
} from "../../../lib/cosmic/eclipses";

const HERE = dirname(fileURLToPath(import.meta.url));
const toUTC = (isoTR: string): string => new Date(Date.parse(isoTR)).toISOString().replace(/\.\d{3}Z$/, "Z");

function main(): void {
  const solar = getSolarEclipses().map(e => ({
    kind: e.eclipseType, peakUTC: e.peakUTC,
    centerLat: e.centerLat, centerLon: e.centerLon, obscuration: e.obscuration,
  }));
  const lunar = getLunarEclipses().map(e => ({
    kind: e.eclipseType, peakUTC: e.peakUTC, obscuration: e.obscuration,
    durPenumMin: e.durPenumMin, durPartialMin: e.durPartialMin, durTotalMin: e.durTotalMin,
  }));

  const localSolar: Record<string, unknown[]> = {};
  for (const c of TR_CITIES) localSolar[c.name] = [];
  for (const e of getSolarEclipses()) {
    for (const v of getSolarCityVisibility(e.id)) {
      if (v.localType == null || v.peakTR == null) continue;   // şehir penumbrada değil
      localSolar[v.city].push({
        kind: v.localType, peakUTC: toUTC(v.peakTR),
        altitude: v.altitudeAtPeak, obscuration: v.obscuration, visible: v.visible,
      });
    }
  }

  const out = { engine: "PRODUCTION lib/cosmic/eclipses.ts", solarGlobal: solar, lunar, localSolar };
  writeFileSync(join(HERE, "ae-prod-eclipses.json"), JSON.stringify(out, null, 1), "utf-8");
  console.log(`PRODUCTION: ${solar.length} global güneş, ${lunar.length} ay -> ae-prod-eclipses.json`);
  for (const c of TR_CITIES) console.log(`  [${c.name}] ${localSolar[c.name].length} yerel güneş`);
}

main();
