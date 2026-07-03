/**
 * FAZ 5 / P5e-2 — PRODUCTION global tutulma görünürlüğü koşucusu.
 *
 * lib/cosmic/eclipses.ts'in getSolarCityVisibility(id, observers) fonksiyonunu, gözlemci
 * kümesi olarak lib/location/world.ts WORLD_LOCATIONS'tan seçilen 10 pilot global şehirle
 * çağırır ve SWE harness şemasına (swe-global-eclipses.json) eşler:
 *   ae-prod-global-eclipses.json  → compare_global_eclipses.mjs bunu Swiss Ephemeris ile kıyaslar.
 *
 * KURALLAR (P5e-2):
 *   - Motor DEĞİŞTİRİLMEZ: getSolarCityVisibility'nin var olan `observers` parametresi kullanılır.
 *   - FAZ 3A eclipses/prod_runner.ts'e dokunulmaz (bu ayrı, global koşucudur).
 *   - Koordinatlar WORLD_LOCATIONS'tan (production veri katmanı) alınır; şehir anahtarı = id.
 *
 * Çalıştır:  npx tsx scripts/cosmic-validation/global/prod_global_runner.ts
 *            node scripts/cosmic-validation/global/compare_global_eclipses.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getSolarEclipses, getSolarCityVisibility } from "../../../lib/cosmic/eclipses";
import { WORLD_LOCATIONS } from "../../../lib/location/world";

const HERE = dirname(fileURLToPath(import.meta.url));
const toUTC = (isoTR: string): string =>
  new Date(Date.parse(isoTR)).toISOString().replace(/\.\d{3}Z$/, "Z");

type TestsetCity = { id: string; label: string; lat: number; lon: number; elev: number; tz: string };
type Testset = { startYear: number; endYear: number; cities: TestsetCity[] };
type Observer = { name: string; lat: number; lon: number; elev: number };

function main(): void {
  const ts = JSON.parse(
    readFileSync(join(HERE, "global-eclipse-testset.json"), "utf-8"),
  ) as Testset;

  // Gözlemciler WORLD_LOCATIONS'tan (production veri) türetilir; observer.name = şehir id.
  const observers: Observer[] = ts.cities.map((c) => {
    const loc = WORLD_LOCATIONS.find((l) => l.id === c.id);
    if (!loc) throw new Error(`WORLD_LOCATIONS içinde bulunamadı: ${c.id}`);
    return { name: loc.id, lat: loc.lat, lon: loc.lon, elev: loc.elev };
  });

  const localSolar: Record<string, unknown[]> = {};
  for (const o of observers) localSolar[o.name] = [];

  for (const e of getSolarEclipses()) {
    for (const v of getSolarCityVisibility(e.id, observers)) {
      if (v.localType == null || v.peakTR == null) continue; // şehir penumbrada değil
      localSolar[v.city].push({
        kind: v.localType,
        peakUTC: toUTC(v.peakTR),
        altitude: v.altitudeAtPeak,
        magnitude: null, // production magnitude'u yerel düzeyde vermez (obscuration kullanılır)
        obscuration: v.obscuration,
        visible: v.visible,
      });
    }
  }

  const out = {
    engine: "PRODUCTION lib/cosmic/eclipses.ts (getSolarCityVisibility + WORLD_LOCATIONS)",
    cityCount: observers.length,
    localSolar,
  };
  writeFileSync(join(HERE, "ae-prod-global-eclipses.json"), JSON.stringify(out, null, 1), "utf-8");
  console.log(`PRODUCTION GLOBAL: ${observers.length} şehir -> ae-prod-global-eclipses.json`);
  for (const o of observers) {
    console.log(`  [${o.name.padEnd(15)}] ${localSolar[o.name].length} yerel güneş`);
  }
}

main();
