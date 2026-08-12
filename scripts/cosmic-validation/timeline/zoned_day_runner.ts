/**
 * Kozmik Ajanda — GUNLUK EXACT ASPECT TIMELINE / PRODUCTION dogrulama kosucusu.
 *
 * Timeline'in bagli oldugu TAM production kodu ile calisir:
 *   - lib/location/tz.ts        → getZonedDayRange (timezone-aware [00:00, ertesi 00:00) UTC pencere)
 *   - lib/cosmic/exactAspects.ts → getExactAspectsInRange (yeni motor YAZILMADI; mevcut cozucü)
 *
 * Her fixture icin: pencere sinirlari (start/end ISO) + o penceredeki TUM major exact olaylar.
 * Cikti timeline-prod.json → compare_timeline.mjs bunu bagimsiz Swiss Ephemeris + zoneinfo
 * referansiyla (swe-timeline.json) kiyaslar (set-completeness + zaman + DST pencere uzunlugu).
 *
 * Ayrica --bench modu: gercek performans olcumu (getExactAspectsInRange tek gun maliyeti).
 *
 * Calistir:
 *   npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts
 *   npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts --bench
 *
 * scripts/ Next.js tarafindan import edilmez → bundle'a girmez.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { getZonedDayRange } from "../../../lib/location/tz";
import { getExactAspectsInRange } from "../../../lib/cosmic/exactAspects";
import { type AspectBody } from "../../../lib/cosmic/aspects";

const HERE = dirname(fileURLToPath(import.meta.url));
const JD_UNIX_EPOCH = 2440587.5;

const TR2EN: Record<string, string> = {
  "Güneş": "Sun", "Ay": "Moon", "Merkür": "Mercury", "Venüs": "Venus", "Mars": "Mars",
  "Jüpiter": "Jupiter", "Satürn": "Saturn", "Uranüs": "Uranus", "Neptün": "Neptune", "Plüton": "Pluto",
};

type DayFixture = {
  id: string; label: string; year: number; month: number; day: number; tz: string; category: string;
};
type FixtureSet = { days: DayFixture[] };

const jd = (ms: number) => ms / 86_400_000 + JD_UNIX_EPOCH;
const isoSec = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function eventsForDay(f: DayFixture) {
  const { start, end } = getZonedDayRange(f.year, f.month - 1, f.day, f.tz);
  const hits = getExactAspectsInRange(start, end);
  const events = hits.map(h => ({
    bodyA: TR2EN[h.bodyA] ?? h.bodyA,
    bodyB: TR2EN[h.bodyB] ?? h.bodyB,
    aspect: h.aspect,
    angle: h.aspectAngle,
    jd: jd(h.exactAt.getTime()),
    iso: isoSec(h.exactAt),
    includesMoon: h.bodyA === "Ay" || h.bodyB === "Ay",
    displayPrecision: h.displayPrecision,
    confidence: h.confidence,
    relSpeed: h.relativeSpeed,
    retroA: h.retroA, retroB: h.retroB,
  }));
  return {
    start, end,
    startIso: isoSec(start), endIso: isoSec(end),
    durationHours: +((end.getTime() - start.getTime()) / 3_600_000).toFixed(4),
    events,
  };
}

function runReference(fs: FixtureSet): void {
  const out = fs.days.map(f => {
    const r = eventsForDay(f);
    console.log(`  [${f.id}] ${f.tz} ${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")} → ${r.durationHours}s, ${r.events.length} olay  [${r.startIso} .. ${r.endIso})`);
    return {
      id: f.id, label: f.label, tz: f.tz, category: f.category,
      year: f.year, month: f.month, day: f.day,
      startIso: r.startIso, endIso: r.endIso, durationHours: r.durationHours,
      count: r.events.length, events: r.events,
    };
  });
  const path = join(HERE, "timeline-prod.json");
  writeFileSync(path, JSON.stringify({ engine: "PRODUCTION getZonedDayRange + getExactAspectsInRange", days: out }, null, 1), "utf-8");
  console.log(`\nPRODUCTION timeline -> ${path}`);
}

function runBench(fs: FixtureSet): void {
  // 10 farkli normal tarih (Ay dahil, tum major aspect) — tek gun getExactAspectsInRange maliyeti.
  const benchDays: Array<[number, number, number]> = [
    [2026, 8, 11], [2026, 1, 3], [2026, 2, 14], [2026, 3, 21], [2026, 4, 9],
    [2026, 5, 20], [2026, 6, 15], [2026, 7, 7], [2026, 9, 1], [2026, 12, 25],
  ];
  const tz = "Europe/Istanbul";
  // warmup (JIT + AE ilk cagri)
  for (let i = 0; i < 3; i++) {
    const { start, end } = getZonedDayRange(2026, 7, 11, tz);
    getExactAspectsInRange(start, end);
  }
  const samples: number[] = [];
  const counts: number[] = [];
  for (const [y, m, d] of benchDays) {
    const { start, end } = getZonedDayRange(y, m - 1, d, tz);
    const t0 = performance.now();
    const hits = getExactAspectsInRange(start, end);
    const t1 = performance.now();
    samples.push(t1 - t0);
    counts.push(hits.length);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0]!;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const max = sorted[sorted.length - 1]!;
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
  console.log("\n=== PERFORMANS: tek gun getExactAspectsInRange (Ay dahil, 45 cift × 5 major) ===");
  benchDays.forEach(([y, m, d], i) => {
    console.log(`  ${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}: ${samples[i]!.toFixed(2)} ms, ${counts[i]} olay`);
  });
  console.log(`  ---`);
  console.log(`  n=${samples.length}  min=${min.toFixed(2)}ms  median=${median.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  max=${max.toFixed(2)}ms`);
  console.log(`  olay/gun: min=${Math.min(...counts)} max=${Math.max(...counts)} ort=${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}`);
  console.log(`  NOT: Node/tsx olcumu; gercek tarayici ~ayni buyukluk mertebesi (AE saf CPU, DOM yok).`);
}

/**
 * Ardışık günlerin pencereleri örtüşmez/boşluk bırakmaz: day[i].end === day[i+1].start.
 * DST geçişini içeren bir ayı (Berlin Mart 2026) baştan sona tarar. En küçük sapmada exit 1.
 */
