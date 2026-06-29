/**
 * FAZ 3B / Adım 1 — ASTRONOMY ENGINE tarafı VOC üreticisi.
 *
 * Mevcut PRODUCTION fonksiyonlarını READ-ONLY import eder (değiştirmez):
 *   - getMoonSignPeriod / getMoonSign  (lib/cosmic/moon.ts)  → burç periyodu/ingress
 *   - findExactAspectsInWindow         (lib/cosmic/exactAspects.ts) → Ay exact aspektleri
 * VOC orkestrasyonu HARNESS'tedir (henüz production değil; Adım 2'de taşınacak).
 *
 * NOT: getMoonSignPeriod ~1 dk hassasiyettedir ve `to` = burçtaki SON an (≈ ingress − ≤60sn).
 * Çalıştır:  npx tsx scripts/cosmic-validation/voidmoon/ae_voc.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getMoonSign, getMoonSignPeriod } from "../../../lib/cosmic/moon";
import { findExactAspectsInWindow } from "../../../lib/cosmic/exactAspects";
import type { AspectBody } from "../../../lib/cosmic/aspects";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;
const CLASSICAL: AspectBody[] = ["Güneş", "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn"];

const isoZ = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const isoTR = (ms: number) => {
  const t = new Date(ms + 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+03:00`;
};

type Occ = { sign: string; fromMs: number; toMs: number; nextSign: string | null };

function enumerateOccupancies(startMs: number, endMs: number): Occ[] {
  const occ: Occ[] = [];
  let cursor = startMs;
  let guard = 0;
  // pencere sonundan biraz öteye kadar (son periyodun nextSign'ı için)
  while (cursor < endMs + 3 * DAY && guard++ < 3000) {
    const p = getMoonSignPeriod(new Date(cursor));
    const fromMs = p.from.getTime();
    const toMs = p.to.getTime();
    const sign = getMoonSign(new Date(Math.floor((fromMs + toMs) / 2))).name;
    occ.push({ sign, fromMs, toMs, nextSign: null });
    cursor = toMs + 120_000; // 2 dk sonrası → sonraki burç
  }
  for (let i = 0; i < occ.length; i++) occ[i]!.nextSign = occ[i + 1]?.sign ?? null;
  // yalnız enter'ı pencere içinde olan tam periyotlar
  return occ.filter(o => o.fromMs >= startMs && o.fromMs < endMs && o.nextSign);
}

function buildVoc(o: Occ) {
  const hits = CLASSICAL.flatMap(body =>
    findExactAspectsInWindow("Ay", body, new Date(o.fromMs), new Date(o.toMs)));
  let vocStartMs: number, lastBody: string | null = null, lastType: string | null = null, noAspect: boolean;
  if (hits.length) {
    const last = hits.reduce((a, b) => (a.exactAt.getTime() >= b.exactAt.getTime() ? a : b));
    vocStartMs = last.exactAt.getTime();
    lastBody = last.bodyA === "Ay" ? last.bodyB : last.bodyA;
    lastType = last.aspect;
    noAspect = false;
  } else {
    vocStartMs = o.fromMs;
    noAspect = true;
  }
  const vocEndMs = o.toMs;
  return {
    sign: o.sign, nextSign: o.nextSign,
    enterUTC: isoZ(o.fromMs), exitUTC: isoZ(o.toMs),
    vocStartUTC: isoZ(vocStartMs), vocStartTR: isoTR(vocStartMs),
    vocEndUTC: isoZ(vocEndMs), vocEndTR: isoTR(vocEndMs),
    durationMin: Math.round((vocEndMs - vocStartMs) / 60000 * 10) / 10,
    lastAspectBody: lastBody, lastAspectType: lastType,
    noAspect,
    crosses0_360: o.sign === "Balık" && o.nextSign === "Koç",
  };
}

function main(): void {
  const ts = JSON.parse(readFileSync(join(HERE, "voc-testset.json"), "utf-8")) as {
    windows: { id: string; start: string; end: string }[];
  };
  const vocs: unknown[] = [];
  for (const w of ts.windows) {
    const [sy, sm, sd] = w.start.split("-").map(Number);
    const [ey, em, ed] = w.end.split("-").map(Number);
    const occ = enumerateOccupancies(Date.UTC(sy!, sm! - 1, sd!), Date.UTC(ey!, em! - 1, ed!));
    for (const o of occ) vocs.push(buildVoc(o));
    console.log(`  [${w.id}] ${occ.length} burç periyodu`);
  }
  writeFileSync(join(HERE, "ae-voc.json"), JSON.stringify({ engine: "astronomy-engine (getMoonSignPeriod + findExactAspectsInWindow)", voc: vocs }, null, 1), "utf-8");
  console.log(`AE: ${vocs.length} VOC penceresi -> ae-voc.json`);
}

main();
