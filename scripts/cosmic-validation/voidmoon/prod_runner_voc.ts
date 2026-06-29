/**
 * FAZ 3B / Adım 2 — PRODUCTION VOC motoru doğrulama koşucusu.
 *
 * lib/cosmic/voidMoon.ts (getVoidMoonPeriods) çıktısını Adım 1 harness şemasına eşler
 * ve ae-prod-voc.json yazar; compare_voc.mjs bunu Swiss Ephemeris ile kıyaslar.
 *
 * Çalıştır:  npx tsx scripts/cosmic-validation/voidmoon/prod_runner_voc.ts
 *            node scripts/cosmic-validation/voidmoon/compare_voc.mjs ae-prod-voc.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getVoidMoonPeriods } from "../../../lib/cosmic/voidMoon";

const HERE = dirname(fileURLToPath(import.meta.url));

function main(): void {
  const ts = JSON.parse(readFileSync(join(HERE, "voc-testset.json"), "utf-8")) as {
    windows: { id: string; start: string; end: string }[];
  };
  const voc: unknown[] = [];
  for (const w of ts.windows) {
    const [sy, sm, sd] = w.start.split("-").map(Number);
    const [ey, em, ed] = w.end.split("-").map(Number);
    const periods = getVoidMoonPeriods(new Date(Date.UTC(sy!, sm! - 1, sd!)), new Date(Date.UTC(ey!, em! - 1, ed!)));
    for (const p of periods) {
      voc.push({
        sign: p.moonSign, nextSign: p.nextMoonSign,
        enterUTC: p.signStartUTC, exitUTC: p.signEndUTC,
        vocStartUTC: p.voidStartUTC, vocStartTR: p.voidStartTR,
        vocEndUTC: p.voidEndUTC, vocEndTR: p.voidEndTR,
        durationMin: p.durationMinutes,
        lastAspectBody: p.lastAspect?.planet ?? null,
        lastAspectType: p.lastAspect?.aspect ?? null,
        noAspect: p.noAspectInSign,
        crosses0_360: p.moonSign === "Balık" && p.nextMoonSign === "Koç",
      });
    }
    console.log(`  [${w.id}] ${periods.length} burç periyodu`);
  }
  writeFileSync(join(HERE, "ae-prod-voc.json"), JSON.stringify({ engine: "PRODUCTION lib/cosmic/voidMoon.ts", voc }, null, 1), "utf-8");
  console.log(`PRODUCTION: ${voc.length} VOC penceresi -> ae-prod-voc.json`);
}

main();
