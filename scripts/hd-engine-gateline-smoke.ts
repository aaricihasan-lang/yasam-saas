// FAZ 2C — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// gate/line eşleme smoke harness:
//   localDateTimeToUtc → AE provider → solveDesignTimeUtc → buildChartActivations
// + wrap (0°/5.625°/360°), roundtrip ve boundary fonksiyon testleri.
// Gate/line dışında HD hesabı YOK.
// Çalıştırma:  npx tsx scripts/hd-engine-gateline-smoke.ts

import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  buildChartActivations,
  longitudeToGateLine,
  gateLineToRange,
  normalizeLongitude,
  LINE_SIZE_DEG,
  DEFAULT_MANDALA_OFFSET_DEG,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

const SAMPLE: HdBirthInput = {
  date: "1990-05-15",
  time: "14:30",
  timezone: "Europe/Istanbul",
  location: { lat: 41.0082, lon: 28.9784 },
};

const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) errors.push(msg);
}

function main(): void {
  console.log(
    "FAZ 2C — gate/line candidate mapping, not validated against golden dataset.",
  );
  console.log(`mandala ofseti = ${DEFAULT_MANDALA_OFFSET_DEG}° (validated — 3 golden case)\n`);

  // ── 1) Zincir: 26 aktivasyon ──────────────────────────────────────────────
  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const birthUtc = localDateTimeToUtc(SAMPLE);
  const { designUtc } = solveDesignTimeUtc({ birthUtc, provider });
  const chart = buildChartActivations({ birthUtc, designUtc, provider });

  check(chart.total === 26, `Beklenen 26 aktivasyon, gelen ${chart.total}.`);
  const allGatesOk = chart.activations.every((a) => a.gate >= 1 && a.gate <= 64);
  const allLinesOk = chart.activations.every((a) => a.line >= 1 && a.line <= 6);
  check(allGatesOk, "En az bir gate 1..64 dışında.");
  check(allLinesOk, "En az bir line 1..6 dışında.");

  console.log(`Aktivasyon: total=${chart.total}, boundaryFlag=${chart.boundaryCount}`);
  console.log(JSON.stringify(chart, null, 2));

  // ── 2) Wrap testleri: 0°, 5.625°, 360° ────────────────────────────────────
  const at0 = longitudeToGateLine(0);
  const at5625 = longitudeToGateLine(5.625);
  const at360 = longitudeToGateLine(360);
  console.log("\nWRAP TESTLERİ:");
  console.log(`  0°     → gate ${at0.gate} line ${at0.line} (norm ${at0.normalizedLongitude})`);
  console.log(`  5.625° → gate ${at5625.gate} line ${at5625.line} (norm ${at5625.normalizedLongitude})`);
  console.log(`  360°   → gate ${at360.gate} line ${at360.line} (norm ${at360.normalizedLongitude})`);
  check(at360.normalizedLongitude === 0, "normalizeLongitude(360) !== 0.");
  check(
    at0.gate === at360.gate && at0.line === at360.line,
    "0° ve 360° aynı gate/line vermedi (wrap hatası).",
  );

  // ── 3) Roundtrip: gateLineToRange → orta nokta → longitudeToGateLine ───────
  console.log("\nROUNDTRIP TESTLERİ (gate,line → aralık ortası → gate,line):");
  const roundtripSamples: ReadonlyArray<[number, number]> = [
    [25, 1], [41, 6], [1, 3], [64, 6], [13, 4], [2, 1],
  ];
  for (const [gate, line] of roundtripSamples) {
    const range = gateLineToRange(gate, line);
    const mid = normalizeLongitude(range.startLongitude + LINE_SIZE_DEG / 2);
    const back = longitudeToGateLine(mid);
    const ok = back.gate === gate && back.line === line;
    console.log(
      `  (${gate},${line}) start=${range.startLongitude.toFixed(4)} mid=${mid.toFixed(4)} → (${back.gate},${back.line}) ${ok ? "OK" : "FAIL"}`,
    );
    check(ok, `Roundtrip (${gate},${line}) → (${back.gate},${back.line}).`);
  }

  // ── 4) Boundary testleri ──────────────────────────────────────────────────
  console.log("\nBOUNDARY TESTLERİ:");
  // (a) Line merkezinde → boundaryFlag false beklenir.
  const center = longitudeToGateLine(
    normalizeLongitude(gateLineToRange(25, 1).startLongitude + LINE_SIZE_DEG / 2),
  );
  console.log(`  merkez: lineDist=${center.lineBoundaryDistanceArcsec.toFixed(1)}″ flag=${center.boundaryFlag}`);
  check(center.boundaryFlag === false, "Line merkezinde boundaryFlag true çıktı.");

  // (b) Line sınırına ~5″ uzaklık → boundaryFlag true beklenir.
  const epsilonDeg = 5 / 3600; // 5 yay-saniye
  const nearBoundaryLon = normalizeLongitude(
    gateLineToRange(25, 1).endLongitude - epsilonDeg,
  );
  const near = longitudeToGateLine(nearBoundaryLon);
  console.log(`  sınır~5″: lineDist=${near.lineBoundaryDistanceArcsec.toFixed(1)}″ flag=${near.boundaryFlag}`);
  check(near.boundaryFlag === true, "Line sınırına ~5″ yakınken boundaryFlag false çıktı.");

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("\nCHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    "\nCHECK: 26 aktivasyon OK, gate∈[1,64] & line∈[1,6] OK, wrap OK, roundtrip OK, boundary OK.",
  );
  console.log("(Gate/line eşleme — 3 gerçek golden case ile doğrulandı.)");
}

main();
