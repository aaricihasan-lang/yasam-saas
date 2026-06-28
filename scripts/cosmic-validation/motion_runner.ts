/**
 * FAZ 2C / Adım 2 — PRODUCTION applying/separating + üçlü-geçiş koşucusu.
 *
 * lib/cosmic/aspectMotion.ts'i test seti üzerinde çalıştırır:
 *   - getAspectPasses → her exact geçiş + passNumber/totalPassCount/signedSpeed/istasyon → ae-passes.json
 *   - getAspectMotion → exact ± 30 dk self-check (öncesi applying, sonrası separating mı?)
 *
 * Çalıştır:  npx tsx scripts/cosmic-validation/motion_runner.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAspectPasses, getAspectMotion } from "../../lib/cosmic/aspectMotion";
import { type AspectBody, type AspectName, ASPECTS } from "../../lib/cosmic/aspects";

const HERE = dirname(fileURLToPath(import.meta.url));
const JD_UNIX_EPOCH = 2440587.5;
const MIN30_MS = 30 * 60 * 1000;

const EN2TR: Record<string, AspectBody> = {
  Sun: "Güneş", Moon: "Ay", Mercury: "Merkür", Venus: "Venüs", Mars: "Mars",
  Jupiter: "Jüpiter", Saturn: "Satürn", Uranus: "Uranüs", Neptune: "Neptün", Pluto: "Plüton",
};
const TR2EN: Record<string, string> = Object.fromEntries(Object.entries(EN2TR).map(([en, tr]) => [tr, en]));
const ASPECT_NAMES = ASPECTS.map(a => a.name) as AspectName[];

type Case = { id: string; bodies: string[]; start: string; end: string; stepDays?: number };

function jdFromMs(ms: number): number { return ms / 86_400_000 + JD_UNIX_EPOCH; }
function dateUTC(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d!)); }

function main(): void {
  const ts: { cases: Case[] } = JSON.parse(readFileSync(join(HERE, "testset.json"), "utf-8"));
  const events: any[] = [];
  let selfCheckChecked = 0;
  let selfCheckViolations = 0;
  const violationSamples: string[] = [];

  for (const c of ts.cases) {
    let n = 0;
    for (let i = 0; i < c.bodies.length; i++) {
      for (let j = i + 1; j < c.bodies.length; j++) {
        const a = EN2TR[c.bodies[i]!]!;
        const b = EN2TR[c.bodies[j]!]!;
        for (const aspect of ASPECT_NAMES) {
          const passes = getAspectPasses(
            a, b, aspect, dateUTC(c.start), dateUTC(c.end),
            c.stepDays != null ? { stepDays: c.stepDays } : {},
          );
          for (const p of passes) {
            const ms = p.exactAt.getTime();
            // Self-check: exact öncesi orb azalmalı (orb'<0), sonrası artmalı (orb'>0).
            // orbDerivative işareti EXACT_ORB eşiğinden bağımsızdır → yavaş çiftlerde de geçerli.
            // (İstasyon yakını hariç: orada signedSpeed≈0, yön anlık değildir.)
            const before = getAspectMotion(a, b, aspect, new Date(ms - MIN30_MS));
            const after = getAspectMotion(a, b, aspect, new Date(ms + MIN30_MS));
            let ok = true;
            if (before && after && !p.isStationNearby) {
              selfCheckChecked++;
              if (!(before.orbDerivative < 0 && after.orbDerivative > 0)) {
                ok = false; selfCheckViolations++;
                if (violationSamples.length < 8)
                  violationSamples.push(`${TR2EN[a]}-${TR2EN[b]} ${p.aspectAngle}° @${p.exactAtISO} orb'before=${before.orbDerivative} orb'after=${after.orbDerivative}`);
              }
            }
            events.push({
              case: c.id,
              bodyA: TR2EN[p.bodyA], bodyB: TR2EN[p.bodyB],
              aspect: p.aspect, angle: p.aspectAngle,
              jd: jdFromMs(ms),
              iso: p.exactAtISO.replace(/\.\d{3}Z$/, "Z"),
              passNumber: p.passNumber, totalPassCount: p.totalPassCount,
              signedSpeed: p.signedSpeed, relSpeed: p.relativeAngularSpeed,
              relativeMotion: p.relativeMotion,
              retroA: p.retroA, retroB: p.retroB,
              isStationNearby: p.isStationNearby,
              selfCheckOk: ok,
            });
            n++;
          }
        }
      }
    }
    console.log(`  [${c.id}] ${n} gecis`);
  }

  events.sort((x, y) =>
    String(x.bodyA).localeCompare(y.bodyA) || String(x.bodyB).localeCompare(y.bodyB) || x.angle - y.angle || x.jd - y.jd);

  const out = {
    engine: "PRODUCTION lib/cosmic/aspectMotion.ts (turev tabanli applying/separating + triple-pass)",
    count: events.length,
    selfCheck: { checked: selfCheckChecked, violations: selfCheckViolations, samples: violationSamples },
    events,
  };
  writeFileSync(join(HERE, "ae-passes.json"), JSON.stringify(out, null, 1), "utf-8");
  console.log(`TOPLAM ${events.length} gecis -> ae-passes.json`);
  console.log(`Self-check (exact±30dk yön): ${selfCheckChecked - selfCheckViolations}/${selfCheckChecked} dogru, ${selfCheckViolations} ihlal`);
  if (violationSamples.length) violationSamples.forEach(s => console.log("   ihlal:", s));
}

main();
