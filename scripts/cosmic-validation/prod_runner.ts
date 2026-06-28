/**
 * FAZ 2C / Adım 1 — PRODUCTION çözücü doğrulama koşucusu.
 *
 * lib/cosmic/exactAspects.ts (GERÇEK production çözücü) ile test setindeki tüm
 * pencerelerde exact açıları üretir ve ae-prod.json'a yazar. compare.mjs bunu
 * bağımsız Swiss Ephemeris referansıyla (swe-reference.json) kıyaslar.
 *
 * Bu, Adım 0'daki bağımsız ae_exact.mjs reimplementasyonundan FARKLIDIR:
 * burada doğrudan production kodu sınanır.
 *
 * Çalıştır:  npx tsx scripts/cosmic-validation/prod_runner.ts
 * (tsx transpile eder; production bundle'a girmez — scripts/ app tarafından import edilmez.)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  findExactAspectsInWindow,
  type ExactAspectHit,
} from "../../lib/cosmic/exactAspects";
import { getPlanetLongitude, type AspectBody } from "../../lib/cosmic/aspects";

const HERE = dirname(fileURLToPath(import.meta.url));
const JD_UNIX_EPOCH = 2440587.5;

// Test seti İngilizce isim kullanır; production çözücü Türkçe AspectBody kullanır.
const EN2TR: Record<string, AspectBody> = {
  Sun: "Güneş", Moon: "Ay", Mercury: "Merkür", Venus: "Venüs", Mars: "Mars",
  Jupiter: "Jüpiter", Saturn: "Satürn", Uranus: "Uranüs", Neptune: "Neptün", Pluto: "Plüton",
};
const TR2EN: Record<string, string> = Object.fromEntries(Object.entries(EN2TR).map(([en, tr]) => [tr, en]));

type Case = { id: string; bodies: string[]; start: string; end: string; stepDays?: number };
type TestSet = { cases: Case[] };

function jdFromMs(ms: number): number {
  return ms / 86_400_000 + JD_UNIX_EPOCH;
}
function dateUTC(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function main(): void {
  const ts: TestSet = JSON.parse(readFileSync(join(HERE, "testset.json"), "utf-8"));
  const events: unknown[] = [];

  for (const c of ts.cases) {
    let n = 0;
    for (let i = 0; i < c.bodies.length; i++) {
      for (let j = i + 1; j < c.bodies.length; j++) {
        const a = EN2TR[c.bodies[i]!]!;
        const b = EN2TR[c.bodies[j]!]!;
        const hits: ExactAspectHit[] = findExactAspectsInWindow(
          a, b, dateUTC(c.start), dateUTC(c.end), c.stepDays != null ? { stepDays: c.stepDays } : {},
        );
        for (const h of hits) {
          const ms = h.exactAt.getTime();
          events.push({
            case: c.id,
            bodyA: TR2EN[h.bodyA], bodyB: TR2EN[h.bodyB],
            aspect: h.aspect, angle: h.aspectAngle,
            jd: jdFromMs(ms),
            iso: h.exactAtISO.replace(/\.\d{3}Z$/, "Z"),
            lonA: +getPlanetLongitude(h.bodyA, h.exactAt).toFixed(6),
            lonB: +getPlanetLongitude(h.bodyB, h.exactAt).toFixed(6),
            retroA: h.retroA, retroB: h.retroB,
            relSpeed: h.relativeSpeed,
            displayPrecision: h.displayPrecision,
            confidence: h.confidence,
            residualArcsec: h.residualArcsec,
          });
          n++;
        }
      }
    }
    console.log(`  [${c.id}] ${n} olay`);
  }

  events.sort((x: any, y: any) =>
    String(x.bodyA).localeCompare(y.bodyA) || String(x.bodyB).localeCompare(y.bodyB) || x.angle - y.angle || x.jd - y.jd);

  const out = { engine: "PRODUCTION lib/cosmic/exactAspects.ts (of-date getPlanetLongitude)", count: events.length, events };
  const outPath = join(HERE, "ae-prod.json");
  writeFileSync(outPath, JSON.stringify(out, null, 1), "utf-8");
  console.log(`TOPLAM ${events.length} production olay -> ${outPath}`);
}

main();