function runAdjacent(): void {
  const tz = "Europe/Berlin"; // 29 Mart 2026 DST ileri geçişi içerir
  console.log(`=== ARDIŞIK GÜN PENCERE DÖŞEMESİ (${tz}, Mart 2026, DST dahil) ===`);
  let prevEnd: number | null = null;
  let fail = 0;
  for (let d = 1; d <= 31; d++) {
    const { start, end } = getZonedDayRange(2026, 2, d, tz); // month0=2 → Mart
    if (prevEnd !== null && start.getTime() !== prevEnd) {
      console.log(`  ✗ GÜN ${d}: start ${isoSec(start)} ≠ önceki end ${isoSec(new Date(prevEnd))}`);
      fail++;
    }
    const hrs = (end.getTime() - start.getTime()) / 3_600_000;
    if (d === 29 && Math.abs(hrs - 23) > 1e-9) { console.log(`  ✗ 29 Mart ${hrs}s (23 bekleniyordu)`); fail++; }
    prevEnd = end.getTime();
  }
  console.log(fail === 0 ? "  ✓ 31 gün kusursuz döşendi (overlap/gap YOK), 29 Mart = 23s" : `  ${fail} SAPMA`);
  process.exit(fail === 0 ? 0 : 1);
}

function main(): void {
  const fs: FixtureSet = JSON.parse(readFileSync(join(HERE, "timeline-fixtures.json"), "utf-8"));
  if (process.argv.includes("--bench")) { runBench(fs); return; }
  if (process.argv.includes("--adjacent")) { runAdjacent(); return; }
  runReference(fs);
}

main();
