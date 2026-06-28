/**
 * FAZ 2C / Adim 0 — ASTRONOMY ENGINE tarafi BAGIMSIZ exact-aspect ureticisi.
 *
 * swe_reference.py ile AYNI test setini, AYNI kok-bulma algoritmasini kullanir;
 * tek fark efemeris kaynagidir (AE vs Swiss Ephemeris). Boylece compare.mjs'teki
 * her fark = saf efemeris farki olur (algoritma farki degil).
 *
 * ONEMLI — Bu dosya DOGRULAMA SCAFFOLD'udur, PRODUCTION DEGILDIR:
 *   - lib/cosmic/aspects.ts'i IMPORT ETMEZ ve DEGISTIRMEZ (kasitli: bagimsiz ikinci uygulama).
 *   - app/ ve UI ile iliskisi yoktur; Next.js bundle'ina girmez (scripts/ import edilmez).
 *   - Adim 1'de DOGRULANMIS cozucu lib/cosmic/ altina production olarak tasinacaktir.
 *
 * Calistir:  node scripts/cosmic-validation/ae_exact.mjs
 */

import * as AE from "astronomy-engine";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const AE_BODY = {
  Sun: AE.Body.Sun, Mercury: AE.Body.Mercury, Venus: AE.Body.Venus, Mars: AE.Body.Mars,
  Jupiter: AE.Body.Jupiter, Saturn: AE.Body.Saturn, Uranus: AE.Body.Uranus,
  Neptune: AE.Body.Neptune, Pluto: AE.Body.Pluto,
};

// ─── Tarih <-> Julian Gun (UT/UTC) ──────────────────────────────────────────────
const JD_UNIX_EPOCH = 2440587.5;
const dateFromJd = (jd) => new Date((jd - JD_UNIX_EPOCH) * 86_400_000);
const isoFromJd = (jd) => dateFromJd(jd).toISOString().replace(/\.\d{3}Z$/, "Z");
function jdFromYmd(y, m, d) {
  return Date.UTC(y, m - 1, d) / 86_400_000 + JD_UNIX_EPOCH;
}

// ─── Aci yardimcilari ──────────────────────────────────────────────────────────
const norm360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => norm360(x + 180) - 180;

/** Tropikal jeosentrik gorunur ekliptik boylam (production ile ayni cagrilar). */
function lon(jd, body) {
  const d = dateFromJd(jd);
  if (body === "Moon") return norm360(AE.EclipticGeoMoon(d).lon);
  return norm360(AE.Ecliptic(AE.GeoVector(AE_BODY[body], d, true)).elon);
}

/** Gunluk hiz (derece/gun), merkezi fark. */
function speed(jd, body) {
  const h = 0.01; // ~14.4 dk
  let d = lon(jd + h, body) - lon(jd - h, body);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d / (2 * h);
}

const signedResidual = (jd, a, b, target) => wrap180(lon(jd, a) - lon(jd, b) - target);

function targetsFor(angle) {
  if (angle === 0) return [0];
  if (angle === 180) return [180];
  return [angle, 360 - angle];
}

function stepFor(a, b, override) {
  if (override != null) return Number(override);
  if (a === "Moon" || b === "Moon") return 0.1;
  if (["Sun", "Mercury", "Venus", "Mars"].includes(a) || ["Sun", "Mercury", "Venus", "Mars"].includes(b)) return 0.5;
  return 2.0;
}

function bisect(a, b, target, lo, hi) {
  let flo = signedResidual(lo, a, b, target);
  for (let k = 0; k < 60; k++) {
    if (hi - lo < 1 / 86_400) break; // 1 sn
    const mid = (lo + hi) / 2;
    const fm = signedResidual(mid, a, b, target);
    if (fm === 0) return mid;
    if (flo < 0 === fm < 0) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

// ─── Enumerasyon ────────────────────────────────────────────────────────────────
function enumerateCase(caseObj, aspects, bodyIndex) {
  const events = [];
  const bodies = caseObj.bodies;
  const [sy, sm, sd] = caseObj.start.split("-").map(Number);
  const [ey, em, ed] = caseObj.end.split("-").map(Number);
  const jdStart = jdFromYmd(sy, sm, sd);
  const jdEnd = jdFromYmd(ey, em, ed);
  const override = caseObj.stepDays ?? null;

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      let ba = bodies[i], bb = bodies[j];
      if (bodyIndex[ba] > bodyIndex[bb]) [ba, bb] = [bb, ba];
      const step = stepFor(ba, bb, override);

      for (const asp of aspects) {
        for (const T of targetsFor(asp.angle)) {
          let prevJd = jdStart;
          let prevF = signedResidual(prevJd, ba, bb, T);
          for (let t = jdStart; t < jdEnd; ) {
            const nt = Math.min(t + step, jdEnd);
            const fn = signedResidual(nt, ba, bb, T);
            if (prevF !== 0 && prevF < 0 !== fn < 0 && Math.abs(fn - prevF) < 180) {
              const x = bisect(ba, bb, T, prevJd, nt);
              const sa = speed(x, ba), sb = speed(x, bb);
              events.push({
                case: caseObj.id,
                bodyA: ba, bodyB: bb,
                aspect: asp.name, angle: asp.angle,
                jd: x,
                iso: isoFromJd(x),
                lonA: +lon(x, ba).toFixed(6), lonB: +lon(x, bb).toFixed(6),
                speedA: +sa.toFixed(6), speedB: +sb.toFixed(6),
                retroA: sa < 0, retroB: sb < 0,
                relSpeed: +Math.abs(sa - sb).toFixed(6),
                residualArcsec: +Math.abs(signedResidual(x, ba, bb, T) * 3600).toFixed(3),
              });
            }
            prevJd = nt; prevF = fn; t = nt;
          }
        }
      }
    }
  }
  return events;
}

function main() {
  const ts = JSON.parse(readFileSync(join(HERE, "testset.json"), "utf-8"));
  const bodyIndex = Object.fromEntries(ts.bodyOrder.map((n, i) => [n, i]));

  const all = [];
  for (const c of ts.cases) {
    const evs = enumerateCase(c, ts.aspects, bodyIndex);
    all.push(...evs);
    console.log(`  [${c.id}] ${evs.length} olay`);
  }
  all.sort((a, b) => a.bodyA.localeCompare(b.bodyA) || a.bodyB.localeCompare(b.bodyB) || a.angle - b.angle || a.jd - b.jd);

  const out = { engine: "astronomy-engine (EclipticGeoMoon + Ecliptic/GeoVector)", count: all.length, events: all };
  const outPath = join(HERE, "ae-exact.json");
  writeFileSync(outPath, JSON.stringify(out, null, 1), "utf-8");
  console.log(`TOPLAM ${all.length} AE olay -> ${outPath}`);
}

main();
