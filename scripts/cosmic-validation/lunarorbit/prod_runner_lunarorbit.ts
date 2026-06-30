/**
 * FAZ 3C / Adim 2 — PRODUCTION lunar orbit motoru dogrulama kosucusu.
 *
 * lib/cosmic/lunarOrbit.ts ciktisini Adim 1 harness semasina esler ve
 * ae-prod-lunarorbit.json yazar; compare_lunarorbit.mjs Swiss Ephemeris ile kiyaslar.
 *
 * Calistir:  npx tsx scripts/cosmic-validation/lunarorbit/prod_runner_lunarorbit.ts
 *            node scripts/cosmic-validation/lunarorbit/compare_lunarorbit.mjs ae-prod-lunarorbit.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getLunarApsisEvents, getLunarSyzygyEvents, getLunarDistanceSnapshot,
} from "../../../lib/cosmic/lunarOrbit";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS = JSON.parse(readFileSync(join(HERE, "lunarorbit-testset.json"), "utf-8"));

function main(): void {
  const windows = TS.windows.map((w: { id: string; start: string; end: string; distanceSamples?: number }) => {
    const [sy, sm, sd] = w.start.split("-").map(Number);
    const [ey, em, ed] = w.end.split("-").map(Number);
    const jd0 = Date.UTC(sy!, sm! - 1, sd!), jd1 = Date.UTC(ey!, em! - 1, ed!);

    const apsides = getLunarApsisEvents(new Date(jd0), new Date(jd1)).map(a => ({
      kind: a.kind, timeUTC: a.timeUTC, distKm: a.distanceKm,
    }));
    const syzygies = getLunarSyzygyEvents(new Date(jd0), new Date(jd1)).map(s => ({
      phase: s.kind === "new-moon" ? "yeniay" : "dolunay",
      timeUTC: s.timeUTC, distKm: s.distanceKm,
      bracketPerigeeKm: s.nearestPerigee?.distanceKm ?? null,
      bracketApogeeKm: s.nearestApogee?.distanceKm ?? null,
      nollePct: s.nollePercent / 100,
      supermoon: s.isSupermoon, micromoon: s.isMicromoon,
      fixedSuper: s.fixedThresholdSuperCheck, fixedMicro: s.fixedThresholdMicroCheck,
    }));
    const n = w.distanceSamples ?? 8;
    const distanceSamples = [];
    for (let k = 0; k < n; k++) {
      const ms = jd0 + (jd1 - jd0) * (k + 0.5) / n;
      const snap = getLunarDistanceSnapshot(new Date(ms));
      distanceSamples.push({ timeUTC: snap.dateUTC, distKm: snap.distanceKm });
    }
    const peris = apsides.filter(a => a.kind === "perigee").map(a => a.distKm);
    const apos = apsides.filter(a => a.kind === "apogee").map(a => a.distKm);
    console.log(`  [${w.id}] ${apsides.length} apsis, ${syzygies.length} syzygy, ${distanceSamples.length} mesafe ornegi`);
    return { id: w.id, apsides, syzygies, distanceSamples,
      closestKm: peris.length ? Math.min(...peris) : null, farthestKm: apos.length ? Math.max(...apos) : null };
  });

  writeFileSync(join(HERE, "ae-prod-lunarorbit.json"), JSON.stringify({ engine: "PRODUCTION lib/cosmic/lunarOrbit.ts", auKm: TS.auKm, nollePct: TS.nollePct, windows }, null, 1), "utf-8");
  const ta = windows.reduce((s: number, w: { apsides: unknown[] }) => s + w.apsides.length, 0);
  const tsz = windows.reduce((s: number, w: { syzygies: unknown[] }) => s + w.syzygies.length, 0);
  console.log(`PRODUCTION: ${ta} apsis, ${tsz} syzygy -> ae-prod-lunarorbit.json`);
}

main();
