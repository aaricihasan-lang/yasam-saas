/**
 * FAZ 3C / Adim 1 — ASTRONOMY ENGINE lunar orbit ureticisi.
 * swe_lunarorbit.py ile AYNI test setini uretir; compare_lunarorbit.mjs kiyaslar.
 *
 * NOT: Dogrulama scaffold'u — production DEGIL. lib/cosmic'e dokunmaz.
 * Apsisler: SearchLunarApsis/NextLunarApsis (AE dogrudan bulur, minimizasyon GEREKMEZ).
 * Mesafe: Libration().dist_km (GEOCENTRIC merkez-merkez). Syzygy: SearchMoonPhase.
 *
 * Calistir:  node scripts/cosmic-validation/lunarorbit/ae_lunarorbit.mjs
 */
import * as AE from "astronomy-engine";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS = JSON.parse(readFileSync(join(HERE, "lunarorbit-testset.json"), "utf-8"));
const NOLLE = TS.nollePct, FIX_SUPER = TS.fixedSuperKm, FIX_MICRO = TS.fixedMicroKm;
const DAY = 86_400_000;
const isoZ = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const round1 = (x) => Math.round(x * 10) / 10;

function enumerateApsides(startMs, endMs) {
  const out = [];
  let a = AE.SearchLunarApsis(new Date(startMs));
  let guard = 0;
  while (a.time.date.getTime() < endMs && guard++ < 2000) {
    out.push({
      kind: a.kind === 0 ? "perigee" : "apogee",
      timeMs: a.time.date.getTime(),
      timeUTC: isoZ(a.time.date),
      distKm: round1(a.dist_km),
    });
    a = AE.NextLunarApsis(a);
  }
  return out;
}

function enumerateSyzygies(startMs, endMs) {
  const out = [];
  for (const [target, phase] of [[0, "yeniay"], [180, "dolunay"]]) {
    let t = new Date(startMs);
    let guard = 0;
    while (t.getTime() < endMs && guard++ < 100) {
      const ev = AE.SearchMoonPhase(target, t, 40);
      if (!ev || ev.date.getTime() >= endMs) break;
      out.push({
        phase, timeMs: ev.date.getTime(), timeUTC: isoZ(ev.date),
        distKm: round1(AE.Libration(ev.date).dist_km),
      });
      t = new Date(ev.date.getTime() + 2 * DAY);
    }
  }
  out.sort((x, y) => x.timeMs - y.timeMs);
  return out;
}

function bracketingApsides(syzMs, apsides) {
  for (let i = 0; i < apsides.length - 1; i++) {
    if (apsides[i].timeMs <= syzMs && syzMs <= apsides[i + 1].timeMs) {
      const a = apsides[i], b = apsides[i + 1];
      return {
        perigee: a.kind === "perigee" ? a : b,
        apogee: a.kind === "apogee" ? a : b,
      };
    }
  }
  return null;
}

function classify(syz, apsidesWide) {
  const br = bracketingApsides(syz.timeMs, apsidesWide);
  if (!br) return { noBracket: true };
  const P = br.perigee.distKm, A = br.apogee.distKm;
  const rng = A - P;
  const pct = rng > 0 ? (syz.distKm - P) / rng : 0;
  return {
    bracketPerigeeKm: P, bracketApogeeKm: A,
    nollePct: Math.round(pct * 1e4) / 1e4,
    supermoon: pct <= NOLLE,
    micromoon: pct >= (1 - NOLLE),
    fixedSuper: syz.distKm <= FIX_SUPER,
    fixedMicro: syz.distKm >= FIX_MICRO,
  };
}

function main() {
  const windows = TS.windows.map(w => {
    const [sy, sm, sd] = w.start.split("-").map(Number);
    const [ey, em, ed] = w.end.split("-").map(Number);
    const jd0 = Date.UTC(sy, sm - 1, sd), jd1 = Date.UTC(ey, em - 1, ed);
    const apsidesWide = enumerateApsides(jd0 - 20 * DAY, jd1 + 20 * DAY);
    const apsides = apsidesWide.filter(a => a.timeMs >= jd0 && a.timeMs < jd1);
    const syz = enumerateSyzygies(jd0, jd1);
    for (const s of syz) Object.assign(s, classify(s, apsidesWide));
    const n = w.distanceSamples ?? 8;
    const samples = [];
    for (let k = 0; k < n; k++) {
      const ms = jd0 + (jd1 - jd0) * (k + 0.5) / n;
      samples.push({ timeUTC: isoZ(new Date(ms)), distKm: round1(AE.Libration(new Date(ms)).dist_km) });
    }
    const peris = apsides.filter(a => a.kind === "perigee").map(a => a.distKm);
    const apos = apsides.filter(a => a.kind === "apogee").map(a => a.distKm);
    console.log(`  [${w.id}] ${apsides.length} apsis, ${syz.length} syzygy, ${samples.length} mesafe ornegi`);
    return { id: w.id, apsides, syzygies: syz, distanceSamples: samples,
      closestKm: peris.length ? Math.min(...peris) : null, farthestKm: apos.length ? Math.max(...apos) : null };
  });
  writeFileSync(join(HERE, "ae-lunarorbit.json"), JSON.stringify({ engine: "astronomy-engine (SearchLunarApsis + Libration + SearchMoonPhase)", auKm: TS.auKm, nollePct: NOLLE, windows }, null, 1), "utf-8");
  const ta = windows.reduce((s, w) => s + w.apsides.length, 0), tsz = windows.reduce((s, w) => s + w.syzygies.length, 0);
  console.log(`AE: ${ta} apsis, ${tsz} syzygy -> ae-lunarorbit.json`);
}

main();
